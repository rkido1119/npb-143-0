#!/usr/bin/env python3
"""players.jsonl → (球団系譜 × 年代) プールJSON 生成。

- 球団名+年度 → franchiseId は src/data/franchises.json の npbNames で解決
- 年代内のリーグ平均と比較した OPS+/ERA+ ベースの 1-99 レーティング付与
- 守備位置は data_raw/positions.json (Wikipedia等から生成) を参照
- 出力: public/data/index.json, public/data/pools/{fid}_{decade}.json

usage: python3 scripts/aggregate_pools.py
"""
import json
import math
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS = os.path.join(ROOT, "data_raw", "players.jsonl")
POSITIONS = os.path.join(ROOT, "data_raw", "positions.json")
TITLES = os.path.join(ROOT, "data_raw", "titles.json")
FRANCHISES = os.path.join(ROOT, "src", "data", "franchises.json")
OUT_DIR = os.path.join(ROOT, "public", "data")

# タイトル表の球団表記 → franchiseId (npbNames で年が合わない表記のフォールバック)
TITLE_TEAM_ALIAS = {
    "巨人": "giants",
    "ヤクルト": "swallows",
    "西武": "lions",
    "ソフトバンク": "hawks",
    "ダイエー": "hawks",
    "日本ハム": "fighters",
    "ロッテ": "marines",
    "オリックス": "orix",
    "楽天": "rakuten",
    "DeNA": "baystars",
    "広島": "carp",
}

# タイトルの OVR 加算(回数分加算、合計は TITLE_BONUS_CAP まで)
TITLE_BONUS = {
    "MVP": 2.0,
    "首位打者": 1.2,
    "本塁打王": 1.2,
    "打点王": 1.2,
    "最多勝": 1.2,
    "最優秀防御率": 1.2,
    "最多奪三振": 1.2,
    "最多安打": 0.8,
    "盗塁王": 0.8,
    "最高出塁率": 0.8,
    "最多セーブ": 0.8,
    "最優秀中継ぎ": 0.8,
    "最高勝率": 0.5,
    "新人王": 0.5,
}
TITLE_BONUS_CAP = 8.0

# タイトルの種別(野手エントリには打撃タイトル、投手エントリには投手タイトルのみ付与。
# MVP・新人王は両方)
BATTING_AWARDS = {"首位打者", "本塁打王", "打点王", "最多安打", "盗塁王", "最高出塁率"}
PITCHING_AWARDS = {"最多勝", "最優秀防御率", "最多奪三振", "最多セーブ", "最優秀中継ぎ", "最高勝率"}

# 表示順(重要なタイトルから)
AWARD_ORDER = [
    "MVP",
    "首位打者",
    "本塁打王",
    "打点王",
    "最多安打",
    "盗塁王",
    "最高出塁率",
    "最多勝",
    "最優秀防御率",
    "最多奪三振",
    "最多セーブ",
    "最優秀中継ぎ",
    "最高勝率",
    "新人王",
]

# ---------- 球団マッピング ----------
with open(FRANCHISES, encoding="utf-8") as f:
    FR = json.load(f)["franchises"]

NAME_MAP = defaultdict(list)  # name -> [(from, to, fid)]
for fr in FR:
    for name, (y0, y1) in fr["npbNames"].items():
        NAME_MAP[name].append((y0, y1, fr["id"]))

NAMES_BY_FID = {fr["id"]: fr["names"] for fr in FR}


def franchise_of(team: str, year: int):
    for y0, y1, fid in NAME_MAP.get(team, []):
        if y0 <= year <= y1:
            return fid
    return None


def decade_of(year: int) -> int:
    return 1930 if year < 1940 else year // 10 * 10


