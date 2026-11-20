"""덱파워 모델: 판 끝 보드 -> 예상 등수 (릿지 회귀). data/power/boards.jsonl.gz (crawl_boards.py) -> site/power.json

특징 (라이엇 원래 이름으로, 페이지 boardPower()가 판 기록에서 똑같이 계산한다 — 바꾸면 페이지도 같이):
  [유닛]   u:<유닛>:<별> 개수 · c:<코스트>:<별> 개수 (드문 유닛·5코 3성도 잡힘) · val 필드 가치/10
  [레벨]   lv:<레벨> · sl:<유닛 수 - 레벨> (빈자리 -, 자리 추가 +, -2~+2)
  [템]     i:<템> 개수 · ic:<종류> 개수 (radiant 찬란 / artifact 유물 / emblem 상징 / component 재료 / tactician 왕관·망토·방패 / normal)
           dup 같은 유닛에 같은 템 겹친 수
  [캐리]   ui:<유닛>:<템> 유닛+템 궁합 · k:<유닛>:<별> 템 3개 든 캐리 · kc:<코스트>:<별> 3템 캐리 코스트·별
  [사전 지식] sk3 3성 스킬 배율(log2, 게임 원문) · usum/umax 유닛·별 평균 등수(tactics.tools) · isum 아이템 평균 등수(MetaTFT)
  [시너지] t:<시너지>:<단계> 켜진 단계 · tn:<시너지>:<인원> 정확한 인원 · nt:<켜진 일반 시너지 수> (0~9)
           tsum / tmax: MetaTFT 단계별 평균 등수(ta 표)로 본 켜진 시너지 힘의 합 / 최고 (4.5 - 평균 등수)
페이지 표시: 필드 가치(골드), 덱파워(평균 100, 표준편차 24 — 높을수록 셈), 상위 %, 예상 등수, 누르면 항목별 +/-.

python3 scripts/build_power.py            # 학습 + 검증 점수 출력 + site/power.json
"""
import gzip
import json
import math
import random
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import re

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "power" / "boards.jsonl.gz"
OUT = ROOT / "site" / "power.json"
SCALE = 40  # 덱파워 = 100 + 40 x (표준 점수). 15 -> 24 (2026-11-06) -> 40 (2026-11-14 사용자: "100이랑 120 차이가 20밖에 안 나는 느낌", 같은 로비에서 20점 차이면 95%가 위였음). 페이지는 power.json scale을 읽는다
K = SCALE / 24  # 24 기준으로 정한 점수 간격(상한·보정·차트)을 같은 비율로
RECENT_DAYS = 21  # 최근 3주 판으로
WANT = 4000       # 최신 패치부터 이만큼 모일 때까지 앞 패치 추가 (유닛+템 짝이 많아서 넉넉히)
MIN_GAMES = 300   # 이보다 적으면 덱파워 끔 (새 세트 초반)
MIN_N = 25  # 이보다 적게 나온 특징은 버린다 (아이템·유닛별 특징)


def nk(s):
    """롤체지지(DA_18_Ornn, DA_InfinityEdge)와 라이엇(TFT18_Ornn, TFT_Item_InfinityEdge) 이름을 같게"""
    return re.sub(r"^(DA|TFT\d*)_(\d+_)?(Item_)?", "", s or "")


def cost_of(rarity):
    return {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 6: 5}.get(rarity, min(5, rarity + 1))


def value(units, cost):
    return sum(cost.get(u[0], 1) * 3 ** (u[1] - 1) for u in units if u[1] >= 1)  # 별 모름(0)은 뺀다


def trait_table():
    """MetaTFT 시너지 단계별 평균 등수 (raw/traits.json, 에메+ 수십만 판) -> {"Elderwood:3": 4.12}. 없으면 지난 power.json 것."""
    try:
        r = json.loads((ROOT / "raw" / "traits.json").read_text())["results"]
        out = {}
        for x in r:
            api, _, idx = x["trait"].rpartition("_")
            pl = x["places"][:8]
            if idx.isdigit() and sum(pl) >= 500:
                out[f"{nk(api)}:{idx}"] = round(sum((i + 1) * n for i, n in enumerate(pl)) / sum(pl), 3)
        if out:
            return out
    except Exception:
        pass
    try:
        return json.loads(OUT.read_text()).get("ta") or {}
    except Exception:
        return {}


