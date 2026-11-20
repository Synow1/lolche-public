#!/usr/bin/env bash
# 자동 갱신 한 번에: bash scripts/update.sh quick|full|esports [...]
#   quick   : 유닛·템·증강 원문, 검색 DB, 추천 덱, 아이콘 (패치 하루 뒤)
#   full    : quick + 덱 통계·티어 비교·시너지 통계·가이드 문서 (패치 사흘 뒤)
#   esports : 대회 결과·프로 포인트·랭킹 스냅샷 (대회 기간 매일)
#   friends : 친구 탭 스냅샷 + 그날 티어 분포 저장 + 덱파워 판 기록 모으고 다시 학습 + TFT 아카데미 티어표 + 덱·아이템 통계 (매일)
# 끝나면 APK·앱 업데이트 파일을 만들어 Synow1/lolche-public 에 올린다. 게시·커밋·알림은 CLAUDE.md '자동 갱신 루틴'대로.
set -euo pipefail
cd "$(dirname "$0")/.."
# MetaTFT 원문이 잠깐 비어 올 때가 있다. 확인해서 이상하면 2분 뒤 한 번 더 받고, 그래도 이상하면 멈춘다.
fetch_raw() {
  python3 scripts/tft_data.py "$1"
  python3 scripts/check_data.py raw || { sleep 120; python3 scripts/tft_data.py "$1"; python3 scripts/check_data.py raw; }
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
      python3 scripts/fetch_icons.py ;;
    full)
      fetch_raw all
      python3 scripts/tft_detail.py
      python3 scripts/build_db.py
      python3 scripts/build_items.py
      python3 scripts/build_meta.py
      python3 scripts/build_guides.py || echo "롤체지지 가이드 못 받음 (2026-11-18부터 403) -> 지난 guides.json 유지"
      python3 scripts/build_tfa.py || echo "TFT 아카데미 못 받음"
      python3 scripts/fetch_icons.py
      python3 scripts/build_rank.py ;;
    newset)  # 새 세트 첫날 (check_patch.py): 방금 끝난 세트를 지난 시즌 이름·아이콘 표에 넣는다. 나머지는 quick/full이 새 세트로 받는다
      python3 scripts/build_oldsets.py
      python3 scripts/setinfo.py ;;
    esports)
      python3 scripts/build_esports.py
      python3 scripts/build_rank.py ;;
    friends)
      python3 scripts/build_friends.py
      python3 scripts/snap_dist.py
      python3 scripts/snap_rank.py
      python3 scripts/crawl_boards.py 1500 300 || echo "판 기록 못 모음"
      python3 scripts/build_power.py
      python3 scripts/build_tfa.py || echo "TFT 아카데미 못 받음"
      python3 scripts/build_s19.py || echo "19시즌 미리보기 못 받음"  # PBE는 매일 바뀐다 (세트 19 출시 전까지)
      # 덱·아이템 통계는 MetaTFT '최근 3일'이라 매일 다시 받는다 (패치 때만 받으면 며칠씩 묵음)
      fetch_raw fetch
      python3 scripts/build_meta.py
      python3 scripts/build_db.py   # 증강 티어·유닛 통계 (증강 탭이 3일 묵던 문제)
      python3 scripts/build_items.py
      python3 scripts/fetch_icons.py ;;  # 새로 나온 템·증강 아이콘 (티어표에 새 템이 생기면 아이콘이 빠졌었다)
    *) echo "모르는 모드: $mode"; exit 1 ;;
  esac
done
# 빈 데이터는 앱에 올리지 않는다 (이상하면 여기서 멈춤 -> 사용자에게 알릴 것)
python3 scripts/check_data.py site
# 매일 앱 업데이트도 올린다 (앱이 켜질 때 알아서 받음). 올리기 실패해도 넘어감.
bash android/build.sh
bash scripts/publish_app.sh || echo "lolche-public 에 못 올림"
