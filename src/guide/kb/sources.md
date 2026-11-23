# 롤체 정보 출처 지도 & 클로드 매일 수집·판단 프로토콜

> 목적: **새로운 패치·숨은 메커니즘·버그·메타 킥이 어디에 가장 먼저 올라오는지** 정확히 기록해 두고, 클로드 예약 루틴(`롤체 노트 매일 점검`)이 매일 스스로 확인·선별해 `guide/kb/`를 최신 상태로 유지하게 한다.

---

## 1. 신뢰도별 출처 지도 (URL · 엔드포인트 · 수집 방법 · 주기)

### Tier 1 — 공식 · 게임 원문 · PBE 패치 최속 추적 (팩트 최우선)
| 출처 | 정확한 위치 (URL / API / 스크립트) | 얻을 수 있는 정보 | 확인 주기 | 수집 방법 |
|---|---|---|---|---|
| **Riot 공식 패치노트 (KR/EN)** | `https://teamfighttactics.leagueoflegends.com/ko-kr/news/`<br>`https://teamfighttactics.leagueoflegends.com/en-us/news/tags/patch-notes/` | 본섭 정식 패치노트, 시스템 개편(Roles Revamped 등), 개발자 일기 | 본섭 패치일(`notify`) | WebFetch / 웹검색 |
| **MetaTFT 게임 원문 JSON** | PBE: `https://data.metatft.com/lookups/TFTSet19_pbe_ko_kr.json` (`_en_us.json`)<br>본섭: `https://data.metatft.com/lookups/TFTSet19_latest_ko_kr.json` | `_metadata.release`(PBE 빌드 번호), 챔피언·스킬·해금 조건(`unlock`), 시너지 수치, 아이템·증강 원문 | 매일(`check_patch.py`) | `curl` / Python (`build_s19.py`, `tft_data.py`) |
| **CommunityDragon 원문** | PBE: `https://raw.communitydragon.org/pbe/cdragon/tft/ko_kr.json` (2026-11-22: 받아지지만 세트 19가 아직 없음 → PBE 19는 MetaTFT 원문으로)<br>본섭: `https://raw.communitydragon.org/latest/cdragon/tft/ko_kr.json` | 라이엇 클라이언트 추출 전체 데이터(숨은 툴팁·특수 아이템·아이콘 경로) | 패치일·신규 항목 누락 시 | `curl` / Python |
| **TFTFlow (19시즌 PBE 최속 정리)** | 패치 변경점: `https://tftflow.com/patch-changes/set19`<br>캐시아웃·보상표: `https://tftflow.com/tables/set19`<br>조우자 확률표: `https://tftflow.com/tables/set19/encounter-odds`<br>해금 전체표: `https://tftflow.com/how-to-unlock-every-champion-set19` | **PBE 일일 패치 diff**(라이엇이 공식 노트 안 쓰는 PBE 수정 내역), 하이퍼팝·TD·8비트 캐시아웃 표, 조우자 확률·제외 증강, 세라핀 등 숨은 팁 | **PBE 빌드 변경 시 필수** / 주 1회 | **`python3 scripts/tftflow_diff.py [--to "PBE 19.1c"]`** (정적 HTML, curl로 받아 태그를 벗겨 항목별 `전 -> 후` 한 줄씩. 2026-11-22 확인). 수치는 MetaTFT 원문 curveValues(점 사이 직선 보간)로 다시 대조. **diff를 며칠 늦게 올린다**(11/20 빌드의 19.1c diff가 11/23에 올라옴) → `pbe`가 없는 날도 매일 `tftflow_diff.py | grep -o 'PBE [^ ]*->PBE [^ ]*' | sort -u`로 새 라벨이 생겼는지 본다 |
| **TFT Odds (기물 풀·확률)** | `https://tftodds.com/data/champion-bags` | 세트별 기물 풀, 레벨별 상점 확률, 초기하 롤 확률 검증 | 세트 시작·확률 패치 시 | WebFetch |

### Tier 2 — 실시간 통계 & 프로 티어표 (수치·메타 검증)
| 출처 | 정확한 위치 (URL / API / 스크립트) | 얻을 수 있는 정보 | 확인 주기 | 수집 방법 |
|---|---|---|---|---|
| **MetaTFT API** | 덱 통계: `https://api-hc.metatft.com/tft-comps-api/comps_stats?queue=PBE&patch=current&days=3`<br>덱 구조: `https://api-hc.metatft.com/tft-comps-api/comps_data?queue=PBE`<br>템 통계: `https://api-hc.metatft.com/tft-stat-api/items_matches?queue=PBE&patch=current&days=3`<br>조합 질의: `python3 scripts/explorer.py "유닛+템+템"` | 덱 묶음별 평균 등수·순방·승률·픽률, 유닛+템 2/3조합 승률(Data Explorer), 프로 가이드 증강 | 매일 (`update.sh` / `build_meta.py`) | Python / `curl` (CORS 허용) |
| **TFT Academy (Dishsoap·Frodan)** | `https://tftacademy.com/`<br>스크립트: `python3 scripts/build_tfa.py` | 챌린저·월즈 우승자 기준 티어표, 덱별 스테이지 팁, Flex 유닛, 증강·템 티어 | 매일 (`build_tfa.py`) | `build_tfa.py` |
| **tactics.tools** | `https://tactics.tools/`<br>API: `https://d3.tft.tools/stats2/unit/1100/<유닛ID>/<패치>/1` | 다이아+ 유닛별 템 페어·트리오(`itemPairs`/`itemTrios`), 상성 교차 검증 | 패치 후(`build_db.py`) | `build_db.py` |
| **롤체지지 / dak.gg API** | `https://tft.dakgg.io/api/v1/summoners/kr/<이름-태그>/{profile,matches,league-logs}`<br>`https://tft.dakgg.io/api/v1/data/champions?season=set19` (한국어 원문) | 한국 전적·랭킹·티어 컷·최근 1등·세트 한국어 설명 | 매일 (`build_s19.py`, `snap_rank.py`) | Python (`build_*.py`) |
| **Liquipedia TFT** | `https://liquipedia.net/tft/api.php?action=parse&page=<페이지>&format=json&prop=wikitext` | 대회 일정·규정·공식 최종 순위·선수 국적 | 대회 기간(`esports`) | **30초 간격 준수** (429 주의) |

