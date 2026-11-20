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
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402
import tft_detail as D  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "raw" / "tt"
OUT = ROOT / "site" / "db.json"
TT_STATE = ROOT / "data" / "tt_patch.json"


def tt_patch():
    """tactics.tools 패치 번호(롤 클라이언트 버전 16.22 -> 16220). 2026-11-16까지 16210(18.5)에 묶여 있어서 18.6 통계가 아니었다.
    지난번 번호부터 10씩 올려 보며, 지금 세트 유닛(DA_<세트>_)이 있고 판이 충분히(20만 판) 쌓인 가장 높은 번호를 쓴다."""
    import setinfo
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
        if g.get("totalEntries", 0) >= 200000 and any(k.startswith(f"DA_{setinfo.NUM}_") for k in units):
            best = p
    if best is None:  # 새 세트 첫날: 지금 세트 판이 아직 없으면 지난 세트 통계를 섞지 않고 비워 둔다
        print("tactics.tools에 지금 세트 판이 아직 없음 -> 유닛별 템 통계 건너뜀"); return None
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


def row(r, total):
    return {"n": r["count"], "pick": round(100 * r["count"] / total, 1) if total else 0,
            "avg": r["place"], "top4": round(r["top4"]), "win": round(r["won"], 1)}


def info(lk):
    """아이콘을 눌렀을 때 뜨는 설명: 템(조합식·능력치·효과), 시너지(단계별 효과·기물·평균 등수), 증강."""
    iname = {i["apiName"]: i["name"] for i in lk["items"]}
    uname = {u["apiName"]: u["name"] for u in lk["units"]}
    out = {"i": {}, "t": {}, "a": {}}
    out["i"] = D.item_texts(lk)  # 설명이 비어 오면 data/item_text.json의 마지막 설명
    try:
        tstat = {r["trait"]: r["places"] for r in T.load("traits")["results"]}
    except FileNotFoundError:
        tstat = {}
    for t in lk["traits"]:
        effects = []
        for n, e in enumerate(t["effects"], 1):
            pl = tstat.get(f"{t['apiName']}_{n}")
            avg = round(T.avg_place(pl)[0], 2) if pl and sum(pl) >= 2000 else None
            effects.append([e["minUnits"], D.fill(e.get("desc"), t), avg])
        out["t"][t["name"]] = {
            "type": t.get("type"), "d": D.fill(t.get("desc"), t), "p": D.fill(t.get("postTierDesc"), t),
            "u": [[uname.get(m["unit"], m["unit"]), m["unit_cost"]] for m in sorted(t.get("units", []), key=lambda x: x["unit_cost"])],
            "e": effects}
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
    missing = [a.get("name") for a in lk["augments"] if a.get("name") and a.get("name") not in out["a"]]
    if missing:
        print(f"증강 설명 없음 {len(missing)}개 (새 증강이면 게임 원문을 찾아 data/aug_text.json에 넣을 것):", missing[:10])
    return out


