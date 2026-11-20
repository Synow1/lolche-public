#!/usr/bin/env python3
"""MetaTFT 데이터를 받아 guide/data/*.md 참고 표를 다시 만든다.

사용법:
    python3 scripts/tft_data.py fetch   # raw/ 에 MetaTFT JSON 저장
    python3 scripts/tft_data.py build   # raw/ -> guide/data/*.md
    python3 scripts/tft_data.py all     # 둘 다

표준 라이브러리만 쓴다. 세트는 setinfo.py가 MetaTFT 패치 앞자리로 정한다 (19.x가 되면 저절로 TFTSet19).
"""
import ast
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import setinfo  # noqa: E402  지금 세트는 한 곳에서 (MetaTFT 패치 앞자리)
SET = setinfo.SET
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "guide" / "data"

RANKS = "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER"  # 기본 기준 에메+ (2026-11-07 사용자: 플래+ 말고 에메+)
Q = f"queue=1100&patch=current&days=3&rank={RANKS}&permit_filter_adjustment=true"
API = "https://api-hc.metatft.com"
SOURCES = {
    "lookup_ko": f"https://data.metatft.com/lookups/{SET}_latest_ko_kr.json",
    "patch": f"{API}/tft-stat-api/patch",
    "units": f"{API}/tft-stat-api/units?{Q}",
    "items": f"{API}/tft-stat-api/items_matches?{Q}",
    "aug_tiers": f"{API}/tft-stat-api/augments_tiers",
    "comps_data": f"{API}/tft-comps-api/comps_data?queue=1100",
    "comps_stats": f"{API}/tft-comps-api/comps_stats?{Q}",
    "unit_items": f"{API}/tft-comps-api/unit_items_processed",
    "traits": f"{API}/tft-stat-api/traits?{Q}",
}
# 고티어 비교용. 챌린저만은 표본이 작아서 그마+, 마스터+도 같이 받는다.
TIERS = {
    "ma": "MASTER,GRANDMASTER,CHALLENGER",
    "gm": "GRANDMASTER,CHALLENGER",
    "ch": "CHALLENGER",
}
TIER_LABEL = {"base": "에메+", "ma": "마스터+", "gm": "그마+", "ch": "챌린저"}
TIER_MIN = {"base": 3000, "ma": 1500, "gm": 350, "ch": 120}
for _t, _r in TIERS.items():
    _q = f"queue=1100&patch=current&days=3&rank={_r}&permit_filter_adjustment=true"
    SOURCES[f"comps_stats_{_t}"] = f"{API}/tft-comps-api/comps_stats?{_q}"
    SOURCES[f"units_{_t}"] = f"{API}/tft-stat-api/units?{_q}"
    SOURCES[f"traits_{_t}"] = f"{API}/tft-stat-api/traits?{_q}"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://www.metatft.com",
    "Referer": "https://www.metatft.com/",
}

RARITY = {"Silver": "실버", "Gold": "골드", "Prismatic": "프리즘"}
ROLE = {
    "MagicTank": "AP 탱커", "AttackTank": "AD 탱커", "MagicCaster": "AP 캐스터",
    "AttackCaster": "AD 캐스터", "AttackMarksman": "AD 원딜", "MagicMarksman": "AP 원딜",
    "AttackFighter": "AD 전사", "MagicFighter": "AP 전사", "AttackAssassin": "AD 암살자",
    "MagicAssassin": "AP 암살자", "AttackSpecialist_Ammo": "AD 특수(탄약)",
    "MagicSpecialist_Manaless": "AP 특수(마나없음)", "AttackSpecialist_Rage": "AD 특수(분노)",
}
CHARM_CATS = ["Shop", "GoldXP", "Champion", "Item", "Risky", "Misc", "Combat"]
CHARM_CAT_KO = {"Shop": "상점", "GoldXP": "골드·경험치", "Champion": "챔피언", "Item": "아이템",
                "Risky": "위험", "Misc": "기타", "Combat": "전투"}
# 수호령 구간 이름 -> 실제 라운드
ROUND_SPAN = {"Early": ("2-1", "2-7"), "EarlyMid": ("3-1", "3-4"), "Mid": ("3-5", "4-1"),
              "MidLate": ("4-2", "4-7"), "Late": ("5-1", "5-7"), "VeryLate": ("6-1", "끝")}


def rounds_text(names):
    spans = [ROUND_SPAN[n] for n in names if n in ROUND_SPAN]
    return f"{spans[0][0]}~{spans[-1][1]}" if spans else "-"


