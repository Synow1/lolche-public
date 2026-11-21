#!/usr/bin/env python3
"""TFT Academy(Dishsoap·Frodan) 티어리스트 -> site/tfa.json (앱 'TFT 아카데미' 탭)

사용법:
    python3 scripts/build_tfa.py            # 받아서 만들기
    python3 scripts/build_tfa.py --missing  # 번역이 없는 영어 글만 출력 (data/tfa_ko.json에 채울 것)

- 덱: https://tftacademy.com/api/tierlist/comps?set=N (사이트 티어표에 나오는 S~C + 상황별 X). 최종 보드(자리 boardIndex 0~27, 4줄×7칸, 0줄이 앞줄),
  초반 덱, 유연한 교체(maxCap, 사이트 이름 Flex Units: 상황에 따라 바꿔 넣는 유닛), 회전초밥 우선 템, 추천 증강, 스테이지별 팁, 대체 빌드.
- 증강: /api/tierlist/augments (등급 1 실버 · 2 골드 · 3 프리즘 × 시점 2-1·3-2·4-2·All)
- 아이템: /api/tierlist/items (craftables 조합템 · emblems 상징 · radiants 찬란한 · ornns 유물)
- 이름은 게임 한국어 이름(site/db.json, raw/lookup_ko.json 증강). 영어 글(덱 이름·팁)은 data/tfa_ko.json 번역을 붙인다.
  새 글이 생기면 --missing으로 뽑아 번역을 채운다 (번역이 없으면 앱에 영어로 나온다).
  번역은 롤체 하는 사람이 실제로 하는 말로: hold items = 'X에게 템을 주세요/맡겨 두세요', slam = '바로 만드세요', bait = '노릴 가치가 없어요' (guide/kb/corrections.md).
"""
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "tfa.json"
KO = ROOT / "data" / "tfa_ko.json"
API = "https://tftacademy.com/api"
HEAD = {"User-Agent": "Mozilla/5.0"}
sys.path.insert(0, str(Path(__file__).resolve().parent))
import setinfo  # noqa: E402
SET = setinfo.NUM
STYLE_KO = {"4-Cost Fast 8": "4코 8렙 운영", "Fast 9": "9렙 운영", "3-Cost Reroll": "3코 리롤", "2-Cost Reroll": "2코 리롤",
            "1-Cost Reroll": "1코 리롤", "Lose Streak": "연패 운영", "5-Cost Fast 9": "9렙 운영"}
DIFF_KO = {"EASY": "쉬움", "MEDIUM": "보통", "HARD": "어려움", "CONDITIONAL": "조건부"}
STAGE_KO = {"Stage 2": "2스테이지", "Stage 3": "3스테이지", "Stage 4": "4스테이지", "Stage 5": "5스테이지"}
AUG_EXTRA = {"DA_18_RiftbeastTraitAugmentStampede": "정글 동선", "DA_18_FloraFatalisAugmentPlus": "흡수하는 꽃+",
             "DA_PandorasItemsII": "판도라의 아이템 II"}  # 한국어 원문에 아직 없는 증강
ITEM_TYPE = {"craftables": "조합템", "emblems": "상징", "radiants": "찬란한", "ornns": "유물"}


def get(path):
    with urllib.request.urlopen(urllib.request.Request(f"{API}/{path}", headers=HEAD), timeout=60) as r:
        return json.loads(r.read())