TA = trait_table()


def unit_priors():
    """게임 원문·통계에서 유닛·아이템 사전 지식. 없으면 지난 power.json 것.
    sk: 3성 스킬 배율 log2(3성 수치 / 2성 수치) 최대 (raw/lookup_ko.json, 5코 평균 8.6배: 드레이븐 25 · 알룬 20 · 럭스 10)
    up: 유닛·별 평균 등수 [1성, 2성, 3성] (site/db.json stars, tactics.tools 다이아+)
    ip: 아이템 평균 등수 (raw/items.json, MetaTFT)"""
    sk, up, ip = {}, {}, {}
    try:
        lk = json.loads((ROOT / "raw" / "lookup_ko.json").read_text())
        name2keys = defaultdict(set)
        for u in lk["units"]:
            if not u.get("cost") or u["cost"] > 5:
                continue
            keys = {nk(a) for a in u.get("assetNames", [])} | {nk(u["apiName"])}
            name2keys[u["name"]] |= keys
            av = (u.get("ability") or {}).get("attributeValues") or {}
            r = max([v[3] / v[2] for v in av.values() if isinstance(v, list) and len(v) >= 4 and v[2] and v[3] and v[2] > 0] or [1])
            for k in keys:
                sk[k] = round(math.log2(max(1.0, r)), 3)
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
    try:
        old = json.loads(OUT.read_text())
        sk = sk or old.get("sk", {})
        up = up or old.get("up", {})
        ip = ip or old.get("ip", {})
    except Exception:
        pass
    return sk, up, ip


SK, UP, IP = unit_priors()

COMPONENTS = {"BFSword", "RecurveBow", "NeedlesslyLargeRod", "TearOfTheGoddess", "ChainVest", "NegatronCloak", "GiantsBelt", "SparringGloves", "Spatula", "FryingPan"}


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
    """b = [등수, 레벨, 티어, units, traits] -> Counter"""
    lvl, units, traits = b[1], b[3], b[4]
    f = Counter()
    nitem = 0
    umax = 0.0
    for cid, star, _r, items in units:
        u, c = nk(cid), cost.get(cid, 1)
        f[f"u:{u}:{star}"] += 1
        if star >= 3 and SK.get(u):
            f["sk3"] += SK[u]  # 3성 스킬 배율 (5코 3성이 말도 안 되는 이유)
        pa = (UP.get(u) or [None, None, None])[min(star, 3) - 1]
        if pa:
            f["usum"] += 4.5 - pa  # 유닛·별 평균 등수로 본 힘
            umax = max(umax, 4.5 - pa)
        f[f"c:{c}:{star}"] += 1
        its = [nk(i) for i in items]
        for it in its:
            f[f"i:{it}"] += 1
            if IP.get(it):
                f["isum"] += 4.5 - IP[it]  # 아이템 평균 등수로 본 힘
            f[f"ic:{item_kind(it)}"] += 1
        for it in set(its):
            f[f"ui:{u}:{it}"] += 1
        f["dup"] += len(its) - len(set(its))
        nitem += len(its)
        if len(its) >= 3:
            f[f"k:{u}:{star}"] += 1
            f[f"kc:{c}:{star}"] += 1
    # 4·5코 3성은 개수가 늘수록 덜 오르게 (1개 1 · 2개 1.58 · 3개 2 · 6개 2.81): 이미 1등이 확실한 덱이 끝없이 커지지 않게 (5코 3성 6개 덱이 294가 나왔었음)
    for k in ("c:4:3", "c:5:3", "kc:4:3", "kc:5:3"):
        if f.get(k):
            f[k] = math.log2(1 + f[k])
    f["umax"] = umax
    f[f"ni:{min(nitem, 12)}"] = 1  # 템 총개수 (템이 적은 덱을 따로 보정: 0~5개 덱이 0.8등 과소평가됐었음)
    nt, tsum, tmax = 0, 0.0, 0.0
    for name, tier, n in traits:
        if tier and tier > 0:
            t = nk(name)
            f[f"t:{t}:{tier}"] = 1
            if n:
                f[f"tn:{t}:{n}"] = 1  # 정확한 인원 (협곡야수 9 = 7단계 그대로인데 한 명 더 씀, 화신 럭스 x2 등)
            if "Unique" not in name:
                nt += 1
            a = TA.get(f"{t}:{tier}")
            if a:  # MetaTFT 단계별 평균 등수로 본 시너지 힘 (4.5 보통)
                tsum += 4.5 - a
                tmax = max(tmax, 4.5 - a)
    f[f"nt:{min(nt, 9)}"] = 1
    f["tsum"] = tsum
    f["tmax"] = tmax
    lv = min(10, max(4, lvl))
    f[f"lv:{lv}"] = 1
    d = max(-2, min(2, len(units) - lv))
    f[f"sl:{d}"] = 1
    f[f"ls:{lv}:{d}"] = 1  # 레벨마다 빈자리·추가 자리 효과가 다르다 (8렙 빈자리는 손해, 10렙은 거의 차이 없음)
    f["val"] = value(units, cost) / 10
    return f


