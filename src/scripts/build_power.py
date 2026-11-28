"""덱파워 모델: 판 끝 보드 -> 예상 등수 (가중 Plackett-Luce 순위 모델).
data/power/boards.jsonl.gz (crawl_boards.py) -> site/power.json (+ --pbe -> site/power_s19.json)

특징 (라이엇 원래 이름으로, 페이지 boardPower()가 판 기록에서 똑같이 계산한다 — 바꾸면 페이지도 같이):
  [유닛]   u:<유닛>:<별> 개수 · c:<코스트>:<별> 개수 (0코 소환물 제외, 4·5·7코 4성은 :3으로 묶어 log2(1+n)) · val 필드 가치/10
  [레벨]   lv:<레벨> · sl:<실제 유닛 수 - 레벨> (0코 소환물 제외, -2~+2) · ls:<레벨>:<sl>
  [템]     i:<템> 개수 · ic:<종류> 개수 (radiant/artifact/emblem/component/tactician/normal) · dup · ni
  [캐리]   ui:<유닛>:<템> · k:<유닛>:<별> · kc:<코스트>:<별> (0코 제외, 4·5·7코 3성+는 log2(1+n))
  [사전 지식] 세트별 격리(data/power/priors_s{N}.json): sk3 3성 스킬 배율 · usum/umax 유닛·별 평균 등수 · isum 아이템 평균 등수
  [시너지] t:<시너지>:<단계> · tn:<시너지>:<인원> · nt · tsum/tmax (MetaTFT 단계별 평균 등수 ta)
패치 최신화:
  - 라이브: 최근 패치부터 4,000판 모일 때까지 풀링하되, 패치 세대 감쇠(0.40^age) + 지수 시간 감쇠(반감기 10일)로 새 패치·B패치를 즉시 반영
  - PBE: 일일 밸런스 패치를 반영하도록 최근 12일·반감기 3일 가중 학습
페이지 표시: 필드 가치(골드), 덱파워(평균 100, 표준편차 40 — 높을수록 셈), 실제 1등·순방 확률, 상위 %, 예상 등수, 항목별 +/-.

python3 scripts/build_power.py            # 본섭 학습 + 검증 점수 + site/power.json
python3 scripts/build_power.py --pbe      # PBE 학습 + 검증 점수 + site/power_s19.json
"""
import gzip
import json
import math
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import setinfo as _si  # noqa: E402

PBE = "--pbe" in sys.argv[1:]
if PBE:
    SRC = ROOT / "data" / "power" / f"boards_s{_si.NUM}.jsonl.gz"
    OUT = ROOT / "site" / f"power_s{_si.NUM}.json"
    TOP = ROOT / "site" / f"power_top_s{_si.NUM}.json"
else:
    SRC = ROOT / "data" / "power" / "boards.jsonl.gz"
    OUT = ROOT / "site" / "power.json"
    TOP = ROOT / "site" / "power_top.json"

SCALE = 40  # 덱파워 = 100 + 40 x (표준 점수). 페이지는 power.json scale을 읽는다
K = SCALE / 24  # 24 기준으로 정한 점수 간격(상한·보정·차트)을 같은 비율로
RECENT_DAYS = 21      # 라이브 최근 3주
PBE_RECENT_DAYS = 12  # PBE는 매일 패치되므로 최근 12일 중심
HALF_LIFE_LIVE = 10.0  # 라이브 시간 가중 반감기(일)
HALF_LIFE_PBE = 3.0    # PBE 시간 가중 반감기(일) — 최근 1~3일 빌드 가중
PATCH_DECAY = 0.40     # 라이브 이전 패치 1단계당 가중치 (새 패치/B패치 첫날부터 새 패치 주도)
WANT = 4000           # 최신 패치부터 이만큼 모일 때까지 앞 패치 추가
MIN_GAMES = 300       # 이보다 적으면 덱파워 끔 (새 세트 초반)
MIN_N = 25            # 이보다 적게 나온 특징은 버린다 (아이템·유닛별 특징)


def nk(s):
    """롤체지지(DA_18_Ornn, DA_InfinityEdge)와 라이엇(TFT18_Ornn, TFT_Item_InfinityEdge) 이름을 같게"""
    return re.sub(r"^(DA|TFT\d*)_(\d+_)?(Item_)?", "", s or "")


def cost_of(rarity):
    return {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 5, 6: 5, 7: 7}.get(rarity, min(7, rarity + 1))


def value(units, cost):
    return sum(cost.get(u[0], 1) * 3 ** (u[1] - 1) for u in units if u[1] >= 1 and cost.get(u[0], 1) > 0)


# 세트별 사전 지식 (main에서 대상 세트 setn에 맞춰 로드 — 다른 세트 원문으로 오염되는 것을 원천 차단)
TA, SK, UP, IP, SHOP_COST, CHROMA = {}, {}, {}, {}, {}, {}


