# 인수인계 (새 세션이 처음 읽을 것)

마지막 정리: 2026-11-21, 앱 v3.0.1 (android/NATIVE 12). **브랜치는 `main` 하나** (클로드·제미나이 공용, PR 없음). 작업 전 `WORK.md` 확인.
규칙 전체는 `CLAUDE.md`, 앱 문구 기준은 `guide/WRITING.md`, 디자인은 `guide/DESIGN.md`, 게임 지식은 `guide/kb/` (먼저 `python3 scripts/kb.py 키워드`).

## 0. 지금 상태 (2026-11-21)
- **v3.0.0~v3.0.1 19시즌 전면 전환 + PBE 최근 1일 (제미나이)**:
  - `scripts/setinfo.py`: `LIVE_NUM`(본섭, 12/1 전 18) · `NUM`(공략 세트 19) · `PBE = LIVE_NUM < NUM` · `SET`/`LIVE_SET` · `SEASON`(dak.gg 본섭) · `GUIDE_SEASON` · `unit_ok()`(DA_*19, 7코스트). **12/1에 `LIVE_NUM = 19`로 올리면** PBE 분기가 꺼지고 전적·랭킹도 19시즌이 된다.
  - 공략 데이터(`db/items/meta/guides/tfa/icons index`)는 19시즌 PBE 최근 1일(MetaTFT `queue=PBE&days=1`, TFT Academy `set=19`) 기준. `META.pbe`/`ITEMS.pbe`면 티어 고르기(에메+ 등)를 숨기고 새로고침도 `queue=PBE&days=1`로 받는다. TFT Academy 증강·아이템 티어표가 비면 아카데미의 증강·아이템 보기를 숨긴다.
  - 전적·친구·덱파워·이스포츠는 `LIVE_SET_ID`(본섭 18시즌) 그대로, 18시즌 아이콘은 `site/oldsets.json`의 로컬 `icons/` 경로로 그린다.
  - 하단 5탭: `홈 · 덱(#meta) · 도감(#s19, data-nav=dex) · 전적 · 더보기`. `#s19`는 이제 도감(챔피언·해금·시너지·빌더·증강·아이템)이고 19시즌 덱은 `#meta`에서 본다.
  - `qa.js`: 모든 탭에서 화면에 `undefined`·`NaN` 글자 금지, 폰 검사는 `reducedMotion`(탭 들어오는 움직임 때문에 여백이 5px 커 보이던 흔들림 제거).
- **v2.3.0 ~ v2.6.0 (PC 웹 + 19시즌 PBE + MetaTFT식 PC 덱 줄)**:
  - PC 웹(`https://synow1.github.io/lolche-public/`): `WEB` 분기, 왼쪽 사이드 메뉴, 직접 CORS fetch, MetaTFT식 넓은 덱 줄 + 아래로 펼치기(`.pcdk`/`.pcdk-open`), 19시즌 PBE MetaTFT 통계 + 새로고침 + 팀 코드 복사, 고화질 챔피언 초상.
- **개발·배포 구조 개선 (2026-11-21)**:
  - CSS 5분할(`010_base.css` · `011_decks.css` · `012_rank_esports.css` · `013_theme_v2.css` · `014_desktop.css`), `android/build.sh` 자동 APK/assets 생략(`--fast`), `publish_app.sh` 최신 `main`·버전 역전 가드 및 변경 없는 바이너리 복사 생략, `qa.js` `proxyGet` 공용 캐시·`--fast`·`014_desktop.css` PC 단독 검사, `.github/workflows/ci-deploy.yml`, `WORK.md`.
- **v2.0.0 전면 개편**:
  - **19시즌 중심 메인 홈 허브(`#home`, `099_home.html`, `399_v2_hub.js`)** · **하단 5탭(v3.0.0부터 `홈 · 덱 · 도감 · 전적 · 더보기`)** · **19시즌 스쿼드 빌더·해금 체크리스트(`398_s19.js`)** · **통합 스포트라이트 검색(`/`, `Cmd/Ctrl+K`)** · **테마 전환(시스템/다크/라이트)**.