### Tier 3 — 숨은 메커니즘 · 버그 · 고티어 팁 · 커뮤니티 (교차 검증 후 승격)
| 출처 | 정확한 위치 (URL / API / 스크립트) | 얻을 수 있는 정보 | 확인 주기 | 수집 방법 |
|---|---|---|---|---|
| **Reddit `r/CompetitiveTFT`** | 일간 인기 JSON: `https://old.reddit.com/r/CompetitiveTFT/top.json?t=day&limit=25`<br>주간 인기 JSON: `https://old.reddit.com/r/CompetitiveTFT/top.json?t=week&limit=25`<br>최신 글 JSON: `https://old.reddit.com/r/CompetitiveTFT/new.json?limit=25` | **PBE Day N 패치노트 요약**, 버그 메가스레드, 챌린저 덱 공략, **PSA 숨은 상호작용**(예: True Damage A/B면 연패 유지) | **매일 1회** (PBE/신패치 직후 최우선) | `curl -A "lolche-kb/1.0"` JSON 직접 파싱 (빠르고 안정적) |
| **DC 롤체갤 (한국 최속 실전)** | `python3 scripts/dc_crawl.py list 1 | head -25` (인자는 **쪽 수**, 1쪽 ≈ 개념글 50개. `list 20`은 20쪽이라 매일 쓰기엔 과함)<br>`python3 scripts/dc_crawl.py search <키워드>`<br>`python3 scripts/dc_crawl.py get <번호>` | 한국 챌린저·그마 덱 킥, 1스테 각 보기, 숨은 버그, 한국 서버 특화 메타 | **매일 1회** (개념글 20개 스캔) | `scripts/dc_crawl.py` |
| **TFT Ninja (메커니즘 심화)** | `https://tft.ninja/guides/game-mechanics/` (301 → `curl -L` 필요)<br>예: `items/item-bags`, `combat` 등 | 아이템 가방, 매칭, 타게팅, 데미지 공식 등 시즌 불변 영구 메커니즘 검증 | 큰 시스템 개편 시 | WebFetch / 웹검색 |
| **Mobalytics / MetaTFT 가이드** | `https://mobalytics.gg/tft/new-set-release` (**이 서버 403**, 웹검색 결과 요약으로만)<br>`https://mobalytics.gg/tft/set19/unlocks`<br>`https://www.metatft.com/new-set` | 세트 개편 요약, 해금 조건 2차 교차 확인, 초반 가이드 | 새 세트/대규모 패치 시 | WebFetch / 웹검색 |
| **X (구 Twitter) 개발자 계정** | Mortdog (`@Mortdog`), Riot Julien (`@RiotJulien`), TFT 공식 (`@TFT`), CompeteTFT (`@CompeteTFT`) | 긴급 B패치·핫픽스 예고, 의도된 메커니즘 vs 버그 확정 답변, 월즈 시트 링크 | 핫픽스·대회·의문 발생 시 | 웹검색 (`site:x.com` 또는 `r/CompetitiveTFT` 전재본 확인) |

### 접근 제한 · 금지 규칙
- **2026-11-22 이 클라우드 서버 접근 테스트 (클로드)**:
  | 출처 | 결과 | 매일 루틴에서 쓰는 법 |
  |---|---|---|
  | `old.reddit.com/.../top.json` | **302 → www.reddit.com 403** (`api.reddit.com`도 403) | 브라우저 UA 흉내 등 **우회 금지**(자동 차단 대상). 웹검색으로 `r/CompetitiveTFT` 전재·요약만 찾고, 못 찾으면 그날 레딧은 건너뛴다. 원문이 꼭 필요하면 사용자에게 Reddit OAuth 앱 키(`oauth.reddit.com`)를 요청한다 |
  | `tftflow.com/patch-changes/set19`, `/tables/set19`, `/tables/set19/encounter-odds`, 해금 글 | 200 | `scripts/tftflow_diff.py` |
  | `teamfighttactics.leagueoflegends.com` 패치노트 | 200 | curl 또는 웹검색 |
  | MetaTFT 원문·API | 200 | `check_patch.py`·`build_s19.py` |
  | CommunityDragon PBE | 200 (세트 19 없음) | 본섭 19 출시 뒤 `latest`로 |
  | `tftodds.com` | 200 | curl |
  | `tft.ninja` | 301 | `curl -L` |
  | `mobalytics.gg` | **403** | 우회 금지, 웹검색 |
  | DC 롤체갤 (`dc_crawl.py`) | 정상 | `list 1`, `get <번호>` |
