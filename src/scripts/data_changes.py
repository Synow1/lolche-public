#!/usr/bin/env python3
"""앱에 올릴 때 탭별로 무엇이 바뀌었는지 -> site/changes.json (앱이 업데이트 뒤 한 번 띄운다, 2026-11-16 사용자:
"업뎃되면 뭐가 업뎃됐는지 한번 띄워, 아카데미 탭도 다른 탭들도 전부").

지난번 올린 데이터 요약(data/changes_base.json)과 지금 site/*.json 요약을 비교한다.
  python3 scripts/data_changes.py          # site/changes.json 만들기 (android/build.sh가 부름)
  python3 scripts/data_changes.py --commit # 올리기 성공 뒤 지금 요약을 기준으로 저장 (publish_app.sh가 부름)
"""
import json, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
BASE = ROOT / "data" / "changes_base.json"
OUT = SITE / "changes.json"
KEEP = 20  # 기록은 최근 20번 올린 것까지
TIER_ORDER = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4, "X": 5}


def load(name):
    try:
        return json.loads((SITE / name).read_text())
    except Exception:
        return None


def digest():
    d = {}
    t = load("tfa.json")
    if t:
        d["tfa"] = {c["title"]: c.get("tier", "") for c in t.get("comps", []) if not c.get("var") and c.get("title")}
        # 아카데미 공략 내용 (2026-11-16 사용자: "아카데미는 변경점이겠지"): 덱마다 배치·템, 증강, 팁, 유연한 교체를 따로 요약해 무엇이 바뀌었는지
        def sig(x): return json.dumps(x, ensure_ascii=False, sort_keys=True)
        d["tfa_parts"] = {c["title"]: {"배치·템": sig(sorted((u.get("u"), u.get("s"), tuple(u.get("i") or [])) for u in c.get("board") or [])),
                                       "증강": sig(c.get("augs") or []), "팁": sig([c.get("tips"), c.get("augTip")]),
                                       "유연한 교체": sig(c.get("cap") or []), "초반": sig(c.get("early") or [])}
                          for c in t.get("comps", []) if c.get("title")}
        aug = {}
        for lv, by in (t.get("augs") or {}).items():
            for tier, names in (by.get("All") or {}).items():
                for n in names: aug.setdefault(n, tier)
        d["tfa_aug"] = aug
    m = load("meta.json")
    if m:
        d["patch"] = m.get("patch", "")
        d["meta"] = {x["name"]: x.get("tier", "") for x in m.get("decks", []) if x.get("name")}
    i = load("items.json")
    if i:
        tb = (i.get("tiers") or {}).get("emer") or (i.get("tiers") or {}).get("all") or {}
        d["items"] = {k: v[4] for k, v in (tb.get("items") or {}).items() if isinstance(v, list) and len(v) > 4}
    e = load("esports.json")
    if e:
        ch = {}
        for tr in e.get("tournaments", []):
            for ev in tr.get("events", []):
                if ev.get("champion"):
                    kind = {"finals": "지역별 결승", "tpc": "프로 서킷", "trials": "전략가의 시험", "crown": "월즈", "cup": "컵"}.get(tr.get("kind"), tr.get("kind", ""))
                    ch[f"S{tr.get('set')} {tr.get('region', '')} {kind}|{ev.get('ev', '')}"] = ev["champion"]
        for w in e.get("worlds", []):
            if w.get("top"): ch[f"WORLDS|{w['set']}"] = w["top"][0][0]
        d["esports"] = ch
    return d


def tier_moves(old, new, label, only_top=True):
    """티어 변동·신규 진입·제외. only_top이면 S·A가 걸린 변화만."""
    out = []
    for k, t in new.items():
        o = old.get(k)
        if o is None:
            if not only_top or t in ("S", "A"): out.append(f"{label} {k} {t}티어 진입")
        elif o != t and (not only_top or "S" in (o, t) or "A" in (o, t)):
            out.append(f"{label} {k} {o} → {t}티어")
    for k, o in old.items():
        if k not in new and (not only_top or o in ("S", "A")): out.append(f"{label} {k} 티어표 제외 (이전 {o}티어)")
    return out


