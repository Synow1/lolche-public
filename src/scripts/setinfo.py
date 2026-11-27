"""지금 세트 번호를 한 곳에서 정한다 (세트 19 대비, 2026-11-16).

규칙: data/patch_state.json의 'metatft'(MetaTFT 통계 패치) 앞자리. MetaTFT가 19.x 통계를 내기 시작해야 세트를 바꾼다
(롤체지지·PBE가 먼저 19로 가도 MetaTFT에 판이 없으면 덱·유닛 통계가 비니까).
 - 손으로 고정: 환경 변수 LOLCHE_SET=19
 - 세트 이름: data/sets.json {"19": {"ko": "...", "en": "..."}}
쓰는 곳: tft_data.SET(MetaTFT 원문), build_tfa(아카데미), fetch_icons(유닛 접두어), crawl_boards·snap_*·build_friends(롤체지지 season),
build_esports(APAC 사이트), build_oldsets(지난 세트 이름·아이콘), build_page(페이지 SET_ID).
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FALLBACK = 18
GUIDE_MIN = 19  # 2026-11-21 사용자 결정: 공략·통계·도감은 19시즌 PBE로 전면 전환 (본섭 랭크는 12/2 KST 출시 시 자동 전환)


def live_num():
    try:
        st = json.loads((ROOT / "data" / "patch_state.json").read_text())
        for k in ("metatft", "patch"):
            v = str(st.get(k) or "")
            if v[:2].isdigit():
                return int(v.split(".")[0])
    except Exception:
        pass
    return FALLBACK


def num():
    if os.environ.get("LOLCHE_SET", "").isdigit():
        return int(os.environ["LOLCHE_SET"])
    return max(live_num(), GUIDE_MIN)


def names():
    try:
        return {int(k): v for k, v in json.loads((ROOT / "data" / "sets.json").read_text()).items()}
    except Exception:
        return {}


LIVE_NUM = live_num()
NUM = num()
PBE = LIVE_NUM < NUM               # 12/2 KST 본섭 19시즌 출시 전까지 True, 출시되면 자동으로 False
SET = f"TFTSet{NUM}"               # 공략·덱·아카데미·팀 코드 기준 세트 (TFTSet19)
LIVE_SET = f"TFTSet{LIVE_NUM}"     # 본섭 랭크·전적·친구·덱파워 기준 세트 (12/2 KST 전까지 TFTSet18)
SEASON = f"set{LIVE_NUM}"          # 롤체지지 본섭 랭크 season (crawl_boards·snap_*·friends)
GUIDE_SEASON = f"set{NUM}"         # 롤체지지 공략·빌더 season (set19)
PREFIX = f"TFT{NUM}_"              # 라이엇 유닛 apiName 접두어 (참고: 19시즌부터 DA_*19 사용)


def unit_ok(u):
    """현재 공략 세트의 상점 기물인지 판별 (세트 19는 DA_*19 이름 + 7코스트 포함)."""
    if not u or not u.get("traits") or not (1 <= (u.get("cost") or 0) <= 7):
        return False
    if u.get("shopUnit") is False:
        return False
    api = u.get("apiName") or ""
    return api.startswith(PREFIX) or api.startswith(f"DA_{NUM}_") or (api.startswith("DA_") and f"{NUM}" in api)


if __name__ == "__main__":
    print(json.dumps({"num": NUM, "live": LIVE_NUM, "pbe": PBE, "set": SET, "live_set": LIVE_SET,
                      "season": SEASON, "guide_season": GUIDE_SEASON, "names": names().get(NUM, {})}, ensure_ascii=False))
