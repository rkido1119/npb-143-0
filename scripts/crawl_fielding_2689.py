#!/usr/bin/env python3
"""プール野手の年度別・ポジション別守備試合数を 2689web から取得。

主位置(ポジション補正)を「その球団×年代で実際に最も守った位置」で決めるための
データソース。出力: data_raw/fielding_2689.json = {pid: {year: {pos: games}}}

usage: python3 scripts/crawl_fielding_2689.py
"""
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enrich_positions_2689 import BASE, RAW, expand_table, fetch  # noqa: E402
from lxml import html as lhtml  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS = os.path.join(ROOT, "data_raw", "players.jsonl")
TARGETS = os.path.join(ROOT, "data_raw", "fielding_targets.json")
OUT = os.path.join(ROOT, "data_raw", "fielding_2689.json")

POS_COLS = [
    ("捕手", "C"),
    ("一塁手", "1B"),
    ("二塁手", "2B"),
    ("三塁手", "3B"),
    ("遊撃手", "SS"),
    ("外野手", "OF"),  # 外野は左中右の内訳なし
]


# 異体字の正規化(山﨑↔山崎、髙↔高 等の表記揺れを吸収)
KANJI_VARIANTS = str.maketrans("﨑髙濵濱邊邉齋齊嶋桒條眞澤廣國淺",
                               "崎高浜浜辺辺斎斉島桑条真沢広国浅")


def norm(s):
    s = unicodedata.normalize("NFKC", s).translate(KANJI_VARIANTS)
    return re.sub(r"[\s　.．・]", "", s)


def norm_kana(s):
    s = unicodedata.normalize("NFKC", s).translate(KANJI_VARIANTS)
    return re.sub(r"[A-Za-z.\s・･]", "", s)


def parse_fielding(html_text):
    """守備成績テーブル → {year: {pos: games}}"""
    doc = lhtml.fromstring(html_text)
    target = None
    for table in doc.xpath("//table"):
        txt = table.text_content()
        if "守備成績" in txt or ("捕手" in txt and "遊撃手" in txt and "刺殺" in txt):
            target = table
            break
    if target is None:
        return None
    grid = expand_table(target)
    header = sub = None
    for i, row in enumerate(grid[:4]):
        if "捕手" in row and "遊撃手" in row:
            header = i
        elif header is not None and "試合" in row:
            sub = i
            break
    if header is None or sub is None:
        return None
    pos_idx = {}
    for jp, code in POS_COLS:
        if jp in grid[header]:
            pos_idx[code] = grid[header].index(jp)
    out = defaultdict(lambda: defaultdict(int))
    for row in grid[sub + 1 :]:
        if not row:
            continue
        ym = re.match(r"^((?:19|20)\d\d)(?:春|秋)?$", row[0])
        if not ym:
            continue
        y = int(ym.group(1))
        for code, idx in pos_idx.items():
            if idx < len(row) and row[idx].isdigit():
                out[y][code] += int(row[idx])
    return {str(y): dict(v) for y, v in out.items()} or None


def main():
    with open(TARGETS, encoding="utf-8") as f:
        target_ids = set(json.load(f))
    targets = {}
    with open(PLAYERS, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if rec["id"] in target_ids:
                targets[rec["id"]] = (rec["name"], {b["year"] for b in rec["batting"]})
    print(f"targets: {len(targets)}", flush=True)

    # 2689 インデックス(キャッシュ済み)
    name_map = defaultdict(set)
    kana_map = defaultdict(set)
    for fn in os.listdir(RAW):
        if not re.match(r"^\d{2,3}\.html$", fn):
            continue
        with open(os.path.join(RAW, fn), "rb") as f:
            h = f.read().decode("shift_jis", errors="replace")
        for href, label in re.findall(r"<a href='(\d{7}\.html)'[^>]*>([^<]+)</a>", h):
            name_map[norm(label)].add(href)
            kana_map[norm_kana(label)].add(href)

    result = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            result = json.load(f)
    misses = []
    done = 0
    for pid, (name, years) in targets.items():
        done += 1
        if pid in result:
            continue
        cands = sorted(name_map.get(norm(name), []) or kana_map.get(norm_kana(name), []))
        hit = None
        for href in cands:
            try:
                h = fetch(BASE + href, os.path.join(RAW, href))
            except Exception as e:  # noqa: BLE001
                print(f"fetch err {href}: {e}", flush=True)
                continue
            fld = parse_fielding(h)
            if not fld:
                continue
            page_years = {int(y) for y in fld}
            if years <= page_years:
                hit = fld
                break
        if hit:
            result[pid] = hit
        else:
            misses.append(name)
        if done % 100 == 0:
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            print(f"{done}/{len(targets)} resolved={len(result)}", flush=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"done: resolved={len(result)} misses={len(misses)}")
    print("miss例:", misses[:20])


if __name__ == "__main__":
    main()
