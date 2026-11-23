#!/usr/bin/env python3
"""그날 한국 랭크 티어 분포를 저장한다 -> data/dist/<시즌>/<날짜>.json, site/dist.json

    python3 scripts/snap_dist.py

전적 탭 '지난 시즌' 표의 상위 %를 최고점 찍은 날 분포로 계산하려고 매일 쌓는다 (롤체지지는 시즌 끝 분포만 남긴다).
그마·챌 컷도 같이 쌓는다 -> data/dist/cutoffs/<시즌>.json, site/cutoffs.json (LP 그래프의 컷 선).
롤체지지 data/summoner-tier-cutoffs 가 시즌 시작부터 날짜별 그마·챌 컷을 준다 (롤체지지 티어 그래프의 점선).
매일 점검(update.sh friends)에서 돈다.
"""
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
import setinfo  # noqa: E402
SEASON = setinfo.SEASON  # 본섭 랭크 season (12/1 전 set18). T.SET(공략 세트 19)을 쓰면 PBE 기간에 빈 분포가 됐다 (2026-11-23)
URL = f"https://tft.dakgg.io/api/v1/leaderboards/tier-distributions/kr?season={SEASON}&queueId=1100"


def main():
    with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
        dist = json.loads(r.read()).get("tierDistributions") or []
    if not dist:
        print("분포 없음")
        return
    folder = ROOT / "data" / "dist" / SEASON
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{date.today().isoformat()}.json").write_text(json.dumps(dist, ensure_ascii=False))
    # 페이지용: 시즌별 {날짜: 분포}
    out = {}
    for d in sorted((ROOT / "data" / "dist").iterdir()):
        if d.is_dir():
            out[d.name] = {f.stem: json.loads(f.read_text()) for f in sorted(d.glob("*.json"))}
    (ROOT / "site" / "dist.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{SEASON} {date.today()} 분포 저장 (누적 {len(out.get(SEASON, {}))}일)")
    save_cutoffs()


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
        return json.loads(r.read())


def save_cutoffs():
    """{날짜: [챌 컷 LP, 그마 컷 LP]}. 롤체지지 data/summoner-tier-cutoffs (시즌 시작부터 날짜별, 롤체지지 티어 그래프와 같은 값)."""
    path = ROOT / "data" / "dist" / "cutoffs" / f"{SEASON}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    cut = json.loads(path.read_text()) if path.exists() else {}
    try:
        res = get_json(f"https://tft.dakgg.io/api/v1/data/summoner-tier-cutoffs?shard=kr&season={SEASON}")
        for x in res.get("summonerTierCutoffs") or []:
            k = {"CHALLENGER": 0, "GRANDMASTER": 1}.get(x["tier"])
            if k is None:
                continue
            for d, lp in (x.get("leaguePoints") or {}).items():
                cut.setdefault(f"{d[:4]}-{d[4:6]}-{d[6:]}", [None, None])[k] = lp
    except Exception as e:
        print("컷 기록 실패", e)
    cut = dict(sorted(cut.items()))
    path.write_text(json.dumps(cut, ensure_ascii=False, indent=0))
    allc = {f.stem: json.loads(f.read_text()) for f in sorted(path.parent.glob("*.json"))}
    (ROOT / "site" / "cutoffs.json").write_text(json.dumps(allc, ensure_ascii=False, separators=(",", ":")))
    print(f"컷 {len(cut)}일 (그마 {sum(1 for v in cut.values() if v[1] is not None)}일)", list(cut.items())[-1] if cut else "")


if __name__ == "__main__":
    main()