def diff(old, new):
    items = []
    def add(tab, name, lines, cap=8):
        if not lines: return
        more = len(lines) - cap
        items.append({"tab": tab, "name": name, "lines": lines[:cap] + ([f"외 {more}건"] if more > 0 else [])})
    om, nm = str(old.get("patch", "")).split(".")[0], str(new.get("patch", "")).split(".")[0]
    if om and nm and om != nm:  # 새 세트: 덱·템이 통째로 바뀌니 줄줄이 말고 요약만
        lines = [f"시즌 {nm} 시작 · 패치 {new['patch']}", f"덱 탭: 새 시즌 덱 {len(new.get('meta', {}))}개"]
        lines.append(f"아카데미: 덱 {len(new.get('tfa', {}))}개" if new.get("tfa") != old.get("tfa") else "아카데미: 새 시즌 티어표가 올라오면 보여요")
        lines.append("지난 시즌 전용 공략을 정리했어요")
        return [{"tab": "meta", "name": "새 시즌", "lines": lines}]
    if old.get("patch") and new.get("patch") and old["patch"] != new["patch"]:
        add("patch", "패치", [f"패치 {old['patch']} → {new['patch']}"])
    tl = tier_moves(old.get("tfa", {}), new.get("tfa", {}), "", only_top=False)
    op, npts = old.get("tfa_parts", {}), new.get("tfa_parts", {})
    for k, parts in npts.items():
        if k not in op: continue
        ch = [p for p, v in parts.items() if op[k].get(p) != v]
        if ch: tl.append(f"{k} · {', '.join(ch)} 변경")
    add("tfa", "아카데미", tl, cap=12)
    add("augments", "증강", tier_moves(old.get("tfa_aug", {}), new.get("tfa_aug", {}), "", only_top=True))
    add("meta", "덱", tier_moves(old.get("meta", {}), new.get("meta", {}), "", only_top=True))
    add("items", "아이템", tier_moves(old.get("items", {}), new.get("items", {}), "", only_top=True))
    oe, ne = old.get("esports", {}), new.get("esports", {})
    add("esports", "이스포츠", [("월즈 S" + k.split("|")[1] if k.startswith("WORLDS|") else k.split("|")[0].replace(" WORLD 월즈", " 월즈") + " " + k.split("|")[1]).strip() + f" 우승 {v}"
                               for k, v in ne.items() if oe.get(k) != v])
    for it in items:
        it["lines"] = [" ".join(x.split()) for x in it["lines"]]
    return items


LOG = ROOT / "data" / "changes_log.json"      # 올린 것 (최근 KEEP번)
PEND = ROOT / "data" / "changes_pending.json"  # 이번 빌드의 바뀐 점 (올리기 성공하면 LOG로)


def main():
    new = digest()
    log = json.loads(LOG.read_text()) if LOG.exists() else []
    if "--commit" in sys.argv:
        if PEND.exists():
            p = json.loads(PEND.read_text())
            if p.get("items"): log = ([p] + log)[:KEEP]
            PEND.unlink()
        LOG.write_text(json.dumps(log, ensure_ascii=False, indent=0))
        BASE.write_text(json.dumps(new, ensure_ascii=False))
        print("바뀐 점 기준 저장")
        return
    cur = []
    if BASE.exists():
        items = diff(json.loads(BASE.read_text()), new)
        if items:
            at = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%dT%H:%M")
            cur = [{"id": at, "items": items}]
            PEND.write_text(json.dumps(cur[0], ensure_ascii=False))
        elif PEND.exists():
            PEND.unlink()
    else:  # 처음: 지금을 기준으로 (첫 빌드는 바뀐 점 없음)
        BASE.parent.mkdir(parents=True, exist_ok=True)
        BASE.write_text(json.dumps(new, ensure_ascii=False))
    OUT.write_text(json.dumps({"log": (cur + log)[:KEEP]}, ensure_ascii=False, indent=0))
    print("바뀐 점:", sum(len(i["lines"]) for i in (cur[0]["items"] if cur else [])), "줄")


if __name__ == "__main__":
    main()
