#!/usr/bin/env python3
"""npb.jp 年度別成績ページの「リーグ・リーダーズ」(タイトル受賞者)を取得。

- 1936-1949: yakyuremmei_YYYY(f|s)?.html (一リーグ時代、36-38は春/秋)
- 1950-2025: centralleague_YYYY.html / pacificleague_YYYY.html
出力: data_raw/titles_raw/*.html (キャッシュ) → data_raw/titles.json

usage: python3 scripts/crawl_titles.py
"""
import json
import os
import re
import time
import urllib.request

from lxml import html as lhtml

BASE = "https://npb.jp/bis/yearly/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data_raw", "titles_raw")
OUT = os.path.join(ROOT, "data_raw", "titles.json")
UA = "npb-143-0-research/0.1 (personal hobby project; contact: github.com/rkido1119)"
LAST_YEAR = 2025  # 進行中シーズンは含めない

# 表彰名の正規化(時代でラベルが揺れる)
AWARD_MAP = {
    "最優秀選手": "MVP",
    "最高殊勲選手": "MVP",
    "首位打者": "首位打者",
    "最多本塁打": "本塁打王",
    "本塁打王": "本塁打王",
    "最多打点": "打点王",
    "打点王": "打点王",
    "最多盗塁": "盗塁王",
    "盗塁王": "盗塁王",
    "最多安打": "最多安打",
    "最高出塁率": "最高出塁率",
    "最優秀防御率": "最優秀防御率",
    "最優秀投手": "最優秀防御率",
    "最多勝利": "最多勝",
    "最高勝率": "最高勝率",
    "最多奪三振": "最多奪三振",
    "最多セーブ": "最多セーブ",
    "最優秀救援投手": "最多セーブ",
    "最優秀中継ぎ": "最優秀中継ぎ",
    "最優秀新人": "新人王",
    "新人王": "新人王",
}


def fetch(url: str, dest: str) -> None:
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    time.sleep(0.4)


def page_list():
    pages = []
    for y in (1936, 1937, 1938):
        pages.append((f"yakyuremmei_{y}s.html", y, "一リーグ(春)"))
        pages.append((f"yakyuremmei_{y}f.html", y, "一リーグ(秋)"))
    for y in range(1939, 1945):
        pages.append((f"yakyuremmei_{y}.html", y, "一リーグ"))
    for y in range(1946, 1950):
        pages.append((f"yakyuremmei_{y}.html", y, "一リーグ"))
    for y in range(1950, LAST_YEAR + 1):
        pages.append((f"centralleague_{y}.html", y, "セ"))
        pages.append((f"pacificleague_{y}.html", y, "パ"))
    return pages


def clean(el) -> str:
    return re.sub(r"[\s　]+", "", el.text_content() or "")


def parse_leaders(path: str, year: int, league: str):
    """リーグ・リーダーズ表 → [(award, name, team)]"""
    with open(path, encoding="utf-8", errors="replace") as f:
        doc = lhtml.fromstring(f.read())
    results = []
    unknown = set()
    for table in doc.xpath("//table"):
        text = table.text_content()
        if "最優秀選手" not in text and "首位打者" not in text:
            continue
        for tr in table.xpath(".//tr"):
            cells = [clean(td) for td in tr.xpath("./td")]
            cells = [c for c in cells if c]
            if len(cells) < 2:
                continue
            raw_award = cells[0]
            if raw_award not in AWARD_MAP:
                if re.match(r"^[最首本打盗新][^0-9.]*$", raw_award):
                    unknown.add(raw_award)
                continue
            name = cells[1]
            team = ""
            for c in cells[2:]:
                m = re.match(r"^[（(](.+?)[）)]$", c)
                if m and not m.group(1).isdigit():
                    team = m.group(1)
                    break
            results.append(
                {
                    "year": year,
                    "league": league,
                    "award": AWARD_MAP[raw_award],
                    "name": name,
                    "team": team,
                }
            )
        break  # リーダーズ表は1つだけ
    return results, unknown


def main():
    os.makedirs(RAW, exist_ok=True)
    all_titles = []
    all_unknown = set()
    missing = []
    for fname, year, league in page_list():
        dest = os.path.join(RAW, fname)
        try:
            fetch(BASE + fname, dest)
        except Exception as e:  # noqa: BLE001
            missing.append((fname, str(e)))
            continue
        rows, unknown = parse_leaders(dest, year, league)
        all_titles.extend(rows)
        all_unknown |= unknown
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(all_titles, f, ensure_ascii=False)
    print(f"titles: {len(all_titles)}")
    if all_unknown:
        print("unknown award labels:", sorted(all_unknown))
    if missing:
        print("missing pages:", missing[:10])
    # 検算
    oh = [t for t in all_titles if t["name"].replace(" ", "") == "王貞治"]
    print(f"王貞治: {len(oh)}件 例: {oh[:3]}")


if __name__ == "__main__":
    main()
