# lolche 작업 규칙

롤체(TFT) 공부 저장소. 사용자는 폰으로 플레이하는 다이아 경험자이고, 이 레포의 문서와 페이지로 공부한다.

## 깃허브 (2026-11-20부터 `main` 단일 브랜치, 사용자 결정)
- **클로드와 제미나이 모두 `main`에서만 작업한다.** PR 없음, 다른 작업 브랜치 없음.
- **작업·예약 루틴을 시작하기 전에 항상** `git checkout main && git pull --ff-only origin main`으로 최신 커밋을 먼저 받는다 (제미나이가 그사이 푸시했을 수 있음). 끝나면 `git push origin main`. 푸시가 거절되면(그사이 새 커밋) 다시 `git pull --ff-only` 또는 `git pull --rebase origin main` 뒤 점검을 다시 돌리고 푸시. 남의 커밋을 force push로 덮지 않는다.
- **역할**: 클로드 = 매일 예약 점검(`check_patch.py`·`update.sh`), 데이터·19시즌 PBE·대회 갱신, 영어 문구 번역, 패치 노트, 전적 코칭. 제미나이 = 큰 UI/UX 개편·기능 개발·리팩토링 (`main`에 직접 푸시). 화면 구조를 크게 바꾸는 일은 제미나이 몫이니, 클로드는 데이터 작업 중 화면 버그를 보면 작게 고치거나 기록해 둔다.

## 새 세션이면
- **`guide/HANDOFF.md`부터 읽는다** (세션 ID·예약 작업 옮기기, 사용자 성향, 앱·덱파워 현황, 남은 일). 화면 확인은 `node scripts/ui_check.js`.

## 페이지 고치기 (2026-11-13부터)
- **페이지는 `site/src/` 조각에서 고친다.** `site/tft-guide.html`은 조립 결과물이라 직접 고치지 않는다 (직접 고치면 `build_page.py`가 멈춘다). 조각: `010_style.css`(스타일), `1NN_<탭>.html`(탭별 화면), `300_core.js`~`400_app.js`(기능별 스크립트, 한 IIFE를 이름순으로 이어 붙임). 고친 뒤 `python3 scripts/build_page.py` (`android/build.sh`가 자동으로 돌림). 이 문서 아래쪽에서 "`site/tft-guide.html`의 X를 고친다"는 말은 모두 `site/src/`의 해당 조각을 뜻한다.
- **구조를 바꾸거나 정리할 때는 `node scripts/snap.js base` → 고침 → `node scripts/snap.js cmp`.** 응답·시계를 얼려 23개 화면(탭 19 + 덱 상세·아카데미 상세·조합표·전적 검색)을 찍고 픽셀로 비교한다. 겉을 안 바꾸는 작업이면 "모두 그대로"가 나와야 하고, 일부러 바꾼 작업이면 의도한 화면만 달라야 한다.

## 앱 문구
- **앱에 들어가는 글(버튼·설명·상태·버전 노트)은 `guide/WRITING.md` 기준으로 쓴다.** 상용 앱 말투: 해요체, 짧게, 이모지·느낌표·비유·농담·괄호 속사정 없음. 용어 통일(최종 덱, 필드 가치, 덱파워, `11/6 07:57 업데이트`). 새 문구를 넣거나 고칠 때마다 확인.
- **올리기 전 자동 점검 `node scripts/qa.js`** (publish_app.sh가 자동으로 돌리고 실패하면 안 올림, 2026-11-08 사용자: "도대체 왜 계속 내가 봐줘야 하지"). 모든 탭 × 폭 360·412의 오류·가로 밀림·깨진 이미지·숨김 오류, 탭별 내용이 실제로 있는지(조합표 칸 그림, 덱 줄 수 등), 버튼 동작, 데이터 신선도. **새 기능을 넣거나 버그를 고치면 그걸 잡는 검사를 qa.js에 같이 넣는다** (지적받은 버그 = 검사 하나).
- **화면 디자인은 `guide/DESIGN.md` 기준** (색 토큰, 강조색 하나, 테두리 대신 밝기, 덱 줄·상세 머리 모양). 새 화면도 이 틀로.

