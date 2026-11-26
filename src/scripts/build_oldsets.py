#!/usr/bin/env python3
"""지난 시즌 전적용 이름·아이콘 표 -> site/oldsets.json

전적 탭에서 지난 시즌(롤체지지 season=set15 등)을 열면 유닛·시너지·아이템이 지금 세트 데이터에 없다.
CommunityDragon의 버전별 ko_kr.json에서 예전 세트 이름과 아이콘 경로를 모은다 (최신 버전엔 일부 세트만 남아 있어서 옛 버전도 같이).

사용법:
    python3 scripts/build_oldsets.py

출력 (키는 소문자 apiName. 롤체지지가 tft9_reksai처럼 소문자로 줄 때가 있다): {"u": {apiName: [이름, 코스트, 아이콘 URL]}, "t": {apiName: [이름, 아이콘 URL]}, "i": {apiName: [이름, 아이콘 URL]}}
지금 세트(18)는 넣지 않는다 (db.json·icons에 있음). 세트가 바뀌면 한 번 다시 돌린다.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "oldsets.json"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import setinfo  # noqa: E402
CUR = setinfo.NUM  # 지금 세트 (이것만 빼고 지난 세트 전부)
# 최신 + 옛 세트가 살아 있는 버전들 (세트 9 13.12, 9.5 13.20, 10 14.1, 11 14.8, 12 14.16)
VERSIONS = ["latest", "14.16", "14.8", "14.1", "13.20", "13.12"]
HEAD = {"User-Agent": "Mozilla/5.0"}


def icon(ver, path):
    if not path:
        return ""
    p = path.lower()
    p = re.sub(r"\.(tex|dds)$", ".png", p)
    return f"https://raw.communitydragon.org/{ver}/game/{p}"


def set_no(api):
    """TFT9_Ahri / Set9_X -> 9. 세트 18부터는 DA_ 이름: DA_18_Ornn, DA_Nidalee18_AP, DA_DravenUniqueTrait18 -> 18 (2026-11-16 세트 19 대비로 확인)"""
    a = api or ""
    m = re.match(r"(?:TFT|Set)(\d+)", a) or re.match(r"DA_(\d+)_", a) or re.match(r"DA_[A-Za-z]+?(\d+)(?:_|$)", a)
    return int(m.group(1)) if m else 0


# CommunityDragon effects[].style (세트 7~18 공통 실측): 1 동 · 3 은 · 4 고유 · 5 금 · 6 프리즘
CD_STYLE = {1: "bronze", 2: "bronze", 3: "silver", 4: "unique", 5: "gold", 6: "chromatic"}


def parse_steps(effects):
    """CDragon trait effects -> [[minUnits, styleStr], ...]. 같은 minUnits 중복(퀘스트 프리즘 등)은 비프리즘 우선."""
    out = []
    for e in effects or []:
        m = e.get("minUnits")
        st = CD_STYLE.get(e.get("style"), "bronze")
        if m is None:
            # 일월식(DA_18_Eclipse)처럼 인원 없이 조합으로 켜지는 특수 시너지
            out.append([0, "gold"])
            continue
        if out and out[-1][0] == int(m):
            if out[-1][1] == "chromatic" and st != "chromatic":
                out[-1][1] = st
            continue
        out.append([int(m), st])
    return out


def main():
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    U, T, I = {}, {}, {}
    for ver in VERSIONS:
        url = f"https://raw.communitydragon.org/{ver}/cdragon/tft/ko_kr.json"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEAD), timeout=180) as r:
                d = json.loads(r.read())
        except Exception as e:
            print("못 받음", ver, e)
            continue
        n0 = len(U)
        for s in d.get("setData", []):
            for c in s.get("champions", []):
                a = c.get("apiName", "")
                sn = set_no(a)
                if not sn or sn >= CUR or a.lower() in U or not c.get("name") or (c.get("cost") or 0) < 1:
                    continue
                k = a.lower()
                pv = (prev.get("u") or {}).get(k)
                ic = pv[2] if pv and len(pv) >= 3 and not str(pv[2]).startswith("http") else icon(ver, c.get("tileIcon") or c.get("squareIcon"))
                U[k] = [c["name"], min(5, c["cost"]), ic]
            for t in s.get("traits", []):
                a = t.get("apiName", "")
                sn = set_no(a)
                if not sn or sn >= CUR or a.lower() in T or not t.get("name"):
                    continue
                k = a.lower()
                pv = (prev.get("t") or {}).get(k)
                ic = pv[1] if pv and len(pv) >= 2 and not str(pv[1]).startswith("http") else icon(ver, t.get("icon"))
                steps = parse_steps(t.get("effects"))
                T[k] = [t["name"], ic, steps] if steps else [t["name"], ic]
        for it in d.get("items", []):
            a = it.get("apiName", "")
            if not a or a.lower() in I or not it.get("name") or not it.get("icon"):
                continue
            # 세트 18부터 롤체지지 판 기록의 템도 DA_ 이름 (DA_HextechGunblade, DA_MoonlightRitual18)
            if not (a.startswith("TFT_Item_") or re.match(r"TFT\d+_Item_", a) or a.startswith("DA_")):
                continue
            k = a.lower()
            pv = (prev.get("i") or {}).get(k)
            ic = pv[1] if pv and len(pv) >= 2 and not str(pv[1]).startswith("http") else icon(ver, it.get("icon"))
            I[k] = [it["name"], ic]
        print(ver, "유닛", len(U) - n0, "누적", len(U), "시너지", len(T), "아이템", len(I))
    # 기존 oldsets.json에만 있던 로컬 항목(예: 별칭 키)도 보존
    for sec in ("u", "t", "i"):
        dst = {"u": U, "t": T, "i": I}[sec]
        for k, v in (prev.get(sec) or {}).items():
            if k not in dst:
                dst[k] = v
    OUT.write_text(json.dumps({"u": U, "t": T, "i": I}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: 유닛 {len(U)} · 시너지 {len(T)} · 아이템 {len(I)} · {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    sys.exit(main())
