#!/usr/bin/env python3
"""메타 덱 탭의 '추천 덱' -> site/guides.json

    python3 scripts/build_guides.py

롤체지지(lolchess.gg) 메타 페이지의 가이드 덱을 받아 우리 이름(MetaTFT 한국어)으로 바꾼다.
- 덱마다: 보드(자리·별·템, 나무정령 식물 포함), 추천 증강 3개, 완성 시너지(단계 색)
- 가이드 상세(builder/guide/<키>): 레벨별 보드 4~10렙(levels), 레벨업 추천 라운드(lvup)
- 시너지 단계 색(브론즈·실버·골드·프리즘·고유)은 롤체지지 시너지 데이터
- MetaTFT 덱(site/meta.json)과 유닛이 가장 많이 겹치는 걸 찾아 통계를 붙일 수 있게 cluster id를 적는다
페이지에 보이는 데이터가 바뀌면 이 스크립트의 파싱도 바꿔야 한다 (__NEXT_DATA__ 안 react-query 캐시).
"""
import html
import io
import json
import re
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "guides.json"
ICONS = ROOT / "site" / "icons"
UA = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36", "Accept-Language": "ko"}


def next_data(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        h = r.read().decode("utf-8")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    qs = json.loads(m.group(1))["props"]["pageProps"]["dehydratedState"]["queries"]
    return {q["queryKey"][0]: q["state"]["data"] for q in qs}


def save_icon(url, path):
    """롤체지지 그림(식물·없는 증강)을 96px webp로."""
    if path.exists():
        return
    from PIL import Image
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        im = Image.open(io.BytesIO(r.read())).convert("RGBA")
    im.thumbnail((96, 96))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP")


def guide_text(h):
    """롤체지지 가이드 HTML 조각 -> 줄 목록 (</em><em>로 끊긴 단어는 붙이고, 줄바꿈·태그 정리)"""
    h = re.sub(r"</(em|strong)>\s*<\1>", "", h)
    h = re.sub(r"<br\s*/?>|</p>|</h1>|</li>", "\n", h)
    t = html.unescape(re.sub(r"<[^>]+>", "", h)).replace("\xa0", " ")
    return [re.sub(r"\s+", " ", x).strip() for x in t.split("\n") if x.strip()]


def parse_guide(contents):
    """가이드 본문 -> {tips 개요, charms 도움되는 수호령, items 챔피언별 주요·대체 아이템, augs 등급별 종류별 증강}"""
    out = {"tips": [], "charms": [], "items": [], "augs": []}
    for c in contents:
        body = c.get("content", "")
        secs = re.split(r"<h1>(.*?)</h1>", body)
        if "증강" in (c.get("title") or ""):  # 증강 글은 등급(실버·골드·프리즘)이 제목 태그라 통째로
            pairs = [(c.get("title"), body)]
        elif len(secs) > 1:
            pairs = [(html.unescape(re.sub(r"<[^>]+>", "", secs[i])).strip(), secs[i + 1]) for i in range(1, len(secs), 2)]
        else:
            pairs = [(c.get("title", ""), body)]
        for title, h in pairs:
            lines = guide_text(h)
            if title == "개요":
                out["tips"] = [x.lstrip("·").strip() for x in lines if x.startswith("·") and "덱 난이도" not in x]
            elif "수호령" in title:
                for x in lines:
                    out["charms"] += [y.strip() for y in x.lstrip("·").split("/") if y.strip()]
            elif "챔피언" in title and "아이템" in title:
                cur, mode = None, None
                for x in lines:
                    m = re.match(r"\[(.+?)\]\s*(.*)", x)
                    if m:
                        cur = {"u": m.group(1).strip(), "note": m.group(2).strip().lstrip("*").strip(), "d": "", "main": [], "alt": []}
                        out["items"].append(cur); mode = None
                    elif cur is None:
                        continue
                    elif x.startswith("주요 아이템"):
                        mode = "main"
                    elif x.startswith("대체 아이템"):
                        mode = "alt"
                    elif x.startswith("·") and mode:
                        v = " / ".join(y.strip() for y in x.lstrip("·").split("/") if y.strip())
                        if v:
                            cur[mode].append(v)
                    elif not mode and not cur["d"]:
                        cur["d"] = x
            elif "증강" in title:
                tier, joined = None, []
                for x in lines:  # '· 전투: ' 다음 줄로 끊긴 이름 이어 붙이기
                    if x in ("실버", "골드", "프리즘") or x.startswith("·") or not joined:
                        joined.append(x)
                    else:
                        joined[-1] += " " + x
                for x in joined:
                    if x in ("실버", "골드", "프리즘"):
                        tier = [x, []]; out["augs"].append(tier)
                    elif tier and x.startswith("·") and ":" in x:
                        cat, names = x.lstrip("·").split(":", 1)
                        ns = [y.strip() for y in re.split(r"[/,]", names) if y.strip()]  # '폭발적인 성장, 성장+'처럼 쉼표로도 나열
                        if ns:
                            tier[1].append([cat.strip(), ns])
    return out


def main():
    lk = T.load("lookup_ko")
    unit_by_api = {}
    for u in lk["units"]:
        for a in u.get("assetNames", []) + [u["apiName"]]:
            unit_by_api[a] = u
    item_by_api = {i["apiName"]: i["name"] for i in lk["items"] + lk.get("armory_items", [])}
    aug_by_api = {a["apiName"]: a["name"] for a in lk["augments"]}
    trait_by_api = {t["apiName"]: t["name"] for t in lk["traits"]}

    meta = next_data("https://lolchess.gg/meta")
    augref = next_data("https://lolchess.gg/augments")["augmentRefs"]["augments"]
    champs = {c["key"]: c for c in meta["championRefs"]["champions"]}
    items = {i["key"]: i for i in meta["itemRefs"]["items"]}
    traits = {t["key"]: t for t in meta["traitsRefs"]["traits"]}
    augs = {a["key"]: a for a in augref}
    guides = meta["getGuideDecks"]
    live = next((g["name"] for g in guides["guides"] if g["key"] == "live"), "")

    # 시너지 단계 색: 우리 시너지 이름 -> [[최소, 최대, 색]]. Riot 데이터(effects.style)가 기준
    # (롤체지지 styles는 나무정령·악의 여단처럼 틀린 게 있다)
    STYLE = {1: "bronze", 2: "bronze", 3: "silver", 4: "gold", 5: "chromatic", 6: "unique"}
    styles = {t["name"]: [[e.get("minUnits"), e.get("maxUnits"), STYLE.get(e.get("style"), "bronze")] for e in t["effects"]]
              for t in lk["traits"]}

    idx_path = ICONS / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    def to_board(slots):
        board = []
        for s in slots or []:
            c = champs.get(s["champion"], {})
            u = unit_by_api.get(c["ingameKey"]) if c.get("ingameKey") else None
            if u and u.get("traits") and not c.get("isHidden"):
                name, plant = u["name"], False
            else:  # 나무정령 식물 같은 소환물
                name, plant = c.get("name", s["champion"]), True
                if c.get("imageUrl") and name not in idx["units"]:
                    p = ICONS / "u" / f"x_{s['champion'].lower()}.webp"
                    save_icon(c["imageUrl"], p)
                    idx["units"][name] = {"icon": f"icons/u/{p.name}", "cost": 0}
            its = []
            for k in s.get("items") or []:
                it = items.get(k, {})
                its.append(item_by_api.get(it.get("ingameKey", ""), it.get("name", k)))
            board.append({"u": name, "plant": plant, "s": s.get("star") or (0 if plant else 1),
                          "pos": [s["index"] // 7, s["index"] % 7], "i": its})
        return board

    def synergies(board):
        # 완성 시너지: 같은 챔피언은 한 번만, 상징은 +1
        counts, seen = Counter(), set()
        for b in board:
            if b["plant"] or b["u"] in seen:
                continue
            seen.add(b["u"])
            u = next((x for x in lk["units"] if x["name"] == b["u"]), None)
            for t in (u or {}).get("traits", []):
                counts[t] += 1
            for it in b["i"]:
                if it.endswith(" 상징"):
                    counts[it[:-3]] += 1
        syn = []
        for t, n in counts.items():
            st = [x for x in styles.get(t, []) if x[0] is not None and n >= x[0]]
            if st:
                syn.append({"t": t, "n": n, "style": st[-1][2]})
        order = {"chromatic": 0, "gold": 1, "silver": 2, "bronze": 3, "unique": 4}  # 한 명짜리 고유 시너지는 뒤로
        syn.sort(key=lambda x: (order.get(x["style"], 5), -x["n"]))
        return syn

    decks = []
    for g in guides["guideDecks"]:
        if "요약" in g["name"]:  # '유물별 챔피언 요약' 같은 정리용 보드는 덱이 아니다
            continue
        board = to_board(g["data"]["slots"])
        syn = synergies(board)
        aug_out = []
        for k in g["data"].get("augments") or []:
            a = augs.get(k, {})
            name = aug_by_api.get(a.get("ingameKey", ""), a.get("name", k))
            if name not in idx["augments"] and a.get("imageUrl"):
                p = ICONS / "a" / f"x_{k.lower()}.webp"
                save_icon(a["imageUrl"], p)
                idx["augments"][name] = f"icons/a/{p.name}"
            aug_out.append({"n": name, "tier": a.get("tier", 0)})
        deck = {"name": g["name"], "tag": g.get("tag") or "", "board": board, "augments": aug_out, "syn": syn}
        # 가이드 상세: 레벨별 보드(5~10렙, 자리·별·템)와 레벨업 추천 라운드
        try:
            tb = next_data(f"https://lolchess.gg/builder/guide/{g['teamBuilderKey']}")["teamBuilder"]
            lv = {}
            for n in range(4, 11):
                b = tb.get(f"lv{n}TeamBuilder")
                if b and b.get("slots"):
                    bb = to_board(b["slots"])
                    lv[str(n)] = {"board": bb, "syn": synergies(bb)}
            deck["levels"] = lv
            text = " ".join(c.get("content", "") for c in (tb.get("teamBuilder") or {}).get("guide", {}).get("contents", []))
            text = html.unescape(re.sub(r"<[^>]+>", "\n", text))
            deck["lvup"] = [[a.strip(), int(b)] for a, b in re.findall(r"·\s*([0-9][0-9\-~ ]*[0-9]|여유 골드)\s*▶\s*(\d+)레벨", text)]
            m = re.search(r"덱 난이도:\s*(\S+)", text)
            if m:
                deck["diff"] = m.group(1)
            gd = parse_guide((tb.get("teamBuilder") or {}).get("guide", {}).get("contents", []))
            if gd["tips"] or gd["items"] or gd["augs"]:
                deck["guide"] = gd  # 롤체지지 공략 원문 (개요·수호령·챔피언별 아이템·증강)
            time.sleep(0.7)
        except Exception as e:  # 상세가 막혀도 최종 보드는 있다
            print("  상세 실패", g["name"], e)
        decks.append(deck)

    # MetaTFT 덱과 짝짓기 (유닛 겹침)
    mt = json.loads((ROOT / "site" / "meta.json").read_text(encoding="utf-8"))["decks"]
    for d in decks:
        mine = {b["u"] for b in d["board"] if not b["plant"]}
        best, score = None, 0
        for m in mt:
            theirs = {b["u"] for b in m["board"]} | {u for lv in m["levels"].values() for u in lv}
            sc = len(mine & theirs) - 0.01 * len(theirs - mine)
            if sc > score:
                best, score = m["id"], sc
        d["cluster"] = best if score >= 5 else None

    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "patch": live, "styles": styles, "decks": decks}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"site/guides.json: {live}, 덱 {len(decks)}개 (MetaTFT 짝 {sum(1 for d in decks if d['cluster'])}개), {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
