#!/usr/bin/env python3
"""'메타 덱' 탭(앱의 떠있는 창 첫 화면)용 덱 데이터를 만든다 -> site/meta.json

사용법:
    python3 scripts/build_meta.py            # MetaTFT 덱별 상세를 받아 raw/comps/ 에 저장하고 meta.json 생성
    python3 scripts/build_meta.py --offline  # 받아둔 것으로만

먼저 tft_data.py fetch 로 comps_data / comps_stats 가 받아져 있어야 한다.
덱마다: 최종 보드와 자리, 캐리 템, 레벨업 타이밍, 리롤하는 레벨, 초반 보드, 티어별 평균, 로비에 있으면 불리한 덱.
"""
import json
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import setinfo  # noqa: E402
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "raw" / "comps"
OUT = ROOT / "site" / "meta.json"
URL = "https://api-hc.metatft.com/tft-comps-api/comp_details?comp={}&cluster_id={}"
RANK_GROUP = {"IRON": "low", "BRONZE": "low", "SILVER": "low", "GOLD": "low", "PLATINUM": "mid", "EMERALD": "mid",
              "DIAMOND": "dia", "MASTER": "top", "GRANDMASTER": "top", "CHALLENGER": "top"}
# 내 메인 덱 (페이지 덱 탭과 맞춘다). 이름에 이 글자가 들어가면 위로 올리고 표시한다.
MINE = {}  # 예: {"협곡야수 덩굴정령": "메인 ①"} (지금은 정한 메인 덱 없음)


def team_code(units, codes):
    """게임 팀 플래너에 붙여넣는 코드: 02 + 챔피언 10칸(3자리 16진수, 빈칸 000) + TFTSet18."""
    cs = [codes[u] for u in units if codes.get(u)][:10]
    return "02" + "".join(cs) + "000" * (10 - len(cs)) + T.SET


def fetch(cluster, cid):
    path = CACHE / f"{cluster}.json"
    if "--offline" in sys.argv or (path.exists() and time.time() - path.stat().st_mtime < 6 * 3600):
        return json.loads(path.read_text()) if path.exists() else None
    req = urllib.request.Request(URL.format(cluster, cid), headers=T.HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())["results"]
    except Exception as e:
        print("실패", cluster, e)
        return None
    path.write_text(json.dumps(data))
    time.sleep(0.4)
    return data


def cell_of(name):
    """MetaTFT 자리 통계: cell_1~7 뒷줄, cell_22~28 앞줄. -> (줄 0=앞, 칸 0~6)"""
    n = int(name.split("_")[1]) - 1
    return 3 - n // 7, n % 7


AUG_TIERS = "https://api-hc.metatft.com/tft-comps-api/comp_augment_tiers?cluster_id={}"


def aug_ctx(lk, cid):
    """덱별 증강 고르기에 쓰는 것: 이름·등급(실버/골드/프리즘)·설명, MetaTFT 전체 증강 티어 순서, 덱별 프로 가이드 증강 등급."""
    db = json.loads((ROOT / "site" / "db.json").read_text())
    info = db["info"]["a"]
    name = {a["apiName"]: a["name"] for a in lk["augments"]}
    order, i = {}, 0
    for tier in T.load("aug_tiers")["content"]["content"]["tierList"]:
        for c in tier["content"]:
            n = name.get(c["id"])
            if n and n not in order:
                order[n] = i
                i += 1
    path = T.RAW / "comp_augment_tiers.json"
    try:
        if "--offline" not in sys.argv:
            with urllib.request.urlopen(urllib.request.Request(AUG_TIERS.format(cid), headers=T.HEADERS), timeout=90) as r:
                path.write_bytes(r.read())
        comp = json.loads(path.read_text())["results"]
    except Exception as e:
        print("덱별 증강 등급 못 받음", e)
        comp = {}
    traits = [t["name"] for t in lk["traits"]]
    units = sorted({u["name"] for u in lk["units"] if u.get("traits")}, key=len, reverse=True)
    return {"info": info, "name": name, "order": order, "comp": comp, "traits": traits, "units": units, "db": db}


