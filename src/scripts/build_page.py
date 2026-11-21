#!/usr/bin/env python3
"""페이지 조립: site/src/ 의 조각을 이름순으로 이어 site/tft-guide.html 을 만든다.

페이지는 site/src/ 에서 고친다 (화면별 HTML, 010~014_*.css, 기능별 JS). site/tft-guide.html 은 결과물이라
직접 고치면 안 된다. 직접 고친 흔적이 있으면(마지막 조립 결과와 다름) 덮어쓰지 않고 멈춘다.
  python3 scripts/build_page.py          # 조립
  python3 scripts/build_page.py --check  # 조립 결과와 지금 파일이 같은지만 확인
"""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, MARK = ROOT / "site" / "src", ROOT / "site" / "tft-guide.html", ROOT / "site" / "src" / ".built"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    parts = sorted(p for p in SRC.iterdir() if p.suffix in (".html", ".css", ".js"))
    new = b"".join(p.read_bytes() for p in parts)
    # 세트 값은 scripts/setinfo.py 한 곳에서 (세트 19 대비, 2026-11-16): 조각에는 __SET_ID__·__SET_NAMES__ 자리만 둔다
    import json
    sys.path.insert(0, str(ROOT / "scripts"))
    import setinfo
    nm = {str(k): v.get("ko") or v.get("en") or "" for k, v in setinfo.names().items()}
    new = new.replace(b"__SET_ID__", setinfo.SET.encode()).replace(b"__SET_NAMES__", json.dumps(nm, ensure_ascii=False).encode())
    cur = OUT.read_bytes() if OUT.exists() else b""
    if "--check" in sys.argv:
        if cur != new:
            sys.exit("페이지 조립: site/tft-guide.html 이 site/src 와 달라요. python3 scripts/build_page.py 를 돌리세요")
        print("페이지 조립: 같음")
        return
    last = MARK.read_text().strip() if MARK.exists() else ""
    if cur and cur != new and last and sha(cur) != last:
        sys.exit("페이지 조립: site/tft-guide.html 을 직접 고친 흔적이 있어요. 그 변경을 site/src 조각으로 옮긴 뒤 "
                 "git checkout site/tft-guide.html 하고 다시 돌리세요")
    OUT.write_bytes(new)
    MARK.write_text(sha(new) + "\n")
    print(f"페이지 조립: 조각 {len(parts)}개 -> site/tft-guide.html ({len(new) // 1024}KB)")


if __name__ == "__main__":
    main()
