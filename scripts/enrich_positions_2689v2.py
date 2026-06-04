#!/usr/bin/env python3
"""残りの守備位置未解決選手を 2689web から「実働年の一致」で特定する強化版。

登録名(ブーマー等)と2689の表記(B.ウェルズ等)が一致しない選手向け。
- 候補 = 入団年(2689ページIDの先頭4桁)が npb.jp の初出場年と一致するページ
- 検証 = NPB実働年集合がほぼ一致(初年・最終年が一致 かつ 被覆率85%以上)
- 一意に検証できた場合のみ採用 → data_raw/positions_2689.json に追記

usage: python3 scripts/enrich_positions_2689v2.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enrich_positions_2689 import BASE, RAW, fetch, parse_positions_2689  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS = os.path.join(ROOT, "data_raw", "players.jsonl")
MISSING = os.path.join(ROOT, "data_raw", "missing_pids.json")
OUT = os.path.join(ROOT, "data_raw", "positions_2689.json")


def main():
    with open(MISSING, encoding="utf-8") as f:
        missing = set(json.load(f))

    targets = {}  # pid -> (name, years)
    with open(PLAYERS, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if rec["id"] in missing:
                years = {b["year"] for b in rec["batting"]}
                targets[rec["id"]] = (rec["name"], years)
    print(f"targets: {len(targets)}")

    # 2689 全選手ページ一覧(キャッシュ済みの五十音ページから)
    hrefs = set()
    for fn in os.listdir(RAW):
        if not re.match(r"^\d+\.html$", fn) or len(fn) > 8:
            continue
        with open(os.path.join(RAW, fn), "rb") as f:
            h = f.read().decode("shift_jis", errors="replace")
        hrefs.update(re.findall(r"href='(\d{7}\.html)'", h))
    print(f"2689 pages known: {len(hrefs)}")

    result = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            result = json.load(f)

    page_cache = {}  # href -> (positions, years)

    def page_info(href):
        if href not in page_cache:
            try:
                h = fetch(BASE + href, os.path.join(RAW, href))
                page_cache[href] = parse_positions_2689(h)
            except Exception as e:  # noqa: BLE001
                print(f"  fetch error {href}: {e}")
                page_cache[href] = (None, set())
        return page_cache[href]

    resolved = 0
    for pid, (name, years) in sorted(targets.items(), key=lambda kv: min(kv[1][1])):
        first, last = min(years), max(years)
        cands = sorted(h for h in hrefs if h.startswith(str(first)))
        validated = []
        for href in cands:
            positions, py = page_info(href)
            npb_py = {y for y in py if y >= first}  # 米マイナー等の前歴は年集合に含まれるが範囲で吸収
            if not py:
                continue
            cover = len(years & py) / len(years)
            if cover >= 0.85 and min(py) <= first and max(py) >= last:
                validated.append((href, positions))
        # 年集合が完全一致に近いものを優先
        if len(validated) > 1:
            exact = [v for v in validated if page_cache[v[0]][1] == years]
            if len(exact) == 1:
                validated = exact
        if len(validated) == 1 and validated[0][1]:
            result[pid] = validated[0][1]
            resolved += 1
            print(f"✓ {name} ({first}-{last}) → {validated[0][0]} {validated[0][1]}")
        else:
            print(f"✗ {name} ({first}-{last}): 候補{len(cands)}件中 検証{len(validated)}件")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"\nresolved: {resolved} / {len(targets)}")


if __name__ == "__main__":
    main()
