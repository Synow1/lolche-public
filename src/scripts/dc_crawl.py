#!/usr/bin/env python3
"""DC 롤체갤(tft 마이너갤) 개념글을 긁어 guide/kb/src/dc/ 에 텍스트로 저장한다.

사용법:
    python3 scripts/dc_crawl.py list [페이지수]       # 개념글 목록 출력 (기본 3페이지)
    python3 scripts/dc_crawl.py get 글번호 [글번호 ...]  # 본문을 guide/kb/src/dc/<번호>.txt 로 저장
    python3 scripts/dc_crawl.py search 키워드          # 제목 검색

서버에 부담 주지 않게 요청 사이에 1초씩 쉰다.
"""
import html
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

GALL = "tft"
BASE = "https://gall.dcinside.com/mgallery/board"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
OUT = Path(__file__).resolve().parent.parent / "guide" / "kb" / "src" / "dc"  # 커밋됨 (raw/는 gitignore)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="ignore")


def parse_list(page):
    for tr in re.findall(r'<tr class="ub-content.*?</tr>', page, re.S):
        no = re.search(r'data-no="(\d+)"', tr)
        title = re.search(r'<td class="gall_tit[^>]*>.*?<a[^>]*>(.*?)</a>', tr, re.S)
        date = re.search(r'gall_date" title="([^"]+)"', tr)
        rec = re.search(r'gall_recommend">(\d+)', tr)
        if no and title:
            yield (no.group(1), date.group(1)[:10] if date else "", rec.group(1) if rec else "",
                   html.unescape(re.sub("<[^>]+>", "", title.group(1)).strip()))


def show(rows):
    seen = set()
    for no, date, rec, title in rows:
        if no not in seen:
            seen.add(no)
            print(no, date, rec, title, sep="\t")


def list_recommended(pages=3):
    rows = []
    for p in range(1, pages + 1):
        rows += parse_list(get(f"{BASE}/lists/?id={GALL}&exception_mode=recommend&page={p}"))
        time.sleep(1)
    show(rows)


def search(keyword):
    q = urllib.parse.urlencode({"id": GALL, "s_type": "search_subject", "s_keyword": keyword})
    show(parse_list(get(f"{BASE}/lists/?{q}")))


def post_text(no):
    page = get(f"{BASE}/view/?id={GALL}&no={no}")
    title = re.search(r'<span class="title_subject">(.*?)</span>', page, re.S)
    body = re.search(r'<div class="write_div"[^>]*>(.*?)if\(window\.OutLink', page, re.S)
    text = body.group(1) if body else ""
    text = re.sub(r"<(br|/p|/div)[^>]*>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    return f"{html.unescape(title.group(1)) if title else no}\n{text}\n"


def comments(no, page_html=None):
    """글의 댓글을 가져온다. 질문 글은 답이 댓글에 있다."""
    import json
    page_html = page_html or get(f"{BASE}/view/?id={GALL}&no={no}")
    esno = re.search(r'name="e_s_n_o" value="([^"]+)"', page_html)
    if not esno:
        return []
    body = urllib.parse.urlencode({"id": GALL, "no": no, "cmt_id": GALL, "cmt_no": no, "focus_cno": "", "focus_pno": "",
                                   "e_s_n_o": esno.group(1), "comment_page": "1", "sort": "", "prevCnt": "",
                                   "board_type": "", "_GALLTYPE_": "M"}).encode()
    req = urllib.request.Request("https://gall.dcinside.com/board/comment/", data=body, headers={
        "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": f"{BASE}/view/?id={GALL}&no={no}",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8", errors="ignore") or "{}")
    out = []
    for c in data.get("comments") or []:
        text = html.unescape(re.sub(r"<[^>]+>", "", c.get("memo") or "")).strip()
        if text and c.get("nicktype") != "COMMENT_BOY":  # 댓글돌이(광고) 제외
            out.append(text)
    return out


def save(nos):
    OUT.mkdir(parents=True, exist_ok=True)
    for no in nos:
        page = get(f"{BASE}/view/?id={GALL}&no={no}")
        text = post_text(no)
        try:
            cs = comments(no, page)
        except Exception as e:  # 댓글이 막혀도 본문은 저장
            cs = [f"(댓글 실패: {e})"]
        if cs:
            text += "\n[댓글]\n" + "\n".join(f"- {c}" for c in cs) + "\n"
        (OUT / f"{no}.txt").write_text(text, encoding="utf-8")
        print("saved", no, f"댓글 {len(cs)}")
        time.sleep(1)


if __name__ == "__main__":
    cmd, args = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ("list", [])
    if cmd == "list":
        list_recommended(int(args[0]) if args else 3)
    elif cmd == "search":
        search(" ".join(args))
    elif cmd == "get":
        save(args)
    else:
        sys.exit(__doc__)
