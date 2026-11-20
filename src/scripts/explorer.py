#!/usr/bin/env python3
"""MetaTFT Data Explorer 질의. 유닛·템·시너지 조건을 걸어 평균 등수를 본다.

사용법:
    python3 scripts/explorer.py "케일" "케일+구인수의 격노검" "케일+구인수의 격노검+도박꾼의 칼날"
    python3 scripts/explorer.py --rank gm "케일+도박꾼의 칼날"

조건 문법: 유닛[+템+템...] 또는 @시너지[기물수]. 여러 조건을 , 로 이으면 AND (예: "케일+구인수의 격노검,레오나,@달빛3").
템은 한국어 정식 이름(MetaTFT 기준). 같은 유닛에 템 여러 개를 걸면 그 유닛이 모두 들고 있어야 한다.
--rank: base(에메+, 기본) / ma(마스터+) / gm(그마+) / ch(챌린저)
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

URL = "https://api-hc.metatft.com/tft-explorer-api/total"
RANKS = {"base": T.RANKS, **T.TIERS}


def ids(lk):
    unit = {}
    for u in lk["units"]:
        for a in u.get("assetNames", []):
            unit.setdefault(u["name"], a)
    item = {i["name"]: i["apiName"] for i in lk["items"] + lk.get("armory_items", [])}
    return unit, item


def trait_param(token, lk):
    """'@달빛3' -> ('trait', 'DA_18_Lunar_2'). 숫자는 기물 수, 생략하면 첫 단계."""
    body = token[1:].strip()
    name = body.rstrip("0123456789").strip()
    count = body[len(name):].strip()
    t = next(x for x in lk["traits"] if x["name"] == name)
    mins = [e["minUnits"] for e in t["effects"]]
    idx = mins.index(int(count)) + 1 if count else 1
    return ("trait", f"{t['apiName']}_{idx}")


def params(query, unit, item, lk=None):
    """'케일+구인수의 격노검,레오나,@달빛3' -> MetaTFT 쿼리 파라미터 목록."""
    out = []
    for part in query.split(","):
        if part.strip().startswith("@"):
            out.append(trait_param(part.strip(), lk or T.load("lookup_ko")))
            continue
        names = [x.strip() for x in part.split("+") if x.strip()]
        u = unit[names[0]]
        out.append(("unit_unique", f"{u}-1"))
        for n in names[1:]:
            out.append(("unit_item_unique", f"{u}-1&{item[n]}-1"))
    return out


def run(query, rank="base"):
    lk = T.load("lookup_ko")
    unit, item = ids(lk)
    base = [("formatnoarray", "true"), ("compact", "true"), ("queue", "1100"), ("patch", "current"),
            ("days", "3"), ("rank", RANKS[rank]), ("permit_filter_adjustment", "true")]
    url = URL + "?" + urllib.parse.urlencode(base + params(query, unit, item, lk))
    req = urllib.request.Request(url, headers=T.HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    return data


def summary(data):
    """응답에서 등수 분포를 찾아 (평균, 순방%, 1등%, 판수)."""
    rows = data.get("data") or data.get("results") or data
    if isinstance(rows, dict):
        rows = [rows]
    for r in rows if isinstance(rows, list) else []:
        p = r.get("placement_count") or r.get("places")
        if p:
            if isinstance(p, dict):
                p = [p.get(str(i), 0) for i in range(1, 9)]
            n = sum(p)
            if n:
                return sum((i + 1) * x for i, x in enumerate(p)) / n, sum(p[:4]) / n * 100, p[0] / n * 100, n
    return None


if __name__ == "__main__":
    args = sys.argv[1:]
    rank = "base"
    if args[:1] == ["--rank"]:
        rank, args = args[1], args[2:]
    for q in args:
        d = run(q, rank)
        s = summary(d)
        if s:
            print(f"{q}: 평균 {s[0]:.2f} · 순방 {s[1]:.0f}% · 1등 {s[2]:.1f}% · {s[3]:,}보드 ({T.TIER_LABEL.get(rank, rank)})")
        else:
            print(q, json.dumps(d, ensure_ascii=False)[:500])