- **역할 (2026-11-21부터)**: 클로드·제미나이 둘 다 디자인·구조·기능·데이터를 모두 한다 (정해진 몫 없음). 매일 점검·전적 코칭은 클로드 세션이 돌린다. 둘 다 `main`에 직접 푸시.

## 1. 새 세션에서 맨 처음 할 일
1. `git checkout main && git pull --ff-only origin main` (작업·예약 루틴마다 먼저. 끝나면 `git push origin main`, 거절되면 다시 pull 후 점검·푸시. force push 금지)
2. **세션 ID 바꾸기**: 새 세션 ID는 `get_session`(claude-code-remote)으로 확인.
   - `site/src/400_app.js`의 `var SESSION = "session_..."` 와 `CLAUDE.md`의 세션 ID를 새 것으로 → 빌드·올리기 (`bash android/build.sh && bash scripts/publish_app.sh`) → 커밋·푸시.
   - 앱의 '갱신 요청' 버튼이 이 세션으로 메시지를 보낸다.
3. **매일 점검 예약 작업 옮기기**: 지금 예약 '롤체 노트 매일 점검'(`trig_01C1T7muQ9pUZnGUcE62nvec`, `CRON_TZ=Asia/Seoul 41 9 * * *`)은 세션 `session_01VCcDCEg6hT8M9R4abL4j3G`을 깨운다.
   - 새 세션에 같은 시간으로 새로 만들고(`create_trigger`, 기본 모드 = 이 세션), 옛 것은 `update_trigger enabled=false`. 사용자가 새 세션으로 옮기라고 했으니 바로 해도 된다.
   - 예약 프롬프트:
     `[자동 점검] CLAUDE.md의 '자동 갱신 루틴'을 그대로 해줘. 먼저 git checkout main && git pull --ff-only origin main으로 최신을 받은 뒤 check_patch.py를 돌리고, actions가 비어 있으면 아무것도 하지 말고 조용히 끝내. 새 패치(notify)면 바로 알리고, quick/full/esports가 있으면 update.sh로 갱신 → 커밋 → git push origin main → 한 줄 요약 (앱은 publish_app.sh로 자동 업데이트, APK 파일은 보내지 않음. android/NATIVE가 바뀐 날만 '앱을 열면 설치 창이 떠요'라고 한 줄). update.sh가 check_data.py에서 멈추면 원인을 고치고 다시 돌리고, 못 고치면 한 줄로 알려. 대회 기간이면 우승자·한국 선수 결과도 한 줄로.`
4. 컨테이너가 새로 뜨면 `raw/`·안드로이드 SDK가 없다. `python3 scripts/tft_data.py fetch`와 `android/build.sh`가 알아서 받는다 (몇 분 걸림).

## 2. 사용자
- 2026-11-07: "내 의견도 항상 비판적으로 판단해라". 그대로 따르지 말고 장단점을 따져서 더 나은 쪽으로 (예: 표 머리줄 제안 → 고정 머리줄이어야 맞다고 판단해서 적용).
- 2026-11-07: "항상 최고의 퀄리티+알잘딱, 웹검색은 기본". 무엇을 하든 웹에서 1차 자료·실제 앱 화면을 먼저 보고, 시키지 않은 부분까지 알아서 챙긴다.
- Synow#KR1 (KR1). 폰으로 롤체, 예전 다이아·지금 실버. 친구: 이렐꼴1픽#KR1, 날씨가너무덥네요#KR1.
- 한국어 반말 섞인 짧은 말투. 답은 한국어, 해요체, 결론 먼저, 표·숫자로.
- **"알잘딱"을 기대한다**: 한 번 지적받으면 같은 종류의 문제를 앱 전체에서 찾아 같이 고치고, 고친 뒤 실제 화면을 찍어 확인한 다음 올린다. "또 내가 알려줘야 되냐"는 말을 들었음 (예상 1.2등, 시너지 −9 건).
- 상용 앱 수준을 원한다. AI 티 나는 문구(이모지, "IQ처럼", "괴물", "판 끝 보드", "(매일 아침 새로)")와 짜치는 구어체("새로 C티어", "빠짐", "전에", "바뀜", "갈 덱", "비우기", "담기/빼기") 금지 → `guide/WRITING.md` 3-1절 기본 준수.
- 모르면 "모른다"로 끝내지 말고 찾아서 답하기. 틀린 건 바로 인정하고 `guide/kb/corrections.md`에 적기.

