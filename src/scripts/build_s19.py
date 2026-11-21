#!/usr/bin/env python3
"""19시즌(프리즘 투어) 미리보기 탭 -> site/s19.json + site/icons/s19/ (2026-11-18 사용자: "진심 모드 PBE 가자. 19시즌 탭을 새로 만들어, 공부하기 쉽게")

출처 (PBE, 출시 전이라 수치는 바뀔 수 있음):
- MetaTFT PBE 원문 TFTSet19_pbe_ko_kr.json (+ en_us): 유닛 능력치·스킬 수치(footer)·해금 조건·시너지 단계 효과·증강·아이템. 일부 글이 아직 영어
- 롤체지지 API data/{champions,traits,augments,items}?season=set19: 한국어 이름·스킬 설명(수치 ?), 증강 등급·새 증강 표시
- 아이콘: MetaTFT CDN (소문자 apiName)
- 지난 세트에 있던 시너지: site/oldsets.json 시너지 키(tft10_kda 등)
영어로만 있는 글은 data/s19_ko.json(영어 -> 한국어)로 바꾼다. 끝에 '번역 없는 글 N'이 0이 아니면 --missing으로 뽑아 해요체로 번역해 넣고 다시.
  python3 scripts/build_s19.py
  python3 scripts/build_s19.py --missing   # 번역 없는 영어 글 목록 (JSON)
"""
import json
from collections import Counter
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "s19.json"
ICONS = ROOT / "site" / "icons" / "s19"
KO = ROOT / "data" / "s19_ko.json"
MT = "https://data.metatft.com/lookups/TFTSet19_pbe_{}.json"
DAK = "https://tft.dakgg.io/api/v1/data/{}?hl=ko&season=set19"
CDN = "https://cdn.metatft.com/cdn-cgi/image/width={0},height={0},quality=88,format=webp/https://cdn.metatft.com/file/metatft/{1}/{2}.png"
UNIT_PX = 128  # 챔피언은 배치판에 크게 나와서 원본 크기(128)로 (2026-11-21 사용자: "화질이 약간 깨져 보여")
UA = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.metatft.com/"}
HANGUL = re.compile(r"[가-힣]")
SET_KO = {1: "1", 2: "2", 3: "갤럭시", 4: "운명", 5: "심판", 6: "기계공학", 7: "용의 땅", 8: "괴물 습격", 9: "룬테라", 10: "리믹스 럼블",
          11: "먹그림", 12: "마법 대소동", 13: "아케인", 14: "사이버 시티", 15: "K.O. 콜로세움", 16: "로어 & 레전드", 17: "스페이스 갓", 18: "신비의 숲"}
missing = []
SCALE_KO = {"health": "체력", "ad": "공격력", "ap": "주문력", "as": "공격 속도", "armor": "방어력", "mr": "마법 저항력", "crit": "치명타 확률",
            "omnivamp": "모든 피해 흡혈", "mana": "마나", "da": "피해 증폭", "dr": "피해 감소"}
