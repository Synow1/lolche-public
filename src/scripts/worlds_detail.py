"""역대 월즈 결과 페이지(data/esports/worlds_detail/, fetch_worlds.py로 받음)에서 단계별 전체 순위·게임별 등수를 뽑는다.
Liquipedia {{Match}} 하나 = 로비 하나. opponentN={{SoloOpponent|이름|m1={{MS|등수}}|...}}, pN = N등 점수 (없으면 9-N).
단계 이름: 매치 머리(M1header) 앞부분, 없으면 가장 가까운 '===단계===' 제목."""
import json, re
from pathlib import Path
DIR = Path(__file__).resolve().parent.parent / "data" / "esports" / "worlds_detail"

def _blocks(w, start):
    """start 위치의 {{ 로 시작하는 템플릿 하나를 괄호 짝으로 잘라 돌려준다"""
    d, i = 0, start
    while i < len(w):
        if w.startswith("{{", i): d += 1; i += 2; continue
        if w.startswith("}}", i):
            d -= 1; i += 2
            if d == 0: return w[start:i]
            continue
        i += 1
    return w[start:]

def stage_ko(n):
    n = re.sub(r"\{\{\s*[A-Za-z]+\s*\|([^{}|]*)\}\}", r"\1", n or "")  # {{Stage|Finals}} -> Finals
    if re.search(r"play-?ins?", n, re.I): return "플레이인"
    s = re.sub(r"\s*(?i:lobby|group)\s*[A-Z0-9]{1,2}$", "", n.strip()).strip()
    m = re.search(r"Day\s*(\d)", s, re.I)
    if re.search(r"grand\s*final|^finals?$", s, re.I): return "결승"
    if m: return m.group(1) + "일차"
    if re.search(r"swiss", s, re.I): return "스위스"
    if re.search(r"group", s, re.I): return "조별"
    if re.search(r"semi", s, re.I): return "준결승"
    if re.search(r"quarter", s, re.I): return "8강"
    m = re.search(r"Round of (\d+)", s, re.I)
    if m: return m.group(1) + "강"
    return s

