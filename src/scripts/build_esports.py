#!/usr/bin/env python3
"""'이스포츠' 탭 데이터 -> site/esports.json

    python3 scripts/build_esports.py

- APAC: 공식 대회 사이트(set<N>.apactft.com)의 순위표. 스위스·결승이 리더보드로 나뉘어 있고 공식 순위라 그대로 쓴다.
- 다른 지역·크라운: MetaTFT 대회 게임 기록. 단계(스위스/결승)별로 묶고,
  8명 결승은 체크메이트(20점 넘긴 뒤 1등)로 우승자를 정한다. 아무도 못 하면 점수 1위.
  (APAC 공식 결과와 대조해 맞는 것 확인: TPC1 seoill, TPC3 steppy, 스페이스 갓 크라운 Huanmie)
- 프로 포인트: MetaTFT public/pro_players. 선수 국적: APAC 사이트 + Liquipedia(raw/esports/lq_*.json).
"""
import gzip
import json
import re
import unicodedata
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "esports"  # Liquipedia 페이지 (국적용, 커밋해 둔다)
OUT = ROOT / "site" / "esports.json"
API = "https://api.metatft.com/public/"
def _apac_info():
    """APAC 공식 사이트 호스트와 실제 담고 있는 세트 번호를 판별한다.
    apactft.com은 새 세트 직전에 set18 -> set19로 도메인만 먼저 넘기고 내용(8~11월 대회)은 Set 18 그대로 둘 때가 있다."""
    import setinfo
    host = f"https://set{setinfo.LIVE_NUM}.apactft.com/"
    for n in (setinfo.NUM, setinfo.LIVE_NUM, setinfo.LIVE_NUM - 1):
        try:
            r = urllib.request.urlopen(urllib.request.Request(f"https://set{n}.apactft.com/tpc1?_rsc=1", headers={"User-Agent": "Mozilla/5.0", "RSC": "1"}), timeout=20)
            t = r.read().decode("utf-8", "replace")
            host = re.sub(r"/tpc1.*$", "/", r.geturl())
            m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})\s*-\s*(\d{1,2})/(\d{1,2})/(\d{4})", t)
            if m:
                d1, m1, y1 = int(m.group(1)), int(m.group(2)), int(m.group(3))
                start = f"{y1:04d}-{m1:02d}-{d1:02d}"
                real_set = 18 if start < "2026-12-01" else setinfo.NUM
                return real_set, host
        except Exception:
            continue
    return setinfo.LIVE_NUM, host


APAC_SET, APAC = _apac_info()
APAC_EVENTS = [  # (주소, 대회 종류, 이벤트 이름)
    ("tpc1", "tpc", "TPC 1"), ("tpc2", "tpc", "TPC 2"), ("tpc3", "tpc", "TPC 3"),
    ("tactician-s-trials-1", "trials", "시험 1"), ("tactician-s-trials-2", "trials", "시험 2"),
    ("regional-finals-playins", "finals", "플레이인"), ("regional-finals-w1", "finals", "1주차"),
    ("regional-finals", "finals", "2주차 · 그랜드 파이널"),
]
UA = {"User-Agent": "Mozilla/5.0"}
# 데이터에 아직 없는 큰 일정 (Liquipedia 기준, 세트마다 고친다)
SCHEDULE = [{"name": "전략가의 왕관 (월즈)", "label": "신비의 숲", "set": 18, "start": "2026-11-13", "end": "2026-11-15", "ct": "116918001686340951", "sheet": "2PACX-1vRjPKpos2s15MKQaq3XFvlOAgMsmB1yaqd5UNaRCguwNZdoF71LNMfmGFOAD1sFNgUPEj-_g2uAiqMf",
             # 진행 방식 (competetft 대회 페이지): 1일차 40강 6게임 -> 상위 32, 2일차 32강·24강·16강 2게임씩 하위 8명 탈락, 16강 뒤 1~4위 결승 직행·5~12위 8강 1게임 -> 상위 4. 점수는 1·2일차 이어서. 결승은 20점 체크메이트
             "fmt": {"tab": "days?\\s*1", "rounds": [{"n": "40강", "g": 6, "keep": 32}, {"n": "32강", "g": 2, "keep": 24}, {"n": "24강", "g": 2, "keep": 16}, {"n": "16강", "g": 2, "direct": 4, "keep": 12}, {"n": "8강", "g": 1, "keep": 4}], "final": 20}}]  # sheet: 공식 결과 시트 (대회 페이지에 안 걸려서 손으로, 2026-11-14 사용자가 찾아 줌)  # ct: competetft.com 대회 번호 (일차별 공식 시트 링크를 여기서 찾음)


def get(url, headers=None):
    req = urllib.request.Request(url, headers={**(headers or T.HEADERS), "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    return body.decode("utf-8")


def row(name, region, pts, games, wins, top4, out=False, places=None, adv=None):
    """places: 게임별 등수 (게임 순서대로, 안 뛴 게임은 0). adv: APAC 공식 표시 (direct_advance 등)."""
    r = {"n": name, "r": region, "pts": pts, "g": games, "w": wins, "t4": top4, "out": out}
    if places:
        r["p"] = [x for x in places if x]  # 그 선수가 뛴 게임만 (다른 로비 게임은 빼기)
    if adv and adv not in ("normal", "eliminated"):
        r["adv"] = adv
    return r


def stage_ko(name):
    """MetaTFT 단계 이름(영어, 표기 제각각)을 한국어로: Play Ins -> 플레이인, Day 1 And Day 2 / D1 & 2 -> 스위스, Day 3 -> 3일차."""
    n = name.strip()
    if re.search(r"play[\s-]*ins?", n, re.I):
        return "플레이인"
    if re.search(r"^(days?|d)\s*1\s*(&|and)\s*(day\s*|d)?\s*2$", n, re.I):
        return "스위스"
    m = re.match(r"^(?:day|d)\s*(\d)$", n, re.I)
    if m:
        return f"{m.group(1)}일차"
    return n.title()


def checkmate(games):
    """games: 시간순 [[(이름, 등수)]]. 20점 이상인 채로 1등 하면 우승."""
    pts = defaultdict(int)
    for i, g in enumerate(games, 1):
        for n, pl in g:
            if pl == 1 and pts[n] >= 20:
                return n, i
        for n, pl in g:
            pts[n] += 9 - pl
    return None, len(games)


def table(games, final=False):
    """final=True면 일단 마지막 게임 등수로 가르고, 앞 단계가 있으면 metatft()에서 스위스 순위로 다시 가른다."""
    acc = defaultdict(lambda: [0, 0, 0, 0, 9])
    places = defaultdict(lambda: [0] * len(games))
    for gi, g in enumerate(games):
        for n, pl in g:
            a = acc[n]
            a[0] += 9 - pl
            a[1] += 1
            a[2] += pl == 1
            a[3] += pl <= 4
            a[4] = pl
            places[n][gi] = pl
    rows = [row(n, "", a[0], a[1], a[2], a[3], places=places[n]) | {"last": a[4]} for n, a in acc.items()]
    if final:
        rows.sort(key=lambda r: (-r["pts"], r["last"]))
    else:
        rows.sort(key=lambda r: (-r["pts"], -(2 * r["w"] + r["t4"])))
    return rows


# ---------- APAC 공식 사이트 ----------

def apac_page(slug, lb):
    return get(APAC + f"{slug}/standings?lb={lb}&_rsc=1", {**UA, "RSC": "1"})


def apac_rows(slug, lb, t=None):
    t = t or apac_page(slug, lb)
    objs = [json.loads(m) for m in re.findall(r'(\{"player_id":"[^"]+","rank":\d+.*?"is_eliminated":(?:true|false)\})', t)]
    out = []
    # 게임 번호가 대회 전체로 이어진다 (결승 첫 게임 = 15). 이 단계에 나온 번호만 쓴다
    rounds = sorted({int(k) for o in objs for k, v in (o.get("round_points") or {}).items() if v})
    for o in sorted(objs, key=lambda o: o["rank"]):
        rp = o.get("round_points") or {}
        places = [9 - rp[str(i)] if rp.get(str(i)) else 0 for i in rounds]  # 1등 8점 … 8등 1점
        out.append(row(o["player_name"], (o.get("player_region") or "").lower(), o.get("segment_points", 0), len(rp),
                       o.get("first_place_count", 0), o.get("top4_count", 0), bool(o.get("is_eliminated")), places, o.get("tier")))
    return out


def apac_overview(slug):
    """대회 날짜와 참가자 [(지역, 이름)] (아직 안 한 대회도 참가자는 나와 있다)."""
    t = get(APAC + slug + "?_rsc=1", {**UA, "RSC": "1"})
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})\s*-\s*(\d{1,2})/(\d{1,2})/(\d{4})", t)
    start = end = None
    if m:
        d1, m1, y1, d2, m2, y2 = map(int, m.groups())
        start, end = f"{y1}-{m1:02d}-{d1:02d}", f"{y2}-{m2:02d}-{d2:02d}"
    kids = re.findall(r'"children":"([^"]{1,60})"', t)
    players = []
    if "Players" in kids:
        rest = kids[kids.index("Players") + 1:]
        for a, b in zip(rest[::2], rest[1::2]):
            if not re.fullmatch(r"[A-Z]{2,3}", a):
                break
            players.append([{"OC": "au", "OCE": "au"}.get(a, a.lower()), b])
    return start, end, players


