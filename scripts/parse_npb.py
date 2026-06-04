#!/usr/bin/env python3
"""data_raw/players/*.html を解析して players.jsonl を生成する。

各行: {
  id, name, throws_bats, birth,
  batting:  [{year, team, g, pa, ab, h, tb, hr, rbi, sb, sf, bb, hbp, so}],
  pitching: [{year, team, g, w, l, sv, hld, cg, ip3, so, er}],
}
ip3 = 投球回×3 (1/3回単位の整数)。
"""
import json
import os
import re
import sys

from lxml import html as lhtml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_PLAYERS = os.path.join(ROOT, "data_raw", "players")
OUT = os.path.join(ROOT, "data_raw", "players.jsonl")

FULLSPACE = "　"


def text(el) -> str:
    return re.sub(r"\s+", "", el.text_content() or "")


def to_int(s: str) -> int:
    s = s.strip().replace(",", "")
    if s in ("", "-", "−", "―"):
        return 0
    try:
        return int(s)
    except ValueError:
        return 0


def parse_ip3(td) -> int:
    """投球回セル(nested table: <th>164</th><td>.2</td>)→ 1/3単位整数。"""
    inner = td.xpath('.//table[contains(@class,"table_inning")]')
    if inner:
        th = inner[0].xpath(".//th")
        frac_td = inner[0].xpath(".//td")
        whole = to_int(text(th[0])) if th else 0
        frac_text = text(frac_td[0]) if frac_td else ""
        frac = 0
        if ".1" in frac_text:
            frac = 1
        elif ".2" in frac_text:
            frac = 2
        return whole * 3 + frac
    # nested table がない場合(まれ): "164.2" 形式
    t = text(td)
    m = re.match(r"(\d+)(?:\.(\d))?", t)
    if not m:
        return 0
    return int(m.group(1)) * 3 + (int(m.group(2)) if m.group(2) else 0)


def parse_table(table, kind: str):
    """kind: 'b' or 'p'"""
    rows = []
    headers = None
    for tr in table.xpath(".//tr"):
        # nested table_inning 内の tr は除外(最近接の祖先 table がこの table か確認)
        anc = tr.getparent()
        while anc is not None and anc.tag != "table":
            anc = anc.getparent()
        if anc is not table:
            continue
        ths = tr.findall("th")
        tds = tr.findall("td")
        if ths and not tds:
            hd = [text(th) for th in ths]
            if "年度" in hd:
                headers = hd
            continue
        if not headers or not tds:
            continue
        cells = tds
        if len(cells) != len(headers):
            continue
        d = {}
        for h, td in zip(headers, cells):
            if h == "投球回":
                d[h] = parse_ip3(td)
            else:
                d[h] = text(td)
        # 戦前は "1936春"/"1936秋" の分割シーズン表記(同年に合算する)
        ym = re.match(r"^((?:19|20)\d\d)(?:春|秋)?$", d.get("年度", ""))
        if not ym:
            continue  # 通算行など
        year = ym.group(1)
        team = d.get("所属球団", "").replace(FULLSPACE, "")
        if kind == "b":
            rows.append(
                {
                    "year": int(year),
                    "team": team,
                    "g": to_int(d.get("試合", "")),
                    "pa": to_int(d.get("打席", "")),
                    "ab": to_int(d.get("打数", "")),
                    "h": to_int(d.get("安打", "")),
                    "tb": to_int(d.get("塁打", "")),
                    "hr": to_int(d.get("本塁打", "")),
                    "rbi": to_int(d.get("打点", "")),
                    "sb": to_int(d.get("盗塁", "")),
                    "sf": to_int(d.get("犠飛", "")),
                    "bb": to_int(d.get("四球", "")),
                    "hbp": to_int(d.get("死球", "")),
                    "so": to_int(d.get("三振", "")),
                }
            )
        else:
            rows.append(
                {
                    "year": int(year),
                    "team": team,
                    "g": to_int(d.get("登板", "")),
                    "w": to_int(d.get("勝利", "")),
                    "l": to_int(d.get("敗北", "")),
                    "sv": to_int(d.get("セーブ", "")),
                    "hld": to_int(d.get("H", "")) + to_int(d.get("HP", "")),
                    "cg": to_int(d.get("完投", "")),
                    "ip3": d.get("投球回", 0),
                    "so": to_int(d.get("三振", "")),
                    "er": to_int(d.get("自責点", "")),
                }
            )
    return rows


def parse_player(path: str, pid: str):
    with open(path, encoding="utf-8", errors="replace") as f:
        doc = lhtml.fromstring(f.read())
    title = doc.findtext(".//title") or ""
    m = re.match(r"^(.+?)（", title)
    name = (m.group(1) if m else title.split("|")[0]).replace(FULLSPACE, " ").strip()
    name = re.sub(r"\s+", "", name)

    profile = {}
    for tr in doc.xpath("//table//tr"):
        th, td = tr.findall("th"), tr.findall("td")
        if len(th) == 1 and len(td) == 1 and text(th[0]) in (
            "投打",
            "身長／体重",
            "生年月日",
            "経歴",
            "ドラフト",
        ):
            profile[text(th[0])] = text(td[0])

    batting = []
    pitching = []
    bt = doc.xpath('//table[@id="tablefix_b"]')
    pt = doc.xpath('//table[@id="tablefix_p"]')
    if bt:
        batting = parse_table(bt[0], "b")
    if pt:
        pitching = parse_table(pt[0], "p")

    return {
        "id": pid,
        "name": name,
        "throws_bats": profile.get("投打", ""),
        "birth": profile.get("生年月日", ""),
        "batting": batting,
        "pitching": pitching,
    }


def main():
    files = sorted(f for f in os.listdir(RAW_PLAYERS) if f.endswith(".html"))
    n_b = n_p = 0
    with open(OUT, "w", encoding="utf-8") as out:
        for i, fn in enumerate(files):
            pid = fn[:-5]
            try:
                rec = parse_player(os.path.join(RAW_PLAYERS, fn), pid)
            except Exception as e:  # noqa: BLE001
                print(f"PARSE ERROR {fn}: {e}", file=sys.stderr)
                continue
            if rec["batting"]:
                n_b += 1
            if rec["pitching"]:
                n_p += 1
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            if (i + 1) % 1000 == 0:
                print(f"parsed {i + 1}/{len(files)}", flush=True)
    print(f"done: {len(files)} files, batting={n_b}, pitching={n_p}")


if __name__ == "__main__":
    main()