## 3. 앱 구조 (site/tft-guide.html 한 파일 + site/*.json)
하단 바(v2.0+): 홈 · 19시즌 · 덱(메타/아카데미/재료/상징) · 전적(랭킹/친구/덱파워) · 더보기(아이템·증강·시너지·유닛검색·팀빌더·이스포츠·롤체갤·공략). PC(1024px+)에서는 왼쪽 사이드 메뉴로 표시.
- 덱: 추천 덱(롤체지지 가이드)·전체 통계(MetaTFT, 티어 기준 플래+/에메+/다이아/마스터+/그마·챌/플래 미만)·최근 1등(롤체지지 실시간, 덱파워·필드 가치 붙음).
- 전적: 롤체지지 API. LP 그래프(판수로 LP 맞춤, 그마·챌 컷 점선), 판 카드에 필드 가치·덱파워, 로비 8명, '10판 더 보기'(범위 넘으면 더 받아옴).
- 검색 (v1.38.0): 전적 검색·친구 추가 공용 `whoList` — 빈 칸이면 내 계정·즐겨찾기(`tft-guide-star`)·최근 검색, 치면 맞는 기록 + MetaTFT 검색. 전적 이름 옆 별로 즐겨찾기.
- 판 덱 이름 (v1.47.0): `deckOfBoard(board, traits)` — meta.json 덱과 가중 자카드(유닛 코스트 × 템 2개 이상이면 2), 덱 메인 캐리가 없으면 ×0.75, 0.42 이상이면 그 덱 이름, 아니면 최고 시너지 + 메인 캐리로 이름(`guess`). 전적 카드·로비·덱파워 카드(`dkLine`)·전적 요약 "많이 한 덱".
- 재료 → 덱 탭 (v1.44.0): `#parts`, `ptRender`. 덱마다 템 든 유닛의 빌드(meta.json builds 판수 비율, 메인 캐리 1·나머지 0.8)를 재료 수요로 바꾸고(`ptNeed`), 가진 재료와 코사인 유사도 = 재료 궁합. 정렬 점수 = 궁합×100 − (평균 등수−4.2)×40. 궁합 35% 미만은 뺌. 처음엔 "쓰는 비율"로 했는데 재료 3개면 거의 모든 덱이 100%라 코사인으로 바꿈.
- TFT 아카데미 (v1.40.0, v1.51.0부터 다시 따로 탭 `#tfa` (아래 메뉴 6칸: 덱·아카데미·전적·증강·아이템·더보기). 탭마다 스크롤 위치를 기억(`TAB_Y`)해서 덱 ↔ 아카데미를 오가도 보던 상세·위치가 남는다. 덱 탭 '최근 1등'은 사용자 요청으로 뺌, 덱파워 탭에는 남음): `mtSrc === "tfa"`이면 metaList가 `#tfa-list`를 보여주고 tfaRender. `scripts/build_tfa.py` -> `site/tfa.json`. API는 `https://tftacademy.com/api/tierlist/{comps,augments,items}?set=18` (+ `/api/assets/...`). 덱 이름·팁 번역은 `data/tfa_ko.json`(영어 원문 -> 한국어), 새 글이 생기면 `--missing`으로 뽑아 채운다. 한국어 원문에 없는 증강 이름은 `AUG_EXTRA`. 페이지는 `tfaRender`/`tfaShow`.
- 지난 시즌 (v1.38.0): 전적의 지난 시즌 표에서 줄을 누르면 `rkProfile(id, "set15")` — 롤체지지 season 파라미터로 그 시즌 LP 그래프·전적. 유닛·시너지·아이템 이름·아이콘은 `site/oldsets.json`(`scripts/build_oldsets.py`, CommunityDragon 버전별). 지난 세트 판은 덱파워·컷 점선 숨김.
- 롤체지지 공략 (v1.39.0): `build_guides.py parse_guide`가 가이드 본문을 guides.json `guide`로 (tips 개요·charms 수호령·items 챔피언별 주요/대체·augs 등급별 공통/전투/경제/아이템). 덱 상세에 '공략'·'추천 증강'(있으면 이걸로)·'아이템 공략'.
- 상징 필수 덱 (v1.38.0): meta.json `emb`에서 덱 판의 50% 넘게 쓴 상징을 덱 이름 옆에 (`embReq`).
- 친구: 들어오면 전원 롤체지지 갱신(`dakSync`가 done까지 기다림) 후 LP 반영. 위 전환 `티어 비교 | 고점 판`: 고점 판은 친구들 최근 랭크 20·100판을 덱파워 순 카드(pwCard)로 (`frTop`). 그래프는 떠 있는 설명 대신 범례에 그 시점 LP.
- 이스포츠: APAC 공식 사이트 + MetaTFT + Liquipedia 공식 순위. 월즈 진출자 명단(`crown_roster`).
- 덱파워 탭: 분포 차트, 최근 7일 상위(티어별), 그마·챌 최근 1등.
- 글꼴 Pretendard(site/fonts, 앱에 포함), 글자 크기 토큰 `--fs-2xs ~ --fs-3xl` 9단계만 쓴다.

