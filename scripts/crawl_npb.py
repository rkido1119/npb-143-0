#!/usr/bin/env python3
"""npb.jp 個人年度別成績クローラ。

五十音インデックス → 全選手の個別ページHTMLを data_raw/ にキャッシュする。
レート制限つき・レジューム可能(既存ファイルはスキップ)。

usage: python3 scripts/crawl_npb.py
"""
import os
import re
import sys
import time
import urllib.request

BASE = "https://npb.jp"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_INDEX = os.path.join(ROOT, "data_raw", "index")
RAW_PLAYERS = os.path.join(ROOT, "data_raw", "players")
UA = "npb-143-0-research/0.1 (personal hobby project; contact: github.com/rkido1119)"
DELAY = 0.4  # seconds between requests
TIMEOUT = 30


def fetch(url: str, dest: str) -> bool:
    """Download url to dest unless cached. Returns True if a request was made."""
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return False
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = r.read()
            tmp = dest + ".tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, dest)
            time.sleep(DELAY)
            return True
        except Exception as e:  # noqa: BLE001
            print(f"[retry {attempt}] {url}: {e}", flush=True)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed after retries: {url}")


def main() -> None:
    os.makedirs(RAW_INDEX, exist_ok=True)
    os.makedirs(RAW_PLAYERS, exist_ok=True)

    # 1) トップインデックス → 五十音ページ名を列挙
    top = os.path.join(RAW_INDEX, "index.html")
    fetch(f"{BASE}/bis/players/all/index.html", top)
    html = open(top, encoding="utf-8", errors="replace").read()
    kana_pages = sorted(set(re.findall(r"index_[a-z]+\.html", html)))
    print(f"kana pages: {len(kana_pages)}", flush=True)

    # 2) 各五十音ページ → 選手ID列挙
    player_ids = set()
    for page in kana_pages:
        dest = os.path.join(RAW_INDEX, page)
        fetch(f"{BASE}/bis/players/all/{page}", dest)
        h = open(dest, encoding="utf-8", errors="replace").read()
        ids = re.findall(r"/bis/players/(\d+)\.html", h)
        player_ids.update(ids)
    player_ids = sorted(player_ids)
    print(f"total players: {len(player_ids)}", flush=True)

    # 3) 選手個別ページ
    done = 0
    fetched = 0
    start = time.time()
    for pid in player_ids:
        dest = os.path.join(RAW_PLAYERS, f"{pid}.html")
        if fetch(f"{BASE}/bis/players/{pid}.html", dest):
            fetched += 1
        done += 1
        if done % 100 == 0:
            elapsed = time.time() - start
            print(
                f"progress {done}/{len(player_ids)} (fetched {fetched}) "
                f"elapsed {elapsed/60:.1f}min",
                flush=True,
            )
    print(f"DONE: {done} players ({fetched} newly fetched)", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(line_buffering=True)
    main()
