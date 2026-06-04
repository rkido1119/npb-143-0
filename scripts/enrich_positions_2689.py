#!/usr/bin/env python3
"""Wikipediaで解決できなかった選手の守備位置を 2689web.com (日本プロ野球記録) から取得。

- 選手別全成績ページの「守備成績」テーブル(ポジション別試合数)を使う
- 名前照合: NFKC正規化 + 空白/ドット除去。「Ｃ．アーノルド」⇔「C.アーノルド」等
- 同名は ページID先頭の入団年 と npb.jp の実働年の重なりで判別
- 出力: data_raw/positions_2689.json (aggregate がマージ)

usage: python3 scripts/enrich_positions_2689.py
"""
import json
import os
import re
import time
import unicodedata
import urllib.request
from collections import defaultdict

from lxml import html as lhtml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS = os.path.join(ROOT, "data_raw", "players.jsonl")
WIKI_CACHE = os.path.join(ROOT, "data_raw", "positions_cache.json")
RAW = os.path.join(ROOT, "data_raw", "2689")
OUT = os.path.join(ROOT, "data_raw", "positions_2689.json")
BASE = "https://2689web.com/ind/"
UA = "npb-143-0-research/0.1 (personal hobby project; contact: github.com/rkido1119)"
DELAY = 0.5

POS_COLS = [
    ("捕手", ["C"]),
    ("一塁手", ["1B"]),
    ("二塁手", ["2B"]),
    ("三塁手", ["3B"]),
    ("遊撃手", ["SS"]),
    ("外野手", ["LF", "CF", "RF"]),
]
MIN_GAMES = 5  # 通算でこの試合数未満の位置は適格にしない


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKC", name)
    return re.sub(r"[\s　.．・]", "", s)


def fetch(url: str, dest: str) -> str:
    if not (os.path.exists(dest) and os.path.getsize(dest) > 500):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        with open(dest, "wb") as f:
            f.write(data)
        time.sleep(DELAY)
    with open(dest, "rb") as f:
        return f.read().decode("shift_jis", errors="replace")


def expand_table(table):
    """colspan/rowspan を展開してセルのグリッドを返す。"""
    grid = []
    spans = {}  # (row, col) -> text (rowspan持ち越し)
    for ri, tr in enumerate(table.xpath(".//tr")):
        row = []
        ci = 0
        cells = tr.xpath("./td|./th")
        k = 0
        while k < len(cells) or (ri, ci) in spans:
            if (ri, ci) in spans:
                row.append(spans.pop((ri, ci)))
                ci += 1
                continue
            cell = cells[k]
            k += 1
            text = re.sub(r"[\s　]+", "", cell.text_content() or "")
            cs = int(cell.get("colspan") or 1)
            rs = int(cell.get("rowspan") or 1)
            for dc in range(cs):
                row.append(text)
                for dr in range(1, rs):
                    spans[(ri + dr, ci + dc)] = text
            ci += cs
        grid.append(row)
    return grid


def parse_positions_2689(html_text: str):
    """守備成績テーブル → 位置別通算試合数 → 適格ポジション"""
    doc = lhtml.fromstring(html_text)
    target = None
    for table in doc.xpath("//table"):
        txt = table.text_content()
        if "守備成績" in txt or ("捕手" in txt and "遊撃手" in txt and "刺殺" in txt):
            target = table
            break
    if target is None:
        return None, set()
    grid = expand_table(target)
    if len(grid) < 3:
        return None, set()
    # ヘッダ行(位置名)と小見出し行(試合/刺殺/...)を特定
    header = None
    sub = None
    for i, row in enumerate(grid[:4]):
        if "捕手" in row and "遊撃手" in row:
            header = i
        elif header is not None and "試合" in row:
            sub = i
            break
    if header is None or sub is None:
        return None, set()
    games_total = defaultdict(int)
    years = set()
    # 各位置の「試合」列インデックス: header行で位置名が始まる最初の列
    pos_idx = {}
    for name, _ in POS_COLS:
        if name in grid[header]:
            pos_idx[name] = grid[header].index(name)
    for row in grid[sub + 1 :]:
        if not row:
            continue
        # 戦前は「1936春」「1936秋」の分割シーズン表記
        ym = re.match(r"^((?:19|20)\d\d)(?:春|秋)?$", row[0])
        if not ym:
            continue
        years.add(int(ym.group(1)))
        for name, _ in POS_COLS:
            idx = pos_idx.get(name)
            if idx is None or idx >= len(row):
                continue
            v = row[idx]
            if v.isdigit():
                games_total[name] += int(v)
    positions = []
    for name, codes in POS_COLS:
        if games_total.get(name, 0) >= MIN_GAMES:
            for c in codes:
                if c not in positions:
                    positions.append(c)
    return (positions or None), years


def main():
    os.makedirs(RAW, exist_ok=True)
    # 1) 対象: プール入り候補のうち Wikipedia で守備位置が取れなかった野手
    wiki = {}
    if os.path.exists(WIKI_CACHE):
        with open(WIKI_CACHE, encoding="utf-8") as f:
            wiki = json.load(f)
    targets = []  # (pid, name, years)
    with open(PLAYERS, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            pa = sum(r["pa"] for r in rec["batting"])
            min_pa = 80 if (rec["batting"] and rec["batting"][0]["year"] < 1950) else 200
            if pa < min_pa:
                continue
            st = wiki.get(rec["id"], {})
            if st.get("positions"):
                continue
            targets.append(
                (rec["id"], rec["name"], {b["year"] for b in rec["batting"]})
            )
    print(f"targets: {len(targets)}")

    # 2) 五十音インデックスから 名前→ページ の対応表
    ind = fetch(BASE + "ind.html", os.path.join(RAW, "ind.html"))
    kana_pages = sorted(set(re.findall(r"href='(\d+\.html)'", ind)))
    # ind.html のリンクはひらがな1文字ページ(11.html等)のみ対象
    kana_pages = [p for p in kana_pages if len(p) <= 8]
    name_map = defaultdict(list)  # norm名 -> [(href, 表示名)]
    for pg in kana_pages:
        h = fetch(BASE + pg, os.path.join(RAW, pg))
        for href, label in re.findall(r"<a href='(\d{7}\.html)'[^>]*>([^<]+)</a>", h):
            name_map[norm(label)].append((href, label))
    print(f"2689 index: {sum(len(v) for v in name_map.values())} entries")

    # 3) 照合
    result = {}
    misses = []
    for pid, name, years in targets:
        cands = name_map.get(norm(name), [])
        # 同名は入団年(ファイル名先頭4桁)が実働年と整合するものに絞る
        if len(cands) > 1:
            cands = [
                (href, label)
                for href, label in cands
                if years and abs(int(href[:4]) - min(years)) <= 2
            ] or cands
        resolved = False
        for href, label in cands[:3]:
            try:
                h = fetch(BASE + href, os.path.join(RAW, href))
            except Exception as e:  # noqa: BLE001
                print(f"fetch error {name} {href}: {e}")
                time.sleep(3)
                continue
            positions, page_years = parse_positions_2689(h)
            # 実働年の重なりで本人確認
            if positions and years and page_years and not (years & page_years):
                continue
            if positions:
                result[pid] = positions
                resolved = True
                break
        if not resolved:
            misses.append(name)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"resolved: {len(result)} / unresolved: {len(misses)}")
    print("miss例:", misses[:15])


if __name__ == "__main__":
    main()