def apac():
    events = defaultdict(list)
    for slug, kind, label in APAC_EVENTS:
        try:
            start, end, players = apac_overview(slug)
            first = apac_page(slug, 0)
            n = len(set(re.findall(r"standings\?lb=(\d+)", first))) or 1  # 리더보드 개수 (없는 번호는 1번을 다시 준다)
            stages = []
            for lb in range(n):
                rows = apac_rows(slug, lb, first if lb == 0 else None)
                if rows and any(r["g"] for r in rows):  # 아직 한 게임도 없는 단계(다음 날 결승 자리)는 뺀다
                    stages.append({"name": "", "table": rows})
                time.sleep(0.3)
        except Exception as e:
            print("APAC 실패", slug, e)
            continue
        final = bool(stages) and len(stages[-1]["table"]) == 8 and kind != "trials"
        for i, s in enumerate(stages):
            s["name"] = "결승" if final and i == len(stages) - 1 else ("스위스" if kind == "tpc" else f"{i + 3}일차" if kind == "trials" else f"{i + 1}부" if len(stages) > 1 else "순위")
            s["final"] = final and i == len(stages) - 1
        done = bool(end) and end < datetime.now(timezone.utc).strftime("%Y-%m-%d")
        champ = stages[-1]["table"][0]["n"] if final and done and stages[-1]["table"][0]["g"] else None
        events[kind].append({"ev": label, "slug": slug, "start": start, "end": end, "stages": stages, "champion": champ,
                             "players": players if not stages else []})
        print("APAC", slug, [(s["name"], len(s["table"])) for s in stages], "우승", champ)
    names = {"tpc": "TPC APAC", "trials": "시험 APAC", "finals": "FINALS APAC"}
    out = []
    for kind, evs in events.items():
        dates = [e for e in evs if e["start"]]
        out.append({"name": f"{names[kind]} S{APAC_SET}", "region": "APAC", "set": APAC_SET, "kind": kind,
                    "start": min((e["start"] for e in dates), default=""), "end": max((e["end"] for e in dates), default=""),
                    "events": evs, "source": "apactft"})
    return out


# ---------- MetaTFT ----------

def display_names(match):
    names = match.get("player_names") or []
    out = {}
    for p in match["data"]["info"]["participants"]:
        g = (p.get("riotIdGameName") or "").strip()
        hit = next((n for n in names if n.lower() == g.lower()), None) or \
            next((n for n in names if n.lower().endswith(" " + g.lower())), None)
        out[p["puuid"]] = hit or g or p["puuid"][:6]
    return out


def event_of(stage):
    s = re.sub(r"\s+", " ", stage.upper()).strip()
    parts = [p.strip() for p in s.split("|")]
    if "FINALS" in parts[0]:
        if "PLAY" in s:
            return "플레이인"
        m = re.search(r"(?:WEEK|W)\s*(\d)", s)
        return f"{m.group(1)}주차" if m and "GRAND" not in s else "2주차 · 그랜드 파이널"
    if len(parts) == 1 and parts[0].startswith("DAY"):
        return "본선"
    m = re.match(r"(?:TFT )?(TPC|TCUP)\s*(\d)", parts[0])
    return f"{m.group(1)} {m.group(2)}" if m else parts[0]


def metatft(skip_apac):
    tours = json.loads(get(API + "esports/tournaments"))["data"]
    out = []
    for t in tours:
        name = t["competition_name"]
        reg = re.search(r"\b(AMER|EMEA|APAC|CN)\b", name.upper())
        region = reg.group(1) if reg else "WORLD"
        st = re.search(r"\bS(\d+)\b", name.upper())
        setn = int(st.group(1)) if st else None
        if skip_apac and region == "APAC" and setn == APAC_SET:
            continue
        try:
            matches = json.loads(get(API + "esports/tournaments/" + urllib.parse.quote(name) + "/matches"))["data"]
        except Exception as e:
            print("MetaTFT 실패", name, e)
            continue
        time.sleep(0.4)
        by = defaultdict(lambda: defaultdict(list))  # 이벤트 -> 단계 -> 게임
        for m in matches:
            disp = display_names(m)
            g = [(disp[p["puuid"]], p["placement"]) for p in m["data"]["info"]["participants"]]
            by[event_of(m["stage_name"])][m["stage_name"]].append((m["data"]["info"].get("gameCreation", 0), g))
        dates = {s["name"]: (s["date_start"], s["date_end"]) for s in t["stages"]}
        events = []
        for ev, stages in by.items():
            sts = []
            for sn, games in sorted(stages.items(), key=lambda x: min(g[0] for g in x[1])):
                games = [g for _, g in sorted(games)]
                players = {n for g in games for n, _ in g}
                final = len(players) == 8 and ("GRAND" in sn.upper() or "DAY 3" in sn.upper() or ev == "본선")
                s = {"name": "결승" if final else stage_ko(re.sub(r"^.*\|\s*", "", sn).strip()), "final": final, "table": table(games, final)[:32]}
                if final and sts:  # 결승 동점은 앞 단계(스위스) 순위로 (스페이스 갓 크라운 공식 순위 두 쌍과 일치)
                    prev = {r["n"]: i for i, r in enumerate(sts[-1]["table"])}
                    s["table"].sort(key=lambda r: (-r["pts"], prev.get(r["n"], 99)))
                if final:
                    champ, at = checkmate(games)
                    s["champion"], s["decided_at"] = champ, at
                    if champ:  # 우승자를 맨 위로
                        s["table"].sort(key=lambda r: r["n"] != champ)
                sts.append(s)
            span = [dates.get(sn) for sn in stages if dates.get(sn)]
            start = min((d[0] for d in span), default=t["date_start"])[:10]
            end = max((d[1] for d in span), default=t["date_end"])[:10]
            champ = next((s.get("champion") for s in reversed(sts) if s.get("final")), None)
            events.append({"ev": ev, "start": start, "end": end, "stages": sts, "champion": champ})
        events.sort(key=lambda e: e["start"])
        kind = "crown" if "TCROWN" in name.upper() else "finals" if "FINALS" in name.upper() else "tpc" if "TPC" in name.upper() else "cup"
        order = official_order(kind, setn)
        if order:  # 결승(마지막 8명) 순위를 공식 순위로
            for e in events:
                for s_ in e["stages"]:
                    if s_.get("final"):
                        s_["table"] = apply_official(s_["table"], order[:8])
                        s_["champion"] = s_["table"][0]["n"]
                        s_["official"] = True
                e["champion"] = next((s_["champion"] for s_ in reversed(e["stages"]) if s_.get("final")), e["champion"])
        out.append({"name": name, "region": region, "set": setn, "kind": kind, "start": t["date_start"][:10],
                    "end": t["date_end"][:10], "events": events, "source": "metatft"})
        print("MetaTFT", name, [(e["ev"], e["champion"]) for e in events])
    return out


# 공식 최종 순위 (Liquipedia 상금표 순서). 게임 기록만으로는 동점 처리가 공식과 다를 때가 있다
OFFICIAL = {("crown", 17): "lq_Space_Gods_Tacticians_Crown.json", ("crown", 18): "lq_Enchanted_Wilds_Tacticians_Crown.json"}


def official_order(kind, setn):
    f = RAW / OFFICIAL.get((kind, setn), "_")
    if not f.exists():
        return []
    w = json.loads(f.read_text())["parse"]["wikitext"]["*"]
    i = w.find("SoloPrizePool")
    return re.findall(r"SoloOpponent\|([^}|]+)", w[i:]) if i >= 0 else []


def apply_official(table, order, key=None):
    """표를 공식 순서대로. 이름은 팀 태그가 붙어 있을 수 있어 끝부분으로 맞춘다."""
    def rank(n):
        if key:
            k = key(n)
            return next((i for i, o in enumerate(order) if k == o or (k.endswith(o) and len(o) >= 3)), 99)
        low = n.lower()
        for i, o in enumerate(order):
            if low == o.lower() or low.endswith(" " + o.lower()):
                return i
        return 99
    if key:  # 이름이 안 맞는 사람(예: Liquipedia JosueDeleted = MetaTFT MJS Deleted)은 남은 공식 자리에 점수 순으로
        rk = {id(r): rank(r["n"]) for r in table}
        free = [i for i in range(len(order)) if i not in rk.values()]
        for r in sorted([r for r in table if rk[id(r)] == 99], key=lambda r: -(r.get("pts") or 0)):
            if free:
                rk[id(r)] = free.pop(0)
        return sorted(table, key=lambda r: rk[id(r)])
    return sorted(table, key=lambda r: rank(r["n"]))


# 역대 월즈 (Liquipedia, data/esports/worlds/ + 크라운 페이지). 세트 번호 순서
WORLDS = [(3, "Galaxies"), (4, "Fates"), (5, "Reckoning"), (6, "Gizmos & Gadgets"), (7, "Dragonlands"),
          (8, "Monsters Attack!"), (9, "Runeterra Reforged"), (10, "Remix Rumble"), (11, "Inkborn Fables"),
          (12, "Magic n' Mayhem"), (13, "Into the Arcane"), (14, "Cyber City"), (15, "K.O. Coliseum"),
          (16, "Lore & Legends"), (17, "Space Gods"), (18, "Enchanted Wilds"), (19, "Prismatic Tour")]


