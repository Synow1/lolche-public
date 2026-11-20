# 세트 19 대비 (2026-11-16 준비, 출시 12/1 패치 19.1 예정·PBE 11/17 무렵)

## 저절로 되는 것 (MetaTFT 통계 패치가 19.x가 되는 날)
- 세트 번호는 `scripts/setinfo.py` 한 곳: data/patch_state.json의 `metatft` 앞자리 (롤체지지·PBE가 먼저 19가 돼도 MetaTFT에 판이 없으면 안 바꿈). 손으로 고정은 `LOLCHE_SET=19`.
  - 쓰는 곳: tft_data.SET(MetaTFT 원문·팀 코드), build_tfa(아카데미 set=), fetch_icons(유닛 접두어), crawl_boards·snap_dist·snap_rank·build_friends·my_games(롤체지지 season), build_esports(APAC 사이트: set19.apactft.com이 열려 있으면 19, 아니면 18), build_oldsets(지난 세트 표), 페이지 SET_ID·SET_NAME(build_page.py가 `__SET_ID__`·`__SET_NAMES__`를 채움).
- check_patch.py: 앞자리가 바뀐 날 `set_started` 기록 + `newset` 동작 → update.sh newset: build_oldsets(방금 끝난 세트 18을 지난 시즌 표에 넣음). 끝나면 `check_patch.py --done newset`.
- qa.js: set_started 뒤 2주는 판·랭킹·덱파워·아카데미 티어표가 있어야 하는 검사를 '참고'로 (화면 밀림·오류 검사는 그대로).
- 페이지: 손으로 쓴 세트 전용 글(`data-set="18"`: 수호령 탭, 패치 노트 탭, 덱별 추천템·상징 쓰임 목록, 정찰 탭 협곡야수 줄, 증강 탭 상징 문단, 이스포츠 컵 일정)은 숨기고 탭 전체면 "새 시즌 내용은 준비 중이에요". 아카데미는 tfa.json의 set이 지금 세트와 다르면 "올라오면 바로 보여요".
- tactics.tools 패치 번호는 build_db가 찾는다 (지금 세트 유닛 DA_19_ 판이 20만 넘는 가장 높은 번호). 없으면 유닛별 템 통계를 비워 둔다(지난 세트 것을 섞지 않음).
- 덱파워: crawl_boards가 다른 세트 판을 지우고, 300판이 안 되면 build_power가 끈다(필드 가치만). 1~2일이면 다시 켜짐.
- snap_rank: 순위표가 비면 그날을 저장하지 않음.
- 업데이트 소식: 패치 앞자리가 바뀌면 줄줄이 말고 '새 시즌' 요약 한 덩어리.

## 사람이 할 것 (세트 19 첫날~첫 주)
1. data/sets.json 19의 한국어 이름 넣기 (지금은 영어 Prismatic Tour). 롤 공식 한국어 패치 노트에서 확인.
2. 새 시즌 공략 글: 패치 노트 탭(118_patch.html), 세트 메커니즘 탭(수호령 자리 → 새 메커니즘), 덱별 추천템·상징 쓰임(113_items.html), 정찰 탭 세트 줄 → 새 글은 `data-set="19"`.
   - qa.js 참고에 '새 시즌 공략을 아직 안 씀'이 남아 있으면 아직 안 쓴 것.
3. 판 기록 이름: 세트 18부터 롤체지지·CommunityDragon은 `DA_18_Ornn`, `DA_Nidalee18_AP` 같은 이름. 세트 19 이름 규칙이 또 바뀌는지 첫날 판 하나로 확인 (build_oldsets.set_no, 350_rank.js apiUnit, build_power 이름 맞추기).
4. 설명 원문: 18.6부터 템·증강 설명이 비어 온다(item_text.json·aug_text.json 캐시로 채움). 새 세트 새 템·증강은 캐시에 없으니 db.json 설명이 비면 원문을 찾아 넣기.
5. 이스포츠: build_esports SCHEDULE(세트 19 월즈·대회 일정), CUPS(TPC 컵 이름), WORLDS에 (19, 이름) 추가. APAC 사이트가 set19로 열리면 APAC_EVENTS 주소가 같은지 확인.
6. guide/ 문서(커리큘럼 10·12장, 00_한장요약 덱 표)를 새 세트로.
7. Java/NATIVE는 바꿀 필요 없음 (proxy 허용 호스트는 세트와 무관).

## 2026-11-16 준비하며 찾은 버그
- tactics.tools 패치 번호가 16210(18.5)에 묶여 있어서 db.json·items.json 유닛별 템 통계가 18.5 것이었음 → 자동으로 찾게 고침(16220).
- build_oldsets가 `DA_` 이름(세트 18)을 못 읽어 세트 19가 되면 세트 18 전적이 이름·아이콘 없이 나올 뻔 → DA_ 규칙 추가 (DA_18_X, DA_X18_Y, DA_ 템).
- 페이지 apiUnit이 `DA_18_`만 지웠음 → 세트 번호 무관하게.
