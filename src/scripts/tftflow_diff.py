#!/usr/bin/env python3
"""tftflow.com 패치 변경점(PBE 빌드 사이 diff)을 한 줄씩 뽑는다.

라이엇이 PBE 중간 빌드(19.1 -> 19.1b 등)는 공식 노트를 안 쓰는데, tftflow가
게임 원문을 비교해 /patch-changes/set<N> 에 올린다. 정적 HTML이라 태그만 벗기면 된다.

  python3 scripts/tftflow_diff.py                 # 지금 세트 전체
  python3 scripts/tftflow_diff.py --to "PBE 19.1b"  # 이 빌드로 바뀐 것만
  python3 scripts/tftflow_diff.py --file page.html  # 받아 둔 HTML로

출력: [분류] 이름 (종류): 바뀐 낱말 A -> B ; ...  (수치 변경은 1/2/3/4성 그대로)
"""
import argparse
import difflib
import html
import re
import subprocess
import sys

sys.path.insert(0, __import__("os").path.dirname(__file__))

CATS = ("Champions", "Items", "Augments", "Traits", "Encounters")
LABEL = re.compile(r"^(PBE|Live|Patch)\s*\d+\.\d+\w*$")
KIND = re.compile(r"^(BUFF|NERF|ADJUST(ED)?|NEW|REMOVED|STAGES|\w+ Ability)$")


def fetch(set_num):
    url = f"https://tftflow.com/patch-changes/set{set_num}"
    return subprocess.run(["curl", "-sL", "--max-time", "60", url],
                          capture_output=True, text=True, check=True).stdout


def tokens(page):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    L = [x.strip() for x in t.split("\n") if x.strip()]
    if "Clear Filters" in L:
        L = L[L.index("Clear Filters") + 1:]
    end = next((i for i, x in enumerate(L) if x.startswith("TFT Flow isn't endorsed")), len(L))
    return L[:end]


def entities(L):
    """[(분류, 이름, 종류, 본문 토큰)]. 이름 = 종류/빌드 표시 바로 앞 토큰."""
    starts = []
    for i in range(1, len(L)):
        if (KIND.match(L[i]) or LABEL.match(L[i])) and not LABEL.match(L[i - 1]) \
                and not KIND.match(L[i - 1]) and L[i - 1] not in CATS:
            # 'Added.' 다음 라벨 같은 반복 라벨은 같은 항목 안이다
            if LABEL.match(L[i]) and i >= 2 and (L[i - 1] in ("Added.", "Removed.")):
                continue
            starts.append(i - 1)
    cat, out = "", []
    cat_at = {i: x for i, x in enumerate(L) if x in CATS}
    for n, s in enumerate(starts):
        e = starts[n + 1] if n + 1 < len(starts) else len(L)
        for ci in sorted(cat_at):
            if ci < s:
                cat = cat_at[ci]
        body = [x for x in L[s + 1:e] if x not in CATS]
        kind = body[0] if body and KIND.match(body[0]) else ""
        if kind:
            body = body[1:]
        # 보상표(특성 사다리·재회 공연 등)는 줄마다 'PBE a | Added.'가 되풀이돼
        # 마지막 보상 이름이 새 항목처럼 보인다 -> 앞 항목에 붙인다
        if out and not kind and len(body) > 1 and LABEL.match(body[0]) \
                and not LABEL.match(body[1]) and is_table(out[-1][3]):
            pc, pn, pk, pb = out[-1]
            out[-1] = (pc, pn, pk, pb + [L[s]] + body)
            continue
        out.append((cat, L[s], kind, body))
    return out


def is_table(body):
    return any(x in ("Added.", "Removed.") or "Distribution" in x or x == "Outcomes" for x in body)


def split_ab(body):
    """'PBE a | PBE b | 글A | 글B' -> (a, b, 글A, 글B). 글B는 글A 첫 낱말로 다시 시작한다."""
    labs = [x for x in body[:2] if LABEL.match(x)]
    if len(labs) == 2:
        rest = body[2:]
        best = None
        for m in range(1, len(rest)):
            if rest[m] == rest[0]:
                d = abs(len(rest) - 2 * m)
                if best is None or d < best[0]:
                    best = (d, m)
        if best:
            return labs[0], labs[1], rest[:best[1]], rest[best[1]:]
        return labs[0], labs[1], rest, []
    return None


def describe(cat, name, kind, body):
    ab = split_ab(body)
    if ab:
        a, b, A, B = ab
        if not B:
            return f"[{cat}] {name} ({kind or a + '->' + b}): " + " ".join(A)[:300]
        sm = difflib.SequenceMatcher(a=A, b=B, autojunk=False)
        ch = [f"{' '.join(A[i1:i2]) or '(없음)'} -> {' '.join(B[j1:j2]) or '(없음)'}"
              for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
        return f"[{cat}] {name} ({kind + ' ' if kind else ''}{a}->{b}): " + (" ; ".join(ch) or "글만 같음")
    # BUFF/NERF 표('항목 | 전 | 후')나 보상표는 원문 그대로
    return f"[{cat}] {name} ({kind or '표'}): " + " | ".join(body)[:1200]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=int)
    ap.add_argument("--file")
    ap.add_argument("--to", help="이 빌드 라벨로 바뀐 항목만 (예: 'PBE 19.1b')")
    a = ap.parse_args()
    if a.file:
        page = open(a.file, encoding="utf-8").read()
    else:
        n = a.set
        if n is None:
            import setinfo
            n = setinfo.NUM
        page = fetch(n)
    for cat, name, kind, body in entities(tokens(page)):
        if a.to and a.to not in body:
            continue
        print(describe(cat, name, kind, body))


if __name__ == "__main__":
    main()
