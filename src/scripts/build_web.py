#!/usr/bin/env python3
"""PC 웹(GitHub Pages) 묶음 생성: build/web (또는 --out 경로).

조립된 페이지(index.html) + site/*.json(앱 www.zip과 같은 목록, site/me·개인 friends.json 제외)
+ icons·img·fonts 를 한 폴더에 모은다.
  python3 scripts/build_web.py
  python3 scripts/build_web.py --out build/web
"""
import argparse
import datetime
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

# 앱 www.zip에 들어가는 공개 데이터 목록 (개인 전적 site/me, 개인 친구 스냅샷 friends.json 제외)
WEB_JSONS = [
    "db.json",
    "meta.json",
    "rank.json",
    "esports.json",
    "guides.json",
    "items.json",
    "version.json",
    "dist.json",
    "cutoffs.json",
    "rank_hist.json",
    "power.json",
    "power_top.json",
    "power_s19.json",
    "power_top_s19.json",
    "oldsets.json",
    "tfa.json",
    "changes.json",
    "s19.json",
]

WEB_DIRS = ["icons", "img", "fonts"]

FAVICON = (
    "data:image/svg+xml,"
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
    "%3Cpath d='M16 1.8 28.3 8.9v14.2L16 30.2 3.7 23.1V8.9z' fill='%23E8B94F'/%3E"
    "%3Cpath d='M16 7.2 23.6 11.6v8.8L16 24.8l-7.6-4.4v-8.8z' fill='%23080B12'/%3E"
    "%3Cpath d='M11.6 19h8.8l.8-6.2-3 2.1L16 11l-2.2 3.9-3-2.1z' fill='%23E8B94F'/%3E"
    "%3C/svg%3E"
)


def sanitize_public_html(body: str) -> str:
    """공개 웹 페이지 HTML에 앱 전용 세션 ID·개인 기본 친구 목록이 남지 않게 비운다."""
    body = re.sub(r'var SESSION = "[^"]*";', 'var SESSION = "";', body)
    body = re.sub(r'var FRIENDS = \[[^\]]*\],', 'var FRIENDS = [],', body)
    return body


def main():
    ap = argparse.ArgumentParser(description="Build PC web bundle for GitHub Pages")
    ap.add_argument("--out", default=str(ROOT / "build" / "web"), help="output directory")
    ap.add_argument("--no-page", action="store_true", help="skip running build_page.py / lint_page.py")
    args = ap.parse_args()

    if not args.no_page:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "build_page.py")], check=True)
        subprocess.run([sys.executable, str(ROOT / "scripts" / "lint_page.py")], check=True)

    out = Path(args.out).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    stamp = datetime.datetime.now().strftime("%Y%m%d%H%M")
    body = sanitize_public_html((SITE / "tft-guide.html").read_text(encoding="utf-8"))
    index_html = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="description" content="롤체 노트 — TFT 19시즌 프리즘 투어, 메타 덱, 아이템·증강 티어표, 전적 검색 및 덱파워 분석">\n'
        f'<meta name="lolche-web" content="{stamp}">\n'
        f'<link rel="icon" href="{FAVICON}">\n'
        '</head><body>\n'
        f'{body}\n'
        '</body></html>\n'
    )
    (out / "index.html").write_text(index_html, encoding="utf-8")
    (out / ".nojekyll").write_text("", encoding="utf-8")

    missing = []
    for name in WEB_JSONS:
        src = SITE / name
        if not src.exists():
            missing.append(name)
            continue
        shutil.copy2(src, out / name)
    if missing:
        sys.exit(f"웹 빌드 오류: 누락된 JSON 파일 -> {', '.join(missing)}")

    for d in WEB_DIRS:
        src = SITE / d
        if not src.exists():
            sys.exit(f"웹 빌드 오류: 누락된 폴더 -> site/{d}")
        shutil.copytree(src, out / d)

    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"PC 웹 묶음 완성: {out} (JSON {len(WEB_JSONS)}개 + 자산 {len(WEB_DIRS)}개, {total / (1024 * 1024):.1f}MB)")


if __name__ == "__main__":
    main()