def main():
    db = json.loads((ROOT / "site" / "db.json").read_text())
    nu, ni = db["names"]["u"], db["names"]["i"]
    lk_path = ROOT / "raw" / "lookup_ko.json"
    if not lk_path.exists():
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import tft_data as T
        lk_path.parent.mkdir(exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(T.SOURCES["lookup_ko"], headers=T.HEADERS), timeout=60) as r:
            lk_path.write_bytes(r.read())
    lk = json.loads(lk_path.read_text())
    na = {a["apiName"]: a["name"] for a in lk["augments"]}
    for i in lk["items"] + lk.get("armory_items", []):
        ni.setdefault(i["apiName"], i["name"])
    ko = json.loads(KO.read_text(encoding="utf-8")) if KO.exists() else {}
    missing = []

    def tr(en):
        en = (en or "").strip()
        if not en:
            return ""
        if en not in ko:
            missing.append(en)
        return ko.get(en, en)

    unit = lambda a: (nu.get(a) or [a])[0]
    item = lambda a: ni.get(a, a)
    aug = lambda a: na.get(a) or na.get(a.replace("_18_", "_")) or AUG_EXTRA.get(a) or a

    def board(arr, pos=False):
        out = []
        for u in arr or []:
            if not u.get("apiName"):
                continue
            x = {"u": unit(u["apiName"]), "s": u.get("stars") or 1, "i": [item(i) for i in u.get("items") or []]}
            if pos and u.get("boardIndex") is not None:
                x["pos"] = [u["boardIndex"] // 7, u["boardIndex"] % 7]
            if u.get("predecessors"):
                # TFT_Flex_Lv9 = 9렙이 되면 늘어난 자리에 넣는 유닛
                x["from"] = [unit(p) if not p.startswith("TFT_Flex") else ((re.search(r"Lv(\d+)", p) and re.search(r"Lv(\d+)", p).group(1) + "렙 자리") or "자리 추가") for p in u["predecessors"]]
            out.append(x)
        return out

    comps = []
    guides = [g for g in (get(f"tierlist/comps?set={SET}") or {}).get("guides") or [] if g.get("isPublic") and g.get("tier") in ("S", "A", "B", "C", "X")]
    if not guides:  # 새 세트 첫날: 아직 티어표가 없으면 빈 목록 (페이지가 '올라오면 보여요'로 안내, 지난 세트 덱을 새 시즌처럼 보이지 않게)
        print(f"TFT 아카데미: set={SET} 덱 티어표가 아직 없음")
    # 사이트 티어표 카드 = displayIndex 1000 미만. 1001~은 버린 가이드가 아니라 카드 안의 다른 탭(비슷한 덱)이다 (2026-11-14 사용자 지적, 사이트 확인):
    # 같은 메인 챔피언을 가진 카드 중 displayIndex가 가장 작은 카드에 붙고, 탭 순서는 displayIndex 순 (아리 자이라 카드 = 아리 자이라·아리 모르가나·주문술사 아리·영혼 개화)
    # X = 상황별(조건이 맞을 때만), sticker 9·10·11 = 상황별 안의 A·B·C, sticker 2 = 상승, 3 = 하락
    mains = sorted([g for g in guides if (g.get("displayIndex") or 0) < 1000], key=lambda g: g.get("displayIndex") or 0)
    parent_of = {}
    for g in sorted(guides, key=lambda g: g.get("displayIndex") or 0):
        mc = (g.get("mainChampion") or {}).get("apiName", "")
        # 카드(1000 미만)는 자기 자신이 카드. 같은 챔피언 카드가 여럿이어도 각자 따로 (아펠리오스 니달리·나무정령 아펠리오스·일월식은 별개 카드)
        p = g if (g.get("displayIndex") or 0) < 1000 else next((m for m in mains if (m.get("mainChampion") or {}).get("apiName", "") == mc), None)
        parent_of[g.get("compSlug", "")] = p.get("compSlug", "") if p else g.get("compSlug", "")
    for g in sorted(guides, key=lambda g: g.get("displayIndex") or 0):
        slug = g.get("compSlug", "")
        if (g.get("displayIndex") or 0) >= 1000 and parent_of.get(slug) == slug:
            continue  # 붙을 카드가 없는 탭 덱 (사이트에도 안 보임)
        comps.append({
            "parent": parent_of.get(slug, slug), "var": (g.get("displayIndex") or 0) >= 1000,
            "tier": g["tier"], "sub": {9: "A", 10: "B", 11: "C"}.get(g.get("sticker"), ""),
            "trend": {2: "up", 3: "down"}.get(g.get("sticker"), ""), "idx": g.get("displayIndex", 0), "slug": g.get("compSlug", ""),
            "title": tr(g.get("title")), "en": (g.get("title") or "").strip(),
            "style": STYLE_KO.get(g.get("style"), g.get("style") or ""), "diff": DIFF_KO.get(g.get("difficulty"), ""),
            "main": unit((g.get("mainChampion") or {}).get("apiName", "")),
            "board": board(g.get("finalComp"), True), "early": board(g.get("earlyComp")), "cap": board(g.get("maxCap")),
            "alt": board(g.get("altBuilds")),
            "carousel": [item(c["apiName"]) for c in g.get("carousel") or []],
            "mainAug": aug((g.get("mainAugment") or {}).get("apiName", "")) if g.get("mainAugment") else "",
            "augs": [aug(a["apiName"]) for a in g.get("augments") or [] if not a.get("disabled")],
            "augTypes": g.get("augmentTypes") or [], "augTip": tr(g.get("augmentsTip")),
            "tips": [[STAGE_KO.get(t.get("stage"), t.get("stage")), tr(t.get("tip"))] for t in g.get("tips") or [] if (t.get("tip") or "").strip()],
            "updated": (g.get("updated") or "").replace(" ", "T"),
        })
    by_parent = {}
    for c in comps:
        by_parent.setdefault(c["parent"], []).append(c["slug"])
    for c in comps:
        if not c["var"]:
            c["tabs"] = by_parent.get(c["slug"], [c["slug"]])  # 카드 안 탭 (자기 자신 포함, 사이트 순서)
    comps.sort(key=lambda c: (c["var"], "SABCX".index(c["tier"]), c["idx"]))
    time.sleep(0.5)
    augs = {}
    for t in get(f"tierlist/augments?set={SET}")["augments_tierlists"]:
        augs.setdefault(str(t["augmenttier"]), {})[t["stage"]] = {k: [aug(a) for a in v] for k, v in t["tier"].items()}
    time.sleep(0.5)
    items = {}
    for t in get(f"tierlist/items?set={SET}")["items_tierlists"]:
        items[ITEM_TYPE.get(t["type"], t["type"])] = {k: [item(a) for a in v] for k, v in t["tier"].items()}

    if "--missing" in sys.argv:
        print(json.dumps(sorted(set(missing)), ensure_ascii=False, indent=0))
        return
    if sum(1 for c in comps if not c["var"]) < 10 or (not setinfo.PBE and (not augs or not items)):  # 비어 오면 지난 파일을 그대로 둔다
        sys.exit(f"TFT 아카데미 데이터 이상: 덱 {len(comps)} · 증강 {len(augs)} · 아이템 {len(items)}")
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "set": SET, "comps": comps, "augs": augs, "items": items,
           "source": "TFT Academy (Dishsoap, Frodan)"}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: 덱 {sum(1 for c in comps if not c['var'])} (+탭 {sum(1 for c in comps if c['var'])}) · 증강 등급 {len(augs)} · 아이템 종류 {len(items)} · 번역 없는 글 {len(set(missing))} · {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