def _extract_live_priors():
    """현재 raw/·site/ (setinfo.NUM 세트)에서 ta/sk/up/ip/shop_cost/chroma 추출."""
    ta, sk, up, ip, sc, chroma = {}, {}, {}, {}, {}, {}
    try:
        r = json.loads((ROOT / "raw" / "traits.json").read_text())["results"]
        for x in r:
            api, _, idx = x["trait"].rpartition("_")
            pl = x["places"][:8]
            if idx.isdigit() and sum(pl) >= 500:
                ta[f"{nk(api)}:{idx}"] = round(sum((i + 1) * n for i, n in enumerate(pl)) / sum(pl), 3)
    except Exception as e:
        print("시너지 사전 지식 못 읽음:", e)
    try:
        lk = json.loads((ROOT / "raw" / "lookup_ko.json").read_text())
        name2keys = defaultdict(set)
        for u in lk["units"]:
            if not u.get("cost") or u["cost"] > 7:
                continue
            keys = {nk(a) for a in u.get("assetNames", [])} | {nk(u["apiName"])}
            name2keys[u["name"]] |= keys
            av = (u.get("ability") or {}).get("attributeValues") or {}
            r = max([v[3] / v[2] for v in av.values() if isinstance(v, list) and len(v) >= 4 and v[2] and v[3] and v[2] > 0] or [1])
            for k in keys:
                sk[k] = round(math.log2(max(1.0, r)), 3)
                sc[k] = int(u["cost"])
        # 프리즘 시너지: [최소 tier_current(1-indexed), 최소 인원]
        # 세트 19 퀘스트 프리즘(IonicSpark/KDA/HEARTSTEEL/펜타킬/True Damage)은 인원만 채워도 비프리즘이므로 tier_current를 함께 검사
        for t in lk.get("traits") or []:
            effs = t.get("effects") or []
            for step_i, ef in enumerate(effs, 1):
                mu_v = ef.get("minUnits") or 0
                mx_v = ef.get("maxUnits")
                if ef.get("style") == 5 and mu_v > 0 and (mx_v is None or mx_v >= mu_v):
                    tk = nk(t.get("apiName", ""))
                    if tk and tk not in chroma:
                        chroma[tk] = [step_i, int(mu_v)]
        db = json.loads((ROOT / "site" / "db.json").read_text())
        for nm, u in db["units"].items():
            st = u.get("stars") or {}
            row = [st.get(str(i), {}).get("avg") if (st.get(str(i), {}).get("n") or 0) >= 200 else None for i in (1, 2, 3)]
            for k in name2keys.get(nm, ()):
                up[k] = row
        for r in json.loads((ROOT / "raw" / "items.json").read_text())["results"]:
            pl = r["places"][:8]
            if sum(pl) >= 500:
                ip[nk(r["itemName"])] = round(sum((i + 1) * n for i, n in enumerate(pl)) / sum(pl), 3)
    except Exception as e:
        print("사전 지식 일부 못 읽음:", e)
    return {"ta": ta, "sk": sk, "up": up, "ip": ip, "cost": sc, "chroma": chroma}


def load_priors(setn):
    """대상 세트(setn)와 일치하는 사전 지식만 로드 (세트 19 PBE 기간에 세트 18 모델이 오염되는 버그 방지)."""
    TA.clear(); SK.clear(); UP.clear(); IP.clear(); SHOP_COST.clear(); CHROMA.clear()
    pf = ROOT / "data" / "power" / f"priors_s{setn}.json"
    saved = {}
    if pf.exists():
        try:
            saved = json.loads(pf.read_text(encoding="utf-8"))
        except Exception:
            saved = {}
    if str(setn) == str(_si.NUM):
        fresh = _extract_live_priors()
        merged = {
            "set": str(setn),
            "ta": fresh["ta"] or saved.get("ta") or {},
            "sk": fresh["sk"] or saved.get("sk") or {},
            "up": fresh["up"] or saved.get("up") or {},
            "ip": fresh["ip"] or saved.get("ip") or {},
            "cost": fresh["cost"] or saved.get("cost") or {},
            "chroma": fresh["chroma"] or saved.get("chroma") or {},
        }
        pf.parent.mkdir(parents=True, exist_ok=True)
        pf.write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        src = merged
    else:
        src = saved
        if not src and OUT.exists():
            try:
                old = json.loads(OUT.read_text(encoding="utf-8"))
                if str(old.get("set")) == str(setn):
                    src = old
            except Exception:
                pass
    TA.update(src.get("ta") or {})
    SK.update(src.get("sk") or {})
    UP.update(src.get("up") or {})
    IP.update(src.get("ip") or {})
    SHOP_COST.update({k: int(v) for k, v in (src.get("cost") or {}).items()})
    for k, v in (src.get("chroma") or {}).items():
        CHROMA[k] = v if isinstance(v, list) else [0, int(v)]
    print(f"사전 지식(S{setn}): ta={len(TA)} sk={len(SK)} up={len(UP)} ip={len(IP)} chroma={CHROMA}")


COMPONENTS = {"BFSword", "RecurveBow", "NeedlesslyLargeRod", "TearOfTheGoddess", "ChainVest", "NegatronCloak", "GiantsBelt", "SparringGloves", "Spatula", "FryingPan"}
LOGK_KEYS = ("c:4:3", "c:5:3", "c:7:3", "kc:4:3", "kc:5:3", "kc:7:3")


def item_kind(k):
    if "Radiant" in k:
        return "radiant"
    if "Artifact" in k:
        return "artifact"
    if "Emblem" in k:
        return "emblem"
    if k.startswith("Component_") or k in COMPONENTS:
        return "component"
    if k.startswith("Tactician"):
        return "tactician"
    return "normal"