def display_name(fid: str, decade: int) -> str:
    """年代内で最も長く使われた球団名。"""
    y_start, y_end = decade, min(decade + 9, 2025)
    if decade == 1930:
        y_start = 1936
    counts = defaultdict(int)
    for ent in NAMES_BY_FID[fid]:
        lo, hi = max(ent["from"], y_start), min(ent["to"], y_end)
        if lo <= hi:
            counts[ent["name"]] += hi - lo + 1
    if not counts:
        return fid
    return max(counts.items(), key=lambda kv: kv[1])[0]


# ---------- 集計 ----------
def year_span(years) -> str:
    lo, hi = min(years), max(years)
    return str(lo) if lo == hi else f"{lo}-{str(hi)[2:]}"


def main():
    positions = {}
    # 2689web(守備成績ベース)→ Wikipedia → 手動調査 の順でマージ(後勝ち)
    p2689 = os.path.join(ROOT, "data_raw", "positions_2689.json")
    if os.path.exists(p2689):
        with open(p2689, encoding="utf-8") as f:
            positions.update(json.load(f))
    if os.path.exists(POSITIONS):
        with open(POSITIONS, encoding="utf-8") as f:
            positions.update(json.load(f))
    manual = os.path.join(ROOT, "data_raw", "positions_manual.json")
    if os.path.exists(manual):
        with open(manual, encoding="utf-8") as f:
            positions.update(json.load(f))
    # 年度別守備試合数(主位置判定用)。外野はOF一括
    fielding = {}
    f2689 = os.path.join(ROOT, "data_raw", "fielding_2689.json")
    if os.path.exists(f2689):
        with open(f2689, encoding="utf-8") as f:
            fielding = json.load(f)

    bat = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))  # key->pid->stat
    pit = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    bat_seasons = defaultdict(lambda: defaultdict(list))  # key->pid->[年度行]
    pit_seasons = defaultdict(lambda: defaultdict(list))
    bat_years = defaultdict(lambda: defaultdict(set))
    pit_years = defaultdict(lambda: defaultdict(set))
    names = {}
    # タイトル紐付け用: 正規化名 → [(pid, {year: fid})]
    name_index = defaultdict(list)
    unmapped = defaultdict(int)

    with open(PLAYERS, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            pid = rec["id"]
            names[pid] = rec["name"]
            year_fid = {}
            for row in rec["batting"] + rec["pitching"]:
                fid_y = franchise_of(row["team"], row["year"])
                if fid_y:
                    year_fid[row["year"]] = fid_y
            if year_fid:
                name_index[rec["name"].replace(" ", "").replace("　", "")].append(
                    (pid, year_fid)
                )
            for row in rec["batting"]:
                fid = franchise_of(row["team"], row["year"])
                if fid is None:
                    unmapped[(row["team"], row["year"])] += 1
                    continue
                key = (fid, decade_of(row["year"]))
                agg = bat[key][pid]
                for k in ("g", "pa", "ab", "h", "tb", "hr", "rbi", "sb", "sf", "bb", "hbp", "so"):
                    agg[k] += row[k]
                bat_seasons[key][pid].append(row)
                bat_years[key][pid].add(row["year"])
            for row in rec["pitching"]:
                fid = franchise_of(row["team"], row["year"])
                if fid is None:
                    unmapped[(row["team"], row["year"])] += 1
                    continue
                key = (fid, decade_of(row["year"]))
                agg = pit[key][pid]
                for k in ("g", "w", "l", "sv", "hld", "cg", "ip3", "so", "er"):
                    agg[k] += row[k]
                pit_seasons[key][pid].append(row)
                pit_years[key][pid].add(row["year"])

    if unmapped:
        print("== 未マッピング球団 (要 franchises.json 修正) ==")
        for (team, year), n in sorted(unmapped.items()):
            print(f"  {team} {year}: {n}行")

    # ---------- タイトル受賞の紐付け ----------
    # (fid, decade) -> pid -> award -> count
    player_titles = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    unresolved_titles = []
    if os.path.exists(TITLES):
        with open(TITLES, encoding="utf-8") as f:
            titles = json.load(f)
        for t in titles:
            nm = t["name"].replace(" ", "").replace("　", "")
            tfid = franchise_of(t["team"], t["year"]) or TITLE_TEAM_ALIAS.get(t["team"])
            cands = [
                (pid, yf) for pid, yf in name_index.get(nm, []) if t["year"] in yf
            ]
            if not cands:
                # 登録名がタイトル表の本名と異なるケース(例: 鈴木尚 ⊂ 鈴木尚典、
                # Ｒ．ペタジーニ vs ペタジーニ)。イニシャルを除去した上で
                # 前方一致 + 受賞年在籍 + 球団一致(判明時)で安全に解決する。
                nm_s = re.sub(r"^[Ａ-ＺA-Z]．", "", nm)
                fuzzy = []
                for cand_nm, entries in name_index.items():
                    if len(cand_nm) < 3:
                        continue
                    cand_s = re.sub(r"^[Ａ-ＺA-Z]．", "", cand_nm)
                    if not (
                        nm_s == cand_s
                        or nm_s.startswith(cand_s)
                        or cand_s.startswith(nm_s)
                    ):
                        continue
                    for pid, yf in entries:
                        if t["year"] in yf and (tfid is None or yf[t["year"]] == tfid):
                            fuzzy.append((pid, yf))
                if len(fuzzy) == 1:
                    cands = fuzzy
            if len(cands) > 1:
                narrowed = [(pid, yf) for pid, yf in cands if yf[t["year"]] == tfid]
                cands = narrowed or cands
            if not cands:
                unresolved_titles.append(t)
                continue
            pid, yf = cands[0]
            fid = yf[t["year"]]
            player_titles[(fid, decade_of(t["year"]))][pid][t["award"]] += 1
        n_linked = sum(
            c for by_pid in player_titles.values() for aw in by_pid.values() for c in aw.values()
        )
        print(f"titles linked: {n_linked}, unresolved: {len(unresolved_titles)}")
        if unresolved_titles:
            print("  ex:", unresolved_titles[:5])

    def titles_of(key, pid, kind):
        tl = player_titles.get(key, {}).get(pid)
        if not tl:
            return None
        allowed = BATTING_AWARDS if kind == "bat" else PITCHING_AWARDS
        items = [
            (a, n) for a, n in tl.items() if a in allowed or a in ("MVP", "新人王")
        ]
        if not items:
            return None
        order = {a: i for i, a in enumerate(AWARD_ORDER)}
        return sorted(items, key=lambda kv: order.get(kv[0], 99))

    def title_bonus(tl):
        """タイトル受賞による OVR 加算(上限つき)。"""
        if not tl:
            return 0
        total = sum(TITLE_BONUS.get(award, 0.5) * n for award, n in tl)
        return round(min(TITLE_BONUS_CAP, total))

    # ---------- 採用しきい値 ----------
    def bat_ok(decade, a):
        min_pa = 80 if decade <= 1940 else 200
        return a["pa"] >= min_pa and a["ab"] > 0

    def pit_ok(decade, a):
        min_ip3 = 150 if decade <= 1940 else 240
        return a["ip3"] >= min_ip3 or a["g"] >= 80 or a["sv"] >= 15

    # ---------- 年代別リーグ基準 ----------
    lg = {}
    for decade in sorted({k[1] for k in list(bat.keys()) + list(pit.keys())}):
        tot = defaultdict(int)
        for key, players in bat.items():
            if key[1] != decade:
                continue
            for a in players.values():
                if bat_ok(decade, a):
                    for k in ("ab", "h", "tb", "bb", "hbp", "sf"):
                        tot[k] += a[k]
        ptot = defaultdict(int)
        for key, players in pit.items():
            if key[1] != decade:
                continue
            for a in players.values():
                if pit_ok(decade, a):
                    ptot["er"] += a["er"]
                    ptot["ip3"] += a["ip3"]
        ob_den = tot["ab"] + tot["bb"] + tot["hbp"] + tot["sf"]
        lg[decade] = {
            "obp": (tot["h"] + tot["bb"] + tot["hbp"]) / ob_den if ob_den else 0.31,
            "slg": tot["tb"] / tot["ab"] if tot["ab"] else 0.36,
            "era": ptot["er"] * 27 / ptot["ip3"] if ptot["ip3"] else 3.5,
        }
        print(
            f"decade {decade}: lgOBP={lg[decade]['obp']:.3f} "
            f"lgSLG={lg[decade]['slg']:.3f} lgERA={lg[decade]['era']:.2f}"
        )

    # ---------- レーティング ----------
    # 守備負担ポジションの価値補正(主位置、在籍量でスケール)
    POS_ADJ = {"C": 9, "SS": 5, "2B": 4, "CF": 4, "3B": 2}

    def playing_time_w(x):
        """在籍量係数: √と線形のブレンド。短期在籍の率スパイクを抑える。"""
        return (math.sqrt(x) + x) / 2

    def bat_base(ops_plus):
        # スター帯を引き伸ばす非線形カーブ(OPS+140超は加重増)
        return (ops_plus - 100) * 0.55 + max(0.0, ops_plus - 140) * 0.35

    def season_ops_plus(decade, row):
        ob_den = row["ab"] + row["bb"] + row["hbp"] + row["sf"]
        if ob_den <= 0 or row["ab"] <= 0:
            return None
        obp = (row["h"] + row["bb"] + row["hbp"]) / ob_den
        slg = row["tb"] / row["ab"]
        return 100 * (obp / lg[decade]["obp"] + slg / lg[decade]["slg"] - 1)

    def bucket_primary(pid, bucket_years, pos_list):
        """その球団×年代で最も守った位置を主位置に。守備データが無ければ筆頭。"""
        fallback = pos_list[0] if pos_list else None
        fld = fielding.get(pid)
        if not fld:
            return fallback
        games = defaultdict(int)
        for y in bucket_years:
            for pos, g in fld.get(str(y), {}).items():
                games[pos] += g
        if not games:
            return fallback
        top = max(games.items(), key=lambda kv: (kv[1], POS_ADJ.get(kv[0], 0)))[0]
        if top == "OF":
            # 外野は左中右の内訳が無いため、リスト中の外野位置(先頭)を採用
            for pos in pos_list:
                if pos in ("LF", "CF", "RF"):
                    return pos
            return fallback
        return top

    def bat_rating(decade, a, primary_pos=None, seasons=()):
        ob_den = a["ab"] + a["bb"] + a["hbp"] + a["sf"]
        obp = (a["h"] + a["bb"] + a["hbp"]) / ob_den
        slg = a["tb"] / a["ab"]
        ops_plus = 100 * (obp / lg[decade]["obp"] + slg / lg[decade]["slg"] - 1)
        w = playing_time_w(min(a["pa"], 2500) / 2500)
        base_agg = bat_base(ops_plus) * w
        # キャリアハイ: その球団×年代でのベストシーズン(規定相当のみ)
        min_pa, ref_pa = (120, 150) if decade <= 1940 else (350, 450)
        peak = 0.0
        for row in seasons:
            if row["pa"] < min_pa:
                continue
            op = season_ops_plus(decade, row)
            if op is None:
                continue
            peak = max(peak, bat_base(op) * min(1.0, row["pa"] / ref_pa))
        # キャリアハイボーナス: ベストシーズンが年代通算評価を超える分(上限+12)
        score = base_agg + min(12.0, 0.35 * max(0.0, peak - base_agg))
        sb_bonus = min(5, a["sb"] / 60)
        pos_adj = POS_ADJ.get(primary_pos, 0) * w
        return max(1, min(99, round(50 + score + sb_bonus + pos_adj)))

    def pit_base(era_plus, rp_only):
        b = (era_plus - 100) * 0.85 + max(0.0, era_plus - 135) * 0.35
        # リリーフ専業は1イニングの重みを割引(先発の負荷との等価性確保)
        return b * (0.75 if rp_only else 1.0)

    def pit_rating(decade, a, roles, seasons=()):
        rp_only = "SP" not in roles
        # リリーフのERAは出場形態の利得を含むため上限を設ける(専業はさらに厳しめ)
        ep_cap = 185.0 if rp_only else 200.0
        era = a["er"] * 27 / a["ip3"] if a["ip3"] else 9.9
        era_plus = min(ep_cap, 100 * lg[decade]["era"] / max(era, 0.8))
        w = playing_time_w(min(a["ip3"], 3600) / 3600)
        base_agg = pit_base(era_plus, rp_only) * w
        # キャリアハイ: ベストシーズン(先発80回/救援50回以上、130回でフル評価)
        min_ip3 = 180 if decade <= 1940 else (150 if rp_only else 240)
        peak = 0.0
        for row in seasons:
            if row["ip3"] < min_ip3:
                continue
            era_s = row["er"] * 27 / row["ip3"]
            ep_s = min(ep_cap, 100 * lg[decade]["era"] / max(era_s, 0.8))
            peak = max(peak, pit_base(ep_s, rp_only) * min(1.0, row["ip3"] / 390))
        # キャリアハイボーナス: ベストシーズンが年代通算評価を超える分(上限+12)
        score = base_agg + min(12.0, 0.35 * max(0.0, peak - base_agg))
        vol = min(8, a["ip3"] / 1200)
        svb = min(6, (a["sv"] + a["hld"] * 0.5) / 35)
        return max(1, min(99, round(50 + score + vol + svb)))

    def pit_roles(a):
        ip_per_g = a["ip3"] / 3 / a["g"] if a["g"] else 0
        roles = []
        if a["cg"] >= 3 or ip_per_g >= 3.7:
            roles.append("SP")
        if (a["g"] >= 25 and ip_per_g < 4.5) or a["sv"] >= 5 or a["hld"] >= 5:
            roles.append("RP")
        return roles or ["SP"]

    # ---------- プール出力 ----------
    os.makedirs(os.path.join(OUT_DIR, "pools"), exist_ok=True)
    index_pools = []
    all_keys = sorted(set(bat.keys()) | set(pit.keys()))
    for key in all_keys:
        fid, decade = key
        lg_ops = lg[decade]["obp"] + lg[decade]["slg"]
        batters = []
        for pid, a in bat[key].items():
            if not bat_ok(decade, a):
                continue
            # 投手の打撃成績は除外(同年代同球団で投手としても登板がある場合、
            # 打者として十分な量と質がない限り野手プールに入れない)
            if pid in pit[key] and pit[key][pid]["ip3"] >= 300:
                ob_den_t = a["ab"] + a["bb"] + a["hbp"] + a["sf"]
                ops_t = (a["h"] + a["bb"] + a["hbp"]) / ob_den_t + a["tb"] / a["ab"]
                if a["pa"] < 350 or ops_t < lg_ops:
                    continue
            ob_den = a["ab"] + a["bb"] + a["hbp"] + a["sf"]
            obp = (a["h"] + a["bb"] + a["hbp"]) / ob_den
            slg = a["tb"] / a["ab"]
            tl = titles_of(key, pid, "bat")
            pos_list = positions.get(pid, [])
            batters.append(
                {
                    "id": pid,
                    "name": names[pid],
                    "positions": pos_list,
                    "titles": tl,
                    "years": year_span(bat_years[key][pid]),
                    "g": a["g"],
                    "pa": a["pa"],
                    "h": a["h"],
                    "hr": a["hr"],
                    "rbi": a["rbi"],
                    "sb": a["sb"],
                    "avg": round(a["h"] / a["ab"], 3),
                    "ops": round(obp + slg, 3),
                    "opsPlus": max(40, min(250, round(
                        100 * (obp / lg[decade]["obp"] + slg / lg[decade]["slg"] - 1)
                    ))),
                    "rating": min(
                        99,
                        bat_rating(
                            decade,
                            a,
                            bucket_primary(pid, bat_years[key][pid], pos_list),
                            bat_seasons[key][pid],
                        )
                        + title_bonus(tl),
                    ),
                }
            )
        pitchers = []
        for pid, a in pit[key].items():
            if not pit_ok(decade, a):
                continue
            tl = titles_of(key, pid, "pit")
            roles = pit_roles(a)
            pitchers.append(
                {
                    "id": pid,
                    "name": names[pid],
                    "roles": roles,
                    "titles": tl,
                    "years": year_span(pit_years[key][pid]),
                    "g": a["g"],
                    "w": a["w"],
                    "l": a["l"],
                    "sv": a["sv"],
                    "hld": a["hld"],
                    "ip": round(a["ip3"] / 3),
                    "so": a["so"],
                    "era": round(a["er"] * 27 / a["ip3"], 2) if a["ip3"] else 9.99,
                    "eraPlus": max(40, min(250, round(
                        100 * lg[decade]["era"] / max(a["er"] * 27 / a["ip3"], 0.8)
                    ))) if a["ip3"] else 40,
                    "rating": min(
                        99,
                        pit_rating(decade, a, roles, pit_seasons[key][pid])
                        + title_bonus(tl),
                    ),
                }
            )
        # 上位に絞る(在籍量ベース)
        batters.sort(key=lambda b: -b["pa"])
        batters = batters[:40]
        pitchers.sort(key=lambda p: -(p["ip"] + p["g"]))
        pitchers = pitchers[:28]
        # 表示は質順
        batters.sort(key=lambda b: -b["ops"])
        pitchers.sort(key=lambda p: -(p["w"] * 2 + p["sv"]))

        min_b, min_p = (8, 4) if decade <= 1940 else (10, 6)
        if len(batters) < min_b or len(pitchers) < min_p:
            print(f"skip {fid}_{decade}: batters={len(batters)} pitchers={len(pitchers)}")
            continue

        pool = {
            "franchiseId": fid,
            "decade": decade,
            "teamDisplayName": display_name(fid, decade),
            "batters": batters,
            "pitchers": pitchers,
        }
        with open(
            os.path.join(OUT_DIR, "pools", f"{fid}_{decade}.json"), "w", encoding="utf-8"
        ) as f:
            json.dump(pool, f, ensure_ascii=False, separators=(",", ":"))
        index_pools.append(
            {
                "franchiseId": fid,
                "decade": decade,
                "teamDisplayName": pool["teamDisplayName"],
                "nBatters": len(batters),
                "nPitchers": len(pitchers),
            }
        )

    decades = sorted({p["decade"] for p in index_pools})
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(
            {"source": "npb", "decades": decades, "pools": index_pools},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    print(f"\nwrote {len(index_pools)} pools, decades={decades}")
    # 主要選手のレーティング検算
    checks = ["王貞治", "福本豊", "山田久志", "イチロー", "落合博満", "金田正一", "沢村栄治"]
    by_name = defaultdict(list)
    for p in index_pools:
        path = os.path.join(OUT_DIR, "pools", f"{p['franchiseId']}_{p['decade']}.json")
        with open(path, encoding="utf-8") as f:
            pool = json.load(f)
        for b in pool["batters"]:
            if b["name"] in checks:
                by_name[b["name"]].append((p["franchiseId"], p["decade"], "bat", b["rating"], b["ops"]))
        for q in pool["pitchers"]:
            if q["name"] in checks:
                by_name[q["name"]].append((p["franchiseId"], p["decade"], "pit", q["rating"], q["era"]))
    for n, rows in by_name.items():
        print(n, rows)


if __name__ == "__main__":
    main()
