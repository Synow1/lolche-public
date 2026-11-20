#!/usr/bin/env python3
"""내 전적을 MetaTFT에서 받아 기록하고 분석한다.

사용법:
    python3 scripts/my_games.py            # 새 판 받기 + 분석 + 페이지용 JSON 생성
    python3 scripts/my_games.py --offline  # 받은 판으로 분석만 다시

저장 위치 (커밋해서 계속 쌓는다. MetaTFT 프로필은 최근 판만 보여주기 때문):
    data/me/config.json         라이엇 아이디
    data/me/matches/<id>.json   판 원본
    data/me/excluded.json       분석에서 뺄 판 {"KR_...": "이유"} (튕김, 자리 비움 등)
    data/me/notes.json          판별 메모 {"KR_...": "3-2에 티모 3성, 4-1 7렙 ..."}
    data/me/coach.json          Claude가 쓰는 분석 코멘트 {"updated": .., "points": [..], "next": [..]}
    data/me/games.json          분석 결과 (페이지도 이걸 읽음, site/me/games.json 으로 복사)

판 원본에는 라운드별 흐름이 없다(폰 플레이). 흐름은 notes.json 메모로 보완한다.
"""
import json
import shutil
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_icons as FI  # noqa: E402
import tft_data as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ME = ROOT / "data" / "me"
MATCHES = ME / "matches"
SITE_ME = ROOT / "site" / "me"
QUEUE = {1090: "일반", 1100: "랭크", 1130: "초고속", 1160: "더블업"}

WOUND = {"붉은 덩굴정령", "모렐로노미콘", "태양불꽃 망토"}
SHRED = {"공허의 지팡이", "이온 충격기"}          # 마법 저항력 감소
SUNDER = {"최후의 속삭임", "저녁갑주"}            # 방어력 감소
REROLL_CORE = {"티모": "기원자 티모 리롤", "케일": "케일 리롤", "베이가": "베이가 리롤", "카직스": "카직스 리롤",
               "마스터 이": "마스터 이 리롤", "아지르": "아지르 리롤", "유나라": "유나라 리롤"}
# 탈락 스테이지별로 이 정도 레벨이면 정상 (커리큘럼 레벨업 정석 기준)
LEVEL_BY_STAGE = {3: 6, 4: 7, 5: 8, 6: 8, 7: 9}
UNIQUE = {t["apiName"] for t in T.load("lookup_ko")["traits"] if t["type"] == "unique"}


