#!/usr/bin/env python3
"""새 패치 감지와 '오늘 할 갱신' 결정. 자동 갱신 루틴(CLAUDE.md)이 매일 처음에 돌린다.

    python3 scripts/check_patch.py          # 결정을 JSON으로 출력하고 data/patch_state.json 갱신
    python3 scripts/check_patch.py --done quick   # 그 갱신을 끝냈다고 기록 (quick / full / esports)

판단:
- 라이브 패치(MetaTFT 통계 패치, 롤체지지 가이드 버전) 중 하나라도 바뀌면 새 패치 → notify
- 감지한 날: quick (유닛·템·증강 원문, 검색 DB, 추천 덱, 아이콘)
- 감지 1일 뒤: full (덱 통계·티어 비교·가이드 문서까지 전부, 페이지의 덱 노트·패치 노트 손보기)
- 대회가 진행 중이거나 3일 안에 열리거나 끝난 지 4일 안이면 매일 esports (우승자가 비어 있으면 2주까지)
- PBE 기간(setinfo.PBE): MetaTFT PBE 원문의 빌드 번호(_metadata.release, 예: rls-19.1.0.6014015)가 바뀌면 pbe -> 사용자에게 한 줄 알림.
  덱·템 통계는 '최신 PBE 빌드 + 최근 3일'(MetaTFT 화면 기본값)이라 매일 점검(friends)이 다시 받으면 새 빌드 기준이 된다 (2026-11-22 사용자: "PBE도 버전 바뀌는 거 매일 추적")
"""
import json
import re
import sys
import urllib.request
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "data" / "patch_state.json"


def live_patch():
    p = json.loads(urllib.request.urlopen(urllib.request.Request(T.API + "/tft-stat-api/patch", headers=T.HEADERS), timeout=30).read())
    metatft = f"{p['patch']}{p.get('b_patch_version') or ''}"
    try:
        req = urllib.request.Request("https://lolchess.gg/meta", headers={"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36", "Accept-Language": "ko"})
        h = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
        m = re.search(r'"key":"live","name":"v([0-9.]+[a-z]?)', h)
        lolchess = m.group(1) if m else ""
    except Exception:
        lolchess = ""
    return metatft, lolchess


def esports_window(today):
    try:
        d = json.loads((ROOT / "site" / "esports.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return False
    spans = [(e["start"], e["end"]) for t in d["tournaments"] for e in t["events"] if e.get("start") and e.get("end")]
    spans += [(x["start"], x["end"]) for x in d.get("schedule", [])]
    for s, e in spans:  # 끝나고 4일까지는 매일 (미주 결승은 한국 시각으로 하루 늦고, MetaTFT에 결승 기록이 늦게 올라온다)
        if (date.fromisoformat(s[:10]) - today).days <= 3 and (today - date.fromisoformat(e[:10])).days <= 4:
            return True
    cr = d.get("crown") or {}  # 월즈 진출자 명단: 대회 3주 전부터 다 채워질 때까지 매일 (2026-11-08: 11/6 명단에서 멈춰 36명 확정을 놓침)
    if cr.get("start") and 0 <= (date.fromisoformat(cr["start"][:10]) - today).days <= 21:
        return True
    for t in d["tournaments"]:  # 끝났는데 우승자가 아직 없는 결승·TPC는 2주까지 계속 확인
        last = t["events"][-1] if t.get("events") else None
        if last and t.get("kind") in ("finals", "tpc", "crown") and not last.get("champion") and last.get("end") \
                and 0 <= (today - date.fromisoformat(last["end"][:10])).days <= 14:
            return True
    return False


def pbe_release():
    """MetaTFT PBE 원문의 빌드 번호 (못 받으면 빈 값)"""
    import setinfo
    if not getattr(setinfo, "PBE", False):
        return ""
    try:
        req = urllib.request.Request(f"https://data.metatft.com/lookups/TFTSet{setinfo.NUM}_pbe_ko_kr.json", headers=T.HEADERS)
        with urllib.request.urlopen(req, timeout=90) as r:
            return (json.loads(r.read()).get("_metadata") or {}).get("release", "")
    except Exception:
        return ""


def main():
    st = json.loads(STATE.read_text()) if STATE.exists() else {}
    today = date.today()
    if len(sys.argv) > 2 and sys.argv[1] == "--done":
        st[f"{sys.argv[2]}_done"] = today.isoformat()
        STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1))
        return
    metatft, lolchess = live_patch()
    live = max([metatft, lolchess], key=lambda v: (v.rstrip("abcdefgh"), v)) if lolchess else metatft
    actions = []
    old_set = str(st.get("metatft") or st.get("patch") or "").split(".")[0]
    if live != st.get("patch"):
        keep = {k: st[k] for k in ("set_started",) if k in st}
        st = {"patch": live, "detected": today.isoformat(), "metatft": metatft, "lolchess": lolchess, **keep}
        actions.append("notify")
    # 새 세트: MetaTFT 통계 패치 앞자리가 바뀐 날 (setinfo.py가 이 값으로 세트를 정한다). 지난 세트 이름·아이콘(oldsets)을 다시 만들고,
    # 초기 2주는 qa.js가 판·랭킹이 아직 없는 검사를 '참고'로 돌린다 (세트 19 대비, 2026-11-16)
    if old_set.isdigit() and metatft.split(".")[0].isdigit() and int(metatft.split(".")[0]) > int(old_set):
        st["set_started"] = today.isoformat()
        st.pop("newset_done", None)
        actions.insert(0, "newset")
    elif st.get("set_started") and not st.get("newset_done"):
        actions.insert(0, "newset")
    st["metatft"], st["lolchess"] = metatft, lolchess
    days = (today - date.fromisoformat(st["detected"])).days
    if days >= 0 and not st.get("quick_done"):  # 2026-11-06: 사용자 요청으로 바로 (MetaTFT는 해외 출시일부터 판이 쌓여 있음)
        actions.append("quick")
    if days >= 1 and not st.get("full_done"):
        actions.append("full")
    if esports_window(today) and st.get("esports_done") != today.isoformat():
        actions.append("esports")
    if st.get("friends_done") != today.isoformat():
        actions.append("friends")
    rel = pbe_release()
    if rel and rel != st.get("pbe_release"):
        if st.get("pbe_release"):
            actions.insert(0, "pbe")  # 첫 기록이 아니면 새 빌드 알림
        hist = st.get("pbe_builds") or []
        hist.insert(0, {"release": rel, "since": today.isoformat()})
        st["pbe_release"], st["pbe_since"], st["pbe_builds"] = rel, today.isoformat(), hist[:20]
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1))
    print(json.dumps({"patch": live, "metatft": metatft, "lolchess": lolchess, "detected": st["detected"], "pbe": st.get("pbe_release", ""), "pbe_since": st.get("pbe_since", ""),
                      "days": days, "actions": actions, "checked": datetime.now().isoformat(timespec="minutes")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
