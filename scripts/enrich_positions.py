#!/usr/bin/env python3
"""ja.wikipedia の Infobox から野手の守備位置を取得し data_raw/positions.json を生成。

- 対象: players.jsonl のうち通算打席が一定以上ある選手(野手プール入り候補)
- 50タイトル/リクエストのバッチ取得 + リダイレクト追従
- 生年月日({{生年月日と年齢|Y|M|D}})が npb.jp と一致するか確認(あれば)
- 不一致/曖昧さ回避/未存在 → 「{名前} (野球)」で個別リトライ
- 途中経過は data_raw/positions_cache.json に保存(レジューム可)

usage: python3 scripts/enrich_positions.py
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS = os.path.join(ROOT, "data_raw", "players.jsonl")
CACHE = os.path.join(ROOT, "data_raw", "positions_cache.json")
OUT = os.path.join(ROOT, "data_raw", "positions.json")
API = "https://ja.wikipedia.org/w/api.php"
UA = "npb-143-0-research/0.1 (personal hobby project; contact: github.com/rkido1119)"

POS_MAP = [
    ("捕手", ["C"]),
    ("一塁手", ["1B"]),
    ("二塁手", ["2B"]),
    ("三塁手", ["3B"]),
    ("遊撃手", ["SS"]),
    ("左翼手", ["LF"]),
    ("中堅手", ["CF"]),
    ("右翼手", ["RF"]),
    ("外野手", ["LF", "CF", "RF"]),
    ("内野手", ["1B", "2B", "3B", "SS"]),
]


def api_get(params: dict) -> dict:
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{API}?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def parse_positions(wikitext: str):
    m = re.search(r"\|\s*(?:守備位置|ポジション)\s*=\s*(.+)", wikitext)
    if not m:
        return None
    line = m.group(1)
    found = []
    for word, codes in POS_MAP:
        if word in line:
            for c in codes:
                if c not in found:
                    found.append(c)
    return found or None


def parse_birth(wikitext: str):
    m = re.search(r"\{\{生年月日と年齢2?\|(\d+)\|(\d+)\|(\d+)", wikitext)
    if not m:
        m = re.search(r"\{\{死亡年月日と没年齢\|(\d+)\|(\d+)\|(\d+)", wikitext)
    if not m:
        # 平文/リンク形式: |生年月日 = [[1946年]][[5月20日]] など
        m2 = re.search(r"\|\s*生年月日\s*=\s*([^\n]+)", wikitext)
        if m2:
            m = re.search(r"(\d{4})年[^\d]{0,4}(\d{1,2})月[^\d]{0,4}(\d{1,2})日", m2.group(1))
    if not m:
        return None
    return f"{int(m.group(1))}年{int(m.group(2))}月{int(m.group(3))}日"


def birth_year(birth):
    if not birth:
        return None
    m = re.match(r"(\d{4})年", birth)
    return m.group(1) if m else None


def is_baseball_page(wikitext: str) -> bool:
    head = wikitext[:3000]
    return "野球選手" in head or "守備位置" in head or "ポジション" in head


def fetch_batch(titles):
    """titles → {title: wikitext} (redirects解決済みの正規化マップ付き)"""
    data = api_get(
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "redirects": "1",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": "|".join(titles),
        }
    )
    q = data.get("query", {})
    norm = {}
    for n in q.get("normalized", []) + q.get("redirects", []):
        norm[n["from"]] = n["to"]
    resolved = {}
    for t in titles:
        x = t
        while x in norm:
            x = norm[x]
        resolved[t] = x
    pages = {}
    for page in q.get("pages", []):
        if "missing" in page and page.get("missing"):
            continue
        revs = page.get("revisions")
        if not revs:
            continue
        pages[page["title"]] = revs[0]["slots"]["main"]["content"]
    return {t: pages.get(resolved[t]) for t in titles}


def main():
    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)

    targets = []  # (pid, name, birth)
    with open(PLAYERS, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            pa = sum(r["pa"] for r in rec["batting"])
            min_pa = 80 if (rec["batting"] and rec["batting"][0]["year"] < 1950) else 200
            if pa >= min_pa:
                targets.append((rec["id"], rec["name"], rec["birth"]))
    print(f"targets: {len(targets)}")

    todo = [t for t in targets if t[0] not in cache]
    # ---- pass 1: バッチ取得 ----
    for i in range(0, len(todo), 50):
        chunk = todo[i : i + 50]
        try:
            pages = fetch_batch([name for _, name, _ in chunk])
        except Exception as e:  # noqa: BLE001
            print(f"batch error at {i}: {e}")
            time.sleep(5)
            continue
        for pid, name, birth in chunk:
            wt = pages.get(name)
            entry = {"status": "missing", "positions": None}
            if wt:
                if "曖昧さ回避" in wt[:2000] or re.search(r"\{\{[Aa]img", wt[:500]):
                    entry = {"status": "disambig", "positions": None}
                elif is_baseball_page(wt):
                    wiki_birth = parse_birth(wt)
                    pos = parse_positions(wt)
                    if wiki_birth and birth and wiki_birth != birth:
                        entry = {"status": "birth_mismatch", "positions": None}
                    elif pos:
                        entry = {"status": "ok", "positions": pos}
                    else:
                        entry = {"status": "no_pos", "positions": None}
                else:
                    entry = {"status": "not_baseball", "positions": None}
            cache[pid] = entry
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
        if (i // 50) % 10 == 0:
            ok = sum(1 for v in cache.values() if v["status"] == "ok")
            print(f"pass1 {i + len(chunk)}/{len(todo)} ok={ok}", flush=True)
        time.sleep(0.5)

    # ---- pass 2: 失敗分を「{名前} (野球)」等で個別リトライ ----
    retry = [
        (pid, name, birth)
        for pid, name, birth in targets
        if cache.get(pid, {}).get("status") in ("missing", "disambig", "birth_mismatch", "not_baseball")
    ]
    print(f"pass2 retry: {len(retry)}")
    for j, (pid, name, birth) in enumerate(retry):
        found = False
        for title in (f"{name} (野球)", f"{name} (野球選手)", f"{name} (内野手)", f"{name} (外野手)", f"{name} (捕手)"):
            try:
                pages = fetch_batch([title])
            except Exception:  # noqa: BLE001
                time.sleep(3)
                continue
            wt = pages.get(title)
            if not wt or not is_baseball_page(wt):
                continue
            wiki_birth = parse_birth(wt)
            if wiki_birth and birth and wiki_birth != birth:
                continue
            pos = parse_positions(wt)
            if pos:
                cache[pid] = {"status": "ok2", "positions": pos}
                found = True
                break
        if not found:
            cache[pid] = {"status": "unresolved", "positions": None}
        if j % 50 == 0:
            with open(CACHE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False)
            print(f"pass2 {j}/{len(retry)}", flush=True)
        time.sleep(0.3)

    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)

    # ---- pass 3: 検索APIで解決 ----
    # 対象: 外国人(「Ｊ．ライトル」形式)と登録名がWikipedia記事名と異なる選手
    # (例: 登録名「鈴木尚」→ 記事「鈴木尚典」)。生年月日一致を必須にして誤マッチを防ぐ。
    retry3 = [
        (pid, name, birth)
        for pid, name, birth in targets
        if cache.get(pid, {}).get("status")
        in ("missing", "unresolved", "unresolved3", "disambig", "birth_mismatch", "no_pos")
    ]
    print(f"pass3 search: {len(retry3)}")
    for j, (pid, name, birth) in enumerate(retry3):
        # 「Ｊ．ライトル」→「ライトル」(イニシャルと全角ドットを除去)
        kana = re.sub(r"^[Ａ-ＺA-Z]．", "", name)
        try:
            # intitle 検索(短い姓でも記事名に強い) + 通常検索の両方から候補を集める
            titles = []
            for q in (f"intitle:{kana}", f"{kana} プロ野球選手"):
                data = api_get(
                    {
                        "action": "query",
                        "format": "json",
                        "formatversion": "2",
                        "list": "search",
                        "srsearch": q,
                        "srlimit": "8",
                    }
                )
                for r_ in data.get("query", {}).get("search", []):
                    if r_["title"] not in titles:
                        titles.append(r_["title"])
            found = False
            for title in titles:
                pages = fetch_batch([title])
                wt = pages.get(title)
                if not wt or not is_baseball_page(wt):
                    continue
                wiki_birth = parse_birth(wt)
                pos = parse_positions(wt)
                if not pos:
                    continue
                # 採用条件:
                #  a) 名前が記事名に含まれる + 生年「年」一致(出典間の日付ズレ許容)
                #  b) 名前不一致でも生年月日が完全一致(登録名が別名のケース)
                name_hit = kana in title.replace("・", "").replace(" ", "") or kana in title
                year_ok = (
                    wiki_birth and birth and birth_year(wiki_birth) == birth_year(birth)
                )
                exact_ok = wiki_birth and birth and wiki_birth == birth
                if (name_hit and year_ok) or exact_ok:
                    cache[pid] = {"status": "ok3", "positions": pos}
                    found = True
                    break
            if not found:
                cache[pid] = {"status": "unresolved3", "positions": None}
        except Exception as e:  # noqa: BLE001
            print(f"pass3 error {name}: {e}")
            time.sleep(3)
        if j % 25 == 0:
            with open(CACHE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False)
            print(f"pass3 {j}/{len(retry3)}", flush=True)
        time.sleep(0.4)

    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)

    positions = {
        pid: v["positions"] for pid, v in cache.items() if v.get("positions")
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(positions, f, ensure_ascii=False)
    stats = {}
    for v in cache.values():
        stats[v["status"]] = stats.get(v["status"], 0) + 1
    print("status:", stats)
    print(f"wrote positions for {len(positions)} players → {OUT}")


if __name__ == "__main__":
    main()