def fetch():
    RAW.mkdir(exist_ok=True)
    for name, url in SOURCES.items():
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=60) as r:
            (RAW / f"{name}.json").write_bytes(r.read())
        print("fetched", name)


def load(name):
    return json.loads((RAW / f"{name}.json").read_text(encoding="utf-8"))


def lit(x):
    """MetaTFT는 일부 필드를 파이썬 repr 문자열로 준다."""
    return x if isinstance(x, (list, dict)) else ast.literal_eval(x)


def clean(s):
    s = s or ""
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\{[^}]+\}", "", s)
    s = re.sub(r"@[^@]+@", "#", s)
    return re.sub(r"\s+", " ", s).strip()


def fill(desc, curve):
    """설명 속 <TFTCurveTable row=.../> 자리에 첫 단계 값을 채운다."""
    curve = curve or {}

    def rep(m):
        v = curve.get(m.group(1))
        if not v:
            return "#"
        x = v[0][1]
        if isinstance(x, (int, float)) and 0 < abs(x) < 1:
            return f"{round(x * 100)}%"
        return str(round(x, 2)) if isinstance(x, float) else str(x)

    return clean(re.sub(r'<TFTCurveTable row="([^"]+)"[^>]*/>', rep, desc or ""))


def avg_place(places):
    n = sum(places)
    return sum((i + 1) * x for i, x in enumerate(places)) / n, n


class Names:
    def __init__(self, lk):
        self.unit, self.cost = {}, {}
        for u in lk["units"]:
            for a in u.get("assetNames", []) + [u["apiName"]]:
                self.unit[a] = u["name"]
                self.cost[a] = u["cost"]
        self.trait = {t["apiName"]: t["name"] for t in lk["traits"]}
        self.item = {i["apiName"]: i["name"] for i in lk["items"] + lk.get("armory_items", [])}

    def u(self, a):
        return self.unit.get(a, a.replace("DA_18_", "").replace("DA_", ""))

    def t(self, a):
        base = a.rsplit("_", 1)[0] if a.split("_")[-1].isdigit() else a
        return self.trait.get(base, base)

    def i(self, a):
        return self.item.get(a, a.replace("DA_", ""))


def write(name, title, note, lines):
    OUT.mkdir(parents=True, exist_ok=True)
    body = f"# {title}\n\n> {note}\n\n" + "\n".join(lines) + "\n"
    (OUT / name).write_text(body, encoding="utf-8")
    print("wrote", name)


def build_units(lk, patch):
    units = [u for u in lk["units"] if u["cost"] and u["cost"] <= 5 and u["traits"]
             and u["apiName"].startswith("TFT")]
    lines = ["## 코스트별 유닛", "", "| 코스트 | 유닛 | 특성 | 역할 | 사거리 |", "|---|---|---|---|---|"]
    seen = set()
    for u in sorted(units, key=lambda x: (x["cost"], x["name"])):
        if u["name"] in seen:
            continue
        seen.add(u["name"])
        r = u["role"].replace("DA_Role_", "")
        lines.append(f"| {u['cost']} | {u['name']} | {', '.join(u['traits'])} | {ROLE.get(r, r)} | {u['stats']['range']} |")
    lines += ["", "## 특성", ""]
    order = {"origin": 0, "class": 1, "unique": 2}
    uname = {u["apiName"]: u["name"] for u in lk["units"]}
    for t in sorted(lk["traits"], key=lambda x: (order.get(x["type"], 3), x["name"])):
        members = sorted(t.get("units", []), key=lambda x: x["unit_cost"])
        lines.append(f"### {t['name']} ({t.get('en_name', '')}) — 단계 {[e['minUnits'] for e in t['effects']]}")
        lines.append("- 기물: " + ", ".join(f"{uname.get(m['unit'], m['unit'])}({m['unit_cost']})" for m in members))
        lines.append("- 효과: " + clean(t["desc"])[:700])
        lines.append("")
    write("01_유닛_특성.md", "유닛 & 특성 표", f"MetaTFT 한국어 데이터, {patch} 패치 기준. 수치는 패치마다 바뀜.", lines)


