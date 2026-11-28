#!/usr/bin/env bash
# 자동 갱신 한 번에: bash scripts/update.sh quick|full|esports [...]
#   quick   : 유닛·템·증강 원문, 검색 DB, 추천 덱, 아이콘 (패치 하루 뒤)
#   full    : quick + 덱 통계·티어 비교·시너지 통계·가이드 문서 (패치 사흘 뒤)
#   esports : 대회 결과·프로 포인트·랭킹 스냅샷 (대회 기간 매일)
#   decks   : 저녁 점검용. MetaTFT 덱·템·도감·아카데미만 (매일 17:19)
#   friends : 친구 탭 스냅샷 + 그날 티어 분포 저장 + 덱파워 판 기록 모으고 다시 학습 + TFT 아카데미 티어표 + 덱·아이템 통계 (매일)
# 끝나면 APK·앱 업데이트 파일을 만들어 Synow1/lolche-public 에 올린다. 게시·커밋·알림은 CLAUDE.md '자동 갱신 루틴'대로.
set -euo pipefail
cd "$(dirname "$0")/.."
# MetaTFT 원문이 잠깐 비어 올 때가 있다. 확인해서 이상하면 2분 뒤 한 번 더 받고, 그래도 이상하면 멈춘다.
fetch_raw() {
  python3 scripts/tft_data.py "$1"
  python3 scripts/check_data.py raw || { sleep 120; python3 scripts/tft_data.py "$1"; python3 scripts/check_data.py raw; }
}
# 덱파워 지속 최신화: 라이브 새 패치 직후(최신 패치 < 4000판 또는 패치 불일치)는 더 많이 수집, PBE 기간엔 PBE 덱파워도 같이 수집·재학습
POWER_DONE=0
power_latest_n() {
  python3 -c "
import json
d = json.load(open('site/power.json'))
ps = json.load(open('data/patch_state.json'))
cur = (ps.get('patch') or '').strip()
pats = d.get('patch') or []
if d.get('off') or len(pats) != 1 or (cur and pats[0] != cur):
    print(0)
else:
    print(d.get('n', 0))
" 2>/dev/null || echo 0
}
refresh_power() {
  local mode="${1:-daily}"
  if [ "$POWER_DONE" = "1" ]; then return; fi
  POWER_DONE=1
  local is_pbe
  is_pbe=$(python3 -c "import sys; sys.path.insert(0,'scripts'); import setinfo; print(1 if setinfo.PBE else 0)" 2>/dev/null || echo 0)
  if [ "$mode" = "evening" ]; then
    # 저녁 점검(17:19): PBE 일일 빌드나 본섭 새 패치 직후(<3000판 또는 패치 불일치)에만 빠르게 증분 수집·재학습
    if [ "$is_pbe" = "1" ]; then
      python3 scripts/crawl_boards.py --pbe 800 120 || echo "PBE 판 기록 못 모음"
      python3 scripts/build_power.py --pbe || echo "PBE 덱파워 학습 실패"
    else
      local latest_n
      latest_n=$(power_latest_n)
      if [ "${latest_n:-0}" -lt 3000 ]; then
        python3 scripts/crawl_boards.py 1000 180 || echo "판 기록 못 모음"
        python3 scripts/build_power.py || echo "덱파워 학습 실패"
      fi
    fi
    return
  fi
  local live_goal=1500 live_cap=300
  if [ "$mode" = "patch" ]; then
    live_goal=2200; live_cap=380
  else
    local latest_n
    latest_n=$(power_latest_n)
    if [ "${latest_n:-0}" -lt 4000 ]; then
      live_goal=2200; live_cap=380
    fi
  fi
  python3 scripts/crawl_boards.py "$live_goal" "$live_cap" || echo "판 기록 못 모음"
  python3 scripts/build_power.py || echo "덱파워 학습 실패"
  if [ "$is_pbe" = "1" ]; then
    python3 scripts/crawl_boards.py --pbe 1200 180 || echo "PBE 판 기록 못 모음"
    python3 scripts/build_power.py --pbe || echo "PBE 덱파워 학습 실패"
  fi
}
for mode in "$@"; do
  case "$mode" in
    quick)
      fetch_raw fetch
      python3 scripts/tft_detail.py
      python3 scripts/build_db.py
      python3 scripts/build_items.py
      python3 scripts/build_meta.py
      python3 scripts/build_guides.py || echo "롤체지지 가이드 못 받음 (2026-11-18부터 403) -> 지난 guides.json 유지"
      python3 scripts/build_tfa.py || echo "TFT 아카데미 못 받음"
      python3 scripts/fetch_icons.py
      refresh_power patch ;;
    full)
      fetch_raw all
      python3 scripts/tft_detail.py
      python3 scripts/build_db.py
      python3 scripts/build_items.py
      python3 scripts/build_meta.py
      python3 scripts/build_guides.py || echo "롤체지지 가이드 못 받음 (2026-11-18부터 403) -> 지난 guides.json 유지"
      python3 scripts/build_tfa.py || echo "TFT 아카데미 못 받음"
      python3 scripts/fetch_icons.py
      python3 scripts/build_rank.py
      refresh_power patch ;;
    decks)  # 저녁 점검 17:19 KST: MetaTFT 덱·템·도감·아카데미 + PBE/새패치 직후 덱파워 증분 최신화
      fetch_raw fetch
      python3 scripts/build_s19.py || echo "19시즌 도감 못 받음"
      python3 scripts/build_meta.py
      python3 scripts/build_db.py
      python3 scripts/build_items.py
      python3 scripts/build_tfa.py || echo "TFT 아카데미 못 받음"
      python3 scripts/fetch_icons.py
      refresh_power evening ;;
    newset)  # 새 세트 첫날 (check_patch.py): 방금 끝난 세트를 지난 시즌 표에 넣고 PBE 캐시를 비운 뒤 새 세트 초기 스냅샷·덱파워 초기화
      rm -rf raw/s19_comps raw/mt_units/pbe_*.json raw/items_*.json
      python3 scripts/build_oldsets.py
      python3 scripts/build_s19.py || echo "19시즌 도감 갱신 생략"
      python3 scripts/snap_rank.py || echo "새 시즌 랭킹 스냅샷 생략"
      python3 scripts/snap_dist.py || echo "새 시즌 티어 분포 생략"
      python3 scripts/build_friends.py || echo "새 시즌 친구 스냅샷 생략"
      python3 scripts/setinfo.py
      python3 scripts/crawl_boards.py 1500 250 || echo "새 시즌 초기 판 기록 못 모음"
      python3 scripts/build_power.py || echo "새 시즌 덱파워 초기화 생략" ;;
    esports)
      python3 scripts/build_esports.py
      python3 scripts/build_rank.py ;;
    friends)
      python3 scripts/build_friends.py
      python3 scripts/snap_dist.py
      python3 scripts/snap_rank.py
      python3 scripts/build_tfa.py || echo "TFT 아카데미 못 받음"
      python3 scripts/build_s19.py || echo "19시즌 미리보기 못 받음"  # PBE는 매일 바뀐다 (세트 19 출시 전까지)
      # 덱·아이템·DB를 먼저 받아야 덱파워(build_power.py)가 최신 사전 지식(ta/up/ip/chroma)으로 학습한다
      fetch_raw fetch
      python3 scripts/build_meta.py
      python3 scripts/build_db.py   # 증강 티어·유닛 통계 (증강 탭이 3일 묵던 문제)
      python3 scripts/build_items.py
      python3 scripts/fetch_icons.py  # 새로 나온 템·증강 아이콘 (티어표에 새 템이 생기면 아이콘이 빠졌었다)
      refresh_power daily ;;
    *) echo "모르는 모드: $mode"; exit 1 ;;
  esac
done
# 빈 데이터는 앱에 올리지 않는다 (이상하면 여기서 멈춤 -> 사용자에게 알릴 것)
python3 scripts/check_data.py site
# 매일 앱 업데이트도 올린다 (앱이 켜질 때 알아서 받음). 올리기 실패해도 넘어감.
bash android/build.sh
bash scripts/publish_app.sh || echo "lolche-public 에 못 올림"
