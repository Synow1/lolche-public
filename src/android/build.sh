#!/usr/bin/env bash
# 롤체 노트 안드로이드 앱(APK)과 OTA 업데이트 번들을 만든다. Gradle 없이 SDK 도구로 바로 빌드한다.
#
#   bash android/build.sh            # 기본: Java·NATIVE 변경 시에만 APK 재빌드, 그 외엔 data.zip·manifest.json만 빠르게 갱신
#   bash android/build.sh --fast     # APK·SDK 단계 완전 생략 (CI·웹/데이터 수정용, < 1초)
#   bash android/build.sh --apk      # APK 강제 재빌드
#
# 서명 키(android/lolche.keystore)가 같아야 지우지 않고 덮어 깔린다. 키를 지우지 말 것.
# 비밀번호는 환경변수 LOLCHE_KEYSTORE_PASS 로 넘길 수 있다 (미지정 시 기본값 사용).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/android"
SDK="${ANDROID_SDK:-$HOME/.cache/lolche-android-sdk}"
BT="$SDK/android-15"            # build-tools 35 압축이 풀리는 폴더 이름
JAR="$SDK/android-35/android.jar"
OUT="$APP/out"
WORK="$OUT/work"
KS_PASS="${LOLCHE_KEYSTORE_PASS:-lolchenote}"
MODE="auto"
for arg in "$@"; do
  case "$arg" in
    --fast|--web-only) MODE="fast" ;;
    --apk|--force-apk) MODE="apk" ;;
  esac
done
[ "${SKIP_APK:-0}" = "1" ] && [ "$MODE" != "apk" ] && MODE="fast"

# 버전: site/version.json의 version (기능이 바뀔 때 올린다). 버전 코드는 빌드 시각이라 항상 커진다.
VERSION_CODE="$(date +%y%m%d%H)"
WEB_STAMP="$(date +%Y%m%d%H%M)"      # 페이지·데이터 버전 (자동 업데이트가 비교)
NATIVE="$(cat "$APP/NATIVE")"         # 앱 코드 버전: Java·매니페스트를 바꾸면 1 올린다 (자동 업데이트가 APK 설치를 띄움)
python3 "$ROOT/scripts/build_page.py"  # site/src 조각 -> site/tft-guide.html
python3 "$ROOT/scripts/data_changes.py"  # 지난번 올린 것과 비교한 탭별 바뀐 점 -> site/changes.json (앱이 업데이트 뒤 한 번 띄움)
python3 "$ROOT/scripts/lint_page.py"  # 같은 이름 함수가 겹치면 빌드를 멈춘다
VERSION_NAME="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/site/version.json")"
rm -rf "$WORK" && mkdir -p "$WORK/assets/www" "$WORK/gen" "$WORK/classes" "$WORK/dex" "$OUT"

# 1) 페이지와 데이터 (미사용 개인 전적 site/me 는 공개 번들에서 제외)
{
  echo '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  echo "<meta name=\"lolche-web\" content=\"$WEB_STAMP\"></head><body>"
  cat "$ROOT/site/tft-guide.html"
  echo '</body></html>'
} > "$WORK/assets/www/index.html"
cp -r "$ROOT/site/icons" "$ROOT/site/img" "$ROOT/site/fonts" \
  "$ROOT/site/db.json" "$ROOT/site/meta.json" "$ROOT/site/rank.json" "$ROOT/site/esports.json" \
  "$ROOT/site/guides.json" "$ROOT/site/items.json" "$ROOT/site/friends.json" "$ROOT/site/version.json" \
  "$ROOT/site/dist.json" "$ROOT/site/cutoffs.json" "$ROOT/site/rank_hist.json" "$ROOT/site/power.json" \
  "$ROOT/site/power_top.json" "$ROOT/site/power_s19.json" "$ROOT/site/power_top_s19.json" "$ROOT/site/oldsets.json" "$ROOT/site/tfa.json" "$ROOT/site/changes.json" "$ROOT/site/s19.json" \
  "$WORK/assets/www/"

# 정적 자산(fonts, icons, img, oldsets.json) 내용 해시 계산 (OTA 분할 업데이트용)
ASSETS_HASH="$(python3 - "$WORK/assets/www" <<'PY'
import hashlib, os, sys
root = sys.argv[1]
h = hashlib.sha256()
targets = ["fonts", "icons", "img", "oldsets.json"]
files = []
for t in targets:
    p = os.path.join(root, t)
    if os.path.isfile(p):
        files.append((t, p))
    elif os.path.isdir(p):
        for dp, _, fns in os.walk(p):
            for fn in fns:
                fp = os.path.join(dp, fn)
                files.append((os.path.relpath(fp, root), fp))
for rel, fp in sorted(files):
    h.update(rel.encode("utf-8"))
    h.update(b"\0")
    with open(fp, "rb") as f:
        h.update(f.read())
    h.update(b"\0")
print(h.hexdigest()[:12])
PY
)"

# 네이티브(Java·리소스·매니페스트·NATIVE) 해시 계산: 바뀌지 않았으면 APK 재빌드를 건너뛴다
NATIVE_SIG="$(python3 - "$APP" <<'PY'
import hashlib, os, sys
app = sys.argv[1]
h = hashlib.sha256()
files = []
for t in ("NATIVE", "AndroidManifest.xml", "src", "res"):
    p = os.path.join(app, t)
    if os.path.isfile(p):
        files.append((t, p))
    elif os.path.isdir(p):
        for dp, _, fns in os.walk(p):
            for fn in fns:
                fp = os.path.join(dp, fn)
                files.append((os.path.relpath(fp, app), fp))