def deck_augs(ctx, cluster, board):
    """프리즘·골드·실버 3개씩. 프로 가이드 등급(S>A>B)이 있으면 그걸로, 없으면 이 덱 시너지를 말하는 증강 + 아무 덱에나 좋은 증강.
    같은 등급 안에서는 MetaTFT 전체 증강 티어 순서. '+' 붙은 같은 계열은 하나만."""
    info, order = ctx["info"], ctx["order"]
    mine_units = {b["u"] for b in board}
    cnt = {}
    for u in mine_units:
        for t in (ctx["db"]["units"].get(u) or {}).get("traits", []):
            cnt[t] = cnt.get(t, 0) + 1
    mine_traits = {t for t, n in cnt.items() if n >= 2}

    def fits(n):  # 다른 시너지·다른 챔피언 전용 증강은 뺀다
        d = info[n]["d"] + " " + n
        if any(t in d for t in ctx["traits"] if t not in mine_traits and len(t) >= 2):
            return any(t in d for t in mine_traits)
        hit = [u for u in ctx["units"] if u in d]
        return not hit or any(u in mine_units for u in hit)

    src = "pro" if cluster in ctx["comp"] else "syn"
    cand = []
    if src == "pro":
        rank = {"S": 0, "A": 1, "B": 2, "C": 3}
        cand = [(rank.get(a["tier"], 4), order.get(ctx["name"].get(a["id"]), 999), ctx["name"].get(a["id"])) for a in ctx["comp"][cluster]["augments"]]
        cand = [c for c in cand if c[2] in info and c[0] <= 1]
    # 시너지 증강 + 아무 덱에나 좋은 증강 (프로 가이드가 없거나, 있어도 칸이 모자랄 때 채운다)
    for n, inf in info.items():
        if n not in order or not fits(n):
            continue
        own = any(t in inf["d"] + n for t in mine_traits)
        if own or order[n] < 60:
            cand.append((10 + (0 if own else 1), order[n], n))
    out, seen = {"프리즘": [], "골드": [], "실버": []}, set()
    for _, _, n in sorted(cand):
        r, fam = info[n].get("r"), n.rstrip("+")
        if r in out and fam not in seen and len(out[r]) < 3:
            out[r].append(n)
            seen.add(fam)
    return out, src


DIFF = {"Easy": 1, "Medium": 2, "Hard": 3, "VeryHard": 4}


def difficulty(d):
    """MetaTFT 프로 가이드(proComps)의 난이도 배지. 이 덱과 가장 가까운 가이드 기준, 배지가 둘이면 높은 쪽. 1 쉬움 ~ 4 매우 어려움."""
    for pc in sorted(d.get("proComps") or [], key=lambda x: x.get("distance", 9)):
        if pc.get("distance", 9) > 0.45:  # 이보다 멀면 다른 덱 가이드
            break
        imgs = ((pc.get("content") or {}).get("content") or {}).get("titleImages", [])
        lv = [DIFF[a] for a in (x.get("apiName", "").rsplit("_", 1)[-1] for x in imgs if "_Difficulty_" in x.get("apiName", "")) if a in DIFF]
        if lv:
            return max(lv)
    return None


