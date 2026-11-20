#!/usr/bin/env python3
"""페이지(site/tft-guide.html) 스크립트 검사: 바깥 범위에 같은 이름의 함수가 두 번 있으면 뒤의 것이 앞의 것을 덮어써서
조용히 기능이 깨진다 (2026-11-08: 재료 탭의 recipeOf(n)가 조합표의 recipeOf(a, b)를 덮어써 조합표가 비었다).
android/build.sh가 빌드 전에 돌린다. 문제가 있으면 종료 코드 1."""
import collections
import re
import sys
from pathlib import Path

s = (Path(__file__).resolve().parent.parent / "site" / "tft-guide.html").read_text(encoding="utf-8")
js = s[s.rindex("<script"):]
top = re.findall(r"^  function\s+(\w+)\s*\(", js, re.M)  # IIFE 바로 안(들여쓰기 2칸) 함수
dup = [k for k, v in collections.Counter(top).items() if v > 1]
if dup:
    print("같은 이름 함수가 두 번 있어요:", ", ".join(dup))
    sys.exit(1)
print("페이지 검사: 이상 없음 (함수", len(top), "개)")
