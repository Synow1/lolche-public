#!/usr/bin/env python3
"""롤체 지식 검색: guide/ 문서 + 갤 원문(guide/kb/src/dc)에서 키워드를 찾는다.

    python3 scripts/kb.py 나무정령 상징      # 모든 키워드가 들어간 줄 (AND)
    python3 scripts/kb.py -f 재조합기         # 파일별 개수만
"""
import signal
import sys

signal.signal(signal.SIGPIPE, signal.SIG_DFL)
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "guide"


def main(args):
    files_only = "-f" in args
    keys = [a for a in args if a != "-f"]
    if not keys:
        sys.exit(__doc__)
    paths = sorted(ROOT.rglob("*.md")) + sorted((ROOT / "kb" / "src" / "dc").glob("*.txt"), key=lambda p: -int(p.stem))
    for p in paths:
        hits = [(i, l) for i, l in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1)
                if all(k.lower() in l.lower() for k in keys)]
        if not hits:
            continue
        rel = p.relative_to(ROOT.parent)
        if files_only:
            print(len(hits), rel)
            continue
        title = p.read_text(encoding="utf-8").split("\n", 1)[0] if p.suffix == ".txt" else ""
        print(f"== {rel} {title}")
        for i, l in hits[:8]:
            print(f"  {i}: {l.strip()[:200]}")


if __name__ == "__main__":
    main(sys.argv[1:])
