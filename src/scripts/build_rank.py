#!/usr/bin/env python3
"""'랭킹' 탭의 한국 랭킹 스냅샷 -> site/rank.json

앱은 MetaTFT에서 실시간으로 받지만, claude.ai 페이지는 네트워크가 막혀 있어서 이 스냅샷을 보여준다.
    python3 scripts/build_rank.py
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "site" / "rank.json"
LB = "https://api.metatft.com/tft-leaderboard/v2/kr?offset={}&limit=50"
CUT = "https://api.metatft.com/public/promotion_thresholds/latest"
DAK = "https://tft.dakgg.io/api/v1/leaderboards/summoners/kr?page=1&queueId=1100&hl=ko"  # 롤체지지: 순방(tops) 수


def get(url):
    req = urllib.request.Request(url, headers=T.HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    rows = []
    for off in (0, 50):
        rows += get(LB.format(off))["data"]
    cut = next((c for c in get(CUT) if c["region"].lower() == "kr"), None)
    try:  # MetaTFT 랭킹에는 순방 수가 없어서 롤체지지 것을 이름#태그로 붙인다
        req = urllib.request.Request(DAK, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            tops = {f"{x['gameName']}#{x['tagLine']}".lower(): [x["tops"], x["plays"]] for x in json.loads(r.read())["summonerRankings"]}
        for x in rows:
            if x["riot_id"].lower() in tops:
                x["tops"] = tops[x["riot_id"].lower()]
    except Exception as e:
        print("롤체지지 순방 못 받음", e)
    snap = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "cutoff": cut, "data": rows}
    OUT.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"site/rank.json: {len(rows)}명, {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