BACK_EXTRA = {"heartsteel": [10], "disco": [10]}  # 세트 10 리믹스 럼블에 있었는데 oldsets 키가 없는 것
ICON_KO = {"icon.armor": "방어력", "icon.mr": "마법 저항력", "icon.ad": "공격력", "icon.ap": "주문력", "icon.as": "공격 속도", "icon.health": "체력",
           "icon.mana": "마나", "icon.critchance": "치명타 확률", "icon.critdamage": "치명타 피해", "icon.omnivamp": "모든 피해 흡혈",
           "icon.range": "사거리", "icon.shield": "보호막", "icon.gold": "골드", "icon.xp": "경험치", "icon.durability": "피해 감소"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return json.loads(r.read())


def norm(s):
    return re.sub(r"[^0-9a-z]", "", (s or "").lower())


def fmt(v, f=None):
    if v is None: return "?"
    if f == "p": v = v * 100
    elif f == "minus1": v = (v - 1) * 100
    elif f is None and 0 < abs(v) < 1 and v != round(v, 0):  # 형식 표시가 없는 0~1 소수는 비율 (0.22 -> 22%)
        f = "p"; v = v * 100
    r = int(round(v)) if abs(v - round(v)) < 1e-6 else round(v, 2)
    s = f"{r:,}" if isinstance(r, int) and abs(r) >= 10000 else str(r)
    return s + ("%" if f in ("p", "minus1") else "")


def curve_val(curve, row, idx):
    vals = (curve or {}).get(row)
    if not vals: return None
    best = vals[0][1]
    for k, v in vals:
        if k <= idx: best = v
    return best


def render(desc, curve=None, attrs=None, idx=1, nstar=3, collect=None):
    """MetaTFT 원문 틀을 글로: <TFTCurveTable row=X format=p/>, <TFTAttribute attributeID=Y/>(별마다 /), 아이콘·꾸밈 태그는 뺌"""
    if not desc: return ""
    s = desc.replace("\r\n", "\n")
    def ct(m):
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        col = int(a["column"]) if a.get("column", "").isdigit() else idx
        v = fmt(curve_val(curve, a.get("row"), col), a.get("format"))
        if collect is not None: collect.append(v)
        lab = "·".join(ICON_KO.get(x.strip().lower(), "") for x in a.get("icon", "").split(",") if ICON_KO.get(x.strip().lower()))
        return v + (" " + lab if lab else "")
    s = re.sub(r"<TFTCurveTable\s+([^>]*?)/>", ct, s)
    def attr(m):
        v = (attrs or {}).get(m.group(1))
        return "/".join(fmt(x) for x in v[:nstar]) if v else "?"
    s = re.sub(r'<TFTAttribute[^>]*attributeID="([^"]+)"[^>]*/>', attr, s)
    s = re.sub(r'<img id="[Ii]con\.Star"\s*/>', "★", s)
    s = re.sub(r'<img id="([^"]+)"\s*/>', lambda m: (" " + ICON_KO[m.group(1).lower()]) if m.group(1).lower() in ICON_KO else "", s)
    s = re.sub(r"%i:scale(\w+)%", lambda m: SCALE_KO.get(m.group(1).lower(), ""), s)  # 롤체지지 아이콘 표시
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"\{Set\d+\.[^}]*\}", "", s)  # 게임 안에서만 채우는 자리표시 (현재 점수·다음 기준 등)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def ko(text, ko_map, fallback=""):
    """한국어가 있으면 그대로, 영어뿐이면 번역 표, 없으면 fallback(롤체지지 한국어) 또는 영어 그대로(번역 대기)"""
    t = (text or "").strip()
    if not t or HANGUL.search(t): return t
    if t in ko_map: return ko_map[t]
    nk = {" ".join(k.split()): v for k, v in ko_map.items() if isinstance(v, str)}  # 띄어쓰기·줄바꿈 차이는 무시
    if " ".join(t.split()) in nk: return nk[" ".join(t.split())]
    if fallback: return fallback
    missing.append(t)
    return t


def icon(kind, folder, name):
    if not name: return ""
    name = name.lower()
    p = ICONS / folder / f"{re.sub(r'[^0-9a-z_]', '_', name)}.webp"
    px = UNIT_PX if kind == "champions" else 96
    small = False
    if p.exists() and kind == "champions":
        try:
            from PIL import Image
            small = Image.open(p).size[0] < px
        except Exception:
            pass
    if not p.exists() or small:
        try:
            with urllib.request.urlopen(urllib.request.Request(CDN.format(px, kind, name), headers=UA), timeout=30) as r:
                data = r.read()
        except Exception:
            return f"icons/s19/{folder}/{p.name}" if p.exists() else ""
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        time.sleep(0.03)
    return f"icons/s19/{folder}/{p.name}"


PBE_API = "https://api-hc.metatft.com/tft-comps-api/"
PBE_CACHE = ROOT / "raw" / "s19_comps"
PBE_MIN = 3000  # 이보다 적은 판의 덱 묶음은 뺀다 (PBE 판이 많아 라이브 덱 탭과 같은 기준)


