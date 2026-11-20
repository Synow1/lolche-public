"""덱파워 학습용 판 기록 모으기 (롤체지지 API).

티어가 골고루 섞이게: 판 기록에 나온 사람들 중 판이 적게 모인 티어 사람부터 다음으로 받는다.
결과: data/power/boards.jsonl.gz  한 줄 = 한 판
  {"id": 매치ID, "s": 세트, "p": 패치, "t": 시각, "lt": 로비 평균 티어 숫자,
   "b": [[등수, 레벨, 티어 숫자, [[유닛, 별, 희귀도, [템...]]...], [[시너지, 단계, 인원]...], "이름#태그", 탈락 라운드, 남은 골드] x8]}  (끝 두 칸은 2026-11-13부터)

python3 scripts/crawl_boards.py [새로 모을 판수=4000] [최대요청=600]   (매일 점검: 300 80)
"""
import gzip
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "data" / "power" / "boards.jsonl.gz"
DAK = "https://tft.dakgg.io/api/v1/"
KEEP_DAYS = 42  # 이보다 오래된 판은 지운다 (학습은 build_power.py가 최근 3주 위주로 고름)


def season_now():
    """지금 세트 (data/patch_state.json의 패치 앞자리: 18.5c -> set18). 세트가 바뀌면 옛 세트 판은 지워진다."""
    import setinfo
    return setinfo.SEASON


SEASON = season_now()
UA = {"User-Agent": "lolche-note/1.0 (personal study app)"}
SEEDS = ["Synow#KR1", "이렐꼴1픽#KR1", "날씨가너무덥네요#KR1"]
# 티어 묶음 (판을 고르게 모으는 단위)
BUCKET = {"IRON": 0, "BRONZE": 0, "SILVER": 1, "GOLD": 2, "PLATINUM": 3, "EMERALD": 4, "DIAMOND": 5, "MASTER": 6, "GRANDMASTER": 7, "CHALLENGER": 7}
TNUM = {"IRON": 0, "BRONZE": 1, "SILVER": 2, "GOLD": 3, "PLATINUM": 4, "EMERALD": 5, "DIAMOND": 6, "MASTER": 7, "GRANDMASTER": 8, "CHALLENGER": 9}


def rid_of(s):
    return s["gameName"] + "#" + s["tagLine"] if s and s.get("gameName") and s.get("tagLine") else ""


def lb(lt):
    """로비 평균 티어 숫자(0 아이언 ~ 9 챌) -> 사람 티어 묶음과 같은 칸 (BUCKET)"""
    t = round(lt)
    return 0 if t <= 1 else min(7, t - 1)