## 답하기 전에
- **사용자 의견도 비판적으로 판단한다** (2026-11-07: "내 의견도 항상 비판적으로 판단해라"). 제안이 더 나으면 따르고, 문제가 있으면 이유와 더 나은 방법을 같이 말한다.
- **항상 최고 품질로, 알아서 잘 (사용자 2026-11-07: "항상 최고의 퀄리티+알잘딱으로 뽑으려고 노력하고, 웹검색은 기본이다").** 기능·디자인·분석 모두 웹검색으로 1차 자료(공식 문서, 실제 경쟁 앱·사이트 화면)를 먼저 확인하고 시작한다. 2차 요약 글만 보고 끝내지 않는다. 시키지 않아도 같은 종류 문제·빠진 데이터·더 나은 방법을 찾아 같이 처리한다.
- **먼저 `python3 scripts/kb.py 키워드`로 지식 노트(`guide/kb/`: 규칙 숫자·세트 숨은 조건·운영·갤 원문·내가 틀렸던 것)를 찾는다.** 새로 안 사실·지적받은 건 `guide/kb/`에 바로 적는다 (`guide/kb/README.md`).
- **모르는 건 "모른다"로 끝내지 말고 찾아서 답한다.** 순서: `guide/kb/` → `guide/data/` 상세 파일 → `raw/lookup_ko.json` 원문 → MetaTFT API (`scripts/tft_data.py`) → DC 롤체갤 (`scripts/dc_crawl.py search 키워드`) → 웹 검색.
- 시너지 조건은 `desc`만 보지 말 것. 숨은 조건이 `postTierDesc`와 `extras.traitTooltips`에 있다. 예: 일월식 = 햇빛 3 + 달빛 3 (달빛·햇빛의 postTierDesc에만 적혀 있음).
- 덱 통계를 말할 때는 기준을 같이 말한다. 덱 묶음(`comps_stats`)과 시너지(`traits`)는 다른 집계이고, 시너지 통계는 마지막 보드 기준이라 늦게 켜지는 시너지가 좋아 보인다.
- **템 조합·유닛 조합 질문은 MetaTFT Data Explorer로 직접 질의한다**: `python3 scripts/explorer.py "케일+구인수의 격노검+라바돈의 죽음모자"` (`--rank gm` 등). 템 이름은 한국어 정식 이름. 유닛 페이지 API(`unit_detail_items`)에는 조합 필터가 없지만 Explorer에는 있다. tactics.tools(`d3.tft.tools/stats2/unit/1100/<유닛ID>/16210/1`)는 다이아+ 기준 itemPairs/itemTrios가 있어 교차 확인용.
- 사용자는 저티어다. 저티어에서 센 덱과 고티어에서 센 덱을 구분해서 둘 다 알려준다 (`guide/data/06_티어별_비교.md`).

## 내 전적 (사용자가 "전적 업데이트", "이번 판 봐줘" 등을 말하면)
```sh
python3 scripts/my_games.py          # MetaTFT에서 Synow#KR1 새 판 받기 -> data/me/matches/ 에 쌓고 data/me/games.json, site/me/games.json 생성
```
0. 튕김·자리 비움 등 분석에서 뺄 판은 `data/me/excluded.json`에 `{"KR_매치ID": "이유"}`로 적는다. 카드에는 "분석 제외"로 남고 요약 통계에서 빠진다.
1. 사용자가 판 흐름(3성 찍은 라운드, 렙업 라운드 등)을 말하면 `data/me/notes.json`에 `{"KR_매치ID": "메모"}`로 적는다.
2. 새 판을 보고 `data/me/coach.json`(headline / points / next)을 다시 쓴다. 근거는 판 데이터 + Explorer 통계. 판이 늘수록 경향 위주로.
3. `python3 scripts/my_games.py --offline`으로 코멘트를 합친다 (분석은 채팅으로 답한다).
4. `data/me/`는 커밋한다. MetaTFT 프로필은 최근 판만 보여줘서, 레포가 전적의 원본이다.
- 페이지 '내 전적' 탭의 **전적 새로고침 요청** 버튼은 Claude Code Remote 커넥터로 이 세션(`session_01VCcDCEg6hT8M9R4abL4j3G`)에 "[공략 노트 페이지 버튼] 전적 업데이트 요청" 메시지를 보낸다. 사용자가 직접 누른 버튼이니 위 0~4 절차를 그대로 하면 된다. 세션이 바뀌면 `site/tft-guide.html`의 `SESSION` 값을 바꾼다.
- 판 원본에는 라운드별 흐름·증강이 없다 (폰 플레이라 MetaTFT 앱 기록이 없음). 진단은 최종 보드 기준이다.