def sheet_stages(setn):
    """SCHEDULE.sheet(공식 결과 시트)의 'Days 1&2 - Leaderboard'·'Day 3 - Leaderboard'로 역대 월즈 단계 기록.
    칸 값은 그 게임 점수(8~1, '-'는 안 뜀) -> 등수 = 9 - 점수. 1·2일차는 fmt.rounds대로 칸을 묶는다."""
    import csv, io
    sc = next((x for x in SCHEDULE if x.get("set") == setn and x.get("sheet")), None)
    if not sc: return []
    base = "https://docs.google.com/spreadsheets/d/e/" + sc["sheet"]
    import html
    tabs = dict((html.unescape(n).replace("\\x26", "&"), g) for n, g in re.findall(r'\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)', get(base + "/pubhtml")))
    def read(pat):
        g = next((v for k, v in tabs.items() if re.search(pat, k, re.I)), None)
        if not g: return []
        rows = list(csv.reader(io.StringIO(get(base + f"/pub?gid={g}&single=true&output=csv"))))
        hi = next(i for i, r in enumerate(rows) if "Name" in r)
        h = rows[hi]; ni, pi = h.index("Name"), h.index("Points")
        rc = [i for i, x in enumerate(h) if re.match(r"Round \d+$", x)]
        out = []
        for r in rows[hi + 1:]:
            if len(r) <= ni or not r[ni].strip(): continue
            p = [9 - int(r[i]) if i < len(r) and r[i].strip().isdigit() else 0 for i in rc]
            while p and not p[-1]: p.pop()
            out.append({"n": r[ni].strip(), "f": "", "p": p, "pts": int(r[pi]) if r[pi].strip().lstrip("-").isdigit() else 0})
        return out
    d12, d3 = read(r"days?\s*1.*leaderboard"), read(r"day\s*3.*leaderboard")
    if not d12 or not d3: return []
    for i, r in enumerate(d12): r["pos"] = i
    fin = {r["n"].lower() for r in d3}
    for r in d12:
        if r["n"].lower() in fin: r["adv"] = "결승 진출"
    d12.sort(key=lambda r: (r["n"].lower() not in fin, 0 if r["n"].lower() in fin else -len(r["p"]), -r["pts"]))
    groups = [[x["n"], x["g"]] for x in (sc.get("fmt") or {}).get("rounds", [])]
    return [{"name": "스위스", "rows": d12, "groups": groups}, {"name": "결승", "rows": d3}]

def worlds(known=None):
    """known: 다른 데서 모은 이름 -> 국적. 최근 크라운 페이지는 국적 칸이 비어 있어서 같이 쓴다."""
    def file_for(name):
        key = re.sub(r"[^A-Za-z0-9]", "_", name.replace("&", "and").replace("'", "").replace("!", ""))
        cands = list((RAW / "worlds").glob(key + "*.json")) + list(RAW.glob("lq_" + name.replace(" ", "_").replace("'", "") + "_Tacticians_Crown.json"))
        return cands[0] if cands else None
    # 1차: 모든 월즈 페이지에서 국적 모으기
    allnat = dict(known or {})
    allnat.update(nat_votes()); allnat.update(MANUAL_FLAGS)  # 페이지 전부에서 가장 많이 나온 국기, 틀린 건 손으로 고친 것
    low = {k.lower(): v for k, v in allnat.items()}
    out = []
    for setn, name in WORLDS:
        f = file_for(name)
        if not f:
            continue
        try:
            w = json.loads(f.read_text())["parse"]["wikitext"]["*"]
        except Exception:
            continue
        w = re.sub(r"<!--.*?-->", "", w, flags=re.S)
        get_ = lambda k: (re.search(r"\|" + k + r"=([^\n|]*)", w) or [None, ""])[1].strip()

        def opp(arg):  # SoloOpponent 인자: 이름은 '='가 없는 첫 칸, flag는 어디에 있든
            parts = [x.strip() for x in arg.split("|")]
            name = next((x for x in parts if x and "=" not in x), "")
            fl = next((x.split("=", 1)[1] for x in parts if x.startswith("flag=")), "")
            return name, fl
        nat = {}
        for _, flag, n in re.findall(r"\|p(\d+)flag=\s*([a-z]{2})\s*\|p\1=\s*([^|\n}]+)", w):
            nat[n.strip()] = flag
        for num, n, flag in re.findall(r"\|p(\d+)=\s*([^|\n}]+?)\s*\|p\1flag=\s*([a-z]{2})", w):
            nat.setdefault(n.strip(), flag)
        for arg in re.findall(r"SoloOpponent\|([^{}]*)\}\}", w):
            n, fl = opp(arg)
            if n and fl:
                nat.setdefault(n, fl)
        # 아직 안 끝난 월즈는 빼고 (2026-11-14: 진행 중 Liquipedia 상금표에 1일차 탈락자 33~40위부터 채워져, 33위 Cynarr가 '우승'으로 올라갔었음)
        if (get_("edate") or "9999") >= datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d"):
            continue
        i = w.find("PrizePool")
        pool = w[i:] if i >= 0 else ""
        j = pool.find("\n==")  # 상금표 섹션까지만
        pool = pool[:j] if j > 0 else pool
        placed = []
        for arg in re.findall(r"SoloOpponent\|([^{}]*)\}\}", pool):
            n, fl = opp(arg)
            if n:
                placed.append([n, fl or nat.get(n, "") or low.get(n.lower(), "")])
        city = ", ".join(x for x in (get_("city"), get_("city2"), get_("city3")) if x and x != "World") or get_("location")
        out.append({"set": setn, "name": name, "start": get_("sdate"), "end": get_("edate"), "prize": get_("prizepoolusd"),
                    "city": city, "top": placed[:8],
                    "kr": [[i + 1, n] for i, (n, fl) in enumerate(placed) if fl == "kr"]})
        # 단계별 전체 기록 (scripts/fetch_worlds.py로 받은 Liquipedia 결과 페이지): 선수마다 게임별 등수, 국적은 여기서 채운다
        try:
            import worlds_detail as WD
            st = WD.for_set(setn)
            for x in st:
                for r in x["rows"]:
                    r["f"] = r.get("f") or nat.get(r["n"], "") or low.get(r["n"].lower(), "")
            if not st:
                st = sheet_stages(setn)  # 막 끝난 월즈: Liquipedia가 아직이면 공식 결과 시트로
                if st:  # 순위도 공식 시트대로 (결승 순위 → 나머지는 1·2일차 순위). Liquipedia 페이지는 결과 전이면 참가자 목록일 뿐
                    fin = st[1]["rows"]; fl = {r["n"].lower() for r in fin}
                    rest = sorted((r for r in st[0]["rows"] if r["n"].lower() not in fl), key=lambda r: r["pos"])
                    order = [r["n"] for r in fin] + [r["n"] for r in rest]
                    def natf(n):  # 팀 태그가 붙은 이름(TLG diaomei)은 뒤쪽 이름으로
                        ws = n.split()
                        return next((low.get(" ".join(ws[i:]).lower(), "") for i in range(len(ws)) if low.get(" ".join(ws[i:]).lower())), nat.get(n, ""))
                    out[-1]["top"] = [[n, natf(n)] for n in order[:8]]
                    out[-1]["kr"] = [[i + 1, n] for i, n in enumerate(order) if natf(n) == "kr"]
            for x in st:
                for r in x["rows"]:
                    r["f"] = r.get("f") or nat.get(r["n"], "") or low.get(r["n"].lower(), "")
            if st:
                out[-1]["stages"] = st
        except Exception as e:
            print("역대 월즈 기록 실패", setn, e)
    return out


COUNTRY = {"united states": "us", "canada": "ca", "brazil": "br", "mexico": "mx", "argentina": "ar", "chile": "cl", "peru": "pe",
           "colombia": "co", "uruguay": "uy", "costa rica": "cr", "venezuela": "ve", "ecuador": "ec", "guatemala": "gt", "paraguay": "py",
           "bolivia": "bo", "dominican republic": "do", "puerto rico": "pr", "france": "fr", "germany": "de", "spain": "es",
           "united kingdom": "gb", "poland": "pl", "turkey": "tr", "türkiye": "tr", "finland": "fi", "sweden": "se", "denmark": "dk",
           "norway": "no", "netherlands": "nl", "belgium": "be", "italy": "it", "portugal": "pt", "czech republic": "cz", "czechia": "cz",
           "romania": "ro", "greece": "gr", "russia": "ru", "ukraine": "ua", "austria": "at", "switzerland": "ch", "hungary": "hu",
           "serbia": "rs", "croatia": "hr", "bulgaria": "bg", "lithuania": "lt", "latvia": "lv", "estonia": "ee", "israel": "il",
           "morocco": "ma", "egypt": "eg", "south africa": "za", "saudi arabia": "sa", "united arab emirates": "ae", "ireland": "ie",
           "slovakia": "sk", "slovenia": "si", "belarus": "by", "kazakhstan": "kz", "georgia": "ge", "armenia": "am", "tunisia": "tn",
           "algeria": "dz", "lebanon": "lb", "jordan": "jo", "kuwait": "kw", "qatar": "qa", "south korea": "kr", "korea": "kr",
           "japan": "jp", "taiwan": "tw", "china": "cn", "vietnam": "vn", "hong kong": "hk", "singapore": "sg", "australia": "au",
           "new zealand": "nz", "kyrgyzstan": "kg", "philippines": "ph", "thailand": "th", "malaysia": "my", "indonesia": "id", "macau": "mo"}