def deck(nm, cluster, v, s, d, total, codes):
    n = s["count"]
    p = s["places"][:8]
    avg = T.avg_place(p)[0]
    units_by = {u["unit"]: u for u in d.get("unit_stats", [])}
    # 최종 레벨: 가장 많이 끝난 레벨. 그 레벨의 대표 보드.
    fl = sorted(d.get("final_levels", []), key=lambda x: -x["count"])
    opts = d.get("options", {})
    level = next((int(x["level"]) for x in fl if x["level"] in opts and int(x["level"]) >= 7), None)
    if level is None:
        level = max((int(k) for k in opts), default=8)
    best = max(opts.get(str(level), [{}]), key=lambda o: o.get("score", 0))
    board_units = [u for u in best.get("units_list", "").split("&") if u]

    # 캐리: 템 3개를 드는 비율이 높은 유닛
    def item_share(u):
        st = units_by.get(u, {})
        return next((x["pcnt"] for x in st.get("num_items", []) if x["num_items"] == 3), 0)
    carriers = sorted([u for u in board_units if item_share(u) >= 0.4], key=item_share, reverse=True)[:3]
    builds = {}
    for b in d.get("builds", []):
        if b["unit"] in carriers and b.get("num_items") == 3:
            key = tuple(b["buildName"])
            lst = builds.setdefault(b["unit"], [])
            if key not in [tuple(x[0]) for x in lst]:
                lst.append([list(key), round(b["avg"], 2), b["count"]])
    for u in builds:
        builds[u] = sorted(builds[u], key=lambda x: -x[2])[:3]

    # 자리: 각 유닛의 제일 흔한 칸, 겹치면 그다음 칸
    pos = d.get("positioning", {}).get("units", {})
    taken, cells = set(), {}
    for u in sorted(board_units, key=lambda u: -(pos.get(u, {}).get("positions") or [{"count": 0}])[0]["count"]):
        for c in pos.get(u, {}).get("positions", []):
            rc = cell_of(c["cell"])
            if rc not in taken:
                taken.add(rc)
                cells[u] = rc
                break

    def star(u):
        tiers = units_by.get(u, {}).get("tiers", [])
        return max(tiers, key=lambda t: t["pcnt"])["tier"] if tiers else 2

    board = []
    for u in board_units:
        b = builds.get(u)
        board.append({"u": nm.u(u), "c": nm.c(u), "s": star(u), "pos": cells.get(u),
                      "i": [nm.i(i) for i in b[0][0]] if b else []})

    ranks = {}
    for r in d.get("ranks", []):
        g = RANK_GROUP.get(r["rank"])
        if g:
            a = ranks.setdefault(g, [0, 0])
            a[0] += r["avg"] * r["count"]
            a[1] += r["count"]
    ranks = {g: [round(x[0] / x[1], 2), x[1]] for g, x in ranks.items() if x[1] >= 300}

    timeline = [[f"{x['stage']}-{x['round']}", x["level"]] for x in d.get("levels", []) if x["stage"]]
    rr = {int(k): v["rerolls"] / v["matches"] for k, v in d.get("rerolls", {}).items() if int(k) > 0 and v["matches"] >= 50}
    roll = max(rr, key=rr.get) if rr else None
    early = {}
    for lv in ("4", "5", "6"):
        o = sorted(d.get("early_options", {}).get(lv, []), key=lambda x: -x["count"])
        if o:
            early[lv] = [nm.u(u) for u in o[0]["unit_list"].split("&") if nm.known(u)]
    by_level, codes_by_level = {}, {str(level): team_code(board_units, codes)}
    for lv, lst in opts.items():
        if lst and int(lv) != level and 7 <= int(lv) <= 10:
            o = max(lst, key=lambda x: x.get("score", 0))
            us = o["units_list"].split("&")
            by_level[lv] = [nm.u(u) for u in us if nm.known(u)]
            codes_by_level[lv] = team_code(us, codes)
    for lv in ("4", "5", "6"):
        o = sorted(d.get("early_options", {}).get(lv, []), key=lambda x: -x["count"])
        if o:
            codes_by_level[lv] = team_code(o[0]["unit_list"].split("&"), codes)
    # 레벨별 필드: 그 레벨에서 가장 흔한 유닛 묶음을 MetaTFT 자리 통계로 배치 (템은 최종 보드 캐리 템을 그대로)
    final_items = {b["u"]: b["i"] for b in board}

    def place(us):
        taken, out = set(), []
        for u in sorted(us, key=lambda u: -(pos.get(u, {}).get("positions") or [{"count": 0}])[0]["count"]):
            rc = next((cell_of(c["cell"]) for c in pos.get(u, {}).get("positions", []) if cell_of(c["cell"]) not in taken), None)
            if rc is None:  # 자리 통계가 없으면 뒷줄부터 빈칸
                rc = next(((r, c) for r in (3, 2, 1, 0) for c in range(7) if (r, c) not in taken), None)
            taken.add(rc)
            out.append({"u": nm.u(u), "c": nm.c(u), "pos": rc, "i": final_items.get(nm.u(u), [])})
        return out
    lvb = {str(level): board}
    for lv, lst in list(early.items()) + list(by_level.items()):
        src = (sorted(d.get("early_options", {}).get(lv, []), key=lambda x: -x["count"])[0]["unit_list"] if lv in early
               else max(opts[lv], key=lambda x: x.get("score", 0))["units_list"])
        lvb[lv] = place([u for u in src.split("&") if u and nm.known(u)])
    # 상징: 이 덱에서 쓴 비율·단 판 평균·누가 들었나 (상징 탭)
    emb = {}
    for x in d.get("itemNames", []):
        api = x["itemNames"]
        if "Emblem" not in api or api.endswith("Augment") or x["count"] < 150:
            continue
        hold = [[nm.u(u["units"]), round(100 * u["count"] / x["count"]), round(u["avg"], 2)] for u in (x.get("units") or [])[:3] if u["count"] >= 40]
        emb[nm.i(api)] = [x["count"], round(x["avg"], 2), round(100 * x["pcnt"], 1), hold]
    finals = [[int(x["level"]), round(x["avg"], 2), round(100 * x["count"] / max(1, sum(y["count"] for y in fl)))]
              for x in sorted(fl, key=lambda x: int(x["level"])) if x["count"] >= 100]
    ra = T.req_aug(nm, v)
    out = {
        "id": cluster, "name": T.comp_name(nm, v), "style": v.get("levelling", ""),
        "avg": round(avg, 2), "top4": round(sum(p[:4]) / n * 100), "win": round(p[0] / n * 100, 1),
        "pick": round(n / total * 100, 1), "n": n, "level": level, "diff": difficulty(d),
        "board": board, "builds": {nm.u(u): [[[nm.i(i) for i in x[0]], x[1], x[2]] for x in b] for u, b in builds.items()},
        "ranks": ranks, "timeline": timeline, "roll": [roll, round(rr[roll], 1)] if roll else None,
        "early": early, "levels": by_level, "lvb": lvb, "emb": emb, "finals": finals, "code": codes_by_level[str(level)], "codes": codes_by_level,
        "counters": [c for c in d.get("counters", []) if str(c["against"]) != str(cluster)][:4],
    }
    if ra:
        out["req_aug"] = ra
    return out