## 전적·친구·랭킹 데이터 출처
- 롤체지지 갱신 `rpc/summoner-sync/...`는 처음엔 `{retry_after: ms}`만 주고, 기다렸다 다시 부르면 `{done: true}`. done까지 기다려야 새 LP가 보인다 (`dakSync`). 친구 탭은 들어올 때(2분 간격) 친구 전원을 이렇게 갱신한다.
- 전적 검색·친구 탭은 롤체지지(닥지지) API `https://tft.dakgg.io/api/v1/summoners/kr/<이름-태그>/{profile,matches,league-logs,overviews}?season=set18`. MetaTFT 프로필은 저티어 판이 빠진다 (이렐꼴1픽 24판 중 19판만 있었음). 갱신은 `rpc/summoner-sync/by-name/kr/<이름-태그>?web=1`.
- 닥지지 `league-logs` 행 = [시각, 티어, 단계, LP, 판수, 순방수]. **판수(plays)가 그 판까지 랭크 판 수**라 판과 LP를 맞추는 열쇠다 (`lpOf`가 판 번호로 맞춤). 판 시각(`gameCreatedAt`)은 **로비 전체가 끝난 시각**이고 LP 로그는 **내가 탈락한 시각**이라, 일찍 탈락하면 판 기록이 10~20분 늦게 나오고, 탈락 후 바로 다음 판을 돌리면 두 판 시간이 겹친다. 기록이 아직 없는 판은 '기록 받는 중' 카드로 보여주고 1분마다 다시 받는다 (현재 LP를 앞 판에 붙이면 안 됨).
- 롤체지지 API 더 (페이지 코드에서 찾음, 2026-11-04): `data/summoner-tier-cutoffs?shard=kr&season=set18`(날짜별 그마·챌 컷, LP 그래프 점선), `recent-win-matches?shard=kr`(한국 그마·챌 최근 1등 보드 ~75판, 덱파워 탭 '그마·챌 최근 1등'. 덱 탭 '최근 1등'은 v1.48.0에 빼고 그 자리에 TFT 아카데미), `team-builder-cell-stats?hl=ko&season=set18&tier=1`(챔피언별 자리 통계, 빌더 '추천 배치'), 프로필 `summonerLeagues[].rating`(판수·승리·순방·승률·순방률의 한국 상위 %). `meta-decks`는 글로벌·증강 없음, `streamer-decks`는 옛 시즌뿐이라 안 씀.
- 지난 시즌 최고 티어·판수만 MetaTFT `rating_history` (닥지지는 최종 티어만).
- 랭킹 목록은 MetaTFT(평균 등수·캐리) + 닥지지 `leaderboards/summoners/kr`의 tops(순방).
- 내 기록 탭은 없앴다 (v1.15.0). `my_games.py`·`data/me/`는 채팅으로 "이번 판 봐줘" 할 때 분석용으로만 쓴다 (페이지 게시 없음).