STRUCT = ("c:", "lv:", "val", "ic:", "kc:", "sl:", "nt:", "dup", "tsum", "tmax", "ni:", "sk3", "usum", "umax", "isum")

UQ = set()

# 압도적인 덱 보정 (2026-11-06): 로비 전체 순서를 맞추는 학습은 1등을 거의 확정하는 덱을 덜 쳐준다.
# 같은 덱파워 145~160에서 4코 3성 덱은 실제 1.08등(1등 93%), 아닌 덱 1.25등(75%). 덱파워 130~145 프리즘 시너지 덱 30판은 전부 1등.
# 학습 뒤에 이런 유형마다 점수를 따로 옮겨서 실제 등수에 맞춘다 (adj). 페이지 boardPower도 같게.
CHROMA = {}  # 시너지 키 -> 프리즘 단계 최소 인원 (guides.json styles)
ADJ = {}


def load_chroma():
    CHROMA.clear()
    try:
        db = json.loads((ROOT / "site" / "db.json").read_text())
        st = json.loads((ROOT / "site" / "guides.json").read_text())["styles"]
    except Exception:
        return
    for api, v in db["names"]["t"].items():
        mins = [x[0] for x in st.get(v[0] if v else "", []) if x[2] == "chromatic" and x[0]]
        if mins:
            CHROMA[nk(api)] = min(mins)


def dominance(b, cost):
    """압도적인 덱 표시: a4:1 = 4코 3성, a4:2 = 4코 3성 2개+, a4w = 4코 3성 1개 + 나머지 약함, ap = 프리즘 시너지"""
    f = {}
    n4 = sum(1 for u in b[3] if cost.get(u[0], 1) == 4 and u[1] >= 3)
    # 4코 3성 1개인데 나머지가 약한 덱(4코 3성 빼고 필드 가치 45골드 미만)은 따로: 실제 2.21등·1등 48%로 받쳐 주는 덱(1.29등·82%)과 크게 다르다 (2026-11-07)
    rest = value(b[3], cost) - 36 * n4
    if n4 == 1 and rest < 45:
        f["a4w"] = 1
    elif n4:
        f["a4:1"] = 1  # 2개 덱은 1개 기준과 2개 기준 중 큰 쪽 (2개가 1개보다 덜 오르지 않게)
        if n4 >= 2:
            f["a4:2"] = 1
    if any(t[1] and t[1] > 0 and t[2] and CHROMA.get(nk(t[0])) and t[2] >= CHROMA[nk(t[0])] for t in b[4]):
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
    for k in range(len(out) - 2, -1, -1):  # 앞(센 쪽)이 뒤보다 낮지 않게
        out[k][1] = max(out[k][1], out[k + 1][1]); out[k][2] = max(out[k][2], out[k + 1][2])
    return [[round(a, 4), round(b, 4), round(c, 4)] for a, b, c in out]