# 덱 탭 '기준' 고르기: 티어 묶음마다 MetaTFT comps_stats를 따로 받아 평균·순방·승률·판수, 그 기준에서의 티어(S/A/B/C)
BASIS = {"all": "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER,PLATINUM", "emer": "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER",
         "low": "IRON,BRONZE,SILVER,GOLD", "dia": "DIAMOND", "top": "MASTER,GRANDMASTER,CHALLENGER", "gmc": "GRANDMASTER,CHALLENGER"}
BASIS_MIN = {"gmc": 60, "top": 200, "dia": 250}  # 그마·챌은 3일에 700판 남짓이라 낮게


def tier_of(q):
    return "S" if q < 0.12 else "A" if q < 0.35 else "B" if q < 0.7 else "C"


def basis_stats(decks):
    """덱마다 기준별 성적을 붙이고, 기준별 분석된 덱 수와 MetaTFT 업데이트 시각(ms)을 돌려준다."""
    import setinfo
    if setinfo.PBE:
        js = T.load("comps_stats")
        res = js["results"]
        tot = next((x["places"][0] for x in res if not x.get("cluster")), 0)
        by = {str(x["cluster"]): x["places"] for x in res if x.get("cluster")}
        ok = []
        for d in decks:
            p = by.get(str(d["id"]))
            if not p or p[8] < 300:
                continue
            n = p[8]
            st_row = [round(sum(p[i] * (i + 1) for i in range(8)) / n, 2), round(sum(p[:4]) / n * 100), round(p[0] / n * 100, 1), n]
            for k in ("all", "emer"):
                d.setdefault("st", {})[k] = st_row
            ok.append(d)
        ok.sort(key=lambda d: d["st"]["emer"][0])
        for d in ok:
            t_lbl = T.mt_tier(d["st"]["emer"][0])
            for k in ("all", "emer"):
                d.setdefault("tiers", {})[k] = t_lbl
        totals = {"all": tot, "emer": tot}
        print("PBE 통계:", len(ok), "덱, 분석된 덱:", tot)
        return totals, js.get("updated") or 0
    totals, src_at = {}, 0
    for k, ranks in BASIS.items():
        url = f"https://api-hc.metatft.com/tft-comps-api/comps_stats?queue=1100&patch=current&days=3&permit_filter_adjustment=false&rank={ranks}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=T.HEADERS), timeout=120) as r:
                js = json.loads(r.read())
            res = js["results"]
        except Exception as e:
            print("기준 통계 실패", k, e)
            continue
        src_at = max(src_at, js.get("updated") or 0)
        totals[k] = next((x["places"][0] for x in res if not x.get("cluster")), 0)
        by = {str(x["cluster"]): x["places"] for x in res if x.get("cluster")}
        ok = []
        for d in decks:
            p = by.get(str(d["id"]))
            if not p or p[8] < BASIS_MIN.get(k, 300):
                continue
            n = p[8]
            d.setdefault("st", {})[k] = [round(sum(p[i] * (i + 1) for i in range(8)) / n, 2), round(sum(p[:4]) / n * 100), round(p[0] / n * 100, 1), n]
            ok.append(d)
        ok.sort(key=lambda d: d["st"][k][0])
        for d in ok:
            d.setdefault("tiers", {})[k] = T.mt_tier(d["st"][k][0])
        time.sleep(1)
    print("기준별 통계:", {k: sum(1 for d in decks if k in d.get("st", {})) for k in BASIS}, "분석된 덱:", totals)
    return totals, src_at