## 데이터 갱신 (패치마다)
- **기본 통계 기준은 에메+** (2026-11-07 사용자: "기본값은 플래+ 말고 에메+로, 전체적으로"). `tft_data.RANKS`(원문·유닛·시너지·아이템), 페이지 기본값(덱·아이템·재료 탭), 상징 탭이 에메+. 플래+는 고를 수 있는 기준으로만 남긴다. 덱 기준별 키는 그대로(`all` = 플래+, `emer` = 에메+).
```sh
python3 scripts/tft_data.py all     # MetaTFT -> guide/data/01~06
python3 scripts/tft_detail.py       # 상세 -> guide/data/10~14 (시너지·유닛·아이템·증강 원문, 시너지 단계별 통계)
python3 scripts/build_guides.py     # 추천 덱 -> site/guides.json (롤체지지 가이드 덱: 자리·식물·템·추천 증강·완성 시너지·레벨별 보드 4~10렙·레벨업 추천 라운드, MetaTFT 덱과 짝)
python3 scripts/build_meta.py       # 메타 덱 탭 -> site/meta.json (덱별 최종 보드·자리·캐리 템·레벨업 타이밍·티어별 평균·난이도·추천 증강 프리즘/골드/실버 3개씩[MetaTFT 프로 가이드 comp_augment_tiers, 없으면 시너지 증강]·레벨별 필드 lvb·덱별 상징 성적 emb[상징 → 덱 탭]·기준별 st[평균,순방,승률,판수]와 tiers: all 플래+/emer 에메+/dia/top 마스터+/gmc 그마·챌/low 플래 미만, MetaTFT comps_stats를 permit_filter_adjustment=false로 따로 받음 — true면 그마·챌 표본이 작을 때 마스터까지 몰래 넓힘)
python3 scripts/build_db.py         # 검색 탭 DB -> site/db.json (유닛별 템·템 조합·성급·같이 쓰는 유닛·상성, tactics.tools 다이아+)
python3 scripts/build_items.py      # 아이템 티어표 -> site/items.json (티어별 템 등수·등급[MetaTFT 공식], 템별 챔피언 성적[tactics.tools 다이아+]. build_db.py 다음에)
python3 scripts/fetch_icons.py      # 아이콘 -> site/icons (db.json에 나오는 템 아이콘까지)
python3 scripts/build_esports.py    # 이스포츠 탭 -> site/esports.json (MetaTFT 대회 게임으로 이벤트별 순위, 프로 포인트, Liquipedia 국적)
python3 scripts/snap_dist.py        # 그날 티어 분포 -> data/dist/<시즌>/<날짜>.json, site/dist.json (매일)
python3 scripts/build_friends.py    # 친구 탭 스냅샷 -> site/friends.json (친구 목록은 스크립트 FRIENDS와 페이지 FRIENDS 둘 다)
python3 scripts/build_rank.py       # 랭킹 탭 스냅샷 -> site/rank.json (claude.ai 페이지용. 앱은 실시간)
python3 scripts/crawl_boards.py 300 80  # 덱파워 학습용 랭크 판 기록 (롤체지지, 티어 골고루, 보드마다 이름#태그) -> data/power/boards.jsonl.gz (커밋). 인자 = 새로 모을 판 수, 최대 요청. 다른 세트·42일 넘은 판은 지움
python3 scripts/build_power.py      # 덱파워 모델 -> site/power.json (최종 덱 -> 로비 순위 Plackett-Luce, 예상 등수는 보정표 cal. 4·5코 3성 개수는 log2(1+n)). 재검토 결과는 guide/kb/rules.md '덱파워 재검토'. 최근 21일·최신 패치부터 4000판, 지금 세트만(300판 안 되면 off). 특징: 유닛·별, 코스트·별, 템·템 종류, 유닛+템 궁합, 겹친 템, 3템 캐리, 시너지 단계·정확한 인원·MetaTFT 단계별 시너지 힘(raw/traits.json -> ta), 켜진 시너지 수, 레벨, 빈자리, 필드 가치, 3성 스킬 배율(lookup 3성/2성)·유닛·별 평균 등수(db.json)·아이템 평균 등수(raw/items.json). 증강은 판 기록에 없어 못 씀. **페이지 boardPower()가 feats()를 그대로 따라 계산하니 둘 다 같이 고칠 것**. + site/power_top.json(덱파워 탭 '최근 7일 센 판', 티어 묶음별 20). 전적 카드·로비 줄·최근 1등·덱파워 탭에 '💰필드 가치 · 덱파워(평균 100, 표준편차 40 = SCALE, 2026-11-14 사용자 요청으로 24→40. 0 밑은 0. 옆에는 상위%·예상 등수 대신 **실제 1등·순방 확률**(power.json `calw`, 점수 구간별 실제 비율, 페이지 `pwProbOf`), 상위%·예상 등수는 누르면; 색은 예상 등수 기준 `pwClsP`: 1.0등 빛나는 무지개 · 1.3등까지 무지개 · 1.5등까지 1등 색 · 2.5등 2등 색 · 3.5등 3등 색 · 4.5등 4등 색 · 그 밑 회색, 2026-11-06 사용자 요청) · 상위%(1% 안은 0.01% 단위)', 4·5코 3성 강조, 누르면 항목별. 매일 점검(friends)에서 둘 다 돈다
python3 scripts/build_tfa.py        # TFT 아카데미 탭 (아래 메뉴 '아카데미'. v1.48.0에 덱 탭 안으로 넣었다가 사용자가 번갈아 보기 불편하다고 해서 v1.51.0에 다시 분리) -> site/tfa.json (tftacademy.com API: 덱 티어·배치·템·증강·스테이지별 팁·유연한 교체(사이트 Flex Units, API maxCap — "고점"이 아님), 증강·아이템 티어표). 매일 점검(friends)·quick·full에서 돈다. **카드 안 탭(비슷한 덱)**: displayIndex 1000 이상은 버린 가이드가 아니라 같은 메인 챔피언 카드(1000 미만 중 가장 앞)의 탭이다 (comps의 `var`·`parent`, 카드의 `tabs`. 2026-11-14 사이트에서 확인: 아리 자이라 카드 = 아리 자이라·아리 모르가나·주문술사 아리·영혼 개화). 영어 글은 data/tfa_ko.json 번역을 붙인다: 끝에 '번역 없는 글 N'이 0이 아니면 `--missing`으로 뽑아 해요체로 번역해 넣고 다시 돌린다
python3 scripts/build_oldsets.py    # 지난 시즌 전적용 유닛·시너지·아이템 이름·아이콘 -> site/oldsets.json (CommunityDragon 버전별). 세트가 바뀔 때 한 번
python3 scripts/snap_rank.py        # 한국 1~1000위 매일 스냅샷 -> data/rank/<시즌>/<날짜>.json, site/rank_hist.json(7일 전, 랭킹 탭 1주 LP·순위 변동). 매일 점검(friends)에서 돈다. --backfill N 은 랭커들 LP 기록으로 N일 전 순위 만들기
```
갱신한 데이터는 `bash android/build.sh && bash scripts/publish_app.sh`로 앱에 올린다 (앱이 알아서 받음).
- **업데이트 소식** (v1.63.0, `site/src/397_whatsnew.js`): 앱이 새 버전·데이터를 받으면 한 번 띄운다. 기능은 version.json notes, 데이터는 `scripts/data_changes.py`가 지난번 올린 요약(`data/changes_base.json`)과 비교해 `site/changes.json`에 탭별(아카데미·덱·증강·아이템 티어, 이스포츠 우승, 패치)로 적는다. build.sh가 비교, publish_app.sh가 올리기 성공 뒤 `--commit`(기록 `data/changes_log.json`, 기준 갱신). 새 탭 데이터를 추가하면 digest()/diff()에도 넣는다.
- **claude.ai 아티팩트(https://claude.ai/artifact/9Xp87yVYgRCC2w9dVHFydJ)는 더 이상 관리하지 않는다** (사용자가 앱만 씀, 2026-11-01). 다시 게시하지 말 것.
그다음 손으로 고칠 것: `guide/롤체_챌린저_커리큘럼.md` 10·12장, `guide/00_한장요약.md` 덱 표, `site/tft-guide.html` 덱·패치 섹션.

## 19시즌 미리보기 탭 (v1.64.0, `#s19`, `site/src/120_s19.html`·`398_s19.js`)
- `python3 scripts/build_s19.py` -> `site/s19.json`·`site/icons/s19/`. MetaTFT PBE 원문(TFTSet19_pbe_ko_kr/en_us: 수치·해금·단계 효과) + 롤체지지 `data/*?season=set19`(한국어 이름·설명·증강 등급·새 증강) + MetaTFT CDN 아이콘. 영어뿐인 글은 `data/s19_ko.json`(끝에 '번역 없는 글 N' → `--missing`으로 뽑아 해요체로 번역). 매일 점검 friends에서 돈다. 상점에 안 나오는 변신 모습(shopUnit false)은 뺀다. 세트 19가 라이브가 되면 일반 탭이 19시즌이 되니 이 탭은 정리한다.

## 세트가 바뀔 때 (세트 19: 12/1 예정)
- **`guide/kb/set19_prep.md`부터 읽는다.** 세트 번호는 `scripts/setinfo.py` 한 곳(MetaTFT 패치 앞자리)이고 대부분 저절로 바뀐다. 사람이 할 것(세트 이름, 새 시즌 공략 글 `data-set="19"`, 대회 일정, 이름 규칙 확인)은 그 문서 목록대로.

## 덱 통계 갱신 요청 (페이지 덱 탭의 '갱신 요청' 버튼, 또는 사용자가 "덱 갱신")
- 앱은 '새로고침' 버튼이 MetaTFT comps_stats(플래+·골드↓·플래에메·다이아·마스터+)를 바로 받아 숫자·티어만 바꾼다 (보드·템·증강은 그대로, 덱 묶음 cluster_id가 바뀌면 안 바꿈).
- 사용자가 "덱 갱신"이라고 하면 `bash scripts/update.sh full` (앱 업데이트까지 올림) → 커밋·푸시. 패치가 안 바뀌었으면 버전은 그대로.

## 자동 갱신 루틴 (예약 작업이 매일 아침 이 세션을 깨운다)
0. `git checkout main && git pull --ff-only origin main` (제미나이 커밋을 먼저 받는다).
1. `python3 scripts/check_patch.py` → `actions` 확인. 비어 있으면 아무것도 하지 말고 끝낸다 (알림도 없음).
2. `notify`: 새 패치. 바로 사용자에게 알린다 (PushNotification, 없으면 다음 답장 맨 앞에). 패치 내용은 DC 롤체갤(`dc_crawl.py search <패치>`)·웹에서 찾아 `#patch` 섹션에 추가.
3. `newset`(새 세트 첫날, 맨 앞) / `quick` / `full` / `esports`가 있으면 `bash scripts/update.sh <모드들>` (APK까지 만든다). 한 모드씩 끝날 때마다 `python3 scripts/check_patch.py --done <모드>`.
   - `update.sh`는 `scripts/check_data.py`로 원문·앱 데이터가 비지 않았는지 확인하고, 이상하면 앱에 올리지 않고 멈춘다. 멈추면 원인(어느 파일의 무엇이 비었는지)을 찾아 고친 뒤 다시 돌리고, 못 고치면 사용자에게 한 줄로 알린다.
   - 18.6부터 원문에 템 설명이 비어 온다. 설명은 `data/item_text.json`(마지막 정상 설명)으로 채운다. 새 템이 생겼는데 설명이 없으면 게임 원문을 찾아 여기에 넣는다.
   - `full`이면 덱이 바뀌었는지 보고 `#decks`(덱 노트)·`guide/` 문서도 손본다.
4. 커밋 → `git push origin main` (거절되면 pull 후 다시), update.sh가 앱 업데이트까지 올림(앱이 알아서 받음), 한 줄 요약 (무엇이 바뀌었는지).
   - `friends`만 있으면 (매일 나옴, 티어 분포 저장 포함) 커밋·푸시하고 조용히 끝낸다 (알림 없음).
5. 대회 기간(`esports`)엔 우승자·한국 선수 결과를 한 줄로 알린다.
- SDK·raw 데이터는 컨테이너가 새로 뜨면 없다. `android/build.sh`와 `tft_data.py`가 알아서 다시 받는다.
- 예약 작업: '롤체 노트 매일 점검' (매일 09:41 KST). 끄려면 사용자에게 묻고 update_trigger로 enabled=false.

## 이스포츠 탭
- APAC은 공식 사이트(set<N>.apactft.com) 순위표, 나머지는 MetaTFT 게임 기록. 결승 우승자는 체크메이트(20점 넘긴 뒤 1등)로 정한다 (점수 1위가 우승이 아니다).
- 결승 동점은 스위스(앞 단계) 순위로 갈린다 (스페이스 갓 크라운: steelo 4위·bensac 5위, A Long 7위·TianLong 8위 둘 다 이걸로만 맞음. Liquipedia의 일반 동점 규칙과 다름). 공식 순위가 있으면 그걸 쓴다: `build_esports.py`의 `OFFICIAL`(Liquipedia 상금표 순서). 크라운이 끝나면 그 Liquipedia 페이지를 `data/esports/`에 받아둔다.
- **Liquipedia 공식 순위로 결승을 맞춘다** (`apply_liquipedia`): `data/esports/lq_*.json`의 상금표 순서로 결승 순위·우승자를 덮어쓰고, MetaTFT에 결승 게임이 없으면 공식 순위만으로 결승 표를 만든다(`lq`, 게임별 점수 없음). 이번 세트 지역 결승·TPC 컵·프로 포인트 페이지가 없으면 빌드가 30초에 한 번씩 받아 둔다(`lq_fetch_missing`, 429면 멈춤 → 다음 날 이어서). 국적은 Liquipedia 표 + 선수 페이지(한 번에 50명, `lq_players.json` 캐시). 이름은 팀 태그·띄어쓰기를 빼고 맞춘다 (L3SCoco = M8 L3S Coco). Liquipedia는 너무 자주 부르면 429로 한참 막힌다 — 한 번에 몰아서 부르지 말 것.
- '체크' 표시는 진행 중인 결승에만. 끝난 대회도 4일까지, 우승자가 비면 2주까지 매일 점검에서 esports를 다시 받는다 (`check_patch.esports_window`).
- 세트가 바뀌면 `build_esports.py`의 `APAC_SET`, `APAC_EVENTS`, `SCHEDULE`(크라운 날짜), `CUPS`(TPC 컵 이름)를 고친다. 앱은 진행 중인 APAC 대회를 공식 사이트에서 실시간으로 받는다.
- **월즈 실시간 순위** (v1.52.0, `#esp-live`, `lvLoad`): `SCHEDULE` 기간(시작 하루 전~끝)에 앱이 이스포츠 탭을 보는 동안 1분마다 MetaTFT `public/esports/tournaments`에서 이름에 CROWN과 `S<세트>`가 든 대회를 찾아 경기 기록으로 바로 순위를 계산한다 (단계 칩: 결승·누적·단계별, 결승은 체크메이트). **공식 결과 시트가 먼저** (v1.55.0, `lvSheet`): 앱이 `SCHEDULE.ct`(competetft.com 대회 번호)의 대회 페이지에서 일차 칸에 걸린 구글 시트 링크를 찾으면, 시트 탭 목록(pubhtml/htmlview의 `{name, pageUrl gid}`)에서 순위표·결승 탭을 CSV로 읽어 보여준다 (머리 줄 Name·Points·GAME n, 게임 칸은 그 게임 점수 8~1 → 등수 = 9 - 점수). 지역 결승 때는 이 시트를 대회 중 채웠다. 월즈는 대회 페이지에 링크가 안 걸려서 `SCHEDULE.sheet`에 손으로 넣는다 (신비의 숲 월즈 = 사용자가 찾아 준 `Tactician's Crown Scoresheet`, 탭 `Days 1&2 - Leaderboard`·`Day 3 - Leaderboard`, 게임 칸 이름이 `Round N`). **진행 방식** (v1.58.0, `SCHEDULE.fmt`, `lvFmtTable`): 단계별 게임 수·생존 인원·직행 인원을 넣으면 순위판에 단계 막대(40강 6게임 → 32강 2 → 24강 2 → 16강 2 → 8강 1 → 결승), 지금 단계 규칙, 선수마다 상태(N강 탈락·결승 직행·결승 진출), 컷 줄을 그린다. 점수는 단계 내내 이어지고, 단계 판정은 그 단계가 끝난 시점 점수로 (16강 직행을 8강 점수가 섞인 순위로 가르면 틀림). 세트마다 대회 페이지 설명으로 fmt를 고칠 것. **다음 월즈부터는 대회 시작 날 CompeteTFT X·방송 패널·riot.com/TacticiansCrown에서 시트를 먼저 찾아 넣을 것** (NATIVE 11부터 proxy가 competetft.com·docs.google.com 허용). Liquipedia는 429 때문에 앱에서 부르지 않는다. qa.js가 지난 월즈 기록을 이번 세트 이름으로 넣어 표·칩·잘림을 검사한다.
- 구조·포인트·일정 설명(`#esports` 섹션의 손으로 쓴 글)은 세트마다 Liquipedia로 확인해서 고친다. Liquipedia API는 `https://liquipedia.net/tft/api.php?action=parse&page=<페이지>&format=json&prop=wikitext`, 30초에 한 번 정도만 (넘으면 막힘). 받은 건 `data/esports/`에 두면 선수 국적에도 쓰인다 (커밋).

## 롤체갤 실시간 탭 (v1.53.0, `#dc`, `site/src/395_dc.js`)
- 앱 proxy(`Web.java`, NATIVE 9부터 `m.dcinside.com` 허용, 휴대폰 크롬 UA)로 `https://m.dcinside.com/board/tft`(개념글은 `?recommend=1`)를 받아 `.gall-detail-lnktb` 줄을 그린다 (공지·광고는 다른 틀이라 자연히 빠짐). 기본 1초, 3초·10초·멈춤 (기억). 이 탭을 보고 있고 앱이 앞에 있을 때만, 앞 요청이 끝나야 다음 요청. 실패하면 간격을 2배씩(최대 30초) 늘렸다가 성공하면 되돌린다. 새 글은 잠깐 강조. 글을 누르면 디시 앱·브라우저로. 받은 글은 쌓아 두고(최대 600, 같은 글은 조회·추천·댓글만 갱신), 끝까지 내리면 `?page=N`으로 이전 글을 붙인다(새 글 때문에 쪽이 밀려 새 줄이 없으면 한 쪽 더). 다시 그릴 때 화면 위쪽 글을 기준으로 스크롤을 맞춰 읽던 자리가 안 밀린다.
- 글 보기 (v1.54.0, `dcOpen`): 글을 누르면 앱 안 전체 화면으로 `m.dcinside.com/board/tft/<번호>`를 받아 제목·글쓴이·본문(`.thum-txtin`을 허용한 태그만 남기고 스크립트·광고·이벤트 속성 제거, `dcClean`)·댓글(`.all-comment-lst > li`, `comment-add`는 답글, 첫 쪽만. 더 있으면 '디시에서 보기')을 그린다. 사진은 `data-original` 주소를 앱 proxy로 받는다 (NATIVE 10부터 `*.dcinside.co.kr`·`dcimg*.dcinside.com` 허용, 디시 사진 서버가 주는 octet-stream은 image/jpeg로). 움직이는 사진(webp)은 모바일이 자리표시(`m_webp.png` + `data-fileno`)만 줘서, PC 글 화면(`gall.dcinside.com/mgallery/board/view/?id=tft&no=`, NATIVE 11부터 허용, PC UA)에서 같은 `data-fileno`의 img 주소를 찾아 채운다 (`dcFillWebp`). 사진 주소는 서명이 붙어 시간이 지나면 403이라 글을 열 때마다 새로 받는다. 휴대폰 뒤로가기·'목록'으로 닫힘(`navPush("dcview")`), 보는 동안 목록 새로고침은 멈춘다.
- 한 번에 gzip 약 30KB라 1초 간격이면 1분에 약 1.8MB. qa.js가 목록·1초 간격·탭을 떠나면 멈추는지 본다.

## 안드로이드 앱
- **자동 업데이트**: 공개 레포 `Synow1/lolche-public`(앱 파일만). 앱은 켤 때·다시 열 때(3분 간격)·켜져 있는 동안 10분마다 확인하고, 쓰는 중이면 30초 안 만질 때 적용(페이지 `window.lolcheUpdateReady`). `bash android/build.sh && bash scripts/publish_app.sh` 로 올리면 앱이 켜질 때 `manifest.json`을 보고 받는다. 페이지·데이터만 바뀌면 `www.zip`을 받아 바로 적용(설치 없음), `android/NATIVE` 숫자가 올라가 있으면 APK를 받아 설치 확인 창. **분할 업데이트 (v1.65.0, NATIVE 12)**: build.sh가 `data.zip`(페이지·JSON, 매일), `assets.zip`(fonts·icons·img·oldsets.json, 내용 해시 `ASSETS_HASH` = BuildInfo.ASSETS·manifest `assets`가 바뀔 때만), 옛 앱(NATIVE 11 이하)용 `www.zip`을 만든다. 앱(`Updater.java`)은 assets를 `files/assets-<해시>`, data를 `files/www-<web>`에 풀고, 파일은 www → assets → APK 순으로 찾는다(경로 이탈 막음, 다운로드 50MB 상한). 공개 번들에서 `site/me`는 뺀다. `Web.java` proxy는 리다이렉트를 최대 5번 직접 따라가며 홉마다 https·허용 호스트를 다시 검사하고(`*.googleusercontent.com` 포함), 응답은 글 5MB·디시/사진 15MB 상한. publish_app.sh는 `node scripts/check_power_parity.js`(power_top.json의 Python 덱파워와 페이지 boardPower 대조)와 qa.js를 통과해야 올리고, 공개 레포에 *.keystore가 있으면 멈춘다. 서명 비밀번호는 `LOLCHE_KEYSTORE_PASS`(없으면 기본값). **협업용 소스 사본** (2026-11-20 사용자: 제미나이와 협업): publish_app.sh가 올릴 때마다 lolche-public의 `src/`에 `site/src/`·`android/src/`·`android/build.sh`·`android/NATIVE`·`scripts/`·`guide/`·`CLAUDE.md`만 새로 복사한다 (원본 레포는 비공개, 서명 키·`data/me`·raw·data는 안 넣음). 공개 레포에 *.keystore·*.jks·data/me가 있거나 src에 비밀 값처럼 보이는 글(토큰·개인 키·gmail 주소)이 있으면 배포를 멈춘다. 제미나이 변경은 최신 main 기준 patch로 받아 읽고, 점검·빌드를 통과시켜 올린다. **Java·매니페스트·Bridge를 바꾸면 `android/NATIVE`를 1 올린다.** **APK 파일은 보내지 않는다** (사용자: "안 할라고 public 레포 만든 거 아니냐", 2026-11-06). NATIVE가 바뀐 날은 "앱을 열면 설치 창이 떠요, '설치'를 눌러 주세요"라고 한 줄로 알린다. Java는 꼭 필요할 때만 바꾼다.
`bash android/build.sh` -> `android/out/lolche-note-v<버전>.apk` (앱이 공개 레포에서 알아서 받으니 파일은 보내지 않는다). 버전은 `site/version.json`: 기능·화면이 바뀌면 version을 올리고(새 기능 1.x.0, 고침만 1.x.y) notes 맨 위에 한두 줄 추가한다. 데이터만 갱신한 빌드는 버전을 그대로 둔다(빌드 시각이 따로 찍힘). 페이지(site/tft-guide.html)·db.json·아이콘·내 전적을 APK에 넣는다. 데이터나 페이지를 고쳤으면 빌드해서 `publish_app.sh`로 올린다 (APK 파일은 보내지 않음). 페이지 JS의 `APP`/`OVERLAY` 분기가 앱 전용 기능(떠있는 버튼, MetaTFT 직접 받기)이고, 클로드 아티팩트에서는 꺼져 있다.

## 파일
- `guide/data/10_상세_시너지.md`: 단계별 수치, 숨은 조건, 보조 툴팁
- `guide/data/11_상세_유닛.md`: 능력치와 스킬 (1/2/3성)
- `guide/data/12_상세_아이템.md`: 조합식, 기본 능력치, 효과 (유물·찬란한 포함)
- `guide/data/13_상세_증강.md`: 전체 증강 원문과 티어
- `guide/data/14_시너지_통계.md`: 시너지 단계별 평균 등수 (플래+/마스터+/그마+/챌)
