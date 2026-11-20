#!/usr/bin/env python3
"""한국 랭킹 1~1000위 스냅샷 -> data/rank/<시즌>/<날짜>.json, site/rank_hist.json

    python3 scripts/snap_rank.py              # 오늘 순위표 저장 (매일 점검 update.sh friends)
    python3 scripts/snap_rank.py --backfill 7 # N일 전 순위를 각 랭커의 LP 기록(league-logs)으로 만들어 넣기 (한 번만)

랭킹 탭의 '최근 1주 LP·순위 변동'용. 롤체지지·MetaTFT 모두 지난 순위를 안 줘서 직접 쌓는다.
파일: {"riot_id 소문자": [순위, 마스터 이상 LP]}. site/rank_hist.json은 7일 전(없으면 가장 오래된) 하루치만.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SEASON = "set" + T.SET.replace("TFTSet", "").replace("_2", ".5")
DAK = "https://tft.dakgg.io/api/v1/"
KST = timezone(timedelta(hours=9))
APEX = {"MASTER", "GRANDMASTER", "CHALLENGER"}


def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
                return json.loads(r.read())
        except Exception:
            time.sleep(2 * (i + 1))
    return {}


def ladder(n=1000):
    rows = []
    for p in range(1, n // 100 + 1):
        rows += get(f"{DAK}leaderboards/summoners/kr?page={p}&queueId=1100&season={SEASON}").get("summonerRankings") or []
    return [r for r in rows if r.get("tier") in APEX]


def save(day, snap):
    folder = ROOT / "data" / "rank" / SEASON
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{day}.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))


def site_hist():
    folder = ROOT / "data" / "rank" / SEASON
    days = sorted(f.stem for f in folder.glob("*.json"))
    target = (datetime.now(KST).date() - timedelta(days=7)).isoformat()
    # 7일 전에 가장 가까운 날 (스냅샷이 빠진 날이 있으면 12일 전 것을 '1주'로 보여주던 문제). 오늘 것은 제외
    from datetime import date as _d
    today = datetime.now(KST).date().isoformat()
    cand = [d for d in days if d < today]
    base = min(cand, key=lambda d: abs((_d.fromisoformat(d) - _d.fromisoformat(target)).days)) if cand else (days[0] if days else None)
    if not base or base == datetime.now(KST).date().isoformat():
        return
    out = {"season": SEASON, "date": base, "players": json.loads((folder / f"{base}.json").read_text())}
    (ROOT / "site" / "rank_hist.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print("rank_hist 기준", base)


def backfill(days):
    """지금 1~1000위 각자의 LP 기록에서 N일 전 LP를 찾아 그날 순위를 만든다 (그날 1000위 안이던 사람만 대충 맞음)."""
    target = datetime.now(KST) - timedelta(days=days)
    tms = target.timestamp() * 1000
    rows = ladder()

    def lp_at(r):
        name = urllib.parse.quote(f"{r['gameName']}-{r['tagLine']}")
        logs = get(f"{DAK}summoners/kr/{name}/league-logs?queueId=1100&season={SEASON}&page=1&size=200&sort=desc").get("summonerLeagueLogs") or []
        before = [x for x in logs if x[0] <= tms]
        if not before:
            return None
        x = max(before, key=lambda x: x[0])
        return (f"{r['gameName']}#{r['tagLine']}".lower(), x[3] if x[1] in APEX else None)

    with ThreadPoolExecutor(6) as ex:
        got = [g for g in ex.map(lp_at, rows) if g and g[1] is not None]
    got.sort(key=lambda g: -g[1])
    snap = {k: [i + 1, lp] for i, (k, lp) in enumerate(got)}
    save(target.date().isoformat(), snap)
    print(f"{target.date()} 백필 {len(snap)}명")


def main():
    if "--backfill" in sys.argv:
        backfill(int(sys.argv[sys.argv.index("--backfill") + 1]))
    rows = ladder()
    snap = {f"{r['gameName']}#{r['tagLine']}".lower(): [i + 1, r["leaguePoints"]] for i, r in enumerate(rows)}
    if not snap:  # 새 시즌 첫날처럼 아직 순위표가 비면 빈 날을 저장하지 않는다 (1주 변동 비교가 0명과 비교되지 않게)
        print("랭킹이 아직 비어 있음 -> 저장 안 함"); site_hist(); return
    save(datetime.now(KST).date().isoformat(), snap)
    print(f"{datetime.now(KST).date()} 랭킹 {len(snap)}명 저장")
    site_hist()


if __name__ == "__main__":
    main()
