#!/usr/bin/env python3
"""페이지 '검색' 탭용 유닛·아이템 DB를 만든다 -> site/db.json

사용법:
    python3 scripts/build_db.py            # tactics.tools에서 유닛별 통계를 받아 raw/tt/ 에 저장하고 db.json 생성
    python3 scripts/build_db.py --offline  # raw/tt/ 에 받아둔 것으로만 생성

출처:
- 유닛 평균 등수 에메+ / 그마+: MetaTFT (raw/units.json, raw/units_gm.json, tft_data.py fetch로 받은 것)
- 성급별 등수, 템·템 2개·템 3개, 같이 쓰는 유닛, 상대 유닛: tactics.tools 다이아+ (패치 전체)
페이지는 외부 API를 직접 부를 수 없어서(아티팩트 네트워크 차단) 패치마다 이걸 다시 돌려 db.json을 같이 게시한다.
"""
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402
import tft_detail as D  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "raw" / "tt"
MT_CACHE = ROOT / "raw" / "mt_units"
OUT = ROOT / "site" / "db.json"
TT_STATE = ROOT / "data" / "tt_patch.json"


def tt_patch():
    """tactics.tools 패치 번호(롤 클라이언트 버전 16.22 -> 16220). 2026-11-16까지 16210(18.5)에 묶여 있어서 18.6 통계가 아니었다.
    지난번 번호부터 10씩 올려 보며, 지금 세트 유닛(DA_<세트>_)이 있고 판이 충분히(20만 판) 쌓인 가장 높은 번호를 쓴다."""
    import setinfo
    if setinfo.PBE:
        return None
    last = 16210
    try: last = json.loads(TT_STATE.read_text())["patch"]
    except Exception: pass
    best = None
    for p in range(last - 10, last + 110, 10):
        try:
            req = urllib.request.Request(f"https://d3.tft.tools/stats2/general/1100/{p}/1", headers={"User-Agent": "Mozilla/5.0"})
            g = json.loads(urllib.request.urlopen(req, timeout=30).read())
        except Exception:
            continue
        units = g.get("units") or {}
        if g.get("totalEntries", 0) >= 200000 and any(k.startswith(f"DA_{setinfo.NUM}_") or k.startswith(f"TFT{setinfo.NUM}_") or (k.startswith("DA_") and k.endswith(str(setinfo.NUM))) for k in units):
            best = p
    if best is None:  # 새 세트 첫날: 지금 세트 판이 아직 없으면 지난 세트 통계를 섞지 않고 MetaTFT unit_detail로 채운다
        print("tactics.tools에 지금 세트 판이 아직 없음 -> MetaTFT unit_detail로 채움"); return None
    if best != last: print("tactics.tools 패치", last, "->", best)
    TT_STATE.write_text(json.dumps({"patch": best, "set": setinfo.NUM}))
    return best


_TTP = json.loads(TT_STATE.read_text())["patch"] if "--offline" in sys.argv and TT_STATE.exists() else tt_patch()
TT = ("https://d3.tft.tools/stats2/unit/1100/{}/%d/1" % _TTP) if _TTP else None  # 1100 = 다이아+