def lq_player_flags(tours, have, extra=()):
    """국적이 비어 있는 이번 세트 선수를 Liquipedia 선수 페이지(한 번에 50명)에서 찾는다. data/esports/lq_players.json에 저장."""
    cache_f = RAW / "lq_players.json"
    cache = json.loads(cache_f.read_text()) if cache_f.exists() else {}
    names = set()
    for t in tours:
        if t.get("set") != APAC_SET or t.get("region") == "APAC":
            continue
        for e in t["events"]:
            for st in e["stages"]:
                for r in st["table"]:
                    n = r["n"].split(" ")[-1] if " " in r["n"] and r["n"].split(" ")[0].isupper() else r["n"]  # 팀 태그 떼기
                    if n not in have and r["n"] not in have and n not in cache:
                        names.add(n)
    names |= {n for n in extra if n not in have and n not in cache}
    names = sorted(names)
    for i in range(0, len(names), 50):
        if i:
            time.sleep(31)
        batch = names[i:i + 50]
        try:
            u = "https://liquipedia.net/tft/api.php?" + urllib.parse.urlencode({"action": "query", "titles": "|".join(batch), "prop": "revisions",
                                                                                "rvprop": "content", "rvslots": "main", "redirects": 1, "format": "json"})
            d = json.loads(get(u, {"User-Agent": "lolche-note/1.0 (personal study app)"}))
        except Exception as e:
            print("Liquipedia 선수 멈춤", e)
            break
        q = d.get("query", {})
        back = {x["to"]: x["from"] for x in q.get("redirects", [])} | {x["to"]: x["from"] for x in q.get("normalized", [])}
        for pg in q.get("pages", {}).values():
            title = pg.get("title", "")
            src = back.get(title, title)
            txt = ((pg.get("revisions") or [{}])[0].get("slots", {}).get("main", {}) or {}).get("*", "")
            m = re.search(r"\|\s*country\s*=\s*([^|\n}]+)", txt)
            v = m.group(1).strip().lower() if m else ""
            cache[src] = v if re.fullmatch(r"[a-z]{2}", v) else COUNTRY.get(v, "")  # 국가 이름 대신 코드(ca)로 적힌 페이지도 있음
        for n in batch:
            cache.setdefault(n, "")
        print(f"Liquipedia 선수 {len(batch)}명 국적 조회")
    cache_f.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    return cache


# Liquipedia에 아직 없는 선수 국적 (공식 결과 시트 선수 목록에서 확인)
# Cangshan: 월즈 공식 시트 중국 자리에 CSFX 대신 나옴 (2026-11-14, Liquipedia 참가자 표는 아직 CSFX)
# Liquipedia 국기가 틀린 선수 (근거 같이)
# summertimer: Liquipedia 대회 표 6곳이 kr인데 일본인이다 (ZETA DIVISION 보도자료 "日本人プレイヤー", 라이엇·외신 "일본의 두 번째 월즈 우승", 2026-11-15 사용자 지적)
MANUAL_FLAGS = {"Cangshan": "cn", "summertimer": "jp"}



def nat_votes():
    """Liquipedia 페이지 전부(대회·월즈 상세)에서 선수 국기를 모아 가장 많이 나온 것.
    먼저 본 것을 쓰면 지역 예선 명단(서버 지역 국기)에 끌려간다 (summertimer: 대회 6곳 kr, APAC 예선 명단 1곳 jp → jp로 나왔음)."""
    from collections import Counter, defaultdict
    c = defaultdict(Counter)
    files = list(RAW.glob("lq_*.json")) + list((RAW / "worlds").glob("*.json")) + list((RAW / "worlds_detail").glob("*.json"))
    for f in files:
        try:
            d = json.loads(f.read_text()); w = d["parse"]["wikitext"]["*"] if "parse" in d else d.get("wikitext", "")
        except Exception:
            continue
        if not w: continue
        for a in re.findall(r"SoloOpponent\|([^{}]*)\}\}", w):
            parts = [x.strip() for x in a.split("|")]
            n = next((x for x in parts if x and "=" not in x), "")
            fl = next((x.split("=", 1)[1] for x in parts if x.startswith("flag=") and len(x) == 7 and x != "flag=xx"), "")
            if n and fl: c[n][fl] += 1
        for _, fl, n in re.findall(r"\|p(\d+)flag=\s*([a-z]{2})\s*\|p\1=\s*([^|\n}]+)", w): c[n.strip()][fl] += 1
        for _, n, fl in re.findall(r"\|p(\d+)=\s*([^|\n}]+?)\s*\|p\1flag=\s*([a-z]{2})", w): c[n.strip()][fl] += 1
        for n, fl in re.findall(r"\{\{[Pp]layer\|([^|}]+)\|flag=([a-z]{2})", w): c[n.strip()][fl] += 1
        for n, fl in re.findall(r"\|player=([^|}]+)\|flag=([a-z]{2})", w): c[n.strip()][fl] += 1
        for _, n, fl in re.findall(r"\|\s*p(\d+)player\s*=\s*([^|\n]+?)\s*\|\s*p\1flag\s*=\s*([a-z]{2})", w): c[n.strip()][fl] += 1
    for v in c.values(): v.pop("xx", None)  # xx = 국적 모름
    return {n: v.most_common(1)[0][0] for n, v in c.items() if v}

def flags(tours, extra=()):
    out = dict(MANUAL_FLAGS)
    for k, v in nat_votes().items(): out.setdefault(k, v)  # 국적은 Liquipedia가 정확하다 (APAC 사이트 코드는 서버 지역일 때가 있음)
    out.update({k: v for k, v in lq_player_flags(tours, out, extra).items() if v and k not in out})
    lq = set(out)
    for t in tours:  # 나머지는 APAC 사이트 지역 코드 (Liquipedia에 있는 선수는 팀 태그가 붙어도 Liquipedia대로)
        for e in t["events"]:
            for r in [r for s in e["stages"] for r in s["table"]] + [{"n": n, "r": c} for c, n in e.get("players", [])]:
                low = r["n"].lower()
                if r["r"] and not any(low == k.lower() or low.endswith(" " + k.lower()) for k in lq):
                    out.setdefault(r["n"], {"oc": "au", "oce": "au"}.get(r["r"], r["r"]))
    return out


# ---------- 이번 월즈 진출자 (Liquipedia <세트>/Tacticians Crown/Qualification) ----------
# 섹션마다 진출 경로가 다르다: CN TPC 우승 / 컵 우승 (지역마다) / 프로 포인트 1위 / 지역별 결승 상위 N명.
# {{Abbr/AQ}} = 이미 다른 길로 진출 → 그 결승 자리는 다음 순위로 내려간다.
CUP_KO = {"Riftbeast": "협곡야수 컵", "Elderwood": "나무정령 컵", "Blossom": "개화 컵",
          "Dark Star": "다크 스타 컵", "Stargazer": "별지기 컵", "Anima": "애니마 컵"}
RF_N = {"AMER": 5, "EMEA": 5, "APAC": 7, "TOC": 4, "JOC": 4}