for rel, fp in sorted(files):
    h.update(rel.encode("utf-8")); h.update(b"\0")
    with open(fp, "rb") as f: h.update(f.read())
    h.update(b"\0")
print(h.hexdigest()[:16])
PY
)"
PREV_NATIVE_SIG="$(cat "$OUT/.native_sig" 2>/dev/null || true)"
PREV_ASSETS_HASH="$(cat "$OUT/.assets_hash" 2>/dev/null || true)"

BUILD_APK=1
if [ "$MODE" = "fast" ]; then
  BUILD_APK=0
elif [ "$MODE" = "auto" ] && [ -f "$OUT/lolche-note.apk" ] && [ "$NATIVE_SIG" = "$PREV_NATIVE_SIG" ]; then
  BUILD_APK=0
fi

if [ "$BUILD_APK" = "1" ]; then
  if [ ! -f "$JAR" ] || [ ! -x "$BT/aapt2" ]; then
    echo "SDK 받는 중 -> $SDK"
    mkdir -p "$SDK"
    (cd "$SDK" && curl -sSfO https://dl.google.com/android/repository/platform-35_r02.zip \
               && curl -sSfO https://dl.google.com/android/repository/build-tools_r35_linux.zip \
               && unzip -qo platform-35_r02.zip && unzip -qo build-tools_r35_linux.zip && rm -f ./*.zip)
  fi
  # 2) 리소스
  "$BT/aapt2" compile --dir "$APP/res" -o "$WORK/res.zip"
  "$BT/aapt2" link -o "$WORK/base.apk" -I "$JAR" --manifest "$APP/AndroidManifest.xml" \
    -A "$WORK/assets" --java "$WORK/gen" "$WORK/res.zip" \
    --min-sdk-version 26 --target-sdk-version 34 \
    --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

  # 3) 코드
  mkdir -p "$WORK/gen/com/synow/lolche"
  cat > "$WORK/gen/com/synow/lolche/BuildInfo.java" <<EOF
package com.synow.lolche;
final class BuildInfo { static final String VERSION = "$VERSION_NAME"; static final String BUILT = "$(date +%m/%d\ %H:%M)"; static final String WEB = "$WEB_STAMP"; static final String ASSETS = "$ASSETS_HASH"; static final int NATIVE = $NATIVE; private BuildInfo() {} }
EOF
  javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR:$BT/core-lambda-stubs.jar" -nowarn -Xlint:-options \
    -d "$WORK/classes" $(find "$APP/src" "$WORK/gen" -name '*.java')
  "$BT/d8" --release --min-api 26 --lib "$JAR" --output "$WORK/dex" $(find "$WORK/classes" -name '*.class')

  # 4) 묶고 서명
  cp "$WORK/base.apk" "$WORK/unsigned.apk"
  (cd "$WORK/dex" && zip -qj "$WORK/unsigned.apk" classes.dex)
  "$BT/zipalign" -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
  KS="$APP/lolche.keystore"
  if [ ! -f "$KS" ]; then
    keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias lolche \
      -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=lolche note" >/dev/null 2>&1
  fi
  "$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
    --out "$OUT/lolche-note.apk" "$WORK/aligned.apk"
  printf '%s\n' "$NATIVE_SIG" > "$OUT/.native_sig"
  rm -f "$OUT"/lolche-note-v*.apk
  cp "$OUT/lolche-note.apk" "$OUT/lolche-note-v$VERSION_NAME.apk"
fi

# 자동 업데이트용:
# - data.zip: 일일 변경분(index.html + JSON, ~0.5MB)
# - assets.zip: 정적 자산(fonts/icons/img/oldsets.json, 해시 변경 시에만 재생성)
# - www.zip: 구버전 앱(NATIVE <= 11) 호환용 전체 번들
rm -f "$OUT/www.zip" "$OUT/data.zip"
(cd "$WORK/assets/www" && zip -qr "$OUT/www.zip" .)
if [ ! -f "$OUT/assets.zip" ] || [ "$ASSETS_HASH" != "$PREV_ASSETS_HASH" ]; then
  rm -f "$OUT/assets.zip"
  (cd "$WORK/assets/www" && zip -qr "$OUT/assets.zip" fonts icons img oldsets.json)
  printf '%s\n' "$ASSETS_HASH" > "$OUT/.assets_hash"
fi
(cd "$WORK/assets/www" && zip -qr "$OUT/data.zip" . -x 'fonts/*' 'icons/*' 'img/*' 'oldsets.json')
printf '{"version":"%s","web":"%s","native":%s,"assets":"%s","data":"data.zip","assets_zip":"assets.zip","zip":"www.zip","apk":"lolche-note.apk"}\n' \
  "$VERSION_NAME" "$WEB_STAMP" "$NATIVE" "$ASSETS_HASH" > "$OUT/manifest.json"
rm -rf "$WORK"

if [ "$BUILD_APK" = "1" ]; then
  echo "완성: android/out/lolche-note-v$VERSION_NAME.apk ($(du -h "$OUT/lolche-note.apk" | cut -f1), data.zip $(du -h "$OUT/data.zip" | cut -f1), assets.zip $(du -h "$OUT/assets.zip" | cut -f1))"
else
  echo "빠른 빌드 완성(APK 생략): v$VERSION_NAME (data.zip $(du -h "$OUT/data.zip" | cut -f1), assets.zip $(du -h "$OUT/assets.zip" | cut -f1))"
fi
