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
        # 같은 항목이 여러 빌드에 걸쳐 바뀌면 이름은 한 번만 나오고 'PBE a | PBE b | 글 | 글 | PBE b | PBE c | 글 | 글'이 이어진다.
        # 두 번째 쌍은 앞 글의 마지막 낱말이 이름처럼 보이므로, 새 쌍의 첫 글이 앞 항목 첫 글과 같으면 같은 항목으로 본다 (2026-11-24 19.1d)
        if out and len(body) > 2 and LABEL.match(body[0]) and LABEL.match(body[1]):
            pc, pn, pk, pb = out[-1]
            last_to = pb[1] if len(pb) > 1 and LABEL.match(pb[0]) and LABEL.match(pb[1]) else None
            # 이어지는 쌍은 앞 쌍의 '후' 빌드 이후에서 시작한다 (같은 쌍이 두 번이면 서로 다른 항목: Stats On Stats / II. 빌드를 건너뛰기도 함: 릴리아 19.1→b, c→d)
            ab = split_ab(pb) if last_to else None
            # 새 쌍의 '전' 글 = 앞 쌍의 '후' 글 (첫 낱말만 같으면 'Passive:'로 시작하는 쓰레쉬·쉬바나가 섞였음)
            if last_to and last_to <= body[0] and ab and ab[3] and ab[3][:6] == body[2:2 + len(ab[3][:6])] and pk == kind:
                out[-1] = (pc, pn, pk, pb + [L[s]])
                out.append((cat, pn, kind, body))
                continue
        # 이름 자리에 글 조각(마침표로 끝남·숫자·소문자 시작·긴 문장)이 오면 앞 항목에 이어지는 것 (같은 챔피언의 다른 스킬·능력치 표 다음 스킬)
        if out and not looks_like_name(L[s]):
            pc, pn, pk, pb = out[-1]
            out[-1] = (pc, pn, pk, pb + [L[s]])
            out.append((cat, pn, kind, body))
            continue
        out.append((cat, L[s], kind, body))
    return out


def looks_like_name(n):
    return not (n.endswith(".") or n.endswith("!") or re.fullmatch(r"[\d./%s]+", n) or len(n) > 32 or n[:1].islower()
                or n[:1] in ")(;:," or ": " in n)


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
        if a.to:  # 이 빌드'로' 바뀐 것만 ('전' 빌드로 이 라벨이 든 다음 쌍은 빼고)
            ab = split_ab(body)
            if (ab and ab[1] != a.to) or (not ab and a.to not in body):
                continue
        print(describe(cat, name, kind, body))


if __name__ == "__main__":
    main()