def lq_page_fresh(pg, max_h=20):
    """Liquipedia 페이지를 하루 한 번 정도 새로 받는다 (파일 안 fetched 시각 기준). 막히면 있는 걸 쓴다."""
    f = RAW / ("lq_" + pg.replace(" ", "_").replace("/", "_").replace("&", "and").replace("'", "") + ".json")
    old = json.loads(f.read_text()) if f.exists() else None
    at = (old or {}).get("fetched")
    if old and at and (datetime.now(timezone.utc) - datetime.fromisoformat(at)).total_seconds() < max_h * 3600:
        return old
    try:
        u = "https://liquipedia.net/tft/api.php?" + urllib.parse.urlencode({"action": "parse", "page": pg, "format": "json", "prop": "wikitext"})
        d = json.loads(get(u, {"User-Agent": "lolche-note/1.0 (personal study app)"}))
        if "parse" in d:
            d["fetched"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
            f.write_text(json.dumps(d, ensure_ascii=False))
            print("Liquipedia 받음", pg)
            return d
    except Exception as e:
        print("Liquipedia 멈춤", pg, e)
    return old


# Liquipedia 이름 -> 공식 시트(방송) 이름. 같은 선수인데 이름이 다른 경우 (Liquipedia 선수 문서 ids로 확인)
SHEET_ALIAS = {"CSFX": "Cangshan", "JosueDeleted": "MJS Deleted"}


def sheet_players(sch):
    """공식 결과 시트의 선수 목록 탭(BROADCAST NAME). 없으면 []"""
    key = (sch or {}).get("sheet")
    if not key:
        return []
    base = f"https://docs.google.com/spreadsheets/d/{'e/' if key.startswith('2PACX') else ''}{key}"
    try:
        hv = get(base + ("/pubhtml" if key.startswith("2PACX") else "/htmlview"))
        gid = next((g for n, g in re.findall(r'\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)', hv) if re.search(r"player", n, re.I)), None)
        if not gid:
            return []
        import csv, io
        rows = list(csv.reader(io.StringIO(get(base + (f"/pub?output=csv&gid={gid}" if key.startswith("2PACX") else f"/export?format=csv&gid={gid}")))))
        return [r[0].strip() for r in rows[1:] if r and r[0].strip()]
    except Exception as e:
        print("공식 시트 선수 목록 실패", e)
        return []


def crown_roster():
    sch = next((x for x in SCHEDULE if x["set"] == APAC_SET), None)
    name = dict(WORLDS).get(APAC_SET)
    if not sch or not name or datetime.now().date().isoformat() > sch["end"]:
        return None
    q = lq_page_fresh(f"{name}/Tacticians Crown/Qualification")
    if not q:
        return None
    if (datetime.now(timezone.utc) - datetime.fromisoformat(q.get("fetched") or "2000-01-01T00:00+00:00")).total_seconds() < 120:
        time.sleep(31)  # 방금 받았으면 30초 쉬고 (Liquipedia 429)
    cp = lq_page_fresh(f"{name}/Tacticians Crown")
    w = re.sub(r"<!--.*?-->", "", q["parse"]["wikitext"]["*"], flags=re.S)
    part, part_reg = [], {}  # 크라운 본 페이지 참가자 이름 (Qualification 쪽 이름이 줄임일 때가 있음: wasian / wasianiverson)
    if cp:
        cw = cp["parse"]["wikitext"]["*"]
        i = cw.find("==Participants==")
        part = [x.strip() for x in re.findall(r"^\|([^{|=\n][^|\n]*)$", cw[i:cw.find("==Results==", i)], flags=re.M) if x.strip()]
        # 본 페이지 지역별 명단 (Qualification이 늦게 고쳐질 때가 있음: JOC 4명이 TBD로 남거나, 컵 지역 표기가 틀림)
        for sec in re.split(r"\|\{\{ParticipantSection", cw[i:cw.find("==Results==", i)])[1:]:
            rg = (re.search(r"Banner/(\w+)", sec) or [None, ""])[1]
            for x in re.findall(r"^\|([^{|=\n][^|\n]*)$", sec, flags=re.M):
                if x.strip():
                    part_reg[x.strip().lower()] = rg
    players, pending, by = [], [], {}
    for sec in re.split(r"\|\{\{ParticipantSection", w)[1:]:
        title = re.search(r"title=(.*?)\|count", sec, re.S).group(1)
        count = int(re.search(r"count=(\d+)", sec).group(1))
        ents = []
        for line in sec.split("\n")[1:]:
            line = line.strip()
            if not line.startswith("|") or line.startswith("|}"):
                continue
            m = re.match(r"\|\s*([^|]*?)\s*(\|p\d+note=(.*?))?(\|p\d+dq=1)?\s*$", line)
            if not m:
                continue
            nm, note, dq = m.group(1).strip(), (m.group(3) or ""), bool(m.group(4))
            label = (re.search(r"\|([^\]]+)\]\]", note) or [None, note])[1]
            ents.append({"n": "" if (nm or "").strip().upper() == "TBD" else nm, "label": label.strip(), "dq": dq})  # 'TBD' = 아직 안 정해진 자리
        if "Regional Finals" in title:
            reg = next((r for r in RF_N if r in title), "")
            if not any(e["n"] for e in ents):
                pending.append({"reg": "CN" if reg in ("TOC", "JOC") else reg, "how": f"{'중국 ' + reg if reg in ('TOC', 'JOC') else reg} 지역 결승 상위 {count}명", "n": count})
                continue
            nt = sum(1 for e in ents if not e["n"])
            if nt:  # 일부만 정해진 결승: 빈 자리는 미정으로
                pending.append({"reg": "CN" if reg in ("TOC", "JOC") else reg, "how": f"{'중국 ' + reg if reg in ('TOC', 'JOC') else reg} 지역 결승 {nt}자리", "n": nt})
            for i, e in enumerate(ents):
                if not e["n"]:
                    continue
                rk = int((re.search(r"#(\d+)", e["label"]) or [0, i + 1])[1])
                if e["dq"]:
                    by.setdefault(e["n"].lower(), []).append(("aq", f"{reg} 지역별 결승 {rk}위", rk))
                    continue
                players.append({"n": e["n"], "reg": "CN" if reg in ("TOC", "JOC") else reg, "path": "rf", "rk": rk,
                                "tag": f"지역 결승 {rk}위", "how": f"{reg} 지역별 결승 {rk}위" + (f" (상위 {count}명 안에 이미 진출한 선수가 있어서 자리가 내려옴)" if rk > count else "")})
        else:
            cup = next((k for k in CUP_KO if k in title), "")
            for e in ents:
                if not e["n"]:
                    continue
                reg = (e["label"].split(" ") or [""])[0]
                if "CN TPC" in title:
                    players.append({"n": e["n"], "reg": "CN", "path": "tpc", "tag": f"{reg} 서킷 우승", "how": f"중국 {reg} 프로 서킷 우승"})
                elif cup:
                    players.append({"n": e["n"], "reg": reg, "path": "cup", "tag": f"{CUP_KO[cup]} 우승", "how": f"{'중국' if reg == 'CN' else reg} 프로 서킷 {CUP_KO[cup]} 우승"})
                elif "Pro Point" in title:
                    players.append({"n": e["n"], "reg": reg, "path": "pp", "tag": "포인트 1위", "how": f"{reg} 프로 포인트 1위"})
    # 중복 진출: 첫 경로로 들어가고, 나중 자리는 다음 순위에게
    seen = {}
    for p in players:
        k = p["n"].lower()
        if k in seen:
            seen[k].setdefault("also", []).append(p["how"])
            p["dup"] = True
        else:
            seen[k] = p
    players = [p for p in players if not p.get("dup")]
    for k, items in by.items():
        p = seen.get(k)
        if p:
            for _, txt, rk in items:
                p.setdefault("also", []).append(f"{txt}도 했지만 이미 진출 → 그 자리는 다음 순위에게")
    for p in players:  # 크라운 페이지 이름(풀네임)도 같이 (기록·국적 맞출 때)
        lo = p["n"].lower()
        al = [x for x in part if x.lower() != lo and (x.lower().startswith(lo) or lo.startswith(x.lower()))]
        if al:
            p["al"] = al
        p.pop("dup", None)
    # 본 페이지 지역을 따르고, 미정 자리는 본 페이지에만 있는 이름으로 채운다
    def reg_of(nm):
        lo = nm.lower()
        return part_reg.get(lo) or next((r for k, r in part_reg.items() if k.startswith(lo) or lo.startswith(k)), None)
    for p in players:
        r = reg_of(p["n"])
        if r and r != p["reg"]:
            p["reg"] = r
    known = {p["n"].lower() for p in players} | {a.lower() for p in players for a in p.get("al", [])} | set(by)
    # 같은 선수의 다른 이름도 아는 이름으로 (2026-11-15: Liquipedia 본 페이지가 CSFX를 CangShan으로 바꿔, 새 선수로 보고 미정 자리에 넣는 바람에 HangHang이 빠졌음)
    for a, b2 in SHEET_ALIAS.items():
        if a.lower() in known or b2.lower() in known:
            known |= {a.lower(), b2.lower()}
    for x in pending:
        extra = [nm for nm in part if part_reg.get(nm.lower()) == x["reg"] and nm.lower() not in known][:x["n"]]
        for nm in extra:
            players.append({"n": nm, "reg": x["reg"], "path": "rf", "tag": "지역 결승 진출", "how": x["how"] + "으로 진출"})
            known.add(nm.lower())
        x["n"] -= len(extra)
    pending = [x for x in pending if x["n"] > 0]
    # 공식 결과 시트가 있으면 방송 이름(팀 태그 포함)으로 맞춘다: Liquipedia 이름과 다를 때가 있음
    # (CSFX = Cangshan 苍山负雪i, JosueDeleted = MJS Deleted, 2026-11-14). 원래 이름은 al(다른 이름)에 남긴다
    official = sheet_players(sch)
    if official:
        nk = lambda x: re.sub(r"[^a-z0-9]", "", (x or "").lower())
        for p in players:
            cands = [p["n"]] + p.get("al", []) + [k for k, v in SHEET_ALIAS.items() if v.lower() == p["n"].lower()] + ([SHEET_ALIAS[p["n"]]] if p["n"] in SHEET_ALIAS else [])
            hit = next((o for o in official for c in cands if nk(o) == nk(c) or nk(o).endswith(nk(c)) or nk(c) == nk(SHEET_ALIAS.get(o, ""))), None)
            if not hit:
                hit = next((o for o in official for c in cands if SHEET_ALIAS.get(c, "").lower() == o.lower()), None)
            if hit and hit != p["n"]:
                p["al"] = sorted(set(p.get("al", []) + [p["n"]]))
                p["n"] = hit
    order = {"AMER": 0, "EMEA": 1, "APAC": 2, "CN": 3}
    slots = {r: sum(1 for p in players if p["reg"] == r) + sum(x["n"] for x in pending if x["reg"] == r) for r in order}
    return {"set": APAC_SET, "name": sch["name"], "label": sch.get("label", ""), "start": sch["start"], "end": sch["end"],
            "players": sorted(players, key=lambda p: order.get(p["reg"], 9)), "pending": pending, "slots": slots,
            "updated": (q.get("fetched") or "")}


# ---------- Liquipedia 공식 최종 순위로 결승 맞추기 ----------
# data/esports/lq_*.json (Liquipedia wikitext). 결승 순위(상금표 순서)·우승자를 공식으로 덮어쓰고,
# MetaTFT에 결승 게임이 아예 없는 대회(예: AMER 지역 결승 S18)는 공식 순위로 결승 표를 만든다 (게임별 점수는 없음).

def norm(n):
    return re.sub(r"[^0-9a-z가-힣]", "", (n or "").lower())


def lq_pages():
    sets = {name: n for n, name in WORLDS}
    out = []
    for f in RAW.glob("lq_*.json"):
        try:
            d = json.loads(f.read_text())["parse"]
        except Exception:
            continue
        title = d.get("title", "")
        w = (d.get("wikitext") or {}).get("*", "")
        if not w:
            continue
        setn = next((n for name, n in sets.items() if title.startswith(name + "/")), None)
        region = next((r for r in ("AMER", "EMEA", "APAC", "CN") if f"/{r}/" in title), None)
        sd = re.search(r"\|sdate=\s*(\d{4}-\d{2}-\d{2})", w)
        ed = re.search(r"\|edate=\s*(\d{4}-\d{2}-\d{2})", w)
        i = w.find("SoloPrizePool")
        order = re.findall(r"SoloOpponent\|([^}|]+)", w[i:]) if i >= 0 else []
        if setn and region and ed and order:
            out.append({"title": title, "set": setn, "region": region, "start": sd.group(1) if sd else ed.group(1), "end": ed.group(1),
                        "order": [o.strip() for o in order]})
    return out


def lq_point_order():
    """Liquipedia 프로 포인트 페이지의 최종 순서 (qualified -> up -> stay). {"S18|APAC": [이름, ...]}"""
    sets = {name: n for n, name in WORLDS}
    out = {}
    for f in RAW.glob("lq_*_Pro_Points.json"):
        try:
            d = json.loads(f.read_text())["parse"]
        except Exception:
            continue
        title, w = d.get("title", ""), re.sub(r"<!--.*?-->", "", d["wikitext"]["*"], flags=re.S)
        setn = next((n for name, n in sets.items() if title.startswith(name + "/")), None)
        region = next((r for r in ("AMER", "EMEA", "APAC", "CN") if f"/{r}/" in title), None)
        i = w.find("Point standings")
        w = w[i:] if i >= 0 else ""
        names = []
        for key in ("qualified", "up", "stay"):
            names += [b.strip() for a, b in sorted((int(a), b) for a, b in re.findall(rf"\|{key}(\d+)=([^|\n]+)", w))]
        if setn and region and len(names) >= 28:  # 순위표가 다 적힌 페이지만
            out[f"S{setn}|{region}"] = names
    return out


def lq_fetch_missing():
    """이번 세트 지역 결승·TPC 컵·프로 포인트 페이지가 data/esports/에 없으면 받아 둔다 (30초에 한 번, 막히면 그만)."""
    name = dict(WORLDS).get(APAC_SET)
    if not name:
        return
    pages = [f"{name}/{r}/Regional Finals" for r in ("AMER", "EMEA", "APAC")]
    pages += [f"{name}/TFT Pro Circuit/{r}/Pro Points" for r in ("AMER", "EMEA", "APAC")]
    pages += [f"{name}/TFT Pro Circuit/{r}/{c} Cup" for r in ("AMER", "EMEA", "APAC") for c in CUPS.get(APAC_SET, [])]
    first = True
    for pg in pages:
        f = RAW / ("lq_" + pg.replace(" ", "_").replace("/", "_").replace("&", "and") + ".json")
        if f.exists():
            continue
        if not first:
            time.sleep(31)
        first = False
        try:
            u = "https://liquipedia.net/tft/api.php?" + urllib.parse.urlencode({"action": "parse", "page": pg, "format": "json", "prop": "wikitext"})
            d = json.loads(get(u, {"User-Agent": "lolche-note/1.0 (personal study app)"}))
            if "parse" in d:
                f.write_text(json.dumps(d, ensure_ascii=False))
                print("Liquipedia 받음", pg)
        except Exception as e:
            print("Liquipedia 멈춤", pg, e)
            return


CUPS = {18: ["Elderwood", "Blossom", "Riftbeast"], 17: ["Dark Star", "Stargazer", "Anima"]}


def apply_liquipedia(tours):
    pages = lq_pages()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for t in tours:
        if t["kind"] not in ("finals", "tpc"):
            continue
        known = {}  # 표에 나온 이름(팀 태그 포함)으로 보여주려고
        for e in t["events"]:
            for s in e["stages"]:
                for r in s["table"]:
                    known.setdefault(norm(r["n"]), r["n"])

        def disp(o):
            k = norm(o)
            return known.get(k) or next((v for kk, v in known.items() if kk.endswith(k) and len(k) >= 3), o)

        for e in t["events"]:
            pg = next((p for p in pages if p["region"] == t["region"] and p["set"] == t["set"]
                       and p["start"] <= (e["end"] or e["start"]) and (e["start"] or e["end"]) <= p["end"]
                       and (t["kind"] != "finals" or e is t["events"][-1])), None)
            if not pg:
                continue
            top = [disp(o) for o in pg["order"][:8]]
            fin = next((s for s in e["stages"] if s.get("final")), None)
            if fin:
                fin["table"] = apply_official(fin["table"], [norm(x) for x in top], key=norm)
                fin["official"] = True
                fin["champion"] = fin["table"][0]["n"]
                e["champion"] = fin["champion"]
            elif pg["end"] < today:
                # 결승 게임 기록이 없음 → 공식 순위만으로 결승 표
                stage = {"name": "결승", "final": True, "official": True, "lq": True,
                         "table": [row(n, "", None, None, None, None) for n in top], "champion": top[0]}
                if t["kind"] == "finals" and "그랜드" not in e["ev"]:
                    t["events"].append({"ev": "2주차 · 그랜드 파이널", "start": pg["end"], "end": pg["end"], "stages": [stage], "champion": top[0]})
                else:
                    e["stages"].append(stage)
                    e["champion"] = top[0]
            print("Liquipedia", t["name"], e["ev"], "->", pg["title"], top[0])
        t["end"] = max([t["end"]] + [e["end"] for e in t["events"] if e["end"]])


EV_PAGE = {"플레이인": "Play Ins", "1주차": "Week 1", "2주차": "Week 2", "2주차 · 그랜드 파이널": "Grand Finals"}


def lq_events_fill(tours):
    """MetaTFT 기록이 빠진 지난 지역별 결승을 Liquipedia 게임별 기록(data/esports/events_detail, fetch_worlds.py events)으로 바꾼다.
    (2026-11-15 사용자: S17 APAC 2주차가 '게임을 하다 만' 것처럼 보임 → MetaTFT에 게임이 빠져 있었음. Liquipedia는 1주차 40명 전부·게임 전부)"""
    import worlds_detail as WD
    D = RAW / "events_detail"
    if not D.exists(): return
    names = dict(WORLDS)
    for t in tours:
        if t.get("kind") != "finals" or t.get("source") == "apactft" or t.get("region") not in ("AMER", "EMEA", "APAC"): continue
        nm = names.get(t["set"])
        if not nm: continue
        evs = t["events"]
        tabs = {}
        for e in evs:
            sub = EV_PAGE.get(e["ev"])
            f = D / (re.sub(r"[^A-Za-z0-9]+", "_", f"{nm}/{t['region']}/Regional Finals/{sub}").strip("_") + ".json") if sub else None
            if not f or not f.exists(): continue
            st = WD.parse(json.loads(f.read_text()).get("wikitext", ""))
            st = [x for x in st if x["rows"]]
            if st: tabs[e["ev"]] = max(st, key=lambda x: (len(x["rows"]), max(len(r["p"]) for r in x["rows"])))
        if not tabs: continue
        order = [e["ev"] for e in evs]
        for i, e in enumerate(evs):
            x = tabs.get(e["ev"])
            if not x: continue
            nxt = next((tabs[o] for o in order[i + 1:] if o in tabs), None)
            later = {r["n"].lower() for r in nxt["rows"]} if nxt else set()
            G = max(len(r["p"]) for r in x["rows"])
            final = e["ev"].endswith("그랜드 파이널")
            rows = []
            for r in x["rows"]:
                n = len(r["p"]); up = r["n"].lower() in later
                adv = "direct_advance" if up and n < G and not final else None
                rows.append(row(r["n"], "", r["pts"] - r.get("sp", 0) if final else r["pts"], n, sum(1 for v in r["p"] if v == 1),
                                sum(1 for v in r["p"] if v <= 4), out=bool(later) and not up, places=r["p"], adv=adv))
            if final:
                rows.sort(key=lambda r: -r["pts"])
            else:
                rows.sort(key=lambda r: (not r.get("adv"), r["out"], -r["g"], -r["pts"]))
            old = e["stages"][-1] if e["stages"] else {}
            e["stages"] = [{**{k: v for k, v in old.items() if k not in ("table",)}, "name": old.get("name") or ("결승" if final else "스위스"), "final": final, "table": rows, "lqg": True}]
            def same(a):  # MetaTFT 이름엔 팀 태그가 붙는다 (CTG Kaiweng = Kaiweng)
                if not a: return a
                al = a.lower()
                return next((r["n"] for r in rows if r["n"].lower() == al or al.endswith(" " + r["n"].lower()) or r["n"].lower().endswith(" " + al)), a)
            if e["stages"][0].get("champion"): e["stages"][0]["champion"] = same(e["stages"][0]["champion"])
            if e.get("champion"): e["champion"] = same(e["champion"])
        t["lq_games"] = True
        print("Liquipedia 게임 기록으로 채움", t["name"], list(tabs))


# ---------- 전체 대회 자동 추적 (Liquipedia Portal·쇼매치 + 커스텀 카탈로그 + 라이엇 한국 이스포츠 소식) ----------
CATALOG_FILE = RAW / "events_catalog.json"
RIOT_NEWS_URL = "https://teamfighttactics.leagueoflegends.com/ko-kr/news/esports/"
RIOT_NEWS_CACHE = RAW / "riot_news.json"
_MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
           "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
_LQ_LAST_HIT = 0.0


def lq_page_fresh_html(pg, max_h=20):
    """Liquipedia HTML 파싱 결과를 20시간 캐시로 받는다. 실제 네트워크 호출 사이에는 31초 간격을 지킨다."""
    global _LQ_LAST_HIT
    slug = re.sub(r"[^A-Za-z0-9_]+", "_", pg.replace("/", "_").replace(":", "_")).strip("_")
    f = RAW / f"portal_{slug}.json"
    old = None
    if f.exists():
        try:
            old = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            old = None
    at = (old or {}).get("fetched")
    if old and at:
        try:
            if (datetime.now(timezone.utc) - datetime.fromisoformat(at)).total_seconds() < max_h * 3600:
                return old
        except Exception:
            pass
    wait = 31.0 - (time.time() - _LQ_LAST_HIT)
    if _LQ_LAST_HIT > 0 and wait > 0:
        time.sleep(wait)
    try:
        u = "https://liquipedia.net/tft/api.php?" + urllib.parse.urlencode({"action": "parse", "page": pg, "format": "json", "prop": "text"})
        _LQ_LAST_HIT = time.time()
        d = json.loads(get(u, {"User-Agent": "lolche-note/1.0 (personal study app)"}))
        if "parse" in d:
            d["fetched"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
            f.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
            print("Liquipedia 목록 받음", pg)
            return d
    except Exception as e:
        print("Liquipedia 목록 캐시 사용", pg, e)
    return old


def lq_parse_date(txt):
    """Liquipedia 날짜 표기('Dec 11–13, 2026', 'Oct 23 – Nov 01, 2026', 'Nov 23, 2026') -> (start_iso, end_iso)."""
    s = re.sub(r"\s+", " ", (txt or "").replace("\u2013", "-").replace("\u2014", "-").replace("–", "-")).strip()
    if not s:
        return "", ""
    # Dec 11-13, 2026
    m = re.match(r"([A-Za-z]{3})\s+(\d{1,2})\s*-\s*(\d{1,2}),\s*(\d{4})", s)
    if m and m.group(1).lower() in _MONTHS:
        mo, d1, d2, y = _MONTHS[m.group(1).lower()], int(m.group(2)), int(m.group(3)), int(m.group(4))
        return f"{y:04d}-{mo:02d}-{d1:02d}", f"{y:04d}-{mo:02d}-{d2:02d}"
    # Oct 23 - Nov 01, 2026
    m = re.match(r"([A-Za-z]{3})\s+(\d{1,2})\s*-\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})", s)
    if m and m.group(1).lower() in _MONTHS and m.group(3).lower() in _MONTHS:
        m1, d1, m2, d2, y = _MONTHS[m.group(1).lower()], int(m.group(2)), _MONTHS[m.group(3).lower()], int(m.group(4)), int(m.group(5))
        y1 = y - 1 if m1 > m2 else y
        return f"{y1:04d}-{m1:02d}-{d1:02d}", f"{y:04d}-{m2:02d}-{d2:02d}"
    # Dec 28, 2025 - Jan 03, 2026
    m = re.match(r"([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*-\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})", s)
    if m and m.group(1).lower() in _MONTHS and m.group(4).lower() in _MONTHS:
        m1, d1, y1, m2, d2, y2 = _MONTHS[m.group(1).lower()], int(m.group(2)), int(m.group(3)), _MONTHS[m.group(4).lower()], int(m.group(5)), int(m.group(6))
        return f"{y1:04d}-{m1:02d}-{d1:02d}", f"{y2:04d}-{m2:02d}-{d2:02d}"
    # Nov 23, 2026
    m = re.match(r"([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})", s)
    if m and m.group(1).lower() in _MONTHS:
        mo, d1, y = _MONTHS[m.group(1).lower()], int(m.group(2)), int(m.group(3))
        iso = f"{y:04d}-{mo:02d}-{d1:02d}"
        return iso, iso
    # Dec 2026
    m = re.match(r"([A-Za-z]{3})\s+(\d{4})", s)
    if m and m.group(1).lower() in _MONTHS:
        mo, y = _MONTHS[m.group(1).lower()], int(m.group(2))
        return f"{y:04d}-{mo:02d}-01", f"{y:04d}-{mo:02d}-28"
    return "", ""


def _lq_clean_val(s):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    if not s or s in ("-", "—", "TBA") or re.search(r"\bTBD\b", s, re.I):
        return ""
    return s


def lq_parse_listing(html_txt, default_tier="", min_end=""):
    """Liquipedia table2 토너먼트 목록(Portal:Tournaments, Showmatch_Tournaments) 파싱."""
    import html as H
    clean = lambda x: re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", x))).strip()
    out = []
    for tr in re.findall(r'<tr class="table2[^"<>]*row--body[^"]*">(.*?)</tr>', html_txt or "", re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 9:
            continue
        tier_raw = clean(tds[0]) or default_tier
        tier = "Showmatch" if default_tier == "Showmatch" or re.search(r"showmatch", tier_raw, re.I) else re.sub(r"-Tier$", "", tier_raw).strip() or "Event"
        m_a = re.search(r'<a[^>]+href="/tft/([^"]+)"[^>]*>(.*?)</a>', tds[2], re.S)
        lq_page = urllib.parse.unquote(m_a.group(1)) if m_a else ""
        name = clean(m_a.group(2)) if m_a else clean(tds[2])
        if not name:
            continue
        start, end = lq_parse_date(clean(tds[3]))
        if not start:
            continue
        if min_end and (end or start) < min_end:
            continue
        prize = _lq_clean_val(clean(tds[4]))
        loc = clean(tds[5])
        pnum = _lq_clean_val(clean(tds[6]))
        winner = _lq_clean_val(clean(tds[7]))
        runner = _lq_clean_val(clean(tds[8]))
        out.append({"name": name, "lq_page": lq_page, "tier": tier, "start": start, "end": end or start,
                    "prize": prize, "loc": loc, "players": pnum, "winner": winner, "runner": runner})
    return out


def _infer_meta(ev):
    """자동 수집된 Liquipedia 대회의 지역·분류·세트 추정."""
    nm = (ev.get("name") or "") + " " + (ev.get("lq_page") or "")
    loc = (ev.get("loc") or "").lower()
    low = nm.lower()
    # 세트 추정
    setn = None
    m = re.search(r"\bset\s*(\d{1,2})\b|\bs(\d{2})\b", low)
    if m:
        setn = int(m.group(1) or m.group(2))
    else:
        for n, wname in WORLDS:
            if wname.lower() in low:
                setn = n
                break
    # 지역 추정
    if re.search(r"\bkorea\b|\bseoul\b|\bsoop\b|\blvup\b", low) or "korea" in loc or "seoul" in loc:
        reg = "KR"
    elif re.search(r"\bcn\b|\btoc\b|\bjoc\b|\bjcc\b|\bchina\b|hangzhou|guangzhou|shanghai", low) or "china" in loc:
        reg = "CN"
    elif re.search(r"\bapac\b|japan|vietnam|taiwan|oceania|thailand|singapore", low) or any(x in loc for x in ("japan", "vietnam", "asia-pacific", "taiwan", "thailand", "macau")):
        reg = "APAC"
    elif re.search(r"\bemea\b|europe|france|paris|germany|poland|spain|turkey", low) or any(x in loc for x in ("europe", "france", "paris", "germany", "spain", "poland")):
        reg = "EMEA"
    elif re.search(r"\bamer\b|north america|brazil|latin america|las vegas", low) or any(x in loc for x in ("americas", "north america", "united states", "brazil", "canada")):
        reg = "WORLD" if "open" in low or "invitational" in low else "AMER"
    else:
        reg = "WORLD"
    # 분류 추정
    if "tft open" in low or "vegas open" in low or "paris open" in low or "macao open" in low:
        cat = "open" if "showmatch" not in low and ev.get("tier") != "Showmatch" else "event"
        if cat == "open":
            reg = "WORLD"
    elif "esports world cup" in low or re.search(r"\bewc\b", low):
        cat, reg = "ewc", "WORLD"
    elif "superbrawl" in low or "4v4" in low or "squad" in low:
        cat = "team"
    elif reg == "KR":
        cat = "kr"
    elif ev.get("tier") == "Showmatch" or any(k in low for k in ("showmatch", "invitational", "pbe", "gauntlet", "bash", "carousel", "mastermind")):
        cat = "event"
    elif any(k in low for k in ("regional finals", "tpc", "pro circuit", "trials", "toc ", "joc ", "national championship")):
        cat = "circuit"
    else:
        cat = "event"
    return reg, cat, setn


def lq_discover_events():
    """Liquipedia Portal:Tournaments(예정·진행 중·최근) + Showmatch_Tournaments(최근 1년) 자동 수집."""
    out = []
    seen = set()
    for pg, d_tier, min_end in (("Portal:Tournaments", "", ""), ("Showmatch_Tournaments", "Showmatch", "2025-12-01")):
        d = lq_page_fresh_html(pg, max_h=20)
        if not d:
            continue
        html_txt = ((d.get("parse") or {}).get("text") or {}).get("*", "")
        for ev in lq_parse_listing(html_txt, default_tier=d_tier, min_end=min_end):
            key = (ev["lq_page"] or norm(ev["name"])).lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(ev)
    return out


def build_all_events(tours, wd_list):
    """커스텀 카탈로그(events_catalog.json) + Liquipedia 자동 수집 병합.
    - 카탈로그 항목은 Liquipedia에서 우승자·준우승·상금·인원이 새로 확정되면 자동 갱신.
    - 카탈로그·기존 공식 대회(tournaments/worlds)에 없는 신규 대회를 자동 추가."""
    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8")) if CATALOG_FILE.exists() else []
    merged = [dict(x) for x in catalog]
    by_slug = {(x.get("lq_page") or "").lower(): x for x in merged if x.get("lq_page")}
    by_name = {norm(x.get("en") or x.get("name")): x for x in merged}

    # 기존 tournaments / worlds와 중복 체크용 (이미 시트 표가 있는 공식 TPC·지역 결승·월즈)
    covered_worlds = {w["set"] for w in wd_list if w.get("top")} | {s["set"] for s in SCHEDULE if s.get("set")}
    tour_spans = [(t.get("set"), t.get("region"), t.get("kind"), t.get("start") or "", t.get("end") or "") for t in tours]

    discovered = lq_discover_events()
    added = 0
    for ev in discovered:
        slug_k = (ev.get("lq_page") or "").lower()
        nm_k = norm(ev["name"])
        hit = by_slug.get(slug_k) or by_name.get(nm_k)
        if hit:
            # 확정된 결과·정보 자동 반영 (TBD 제외)
            if ev["winner"] and not hit.get("winner"):
                hit["winner"] = ev["winner"]
            if ev["runner"] and not hit.get("runner"):
                hit["runner"] = ev["runner"]
            if ev["prize"] and not hit.get("prize"):
                hit["prize"] = ev["prize"]
            if ev["players"] and not hit.get("players"):
                hit["players"] = ev["players"]
            if ev["start"] and not hit.get("start"):
                hit["start"], hit["end"] = ev["start"], ev["end"]
            continue

        low = ev["name"].lower()
        reg, cat, setn = _infer_meta(ev)
        # 이미 역대 월즈/진행 중 월즈 카드로 노출 중인 Tactician's Crown(단 쇼매치는 제외)은 중복 생략
        if "tactician's crown" in low and "showmatch" not in low and (setn in covered_worlds or not setn):
            continue
        # 이미 MetaTFT/APAC 시트 표로 노출 중인 지역 결승·TPC·시험(AMER/EMEA/APAC)은 중복 생략
        if reg in ("AMER", "EMEA", "APAC") and any(
            ts == setn and tr == reg and ts_s and ts_e and ev["start"] <= ts_e and ev["end"] >= ts_s
            and (("regional finals" in low and tk == "finals") or ("pro circuit" in low and tk == "tpc") or ("trials" in low and tk == "trials"))
            for ts, tr, tk, ts_s, ts_e in tour_spans
        ):
            continue

        ev_id = "lq-" + re.sub(r"[^a-z0-9]+", "-", (ev["lq_page"] or ev["name"]).lower()).strip("-")[:48]
        lq_url = "https://liquipedia.net/tft/" + urllib.parse.quote(ev["lq_page"]) if ev["lq_page"] else ""
        item = {
            "id": ev_id,
            "name": ev["name"],
            "en": ev["name"],
            "cat": cat,
            "tier": ev["tier"],
            "region": reg,
            "set": setn,
            "start": ev["start"],
            "end": ev["end"],
            "loc": ev["loc"],
            "prize": ev["prize"],
            "players": ev["players"],
            "winner": ev["winner"],
            "runner": ev["runner"],
            "kr_note": "",
            "summary": "Liquipedia에서 자동 수집된 대회예요.",
            "schedule_kst": [],
            "format": [],
            "links": ([["Liquipedia", lq_url]] if lq_url else []),
            "lq_page": ev["lq_page"],
            "auto": True,
        }
        merged.append(item)
        by_slug[slug_k] = item
        by_name[nm_k] = item
        added += 1

    today_kst = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
    def sort_key(x):
        s, e = x.get("start") or "0000-00-00", x.get("end") or x.get("start") or "0000-00-00"
        if s <= today_kst <= e:
            return (0, s, e)  # 진행 중 먼저
        if today_kst < s:
            return (1, s, e)  # 예정 가까운 순
        return (2, "".join(chr(255 - ord(c)) for c in e), "")  # 종료 최신 순
    merged.sort(key=sort_key)
    print(f"전체 이스포츠 이벤트: 총 {len(merged)}개 (카탈로그 {len(catalog)} + 자동 수집 {added})")
    return merged


def riot_kr_esports_news(limit=12):
    """라이엇 한국 공식 TFT 이스포츠 소식 수집 (실패 시 캐시 유지)."""
    old = []
    if RIOT_NEWS_CACHE.exists():
        try:
            old = json.loads(RIOT_NEWS_CACHE.read_text(encoding="utf-8"))
        except Exception:
            old = []
    try:
        h = get(RIOT_NEWS_URL, {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36", "Accept-Language": "ko-KR,ko;q=0.9"})
        m = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
        if not m:
            return old[:limit]
        nd = json.loads(m.group(1))
        blades = (((nd.get("props") or {}).get("pageProps") or {}).get("page") or {}).get("blades") or []
        out = []
        for bl in blades:
            for it in bl.get("items") or []:
                title = (it.get("title") or "").strip()
                act = (it.get("action") or {}).get("payload") or {}
                url = (act.get("url") or "").strip()
                if not title or not url:
                    continue
                if url.startswith("/"):
                    url = "https://teamfighttactics.leagueoflegends.com" + url
                desc = (((it.get("description") or {}).get("body") or "") if isinstance(it.get("description"), dict) else str(it.get("description") or "")).strip()
                desc = re.sub(r"<[^>]+>", "", desc).strip()
                dt = (it.get("publishedAt") or "")[:10]
                kind = "video" if "youtube.com" in url or "youtu.be" in url else "article"
                out.append({"date": dt, "title": title, "desc": desc[:140], "url": url, "kind": kind})
        if out:
            out.sort(key=lambda x: x["date"], reverse=True)
            out = out[:limit]
            RIOT_NEWS_CACHE.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"라이엇 한국 이스포츠 소식: {len(out)}건 (최신 {out[0]['date']})")
            return out
    except Exception as e:
        print("라이엇 이스포츠 소식 캐시 사용", e)
    return old[:limit]


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    tours = apac()
    tours += metatft(skip_apac=bool(tours))
    lq_fetch_missing()
    apply_liquipedia(tours)
    lq_events_fill(tours)
    tours.sort(key=lambda x: x["end"] or "9999", reverse=True)
    pros = json.loads(get(API + "pro_players"))["data"]
    points = defaultdict(list)
    for p in pros:
        for pt in p.get("points") or []:
            points[f"{pt['season']}|{pt['region']}"].append({"n": p["name"], "rank": pt["ranking"], "pts": pt["points"]})
    # MetaTFT에 없는 선수는 순위가 비어 보인다 (APAC 23·26위 등). Liquipedia 순위 순서로 빈 순위를 채운다 (점수는 없음)
    # Liquipedia 순서는 단계별(직행·1주차·플레이인)이라 순위와 꼭 같지 않다. MetaTFT에 없는 이름만 골라 빈 순위에 순서대로 넣는다
    norm_ascii = lambda x: re.sub(r"[^0-9a-z]", "", unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode().lower())
    for k, order in lq_point_order().items():
        rows = points.get(k, [])
        have = {r["rank"] for r in rows}
        known = [norm_ascii(r["n"]) for r in rows]
        extra = [n for n in order if not any(m == norm_ascii(n) or m.endswith(norm_ascii(n)) for m in known)]
        holes = [i for i in range(1, max(have | {0}) + 1) if i not in have]
        for i, name in zip(holes, extra):
            points[k].append({"n": name, "rank": i, "pts": None})
    for k in points:
        points[k].sort(key=lambda r: r["rank"])
    roster = crown_roster()
    fl = flags(tours, [n for p in (roster or {}).get("players", []) for n in [p["n"]] + p.get("al", [])])
    if roster:
        low = {k.lower(): v for k, v in fl.items()}
        for p in roster["players"]:
            p["f"] = next((low[n.lower()] for n in [p["n"]] + p.get("al", []) if low.get(n.lower())), "") or ("cn" if p["reg"] == "CN" else "")
    wd_list = worlds({k.split(" ")[-1] if len(k.split(" ")) > 1 and k.split(" ")[0].isupper() else k: v for k, v in fl.items()} | fl)
    events_all = build_all_events(tours, wd_list)
    news = riot_kr_esports_news(12)
    data = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "tournaments": tours, "schedule": SCHEDULE,
            "worlds": wd_list, "events_all": events_all, "news": news,
            "propoints": points, "flags": fl, "crown": roster}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"site/esports.json: 대회 {len(tours)}개, 전체 이벤트 {len(events_all)}개, 소식 {len(news)}건, {OUT.stat().st_size // 1024}KB, 국적 {len(data['flags'])}명")


if __name__ == "__main__":
    main()