def parse(w):
    w = re.sub(r"<!--.*?-->", "", w, flags=re.S)
    heads = [(m.start(), m.group(1).strip()) for m in re.finditer(r"^=+\s*([^=\n]+?)\s*=+\s*$", w, re.M)]
    stages, order = {}, []
    for m in re.finditer(r"\|(R\d+)?M(\d+)=\{\{Match", w):
        blk = _blocks(w, m.start() + len("|%sM%s=" % (m.group(1) or "", m.group(2))))
        # 매치 머리: 같은 Matchlist 안 M<n>header, 없으면 앞 제목
        lst = w.rfind("{{Matchlist", 0, m.start()); lst = max(lst, w.rfind("{{Bracket", 0, m.start()))
        hm = re.search(r"\|%sM%sheader=([^\n|]+)" % (m.group(1) or "", m.group(2)), w[lst:m.start()] if lst >= 0 else "")
        if not hm:  # 머리가 바로 앞에 없으면 같은 목록의 첫 머리
            hm = re.search(r"\|M1header=([^\n|]+)", w[lst:m.start()] if lst >= 0 else "")
        sec = next((h for p, h in reversed(heads) if p < m.start()), "")
        name = (stage_ko(hm.group(1)) if hm else "") or stage_ko(sec)
        if name not in stages: stages[name] = {}; order.append(name)
        pts = {int(a): int(b) for a, b in re.findall(r"\|p(\d)=(-?\d+)", blk)}
        for o in re.finditer(r"\{\{SoloOpponent\|", blk):
            ob = _blocks(blk, o.start())
            # 이름 = '='가 없는 첫 칸 ({{SoloOpponent|flag=vn|YBY1|…}}처럼 국기가 앞에 오기도 한다)
            top = re.sub(r"\{\{[^{}]*\}\}", "", ob[2:-2]); top = re.sub(r"\{\{[^{}]*\}\}", "", top)
            nm = next((x.strip() for x in top.split("|")[1:] if x.strip() and "=" not in x), "")
            if not nm: continue
            fl = (re.search(r"flag=([a-z]{2})", ob) or [None, ""])[1]
            pl = [int(x) for _, x in sorted(((int(k), v) for k, v in re.findall(r"\|m(\d+)=\{\{MS\|(\d+)\}\}", ob)), key=lambda t: t[0])]
            if not pl: continue
            r = stages[name].setdefault(nm.lower(), {"n": nm, "f": fl, "p": [], "pts": 0})
            r["p"] += pl
            r["pts"] += sum(pts.get(x, 9 - x) for x in pl)
            sp = re.search(r"startingpoints=(-?\d+)", ob)
            if sp and not r.get("sp"): r["sp"] = int(sp.group(1)); r["pts"] += r["sp"]  # 앞 단계에서 이어 온 점수
    # 옛 형식 {{match standings |title=… |pNplayer= |pNflag= |pNresults= 1, 4, …}} (S4~S9)
    for m in re.finditer(r"\{\{\s*match standings", w, re.I):
        blk = _blocks(w, m.start())
        tm = re.search(r"\|\s*title\s*=([^|\n]+)", blk)
        sec = next((h for p, h in reversed(heads) if p < m.start()), "")
        name = (stage_ko(tm.group(1)) if tm else "") or stage_ko(sec)
        if not re.search(r"swiss|group|day|final|round|stage", name, re.I) and not re.search(r"[가-힣]", name): name = stage_ko(sec) or name
        pts = {int(a): int(b) for a, b in re.findall(r"\|\s*p(\d)\s*=\s*(-?\d+)", blk)}
        rows = {}
        for k, nm in re.findall(r"\|\s*p(\d+)player\s*=\s*([^|\n]+)", blk):
            res = re.search(r"\|\s*p%sresults\s*=\s*([^|\n]*)" % k, blk)
            pl = [int(x) for x in re.findall(r"\d+", res.group(1))] if res else []
            if not pl: continue
            fl = (re.search(r"\|\s*p%sflag\s*=\s*([a-z]{2})" % k, blk) or [None, ""])[1]
            nm = nm.strip(); r = rows.setdefault(nm.lower(), {"n": nm, "f": fl, "p": [], "pts": 0})
            r["p"] += pl; r["pts"] += sum(pts.get(x, 9 - x) for x in pl)
        if not rows: continue
        if name in stages and not set(rows) & set(stages[name]): stages[name].update(rows); continue  # 같은 단계 다른 로비
        if name in stages: name = name + " " + str(sum(1 for x in order if x.startswith(name)) + 1)
        stages[name] = rows; order.append(name)
    out, seen = [], []
    for name in order:
        rows = sorted(stages[name].values(), key=lambda r: (-r["pts"], sum(r["p"])))
        if not rows: continue
        sig = tuple(sorted(tuple(r["p"]) for r in rows))  # 이름 표기만 다른 같은 표(SVM YBY1 = YBY1)도 같은 것으로
        if sig in seen: continue  # 같은 표가 탭마다 또 나온 것
        seen.append(sig); out.append({"name": name, "rows": rows})
    # 누적 표 없이 라운드 표만 있으면(Remix Rumble 스위스) 이어 붙여 '스위스'를 만든다
    rds = [x for x in out if re.match(r"Round \d", x["name"])]
    if len(rds) >= 2 and not any(re.search(r"스위스|조별|일차", x["name"]) for x in out):
        acc = {}
        for x in rds:
            for r in x["rows"]:
                a = acc.setdefault(r["n"].lower(), {"n": r["n"], "f": r["f"], "p": [], "pts": 0}); a["p"] += r["p"]; a["pts"] += r["pts"] - r.get("sp", 0)
        out.insert(out.index(rds[0]), {"name": "스위스", "rows": sorted(acc.values(), key=lambda r: (-r["pts"], sum(r["p"])))})
    # 라운드별 로비 표(Round N)는 누적 표(스위스·조별)에 이미 다 들어 있어서 뺀다
    if any(re.search(r"스위스|조별|일차", x["name"]) for x in out): out = [x for x in out if not re.match(r"Round \d", x["name"])]
    return out