def feats(b, cost):
    """b = [등수, 레벨, 티어, units, traits] -> Counter (360_power.js boardPower와 1:1 동일)"""
    lvl, units, traits = b[1], b[3], b[4]
    f = Counter()
    nitem = 0
    real_u = 0
    umax = 0.0
    for cid, star, _r, items in units:
        u, c = nk(cid), cost.get(cid, 1)
        f[f"u:{u}:{star}"] += 1
        if star >= 3 and SK.get(u):
            f["sk3"] += SK[u]  # 3성 스킬 배율
        pa = (UP.get(u) or [None, None, None])[min(star, 3) - 1]
        if pa:
            f["usum"] += 4.5 - pa  # 유닛·별 평균 등수로 본 힘
            umax = max(umax, 4.5 - pa)
        st_c = min(star, 3) if c >= 4 else min(star, 4)
        if c > 0:
            f[f"c:{c}:{st_c}"] += 1
            real_u += 1
        its = [nk(i) for i in items]
        for it in its:
            f[f"i:{it}"] += 1
            if IP.get(it):
                f["isum"] += 4.5 - IP[it]
            f[f"ic:{item_kind(it)}"] += 1
        for it in set(its):
            f[f"ui:{u}:{it}"] += 1
        f["dup"] += len(its) - len(set(its))
        nitem += len(its)
        if len(its) >= 3:
            f[f"k:{u}:{star}"] += 1
            if c > 0:
                f[f"kc:{c}:{st_c}"] += 1
    # 4·5·7코 3성+는 개수가 늘수록 덜 오르게 (1개 1 · 2개 1.58 · 3개 2)
    for k in LOGK_KEYS:
        if f.get(k):
            f[k] = math.log2(1 + f[k])
    f["umax"] = umax
    f[f"ni:{min(nitem, 12)}"] = 1
    nt, tsum, tmax = 0, 0.0, 0.0
    for name, tier, n in traits:
        if tier and tier > 0:
            t = nk(name)
            f[f"t:{t}:{tier}"] = 1
            if n:
                f[f"tn:{t}:{n}"] = 1
            if "Unique" not in name:
                nt += 1
            a = TA.get(f"{t}:{tier}")
            if a:
                tsum += 4.5 - a
                tmax = max(tmax, 4.5 - a)
    f[f"nt:{min(nt, 9)}"] = 1
    f["tsum"] = tsum
    f["tmax"] = tmax
    lv = min(10, max(4, lvl))
    f[f"lv:{lv}"] = 1
    d = max(-2, min(2, real_u - lv))
    f[f"sl:{d}"] = 1
    f[f"ls:{lv}:{d}"] = 1
    f["val"] = value(units, cost) / 10
    return f


STRUCT = ("c:", "lv:", "val", "ic:", "kc:", "sl:", "nt:", "dup", "tsum", "tmax", "ni:", "sk3", "usum", "umax", "isum")

UQ = set()
ADJ = {}


def is_chroma_trait(t):
    """t = [name, tier_current, num_units] 가 실제 프리즘 시너지인지 판별."""
    if not t[1] or t[1] <= 0:
        return False
    m = CHROMA.get(nk(t[0]))
    if not m:
        return False
    mt, mn = (m[0], m[1]) if isinstance(m, list) else (0, m)
    return (not mt or t[1] >= mt) and (not mn or (t[2] and t[2] >= mn))


def dominance(b, cost):
    """압도적인 덱 표시: a4:1 = 4코 3성, a4:2 = 4코 3성 2개+, a4w = 4코 3성 1개 + 나머지 약함, ap = 프리즘 시너지"""
    f = {}
    n4 = sum(1 for u in b[3] if cost.get(u[0], 1) == 4 and u[1] >= 3)
    rest = value(b[3], cost) - 36 * n4
    if n4 == 1 and rest < 45:
        f["a4w"] = 1
    elif n4:
        f["a4:1"] = 1
        if n4 >= 2:
            f["a4:2"] = 1
    if any(is_chroma_trait(t) for t in b[4]):
        f["ap"] = 1
    return f


def make_cal(raw, y):
    """예상 등수 보정표: 점수 구간(분위)마다 실제 평균 등수. 상위 2%는 잘게"""
    pcts = [0, 0.1, 0.2, 0.5, 1.0, 1.5] + list(np.linspace(2, 100, 50))
    edges = np.percentile(raw, pcts)
    cal = []
    for k in range(len(edges) - 1):
        sel = (raw >= edges[k]) & (raw <= edges[k + 1])
        if sel.sum():
            cal.append([float(np.median(raw[sel])), float(y[sel].mean())])
    for k in range(1, len(cal)):
        cal[k][1] = max(cal[k][1], cal[k - 1][1])
    return [[round(a, 4), round(b, 3)] for a, b in cal]


def make_calp(raw, y):
    """점수 구간마다 실제 1등 비율·순방 비율 [[구간 가운데 점수, 1등, 순방], ...]. 셀수록(점수 작을수록) 같거나 높게"""
    pcts = [0, 0.1, 0.2, 0.5, 1.0, 1.5] + list(np.linspace(2, 100, 50))
    edges = np.percentile(raw, pcts)
    out = []
    for k in range(len(edges) - 1):
        sel = (raw >= edges[k]) & (raw <= edges[k + 1])
        if sel.sum():
            out.append([float(np.median(raw[sel])), float(np.mean(y[sel] == 1)), float(np.mean(y[sel] <= 4))])
    for k in range(len(out) - 2, -1, -1):
        out[k][1] = max(out[k][1], out[k + 1][1]); out[k][2] = max(out[k][2], out[k + 1][2])
    return [[round(a, 4), round(b, 4), round(c, 4)] for a, b, c in out]