- `lolchess.gg/decks?queue=pbe`: 이 서버 IP에서 403 차단됨 → **우회 시도 금지**, MetaTFT PBE API로 대체.
- `liquipedia.net`: 요청당 최소 30초 간격, 429 시 즉시 중단.
- YouTube: 클라우드 환경에서 자막 추출 차단 → 아래 목록은 제목·채널 참고용으로만 유지.

---

## 2. 클로드 예약 루틴용 신규 정보 수집·판단 프로토콜 (Daily Discovery Playbook)

매일 예약 점검(`롤체 노트 매일 점검`, 09:41 KST)이 기존 `check_patch.py`·`update.sh`를 돌린 뒤, **아래 순서대로 새 지식을 확인하고 판단해 `guide/kb/`에 반영**한다.

### 2.1 실행 시점별 확인 순서
1. **매일 공통 (2~3분 컷, 조용히 실행)**:
   - `r/CompetitiveTFT` 일간 상위 글: **이 서버에서 레딧이 403이라** 웹검색(`r/CompetitiveTFT PBE <날짜>`, `Mortdog PBE`)으로 `PSA`·`PBE`·`Patch`·`Bug`·`Unlock`·`Set 19` 소식만 찾는다. 검색에 안 잡히면 그날은 건너뛴다(우회 금지). 레딧 키가 생기면 `top.json?t=day&limit=20`으로 바꾼다.
   - `python3 scripts/dc_crawl.py list 1 | head -25`로 최근 개념글 제목 훑기 → **패치·버그·해금·19시즌 팁·운영 공략** 글만 `get <번호>`로 읽기.
2. **PBE 새 빌드 감지(`check_patch.py`에서 `pbe` 액션) 시 필수**:
   - `python3 scripts/tftflow_diff.py --to "<새 빌드 라벨>"`로 PBE 변경점 확인 (라벨은 `tftflow_diff.py` 전체 출력의 `PBE a->PBE b`에서 가장 새 것). 바뀐 수치는 MetaTFT 원문(`TFTSet19_pbe_en_us.json`의 `curveValues`·스킬 변수)과 대조해 지금 빌드에 들어갔는지 확인하고 적는다. tftflow에 아직 안 올라왔으면 다음 날 다시 본다.
   - `site/s19.json` 갱신 전/후 비교로 **해금 조건·7코스트·시너지 수치 변경**이 있으면 `guide/kb/set19.md` 즉시 수정.
   - `r/CompetitiveTFT`의 해당 날짜 PBE 패치노트 스레드 확인.
3. **본섭 새 패치(`notify` / `full` 액션) 시 필수**:
   - Riot 공식 패치노트(KR/EN) 확인 → 시스템/확률/경험치 변경은 `rules.md`·`fundamentals.md`, 19시즌 밸런스·해금·시너지 변경은 `set19.md`에 반영.
   - `tftflow.com/tables/set19` 및 `encounter-odds` 변동 확인.

### 2.2 판단 기준 — KB에 적을 것(Promote) vs 버릴 것(Skip)
**즉시 기록 (Promote)**:
- **1차 팩트 변경**: 공식 패치·B패치·PBE 빌드에서 바뀐 수치, 해금 조건, 확률, 조우자, 아이템 효과.
- **검증된 숨은 메커니즘(Tech / PSA)**: 게임 툴팁에 안 적혀 있지만 실제 전투·경제에 큰 영향을 주는 규칙 (예: True Damage A/B면 연패 유지, 세라핀 대기석 테일러링). 가능하면 댓글·실험·게임 원문으로 **2곳 이상 교차 확인**.
- **실전 영향 버그**: 아이템 미발동, 해금 조건 버그, 판 기록 누락 등(수정 패치 나오면 `수정됨` 표기).
- **고티어 검증 덱 킥·운영법**: 마스터+/챌린저 인증 또는 MetaTFT/Explorer 통계가 뒷받침된 배치·템·해금 루트.
- **기존 KB 오류 발견**: 기존 문서가 틀렸으면 원문 수정 + `corrections.md`에 1줄 기록.

**무시 (Skip)**:
- 표본 없는 1~2판짜리 PBE 감상/징징글 ("XX 너프 시급", "YY 버그급 사기").
- 근거·재현 방법 없는 추측성 루머.
- 이미 `site/meta.json`·`site/s19.json`에 매일 자동 저장되는 단순 일일 등수 등락(메타 축 자체가 바뀐 경우만 1~2줄 요약).
- `guide/kb/`에 이미 적혀 있는 내용의 중복 요약.