def fit_adj(raw, y, D):
    """압도적인 덱 유형마다 '덱파워 구간 -> 더할 점수' 표를 만든다.
    일반 덱은 덱파워가 아무리 높아도 1등 확률이 80%대에서 멈추는데 4코 3성·프리즘 덱은 90~100%까지 간다.
    그래서 구간마다 '그 1등 확률을 내는 일반 덱의 덱파워'와의 차이만큼 올린다 (표본이 적으면 줄여서)."""
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
        if sel.sum() < 20:
            continue
        pts = []
        lo_s = np.percentile(pw[sel], np.linspace(0, 100, 6))  # 표본이 비슷하게 5구간
        for lo, hi in zip(lo_s[:-1], lo_s[1:]):
            b = sel & (pw >= lo) & (pw <= hi)
            if b.sum() < 8:
                continue
            act = float(np.mean(y[b] == 1))
            sh = min((abs(float(np.mean(pwin(pw[b] + dl))) - act), dl) for dl in np.arange(-30 * K, 80 * K + 0.5, 0.5))[1]
            n = int(b.sum())
            pts.append([round(float(np.median(pw[b])), 1), round(sh * n / (n + 20), 1)])  # 표본 적으면 줄임
        for k in range(1, len(pts)):  # 셀수록 덜 올리지 않게
            pts[k][1] = max(pts[k][1], pts[k - 1][1])
        if pts:
            ADJ[key] = pts
            print(f"압도 보정 {key}: {int(sel.sum())}판, 실제 {y[sel].mean():.2f}등 1등 {np.mean(y[sel] == 1) * 100:.0f}% · 구간별 더하는 덱파워 {pts}")


def cap5(pw, f5):
    """5코 3성이 없는 덱은 5코 3성 덱 밑으로. 상한 30점 아래부터는 순서를 지키며 부드럽게 눌러 담는다 (같은 숫자로 몰리지 않게). 페이지와 같게"""
    k, c = f5 - round(31 * K), 30 * K
    return int(round(pw)) if pw <= k else int(math.floor(k + c * (1 - math.exp(-(pw - k) / c))))


def adj_shift(raw1, d):
    """보드 하나: 압도 보정으로 원점수를 얼마나 옮기나 (작을수록 셈이라 음수). 여러 유형이면 큰 쪽 하나"""
    if not d or "_sd" not in ADJ:
        return 0.0
    pw = 100 + SCALE * (ADJ["_mu"] - raw1) / ADJ["_sd"]
    sh = max([float(np.interp(pw, [p[0] for p in ADJ[k]], [p[1] for p in ADJ[k]])) for k in d if k in ADJ] or [0.0])
    return -sh * ADJ["_sd"] / SCALE


def group_of(k):
    """항목별 묶음. 고유 특성(UQ)의 시너지 특징은 '유닛'으로 (그 유닛 강함의 일부라서)"""
    pre = k.split(":")[0]
    if pre in ("t", "tn") and k.split(":")[1] in UQ:
        return "유닛"
    return GROUP[pre]


def expected_place(sc, cal, calp, mu, sd):
    """점수 -> 예상 등수. 보정표 안은 보간, 밖은 로지스틱 곡선 (페이지 boardPower와 같게)"""
    sc = np.asarray(sc, dtype=float)
    xs, ys = [c[0] for c in cal], [c[1] for c in cal]
    out = np.interp(sc, xs, ys)
    pw = 100 + SCALE * (mu - sc) / sd
    lg = 1 + 7 / (1 + np.exp((pw - calp[1]) / calp[0]))
    out = np.where(sc < xs[0], np.minimum(ys[0], lg), out)
    out = np.where(sc > xs[-1], np.maximum(ys[-1], lg), out)
    return out


def no_traits(b):
    """라이엇 기록에 켜진 일반 시너지가 없는데 보드가 큰 판 (소환 유닛 등 기록 오류): 시너지 점수는 평균으로 본다"""
    return len(b[3]) >= 5 and not any(t[1] and t[1] > 0 and "Unique" not in t[0] for t in b[4])


# 페이지 '항목별' 묶음 (특징 앞 글자 -> 묶음)
GROUP = {"sk3": "유닛", "usum": "유닛", "umax": "유닛", "isum": "템", "lv": "레벨", "sl": "레벨", "ls": "레벨", "u": "유닛", "c": "유닛", "val": "유닛", "i": "템", "ic": "템", "dup": "템", "ni": "템",
         "ui": "캐리 템", "k": "캐리 템", "kc": "캐리 템", "t": "시너지", "tn": "시너지", "nt": "시너지", "tsum": "시너지", "tmax": "시너지"}


