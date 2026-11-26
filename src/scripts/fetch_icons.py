#!/usr/bin/env python3
"""MetaTFT CDN에서 아이콘을 받아 site/icons/ 에 webp로 저장하고 site/icons/index.json 을 만든다.

사용법:
    python3 scripts/tft_data.py fetch     # raw/lookup_ko.json 이 먼저 있어야 함
    python3 scripts/fetch_icons.py

index.json 은 한국어 이름 -> 아이콘 경로, 아이템 조합식, 유닛 코스트를 담는다. 페이지가 이걸 읽어 아이콘을 붙인다.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import setinfo  # noqa: E402
RAW = ROOT / "raw"
OUT = ROOT / "site" / "icons"
CDN = "https://cdn.metatft.com"
SIZE = 96
UNIT_SIZE = 128  # 챔피언은 배치판에 크게 나와서 MetaTFT 원본 크기(128)로 (2026-11-21 사용자: "아이콘 화질이 깨져 보여")
HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "image/webp,image/*", "Referer": "https://www.metatft.com/"}


def size_of(kind):
    return UNIT_SIZE if kind == "champions" else SIZE


def too_small(path, kind):
    """예전에 96px로 받은 챔피언 그림이면 다시 받는다"""
    if kind != "champions" or not path.exists(): return False
    try:
        from PIL import Image
        return Image.open(path).size[0] < UNIT_SIZE
    except Exception:
        return False


def get(kind, name):
    src = f"{CDN}/file/metatft/{kind}/{name}.png"
    sz = size_of(kind)
    url = f"{CDN}/cdn-cgi/image/width={sz},height={sz},quality=88,format=webp/{src}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def save(kind, folder, name):
    path = OUT / folder / f"{name}.webp"
    if not path.exists() or too_small(path, kind):
        try:
            data = get(kind, name)
        except Exception as e:
            print("missing", kind, name, getattr(e, "code", e))
            return f"icons/{folder}/{name}.webp" if path.exists() else None
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        time.sleep(0.05)
    return f"icons/{folder}/{name}.webp"


def radiant_icons(lk, index):
    """찬란한 템은 게임 원본 그림(금색 테두리)으로. MetaTFT CDN은 찬란한 템에 일반 템과 같은 그림을 준다 (2026-11-10 사용자 지적).
    CommunityDragon ko_kr.json에서 같은 이름의 템 아이콘을 받아 덮어쓴다. 받은 목록은 site/icons/radiant.json (다시 안 받음)."""
    import io
    mark = OUT / "radiant.json"
    done = json.loads(mark.read_text()) if mark.exists() else {}
    todo = [i for i in lk["items"] + lk.get("armory_items", []) if "Radiant" in i["apiName"] and i["name"] in index["items"] and i["name"] not in done]
    if not todo:
        return
    try:
        from PIL import Image
        cd = RAW / "cd_ko.json"
        if not cd.exists():
            with urllib.request.urlopen(urllib.request.Request("https://raw.communitydragon.org/latest/cdragon/tft/ko_kr.json", headers={"User-Agent": "Mozilla/5.0"}), timeout=180) as r:
                cd.write_bytes(r.read())
        by = {}
        for it in json.loads(cd.read_text(encoding="utf-8"))["items"]:
            if it.get("name") and it.get("icon") and "radiant" in it["icon"].lower():
                by.setdefault(it["name"], it["icon"])
        for i in todo:
            ic = by.get(i["name"])
            if not ic:  # 게임에도 찬란한 전용 그림이 없는 템(정령의 형상·물약): 일반 그림에 금색 테두리를 그려 넣는다
                f = OUT / "i" / (i["apiName"].lower() + ".webp")
                if f.exists():
                    from PIL import ImageDraw
                    im = Image.open(f).convert("RGBA").resize((SIZE, SIZE))
                    dr = ImageDraw.Draw(im)
                    for k, col in enumerate([(120, 78, 10), (255, 214, 102), (255, 236, 170), (230, 170, 50), (150, 100, 20)]):
                        dr.rounded_rectangle([k, k, SIZE - 1 - k, SIZE - 1 - k], radius=10 - k, outline=col + (255,), width=1)
                    im.save(f, "WEBP", quality=90)
                    done[i["name"]] = "frame"
                continue
            url = "https://raw.communitydragon.org/latest/game/" + ic.lower().replace(".tex", ".png").replace(".dds", ".png")
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
                    im = Image.open(io.BytesIO(r.read())).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
                im.save(OUT / "i" / (i["apiName"].lower() + ".webp"), "WEBP", quality=90)
                done[i["name"]] = ic
                time.sleep(0.05)
            except Exception as e:
                print("찬란한 그림 못 받음", i["name"], e)
        mark.write_text(json.dumps(done, ensure_ascii=False, indent=0))
        print("찬란한 원본 그림", len(done), "개")
    except Exception as e:
        print("찬란한 그림 건너뜀:", e)


def main():
    lk = json.loads((RAW / "lookup_ko.json").read_text(encoding="utf-8"))
    index = {"units": {}, "items": {}, "traits": {}, "augments": {}}

    for u in lk["units"]:
        if not setinfo.unit_ok(u):
            continue
        s19_p = OUT / "s19" / "u" / f"{u['apiName'].lower()}.webp"
        p = f"icons/s19/u/{s19_p.name}" if s19_p.exists() else save("champions", "u", u["apiName"].lower())
        if p:
            index["units"][u["name"]] = {"icon": p, "cost": u["cost"]}

    names = {i["apiName"]: i["name"] for i in lk["items"]}
    for i in lk["items"]:
        api = i["apiName"]
        comp = i.get("composition") or []
        is_component = api.startswith("DA_Component_") or api in ("DA_Spatula", "DA_FryingPan")
        if not (is_component or len(comp) == 2):
            continue
        p = save("items", "i", api.lower())
        if p:
            index["items"][i["name"]] = {"icon": p, "recipe": [names.get(c, c) for c in comp]}

    # 검색 탭(site/db.json)에 나오는 유물·찬란한 템도 아이콘이 있어야 한다
    db = OUT.parent / "db.json"
    if db.exists():
        used = set(json.loads(db.read_text(encoding="utf-8"))["items"])
        tier = OUT.parent / "items.json"  # 아이템 티어표(build_items.py)에 나오는 템도
        if tier.exists():
            used |= set(json.loads(tier.read_text(encoding="utf-8"))["tiers"]["all"]["items"])
        for i in lk["items"] + lk.get("armory_items", []):
            if i["name"] in used and i["name"] not in index["items"]:
                p = save("items", "i", i["apiName"].lower())
                if p:
                    index["items"][i["name"]] = {"icon": p, "recipe": [names.get(c, c) for c in i.get("composition") or []]}

    for t in lk["traits"]:
        s19_t = OUT / "s19" / "t" / f"{t['apiName'].lower()}.webp"
        p = f"icons/s19/t/{s19_t.name}" if s19_t.exists() else save("traits", "t", t["apiName"].lower())
        if p:
            index["traits"][t["name"]] = p

    tiers = json.loads((RAW / "aug_tiers.json").read_text(encoding="utf-8"))["content"]["content"]["tierList"]
    aug = {a["apiName"]: a for a in lk["augments"]}
    for tier in tiers:  # 티어표 순서대로, 그다음 티어표에 없는 증강까지 전부 (증강 탭 티어 목록용)
        for it in tier["content"]:
            a = aug.get(it["id"])
            if a and a.get("icon") and a["name"] not in index["augments"]:
                s19_a = OUT / "s19" / "a" / f"{a['icon'].lower()}.webp"
                p = f"icons/s19/a/{s19_a.name}" if s19_a.exists() else save("augments", "a", a["icon"].lower())
                if p:
                    index["augments"][a["name"]] = p
    for a in lk["augments"]:
        if a.get("icon") and a.get("desc") and a["name"] not in index["augments"]:
            s19_a = OUT / "s19" / "a" / f"{a['icon'].lower()}.webp"
            p = f"icons/s19/a/{s19_a.name}" if s19_a.exists() else save("augments", "a", a["icon"].lower())
            if p:
                index["augments"][a["name"]] = p

    radiant_icons(lk, index)

    # 18시즌 이하에서만 롤체지지 x_* 그림(나무정령 식물 등) 보존 (19시즌 이상에서는 18시즌 잔재 차단)
    if setinfo.NUM < 19:
        try:
            old = json.loads((OUT / "index.json").read_text(encoding="utf-8"))
            for kind in ("units", "augments"):
                for k, v in old.get(kind, {}).items():
                    path = v["icon"] if isinstance(v, dict) else v
                    if "/x_" in path and k not in index[kind]:
                        index[kind][k] = v
        except FileNotFoundError:
            pass
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print({k: len(v) for k, v in index.items()})


if __name__ == "__main__":
    sys.exit(main())