def for_set(setn):
    rows = []
    for f in sorted(DIR.glob("*.json")):
        if f.name.endswith("__pages.json"): continue
        d = json.loads(f.read_text())
        if d.get("set") != setn: continue
        rows.append((d["page"], parse(d.get("wikitext", ""))))
    # 본 페이지 + 하위 페이지(스위스·결승): 같은 이름 단계는 하위 페이지 것을 쓴다
    rows.sort(key=lambda x: (x[0].count("/"), x[0]))
    st = {}
    for _, ss in rows:
        for s in ss:
            if s["rows"] and (s["name"] not in st or len(s["rows"]) >= len(st[s["name"]]["rows"])): st[s["name"]] = s
    def pri(n):
        if n == "플레이인": return 0
        if n in ("조별", "스위스"): return 1
        m = re.match(r"(\d)일차", n)
        if m: return 2 + int(m.group(1)) / 10
        m = re.match(r"(\d+)강", n)
        if m: return 4 + (64 - int(m.group(1))) / 100
        if n == "준결승": return 7
        if n == "결승": return 9
        return 5
    # 결승 이름이 따로 없고 마지막 날이 8명이면 그게 결승 (Fates: Day 3)
    if "결승" not in st:
        days = sorted((k for k in st if re.match(r"\d일차", k)), key=lambda k: k)
        if days and len(st[days[-1]]["rows"]) == 8: x = st.pop(days[-1]); x["name"] = "결승"; st["결승"] = x
    sig = lambda x: tuple(sorted(tuple(r["p"]) for r in x["rows"]))
    ko = [x for x in st.values() if re.search(r"[가-힣]", x["name"])]
    keep = ko + [x for x in st.values() if x not in ko and not any(sig(x) == sig(y) for y in ko)]  # 다른 페이지에 같은 표가 또 있으면 뺀다
    keep = sorted(keep, key=lambda s: pri(s["name"]))
    return merge_rounds(keep)

def merge_rounds(st):
    """40강·32강·…·8강, 1일차·2일차처럼 점수가 이어지는 단계를 시트 하나로 (2026-11-15 사용자: 단계마다 따로 보면 그 단계 점수만 나와 순위가 엉망).
    게임 칸은 단계별로 묶고(groups), 일찍 탈락한 선수는 뒤 칸이 비고, 순위는 결승 진출 → 오래 남은 순 → 누적 점수."""
    seq = [x for x in st if re.match(r"\d+강$|\d일차$", x["name"])]
    if len(seq) < 2: return st
    fin = next((x for x in st if x["name"] == "결승"), None)
    finals = {r["n"].lower() for r in fin["rows"]} if fin else set()
    acc, groups = {}, []
    for i, x in enumerate(seq):
        G = max(len(r["p"]) for r in x["rows"]); groups.append([x["name"], G])
        for r in x["rows"]:
            a = acc.setdefault(r["n"].lower(), {"n": r["n"], "f": r["f"], "p": [], "pts": 0, "last": -1})
            off = sum(g for _, g in groups[:-1])
            a["p"] += [0] * (off - len(a["p"])) + r["p"] + [0] * (G - len(r["p"]))
            a["pts"] += r["pts"] - r.get("sp", 0); a["last"] = i
    for a in acc.values():
        while a["p"] and not a["p"][-1]: a["p"].pop()
    rows = sorted(acc.values(), key=lambda a: (a["n"].lower() not in finals, 0 if a["n"].lower() in finals else -a["last"], -a["pts"]))
    for a in rows:
        if a["n"].lower() in finals: a["adv"] = "결승 진출"
        a.pop("last")
    name = "스위스"
    out = [x for x in st if x not in seq and x["name"] != "스위스"]
    out.insert(0, {"name": name, "rows": rows, "groups": groups})
    return out

if __name__ == "__main__":
    import sys
    for s in for_set(int(sys.argv[1]) if len(sys.argv) > 1 else 3):
        print(s["name"], len(s["rows"]), [(r["n"], r["pts"], r["p"]) for r in s["rows"][:3]])