def build():
    lk = T.load("lookup_ko")
    nm = T.Names(lk)
    p = T.load("patch")
    patch = f"{p['patch']}{p.get('b_patch_version') or ''}"
    meta_avg = {}
    for key, name in (("base", "units"), ("gm", "units_gm")):
        try:
            for r in T.load(name)["results"]:
                meta_avg.setdefault(nm.u(r["unit"]), {})[key] = round(T.avg_place(r["places"])[0], 2)
        except FileNotFoundError:
            pass
    comps = {i["apiName"] for i in lk["items"] if i["apiName"].startswith("DA_Component_")}
    units, item_holders = {}, {}
    shop = [u for u in lk["units"] if u["apiName"].startswith("TFT") and u["traits"] and 1 <= u["cost"] <= 5]
    seen = set()
    for u in sorted(shop, key=lambda x: (x["cost"], x["name"])):
        if u["name"] in seen:  # 나르처럼 같은 이름이 둘이면 먼저 받아진 쪽만
            continue
        ab = u.get("ability") or {}
        skill = ""
        if ab.get("desc"):
            merged = dict(u)
            merged["attributeValues"] = ab.get("attributeValues") or u.get("attributeValues")
            skill = D.fill(ab["desc"], merged, stars=True)
        st = u["stats"]
        # 아칼리·코그모처럼 AD/AP 형태가 있는 유닛도 tactics.tools는 하나로 합쳐서 준다
        for asset, label in [(u["apiName"], u["name"])]:
            d = fetch(asset)
            if not d or not d.get("base"):
                continue
            seen.add(u["name"])
            total = d["base"]["count"]
            # 재료템과 찬란한 템(증강으로만 나옴)은 '뭘 만들까' 목록에서 뺀다
            def good(rs, share):
                out = []
                for r in rs:
                    its = [r["items"]] if isinstance(r["items"], str) else r["items"]
                    if r["count"] >= total * share and not set(its) & comps and not any("Radiant" in i for i in its):
                        out.append(r)
                return out
            items = sorted(good(d["items"], 0.02), key=lambda r: r["place"])[:8]
            pairs = sorted(good(d["itemPairs"], 0.01), key=lambda r: r["place"])[:6]
            trios = sorted(good(d["itemTrios"], 0.01), key=lambda r: r["place"])[:6]
            partners = sorted([r for r in d["units"] if r["count"] >= total * 0.05], key=lambda r: -r["count"])[:10]
            mu = sorted(d.get("unitMatchups") or [], key=lambda r: r["winrate"])
            units[label] = {
                "cost": u["cost"], "traits": u["traits"],
                "icon": u["name"],
                "stats": f"체력 {st.get('hp')} · 방어 {st.get('armor')} · 마저 {st.get('magicResist')} · 사거리 {st.get('range')} · 마나 {st.get('initialMana')}/{st.get('mana')}",
                "skill": {"name": ab.get("name", "스킬"), "desc": skill},
                "meta": meta_avg.get(u["name"], {}),
                "base": row(d["base"], total) | {"pick": None},
                "stars": {str(s["id"]): row(s, total) for s in d["starLevelData"] if s["id"] <= 3 and s["count"] >= 30},
                "items": [[nm.i(r["items"]), row(r, total)] for r in items],
                "pairs": [[[nm.i(i) for i in r["items"]], row(r, total)] for r in pairs],
                "trios": [[[nm.i(i) for i in r["items"]], row(r, total)] for r in trios],
                "partners": [[nm.u(r["id"]), round(r["delta"], 2), round(100 * r["count"] / total)] for r in partners],
                "weak": [[nm.u(r["unitId"]), round(100 * r["winrate"])] for r in mu[:6]],
                "strong": [[nm.u(r["unitId"]), round(100 * r["winrate"])] for r in mu[::-1][:6]],
            }
            for r in d["items"]:
                if r["items"] in comps or r["count"] < 300:
                    continue
                item_holders.setdefault(nm.i(r["items"]), []).append([label, r["place"], r["count"]])
    items = {}
    for name, rows in item_holders.items():
        rows = [r for r in rows if r[2] >= max(500, 0.05 * max(x[2] for x in rows))]
        items[name] = sorted(rows, key=lambda r: r[1])[:10]
    # 앱의 '새 판 불러오기'가 MetaTFT 원본(영문 API 이름)을 한국어로 바꿀 때 쓴다
    names = {"u": {}, "i": {}, "t": {}}
    for u in lk["units"]:
        for a in u.get("assetNames", []) + [u["apiName"]]:
            names["u"][a] = [u["name"], u["cost"], u.get("code") or ""]  # code: 팀 플래너 코드 한 칸
    for i in lk["items"] + lk.get("armory_items", []):
        names["i"][i["apiName"]] = i["name"]
    for t in lk["traits"]:
        names["t"][t["apiName"]] = [t["name"], 1 if t.get("type") == "unique" else 0]
    db = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "patch": patch, "names": names, "info": info(lk),
          "source": "평균 등수 에메+·그마+는 MetaTFT 최근 3일, 나머지는 tactics.tools 다이아+ 패치 전체",
          "units": units, "items": items}
    OUT.write_text(json.dumps(db, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: 유닛 {len(units)}개, 아이템 {len(items)}개, {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    CACHE.mkdir(parents=True, exist_ok=True)
    build()