def build_charms(lk, patch):
    lines = ["## 조우자", ""]
    for e in lk["encounters"]:
        lines.append(f"- **{e['name']}**: {fill(e.get('postSpawnDesc') or e['desc'], e.get('curveValues'))}")
    lines += ["", "## 수호령 (업그레이드 버전 제외)", ""]
    charms = [c for c in lk["charms"] if not c.get("isUpgrade") and c.get("category")]
    for cat in CHARM_CATS:
        lines += [f"### {CHARM_CAT_KO[cat]}", "", "| 등급 | 이름 | 뜨는 라운드 | 가격 | 효과 |", "|---|---|---|---|---|"]
        for c in sorted([x for x in charms if x["category"] == cat], key=lambda x: (x["tier"], x["name"])):
            if not c.get("rounds"):
                continue  # 라운드가 없는 건 특수 강화 버전
            cost = c.get("cost")
            lines.append(f"| T{c['tier']} | {c['name']} | {rounds_text(c['rounds'])} | {'-' if cost is None else cost} | {fill(c['desc'], c.get('curveValues'))[:150]} |")
        lines.append("")
    write("02_수호령_조우자.md", "수호령 & 조우자", f"MetaTFT 한국어 데이터, {patch} 패치 기준. 가격 '-'는 데이터에 값이 없는 것(대개 0골 또는 가변).", lines)


def build_augments(lk, patch):
    tiers = load("aug_tiers")["content"]
    aug = {a["apiName"]: a for a in lk["augments"]}
    lines = [f"작성: {tiers['author']['gameName']} / 업데이트 {tiers.get('updated_at', '')}", ""]
    for tier in tiers["content"]["tierList"]:
        lines += [f"## {tier.get('label', '?')} 티어", "", "| 등급 | 증강 | 라운드 | 효과 |", "|---|---|---|---|"]
        for it in tier["content"]:
            a = aug.get(it["id"])
            if a:
                lines.append(f"| {RARITY.get(a['rarity'], a['rarity'])} | {a['name']} | {', '.join(a.get('rounds', []))} | {fill(a['desc'], a.get('curveValues'))[:140]} |")
        lines.append("")
    write("03_증강_티어.md", "증강 티어", f"MetaTFT 공식 증강 티어리스트, {patch} 패치. 티어는 평균적인 강함이지 내 판에 맞는지가 아님.", lines)


def comp_name(nm, v):
    return " ".join(nm.t(x["name"]) if x["type"] == "trait" else nm.u(x["name"]) for x in lit(v["name"]))


def comp_table(nm, details, stats_file, min_count):
    """덱 이름 -> (평균 등수, 순방%, 1등%, 판수)."""
    out = {}
    for r in load(stats_file)["results"]:
        v = details.get(r["cluster"]) if r["cluster"] else None
        if not v or r["count"] < min_count:
            continue
        p, n = r["places"][:8], r["count"]
        out[comp_name(nm, v)] = (avg_place(p)[0], sum(p[:4]) / n * 100, p[0] / n * 100, n)
    return out