def get_json(url):
    req = urllib.request.Request(url, headers={**T.HEADERS, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def stage_of(last_round):
    """Riot last_round -> '4-1'. 1스테이지는 4라운드, 이후 7라운드씩 (2-1 = 5)."""
    if last_round <= 4:
        return 1, f"1-{last_round}"
    s, r = divmod(last_round - 5, 7)
    return s + 2, f"{s + 2}-{r + 1}"


def fetch():
    cfg = json.loads((ME / "config.json").read_text(encoding="utf-8"))
    name, tag = cfg["riot_id"].split("#")
    # MetaTFT에 라이엇 서버에서 새 판을 가져오라고 요청하고, 끝날 때까지 기다린다 (페이지의 Refresh 버튼과 같음).
    refresh = (f"https://api.metatft.com/public/profile/refresh_by_riotid/{cfg['region'].upper()}/"
               f"{urllib.parse.quote(name)}/{urllib.parse.quote(tag)}?source=full_profile&tier=1")
    for _ in range(12):
        try:
            status = get_json(refresh).get("status")
        except Exception as e:  # 갱신이 실패해도 저장된 프로필로 계속한다
            print("갱신 요청 실패:", e)
            break
        if status != "queued":
            break
        time.sleep(5)
    url = (f"https://api.metatft.com/public/profile/lookup_by_riotid/{cfg['region'].upper()}/"
           f"{urllib.parse.quote(name)}/{urllib.parse.quote(tag)}?source=full_profile&tft_set={T.SET}")
    prof = get_json(url)
    (ME / "profile.json").write_text(json.dumps(prof, ensure_ascii=False), encoding="utf-8")
    MATCHES.mkdir(parents=True, exist_ok=True)
    new = 0
    for m in prof.get("matches", []):
        path = MATCHES / f"{m['riot_match_id']}.json"
        if path.exists():
            continue
        data = get_json(m["match_data_url"])
        data["_profile_entry"] = {k: m.get(k) for k in ("queue_id", "avg_rating", "avg_rating_numeric", "patch", "game_duration")}
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        new += 1
        time.sleep(0.3)
    print(f"새 판 {new}개 (총 {len(list(MATCHES.glob('*.json')))}개)")
    return prof["summoner"]["puuid"]


def item_names(nm, u):
    return [nm.i(i) for i in u.get("itemNames", [])]


def deck_label(units, traits):
    names = {u["name"] for u in units}
    active = {t["name"] for t in traits}
    if "일월식" in active:
        return "일월식 케일" if "케일" in names else "일월식"
    if "덩굴정령" in names and any(t["name"] == "협곡야수" and t["count"] >= 5 for t in traits):
        return "협곡야수 덩굴정령"
    full = lambda u: len([i for i in u["items"] if not i["component"]])
    for core, label in REROLL_CORE.items():
        if any(u["name"] == core and full(u) >= 2 for u in units):
            return label
    carry = max(units, key=lambda u: (full(u), u["cost"], u["star"]))
    pool = [t for t in traits if not t.get("unique")] or traits
    top = max(pool, key=lambda t: (t["style"], t["count"])) if pool else None
    return f"{top['name']} {carry['name']}" if top else carry["name"]


def board(nm, p, cost):
    units = []
    for u in p["units"]:
        its = []
        for api in u.get("itemNames", []):
            its.append({"name": nm.i(api), "api": api, "component": api.startswith("DA_Component_")})
        units.append({"name": nm.u(u["character_id"]), "api": u["character_id"], "star": u["tier"],
                      "cost": cost.get(u["character_id"], u.get("rarity", 0) + 1), "items": its})
    traits = [{"name": nm.t(t["name"]), "count": t["num_units"], "style": t["style"], "api": t["name"],
               "unique": t["name"] in UNIQUE}
              for t in p["traits"] if t.get("tier_current", 0) > 0]
    traits.sort(key=lambda t: (-t["style"], -t["count"]))
    return units, traits


def diagnose(g, units, traits, lobby_units):
    flags = []

    def add(level, text):
        flags.append({"level": level, "text": text})

    stage = g["stage_num"]
    items_all = [i["name"] for u in units for i in u["items"]]
    trait_names = {t["name"] for t in traits}
    if g["placement"] > 1 and g["gold_left"] >= 30:
        add("bad", f"{g['gold_left']}골드를 남기고 끝났어요. 렙업이나 롤에 썼으면 등수가 올라갔을 판이에요.")
    elif g["placement"] > 1 and g["gold_left"] >= 15:
        add("warn", f"{g['gold_left']}골드를 남기고 끝났어요.")
    need = LEVEL_BY_STAGE.get(stage)
    if need and g["level"] < need:
        add("bad" if need - g["level"] >= 2 else "warn",
            f"{g['stage']}에 {g['level']}렙이었어요. 이 시점이면 보통 {need}렙이에요.")
    core = [u for u in units if u["name"] in REROLL_CORE and len(u["items"]) >= 2]
    for u in core:
        if u["star"] < 3:
            add("bad", f"리롤 핵심 {u['name']}: {u['star']}성으로 끝났어요. 리롤덱은 3성이 거의 전부예요.")
    ones = [u["name"] for u in units if u["star"] == 1 and u["cost"] <= 3]
    if stage >= 5 and ones and g["level"] < 9:  # 9렙 이상이면 시너지 채우기용 1성은 정상
        add("warn", f"5스테이지 이후 1성 저코스트 기물: {', '.join(ones)}")
    comps = [i["name"] for u in units for i in u["items"] if i["component"]]
    if comps:
        add("warn", f"조합 안 된 재료템을 끼고 끝났어요: {', '.join(comps)}")
    carry = max(units, key=lambda u: (len([i for i in u["items"] if not i["component"]]), u["cost"])) if units else None
    if carry and len([i for i in carry["items"] if not i["component"]]) < 3 and stage >= 5:
        add("warn", f"메인 딜러({carry['name']}) 완성템이 3개가 안 됐어요.")
    has_wound = bool(WOUND & set(items_all)) or "지옥불" in trait_names or any("찬란한" in i and any(w in i for w in WOUND) for i in items_all)
    has_shred = bool(SHRED & set(items_all)) or "부식" in trait_names or any(u["name"] == "케일" and u["star"] >= 2 for u in units)
    has_sunder = bool(SUNDER & set(items_all))
    if stage >= 4 and not has_wound:
        add("warn", "치감(레드·모렐로·썬파·지옥불)이 없었어요.")
    if stage >= 4 and not (has_shred or has_sunder):
        add("warn", "깎(공허·이온·라위·저녁갑주)이 없었어요.")
    if carry:
        rivals = [p for p, names in lobby_units.items() if carry["name"] in names]
        if rivals:
            add("info", f"메인 딜러 {carry['name']}: 같은 유닛을 쓴 상대 {len(rivals)}명 (겹침).")
    if not flags:
        add("good", "최종 보드 기준으로 크게 걸리는 건 없어요.")
    return flags


def analyze(puuid):
    lk = T.load("lookup_ko")
    nm = T.Names(lk)
    cost = {}
    for u in lk["units"]:
        for a in u.get("assetNames", []) + [u["apiName"]]:
            cost[a] = u["cost"]
    notes = json.loads((ME / "notes.json").read_text(encoding="utf-8")) if (ME / "notes.json").exists() else {}
    excluded = json.loads((ME / "excluded.json").read_text(encoding="utf-8")) if (ME / "excluded.json").exists() else {}
    games = []
    for path in sorted(MATCHES.glob("*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        info, meta = d["info"], d.get("_profile_entry", {})
        me = next((p for p in info["participants"] if p["puuid"] == puuid), None)
        if not me:
            continue
        units, traits = board(nm, me, cost)
        lobby, lobby_units = [], {}
        for p in sorted(info["participants"], key=lambda x: x["placement"]):
            if p["puuid"] == puuid:
                continue
            pu, pt = board(nm, p, cost)
            lobby_units[p["puuid"]] = {u["name"] for u in pu}
            lobby.append({"placement": p["placement"], "name": p.get("riotIdGameName", ""), "level": p["level"],
                          "deck": deck_label(pu, pt) if pu else "-",
                          "units": [{"name": u["name"], "star": u["star"], "cost": u["cost"]} for u in pu]})
        stage_num, stage = stage_of(me["last_round"])
        g = {
            "id": d["metadata"]["match_id"],
            "time": info.get("game_datetime"),
            "queue": QUEUE.get(info.get("queue_id"), str(info.get("queue_id"))),
            "patch": meta.get("patch") or d.get("_metatft", {}).get("patch"),
            "lobby_rating": meta.get("avg_rating"),
            "placement": me["placement"], "level": me["level"], "gold_left": me["gold_left"],
            "stage": stage if me["placement"] > 1 else "우승", "stage_num": stage_num,
            "damage": me.get("total_damage_to_players", 0),
            "deck": deck_label(units, traits) if units else "-",
            "units": units, "traits": traits,
            "lobby": lobby, "note": notes.get(d["metadata"]["match_id"], ""),
            "excluded": excluded.get(d["metadata"]["match_id"], ""),
        }
        g["flags"] = diagnose(g, units, traits, lobby_units)
        games.append(g)
    games.sort(key=lambda g: g["time"] or 0, reverse=True)
    return games, nm


def summarize(games):
    games = [g for g in games if not g.get("excluded")]
    if not games:
        return {}
    pl = [g["placement"] for g in games]
    by_deck = defaultdict(list)
    for g in games:
        by_deck[g["deck"]].append(g["placement"])
    flag_count = Counter()
    for g in games:
        for f in g["flags"]:
            if f["level"] in ("bad", "warn"):
                key = f["text"].split(".")[0]
                for prefix in ("리롤 핵심", "조합 안 된", "치감", "깎", "메인 딜러", "5스테이지"):
                    if f["text"].startswith(prefix):
                        key = prefix
                if "골드를 남기고" in f["text"]:
                    key = "골드 남기고 끝남"
                if "렙이었어요" in f["text"]:
                    key = "레벨 낮음"
                flag_count[key] += 1
    return {
        "games": len(games), "avg": round(sum(pl) / len(pl), 2),
        "top4": round(sum(p <= 4 for p in pl) / len(pl) * 100), "win": round(sum(p == 1 for p in pl) / len(pl) * 100),
        "placements": pl,
        "by_deck": sorted([{"deck": k, "games": len(v), "avg": round(sum(v) / len(v), 2)} for k, v in by_deck.items()],
                          key=lambda x: (-x["games"], x["avg"])),
        "common_flags": flag_count.most_common(6),
        "gold_wasted_avg": round(sum(g["gold_left"] for g in games if g["placement"] > 1) / max(1, sum(g["placement"] > 1 for g in games)), 1),
    }


def ensure_icons(games, nm):
    idx_path = ROOT / "site" / "icons" / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    changed = False
    for g in games:
        for u in g["units"] + [x for p in g["lobby"] for x in p["units"]]:
            if u["name"] not in idx["units"] and u.get("api"):
                p = FI.save("champions", "u", u["api"].lower())
                if p:
                    idx["units"][u["name"]] = {"icon": p, "cost": u["cost"]}
                    changed = True
        for u in g["units"]:
            for it in u["items"]:
                if it["name"] not in idx["items"]:
                    p = FI.save("items", "i", it["api"].lower())
                    if p:
                        idx["items"][it["name"]] = {"icon": p, "recipe": []}
                        changed = True
        for t in g["traits"]:
            if t["name"] not in idx["traits"]:
                p = FI.save("traits", "t", t["api"].lower())
                if p:
                    idx["traits"][t["name"]] = p
                    changed = True
    if changed:
        idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    offline = "--offline" in sys.argv
    ME.mkdir(parents=True, exist_ok=True)
    if offline:
        puuid = json.loads((ME / "profile.json").read_text(encoding="utf-8"))["summoner"]["puuid"]
    else:
        puuid = fetch()
    games, nm = analyze(puuid)
    ensure_icons(games, nm)
    coach = json.loads((ME / "coach.json").read_text(encoding="utf-8")) if (ME / "coach.json").exists() else {}
    out = {"updated": time.strftime("%Y-%m-%d %H:%M"), "summary": summarize(games), "coach": coach, "games": games}
    (ME / "games.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    SITE_ME.mkdir(parents=True, exist_ok=True)
    shutil.copy(ME / "games.json", SITE_ME / "games.json")
    s = out["summary"]
    print(f"{s.get('games', 0)}판 · 평균 {s.get('avg')} · 순방 {s.get('top4')}% · 자주 나온 문제 {s.get('common_flags')}")


if __name__ == "__main__":
    main()
