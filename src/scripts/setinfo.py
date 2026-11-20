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


def num():
    if os.environ.get("LOLCHE_SET", "").isdigit():
        return int(os.environ["LOLCHE_SET"])
    try:
        st = json.loads((ROOT / "data" / "patch_state.json").read_text())
        for k in ("metatft", "patch"):
            v = str(st.get(k) or "")
            if v[:2].isdigit():
                return int(v.split(".")[0])
    except Exception:
        pass
    return FALLBACK


def names():
    try:
        return {int(k): v for k, v in json.loads((ROOT / "data" / "sets.json").read_text()).items()}
    except Exception:
        return {}


NUM = num()
SET = f"TFTSet{NUM}"          # MetaTFT·팀 플래너 코드
SEASON = f"set{NUM}"          # 롤체지지 season
PREFIX = f"TFT{NUM}_"         # 라이엇 유닛 apiName 접두어

if __name__ == "__main__":
    print(json.dumps({"num": NUM, "set": SET, "season": SEASON, "names": names().get(NUM, {})}, ensure_ascii=False))