def _sync_pbe_guides(decks):
    """PBE(세트 19): s19.json의 롤체지지 추천 배치 가이드를 site/guides.json 형식으로 변환해 메타 탭 '추천 덱'에 연결한다."""
    s19_p = ROOT / "site" / "s19.json"
    if not s19_p.exists():
        return
    s19 = json.loads(s19_p.read_text(encoding="utf-8"))
    u_by_k = {u["k"]: u for u in s19.get("units") or []}
    aug_tier = {a["n"]: a.get("tier") or 2 for a in s19.get("augs") or []}
    meta_by_id = {str(d["id"]): d for d in decks}
    STYLE = {1: "bronze", 2: "bronze", 3: "silver", 4: "gold", 5: "chromatic", 6: "unique"}  # build_guides.py와 같은 표
    ORDER = {"chromatic": 0, "gold": 1, "silver": 2, "bronze": 3, "unique": 4}
    styles = {}
    for t in s19.get("traits") or []:
        steps = [s for s in t.get("steps") or [] if s.get("m") is not None]
        styles[t["n"]] = [[s["m"], (steps[i + 1]["m"] - 1) if i + 1 < len(steps) else None, STYLE.get(s.get("s"), "bronze")]
                          for i, s in enumerate(steps)]
    out_g = []
    for g in s19.get("guides") or []:
        board = []
        for cu in g.get("u") or []:
            su = u_by_k.get(cu["k"])
            if not su:
                continue
            ent = {"u": su["n"], "c": su["c"], "i": cu.get("i") or [], "star": cu.get("s") or 2, "plant": False}
            if cu.get("pos"):
                ent["pos"] = cu["pos"]
            if cu.get("r") and cu["r"] <= 2:
                ent["core"] = True
            board.append(ent)
        if len(board) < 5:
            continue
        g_augs = set(g.get("a") or [])
        md = meta_by_id.get(str(g.get("sid") or ""))
        if md and md.get("req_aug") and md["req_aug"]["n"] not in g_augs:
            md = None
        if not md:
            mine = {x["u"] for x in board}
            best_sc, best_d = 0, None
            for d0 in decks:
                if d0.get("req_aug") and d0["req_aug"]["n"] not in g_augs:
                    continue
                theirs = {x["u"] for x in d0.get("board") or []} | {u for lv in (d0.get("levels") or {}).values() for u in lv}
                sc = len(mine & theirs) - 0.01 * len(theirs - mine)
                if sc > best_sc:
                    best_sc, best_d = sc, d0
            md = best_d if best_sc >= 4 else None
        aug_out = [{"n": a, "tier": aug_tier.get(a, 2)} for a in (g.get("a") or [])]
        # 롤체지지 t = [이름, 인원, Riot style 번호] -> build_guides.py와 같은 {t, n, style}
        syn = [{"t": t[0], "n": t[1], "style": STYLE.get(t[2] if len(t) > 2 else 1, "bronze")} for t in (g.get("t") or []) if len(t) > 1]
        syn.sort(key=lambda x: (ORDER.get(x["style"], 5), -x["n"]))
        out_g.append({
            "name": g.get("n") or "", "tag": "", "board": board,
            "augments": aug_out, "syn": syn, "cluster": md["id"] if md else None,
        })
    if out_g:
        gout = ROOT / "site" / "guides.json"
        gout.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
                                    "patch": "19.1 PBE", "styles": styles, "decks": out_g},
                                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{gout.relative_to(ROOT)}: 19시즌 추천 가이드 {len(out_g)}개 (MetaTFT 짝 {sum(1 for x in out_g if x['cluster'])}개)")


