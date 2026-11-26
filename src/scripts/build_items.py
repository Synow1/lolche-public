#!/usr/bin/env python3
"""아이템 탭 '티어표' 데이터 -> site/items.json

사용법:
    python3 scripts/build_items.py            # MetaTFT에서 티어별 템 통계를 받고 db.json용 tactics.tools 캐시(raw/tt)로 유닛별 성적을 만든다
    python3 scripts/build_items.py --offline  # raw/ 에 받아둔 것으로만

- 템 등수·순방·승률·빈도: MetaTFT items_matches (최근 3일 랭크). 티어 필터별로 따로 받는다.
- 등급(S~D): MetaTFT 아이템 페이지와 같은 공식. 점수 = (4.5 - 평균 등수 + p) × 빈도^k
  조합템 p=0.5 k=1, 상징 p=0.125 k=0.25, 유물·찬란한(판마다 나오는 게 아니라서) p=0 k=0. S>0.3 A>0.2 B>0.1 C>0
- 템별 유닛 성적: tactics.tools 다이아+ (build_db.py가 받아둔 raw/tt/<유닛>.json의 items). 유닛마다 많이 쓴 40개 템까지만 있다.
"""
import json
from datetime import datetime, timezone
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "site" / "items.json"
TIERS = {  # 페이지 덱 탭의 통계 기준과 같은 이름
    "all": "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER,PLATINUM",
    "emer": "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER",
    "low": "IRON,BRONZE,SILVER,GOLD",
    "dia": "DIAMOND,MASTER,GRANDMASTER,CHALLENGER",
    "top": "MASTER,GRANDMASTER,CHALLENGER",
}
GROUPS = {"조합템", "찬란한", "유물", "상징"}


def fetch(key, ranks):
    path = RAW / f"items_{key}.json"
    if "--offline" in sys.argv or (path.exists() and time.time() - path.stat().st_mtime < 6 * 3600):
        return json.loads(path.read_text()) if path.exists() else None
    url = f"{T.API}/tft-stat-api/items_matches?queue=1100&patch=current&days=3&rank={ranks}&permit_filter_adjustment=true"
    with urllib.request.urlopen(urllib.request.Request(url, headers=T.HEADERS), timeout=120) as r:
        data = json.loads(r.read())
    path.write_text(json.dumps(data))
    time.sleep(0.5)
    return data


def grade(group, avg, freq):
    p, k = {"조합템": (0.5, 1), "상징": (0.125, 0.25)}.get(group, (0, 0))
    s = (4.5 - avg + p) * freq ** k
    return "S" if s > 0.3 else "A" if s > 0.2 else "B" if s > 0.1 else "C" if s > 0 else "D", round(s, 3)


def main():
    import setinfo
    lk = json.loads((RAW / "lookup_ko.json").read_text())
    nm = T.Names(lk)
    db = json.loads((ROOT / "site" / "db.json").read_text())
    group = {n: v["g"] for n, v in db["info"]["i"].items()}

    tiers = {}
    if setinfo.PBE:
        d = T.load("items")
        games = sum(g["count"] for g in d.get("games") or []) or 1
        rows = {}
        for r in d["results"]:
            name = nm.i(r["itemName"])
            g = group.get(name)
            n = sum(r["places"])
            if g not in GROUPS or n < 50:
                continue
            avg = sum(c * (i + 1) for i, c in enumerate(r["places"])) / n
            letter, score = grade(g, avg, n / games)
            rows[name] = [n, round(avg, 2), round(100 * sum(r["places"][:4]) / n), round(100 * r["places"][0] / n, 1), letter, score]
        for key in ("all", "emer"):
            tiers[key] = {"games": games, "items": rows}
        print("PBE", games, "판", len(rows), "템")
    else:
        def _rows_of(d):
            games = sum(g["count"] for g in d.get("games") or []) or 1
            rows = {}
            for r in d.get("results") or []:
                name = nm.i(r["itemName"])
                g = group.get(name)
                n = sum(r["places"])
                if g not in GROUPS or n < 50:
                    continue
                avg = sum(c * (i + 1) for i, c in enumerate(r["places"])) / n
                letter, score = grade(g, avg, n / games)
                rows[name] = [n, round(avg, 2), round(100 * sum(r["places"][:4]) / n), round(100 * r["places"][0] / n, 1), letter, score]
            return games, rows

        for key, ranks in TIERS.items():
            d = fetch(key, ranks)
            if not d:
                continue
            games, rows = _rows_of(d)
            if len(rows) >= 50:
                tiers[key] = {"games": games, "items": rows}
            print(key, games, "판", len(rows), "템")
        # 새 시즌 첫날(아직 에메+·다이아+·마스터+가 비었을 때): permit_filter_adjustment=true 원문으로 all·emer 보강
        if "all" not in tiers or "emer" not in tiers:
            try:
                games_fb, rows_fb = _rows_of(T.load("items"))
                if len(rows_fb) >= 50:
                    for key in ("all", "emer"):
                        tiers.setdefault(key, {"games": games_fb, "items": rows_fb})
                    print("새 시즌 초기 보강:", games_fb, "판", len(rows_fb), "템")
            except Exception:
                pass

    # 템별 유닛 성적 (라이브는 tactics.tools 다이아+, PBE·새 시즌 첫날은 MetaTFT unit_items/unit_detail 기반 db.items)
    units = {}
    try:
        tst = json.loads((ROOT / "data" / "tt_patch.json").read_text())
        ttp = str(tst["patch"]) if tst.get("set", setinfo.NUM) == setinfo.NUM else "none"
    except Exception:
        ttp = "none" if setinfo.PBE else ""
    if not setinfo.PBE and ttp != "none":
        for f in sorted((RAW / "tt").glob((ttp + "_*.json") if ttp else "*.json")):
            d = json.loads(f.read_text())
            u = nm.u(f.stem.split("_", 1)[1] if ttp else f.stem)
            for r in d.get("items") or []:
                it = nm.i(r["items"])
                if group.get(it) not in GROUPS or r["count"] < 30:
                    continue
                a = units.setdefault(it, {}).setdefault(u, [0, 0.0, 0.0, 0.0])
                a[0] += r["count"]; a[1] += r["place"] * r["count"]; a[2] += r["top4"] * r["count"]; a[3] += r["won"] * r["count"]
    by_item = {}
    for it, us in units.items():
        rows = [[u, a[0], round(a[1] / a[0], 2), round(a[2] / a[0]), round(a[3] / a[0], 1)] for u, a in us.items()]
        by_item[it] = sorted(rows, key=lambda x: -x[1])[:12]
    if not by_item:
        u_info = db.get("units") or {}
        for it, rows in (db.get("items") or {}).items():
            if group.get(it) not in GROUPS:
                continue
            out_r = []
            for u, avg, cnt in rows[:12]:
                ub = (u_info.get(u) or {}).get("base") or {}
                out_r.append([u, int(cnt), round(avg, 2), int(ub.get("top4", 50)), round(float(ub.get("win", 12.5)), 1)])
            if out_r:
                by_item[it] = out_r

    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "patch": db.get("patch"), "pbe": setinfo.PBE,
           "tiers": tiers, "units": by_item}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{OUT.relative_to(ROOT)}: 템 {len(tiers.get('all', {}).get('items', {}))}개, 유닛별 성적 {len(by_item)}개, {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