def get(path, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(DAK + path, headers=UA), timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                return None
            time.sleep(3 * (k + 1))
        except Exception:
            time.sleep(3 * (k + 1))
    return None


def load():
    """있는 판 읽기. 다른 세트 판·KEEP_DAYS보다 오래된 판은 빼고, 뺀 게 있으면 파일을 다시 쓴다."""
    have, dropped = {}, 0
    cut = (time.time() - KEEP_DAYS * 86400) * 1000
    if OUT.exists():
        try:
            with gzip.open(OUT, "rt", encoding="utf-8") as f:
                for line in f:
                    try:
                        m = json.loads(line)
                    except ValueError:
                        break
                    if (m.get("s") or "set" + str(m.get("p", "0")).split(".")[0]) != SEASON or m["t"] < cut:
                        dropped += 1
                        continue
                    have[m["id"]] = m
        except EOFError:  # 끝이 잘린 파일 (중간에 꺼진 수집)
            dropped += 1
    if dropped:
        with gzip.open(OUT, "wt", encoding="utf-8") as f:
            for m in have.values():
                f.write(json.dumps(m, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"옛 판 {dropped}개 지움 (다른 세트이거나 {KEEP_DAYS}일 넘음)")
    return have


def main():
    goal = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    cap = int(sys.argv[2]) if len(sys.argv) > 2 else 600
    OUT.parent.mkdir(parents=True, exist_ok=True)
    have = load()
    print("있던 판", len(have))
    goal += len(have)
    cnt = [0] * 8
    for m in have.values():
        cnt[lb(m["lt"])] += 1
    queue = {b: [] for b in range(8)}
    seen = set()
    for s in SEEDS:
        queue[2].append(s)
        seen.add(s)
    # 모아 둔 최근 판(3일)에 나온 사람들도 후보로 (매일 같은 사람만 다시 찾으면 새 판이 거의 안 나옴). 티어 묶음별로 섞어서
    import random
    newest = max((m["t"] for m in have.values()), default=0)
    pool = [(b[5], b[2]) for m in have.values() if m["t"] >= newest - 3 * 86400000 for b in m["b"] if len(b) > 5 and b[5] and b[2] is not None]
    random.shuffle(pool)
    for rid, t in pool:
        if rid not in seen:
            seen.add(rid)
            queue[0 if t <= 1 else min(7, t - 1)].append(rid)
    # 랭커 몇 명도 씨앗으로 (마스터+)
    lbd = get(f"leaderboards/summoners/kr?page=1&queueId=1100&season={SEASON}") or {}
    sm = {x["puuid"]: x for x in lbd.get("summoners", [])}
    for r in (lbd.get("summonerRankings") or [])[:40]:
        s = sm.get(r.get("puuid"))
        if s and s.get("gameName") and s.get("tagLine"):
            rid = s["gameName"] + "#" + s["tagLine"]
            if rid not in seen:
                queue[7].append(rid)
                seen.add(rid)
    reqs, new, named = 0, 0, 0
    f = gzip.open(OUT, "at", encoding="utf-8")
    try:
        while reqs < cap and len(have) < goal:
            order = sorted(range(8), key=lambda b: cnt[b])
            b = next((b for b in order if queue[b]), None)
            if b is None:
                break
            rid = queue[b].pop(0)
            name, tag = rid.split("#")
            d = get(f"summoners/kr/{urllib.parse.quote(name + '-' + tag)}/matches?season={SEASON}&page=1&queueId=1100")
            reqs += 1
            time.sleep(0.4)
            if not d:
                continue
            sms = {x["puuid"]: x for x in d.get("summoners", [])}
            lgs = {x["puuid"]: x for x in d.get("summonerLeagues", []) if x.get("queueId") == 1100}
            # 받은 판 사람들을 다음 후보로 (이미 있는 판이어도 — 사람은 새로 나옴). 티어 묶음별로
            for x in sms.values():
                l = lgs.get(x["puuid"])
                if not l or l.get("tier") not in BUCKET or not x.get("gameName") or not x.get("tagLine"):
                    continue
                r2 = x["gameName"] + "#" + x["tagLine"]
                if r2 not in seen:
                    seen.add(r2)
                    queue[BUCKET[l["tier"]]].append(r2)
            for m in d.get("matches", []):
                old = have.get(m["matchId"])
                if old and any(len(b) < 6 for b in old["b"]) and len(m.get("participants", [])) == 8:  # 이름 없이 모은 옛 판 -> 이름 채우기
                    byp = {(p["placement"], p["level"]): rid_of(sms.get(p["puuid"])) for p in m["participants"]}
                    for b in old["b"]:
                        if len(b) < 6:
                            b.append(byp.get((b[0], b[1]), ""))
                    named += 1
                if m.get("queueId") != 1100 or m["matchId"] in have or len(m.get("participants", [])) != 8:
                    continue
                tiers = [TNUM.get((lgs.get(p["puuid"]) or {}).get("tier", ""), None) for p in m["participants"]]
                known = [t for t in tiers if t is not None]
                if not known:
                    continue
                lt = round(sum(known) / len(known), 2)
                if m["gameCreatedAt"] < (time.time() - KEEP_DAYS * 86400) * 1000:
                    continue
                rec = {"id": m["matchId"], "s": SEASON, "p": m.get("patchVersion"), "t": m["gameCreatedAt"], "lt": lt,
                       "b": [[p["placement"], p["level"], tiers[i],
                              [[u["character_id"], u["tier"], u.get("rarity", 0), u.get("items") or []] for u in p.get("units", [])],
                              [[t["name"], t.get("tier_current", 0), t.get("num_units", 0)] for t in p.get("traits", [])],
                              rid_of(sms.get(p["puuid"])),  # 누가 (덱파워 탭 '최근 센 판')
                              p.get("lastRound"), p.get("goldLeft")]  # 탈락한 라운드(1-1부터 센 번호)·남은 골드 (2026-11-13부터. 옛 판에는 없음)
                             for i, p in enumerate(m["participants"])]}
                have[m["matchId"]] = rec
                f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n")
                new += 1
                cnt[lb(lt)] += 1
            if reqs % 25 == 0:
                print(f"요청 {reqs} · 판 {len(have)} (+{new}) · 티어별 {cnt}", flush=True)
    finally:
        f.close()
        if named:  # 옛 판에 이름 채운 게 있으면 파일 다시 쓰기
            with gzip.open(OUT, "wt", encoding="utf-8") as g:
                for m in have.values():
                    g.write(json.dumps(m, ensure_ascii=False, separators=(",", ":")) + "\n")
            print(f"옛 판 {named}개에 이름 채움")
    print(f"끝: 요청 {reqs} · 판 {len(have)} (+{new}) · 티어별 {cnt}")


if __name__ == "__main__":
    main()