def fetch(asset):
    if not TT: return None
    path = CACHE / (TT.split("/")[-2] + f"_{asset}.json")  # 패치마다 따로 (번호가 바뀌면 다시 받는다)
    if "--offline" in sys.argv or (path.exists() and time.time() - path.stat().st_mtime < 6 * 3600):
        return json.loads(path.read_text()) if path.exists() else None
    req = urllib.request.Request(TT.format(asset), headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
    except Exception as e:  # 한 유닛이 실패해도 나머지는 만든다
        print("실패", asset, e)
        return None
    path.write_text(json.dumps(data))
    time.sleep(0.5)
    return data


def fetch_mt_unit(asset):
    """MetaTFT unit_detail (성급별·단일템·삼신기 3템 조합 실통계, PBE·본섭 공통). raw/mt_units/에 6시간 캐시."""
    import setinfo
    MT_CACHE.mkdir(parents=True, exist_ok=True)
    path = MT_CACHE / f"{'pbe' if setinfo.PBE else 'live'}_{asset}.json"
    if "--offline" in sys.argv or (path.exists() and time.time() - path.stat().st_mtime < 6 * 3600):
        return json.loads(path.read_text()) if path.exists() else None
    url = f"{T.API}/tft-stat-api/unit_detail?unit={asset}&{T.Q}"
    req = urllib.request.Request(url, headers=T.HEADERS)
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                data = json.loads(r.read())
            path.write_text(json.dumps(data))
            return data
        except Exception as e:
            if attempt == 0:
                time.sleep(1.5)
            else:
                print("MetaTFT unit_detail 실패", asset, e)
    return None


def pl_row(places, denom=0, base_avg=None):
    pl = (places or [])[:8]
    n = sum(pl)
    if not n:
        return None
    avg = round(sum((i + 1) * x for i, x in enumerate(pl)) / n, 2)
    out = {
        "n": n,
        "pick": round(100 * n / denom, 1) if denom else 0,
        "avg": avg,
        "top4": round(100 * sum(pl[:4]) / n),
        "win": round(100 * pl[0] / n, 1),
    }
    if base_avg is not None:
        out["d"] = round(avg - base_avg, 2)
    return out


def row(r, total):
    return {"n": r["count"], "pick": round(100 * r["count"] / total, 1) if total else 0,
            "avg": r["place"], "top4": round(r["top4"]), "win": round(r["won"], 1)}


STYLE_NAME = {1: "bronze", 2: "bronze", 3: "silver", 4: "gold", 5: "chromatic", 6: "unique"}
OCEAN_STEPS = [
    (1, 3, "3", "bronze", "(3) 배치 가능한 악기 획득 · 공속 25%, 3초마다 마나 5 회복"),
    (2, 5, "5", "silver", "(5) 악기 추가 · 공속 45%, 3초마다 마나 9 회복"),
    (3, 7, "7", "gold", "(7) 악기 추가 · 비치 팝 효과 최대 강화"),
]
# Riot match tier_current(1..6) for DA_TrueDamage19 is [3A, 5A, 5A-Pris, 3B, 5B, 5B-Pris],
# while lookup_ko effects array is ordered [3A(0), 3B(1), 5A(2), 5A-Pris(3), 5B(4), 5B-Pris(5)].
TD_TIERS = [
    (1, 3, "3 A면", "bronze", 0),
    (2, 5, "5 A면", "gold", 2),
    (3, 5, "5 A면 프리즘", "chromatic", 3),
    (4, 3, "3 B면", "bronze", 1),
    (5, 5, "5 B면", "gold", 4),
    (6, 5, "5 B면 프리즘", "chromatic", 5),
]


def _trait_stat_row(pl, tr_games):
    if not pl:
        return None
    p = (pl or [])[:8]
    n = sum(p)
    if n < 20:
        return None
    avg = round(sum((i + 1) * x for i, x in enumerate(p)) / n, 2)
    top4 = round(100 * sum(p[:4]) / n)
    win = round(100 * p[0] / n, 1)
    freq = round(n / tr_games * 8, 2) if tr_games else 0
    pick = round(n / tr_games * 100, 1) if tr_games else 0
    return {"n": n, "avg": avg, "top4": top4, "win": win, "freq": freq, "pick": pick}


def info(lk, total_games=0):
    """아이콘을 눌렀을 때 뜨는 설명: 템(조합식·능력치·효과), 시너지(단계별 효과·기물·통계), 증강 + 시너지 티어표 데이터."""
    iname = {i["apiName"]: i["name"] for i in lk["items"]}
    uname = {u["apiName"]: u["name"] for u in lk["units"]}
    out = {"i": {}, "t": {}, "a": {}}
    out["i"] = D.item_texts(lk)  # 설명이 비어 오면 data/item_text.json의 마지막 설명
    s19_p = ROOT / "site" / "s19.json"
    s19_data = json.loads(s19_p.read_text(encoding="utf-8")) if s19_p.exists() else {}
    s19_t_map = {t["k"]: t for t in s19_data.get("traits") or [] if t.get("k")}
    try:
        tr_raw = T.load("traits")
        tstat = {r["trait"]: r["places"] for r in tr_raw.get("results") or []}
        tr_games = sum(x.get("count", 0) for x in (tr_raw.get("games") or [])) or total_games or 1
        tr_upd = tr_raw.get("updated")
    except FileNotFoundError:
        tstat, tr_games, tr_upd = {}, total_games or 1, None

    trait_rows = []
    for t in lk["traits"]:
        api = t["apiName"]
        name = t["name"]
        s19t = s19_t_map.get(api) or {}
        ttype = t.get("type")
        if not ttype:
            if s19t.get("uniq") or any(x in api for x in ("UniqueTrait", "IndieTrait", "RisingStar", "Superstar")):
                ttype = "unique"
            elif s19t.get("type") == "CLASS":
                ttype = "class"
            elif s19t.get("type") == "ORIGIN":
                ttype = "origin"
            else:
                ttype = "unique" if len(t.get("units") or []) <= 1 else "origin"

        effs = t.get("effects") or []
        s19_steps = s19t.get("steps") or []
        # 각 단계: (tier_idx, minUnits, lbl, style, desc)
        tier_specs = []
        if api == "DA_OceanSong19" and (not effs or (len(effs) == 1 and (effs[0].get("minUnits") or 0) == 0)):
            tier_specs = OCEAN_STEPS
        elif api == "DA_TrueDamage19" and len(effs) >= 6:
            for ti, m, lbl, st, eidx in TD_TIERS:
                desc = (s19_steps[eidx].get("d") if eidx < len(s19_steps) and s19_steps[eidx].get("d") else D.fill(effs[eidx].get("desc"), t))
                tier_specs.append((ti, m, lbl, st, desc))
        else:
            seen_m = {}
            for ti, e in enumerate(effs, 1):
                m = e.get("minUnits")
                st = "unique" if ttype == "unique" else STYLE_NAME.get(e.get("style"), "bronze")
                if api == "DA_KDA19" and m:
                    lbl = f"{m}★"
                elif st == "chromatic" and m in seen_m:
                    lbl = f"{m} 프리즘"
                else:
                    lbl = str(m) if m is not None else str(ti)
                seen_m[m] = seen_m.get(m, 0) + 1
                desc = (s19_steps[ti - 1].get("d") if ti - 1 < len(s19_steps) and s19_steps[ti - 1].get("d") else D.fill(e.get("desc"), t))
                tier_specs.append((ti, m, lbl, st, desc))

        effects = []
        for ti, m, lbl, st, desc in tier_specs:
            pl = tstat.get(f"{api}_{ti}")
            sr = _trait_stat_row(pl, tr_games)
            n_val = sum((pl or [])[:8]) if pl else 0
            effects.append([
                m, desc,
                sr["avg"] if sr else None,
                sr["top4"] if sr else None,
                sr["win"] if sr else None,
                n_val, st, lbl,
            ])
            if sr:
                trait_rows.append({
                    "k": f"{api}_{ti}", "api": api, "t": name, "type": ttype,
                    "tier": ti, "m": m, "lbl": lbl, "st": st,
                    "n": sr["n"], "avg": sr["avg"], "top4": sr["top4"],
                    "win": sr["win"], "freq": sr["freq"], "pick": sr["pick"],
                })
        out["t"][name] = {
            "api": api, "type": ttype,
            "d": s19t.get("d") or D.fill(t.get("desc"), t),
            "p": D.fill(t.get("postTierDesc"), t),
            "u": [[uname.get(m["unit"], m["unit"]), m["unit_cost"]] for m in sorted(t.get("units", []), key=lambda x: x["unit_cost"])],
            "e": effects,
        }
    trait_rows.sort(key=lambda r: (r["avg"], -r["n"]))
    traits_meta = {"games": tr_games, "updated": tr_upd, "rows": trait_rows}
    tier_of = {}
    try:
        for tier in T.load("aug_tiers")["content"]["content"]["tierList"]:
            for it in tier["content"]:
                tier_of[it["id"]] = tier.get("label", "")
    except (FileNotFoundError, KeyError):
        pass
    # 2026-11-15부터 원문에 증강 설명도 비어 온다 (템은 18.6부터). 설명이 있을 때 data/aug_text.json에 저장해 두고, 비어 오면 마지막 설명을 쓴다
    cache_f = T.ROOT / "data" / "aug_text.json"
    cache = json.loads(cache_f.read_text(encoding="utf-8")) if cache_f.exists() else {}
    fresh = 0
    for a in lk["augments"]:
        name = a.get("name")
        if not name:
            continue
        if a.get("desc"):
            cache[name] = {"d": D.fill(a["desc"], a), "t": tier_of.get(a["apiName"], ""), "r": D.RARITY.get(a.get("rarity"), "")}
            fresh += 1
        if name in cache:
            c = cache[name]
            out["a"][name] = {"d": c["d"], "t": tier_of.get(a["apiName"], "") or c.get("t", ""), "r": D.RARITY.get(a.get("rarity"), "") or c.get("r", "")}
    if fresh:
        cache_f.write_text(json.dumps(cache, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
    # PBE(세트 19)에서 s19.json의 깔끔한 한국어 증강 설명·등급도 반영
    if s19_data:
        rar_map = {1: "실버", 2: "골드", 3: "프리즘"}
        for a in s19_data.get("augs") or []:
            nm_a = a.get("n")
            if nm_a and nm_a not in out["a"]:
                out["a"][nm_a] = {"d": a.get("d") or "", "t": "", "r": rar_map.get(a.get("tier"), "")}
            elif nm_a and a.get("d") and not out["a"][nm_a].get("d"):
                out["a"][nm_a]["d"] = a["d"]
    missing = [a.get("name") for a in lk["augments"] if a.get("name") and a.get("name") not in out["a"]]
    if missing:
        print(f"증강 설명 없음 {len(missing)}개 (새 증강이면 게임 원문을 찾아 data/aug_text.json에 넣을 것):", missing[:10])
    return out, traits_meta


def build():
    import setinfo
    lk = T.load("lookup_ko")
    nm = T.Names(lk)
    p = T.load("patch")
    patch = f"{setinfo.NUM}.1 PBE" if setinfo.PBE else f"{p['patch']}{p.get('b_patch_version') or ''}"
    meta_avg, unit_raw, total_games = {}, {}, 0
    for key, name in (("base", "units"), ("gm", "units_gm")):
        try:
            udoc = T.load(name)
            if key == "base":
                total_games = sum(g.get("count") or 0 for g in udoc.get("games") or [])
            for r in udoc["results"]:
                avg_v, cnt_v = T.avg_place(r["places"])
                meta_avg.setdefault(nm.u(r["unit"]), {})[key] = round(avg_v, 2)
                if key == "base":
                    pl = r["places"][:8]
                    n_tot = sum(pl) or 1
                    unit_raw[r["unit"]] = {
                        "n": n_tot, "avg": round(avg_v, 2),
                        "top4": round(100 * sum(pl[:4]) / n_tot),
                        "win": round(100 * pl[0] / n_tot, 1),
                        "freq": round(n_tot / total_games * 8, 2) if total_games else 0,
                    }
        except FileNotFoundError:
            pass
    ui_pbe = {}
    ui_items_pbe = {}
    try:
        ui_d = T.load("unit_items")
        ui_pbe = ui_d.get("units") or {}
        ui_items_pbe = ui_d.get("itemNames") or {}
    except FileNotFoundError:
        pass
    s19_u = {}
    s19_p = ROOT / "site" / "s19.json"
    if setinfo.NUM == 19 and s19_p.exists():
        for su in json.loads(s19_p.read_text(encoding="utf-8")).get("units") or []:
            s19_u[su["k"]] = su
    comps = {i["apiName"] for i in lk["items"] if i["apiName"].startswith("DA_Component_") or i["apiName"].startswith("TFT_Item_") and not i.get("composition")}
    # 기본 조합 재료 10개(대검~프라이팬)는 단일템·삼신기 통계에서 제외
    comps |= {i["apiName"] for i in lk["items"] if i.get("apiName", "").startswith("DA_Component_")}
    units, item_holders = {}, {}
    shop = [u for u in lk["units"] if setinfo.unit_ok(u)]
    shop_apis = {u["apiName"] for u in shop}
    # tactics.tools가 없는 경우(PBE·새 세트 초) MetaTFT unit_detail을 병렬 8스레드로 한꺼번에 받아 실통계(삼신기·템·성급)를 채운다
    mt_details = {}
    if not TT:
        todo_apis = []
        _seen_api = set()
        for u in sorted(shop, key=lambda x: (x["cost"], x["name"])):
            if u["name"] in _seen_api:
                continue
            _seen_api.add(u["name"])
            todo_apis.append(u["apiName"])
        with ThreadPoolExecutor(max_workers=3) as ex:
            for a, res in zip(todo_apis, ex.map(fetch_mt_unit, todo_apis)):
                if res:
                    mt_details[a] = res
        print(f"MetaTFT unit_detail: {len(mt_details)}/{len(todo_apis)} 유닛 수집")
    seen = set()
    for u in sorted(shop, key=lambda x: (x["cost"], x["name"])):
        if u["name"] in seen:  # 나르처럼 같은 이름이 둘이면 먼저 받아진 쪽만
            continue
        ab = u.get("ability") or {}
        su = s19_u.get(u["apiName"])
        skill = (su.get("sk") or {}).get("d") if su else ""
        if not skill and ab.get("desc"):
            merged = dict(u)
            merged["attributeValues"] = ab.get("attributeValues") or u.get("attributeValues")
            skill = D.fill(ab["desc"], merged, stars=True)
        sk_name = ((su.get("sk") or {}).get("n") if su else "") or ab.get("name", "스킬")
        st = u.get("stats") or {}
        stat_str = f"체력 {st.get('hp')} · 방어 {st.get('armor')} · 마저 {st.get('magicResist')} · 사거리 {st.get('range')} · 마나 {st.get('initialMana')}/{st.get('mana')}"
        # 아칼리·코그모처럼 AD/AP 형태가 있는 유닛도 tactics.tools는 하나로 합쳐서 준다
        for asset, label in [(u["apiName"], u["name"])]:
            d = fetch(asset)
            if d and d.get("base"):
                seen.add(u["name"])
                total = d["base"]["count"]
                ur = unit_raw.get(asset) or {}
                def good(rs, share):
                    out = []
                    for r in rs:
                        its = [r["items"]] if isinstance(r["items"], str) else r["items"]
                        if r["count"] >= total * share and not set(its) & comps and not any("Radiant" in i for i in its):
                            out.append(r)
                    return out
                items = sorted(good(d["items"], 0.02), key=lambda r: r["place"])[:10]
                pairs = sorted(good(d["itemPairs"], 0.01), key=lambda r: r["place"])[:6]
                trios = sorted(good(d["itemTrios"], 0.01), key=lambda r: r["place"])[:8]
                partners = sorted([r for r in d["units"] if r["count"] >= total * 0.05], key=lambda r: -r["count"])[:10]
                mu = sorted(d.get("unitMatchups") or [], key=lambda r: r["winrate"])
                base_d = row(d["base"], total) | {"pick": None, "freq": ur.get("freq", 0)}
                units[label] = {
                    "api": asset, "cost": u["cost"], "traits": u["traits"],
                    "icon": u["name"], "stats": stat_str,
                    "skill": {"name": sk_name, "desc": skill},
                    "meta": meta_avg.get(u["name"], {}),
                    "base": base_d,
                    "stars": {str(s["id"]): row(s, total) for s in d["starLevelData"] if s["id"] <= 3 and s["count"] >= 30},
                    "items": [[nm.i(r["items"]), row(r, total) | {"d": round(r["place"] - base_d["avg"], 2)}] for r in items],
                    "pairs": [[[nm.i(i) for i in r["items"]], row(r, total) | {"d": round(r["place"] - base_d["avg"], 2)}] for r in pairs],
                    "trios": [[[nm.i(i) for i in r["items"]], row(r, total) | {"d": round(r["place"] - base_d["avg"], 2)}] for r in trios],
                    "partners": [[nm.u(r["id"]), round(r["delta"], 2), round(100 * r["count"] / total)] for r in partners],
                    "weak": [[nm.u(r["unitId"]), round(100 * r["winrate"])] for r in mu[:6]],
                    "strong": [[nm.u(r["unitId"]), round(100 * r["winrate"])] for r in mu[::-1][:6]],
                }
                for r in d["items"]:
                    if r["items"] in comps or r["count"] < 300:
                        continue
                    item_holders.setdefault(nm.i(r["items"]), []).append([label, r["place"], r["count"]])
            else:
                # MetaTFT unit_detail 실통계 (PBE·새 세트 초기 공통): 성급별·단일템·2템·3템 삼신기 + 델타
                seen.add(u["name"])
                ur = unit_raw.get(asset) or {}
                ui = ui_pbe.get(asset) or {}
                md = mt_details.get(asset) or {}
                # 성급별 집계 + 템 1개 이상 / 3개 기준 평균 (MetaTFT 델타 기준선)
                star_pl = {"1": [0] * 8, "2": [0] * 8, "3": [0] * 8}
                all_pl = [0] * 8
                it1_pl = [0] * 8
                it3_pl = [0] * 8
                for lv in md.get("levels") or []:
                    li = lv.get("lvl_items") or []
                    pl = (lv.get("places") or [])[:8]
                    if len(li) < 2 or len(pl) < 8:
                        continue
                    s_key, n_it = str(li[0]), int(li[1])
                    for idx_p in range(8):
                        all_pl[idx_p] += pl[idx_p]
                        if s_key in star_pl:
                            star_pl[s_key][idx_p] += pl[idx_p]
                        if n_it >= 1:
                            it1_pl[idx_p] += pl[idx_p]
                        if n_it >= 3:
                            it3_pl[idx_p] += pl[idx_p]
                all_n = sum(all_pl)
                base_n = ur.get("n") or all_n or ui.get("count") or 0
                base_avg = ur.get("avg") or (round(sum((i + 1) * x for i, x in enumerate(all_pl)) / all_n, 2) if all_n else round(ui.get("avg") or 4.5, 2))
                base1_n = sum(it1_pl)
                base1_avg = round(sum((i + 1) * x for i, x in enumerate(it1_pl)) / base1_n, 2) if base1_n else base_avg
                base3_n = sum(it3_pl)
                base3_avg = round(sum((i + 1) * x for i, x in enumerate(it3_pl)) / base3_n, 2) if base3_n else base1_avg
                base_row = {
                    "n": base_n, "pick": None, "freq": ur.get("freq") or (round(base_n / total_games * 8, 2) if total_games else 0),
                    "avg": base_avg, "top4": ur.get("top4", round(100 * sum(all_pl[:4]) / all_n) if all_n else 50),
                    "win": ur.get("win", round(100 * all_pl[0] / all_n, 1) if all_n else 12.5),
                    "b1": base1_avg, "b3": base3_avg,
                }
                stars = {}
                for sk in ("1", "2", "3"):
                    min_star_n = 5 if (sk == "3" and u["cost"] >= 5) else 20
                    if sum(star_pl[sk]) >= min_star_n:
                        stars[sk] = pl_row(star_pl[sk], all_n or base_n)

                # 단일 아이템 실통계 (컴포넌트·찬란한 제외)
                raw_items = []
                for it_e in md.get("items") or []:
                    it_api = it_e.get("itemName") or ""
                    if not it_api or it_api in comps or "Radiant" in it_api or "Component" in it_api:
                        continue
                    r_it = pl_row(it_e.get("places"), base1_n or base_n, base1_avg)
                    if not r_it or r_it["n"] < max(15, int((base1_n or base_n) * 0.005)):
                        continue
                    it_nm = nm.i(it_api)
                    raw_items.append([it_nm, r_it])
                    if r_it["n"] >= 50:
                        item_holders.setdefault(it_nm, []).append([label, r_it["avg"], r_it["n"]])
                # 인기 상위 8 + 성적 상위 4 합집합 (중복 제거, 인기순 기본 + UI에서 평균순 정렬 가능)
                by_pop = sorted(raw_items, key=lambda x: -x[1]["n"])
                by_avg = sorted([x for x in raw_items if x[1]["n"] >= max(30, int((base1_n or base_n) * 0.01))], key=lambda x: x[1]["avg"])
                picked_it, seen_it = [], set()
                for x in by_pop[:8] + by_avg[:4]:
                    if x[0] not in seen_it:
                        seen_it.add(x[0]); picked_it.append(x)
                picked_it.sort(key=lambda x: x[1]["avg"])

                # 3템 삼신기(trios) + 2템 핵심 조합(pairs) 실통계
                b3_list = []
                pair_acc = {}
                b3_total = 0
                for b_e in md.get("builds") or []:
                    bn = b_e.get("buildNames") or ""
                    parts = [p for p in bn.split("|") if p]
                    if len(parts) < 2 or any(p in comps or "Radiant" in p or "Component" in p for p in parts):
                        continue
                    pl = (b_e.get("places") or [])[:8]
                    if len(pl) < 8:
                        continue
                    cnt_b = sum(pl)
                    if len(parts) == 3:
                        b3_total += cnt_b
                        b3_list.append((parts, pl, cnt_b))
                    # 2템·3템 빌드에서 모든 2템 조합 집계
                    for a_it, b_it in combinations(sorted(parts), 2):
                        acc = pair_acc.setdefault((a_it, b_it), [0] * 8)
                        for idx_p in range(8):
                            acc[idx_p] += pl[idx_p]
                min_b3 = max(12, int(b3_total * 0.002))
                cands_3 = []
                for parts, pl, cnt_b in b3_list:
                    if cnt_b < min_b3:
                        continue
                    r3 = pl_row(pl, b3_total or base3_n, base3_avg)
                    if r3:
                        cands_3.append([[nm.i(p) for p in parts], r3])
                if not cands_3 and b3_list:  # 표본 적은 특수/해금 유닛은 최소 5판까지 완화
                    for parts, pl, cnt_b in sorted(b3_list, key=lambda x: -x[2])[:6]:
                        if cnt_b >= 5:
                            r3 = pl_row(pl, b3_total or base3_n, base3_avg)
                            if r3:
                                cands_3.append([[nm.i(p) for p in parts], r3])
                pop3 = sorted(cands_3, key=lambda x: -x[1]["n"])[:6]
                avg3 = sorted([x for x in cands_3 if x[1]["n"] >= max(25, int(b3_total * 0.004))], key=lambda x: x[1]["avg"])[:6]
                trios, seen_3 = [], set()
                for x in pop3 + avg3:
                    key3 = tuple(sorted(x[0]))
                    if key3 not in seen_3:
                        seen_3.add(key3); trios.append(x)
                trios.sort(key=lambda x: -x[1]["n"])
                trios = trios[:10]

                min_p2 = max(25, int(b3_total * 0.005))
                cands_2 = []
                for (a_it, b_it), acc in pair_acc.items():
                    if sum(acc) < min_p2:
                        continue
                    r2 = pl_row(acc, base1_n or base_n, base3_avg)
                    if r2:
                        cands_2.append([[nm.i(a_it), nm.i(b_it)], r2])
                pop2 = sorted(cands_2, key=lambda x: -x[1]["n"])[:4]
                avg2 = sorted([x for x in cands_2 if x[1]["n"] >= max(50, int(b3_total * 0.01))], key=lambda x: x[1]["avg"])[:4]
                pairs, seen_2 = [], set()
                for x in pop2 + avg2:
                    key2 = tuple(sorted(x[0]))
                    if key2 not in seen_2:
                        seen_2.add(key2); pairs.append(x)
                pairs.sort(key=lambda x: x[1]["avg"])
                pairs = pairs[:6]

                units[label] = {
                    "api": asset, "cost": u["cost"], "traits": u["traits"],
                    "icon": u["name"], "stats": stat_str,
                    "skill": {"name": sk_name, "desc": skill},
                    "meta": meta_avg.get(u["name"], {"base": base_avg}),
                    "base": base_row, "stars": stars, "items": picked_it,
                    "pairs": pairs, "trios": trios, "partners": [], "weak": [], "strong": [],
                }
                if su and su.get("unl"):
                    units[label]["unlock"] = su["unl"]
    # 아이템별 추천 챔피언 정리 (unit_detail 실통계가 있으면 그걸 우선, 없으면 unit_items 역색인 보강)
    if not item_holders:
        for it_api, x in ui_items_pbe.items():
            if it_api in comps or "Radiant" in it_api:
                continue
            it_nm = nm.i(it_api)
            for u_ent in x.get("units") or []:
                ua = u_ent.get("unit") or ""
                if ua not in shop_apis:
                    continue
                unm = nm.u(ua)
                ur = unit_raw.get(ua) or ui_pbe.get(ua) or {}
                item_holders.setdefault(it_nm, []).append([unm, round(ur.get("avg") or 4.5, 2), int(ur.get("n") or ur.get("count") or 1000)])
    items = {}
    for name, rows in item_holders.items():
        dedup = {}
        for r in rows:
            if r[0] not in dedup or r[2] > dedup[r[0]][2]:
                dedup[r[0]] = r
        rows = list(dedup.values())
        min_hold = 100 if (setinfo.PBE or not TT) else 500
        rows = [r for r in rows if r[2] >= max(min_hold, 0.05 * max(x[2] for x in rows))]
        items[name] = sorted(rows, key=lambda r: r[1])[:10]
    # 팀 플래너 코드 중복 제거 (PBE 원문에 임시로 같은 번호를 나눠 쓰는 유닛이 있음)
    import re as _re
    code_cnt = {}
    for u in lk["units"]:
        c = u.get("code") or ""
        if c:
            code_cnt.setdefault(c, set()).add(_re.sub(r"^(TFT\d+_|DA_)|19$", "", u.get("characterName") or u["apiName"]).lower())
    # 앱의 '새 판 불러오기'가 MetaTFT 원본(영문 API 이름)을 한국어로 바꿀 때 쓴다
    names = {"u": {}, "i": {}, "t": {}}
    for u in lk["units"]:
        c = u.get("code") or ""
        good_c = c if (_re.fullmatch(r"[0-9a-f]{3}", c) and len(code_cnt.get(c, ())) == 1) else ""
        for a in u.get("assetNames", []) + [u["apiName"]]:
            names["u"][a] = [u["name"], u["cost"], good_c]  # code: 팀 플래너 코드 한 칸
    for i in lk["items"] + lk.get("armory_items", []):
        names["i"][i["apiName"]] = i["name"]
    for t in lk["traits"]:
        names["t"][t["apiName"]] = [t["name"], 1 if t.get("type") == "unique" else 0]
    inf, traits_meta = info(lk, total_games)
    db = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "patch": patch, "pbe": setinfo.PBE,
          "games": total_games, "names": names, "info": inf, "traits": traits_meta,
          "source": "MetaTFT PBE 최근 3일 (unit_detail)" if setinfo.PBE else ("MetaTFT 최근 3일 (unit_detail)" if not TT else "평균 등수 에메+·그마+는 MetaTFT 최근 3일, 나머지는 tactics.tools 다이아+ 패치 전체"),
          "units": units, "items": items}
    OUT.write_text(json.dumps(db, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: 유닛 {len(units)}개, 아이템 {len(items)}개, 시너지 단계 {len(traits_meta['rows'])}개, {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    CACHE.mkdir(parents=True, exist_ok=True)
    build()
