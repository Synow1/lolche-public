#!/usr/bin/env python3
"""역대 월즈(전략가의 왕관·챔피언십) 결과 페이지를 Liquipedia에서 받아 data/esports/worlds_detail/에 둔다 (커밋).
Liquipedia는 30초에 한 번 정도만 부른다 (넘으면 429로 한참 막힘). 이미 받은 페이지는 다시 안 받는다.
  python3 scripts/fetch_worlds.py          # 없는 것만
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "esports" / "worlds_detail"
API = "https://liquipedia.net/tft/api.php"
UA = {"User-Agent": "lolche-note/1.0 (personal study app)", "Accept-Encoding": "gzip"}
sys.path.insert(0, str(ROOT / "scripts"))
import build_esports as BE  # WORLDS: [(세트, 이름)]

def call(params, tries=6):
    import gzip, urllib.error
    for t in range(tries):  # 429(너무 자주)면 5분 쉬고 다시
        try:
            return call1(params)
        except urllib.error.HTTPError as e:
            if e.code != 429 or t == tries - 1:
                raise
            print("429 -> 5분 쉼", flush=True); time.sleep(300)

def call1(params):
    import gzip
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode({**params, "format": "json"}), headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        b = r.read()
    if b[:2] == b"\x1f\x8b":
        b = gzip.decompress(b)
    return json.loads(b.decode("utf-8"))

def fn(page):
    return OUT / (re.sub(r"[^A-Za-z0-9]+", "_", page).strip("_") + ".json")

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    last = 0
    def wait():
        nonlocal last
        d = 40 - (time.time() - last)
        if d > 0: time.sleep(d)
        last = time.time()
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
    for setn, name in BE.WORLDS:
        if any(s["set"] == setn and s["end"] >= today for s in BE.SCHEDULE):
            continue  # 진행 중인 월즈는 끝난 뒤에 (받은 페이지는 다시 안 받으니 덜 채워진 걸 남기면 안 됨)
        root = name + ("/Tacticians Crown" if setn >= 11 else "/Championship")
        idx = OUT / (re.sub(r"[^A-Za-z0-9]+", "_", root) + "__pages.json")
        if idx.exists():
            pages = json.loads(idx.read_text())
        else:
            wait()
            try:
                r = call({"action": "query", "list": "prefixsearch", "pssearch": root, "pslimit": 30})
            except Exception as e:
                print("목록 실패", root, e); return
            pages = [p["title"] for p in r["query"]["prefixsearch"]]
            idx.write_text(json.dumps(pages, ensure_ascii=False))
        want = [p for p in pages if p == root or re.search(r"(Swiss|Group|Stage|Day|Final|Round|Results|Knockout|Elimination)", p, re.I)]
        for p in want:
            f = fn(p)
            if f.exists():
                continue
            wait()
            try:
                r = call({"action": "parse", "page": p, "prop": "wikitext"})
            except Exception as e:
                print("실패", p, e); return
            f.write_text(json.dumps({"page": p, "set": setn, "wikitext": r.get("parse", {}).get("wikitext", {}).get("*", "")}, ensure_ascii=False))
            print("받음", setn, p, flush=True)
    print("끝")

def main_events(sets=(16, 17, 18)):
    """지역별 결승(AMER·EMEA·APAC) 페이지와 하위 페이지 -> data/esports/events_detail/ (MetaTFT에 게임이 빠진 대회를 채우려고, 2026-11-15)"""
    out = ROOT / "data" / "esports" / "events_detail"; out.mkdir(parents=True, exist_ok=True)
    last = 0
    def wait():
        nonlocal last
        d = 40 - (time.time() - last)
        if d > 0: time.sleep(d)
        last = time.time()
    names = dict(BE.WORLDS)
    for setn in sets:
        for reg in ("APAC", "AMER", "EMEA"):
            root = f"{names[setn]}/{reg}/Regional Finals"
            idx = out / (re.sub(r"[^A-Za-z0-9]+", "_", root) + "__pages.json")
            if idx.exists():
                pages = json.loads(idx.read_text())
            else:
                wait()
                try:
                    r = call({"action": "query", "list": "prefixsearch", "pssearch": root, "pslimit": 30})
                except Exception as e:
                    print("목록 실패", root, e); return
                pages = [p["title"] for p in r["query"]["prefixsearch"]] or [root]
                idx.write_text(json.dumps(pages, ensure_ascii=False))
            for p in pages:
                if re.search(r"Statistics|Draft|Showmatch|Media", p): continue
                f = out / (re.sub(r"[^A-Za-z0-9]+", "_", p).strip("_") + ".json")
                if f.exists(): continue
                wait()
                try:
                    r = call({"action": "parse", "page": p, "prop": "wikitext"})
                except Exception as e:
                    print("실패", p, e); return
                f.write_text(json.dumps({"page": p, "set": setn, "region": reg, "wikitext": r.get("parse", {}).get("wikitext", {}).get("*", "")}, ensure_ascii=False))
                print("받음", setn, reg, p, flush=True)
    print("끝")

if __name__ == "__main__":
    main_events() if sys.argv[1:] == ["events"] else main()