## 4. 덱파워 (가장 최근에 많이 손본 것)
- 학습: `scripts/build_power.py` (Plackett-Luce 로비 순위 모델, numpy). 데이터: `scripts/crawl_boards.py` → `data/power/boards.jsonl.gz` (롤체지지 랭크 판, 티어 골고루, 보드마다 이름).
- **페이지 `boardPower()`가 `feats()`를 그대로 따라 계산**한다. 특징을 바꾸면 둘 다 고치고, 반드시 대조:
  - 덱파워 탭 상위 덱: power_top.json의 pw와 화면 숫자 비교 (불일치 0이어야 함)
  - 전적 카드: 같은 보드를 파이썬 feats로 계산해 화면 값과 비교
- 척도: 평균 100, 표준편차 40 (`SCALE`, 2026-11-14 24→40). 색은 **예상 등수 기준** (`pwClsP`, v1.35.0 사용자 요청): 1.0등 빛나는 무지개(q0) · 1.3등까지 무지개(q1) · 1.5등까지 1등 색 · 2.5등 2등 색 · 3.5등 3등 색 · 4.5등 4등 색 · 그 밑 회색. 지금 모델로 덱파워 190↑ / 143↑ / 134↑ / 118↑ / 109↑ / 101↑. 등수 색은 판 카드와 같은 `--pl1~4`.
- **압도 보정** (v1.37.0, v1.37.1 짜바리 4코 3성 a4w 분리): 4코 3성·프리즘 시너지 덱은 덱파워 구간별로 실제 1등 확률에 맞게 올림 (`fit_adj`·`adj_shift`, 페이지 boardPower도 같게). 자세한 근거는 `guide/kb/rules.md` '덱파워 압도 보정'.
- 규칙: **5코 3성 덱은 5코 3성 없는 어떤 덱보다 위** (경계 `f5`, 지금 194. 그 아래 30점은 `cap5`로 부드럽게 눌러 담음). 레벨 점수는 높을수록 줄지 않게. 4·5코 3성 개수는 log2(1+n). 시너지 기록 오류 판(켜진 일반 시너지 0, 유닛 5+)은 시너지 평균 처리. 고유 특성(럭스 화신 등)은 항목별 보기에서 '유닛'.
- 예상 등수: 보정표 `cal`(상위 2%는 잘게) + 표 밖은 로지스틱 `calp`.
- 사전 지식: 3성 스킬 배율(게임 원문, 5코 평균 8.6배), 유닛·별 평균 등수(db.json), 아이템 평균 등수(raw/items.json), 시너지 단계 평균 등수(raw/traits.json).
- 증강은 판 기록에 없다(0/320) → 못 넣음. 배치도 없음.
- 정확도(테스트 로비): 1등 맞춤 ~70%, 8등 ~71%, 순방 89%, 두 덱 비교 89.5%. 자세한 검증 기록: `guide/kb/rules.md` '덱파워 재검토'.
- 항목별 점수(평균 대비)는 기본 접힘, 숫자 누르면 펼침.
- 매일 점검(friends 모드)에서 판 300개 더 모으고 다시 학습(약 3분).

