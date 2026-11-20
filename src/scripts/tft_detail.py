#!/usr/bin/env python3
"""MetaTFT 한국어 데이터에서 상세 정보를 풀어 guide/data/1x_*.md 로 쓴다.

설명문 속 수치 자리(<TFTCurveTable>, <TFTAttribute>)를 실제 숫자로 채우고,
시너지의 숨은 조건(postTierDesc)과 보조 설명(traitTooltips)까지 합친다.

사용법:
    python3 scripts/tft_data.py fetch    # raw/ 준비 (시너지 통계 포함)
    python3 scripts/tft_detail.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

TAG = re.compile(r"<(TFTCurveTable|TFTAttribute)\b([^>]*)/>")
ATTR = re.compile(r'(\w+)="([^"]*)"')
RARITY = {"Silver": "실버", "Gold": "골드", "Prismatic": "프리즘"}
STAT_ICON = {
    "icon.ad": "공격력", "icon.ap": "주문력", "icon.as": "공속", "icon.armor": "방어력", "icon.mr": "마저",
    "icon.health": "체력", "icon.manaregen": "마나 재생", "icon.mana": "마나", "icon.critchance": "치명타",
    "icon.crit": "치명타", "icon.omnivamp": "모든 피해 흡혈", "icon.dura": "내구력", "icon.da": "피해 증폭",
    "icon.damageamp": "피해 증폭", "icon.range": "사거리",
}


def table_of(obj):
    t = {}
    for key in ("curveTable", "curveValues"):
        for k, v in (obj.get(key) or {}).items():
            t[k.lower()] = sorted(v, key=lambda p: p[0])
    return t


def at(pairs, n):
    exact = [v for i, v in pairs if i == n]
    if exact:
        return exact[0]
    before = [v for i, v in pairs if i <= n]
    return before[-1] if before else pairs[0][1]


def fmt(x, f):
    f = (f or "").lower()
    if not isinstance(x, (int, float)):
        return str(x)
    if f == "percent":
        x = x * 100
    elif f == "percentminusone":
        x = (x - 1) * 100
    elif f == "invertedpercent":
        x = (1 - x) * 100
    x = round(x, 2)
    s = str(int(x)) if float(x).is_integer() else f"{x:g}"
    return s + ("%" if f in ("percent", "percentminusone", "invertedpercent") else "")


def join(vals):
    out = []
    for v in vals:
        if not out or out[-1] != v:
            out.append(v)
    return out[0] if len(set(vals)) == 1 else "/".join(vals)


def fill(text, obj, stars=False):
    """설명문의 수치 자리를 채운다. stars=True 면 유닛 1/2/3성 값을 나란히 쓴다."""
    if not text:
        return ""
    table = table_of(obj)
    attrs = obj.get("attributeValues") or (obj.get("ability") or {}).get("attributeValues") or {}

    def value(m):
        a = dict(ATTR.findall(m.group(2)))
        f = a.get("format")
        if m.group(1) == "TFTAttribute":
            v = attrs.get(a.get("attributeID", ""))
            return join([fmt(x, f) for x in v[:3]]) if v else "?"
        pairs = table.get(a.get("row", "").lower())
        if not pairs:
            return "?"
        if "column" in a:
            return fmt(at(pairs, int(a["column"])), f)
        if stars:
            return join([fmt(at(pairs, n), f) for n in (1, 2, 3)])
        vals = [fmt(v, f) for i, v in pairs if i >= 1] or [fmt(pairs[-1][1], f)]
        return join(vals)

    def rep(m):
        v = value(m)
        # 스탯 줄처럼 숫자만 있고 이름이 아이콘으로만 표시되는 자리는 이름을 붙인다.
        icon = dict(ATTR.findall(m.group(2))).get("icon", "").split(",")[0].strip().lower()
        label = STAT_ICON.get(icon)
        if label and dict(ATTR.findall(m.group(2))).get("type") == "stat":
            return f"{label} {v}"
        return v

    s = TAG.sub(rep, text)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<img[^>]*/?>", "", s)
    s = re.sub(r"<[^>]*>", "", s)
    s = re.sub(r"\{[^}]*\}", "", s)
    s = re.sub(r"@[^@\s]+@", "#", s)
    lines = [re.sub(r"[ \t]+", " ", x).strip() for x in s.replace("\r", "").split("\n")]
    return " / ".join(x for x in lines if x)


def build_traits(lk, patch):
    uname = {u["apiName"]: u["name"] for u in lk["units"]}
    tips = {}
    for t in lk["extras"].get("traitTooltips", []):
        tips.setdefault(t.get("owner"), []).append(t)
    order = {"origin": 0, "class": 1, "unique": 2}
    lines = []
    for t in sorted(lk["traits"], key=lambda x: (order.get(x["type"], 3), x["name"])):
        members = sorted(t.get("units", []), key=lambda x: x["unit_cost"])
        lines.append(f"## {t['name']} ({t.get('en_name', '')})")
        lines.append(f"- 단계: {', '.join(str(e['minUnits']) for e in t['effects'])}")
        if members:
            lines.append("- 기물: " + ", ".join(f"{uname.get(m['unit'], m['unit'])}({m['unit_cost']})" for m in members))
        if t.get("desc"):
            lines.append("- 효과: " + fill(t["desc"], t))
        for e in t["effects"]:
            if e.get("desc"):
                lines.append(f"  - {fill(e['desc'], t)}")
        post = fill(t.get("postTierDesc"), t)
        if post:
            lines.append(f"- **추가 조건/설명**: {post}")
        for tip in tips.get(t["apiName"], []):
            text = fill(tip.get("desc") or tip.get("name"), tip)
            if text:
                lines.append(f"  - 보조: {text}")
        lines.append("")
    T.write("10_상세_시너지.md", "시너지 상세", f"{patch}. 단계별 수치를 채운 원문 + 숨은 조건(추가 조건/설명) + 보조 툴팁.", lines)


def build_units(lk, patch):
    units = [u for u in lk["units"] if u["apiName"].startswith("TFT") and u["traits"] and 1 <= u["cost"] <= 5]
    seen, lines = set(), []
    for u in sorted(units, key=lambda x: (x["cost"], x["name"])):
        if u["name"] in seen:
            continue
        seen.add(u["name"])
        st, ab = u["stats"], u.get("ability") or {}
        ad = "/".join(str(round(x)) for x in (st.get("damageByStar") or [st.get("damage") or 0])[:3] if x is not None)
        lines.append(f"## {u['name']} ({u['cost']}코) — {', '.join(u['traits'])}")
        lines.append(f"- 체력 {st.get('hp')} · 방어 {st.get('armor')} · 마저 {st.get('magicResist')} · 공격력 {ad} · 공속 {st.get('attackSpeed')} · 사거리 {st.get('range')} · 마나 {st.get('initialMana')}/{st.get('mana')}")
        if ab.get("desc"):
            merged = dict(u)
            merged["attributeValues"] = ab.get("attributeValues") or u.get("attributeValues")
            lines.append(f"- **{ab.get('name', '스킬')}**: {fill(ab['desc'], merged, stars=True)}")
        lines.append("")
    write_note = f"{patch}. 수치가 a/b/c 이면 1성/2성/3성. 스킬 수치는 주문력·공격력 계수가 곱해지기 전 값일 수 있음."
    T.write("11_상세_유닛.md", "유닛 상세", write_note, lines)


def item_group(i):
    tags = " ".join(i.get("tags") or [])
    api = i["apiName"]
    if api.startswith("DA_Component_"):
        return "재료"
    if "Emblem" in api or "Trait" in tags:
        return "상징"
    if "Radiant" in tags or "Radiant" in api:
        return "찬란한"
    if "Artifact" in tags or "Ornn" in tags:
        return "유물"
    if "Craftable" in tags:
        return "조합템"
    return "기타"


ITEM_CACHE = T.ROOT / "data" / "item_text.json"


def item_texts(lk):
    """템 이름 -> {g 종류, r 재료 이름, s 능력치 줄, d 효과}.
    18.6부터 MetaTFT·CommunityDragon 원문에 템 설명(desc·statLine)이 비어 온다 (수치표만 있음).
    그래서 설명이 있을 때 data/item_text.json에 저장해 두고, 비어 오면 마지막으로 저장한 설명을 쓴다."""
    names = {i["apiName"]: i["name"] for i in lk["items"]}
    cache = json.loads(ITEM_CACHE.read_text(encoding="utf-8")) if ITEM_CACHE.exists() else {}
    out, fresh = {}, 0
    for i in lk["items"] + lk.get("armory_items", []):
        name = i["name"]
        if not name or name in out:
            continue
        r = [names.get(c, c) for c in i.get("composition") or []]
        st, d = fill(i.get("statLine"), i), fill(i.get("desc"), i)
        if st or d:
            cache[name] = {"g": item_group(i), "r": r, "s": st, "d": d}
            fresh += 1
        elif name not in cache:
            continue
        c = cache[name]
        out[name] = {"g": item_group(i), "r": r or c.get("r", []), "s": c["s"], "d": c["d"]}
    if fresh:
        ITEM_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
    return out


def build_items(lk, patch):
    groups = {}
    for name, v in item_texts(lk).items():
        groups.setdefault(v["g"], []).append((name, v))
    lines = []
    for g in ["재료", "조합템", "상징", "유물", "찬란한", "기타"]:
        if g not in groups:
            continue
        lines += [f"## {g}", ""]
        for name, v in sorted(groups[g]):
            comp = " + ".join(v["r"])
            lines.append(f"- **{name}**" + (f" = {comp}" if comp else "") + (f" · 기본 {v['s']}" if v["s"] else ""))
            if v["d"]:
                lines.append(f"  - {v['d']}")
        lines.append("")
    T.write("12_상세_아이템.md", "아이템 상세", f"{patch}. 조합식, 기본 능력치, 효과.", lines)


def build_augments(lk, patch):
    tier_of = {}
    for tier in T.load("aug_tiers")["content"]["content"]["tierList"]:
        for it in tier["content"]:
            tier_of[it["id"]] = tier.get("label", "")
    lines = []
    for r in ("Silver", "Gold", "Prismatic"):
        augs = [a for a in lk["augments"] if a.get("rarity") == r]
        lines += [f"## {RARITY[r]}", ""]
        for a in sorted(augs, key=lambda x: ("SABCD".find(tier_of.get(x["apiName"], "Z")) % 9, x["name"])):
            tier = tier_of.get(a["apiName"], "-")
            lines.append(f"- **{a['name']}** [{tier}티어] ({', '.join(a.get('rounds') or []) or '-'}): {fill(a['desc'], a)}")
        lines.append("")
    T.write("13_상세_증강.md", "증강 상세", f"{patch}. 등급별, MetaTFT 티어순. 라운드는 등장 가능한 증강 라운드.", lines)


def build_trait_stats(lk, patch):
    by_api = {t["apiName"]: t for t in lk["traits"]}
    tabs = {}
    for t in ["base"] + list(T.TIERS):
        name = "traits" if t == "base" else f"traits_{t}"
        try:
            tabs[t] = {r["trait"]: r["places"] for r in T.load(name)["results"]}
        except FileNotFoundError:
            pass
    order = [t for t in ["base", "ma", "gm", "ch"] if t in tabs]
    rows = []
    for key, places in tabs["base"].items():
        api, _, idx = key.rpartition("_")
        tr = by_api.get(api)
        if not tr or not idx.isdigit() or sum(places) < 2000:
            continue
        effects = tr["effects"]
        n_units = effects[int(idx) - 1]["minUnits"] if 0 < int(idx) <= len(effects) else idx
        cells = []
        for t in order:
            p = tabs[t].get(key)
            if p and sum(p) >= T.TIER_MIN.get(t, 0) // 10:
                a, n = T.avg_place(p)
                cells.append(f"{a:.2f} ({p[0] / n * 100:.0f}%)")
            else:
                cells.append("")
        rows.append((T.avg_place(places)[0], f"{tr['name']} {n_units}", cells, sum(places)))
    rows.sort()
    lines = ["칸은 `평균 등수 (1등%)`. 마지막 보드 기준이라 늦게 켜지는 시너지일수록 좋아 보이는 경향이 있음.", "",
             "| 시너지 | " + " | ".join(T.TIER_LABEL[t] for t in order) + " | 판수(에메+) |",
             "|---|" + "---|" * (len(order) + 1)]
    lines += [f"| {name} | " + " | ".join(c) + f" | {n:,} |" for _, name, c, n in rows]
    T.write("14_시너지_통계.md", "시너지 단계별 통계", f"MetaTFT {patch}, 최근 3일.", lines)


def main():
    lk = T.load("lookup_ko")
    p = T.load("patch")
    patch = f"{p['patch']}{p.get('b_patch_version') or ''}"
    build_traits(lk, patch)
    build_units(lk, patch)
    build_items(lk, patch)
    build_augments(lk, patch)
    build_trait_stats(lk, patch)


if __name__ == "__main__":
    main()