def build_tiers(nm, patch):
    details = load("comps_data")["results"]["data"]["cluster_details"]
    tabs = {"base": comp_table(nm, details, "comps_stats", TIER_MIN["base"])}
    for t in TIERS:
        tabs[t] = comp_table(nm, details, f"comps_stats_{t}", TIER_MIN[t])
    games = {t: load(f"comps_stats_{t}")["results"][0]["places"][0] // 8 for t in TIERS}
    order = ["base", "ma", "gm", "ch"]
    lines = ["## 덱 평균 등수: 티어별", "",
             "그마+ 기준 정렬. 칸은 `평균 등수 (1등%)`, 표본이 기준보다 적으면 빈칸.", "",
             "| 덱 | " + " | ".join(TIER_LABEL[t] for t in order) + " | 에메+ → 그마+ |",
             "|---|" + "---|" * (len(order) + 1)]
    names = sorted(set(tabs["gm"]) | set(tabs["base"]),
                   key=lambda k: tabs["gm"].get(k, (9,))[0])
    for k in names:
        cells = [f"{tabs[t][k][0]:.2f} ({tabs[t][k][2]:.0f}%)" if k in tabs[t] else "" for t in order]
        diff = f"{tabs['gm'][k][0] - tabs['base'][k][0]:+.2f}" if k in tabs["gm"] and k in tabs["base"] else ""
        lines.append(f"| {k} | " + " | ".join(cells) + f" | {diff} |")
    base_u = {nm.u(r["unit"]): avg_place(r["places"]) for r in load("units")["results"]}
    gm_u = {nm.u(r["unit"]): avg_place(r["places"]) for r in load("units_gm")["results"]}
    moves = sorted((gm_u[k][0] - base_u[k][0], k, base_u[k][0], gm_u[k][0])
                   for k in gm_u if k in base_u and gm_u[k][1] >= 600 and base_u[k][1] >= 20000)
    lines += ["", "## 유닛: 그마+에서 좋아지는 / 나빠지는", "",
              "- 좋아짐: " + ", ".join(f"{k} {a:.2f}→{b:.2f}" for _, k, a, b in moves[:10]),
              "- 나빠짐: " + ", ".join(f"{k} {a:.2f}→{b:.2f}" for _, k, a, b in moves[-10:][::-1])]
    sample = ", ".join(f"{TIER_LABEL[t]} 약 {g:,}판" for t, g in games.items())
    write("06_티어별_비교.md", "티어별 비교",
          f"MetaTFT {patch}, 최근 3일. 표본: {sample}. 고티어 수치는 '누가 그 덱을 언제 하는지'의 영향도 받으니 경향으로만 볼 것.",
          lines)


def build_comps(nm, patch):
    details = load("comps_data")["results"]["data"]["cluster_details"]
    res = load("comps_stats")["results"]
    stats = {r["cluster"]: r for r in res if r["cluster"]}
    total = res[0]["places"][0]
    rows = []
    for k, v in details.items():
        s = stats.get(str(k))
        if not s or s["count"] < TIER_MIN["base"]:
            continue
        p, n = s["places"][:8], s["count"]
        avg, _ = avg_place(p)
        name = comp_name(nm, v)
        builds = [(nm.u(b["unit"]), " / ".join(nm.i(i) for i in b["buildName"]), b["avg"]) for b in lit(v["builds"])[:3]]
        rows.append((avg, name, v["levelling"], sum(p[:4]) / n * 100, p[0] / n * 100, n / total * 100,
                     ", ".join(nm.u(x) for x in v["units_string"].split(", ")), builds))
    rows.sort()
    lines = ["| 덱 | 운영 | 평균 등수 | 순방 | 1등 | 비중 |", "|---|---|---|---|---|---|"]
    lines += [f"| {r[1]} | {r[2]} | {r[0]:.2f} | {r[3]:.0f}% | {r[4]:.1f}% | {r[5]:.1f}% |" for r in rows]
    lines += ["", "## 덱별 유닛과 대표 빌드", ""]
    for r in rows:
        lines += [f"### {r[1]} ({r[2]}, 평균 {r[0]:.2f})", f"- 유닛: {r[6]}"]
        lines += [f"- {u}: {b} (평균 {a:.2f})" for u, b, a in r[7]]
        lines.append("")
    write("04_덱_통계.md", "덱 통계", f"MetaTFT {patch}, 최근 3일, 플래티넘 이상, 판수 3,000 이상. 비중은 전체 보드 대비 비율.", lines)


def build_stats(nm, patch):
    units = load("units")["results"]
    lines = ["## 유닛 평균 등수", ""]
    for c in range(1, 6):
        rows = sorted((avg_place(r["places"])[0], nm.u(r["unit"])) for r in units
                      if nm.cost.get(r["unit"]) == c and sum(r["places"]) > 20000)
        lines.append(f"- **{c}코**: " + ", ".join(f"{n} {a:.2f}" for a, n in rows))
    items = load("items")["results"]
    rows = sorted((avg_place(r["places"])[0], nm.i(r["itemName"])) for r in items if sum(r["places"]) > 30000)
    lines += ["", "## 아이템 평균 등수 (3만 판 이상)", "", ", ".join(f"{n} {a:.2f}" for a, n in rows), "",
              "## 유닛별 추천템 (MetaTFT 순서)", "", "| 유닛 | 평균 | 추천템 |", "|---|---|---|"]
    ui = load("unit_items")["units"]
    for k, v in sorted(ui.items(), key=lambda x: -x[1]["count"]):
        lines.append(f"| {nm.u(k)} | {v['avg']:.2f} | {', '.join(nm.i(i['itemName']) for i in v['items'][:6])} |")
    write("05_유닛_아이템_통계.md", "유닛 & 아이템 통계", f"MetaTFT {patch}, 최근 3일, 플래티넘 이상.", lines)


def build():
    lk = load("lookup_ko")
    p = load("patch")
    patch = f"{p['patch']}{p.get('b_patch_version') or ''}"
    nm = Names(lk)
    build_units(lk, patch)
    build_charms(lk, patch)
    build_augments(lk, patch)
    build_comps(nm, patch)
    build_stats(nm, patch)
    build_tiers(nm, patch)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