def load():
    out = []
    try:  # 크롤러가 아직 쓰는 중이면 끝이 잘려 있다 -> 읽은 데까지
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
    # 지금 세트만 (세트가 바뀌면 처음부터)
    setn = max((m["p"].split(".")[0] for m in ms), key=int, default="0")
    ms = [m for m in ms if m["p"].split(".")[0] == setn]
    # 최근 3주 안에서, 최신 패치부터 2000판 이상 모일 때까지 앞 패치를 더한다 (모자라면 3주 넘은 판도)
    now = max((m["t"] for m in ms), default=0)
    recent = [m for m in ms if m["t"] >= now - RECENT_DAYS * 86400000]
    pool = recent if len(recent) >= WANT else ms
    pc = Counter(m["p"] for m in pool)
    print("판", len(ms), "· 최근", RECENT_DAYS, "일", len(recent), "· 패치", dict(pc))
    use, n = [], 0
    for p in sorted(pc, key=pkey, reverse=True):
        use.append(p)
        n += pc[p]
        if n >= WANT:
            break
    ms = sorted([m for m in pool if m["p"] in use], key=lambda m: -m["t"])
    if len(ms) < MIN_GAMES:  # 새 세트 첫날 등: 판이 너무 적으면 덱파워는 끄고 필드 가치만
        OUT.write_text(json.dumps({"off": True, "n": len(ms), "set": setn, "updated": datetime.now(timezone.utc).isoformat(timespec="minutes")}), encoding="utf-8")
        print(f"판 {len(ms)}개뿐 -> 덱파워 끔 (필드 가치만)")
        return
    cost = {}
    for m in ms:
        for b in m["b"]:
            for u in b[3]:
                cost[u[0]] = cost_of(u[2])
    cost_out = {nk(k): v for k, v in cost.items()}
    rows = [(m["id"], m["lt"], b) for m in ms for b in m["b"]]
    # 유닛 하나짜리 고유 특성 (럭스 화신·자연의 아버지 등): 항목별 보기에서 '유닛'으로 묶는다
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
    X = np.zeros((len(F), len(keys)), dtype=np.float32)
    for r, f in enumerate(F):
        for k, v in f.items():
            if k in idx:
                X[r, idx[k]] = v
    ids = sorted({m["id"] for m in ms})
    random.Random(7).shuffle(ids)
    test = set(ids[: len(ids) // 5])
    te = np.array([mid in test for mid, _, _ in rows])

    # 구조 특징(코스트·별, 레벨, 필드 가치 등)은 거의 안 줄인다 (드문 5코 3성도 제 값 받게)
    soft = np.array([0.01 if k.startswith(STRUCT) else 1.0 for k in keys], dtype=np.float32)
    lob = defaultdict(list)
    for r, (mid, _, b) in enumerate(rows):
        lob[mid].append(r)

    def pl_fit(mids, lam, it=400, lr=0.05):
        """Plackett-Luce: 로비 8명의 실제 순서가 나올 확률을 최대로 (1등부터 차례로 '남은 사람 중 제일 셈'). 점수 높을수록 셈.
        2026-11-06 비교 (테스트 1,611로비): 등수 회귀 대비 1등 맞춤 65.2%→70.2%, 8등 67.5%→71.8%, 두 덱 비교 88.7%→89.5%. LightGBM(비선형)과 거의 같음."""
        I = np.array([sorted(lob[m], key=lambda r: y[r]) for m in mids if len(lob[m]) == 8])
        Xt = X[I]
        wv = np.zeros(len(keys), np.float32)
        m1 = np.zeros_like(wv)
        m2 = np.zeros_like(wv)
        pen = (lam * soft * 50 / len(I)).astype(np.float32)
        for t in range(1, it + 1):
            sc = Xt @ wv
            sc = sc - sc.max(1, keepdims=True)
            e = np.exp(sc)
            cs = np.cumsum(e[:, ::-1], 1)[:, ::-1]  # k번째 자리에서 남은 사람들
            g_s = e * np.cumsum(1.0 / cs, 1) - 1.0
            g = np.einsum("lk,lkf->f", g_s, Xt) / len(I) + pen * wv
            m1 = 0.9 * m1 + 0.1 * g
            m2 = 0.999 * m2 + 0.001 * g * g
            wv -= lr * (m1 / (1 - 0.9 ** t)) / (np.sqrt(m2 / (1 - 0.999 ** t)) + 1e-8)
        return wv

    def score(pred, mask):
        # 로비 안 순서(스피어만) · 순방 맞춤 · 1등 맞춤 · 8등 맞춤 (pred 작을수록 셈)
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

    tr_ids = [m for m in ids if m not in test]
    best = None
    for lam in (0.3, 1.0, 3.0):
        sc = score(-(X @ pl_fit(tr_ids, lam)), te)
        print(f"lam {lam}: 로비 순서 {sc[0]:.3f} · 순방 맞춤 {sc[1]:.3f} · 1등 맞춤 {sc[2]:.3f} · 8등 맞춤 {sc[3]:.3f}")
        if not best or sc[2] + sc[3] > best[1][2] + best[1][3]:
            best = (lam, sc)
    lam = best[0]
    w = -pl_fit(ids, lam)  # 페이지와 같은 방향: 작을수록 셈
    b0 = 0.0
    # 레벨은 높을수록 셀 수밖에 없다: 표본이 적은 낮은 레벨이 뒤집히지 않게 (5렙이 6렙보다 세게 나왔었음)
    for lv in range(9, 3, -1):
        a_, b_ = idx.get(f"lv:{lv}"), idx.get(f"lv:{lv + 1}")
        if a_ is not None and b_ is not None and w[a_] < w[b_]:
            w[a_] = w[b_]
    # 5코 3성은 4코 3성보다는 세게 (표본이 적어 뒤집히지 않게)
    if "c:5:3" in idx and "c:4:3" in idx and w[idx["c:5:3"]] > w[idx["c:4:3"]]:
        w[idx["c:5:3"]] = w[idx["c:4:3"]]
    raw = X @ w
    # 5코 3성 덱은 5코 3성이 없는 어떤 덱보다도 위 (2026-11-06 사용자 요청 + 데이터: 최근 3주 5코 3성 덱 120판 전부 1등)
    # 실제로 거의 다 1등일 때만(95%+): 제일 약한 5코 3성 덱이 5코 3성 없는 제일 센 덱보다 셀 때까지 5코 3성 점수를 올린다
    if "c:5:3" in idx:
        h = X[:, idx["c:5:3"]] > 0
        if h.sum() >= 30 and np.mean(y[h] == 1) >= 0.95:
            weakest5 = float(np.max(raw[h]))  # 작을수록 셈
            strongest_other = float(np.min(raw[~h]))
            if weakest5 >= strongest_other:
                w[idx["c:5:3"]] -= (weakest5 - strongest_other + 0.05 * float(raw.std())) / float(np.min(X[h, idx["c:5:3"]]))
                raw = X @ w
            print(f"5코 3성 보정: {int(h.sum())}판 1등 {np.mean(y[h] == 1) * 100:.0f}% -> 5코 3성 없는 덱보다 항상 위")
    # 압도적인 덱(4코 3성·프리즘 시너지) 점수 보정
    load_chroma()
    D = [dominance(b, cost) for _, _, b in rows]
    fit_adj(raw, y, D)
    raw = raw + np.array([adj_shift(r, d) for r, d in zip(raw, D)])
    # 예상 등수 보정표: 점수 구간(분위 50칸)마다 실제 평균 등수 (점수가 셀수록 등수가 같거나 좋아지게)
    # 상위 2%(점수 작은 쪽)는 더 잘게: 0.1·0.2·0.5·1·1.5·2% 경계 (예전엔 상위 2%가 한 칸이라 245점도 1.2등으로 나왔음)
    cal = make_cal(raw, y)
    calw = make_calp(raw, y)  # 같은 구간의 1등·순방 확률 (2026-11-14 사용자: "확률도 같이 적고")
    # 표 밖(가장 센 칸보다 센 덱·가장 약한 칸보다 약한 덱)은 로지스틱 곡선 E = 1 + 7 / (1 + exp((덱파워 - c) / k))로 이어서 1등·8등에 가까워지게
    pw_all = 100 + SCALE * (raw.mean() - raw) / raw.std()
    bestfit = min(((float(np.mean((1 + 7 / (1 + np.exp((pw_all - c) / k)) - y) ** 2)), k, c) for k in np.arange(6 * K, 30 * K, 0.5) for c in np.arange(100 - 15 * K, 100 + 15 * K, 0.5)))
    calp = [round(bestfit[1], 2), round(bestfit[2], 2)]
    print("예상 등수 곡선", calp, "오차", round(bestfit[0], 3))
    pred = expected_place(raw, cal, calp, float(raw.mean()), float(raw.std()))
    print("보정 확인 (예상 등수 구간 -> 실제):", [(lo, round(float(y[(pred >= lo) & (pred < lo + 1)].mean()), 2)) for lo in range(1, 8) if ((pred >= lo) & (pred < lo + 1)).any()])
    xm = X.mean(0)  # 항목별 +/-는 '평균 보드'와 비교
    mu, sd = float(raw.mean()), float(raw.std())  # 덱파워 = 100 + 15 x (평균 - 점수)/표준편차 (분포가 거의 정규라 130↑ ≈ 상위 2%)
    q = [round(float(x), 3) for x in np.percentile(raw, list(range(0, 101)))]  # 예상 등수 분위 (작을수록 셈)
    qf = [round(float(x), 4) for x in np.percentile(raw, [k / 100 for k in range(0, 101)])]  # 상위 0~1%를 0.01% 단위로
    vals = np.array([value(b[3], cost) for _, _, b in rows])
    vq = [int(x) for x in np.percentile(vals, list(range(0, 101)))]
    # 티어 묶음별 분위도 (같은 티어 판끼리 비교): 0 아이언~실버, 1 골드, 2 플래, 3 에메, 4 다이아, 5 마스터+
    band = lambda lt: 0 if lt < 2.5 else 1 if lt < 3.5 else 2 if lt < 4.5 else 3 if lt < 5.5 else 4 if lt < 6.5 else 5
    qb = {}
    for k in range(6):
        sel = np.array([band(lt) == k for _, lt, _ in rows])
        if sel.sum() >= 800:
            qb[k] = [round(float(x), 3) for x in np.percentile(raw[sel], list(range(0, 101)))]
    top = sorted(((float(w[i]), k) for i, k in enumerate(keys)), key=lambda x: x[0])
    print("센 쪽 (등수 낮춤):", [(k, round(v, 2)) for v, k in top[:15]])
    print("약한 쪽:", [(k, round(v, 2)) for v, k in top[-8:]])
    # 덱파워 탭 차트: 5점 구간 분포 (40 미만·170 이상은 끝 칸에) + 등수별 평균 덱파워
    pwv = 100 + SCALE * (mu - raw) / sd
    st = round(6 * K)  # 표준편차의 1/4 구간, 양 끝 칸은 그 밖 전부
    lo_e = list(range(100 - 12 * st, 100 + 16 * st + 1, st))
    bins = [[e, int(((pwv >= e) & (pwv < e + st)).sum()) if lo_e[0] < e < lo_e[-1] else int((pwv < lo_e[0] + st).sum()) if e == lo_e[0] else int((pwv >= lo_e[-1]).sum())] for e in lo_e]
    dist = {"bins": bins, "n": int(len(pwv)), "byPl": [round(float(pwv[y == k].mean()), 1) for k in range(1, 9)],
            "over": {str(t): round(float((pwv >= t).mean() * 100), 2) for t in (100 + SCALE, round(100 + 1.67 * SCALE), 100 + 2 * SCALE)}, "step": st}
    # 5코 3성 경계: 5코 3성 덱은 이 점수 이상, 없는 덱은 이 점수 미만으로 (페이지·덱파워 탭 모두)
    h5 = X[:, idx["c:5:3"]] > 0 if "c:5:3" in idx else np.zeros(len(raw), bool)
    f5 = int(math.floor(float((100 + SCALE * (mu - raw[h5]) / sd).min()))) if h5.any() else None
    since = datetime.fromtimestamp(min(m["t"] for m in ms) / 1000, timezone.utc).strftime("%Y-%m-%d")
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "set": setn, "patch": use, "since": since, "n": len(ms), "lam": lam,
           "f5": f5, "adj": ADJ, "chroma": CHROMA,
           "model": "plackett-luce", "score": {"spearman": round(best[1][0], 3), "top4": round(best[1][1], 3), "first": round(best[1][2], 3), "last": round(best[1][3], 3)}, "cal": cal, "calp": calp, "calw": calw,
           "b0": round(float(b0), 4), "w": {k: round(float(w[i]), 4) for i, k in enumerate(keys) if abs(w[i]) >= 0.002},
           "uq": sorted(UQ), "base": {g: round(float(sum(w[i] * xm[i] for i, k in enumerate(keys) if group_of(k) == g)), 4) for g in dict.fromkeys(GROUP.values())},
           "scale": SCALE, "dist": dist, "cost": cost_out, "ta": TA, "sk": SK, "up": UP, "ip": IP, "mu": round(mu, 4), "sd": round(sd, 4), "q": q, "qf": qf, "qb": qb, "vq": vq}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"site/power.json: 특징 {len(out['w'])}개, {OUT.stat().st_size // 1024}KB, 판 {len(ms)}")
    # 페이지는 power.json의 반올림된 값으로 계산한다 -> 덱파워 탭 목록도 같은 값으로 (경계에서 1점씩 어긋났음)
    w_r = np.array([round(float(x), 4) if abs(x) >= 0.002 else 0.0 for x in w])
    mu_r, sd_r = round(mu, 4), round(sd, 4)
    base_r = round(float(sum(w[i] * xm[i] for i, k in enumerate(keys) if group_of(k) == "시너지")), 4)
    build_top(load(), setn, w_r, b0, keys, idx, mu_r, sd_r, cal, calp, base_r, f5)