### 2.3 파일 라우팅 표 (어디에 적을지)
| 새 정보의 성격 | 저장할 파일 | 필수 표기 |
|---|---|---|
| 시즌 불변 원리 (역할군, 전투 수학, 아이템 가방, 매칭, 경제·배치 이론) | `guide/kb/fundamentals.md` | `(YYYY-MM-DD, 출처)` |
| 기본 규칙 숫자 (골드·경험치·상점 확률·기물 풀·피해량·LP·덱파워) | `guide/kb/rules.md` | 패치 버전 + 출처 |
| 19시즌 전용 (해금 조건, 7코, 시너지·캐시아웃, 조우자, 영웅증강, 특수템, PBE/본섭 패치 타임라인) | `guide/kb/set19.md` | 날짜 + PBE/본섭 구분 |
| 실전 메타 팁·덱별 킥·첫 초밥·배치·버그 사례 | `guide/kb/strategy.md` | `(YYYY-MM-DD, DC <번호> 또는 r/CompetitiveTFT)` |
| 기존 KB·에이전트 오답 정정 | `guide/kb/corrections.md` | 틀린 내용 → 맞는 내용 + 근거 |
| 새 유력 출처/API 발견 또는 기존 URL 차단·변경 | `guide/kb/sources.md` | 날짜 + 접근 가능 여부 |

### 2.4 반영·알림 규칙
- `guide/kb/`만 갱신한 날은 **앱을 다시 빌드·배포할 필요 없다** (`site/`·`android/` 미변경). `git commit && git push origin main`만 하면 된다.
- 사용자가 꼭 알면 좋은 **대형 변경(PBE 해금 조건 변경, 중요 숨은 메커니즘/버그 발견, B패치)**이 있었을 때만 매일 점검 요약에 1~2줄 덧붙인다. 사소한 보강은 조용히 커밋한다.

---

## 3. 참고 유튜브 목록 (시즌 18 / 기본기 — 제목·채널만, 클라우드 자막 불가)