def main():
    import re as _re
    import setinfo
    CACHE.mkdir(parents=True, exist_ok=True)
    lk = T.load("lookup_ko")
    nm = T.Names(lk)
    code_cnt = {}
    for u in lk["units"]:
        c = u.get("code") or ""
        if c:
            code_cnt.setdefault(c, set()).add(_re.sub(r"^(TFT\d+_|DA_)|19$", "", u.get("characterName") or u["apiName"]).lower())
    codes = {}
    for u in lk["units"]:
        c = u.get("code") or ""
        if _re.fullmatch(r"[0-9a-f]{3}", c) and len(code_cnt.get(c, ())) == 1:
            for a in u.get("assetNames", []) + [u["apiName"]]:
                codes[a] = c
    p = T.load("patch")
    patch = f"{setinfo.NUM}.1 PBE" if setinfo.PBE else f"{p['patch']}{p.get('b_patch_version') or ''}"
    data = T.load("comps_data")["results"]["data"]
    cid, details = data["cluster_id"], data["cluster_details"]
    res = T.load("comps_stats")["results"]
    actx = aug_ctx(lk, cid)
    total = res[0]["places"][0]
    min_games = T.comp_min(total)
    decks = []
    for s in res:
        if not s["cluster"] or s["count"] < min_games or s["cluster"] not in details:
            continue
        d = fetch(s["cluster"], cid)
        if d and T.junk_cluster(d)[0]:
            print("잡다한 묶음 제외:", s["cluster"], T.comp_name(nm, details[s["cluster"]]), T.junk_cluster(d)[1:])
            continue
        if d:
            x = deck(nm, s["cluster"], details[s["cluster"]], s, d, total, codes)
            x["augs"], x["augsrc"] = deck_augs(actx, s["cluster"], x["board"])
            if setinfo.PBE and x["augsrc"] != "pro":  # PBE는 시너지로 채운 증강이 덱마다 거의 같아 의미 없음 (2026-11-21 사용자) -> 안 넣는다
                x["augs"], x["augsrc"] = None, ""
            decks.append(x)
    names = {x["id"]: x["name"] for x in decks}
    for x in decks:
        x["counters"] = [[names[str(c["against"])], round(c["place_change"], 2)] for c in x["counters"] if str(c["against"]) in names][:3]
        x["mine"] = next((tag for k, tag in MINE.items() if k in x["name"]), "")
    decks.sort(key=lambda x: x["avg"])
    for x in decks:  # MetaTFT 덱 티어 표 (평균 등수)
        x["tier"] = T.mt_tier(x["avg"])
    totals, src_at = basis_stats(decks)
    totals.setdefault("all", total)
    _ps = json.loads((ROOT / "data" / "patch_state.json").read_text()) if (ROOT / "data" / "patch_state.json").exists() else {}
    meta = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "patch": patch, "pbe": setinfo.PBE,
            "pbe_build": {"release": _ps.get("pbe_release", ""), "since": _ps.get("pbe_since", "")} if setinfo.PBE else None,
            "cluster_id": str(cid), "src_at": src_at or T.load("comps_stats").get("updated") or 0, "totals": totals,
            "source": "MetaTFT PBE 전체 통계" if setinfo.PBE else "MetaTFT 최근 3일 에메+ (티어별 평균은 같은 기간 전 티어)", "decks": decks}
    # 새 패치 첫날은 판이 적어 덱 묶음이 몇 개 안 나온다 (18.7 첫날 15개). 그러면 지난 파일을 그대로 두고 다음 점검에서 다시 (2026-11-18)
    try: old_n = len(json.loads(OUT.read_text()).get("decks") or [])
    except Exception: old_n = 0
    if not meta.get("decks") and old_n:  # 받기 실패로 0개일 때만 지난 파일 유지 (적어도 MetaTFT 그대로, 2026-11-24)
        print(f"덱 0개 -> 지난 meta.json({old_n}개) 유지"); return
    OUT.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: 덱 {len(decks)}개 (최소 {min_games}판), {OUT.stat().st_size // 1024}KB")
    if setinfo.PBE:
        _sync_pbe_guides(decks)


if __name__ == "__main__":
    main()