def fit_adj(raw, y, D):
    """압도적인 덱 유형마다 '덱파워 구간 -> 더할 점수' 표를 만든다. a4:1/a4:2/ap는 음수 페널티 금지(>=0)."""
    ADJ.clear()
    mu0, sd0 = float(raw.mean()), float(raw.std())
    ADJ["_mu"], ADJ["_sd"] = round(mu0, 4), round(sd0, 4)
    pw = 100 + SCALE * (mu0 - raw) / sd0
    anyf = np.array([bool(d) for d in D])
    edges = np.arange(100 - 60 * K, 100 + 200 * K, 2.0)
    base = np.array([np.mean(y[(~anyf) & (pw >= e - 3) & (pw < e + 3)] == 1) if ((~anyf) & (pw >= e - 3) & (pw < e + 3)).sum() >= 15 else np.nan for e in edges])
    ok = ~np.isnan(base)
    base = np.maximum.accumulate(np.interp(edges, edges[ok], base[ok]))
    pwin = lambda x: np.interp(x, edges, base)
    for key in ("a4:1", "a4:2", "a4w", "ap"):
        sel = np.array([key in d for d in D]) if key != "a4:1" else np.array([("a4:1" in d) and ("a4:2" not in d) for d in D])
        if sel.sum() < 15:
            continue
        pts = []
        lo_s = np.percentile(pw[sel], np.linspace(0, 100, 6))
        dl_lo = -30 * K if key == "a4w" else 0.0
        dl_hi = 40 * K if key == "a4w" else 80 * K
        for lo, hi in zip(lo_s[:-1], lo_s[1:]):
            b = sel & (pw >= lo) & (pw <= hi)
            if b.sum() < 6:
                continue
            act = float(np.mean(y[b] == 1))
            sh = min((abs(float(np.mean(pwin(pw[b] + dl))) - act), dl) for dl in np.arange(dl_lo, dl_hi + 0.5, 0.5))[1]
            n = int(b.sum())
            pts.append([round(float(np.median(pw[b])), 1), round(sh * n / (n + 20), 1)])
        for k in range(1, len(pts)):
            pts[k][1] = max(pts[k][1], pts[k - 1][1])
        if pts:
            ADJ[key] = pts
            print(f"압도 보정 {key}: {int(sel.sum())}판, 실제 {y[sel].mean():.2f}등 1등 {np.mean(y[sel] == 1) * 100:.0f}% · 구간별 더하는 덱파워 {pts}")


def cap5(pw, f5):
    """5·7코 3성이 없는 덱은 f5 밑으로. 상한 30*K 아래부터는 순서를 지키며 부드럽게 눌러 담는다. 페이지와 같게"""
    k, c = f5 - round(31 * K), 30 * K
    return int(round(pw)) if pw <= k else int(math.floor(k + c * (1 - math.exp(-(pw - k) / c))))


def adj_shift(raw1, d):
    if not d or "_sd" not in ADJ:
        return 0.0
    pw = 100 + SCALE * (ADJ["_mu"] - raw1) / ADJ["_sd"]
    sh = max([float(np.interp(pw, [p[0] for p in ADJ[k]], [p[1] for p in ADJ[k]])) for k in d if k in ADJ] or [0.0])
    return -sh * ADJ["_sd"] / SCALE


def group_of(k):
    """항목별 묶음. 고유 특성(UQ)의 시너지 특징은 '유닛'으로"""
    pre = k.split(":")[0]
    if pre in ("t", "tn") and k.split(":")[1] in UQ:
        return "유닛"
    return GROUP[pre]


def expected_place(sc, cal, calp, mu, sd):
    sc = np.asarray(sc, dtype=float)
    xs, ys = [c[0] for c in cal], [c[1] for c in cal]
    out = np.interp(sc, xs, ys)
    pw = 100 + SCALE * (mu - sc) / sd
    lg = 1 + 7 / (1 + np.exp((pw - calp[1]) / calp[0]))
    out = np.where(sc < xs[0], np.minimum(ys[0], lg), out)
    out = np.where(sc > xs[-1], np.maximum(ys[-1], lg), out)
    return out


def no_traits(b, cost):
    """라이엇 기록에 켜진 일반 시너지가 없는데 실제 유닛이 5명 이상인 판 (기록 오류): 시너지 점수는 평균으로"""
    real_u = sum(1 for u in b[3] if cost.get(u[0], 1) > 0)
    return real_u >= 5 and not any(t[1] and t[1] > 0 and "Unique" not in t[0] for t in b[4])


GROUP = {"sk3": "유닛", "usum": "유닛", "umax": "유닛", "isum": "템", "lv": "레벨", "sl": "레벨", "ls": "레벨", "u": "유닛", "c": "유닛", "val": "유닛", "i": "템", "ic": "템", "dup": "템", "ni": "템",
         "ui": "캐리 템", "k": "캐리 템", "kc": "캐리 템", "t": "시너지", "tn": "시너지", "nt": "시너지", "tsum": "시너지", "tmax": "시너지"}


def load():
    out = []
    try:
        with gzip.open(SRC, "rt", encoding="utf-8") as fh:
            for line in fh:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    break
    except EOFError:
        pass
    return out