| 채널 | 제목 | 올린 때 | 조회수 | 링크 |
|---|---|---|---|---|
| 구루루 | 【롤토체스 강의】 18시즌 운영법은 이 영상만 보셔도 됩니다  따라만 해도 점수가 복사되는 고밸류 운영법 핵심공략(롤체 시즌18 티어덱 1티어  | 1개월 전 | 73,323회 | https://youtu.be/0SRGKv_tLuk |
| 입만산_김루윈 | 【롤토체스 강의】챌린저들이 꽁꽁 숨겨둔 비밀 알려드립니다. 18.2 1티어 운영법&덱 (롤토체스 시즌18) | 1개월 전 | 95,589회 | https://youtu.be/EZ7BUvSbU78 |
| 날콤 | 롤체 시즌18 신규 시스템 및 시너지, 챔피언 등 모든 변경점에 대해 알아보자 | 2개월 전 | 131,681회 | https://youtu.be/M1Qd_5RItb0 |
| 구루루 | 【롤토체스 강의】마스터만 200명 보낸 비법 메모장 '롤체의 핵심' 롤체 근본 유저가 알려주는 18시즌 핵심공략(롤체 시즌18 티어덱 1티어 챌 | 1개월 전 | 34,277회 | https://youtu.be/JV4RRhk5uiQ |
| 구루루 | 【롤토체스 강의】드디어 찾았습니다 말도 안되는 위력을 보여주는 최강의 시너지 약탈자 워윅 리롤덱 핵심공략(롤체 시즌18 티어덱 1티어 챌린저 구 | 7시간 전 | 16,862회 | https://youtu.be/2imqV5h1mxI |
| TFT Labs | 18.2패치 조합 티어리스트 총정리 및 디테일 설명 [롤체 시즌 18] | 1개월 전 | 91,836회 | https://youtu.be/71x4WZVR9Gs |
| 인파쓰 | 주술을 컨트롤 하는 세계 [롤체 시즌18 공략] | 1개월 전 | 31,215회 | https://youtu.be/caJ1IkBwMn8 |
| 구루루 | 【롤토체스 강의】 따라만 하면 점수가 복사됩니다! 롤체 근본 랭커가 알려주는 18시즌 최적 운영법 핵심공략(롤체 시즌18 티어덱 1티어 챌린저  | 1개월 전 | 65,603회 | https://youtu.be/vFLwM2vKnKk |
| KCI [60초 롤체 판단요약] | 5연속 챌린저가 생각한 롤체 불변의 팁 3가지 | 2개월 전 | 103,570회 | https://youtu.be/t7afRk2gA6Q |
| 팔차선 [8LJAYWALKING] | 공책롤체 혐오자의 느좋롤체 | 24분 전 | 6,765회 | https://youtu.be/8rRTmpbKSRo |
| TFT Labs | 난 주는대로 가는 법을 모두 알고 있을까? [롤체 시즌 18] | 1개월 전 | 75,320회 | https://youtu.be/t3rGme9f9Nk |
| 파동TV | 증강 아이템 싹 다 몰빵한 “ 4성 케일 ” | 6시간 전 | 16,957회 | https://youtu.be/hxyNfCt5tcM |
| 신수원 TFT | 현메타 점수 올리려면 반드시 알아야만 하는 상징 활용법 공략 1편 / 롤토체스 | 4시간 전 | 2,839회 | https://youtu.be/eLKATDZQV3A |
| 선 해 | [롤토체스 강의] 삼신기 집착하지마세요 없어도 다 이기는 공략 | 1시간 전 | 289회 | https://youtu.be/7IYFxBBGHSo |
| 구루루 | 【롤토체스 강의】이번 패치 후 신이 되어버린 최강의 연승덱 제대로 알려드립니다 7협곡야수 장로드래곤덱 핵심공략(롤체 시즌18 티어덱 1티어 챌린 | 2주 전 | 56,502회 | https://youtu.be/E9yCWLNcZ1c |
| 하논코치 | 당신의 1600시간을 아껴드림🔥 롤토체스 기본기 | 1개월 전 | 244,641회 | https://youtu.be/cBzhpTf95VA |
| 입만산_김루윈 | 【롤토체스 공략】사기쳐도 1등 못하는 당신을 위해!! 유연한 밸류 운영이란 무엇인가.. 잘 풀렸을 때 고점 보는 고밸류 운영법 (롤토체스 시즌1 | 1개월 전 | 57,136회 | https://youtu.be/3Q5pIL8kkJI |
| 발명 [롤토체스] | 【롤토체스 강의】롤토체스 시즌18 총정리 | 2개월 전 | 145,076회 | https://youtu.be/BSgowuJ5k78 |
| 입만산_김루윈 | 【롤토체스 공략】랭커들이 추천하는 패치 후 떡상한 "이 빌드" 사용법 완벽 공략!! (롤토체스 시즌18) | 2주 전 | 37,854회 | https://youtu.be/GuFS1feJJjY |
| 하논코치 | 10가지 비법소스 유출🔥 | 1시간 전 | 1,432회 | https://youtu.be/Q8L9HXCI0a4 |
| 팔차선 [8LJAYWALKING] | 전략적 팀 전투 : 버그의 숲 드디어 출시했습니다 | 2개월 전 | 174,141회 | https://youtu.be/a6lcIaO5UlU |
| 전쓰트의 게임 채널 Junsst | 드디어 성공했습니다! 숲이 살아 움직이는 초극악 난이도의 신규 프리즘 11시너지 ㅋㅋㅋㅋㅋ | 1개월 전 | 453,648회 | https://youtu.be/jsJasbuYI70 |
| 전쓰트의 게임 채널 Junsst | 수백번의 도전 끝에 드디어 성공했다!!!!!!!!!!! ㅋㅋㅋㅋㅋ | 6시간 전 | 68,590회 | https://youtu.be/8Rm79m4Hqso |
| 맛나는꼬꼬 | [롤토체스 공략] 숲사자 창시자가 만든 마격암 조합 | 6년 전 | 5,304회 | https://youtu.be/0mJRP7Oc2wQ |
| 입만산_김루윈 | 【롤토체스 공략】 그의 채널에서만 볼 수 있는 메타 카운터 신비검사! 4검사 4신비술사 조합! (tft,롤토체스공략,롤토체스강의,시즌2) | 6년 전 | 53,240회 | https://youtu.be/HQBdb3i9sKQ |
| 전쓰트의 게임 채널 Junsst | 결국 무려 2달만에 성공시킨 현 메타 최강의 덱 ㅋㅋㅋㅋㅋ | 1일 전 | 124,473회 | https://youtu.be/-qULRMqkMB0 |
| 전략적 팀 전투 | 전략적 팀 전투 개발자 일기:  신비의 숲 I 개발자 영상 - 전략적 팀 전투 | 3개월 전 | 11,832회 | https://youtu.be/Smj8A3UK1QM |
| 입만산_김루윈 | 【롤토체스 공략】 상위 랭커가 만든 몰왕 녹턴! 바다 요술사의 대항마로 떠오른 신비바람 검사 암살자 조합! (tft,롤토체스공략,롤토체스강의,시 | 6년 전 | 32,266회 | https://youtu.be/cOgyRn2_GEg |
| 파동TV | 롤토체스 시즌18 : 신비의숲 맛보기 | 3개월 전 | 29,285회 | https://youtu.be/KA37muZ7nqs |
| 파동TV | 증강체 너프해봐~ 3대천사 하면 그만이야~ 무적 카르마덱ㅋㅋㅋㅋㅋㅋ | 18시간 전 | 29,208회 | https://youtu.be/1g8U8nEZ31g |
| 섭지tube | 모바일 롤토체스 왜 제 햇빛케일은 약하죠..? | 1개월 전 | 454회 | https://youtu.be/LD4BQjKeky8 |
| 전설이저장소 | 신비의 숲 파트2 배틀패스ㅣTFT 18.4 | 3주 전 | 8,294회 | https://youtu.be/tqc_fe7n1kM |
| 전략적 팀 전투 | 숲의 심장 I 신비의 숲 세트 시네마틱 - 전략적 팀 전투 | 2개월 전 | 5,208회 | https://youtu.be/QaluavhXKHU |
| 김태호 | [18.5c] 1티어덱 디테일 총정리【롤토체스강의】 | 2일 전 | 53,479회 | https://youtu.be/I3pDB3yr9D4 |
| TFT Labs | 롤체 18.5B 패치 티어덱+플레이 플랜 총정리 [롤체 시즌 18] | 9일 전 | 44,385회 | https://youtu.be/jYOUpTkruv4 |
| 구루루 | 【롤토체스 강의】이건 버프가 아니라 버그입니다 18.5패치로 떡상한 최강의 유닛 리롤 어미부리덱 핵심공략(롤체 시즌18 티어덱 1티어 챌린저 구 | 10일 전 | 75,946회 | https://youtu.be/yJR-m735BkQ |
| 하논코치 | [롤토체스 강의] 18.5 티어덱 총정리 | 11일 전 | 125,786회 | https://youtu.be/3Uwde1-1h3s |
| 최과장 | 🌟18.5b 덱 티어리스트 정리 ( NEW덱 & 상승세 덱 위주 ) 【롤토체스】 | 8일 전 | 27,476회 | https://youtu.be/jocwy-3r4Tk |
| 난몰라 | [롤토체스 공략] 굿바이 아펠... 18.5b패치 랭킹3등이 생각하는 메타 | 6일 전 | 11,296회 | https://youtu.be/rwy0ag2K3BQ |
| 김태호 | "챌린저 1100점" 1티어덱 디테일 총정리 [18.5]【롤토체스강의】 | 10일 전 | 51,993회 | https://youtu.be/OepADlOUckg |
| 김태호 | 패치 후 점수 올리는법 "3분"만 투자하세요. 18.5b 현메타 설명회 【롤토체스강의】 | 6일 전 | 24,866회 | https://youtu.be/u5NLZZc02B4 |
| 김태호 | [18.5c] 챌린저만 알고 있는 미친 날먹법 16가지 【롤토체스강의】 | 23시간 전 | 20,227회 | https://youtu.be/thQgk-wPLJg |
| 하논코치 | 덱 하나만 대깨쳐서 랭킹8등🔥 꿀은? 선착순 | 1일 전 | 26,925회 | https://youtu.be/lgjg4HKa9sw |
| 난몰라 | [롤토체스 공략] 1600점 점수복사 완료 18.5b 패치 덱 티어리스트 | 7일 전 | 7,748회 | https://youtu.be/lfEGTsUkGkw |
| 정동글 | 【OP.GG】18.5패치 현메타 덱 티어리스트 정리(서일X실력과운) | 7일 전 | 73,136회 | https://youtu.be/rWjIW1y1hBE |
| 최과장 | 18.5c 패치 후 티어 변동된 덱 및 추가된 덱 설명【롤토체스】 | 3일 전 | 17,631회 | https://youtu.be/T14C8bkH2Qc |
| 정동글 | 말도 안 되는 고점을 뽑아내는 서일식 추가선물 밸류덱 | 6시간 전 | 23,692회 | https://youtu.be/Oj4mCp7y5c4 |
| 하논코치 | 3계정 챌린저가 알려주는 18.5 현메타 핵심🔥 | 5일 전 | 26,382회 | https://youtu.be/LsRlBtf26pY |
| 난몰라 | [롤토체스 공략]랭킹3등이 알려주는 18.5b패치 점수올리기 좋은 꿀운영 | 6일 전 | 6,139회 | https://youtu.be/j-T5q8fDjvE |
| 우찌TV | 롤토체스 시즌18 "자이라" (롤토체스18 롤체18 강의 1티어 패치 18.5 원툴 원덱 리롤 대깨) | 6일 전 | 8,052회 | https://youtu.be/yjFCH2idxz4 |
| 리암 | 초반 운영부터 후반 운영 디테일까지 모두 공개합니다 [롤토체스 필수 개념 총정리] | 8개월 전 | 42,093회 | https://youtu.be/ITp2dBsA1dE |
| 김태호 | 이 기본기 깨닫고 마빵에서 챌린저 찍었습니다.. 롤토체스 기본기 밸류덱편 [롤토체스강의] | 1년 전 | 27,585회 | https://youtu.be/W-5x12BVJwE |
| 당마스 | 쉽게 롤체 잘 하는 법. 재능 없던 내가 마스터를 찍은 비밀 | 1년 전 | 191,335회 | https://youtu.be/tnn20l6jRQI |
| 용추 | 챌린저의 노하우, "돈 관리 편" | 3년 전 | 46,891회 | https://youtu.be/BmJARvelKtM |
| 김태호 | 이 기본기로 챌린저 찍었습니다. 기본기 8레벨 운영덱편【롤토체스강의】 | 1개월 전 | 34,267회 | https://youtu.be/NkWYb8p3Kjk |
| 신수원 TFT | 메타, 시즌이 바뀌어도 항상 챌린저 찍게 해주는 롤토체스 '기본기' 강의, 1라운드 편 | 1년 전 | 159,844회 | https://youtu.be/c34yqyAu4JQ |
| 입만산_김루윈 | 【롤토체스 강의】롤체를 잘하게 되는 레전드 영상. 진짜임!!! 챌린저가 알려주는 게임 내 숨겨진 디테일들 (롤토체스 시즌15) | 1년 전 | 122,511회 | https://youtu.be/R72v1knaXZY |
| 테스터훈 TesterHoon | 롤토체스 한국 랭킹 1위, 롤체 유저 필독 100% 영상입니다.. 오박사 TFT 장인초대석 [테스터훈] | 10개월 전 | 341,680회 | https://youtu.be/KcDYnnuPjTQ |
| 스웅2 | (어그로X) 이 영상 찍을려고 유튜브 시작했습니다. 롤체 챌린저 찍는법 / [롤토체스 공략, 강의] | 2년 전 | 207,461회 | https://youtu.be/CA-cDiplTi8 |
| 스웅2 | 이 영상 보시면 '롤체'를 깨닫게 될 겁니다. 챌린저들이 안 알려주는 고급 플레이 공략 / [롤토체스 공략, 강의] | 1년 전 | 139,121회 | https://youtu.be/ZfrvQuZJXSE |
| 스웅2 | 저티어와 고티어의 차이 : 어디서도 안알려주는 초반 운영 알려드리겠습니다 / [롤토체스 공략] | 2년 전 | 120,564회 | https://youtu.be/DDLThh6SGHI |
| 하논코치 | [롤토체스 강의] 게임 100판 할 바에 저라면 이거 한 편 봅니다 | 1개월 전 | 45,164회 | https://youtu.be/uYjhbP0T8vc |
| 실력과운 | 【롤체】30분 투자 = 마스터 확정 | 1년 전 | 216,346회 | https://youtu.be/j7V5hX2WzOI |
| 하논코치 | 이 방법 모르면 순방못함🔥 게임속도 컨트롤하는 법【롤토체스강의】 | 1개월 전 | 38,485회 | https://youtu.be/dqnFFx2ylQk |
| 하논코치 | 증강체 선택, 돈관리🔥 세계 랭커의 팁 [롤토체스 강의] | 3주 전 | 23,420회 | https://youtu.be/1Xii3J5rw6w |
| 당마스 | 아직도 롤체 다이아 못 찍으신 분 보세요. | 4개월 전 | 44,130회 | https://youtu.be/5yyy14sTtN8 |
| 롤가형 | 입문자, 초보를 위한 롤토체스 초반 빌드업부터 덱의 완성까지 완전정복!! [tft, 전략적 팀 전투] | 3년 전 | 384,963회 | https://youtu.be/WfSFyW2RJ08 |
| 하논코치 | 9렙 밸류 잘하는 법🔥 꿀팁 모음 / 18.2 [롤토체스 강의] | 1개월 전 | 51,396회 | https://youtu.be/Uhn-Sb9m9Ms |
| 구루루 | 【롤토체스 강의】이 방법만 알면 마스터 갈 수 있습니다 점수를 복사 시켜주는 요정상징 소라카덱 핵심공략(롤체 시즌18 티어덱 1티어 챌린저 구루 | 3일 전 | 38,849회 | https://youtu.be/7gpxzD3vmng |
| 구루루 | 【롤토체스 강의】나오면 무조건 하세요 점수를 무한으로 복사시켜주는 최강의 증강체 흡수하는 꽃 운영덱 핵심공략(롤체 시즌18 티어덱 1티어 챌린저 | 2일 전 | 43,246회 | https://youtu.be/Njv9Y1IBl_8 |
| 난 슬플때 풀캠을 돌아. | [챌린저 롤토체스 강의] '일단 눌러' 평균 등수가 달라지는 18시즌 사기 증강체 | 1개월 전 | 35,920회 | https://youtu.be/sFDqv5SJ-PA |
| 구루루 | 【롤토체스 강의】이건 합법적인 버그입니다 나오면 무조건 먹어야하는 18시즌 고트 증강체 특성사다리 밸류덱 핵심공략(롤체 시즌18 티어덱 1티어  | 4주 전 | 57,409회 | https://youtu.be/EII1Vz1IrK8 |
| 늙병삼 | [롤토체스 공략] 14분만 투자하세요! 2챌린저가 알려주는 점수가 안오를수없는 9렙 벨류덱의 핵심 운영법! (롤체 시즌18 티어덱 1티어 챌린저 | 7일 전 | 22,685회 | https://youtu.be/WVw_MhyESBk |
| 구루루 | 【롤토체스 강의】이건 버프가 아니라 버그입니다 18.3패치 이후 떡상한 최대 수혜덱 람머스 아지르덱 핵심공략(롤체 시즌18 티어덱 1티어 챌린저 | 4주 전 | 55,337회 | https://youtu.be/5pXHJaSSD5Q |
| BunnyMuffins | How to Level & Econ in Set 18 / TFT - Teamfight Tactics / BunnyMuffins | 1개월 전 | 60,114회 | https://youtu.be/35ugZf7QIGc |
| JakeskiTFT | The ULTIMATE Guide to Hitting CHALLENGER in TFT Set 18 | 2개월 전 | 3,672회 | https://youtu.be/0gv1gmmJmGw |
| JakeskiTFT | NEW META Karma Solar Reroll is BROKEN / TFT Set 18 Guide | 2주 전 | 17,046회 | https://youtu.be/XMaPa8hcqng |
| BunnyMuffins | 100 Tips Every Player Should Know for Set 18 | 2개월 전 | 99,176회 | https://youtu.be/8Q0Fn0sEvOM |
| BunnyMuffins | BEGINNER GUIDE to Teamfight Tactics / How to Play Set 18 | 2개월 전 | 65,212회 | https://youtu.be/nXmNrPgCH1k |
| Tactician's Institute | TFT Set 18: Enchanted Wilds primer / Mechanics + Traits FULL GUIDE everything yo | 2개월 전 | 128,749회 | https://youtu.be/Kw_SH2cVmmo |
| BunnyMuffins | The Only TFT Comps you Need for Patch 18.5c / Teamfight Tactics Guide / Tier Lis | 2일 전 | 19,750회 | https://youtu.be/PkqyL4aJzNU |
| BunnyMuffins | Must Know Wisp Fundamentals for TFT Set 18 | 1개월 전 | 23,741회 | https://youtu.be/M6npRhpHMOU |
| JakeskiTFT | NEW S-TIER KHA'ZIX REROLL IS BROKEN! / TFT Set 18 Guide | 1개월 전 | 13,383회 | https://youtu.be/U-I_vljeP_I |
| JakeskiTFT | NEW META Yunara Solar Reroll / TFT Set 18 Comp Guide | 1개월 전 | 13,200회 | https://youtu.be/GsjLaVH_DKY |
| TFTAcademy 및 Wasianiverson | The Rank 1 Climbing Flowchart for Set 18 Ft. Wasianiverson | 2개월 전 | 106,125회 | https://youtu.be/xtJRz5MaU_E |
| Broseph Tech | TFT Set 18 Fundamentals: Every Unique Trait Explained | 2개월 전 | 9,213회 | https://youtu.be/f-FZ6v3cONE |
| Wasianiverson | I Explained Every Trait in TFT Set 18: Enchanted Wilds | 3개월 전 | 32,910회 | https://youtu.be/DODuAf8ya8M |
| Teamfight Tactics | TFT Set 18 Enchanted Wilds PBE rundown | 3개월 전 | 77,294회 | https://youtu.be/TiGuFnwsYxY |
| TFT Clips | WasianIverson's Ultimate Set 18 Guide and Tier List | 2개월 전 | 19,743회 | https://youtu.be/9OTsNDTr2mQ |
| ExTIRIA TFT | How to play Flex comps in Set 18 | 2개월 전 | 2,817회 | https://youtu.be/tTQd1lp5Z_4 |
| Subzeroark | How to Hit Challenger in Set 18 | 2개월 전 | 9,132회 | https://youtu.be/MGsu9vh_2eQ |
| CammyTFT | I Found 3 Coven Before The Game Even Started!? / TFT Set 18 | 15시간 전 | 12,280회 | https://youtu.be/jy9qGy8p7AU |
| Wasianiverson | How to Play the Early Game in Set 18: Enchanted Wilds | 3개월 전 | 18,457회 | https://youtu.be/qHxTkK4LMZo |
| Wasianiverson | Everything You Need to Know to Climb in Set 18: Enchanted Wilds | 2개월 전 | 53,969회 | https://youtu.be/rb3oM-Ztqsk |
| Wasianiverson VODs | Who Is Making Worlds!? / Enchanted Wilds Patch 18.5c VOD / October 31st, 2026 | 7시간 전 | 1,994회 | https://youtu.be/AXZVbn4eUpA |
| Subzeroark | I Explained EVERY Low Cost Unit in Set 18 Enchanted Wilds | 3개월 전 | 3,456회 | https://youtu.be/cFxuIiIcBqA |
| croffin | Frontline Flex - TFT Set 18 Enchanted Wilds Guide | 1개월 전 | 3,983회 | https://youtu.be/RMAauDEEqBc |
| Redox - Teamfight Tactics TFT | 100% CRIT GNAR CARRY Comp in TFT SET 18! / Teamfight Tactics Enchanted Wilds Gam | 2개월 전 | 3,600회 | https://youtu.be/TDV_axEK6rA |
| Redox - Teamfight Tactics TFT | UNKILLABLE LEONA 3 CARRY in TFT SET 18! / Teamfight Tactics Enchanted Wilds Comp | 2개월 전 | 3,047회 | https://youtu.be/TrDx0CEXTv4 |
| Nanande | TFT Set 18 Enchanted Wilds - 5 Beginner Comps | 2개월 전 | 328회 | https://youtu.be/HsQuLM6le7c |
| Send TFT | My RECORD Most Gold From Augments: 150 GOLD In One Game?! | 24분 전 | 279회 | https://youtu.be/MgPsoTVMnww |
| Wasianiverson VODs | Regionals Day 1 DOMINATION / Enchanted Wilds Patch 18.5c VOD / October 30th, 202 | 1일 전 | 6,059회 | https://youtu.be/Ql0JCYze4Pc |

## 19시즌 PBE 덱 통계 (2026-11-21)
- MetaTFT가 PBE 덱 묶음을 따로 집계한다: `api-hc.metatft.com/tft-comps-api/comps_stats?queue=PBE`, `comps_data?queue=PBE` (tft_set TFTSet19, cluster_id 427), 덱 상세는 라이브와 같은 `comp_details?comp=<묶음>&cluster_id=427`. 11/21 기준 약 189만 보드(23만 판). CORS 허용이라 앱·PC 웹이 바로 받는다.
- lolchess.gg PBE 덱(`/decks?queue=pbe`)은 이 서버 IP를 403으로 막아 11/19 뒤로 멈춰 있었다. 우회하지 않는다. 롤체지지 API `meta-decks`는 `shard=pbe1`이면 season이 set19로 바뀌지만 metaDeckList가 비어 있다.
- PBE 템은 역할별로 거의 같은 세트(탱커 가고일·정령의 형상·워모그 등)가 모여 있다. 자료 오류가 아니다.
- PBE 원문 팀 플래너 번호 중 449는 그레이브즈·모데카이저·나서스가 같이 쓰는 임시 번호라 팀 코드에서 뺀다.
