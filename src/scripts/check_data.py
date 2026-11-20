#!/usr/bin/env python3
"""갱신한 데이터가 비지 않았는지 확인한다. 이상하면 종료 코드 1 (update.sh가 멈추고 앱에 올리지 않음).

사용법:
    python3 scripts/check_data.py raw    # MetaTFT 원문(raw/lookup_ko.json)
    python3 scripts/check_data.py site   # 앱에 들어가는 site/*.json

2026-11-06: 18.6 갱신 때 MetaTFT 원문 아이템 목록이 잠깐 비어 있었는데 그대로 빌드해서
아이템 티어표·상징 → 덱·아이템 설명이 하루 동안 통째로 비었다. 그런 일을 막으려고 만든 검사.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(rel):
    p = ROOT / rel
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def n(x):
    return len(x) if isinstance(x, (list, dict)) else 0


def check_raw():
    lk = load("raw/lookup_ko.json")
    if lk is None:
        return ["raw/lookup_ko.json 없음"]
    need = {"units": 40, "items": 80, "traits": 20, "augments": 100}
    return [f"lookup_ko.{k} {n(lk.get(k))}개 (최소 {v})" for k, v in need.items() if n(lk.get(k)) < v]


def check_site():
    bad = []
    db = load("site/db.json") or {}
    info = db.get("info") or {}
    for k, v, label in [("i", 80, "아이템 설명"), ("t", 20, "시너지 설명"), ("a", 100, "증강 설명")]:
        if n(info.get(k)) < v:
            bad.append(f"db.json {label} {n(info.get(k))}개 (최소 {v})")
    if n(db.get("units")) < 40:
        bad.append(f"db.json 유닛 {n(db.get('units'))}개")
    if n(db.get("items")) < 50:
        bad.append(f"db.json 아이템 {n(db.get('items'))}개")

    it = load("site/items.json") or {}
    for k, t in (it.get("tiers") or {"all": {}}).items():
        if n(t.get("items")) < 50:
            bad.append(f"items.json {k} 템 {n(t.get('items'))}개")
    if n(it.get("units")) < 30:
        bad.append(f"items.json 템별 유닛 성적 {n(it.get('units'))}개")

    meta = load("site/meta.json") or {}
    decks = meta.get("decks") or []
    if len(decks) < 20:
        bad.append(f"meta.json 덱 {len(decks)}개")
    if sum(1 for d in decks if n(d.get("board")) >= 5) < len(decks) * 0.9:
        bad.append("meta.json 보드가 빈 덱이 많음")

    gd = load("site/guides.json") or {}
    if n(gd.get("decks")) < 10:
        bad.append(f"guides.json 덱 {n(gd.get('decks'))}개")

    # 월즈 명단: Liquipedia 크라운 본 페이지에 이름이 다 있는데 '미정'으로 남기면 안 됨 (2026-11-13 중국 JOC 4명)
    cr = (load("site/esports.json") or {}).get("crown") or {}
    if cr.get("pending"):
        import glob, json as _j, re as _r
        for f in glob.glob(str(ROOT / "data/esports/lq_*Tacticians_Crown.json")):
            w = (_j.load(open(f)).get("parse") or {}).get("wikitext", {}).get("*", "")
            i = w.find("==Participants==")
            names = [x for x in _r.findall(r"^\|([^{|=\n][^|\n]*)$", w[i:w.find("==Results==", i)], flags=_r.M) if x.strip() and x.strip().upper() != "TBD"] if i >= 0 else []
            if cr.get("name") and len(names) >= n(cr.get("players")) + sum(x.get("n", 0) for x in cr["pending"]) and len(names) > n(cr.get("players")):
                bad.append(f"esports.json 월즈 미정 {sum(x.get('n', 0) for x in cr['pending'])}자리인데 Liquipedia 본 페이지엔 {len(names)}명 다 있음 ({Path(f).name})")

    pw = load("site/power.json") or {}
    if not pw.get("off") and n(pw.get("w")) < 100:
        bad.append(f"power.json 가중치 {n(pw.get('w'))}개")
    return bad


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "site"
    bad = check_raw() if mode == "raw" else check_site()
    if bad:
        print("데이터 이상 (" + mode + "):\n  " + "\n  ".join(bad))
        sys.exit(1)
    print("데이터 확인 (" + mode + "): 이상 없음")


if __name__ == "__main__":
    main()