## 5. 확인 방법 (올리기 전에 꼭)
- `node scripts/qa.js`가 publish_app.sh 안에서 자동으로 돈다 (실패하면 안 올라감). 예전 버전에 돌려서 그 버전의 버그를 잡는지 확인했다: v1.49.1(조합표 빈칸·잘림 4건), v1.47.5(전적 가로 밀림·랭킹 새로고침 숨음·hidden 버튼). `QA_HTML=<파일>`로 다른 페이지 파일을 점검할 수 있다.
- 화면: `node scripts/ui_check.js <탭> <폴더> [--dark] [--search "이름#태그"]` → 스크린샷 + 페이지 오류. 앱 모드로 띄우고 롤체지지·MetaTFT를 실제로 받아 온다.
- 버전: 기능·화면 바뀌면 `site/version.json` 올리고 notes는 WRITING.md 말투로 한 줄씩. Java 바꾸면 `android/NATIVE` +1 (APK 파일은 보내지 않음. 앱이 설치 창을 띄우니 그날만 한 줄로 알림). Java는 꼭 필요할 때만.

## 5-1. 2026-11-06 전체 점검 (v1.34.0)
- 아이템 탭이 빈 원인: 18.6 원문에 템 설명이 비어 옴 → `data/item_text.json` 캐시 + `scripts/check_data.py` (update.sh가 빈 데이터면 멈춤). `guide/kb/corrections.md` 참고.
- 업데이트 시각은 페이지 `updAt()` 하나로 (`11/6 07:57 업데이트`). 빌드 스크립트의 updated는 UTC ISO(분까지).
- 덱 탭 맨 위: 분석된 덱 수(고른 티어 기준, meta.json `totals`)와 MetaTFT 업데이트 시각(`src_at`). 새로고침하면 둘 다 새 값.
- 덱 운영 방식 영어(Fast 8, lvl 7) → `styleKo()`, 이름 없는 덱("[특성 사다리] 팀 구성") → `deckName()`이 캐리 이름으로.
- 이모지 제거: 트로피는 `cupIcon()` SVG, 🇰🇷 문구는 "한국". 선수 이름 옆 국기는 데이터 표시라 둠.
- 글자 크기 하드코딩 → 토큰 (SVG 차트 안 글자와 입력창 16px만 예외).
- 프로 포인트: MetaTFT에 없는 선수(APAC Stillness·NeverWin)는 Liquipedia 순서로 빈 순위를 채움 (점수는 -).
- `ui_check.js --full`로 페이지 끝까지 찍기.

## 6. 남은 일·예정
- 월즈(전략가의 왕관) 11/13~15: 매일 점검의 esports가 결과를 받는다. 우승자·한국 선수(seoill) 결과 한 줄로 알리기. 중국 8자리는 아직 미정 → Liquipedia Qualification 페이지를 하루 한 번 다시 받음.
- 덱파워 개선 후보 (사용자에게 제안만 함, 결정 안 됨): 상징이 전투템 칸을 먹는 손해, 재료템을 들고 끝난 덱, 유닛과 안 맞는 템(AP 니달리에 AD 템)을 따로 계산.
- 등급 글자(S+/S/A) 붙이기는 제안했다가 사용자가 "걍 이대로" → 안 함.
- 18.6 패치: 감지 당일 quick, 다음 날 full로 규칙 바꿈 (`check_patch.py`).
- 공략 본문(판 흐름·숫자·정찰 등)의 커뮤니티 말투 정리는 아직 안 함 (물어봤는데 답 없음).

## 페이지 구조 (2026-11-13)
- 페이지 원본은 `site/src/` 조각 46개 (CSS 5: `010_base`·`011_decks`·`012_rank_esports`·`013_theme_v2`·`014_desktop`, 화면 HTML 22, 스크립트 13, 머리·꼬리·셸). `python3 scripts/build_page.py`가 `site/tft-guide.html`로 조립한다. 결과물을 직접 고치지 말 것.
- 화면이 그대로인지 확인: `node scripts/snap.js base` / `cmp` (CLAUDE.md '페이지 고치기').