def main():
    ms = load()
    pkey = lambda p: [(int(re.match(r"\d+", x).group()), x) for x in p.split(".")]  # 18.5c > 18.5b > 18.5
    setn = max((m["p"].split(".")[0] for m in ms), key=int, default="0")
    if setn == "0":
        setn = str(_si.NUM if PBE else _si.LIVE_NUM)
    load_priors(setn)
    ms = [m for m in ms if m["p"].split(".")[0] == setn]
    now = max((m["t"] for m in ms), default=0)
    rec_days = PBE_RECENT_DAYS if PBE else RECENT_DAYS
    recent = [m for m in ms if m["t"] >= now - rec_days * 86400000]
    pool = recent if len(recent) >= (MIN_GAMES if PBE else WANT) else ms
    pc = Counter(m["p"] for m in pool)
    print(f"[S{setn}{' PBE' if PBE else ''}] 전체 {len(ms)}판 · 최근 {rec_days}일 {len(recent)}판 · 패치 {dict(pc)}")
    use, n = [], 0
    for p in sorted(pc, key=pkey, reverse=True):
        use.append(p)
        n += pc[p]
        if n >= WANT:
            break
    ms = sorted([m for m in pool if m["p"] in use], key=lambda m: -m["t"])
    if len(ms) < MIN_GAMES:
        now_iso = datetime.now(timezone.utc).isoformat(timespec="minutes")
        OUT.write_text(json.dumps({"off": True, "n": len(ms), "set": setn, "pbe": PBE, "updated": now_iso}), encoding="utf-8")
        bands = [("all", "전체", 0, 9)] if PBE else BAND
        TOP.write_text(json.dumps({"updated": now_iso, "set": setn, "pbe": PBE, "bands": [[k, nm] for k, nm, _, _ in bands], "top": {k: [] for k, _, _, _ in bands}}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"판 {len(ms)}개뿐 -> 덱파워 끔 (필드 가치만, {TOP.name} 초기화)")
        return

    # 패치 세대 감쇠 + 지수 시간 감쇠 로비 가중치 (패치·B패치·PBE 일일 빌드 즉시 최신화)
    hl = HALF_LIFE_PBE if PBE else HALF_LIFE_LIVE
    patch_rank = {p: i for i, p in enumerate(use)}
    lob_w = {}
    for m in ms:
        age_d = max(0.0, (now - m["t"]) / 86400000.0)
        pr = patch_rank.get(m["p"], 0)
        lob_w[m["id"]] = (PATCH_DECAY ** pr) * (0.5 ** (age_d / hl))

    cost = {}
    for m in ms:
        for b in m["b"]:
            for u in b[3]:
                uk = nk(u[0])
                cost[u[0]] = SHOP_COST[uk] if uk in SHOP_COST else cost_of(u[2])
    cost_out = {nk(k): v for k, v in cost.items()}
    rows = [(m["id"], m["lt"], b) for m in ms for b in m["b"]]
    mx = defaultdict(int)
    for _, _, b in rows:
        for t in b[4]:
            mx[nk(t[0])] = max(mx[nk(t[0])], t[2] or 0)
    UQ.clear()
    UQ.update(k for k, v in mx.items() if v <= 1 or "Unique" in k)
    F = [feats(b, cost) for _, _, b in rows]
    y = np.array([b[0] for _, _, b in rows], dtype=float)
    cnt = Counter(k for f in F for k in f)
    keys = sorted(k for k, c in cnt.items() if c >= MIN_N or k.startswith(STRUCT))
    idx = {k: i for i, k in enumerate(keys)}
    # 희소 COO 표현 (밀집 6만x6천 행렬 ~2.8GB 대신 ~30MB · 학습 속도 대폭 향상)
    n_rows, n_feat = len(F), len(keys)
    row_cols, row_vals = [], []
    all_r, all_c, all_v = [], [], []
    for r, f in enumerate(F):
        rc, rv = [], []
        for k, v in f.items():
            ci = idx.get(k)
            if ci is not None:
                rc.append(ci)
                rv.append(v)
                all_r.append(r)
                all_c.append(ci)
                all_v.append(v)
        row_cols.append(rc)
        row_vals.append(rv)
    all_r = np.array(all_r, dtype=np.int32)
    all_c = np.array(all_c, dtype=np.int32)
    all_v = np.array(all_v, dtype=np.float64)

    def matvec(wv):
        return np.bincount(all_r, weights=all_v * wv[all_c], minlength=n_rows)

    # 시간순 정렬된 매치 ID: ① 랜덤 20% 검증(전체 정확도) + ② 최신 20% 시간순 검증(최신 패치 전향 정확도)
    ids_by_time = [m["id"] for m in ms]  # 최신순
    n_te = max(1, len(ids_by_time) // 5)
    recent_test = set(ids_by_time[:n_te])
    ids = sorted(ids_by_time)
    random.Random(7).shuffle(ids)
    rand_test = set(ids[:n_te])
    te_rand = np.array([mid in rand_test for mid, _, _ in rows])
    te_rec = np.array([mid in recent_test for mid, _, _ in rows])

    soft = np.array([0.01 if k.startswith(STRUCT) else 1.0 for k in keys], dtype=np.float64)
    lob = defaultdict(list)
    for r, (mid, _, b) in enumerate(rows):
        lob[mid].append(r)

    def pl_fit(mids, lam, it=400, lr=0.05):
        """가중 Plackett-Luce (희소 COO 연산): 최신 패치·최근 판에 높은 가중치를 두고 로비 8명 순위를 학습."""
        valid = [m for m in mids if len(lob[m]) == 8]
        I = [sorted(lob[m], key=lambda r: y[r]) for m in valid]
        n_lob = len(I)
        lw = np.array([lob_w[m] for m in valid], dtype=np.float64)
        lw = lw * (n_lob / float(lw.sum()))  # 평균 1.0으로 정규화
        rr_l, cc_l, vv_l = [], [], []
        for li, grp in enumerate(I):
            base_r = li * 8
            for k_i, r in enumerate(grp):
                rc = row_cols[r]
                if rc:
                    rr_l.extend([base_r + k_i] * len(rc))
                    cc_l.extend(rc)
                    vv_l.extend(row_vals[r])
        rr = np.array(rr_l, dtype=np.int32)
        cc = np.array(cc_l, dtype=np.int32)
        vv = np.array(vv_l, dtype=np.float64)
        n_tr_rows = n_lob * 8
        wv = np.zeros(n_feat, np.float64)
        m1 = np.zeros_like(wv)
        m2 = np.zeros_like(wv)
        pen = lam * soft * 50 / n_lob
        for t in range(1, it + 1):
            sc = np.bincount(rr, weights=vv * wv[cc], minlength=n_tr_rows).reshape(n_lob, 8)
            sc = sc - sc.max(1, keepdims=True)
            e = np.exp(sc)
            cs = np.cumsum(e[:, ::-1], 1)[:, ::-1]
            g_s = ((e * np.cumsum(1.0 / cs, 1) - 1.0) * lw[:, None]).ravel()
            g = np.bincount(cc, weights=vv * g_s[rr], minlength=n_feat) / n_lob + pen * wv
            m1 = 0.9 * m1 + 0.1 * g
            m2 = 0.999 * m2 + 0.001 * g * g
            wv -= lr * (m1 / (1 - 0.9 ** t)) / (np.sqrt(m2 / (1 - 0.999 ** t)) + 1e-8)
        return wv

    def score(pred, mask):
        by = defaultdict(list)
        for (mid, _, b), p, m in zip(rows, pred, mask):
            if m:
                by[mid].append((p, b[0]))
        sp, t4, w1, l8 = [], [], [], []
        for v in by.values():
            if len(v) != 8:
                continue
            ps = [p for p, _ in v]
            pr = np.argsort(np.argsort(ps)) + 1
            ac = np.array([a for _, a in v])
            sp.append(1 - 6 * ((pr - ac) ** 2).sum() / (8 * 63))
            t4.append(np.mean((pr <= 4) == (ac <= 4)))
            w1.append(ac[int(np.argmin(ps))] == 1)
            l8.append(ac[int(np.argmax(ps))] == 8)
        return float(np.mean(sp)), float(np.mean(t4)), float(np.mean(w1)), float(np.mean(l8))

    tr_ids = [m for m in ids if m not in rand_test]
    tr_rec_ids = [m for m in ids_by_time if m not in recent_test]
    best = None
    for lam in (0.3, 1.0, 3.0):
        sc = score(-matvec(pl_fit(tr_ids, lam)), te_rand)
        print(f"lam {lam}: 로비 순서 {sc[0]:.3f} · 순방 맞춤 {sc[1]:.3f} · 1등 맞춤 {sc[2]:.3f} · 8등 맞춤 {sc[3]:.3f}")
        if not best or sc[2] + sc[3] > best[1][2] + best[1][3]:
            best = (lam, sc)
    lam = best[0]
    sc_recent = score(-matvec(pl_fit(tr_rec_ids, lam)), te_rec)
    print(f"최신 20% 전향 검증 (lam {lam}, 반감기 {hl:.0f}일): 순서 {sc_recent[0]:.3f} · 순방 {sc_recent[1]:.3f} · 1등 {sc_recent[2]:.3f} · 8등 {sc_recent[3]:.3f}")

    w = -pl_fit(ids, lam)  # 작을수록 셈
    b0 = 0.0

    # 단조성 보정 1: 레벨은 높을수록 강함 (lv:4 >= lv:5 >= ... >= lv:10)
    for lv in range(9, 3, -1):
        a_, b_ = idx.get(f"lv:{lv}"), idx.get(f"lv:{lv + 1}")
        if a_ is not None and b_ is not None and w[a_] < w[b_]:
            w[a_] = w[b_]
    # 단조성 보정 2: 같은 코스트에서 성급이 높을수록 강함 (4성 <= 3성 <= 2성 <= 1성) — 소표본 4성 역전 방지
    for pre in ("c", "kc"):
        for c_v in (1, 2, 3, 4, 5, 7):
            for st_v in (2, 3, 4):
                lo_i, hi_i = idx.get(f"{pre}:{c_v}:{st_v - 1}"), idx.get(f"{pre}:{c_v}:{st_v}")
                if lo_i is not None and hi_i is not None and w[hi_i] > w[lo_i]:
                    w[hi_i] = w[lo_i]
    # 단조성 보정 3: 고코 3성 서열 (7코 3성 <= 5코 3성 <= 4코 3성)
    for pre in ("c", "kc"):
        for lo_c, hi_c in ((4, 5), (5, 7)):
            lo_i, hi_i = idx.get(f"{pre}:{lo_c}:3"), idx.get(f"{pre}:{hi_c}:3")
            if lo_i is not None and hi_i is not None and w[hi_i] > w[lo_i]:
                w[hi_i] = w[lo_i]

    raw = matvec(w)
    # 5·7코 3성 보정: 5·7코 3성끼리 맞붙은 미러전 제외한 단독 5·7코 3성 승률이 90%+이면
    # 90분위 5·7코 3성이 상위 0.2% 일반 덱보다 강하도록 안정적으로 상향 (극단치 1판 때문에 -17로 폭주하지 않게 상한 2.2*sd 적용)
    h5 = np.array([f.get("c:5:3", 0) > 0 or f.get("c:7:3", 0) > 0 for f in F], bool)
    if h5.any():
        lob_h5_cnt = Counter(rows[i][0] for i in np.where(h5)[0])
        solo_h5 = np.array([h5[i] and lob_h5_cnt[rows[i][0]] == 1 for i in range(len(raw))], bool)
        solo_w1 = float(np.mean(y[solo_h5] == 1)) if solo_h5.sum() else 0.0
        if solo_h5.sum() >= 20 and solo_w1 >= 0.90 and (~h5).any():
            sd_raw = float(raw.std())
            p90_h5 = float(np.percentile(raw[h5], 90))
            p02_other = float(np.percentile(raw[~h5], 0.2))
            need = p90_h5 - p02_other + 0.35 * sd_raw
            if need > 0:
                shift = min(need, 2.2 * sd_raw)
                for k5 in ("c:5:3", "c:7:3"):
                    if k5 in idx:
                        w[idx[k5]] -= shift
                if "c:5:3" in idx and "c:7:3" in idx and w[idx["c:7:3"]] > w[idx["c:5:3"]]:
                    w[idx["c:7:3"]] = w[idx["c:5:3"]]
                raw = matvec(w)
            print(f"5·7코 3성 보정: 전체 {int(h5.sum())}판 · 단독 {int(solo_h5.sum())}판 1등 {solo_w1 * 100:.1f}% (w[c:5:3]={w[idx['c:5:3']]:.2f})")

    # 압도적인 덱(4코 3성·프리즘 시너지) 점수 보정
    D = [dominance(b, cost) for _, _, b in rows]
    fit_adj(raw, y, D)
    raw = raw + np.array([adj_shift(r, d) for r, d in zip(raw, D)])

    cal = make_cal(raw, y)
    calw = make_calp(raw, y)
    pw_all = 100 + SCALE * (raw.mean() - raw) / raw.std()
    bestfit = min(((float(np.mean((1 + 7 / (1 + np.exp((pw_all - c) / k)) - y) ** 2)), k, c) for k in np.arange(6 * K, 30 * K, 0.5) for c in np.arange(100 - 15 * K, 100 + 15 * K, 0.5)))
    calp = [round(float(bestfit[1]), 2), round(float(bestfit[2]), 2)]
    print("예상 등수 곡선", calp, "오차", round(bestfit[0], 3))
    pred = expected_place(raw, cal, calp, float(raw.mean()), float(raw.std()))
    print("보정 확인 (예상 등수 구간 -> 실제):", [(lo, round(float(y[(pred >= lo) & (pred < lo + 1)].mean()), 2)) for lo in range(1, 8) if ((pred >= lo) & (pred < lo + 1)).any()])

    xm = np.bincount(all_c, weights=all_v, minlength=n_feat) / n_rows
    mu, sd = float(raw.mean()), float(raw.std())
    q = [round(float(x), 3) for x in np.percentile(raw, list(range(0, 101)))]
    qf = [round(float(x), 4) for x in np.percentile(raw, [k / 100 for k in range(0, 101)])]
    vals = np.array([value(b[3], cost) for _, _, b in rows])
    vq = [int(x) for x in np.percentile(vals, list(range(0, 101)))]
    band = lambda lt: 0 if lt < 2.5 else 1 if lt < 3.5 else 2 if lt < 4.5 else 3 if lt < 5.5 else 4 if lt < 6.5 else 5
    qb = {}
    for k in range(6):
        sel = np.array([band(lt) == k for _, lt, _ in rows])
        if sel.sum() >= 800:
            qb[k] = [round(float(x), 3) for x in np.percentile(raw[sel], list(range(0, 101)))]

    pwv = 100 + SCALE * (mu - raw) / sd
    st = round(6 * K)
    lo_e = list(range(100 - 12 * st, 100 + 16 * st + 1, st))
    bins = [[e, int(((pwv >= e) & (pwv < e + st)).sum()) if lo_e[0] < e < lo_e[-1] else int((pwv < lo_e[0] + st).sum()) if e == lo_e[0] else int((pwv >= lo_e[-1]).sum())] for e in lo_e]
    dist = {"bins": bins, "n": int(len(pwv)), "byPl": [round(float(pwv[y == k].mean()), 1) for k in range(1, 9)],
            "over": {str(t): round(float((pwv >= t).mean() * 100), 2) for t in (100 + SCALE, round(100 + 1.67 * SCALE), 100 + 2 * SCALE)}, "step": st}

    # 5·7코 3성 경계 f5: 5분위 기반 + [220, 280] 범위 고정 (168처럼 내려앉아 일반 덱을 짓누르거나 300+ 폭주하는 현상 방지)
    if h5.any():
        raw_f5 = int(math.floor(float(np.percentile(pwv[h5], 5))))
        f5 = max(round(100 + 3.0 * SCALE), min(round(100 + 4.5 * SCALE), raw_f5))
    else:
        f5 = None

    w_out = {k: round(float(w[i]), 4) for i, k in enumerate(keys) if abs(w[i]) >= 0.002}
    # 7코스트가 있는 세트에서 7코 3성 표본이 0~1판이라도 5코 3성 이상 가중치를 보장
    if 7 in cost_out.values():
        for pre in ("c", "kc"):
            k5, k7 = f"{pre}:5:3", f"{pre}:7:3"
            if k5 in w_out and (k7 not in w_out or w_out[k7] > w_out[k5]):
                w_out[k7] = w_out[k5]

    since = datetime.fromtimestamp(min(m["t"] for m in ms) / 1000, timezone.utc).strftime("%Y-%m-%d")
    newest = datetime.fromtimestamp(now / 1000, timezone.utc).strftime("%Y-%m-%d")
    _ps = json.loads((ROOT / "data" / "patch_state.json").read_text()) if (ROOT / "data" / "patch_state.json").exists() else {}
    out = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "set": setn, "pbe": PBE, "patch": use, "since": since, "newest": newest,
        "hl": int(hl), "n": len(ms), "lam": lam, "f5": f5, "adj": ADJ, "chroma": CHROMA,
        "model": "plackett-luce-weighted",
        "score": {"spearman": round(best[1][0], 3), "top4": round(best[1][1], 3), "first": round(best[1][2], 3), "last": round(best[1][3], 3)},
        "score_recent": {"spearman": round(sc_recent[0], 3), "top4": round(sc_recent[1], 3), "first": round(sc_recent[2], 3), "last": round(sc_recent[3], 3)},
        "cal": cal, "calp": calp, "calw": calw, "b0": round(float(b0), 4), "w": w_out,
        "uq": sorted(UQ), "base": {g: round(float(sum(w[i] * xm[i] for i, k in enumerate(keys) if group_of(k) == g)), 4) for g in dict.fromkeys(GROUP.values())},
        "scale": SCALE, "dist": dist, "cost": cost_out, "ta": TA, "sk": SK, "up": UP, "ip": IP,
        "mu": round(mu, 4), "sd": round(sd, 4), "q": q, "qf": qf, "qb": qb, "vq": vq,
    }
    if PBE and _ps.get("pbe_release"):
        out["pbe_build"] = {"release": _ps.get("pbe_release", ""), "since": _ps.get("pbe_since", "")}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: 특징 {len(out['w'])}개, f5={f5}, {OUT.stat().st_size // 1024}KB, 판 {len(ms)}")

    mu_r, sd_r = round(mu, 4), round(sd, 4)
    base_r = round(float(sum(w[i] * xm[i] for i, k in enumerate(keys) if group_of(k) == "시너지")), 4)
    build_top(recent, setn, w_out, b0, mu_r, sd_r, cal, calp, base_r, f5)


TIER_KO = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아몬드", "마스터", "그랜드마스터", "챌린저"]
BAND = [("all", "전체", 0, 9), ("top", "마스터+", 7, 9), ("dia", "다이아", 6, 6), ("mid", "플래·에메", 4, 5), ("low", "골드 이하", 0, 3)]


def build_top(allm, setn, w_out, b0, mu, sd, cal, calp, base_syn, f5=None):
    """덱파워 탭 '최근 센 판': 최근 7일 판 끝 보드 중 덱파워 높은 순 (이름이 있는 판만). 티어 묶음마다 20개."""
    now = max((m["t"] for m in allm), default=0)
    cost = {}
    for m in allm:
        for b in m["b"]:
            for u in b[3]:
                uk = nk(u[0])
                cost[u[0]] = SHOP_COST[uk] if uk in SHOP_COST else cost_of(u[2])
    rows = []
    for m in allm:
        if m["p"].split(".")[0] != setn or m["t"] < now - 7 * 86400000:
            continue
        for b in m["b"]:
            if len(b) < 6 or not b[5]:
                continue
            f = feats(b, cost)
            if no_traits(b, cost):
                f = Counter({k: v for k, v in f.items() if group_of(k) != "시너지"})
                sc = b0 + sum(w_out[k] * v for k, v in f.items() if k in w_out) + base_syn
            else:
                sc = b0 + sum(w_out[k] * v for k, v in f.items() if k in w_out)
            sc += adj_shift(sc, dominance(b, cost))
            pw = math.floor(round(100 + SCALE * (mu - sc) / sd, 6) + 0.5)
            if f5 is not None:
                has5 = any(cost.get(u[0], 1) >= 5 and u[1] >= 3 for u in b[3])
                pw = max(pw, f5) if has5 else cap5(pw, f5)
            pw = max(0, pw)
            rows.append((pw, m, b, sc))
    rows.sort(key=lambda r: -r[0])
    bands = [("all", "전체", 0, 9)] if PBE else BAND
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "set": setn, "pbe": PBE, "bands": [[k, nm] for k, nm, _, _ in bands], "top": {}}
    for k, _nm, lo, hi in bands:
        sel = []
        for pw, m, b, sc in rows:
            t = b[2] if b[2] is not None else round(m["lt"])
            if lo <= t <= hi:
                sel.append({"pw": pw, "pred": round(float(expected_place(sc, cal, calp, mu, sd)), 2), "pl": b[0], "lv": b[1], "who": b[5], "tier": "PBE" if PBE else (TIER_KO[t] if t is not None else ""),
                            "lt": m["lt"], "t": m["t"], "p": m["p"], "val": value(b[3], cost),
                            "u": [[u[0], u[1], u[3]] for u in b[3]], "tr": [[x[0], x[1], x[2]] for x in b[4] if x[1]]})
            if len(sel) >= 20:
                break
        out["top"][k] = sel
    TOP.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{TOP.relative_to(ROOT)}: 이름 있는 최근 7일 보드 {len(rows)}개 중 묶음별 상위 20, {TOP.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