TOP = ROOT / "site" / "power_top.json"
TIER_KO = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아몬드", "마스터", "그랜드마스터", "챌린저"]
BAND = [("all", "전체", 0, 9), ("top", "마스터+", 7, 9), ("dia", "다이아", 6, 6), ("mid", "플래·에메", 4, 5), ("low", "골드 이하", 0, 3)]


def build_top(allm, setn, w, b0, keys, idx, mu, sd, cal, calp, base_syn, f5=None):
    """덱파워 탭 '최근 센 판': 최근 7일 판 끝 보드 중 덱파워 높은 순 (이름이 있는 판만). 티어 묶음마다 20개."""
    now = max((m["t"] for m in allm), default=0)
    cost = {}
    for m in allm:
        for b in m["b"]:
            for u in b[3]:
                cost[u[0]] = cost_of(u[2])
    rows = []
    for m in allm:
        if m["p"].split(".")[0] != setn or m["t"] < now - 7 * 86400000:
            continue
        for b in m["b"]:
            if len(b) < 6 or not b[5]:
                continue
            f = feats(b, cost)
            if no_traits(b):  # 시너지 기록 오류: 시너지 묶음은 평균값으로
                f = Counter({k: v for k, v in f.items() if group_of(k) != "시너지"})
                sc = b0 + sum(w[idx[k]] * v for k, v in f.items() if k in idx) + base_syn
            else:
                sc = b0 + sum(w[idx[k]] * v for k, v in f.items() if k in idx)
            sc += adj_shift(sc, dominance(b, cost))
            pw = math.floor(round(100 + SCALE * (mu - sc) / sd, 6) + 0.5)  # 페이지 Math.round와 같게 (소수 6자리에서 자르고 반올림)
            if f5 is not None:
                has5 = any(cost.get(u[0], 1) == 5 and u[1] >= 3 for u in b[3])
                pw = max(pw, f5) if has5 else cap5(pw, f5)
            rows.append((pw, m, b, sc))
    rows.sort(key=lambda r: -r[0])
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "bands": [[k, nm] for k, nm, _, _ in BAND], "top": {}}
    for k, _nm, lo, hi in BAND:
        sel = []
        for pw, m, b, sc in rows:
            t = b[2] if b[2] is not None else round(m["lt"])
            if lo <= t <= hi:
                sel.append({"pw": pw, "pred": round(float(expected_place(sc, cal, calp, mu, sd)), 2), "pl": b[0], "lv": b[1], "who": b[5], "tier": TIER_KO[t] if t is not None else "",
                            "lt": m["lt"], "t": m["t"], "p": m["p"], "val": value(b[3], cost),
                            "u": [[u[0], u[1], u[3]] for u in b[3]], "tr": [[x[0], x[1], x[2]] for x in b[4] if x[1]]})
            if len(sel) >= 20:
                break
        out["top"][k] = sel
    TOP.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"site/power_top.json: 이름 있는 최근 7일 보드 {len(rows)}개 중 묶음별 상위 20, {TOP.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
