#!/usr/bin/env bash
# 앱 자동 업데이트 파일을 공개 레포 Synow1/lolche-public 에 올린다.
#   bash android/build.sh && bash scripts/publish_app.sh
# 앱은 켤 때 manifest.json 을 보고:
# - web(페이지·데이터)이 새로우면 data.zip(~0.5MB)만 받아 바로 적용
# - assets(아이콘·폰트·이미지·oldsets) 해시가 바뀌면 assets.zip(~3.1MB)을 받아 적용
# - native(앱 코드)가 새로우면 lolche-note.apk 를 받아 설치 확인 창을 띄운다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/android/out"
REPO=https://github.com/Synow1/lolche-public
DIR="$(dirname "$ROOT")/lolche-public"   # 세션에 붙은 클론 (없으면 새로 받음)
[ -f "$OUT/manifest.json" ] || { echo "먼저 bash android/build.sh"; exit 1; }
# 올리기 전 자동 점검: PC 웹 묶음 생성 + 덱파워 Python-JS 일치 검사 + 전 탭 QA (앱 + PC 웹). 하나라도 실패하면 올리지 않는다
python3 "$ROOT/scripts/build_web.py" --no-page --out "$ROOT/build/web" || { echo "PC 웹 빌드 실패 → 올리지 않음"; exit 1; }
node "$ROOT/scripts/check_power_parity.js" || { echo "덱파워 일치 검사 실패 → 올리지 않음"; exit 1; }
node "$ROOT/scripts/qa.js" || { echo "앱 점검 실패 → 올리지 않음 (위 목록을 고친 뒤 다시)"; exit 1; }
if git -C "$DIR" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$DIR" fetch -q --depth 1 origin main && git -C "$DIR" reset -q --hard origin/main
else
  git clone -q --depth 1 "$REPO" "$DIR"
fi
cp "$OUT/manifest.json" "$OUT/www.zip" "$OUT/data.zip" "$OUT/assets.zip" "$DIR/"
cp "$OUT/lolche-note.apk" "$DIR/lolche-note.apk"
# PC 웹 (GitHub Pages: https://synow1.github.io/lolche-public/)
DOCS="$DIR/docs"
rm -rf "$DOCS" && cp -r "$ROOT/build/web" "$DOCS"
# 협업용 소스 (2026-11-20 사용자: 제미나이가 최신 코드를 바로 읽게). 원본 레포는 비공개로 두고, 정해 둔 것만 src/ 에 복사한다.
# 서명 키(android/lolche.keystore)·개인 전적(data/me)·원본 데이터(raw, data)는 넣지 않는다.
SRC="$DIR/src"
rm -rf "$SRC" && mkdir -p "$SRC/site" "$SRC/android"
cp -r "$ROOT/site/src" "$SRC/site/src"
cp -r "$ROOT/android/src" "$SRC/android/src"
cp "$ROOT/android/build.sh" "$ROOT/android/NATIVE" "$SRC/android/"
cp -r "$ROOT/scripts" "$ROOT/guide" "$SRC/"
cp "$ROOT/CLAUDE.md" "$SRC/"
find "$SRC" -name '__pycache__' -type d -prune -exec rm -rf {} +
# 안전장치: 서명 키·개인 전적·비밀 값이 공개 레포에 들어가면 멈춘다 (src·docs 안까지 전부)
if find "$DIR" -name '*.keystore' -o -name '*.jks' -o -path '*/data/me/*' -o -path '*/site/me/*' -o -path "$DOCS/me/*" -o -path "$DOCS/friends.json" | grep -q .; then
  echo "오류: 공개 레포에 서명 키나 개인 전적/친구 파일이 있어 배포를 중단합니다." >&2
  exit 1
fi
if grep -rIlE 'ghp_[A-Za-z0-9]{20}|github_pa[t]_|sk-[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|@gmail\.com' "$SRC" "$DOCS" | grep -q .; then
  echo "오류: 공개 레포(src/docs)에 비밀 값처럼 보이는 글이 있어 배포를 중단합니다:" >&2
  grep -rIlE 'ghp_[A-Za-z0-9]{20}|github_pa[t]_|sk-[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|@gmail\.com' "$SRC" "$DOCS" >&2
  exit 1
fi
cat > "$DIR/README.md" <<'MD'
# 롤체 노트 앱 업데이트 · PC 웹

TFT 공략 앱의 업데이트 파일과 PC 웹 버전(GitHub Pages)이에요.

- `docs/`: PC 웹 버전 (`https://synow1.github.io/lolche-public/`)
- `data.zip`: 페이지·일일 덱 통계 (~0.5MB, 설치 없이 바로 적용)
- `assets.zip`: 아이콘·폰트·이미지·지난 시즌 사전 (해시 변경 시에만 다운로드)
- `www.zip`: 구버전 앱 호환용 전체 묶음
- `lolche-note.apk`: 앱 (앱 기능이 바뀔 때만 설치 확인)
- `src/`: 협업용 소스 사본 (페이지 조각·앱 코드·스크립트·문서). 올릴 때마다 원본에서 새로 복사돼요.
MD
cd "$DIR"
git add -A
VER="$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print(m["version"], m["web"])' manifest.json)"
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "v$VER" || { echo "바뀐 것 없음"; exit 0; }
git push -q -u origin HEAD:main
python3 "$ROOT/scripts/data_changes.py" --commit  # 올렸으니 이번 바뀐 점을 기록으로, 지금 데이터를 다음 비교 기준으로
echo "올림: lolche-public v$VER"