def cell_rc(name):
    """MetaTFT 자리 통계 cell_1~7 뒷줄 … cell_22~28 앞줄 -> [줄 0=앞, 칸 0~6] (build_meta.cell_of와 같음)"""
    n = int(name.split("_")[1]) - 1
    return [3 - n // 7, n % 7]


def pbe_decks(mk, units, traits):
    """MetaTFT PBE 덱 묶음 -> s19 덱 목록. 덱마다 최종 보드·자리·별·캐리 템·평균/순방/승률/판수, 묶음 번호 id (앱 새로고침이 이걸로 숫자만 바꾼다)."""
    cs = get(PBE_API + "comps_stats?queue=PBE")
    cd = get(PBE_API + "comps_data?queue=PBE")
    if cd.get("tft_set") != "TFTSet19":
        raise RuntimeError(f"MetaTFT PBE가 19시즌이 아님 ({cd.get('tft_set')})")
    data = cd["results"]["data"]
    cid, details = data["cluster_id"], data["cluster_details"]
    res = cs["results"]
    total = res[0]["places"][0]
    shop = {u["k"] for u in units}
    def base(x): return re.sub(r"^(TFT\d+_|DA_(\d+_)?)|19$", "", x).lower()
    by_base = {base(u["k"]): u["k"] for u in units}
    alias = {}
    for u in mk["units"]:
        tgt = u["apiName"] if u["apiName"] in shop else by_base.get(base(u.get("characterName") or u["apiName"]))
        for a in (u.get("assetNames") or []) + [u["apiName"]]:
            if tgt: alias[a] = tgt
    def uk(a): return a if a in shop else alias.get(a) or by_base.get(base(a))
    iname = {i["apiName"]: i["name"] for i in mk["items"] + mk.get("armory_items", []) if HANGUL.search(i.get("name") or "")}
    uname = {u["k"]: u["n"] for u in units}
    tname = {t["k"]: t["n"] for t in traits}
    u_tr = {u["k"]: u["t"] for u in units}
    t_steps = {t["n"]: t.get("steps") or [] for t in traits}
    t_uniq = {t["n"]: t.get("uniq", False) for t in traits}
    PBE_CACHE.mkdir(parents=True, exist_ok=True)
    out = []
    for s in res:
        if not s["cluster"] or s["count"] < PBE_MIN or s["cluster"] not in details:
            continue
        cpath = PBE_CACHE / f"{s['cluster']}.json"
        if cpath.exists() and time.time() - cpath.stat().st_mtime < 6 * 3600:
            d = json.loads(cpath.read_text())
        else:
            try:
                d = get(PBE_API + f"comp_details?comp={s['cluster']}&cluster_id={cid}")["results"]
            except Exception as e:
                print("PBE 덱 상세 실패", s["cluster"], e, file=sys.stderr); continue
            cpath.write_text(json.dumps(d)); time.sleep(0.3)
        v = details[s["cluster"]]
        opts = d.get("options") or {}
        fl = sorted(d.get("final_levels") or [], key=lambda x: -x["count"])
        level = next((x["level"] for x in fl if x["level"] in opts and int(x["level"]) >= 7), None) or max(opts, key=int, default=None)
        if not level: continue
        best = max(opts[level], key=lambda o: o.get("score", 0))
        board = [a for a in best.get("units_list", "").split("&") if a]
        us = {x["unit"]: x for x in d.get("unit_stats") or []}
        def share3(a): return next((x["pcnt"] for x in us.get(a, {}).get("num_items", []) if x["num_items"] == 3), 0)
        carriers = sorted([a for a in board if share3(a) >= 0.4], key=share3, reverse=True)[:3]
        builds = {}
        for b in sorted(d.get("builds") or [], key=lambda b: -b["count"]):
            if b["unit"] in carriers and b.get("num_items") == 3 and b["unit"] not in builds:
                builds[b["unit"]] = [iname[i] for i in b["buildName"] if i in iname][:3]
        pos = (d.get("positioning") or {}).get("units") or {}
        def pl(a): return ((pos.get(a) or pos.get(next((x for x in pos if uk(x) == uk(a)), ""), {})) or {}).get("positions") or []
        taken, cells = set(), {}
        for a in sorted(board, key=lambda a: -(pl(a) or [{"count": 0}])[0]["count"]):
            for c in pl(a):
                rc = tuple(cell_rc(c["cell"]))
                if rc not in taken:
                    taken.add(rc); cells[a] = list(rc); break
            else:  # 자리 통계가 없으면 뒷줄부터 빈칸 (보드에서 빠지지 않게)
                rc = next(((r, c) for r in (3, 2, 1, 0) for c in range(7) if (r, c) not in taken), None)
                if rc: taken.add(rc); cells[a] = list(rc)
        champs = []
        for a in board:
            k = uk(a)
            if not k or any(c["k"] == k for c in champs): continue
            tiers = us.get(a, {}).get("tiers") or []
            star = max(tiers, key=lambda t: t["pcnt"])["tier"] if tiers else 2
            r = carriers.index(a) + 1 if a in carriers else 99
            e = {"k": k, "r": r, "s": min(int(star), 3), "i": builds.get(a, [])}
            if a in cells: e["pos"] = cells[a]
            champs.append(e)
        if len(champs) < 5: continue
        champs.sort(key=lambda c: (c["r"], -len(c["i"])))
        parts = [x["name"] for x in (v.get("name") or [])]
        nm_parts = [tname.get(x) or uname.get(uk(x) or "", "") for x in parts]
        name = " ".join(x for x in nm_parts if x).strip()
        mc = next((uk(x) for x in parts if uk(x) and any(c["k"] == uk(x) for c in champs)), None) or champs[0]["k"]
        tc = Counter()
        for c in champs:
            for tn in u_tr.get(c["k"], []): tc[tn] += 1
        trs = []
        for tn, cnt in tc.items():
            st_lv = 4 if t_uniq.get(tn) else 0
            for stp in t_steps.get(tn, []):
                if stp.get("m") and cnt >= stp["m"]: st_lv = stp.get("s") or 1
            if st_lv > 0: trs.append([tn, cnt, st_lv])
        trs.sort(key=lambda x: (-x[2], -x[1]))
        p, n = s["places"][:8], s["count"]
        out.append({"id": s["cluster"], "n": name or uname.get(mc, ""), "mc": mc, "avg": round(sum((i + 1) * x for i, x in enumerate(p)) / n, 2),
                    "win": round(p[0] / n * 100, 1), "top4": round(sum(p[:4]) / n * 100, 1), "pick": round(n / total * 8, 2), "plays": n,
                    "level": int(level), "u": champs, "t": trs[:6], "pos": bool(cells)})
    # 이름이 같은 덱은 다른 챔피언 하나를 붙여 가른다
    cnt = Counter(x["n"] for x in out)
    for x in out:
        if cnt[x["n"]] > 1:
            extra = next((uname[c["k"]] for c in x["u"] if c["k"] != x["mc"] and uname.get(c["k"], "") not in x["n"]), "")
            if extra: x["n"] += " " + extra.split(" ")[0]
    out.sort(key=lambda x: x["avg"])
    for i, x in enumerate(out):
        q = i / max(len(out), 1)
        x["tier"] = "S" if q < 0.12 else "A" if q < 0.35 else "B" if q < 0.7 else "C"
    upd = datetime.fromtimestamp((cs.get("updated") or 0) / 1000, timezone.utc).isoformat(timespec="minutes") if cs.get("updated") else ""
    if len(out) < 10:
        raise RuntimeError(f"PBE 덱 {len(out)}개뿐")
    return out, total // 8, upd, str(cid)


def main():
    ko_map = json.loads(KO.read_text()) if KO.exists() else {}
    mk, me = get(MT.format("ko_kr")), get(MT.format("en_us"))
    dk = {k: get(DAK.format(k))[k] for k in ("champions", "traits", "augments", "items")}
    en_unit = {u["apiName"]: u for u in me["units"]}
    en_trait = {t["apiName"]: t for t in me["traits"]}
    dk_trait = {norm(t["key"]): t for t in dk["traits"]}
    dk_champ = {norm(c["key"]): c for c in dk["champions"]}

    # 지난 세트에도 있던 시너지 (oldsets 키 tft10_kda -> kda)
    old = {}
    try:
        for k in json.loads((ROOT / "site" / "oldsets.json").read_text())["t"]:
            m = re.match(r"tft(\d+)_(.+)$", k)
            if m: old.setdefault(norm(m.group(2)), set()).add(int(m.group(1)))
    except Exception:
        pass

    # 시너지
    traits, tname = [], {}
    for t in mk["traits"]:
        e = en_trait.get(t["apiName"], {})
        d = dk_trait.get(norm(e.get("name"))) or dk_trait.get(norm(re.sub(r"^DA_|19.*$", "", t["apiName"])))
        name = d["name"] if d and HANGUL.search(d["name"]) else ko(t["name"], ko_map, "")
        tname[t["apiName"]] = name
        units = sorted(t.get("units") or [], key=lambda x: x.get("unit_cost") or 0)
        steps = []
        for i, ef in enumerate(t.get("effects") or []):
            txt = render(ef.get("desc"), t.get("curveValues"), None, i + 1)
            if not HANGUL.search(txt): txt = ko(txt, ko_map, "")
            steps.append({"m": ef.get("minUnits"), "s": ef.get("style"), "d": txt})
        desc = render(t.get("desc"), t.get("curveValues"))
        if not desc and d: desc = render(d.get("desc"))  # MetaTFT에 설명이 비면 롤체지지 한국어 설명 (EDM·HEARTSTEEL)
        if t["apiName"] in ko_map.get("_trait_desc", {}): desc = ko_map["_trait_desc"][t["apiName"]]  # 원문이 ?·틀만 있는 시너지는 손으로 쓴 설명
        if not HANGUL.search(desc):
            desc = ko(desc, ko_map, render(d.get("desc")) if d else "")
        uniq = "UniqueTrait" in t["apiName"] or "IndieTrait" in t["apiName"] or "RisingStar" in t["apiName"] or "Superstar" in t["apiName"]
        back = sorted(old.get(norm(e.get("name")), set()) | old.get(norm(d["key"]) if d else "", set()) | set(BACK_EXTRA.get(norm(e.get("name")), [])))
        traits.append({"k": t["apiName"], "n": name, "en": e.get("name", ""), "type": (d or {}).get("type") or ("UNIQUE" if uniq else ""),
                       "uniq": uniq, "d": desc, "steps": steps, "u": [x["unit"] for x in units], "back": [b for b in back if b < 19],
                       "img": icon("traits", "t", t["apiName"])})

    # 유닛
    # 팀 플래너 칸 번호 (덱 '팀 코드 복사'). PBE 원문은 새 유닛 여럿이 같은 번호(예: 449)를 임시로 나눠 쓰니, 다른 유닛과 겹치는 번호는 버린다
    code_names = {}
    for u in mk["units"]:
        if u.get("code"): code_names.setdefault(u["code"], set()).add(re.sub(r"^(TFT\d+_|DA_)|19$", "", u.get("characterName") or u["apiName"]).lower())
    def tp_code(u):
        c = u.get("code") or ""
        return c if re.fullmatch(r"[0-9a-f]{3}", c) and len(code_names.get(c, ())) == 1 else ""
    units = []
    for u in mk["units"]:
        if not u.get("traits") or (u.get("cost") or 0) < 1: continue
        if u.get("shopUnit") is False: continue  # 변신·소환 모습(엘리스 거미, 세라핀 떠오르는 별 등)은 상점 유닛 쪽에 붙어 있음
        e = en_unit.get(u["apiName"], {})
        d = dk_champ.get(norm(e.get("name") or u.get("en_name"))) or {}
        name = u["name"] if HANGUL.search(u["name"]) else (d.get("name") if HANGUL.search(d.get("name") or "") else ko(u["name"], ko_map, ""))
        ab = u.get("ability") or {}
        sk_name = ab.get("name") if HANGUL.search(ab.get("name") or "") else ((d.get("skill") or {}).get("name") if HANGUL.search((d.get("skill") or {}).get("name") or "") else ko(ab.get("name"), ko_map, ""))
        sk_desc = render(ab.get("desc"), u.get("curveValues"), ab.get("attributeValues"))
        if not HANGUL.search(sk_desc) or "?" in sk_desc:
            dd = render((d.get("skill") or {}).get("desc"))
            sk_desc = dd if HANGUL.search(dd) else ko(sk_desc, ko_map, "")
        lines = []
        for f in ab.get("footer") or []:
            if not f.get("show", True): continue
            lab = re.sub(r":?\s*<TFTAttribute[^>]*/>.*$", "", f.get("desc") or "").strip().rstrip(":")
            lab = re.sub(r"<[^>]+>", "", lab).strip()
            if not HANGUL.search(lab): lab = ko(lab, ko_map, "")
            vals = [v for s, v in (f.get("values") or []) if s <= 3]
            if lab and vals: lines.append([lab, "/".join(fmt(v) for v in vals)])
        st = u.get("stats") or {}
        dmg = st.get("damageByStar") or []
        unl = None
        if u.get("unlock"):
            conds = []
            for c in u["unlock"].get("conditions") or []:
                txt = render(c.get("description"), c.get("curveValues"))
                if not HANGUL.search(txt): txt = ko(txt, ko_map, "")
                conds.append(txt)
            unl = {"lv": u["unlock"].get("levelRequired"), "c": conds}
        units.append({"k": u["apiName"], "n": name, "c": u["cost"], "t": [tname.get(x, x) for x in u.get("traitApiNames") or []],
                      "tk": u.get("traitApiNames") or [], "role": u.get("role", "").replace("DA_Role_", ""),
                      "st": {"hp": st.get("hp"), "ad": dmg[:3] or st.get("damage"), "as": st.get("attackSpeed"), "ar": st.get("armor"),
                             "mr": st.get("magicResist"), "rng": st.get("range"), "m0": st.get("initialMana"), "m": st.get("mana")},
                      "sk": {"n": sk_name, "d": sk_desc, "l": lines, "img": icon("abilities", "s", ab.get("icon") or "")},
                      "unl": unl, "pool": u.get("poolCount"), "tp": tp_code(u), "img": icon("champions", "u", u["apiName"])})
    units.sort(key=lambda x: (x["c"], x["n"]))
    from collections import Counter
    dup = Counter(u["n"] for u in units)
    for u in units:  # 같은 이름 다른 챔피언 (아칼리 K/DA · True Damage): 첫 시너지를 붙여 구분
        if dup[u["n"]] > 1 and u["t"]: u["n"] = f"{u['n']} ({u['t'][0]})"
    # 시너지 멤버 이름 (유닛 키 -> 한국어)
    uname = {u["k"]: u["n"] for u in units}
    for t in traits:
        t["u"] = [k for k in t["u"] if k in uname]
    traits = [t for t in traits if t["u"] or t["steps"]]
    traits.sort(key=lambda t: (t["uniq"], t["type"] != "ORIGIN", t["n"]))

    # 증강: 롤체지지 세트 19 증강 목록이 기준 (등급·새 증강), 수치는 MetaTFT
    mt_aug, mt_key = {}, {}
    en_aug = {a["apiName"]: a for a in me["augments"]}
    for a in mk["augments"]:
        mt_aug.setdefault(a["name"], a)
        for k in (a["apiName"], re.sub(r"^DA_|^TFT\d*_Augment_|^TFT\d+_", "", a["apiName"]), en_aug.get(a["apiName"], {}).get("name", "")):
            mt_key.setdefault(norm(k), a)
    augs = []
    for a in dk["augments"]:
        m = mt_aug.get(a["name"]) or mt_key.get(norm(a["key"]))
        vals = []
        d = render(m.get("desc"), m.get("curveValues"), collect=vals) if m else ""
        if not HANGUL.search(d) or "?" in d:
            dd = render(a.get("desc"))
            # 롤체지지 한국어 설명의 ? 자리를 MetaTFT 원문 수치로 순서대로 채운다 (개수가 같을 때만)
            if dd.count("?") and dd.count("?") == len(vals):
                it = iter(vals); dd = re.sub(r"\?", lambda _: next(it), dd)
            d = dd if HANGUL.search(dd) else ko(d, ko_map, "")
        augs.append({"n": a["name"], "d": d, "tier": a.get("tier"), "new": bool(a.get("isNew")),
                     "img": icon("augments", "a", (m or {}).get("icon") or "")})
    augs.sort(key=lambda a: (-(a["tier"] or 0), not a["new"], a["n"]))

    # 아이템: 상징·세트 19 전용
    by_api = {i["apiName"]: i for i in mk["items"]}
    items = []
    for i in mk["items"]:
        tags = i.get("tags") or []
        if "19" not in i["apiName"]: continue
        emb = "Emblem" in tags
        name = i["name"]
        if not HANGUL.search(name):
            at = (i.get("associatedTraits") or [None])[0]
            name = (tname.get(at, "") + " 상징") if emb and at in tname else ko(name, ko_map, "")
        d = render(i.get("desc"), i.get("curveValues"))
        if not HANGUL.search(d): d = ko(d, ko_map, "")
        comp = [by_api.get(c, {}).get("name", c) for c in i.get("composition") or []]
        kind = "emb" if emb else "quest" if any("PrismaticQuest" in t for t in tags) else "set"
        items.append({"n": name, "d": d, "kind": kind, "craft": "Item.Equippable.Item.Craftable" in tags, "comp": comp,
                      "img": icon("items", "i", i["apiName"])})
    items.sort(key=lambda i: (["emb", "quest", "set"].index(i["kind"]), not i["craft"], i["n"]))

    # 19시즌 PBE 추천 덱:
    # 1) MetaTFT PBE 덱 통계 (comps_stats/comps_data?queue=PBE + comp_details, 2026-11-21부터. lolchess.gg는 이 서버를 403으로 막아 멈춰 있었음) -> pbe_decks
    # 2) 롤체지지 19시즌 추천 가이드 덱 (tft.dakgg.io/api/v1/guide-decks?hl=ko&q=new-set) -> guides (4x7 육각 배치 + 추천 증강 3개)
    # 둘을 유닛 겹침으로 교차 매칭해 가이드엔 PBE 통계를, PBE 통계엔 배치·증강을 붙인다.
    decks, guides, decks_plays, decks_upd, decks_cid = [], [], 0, "", ""
    u_by_k = {u["k"]: u["k"] for u in units}
    u_by_n = {u["n"]: u["k"] for u in units}
    u_by_base = {re.sub(r" \([^)]+\)$", "", u["n"]): u["k"] for u in units}
    u_by_cost = {u["k"]: u["c"] for u in units}
    u_traits = {u["k"]: u["t"] for u in units}
    try:
        decks, decks_plays, decks_upd, decks_cid = pbe_decks(mk, units, traits)
    except Exception as ex:
        if OUT.exists():
            try:
                prev = json.loads(OUT.read_text(encoding="utf-8"))
                decks, decks_plays, decks_upd = prev.get("decks", []), prev.get("decksPlays", 0), prev.get("decksUpdated", "")
                decks_cid = prev.get("decksCid", "")
            except Exception:
                pass
        print(f"19시즌 PBE 덱 생략 ({ex})", file=sys.stderr)

    # 2) 롤체지지 19시즌 추천 가이드 덱 (육각 보드 배치 + 추천 증강)
    try:
        gd_raw = get("https://tft.dakgg.io/api/v1/guide-decks?hl=ko&q=new-set")
        dk_it = {i["key"]: i["name"] for i in get(DAK.format("items")).get("items", [])}
        dk_au = {a["key"]: a["name"] for a in dk.get("augments", [])}
        dk_ch = {}
        for c in dk.get("champions", []):
            uk = c.get("ingameKey", "")
            if uk not in u_by_k:
                nm = c.get("name", "")
                uk = u_by_n.get(nm) or u_by_base.get(nm) or ""
            if uk: dk_ch[c["key"]] = uk
        t_steps = {t["n"]: t.get("steps") or [] for t in traits}
        t_uniq = {t["n"]: t.get("uniq", False) for t in traits}
        for g in gd_raw.get("guideDecks") or []:
            slots = (g.get("data") or {}).get("slots") or []
            if not slots: continue
            champs = []
            for s in slots:
                uk = dk_ch.get(s.get("champion", ""))
                if not uk: continue
                idx_pos = int(s.get("index", 0))
                its = [dk_it.get(ik, ik) for ik in (s.get("items") or []) if dk_it.get(ik)]
                champs.append({"k": uk, "s": int(s.get("star") or 2), "i": its[:3], "pos": [idx_pos // 7, idx_pos % 7]})
            if not champs: continue
            champs.sort(key=lambda c: (-(len(c["i"])), -(c["s"]), -(u_by_cost.get(c["k"], 1))))
            gn = (g.get("name") or "").strip()
            mc = next((c["k"] for c in champs if uname.get(c["k"], "").split(" ")[0] in gn and c["i"]), champs[0]["k"])
            # 활성 시너지 계산
            tc = Counter()
            for c in champs:
                for tn in u_traits.get(c["k"], []): tc[tn] += 1
            trs = []
            for tn, cnt in tc.items():
                st_lv = 4 if t_uniq.get(tn) else 0
                for stp in t_steps.get(tn, []):
                    if stp.get("m") and cnt >= stp["m"]: st_lv = stp.get("s") or 1
                if st_lv > 0: trs.append([tn, cnt, st_lv])
            trs.sort(key=lambda x: (-x[2], -x[1]))
            augs_g = [dk_au[a] for a in (g.get("data") or {}).get("augments") or [] if a in dk_au]
            # PBE 통계 덱과 자동 교차 매칭 (유닛 겹침 >= 4명 이상)
            gset = {c["k"] for c in champs}
            best_d, best_sc = None, 0.0
            for d0 in decks:
                dset = {c["k"] for c in d0["u"]}
                ov = len(gset & dset)
                sc = ov / max(len(gset | dset), 1) + (0.15 if d0["mc"] == mc else 0)
                if ov >= 4 and sc > best_sc:
                    best_sc, best_d = sc, d0
            entry = {"n": gn, "mc": mc, "u": champs, "t": trs[:6], "a": augs_g, "guide": True}
            if best_d:
                entry.update({"sid": best_d.get("id"), "tier": best_d["tier"], "avg": best_d["avg"], "win": best_d["win"],
                              "top4": best_d["top4"], "pick": best_d["pick"], "plays": best_d["plays"]})
                # 반대로 PBE 통계 덱에도 배치도가 없으면 가이드 배치·증강을 연결
                if not best_d.get("pos"):
                    pos_map = {c["k"]: c["pos"] for c in champs}
                    for cu in best_d["u"]:
                        if cu["k"] in pos_map: cu["pos"] = pos_map[cu["k"]]
                    best_d["pos"] = True
                    if augs_g and not best_d.get("a"): best_d["a"] = augs_g
            guides.append(entry)
    except Exception as ex:
        if OUT.exists():
            try: guides = json.loads(OUT.read_text(encoding="utf-8")).get("guides", [])
            except Exception: pass
        print(f"19시즌 가이드 덱 생략 ({ex})", file=sys.stderr)

    meta = mk.get("_metadata") or {}
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "pbe": meta.get("generated", ""), "release": "2026-12-01",
           "name": "프리즘 투어", "units": units, "traits": traits, "augs": augs, "items": items,
           "guides": guides, "decks": decks, "decksPlays": decks_plays, "decksUpdated": decks_upd, "decksCid": decks_cid,
           "src": "MetaTFT PBE 원문·덱 통계 · 롤체지지 · 라이엇 패치 노트"}
    if "--missing" in sys.argv:
        print(json.dumps(sorted(set(missing)), ensure_ascii=False, indent=0)); return
    if len(units) < 60 or len(traits) < 20:
        sys.exit(f"19시즌 데이터 이상: 유닛 {len(units)} · 시너지 {len(traits)}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: 유닛 {len(units)} · 시너지 {len(traits)} · 증강 {len(augs)} · 아이템 {len(items)} · 가이드 {len(guides)} · PBE덱 {len(decks)} · 번역 없는 글 {len(set(missing))} · {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
