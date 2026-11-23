#!/usr/bin/env python3
"""'친구' 탭 스냅샷 -> site/friends.json (claude.ai 페이지용. 앱은 롤체지지에서 실시간으로 받는다)

사용법:
    python3 scripts/build_friends.py

롤체지지(닥지지) API를 쓴다. MetaTFT는 저티어 판이 빠질 때가 있어서 롤체지지 화면과 숫자가 달라진다.
친구별로 현재 티어, 시즌 랭크 등수 분포, 판마다 LP 기록(league-logs: 시각·점수·그때까지 판수), 최근 랭크 20판 등수만 남긴다.
"""
import json
from datetime import datetime, timezone
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402  (SET)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "friends.json"
FRIENDS = ["Synow#KR1", "이렐꼴1픽#KR1", "날씨가너무덥네요#KR1"]  # 페이지의 FRIENDS와 같게
DAK = "https://tft.dakgg.io/api/v1/"
BASE = {"IRON": 0, "BRONZE": 400, "SILVER": 800, "GOLD": 1200, "PLATINUM": 1600, "EMERALD": 2000, "DIAMOND": 2400}
DIV = {"I": 1, "II": 2, "III": 3, "IV": 4}


def get(path):
    req = urllib.request.Request(DAK + path, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def num(tier, rank, lp):
    """페이지의 dakNum과 같은 점수: 아이언 4 0LP = 0, 다이아 1 99LP = 2799, 마스터 이상은 2800 + LP."""
    if not tier or tier == "UNRANKED":
        return None
    return 2800 + lp if tier not in BASE else BASE[tier] + (4 - DIV.get(rank, 4)) * 100 + lp


def profile(riot_id):
    name, tag = riot_id.split("#")
    key = "summoners/kr/" + urllib.parse.quote(f"{name}-{tag}")
    import setinfo
    season = setinfo.SEASON  # 본섭 랭크 season (PBE 기간에 set19로 잡혀 친구 판이 0이던 것, 2026-11-23)
    try:
        get(f"rpc/summoner-sync/by-name/kr/{urllib.parse.quote(f'{name}-{tag}')}?web=1")  # 새 판 받아오기
    except Exception:
        pass
    pf = get(f"{key}/profile?season={season}")
    logs, page = [], 1
    while page <= 5:
        r = get(f"{key}/league-logs?queueId=1100&season={season}&page={page}&size=200&sort=desc")
        logs += r.get("summonerLeagueLogs") or []
        if len(logs) >= r["meta"]["totalCount"] or not r.get("summonerLeagueLogs"):
            break
        page += 1
    ms = get(f"{key}/matches?season={season}&page=1&queueId=1100")
    puuid = pf["summoner"]["puuid"]
    lg = next((x for x in pf.get("summonerLeagues") or [] if x["queueId"] == 1100), None)
    pl = next((x for x in pf.get("summonerSeasonPlacements") or [] if x["queueId"] == 1100), None)
    matches = []
    for m in ms.get("matches") or []:
        me = next((p for p in m["participants"] if p["puuid"] == puuid), None)
        if me:
            matches.append({"riot_match_id": f"KR_{m['matchId']}", "queue_id": m["queueId"], "placement": me["placement"], "match_timestamp": m["gameCreatedAt"]})
    pts = sorted([x[0], num(x[1], x[2], x[3]), x[4]] for x in logs if num(x[1], x[2], x[3]) is not None)
    return {
        "riot_id": riot_id,
        "ranked": {"rating_text": f"{lg['tier']} {lg['rank'] or 'I'} {lg['leaguePoints']} LP", "rating_numeric": num(lg["tier"], lg["rank"], lg["leaguePoints"])} if lg else {},
        "ranked_season_stats": {"1100": {"total": sum(pl["values"]), "placements": pl["values"]}} if pl else {},
        "_logs": pts,
        "matches": matches,
    }


def main():
    players = []
    for f in FRIENDS:
        try:
            players.append(profile(f))
            print(f, players[-1]["ranked"].get("rating_text"), len(players[-1]["_logs"]), "판 LP 기록")
        except Exception as e:
            print("실패", f, e)
    OUT.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "players": players}, ensure_ascii=False, separators=(",", ":")))
    print(f"{OUT.relative_to(ROOT)}: {len(players)}명, {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
