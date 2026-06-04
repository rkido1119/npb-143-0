#!/usr/bin/env python3
"""実データプールでドラフトを大量試行し、チーム総合力の分布から
勝率カーブ(ロジスティック定数)の妥当性を確認する。

戦略:
- best:   毎巡、配置可能な選手のうち最高レートを指名(上手いプレイヤー)
- median: 中央値付近を指名(普通)
- worst:  最低レートを指名(わざと負けにいく)

usage: python3 scripts/calibrate_sim.py
"""
import json
import math
import os
import random
from glob import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POOL_DIR = os.path.join(ROOT, "public", "data", "pools")

BATTER_SLOTS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"]
SP_SLOTS = ["SP1", "SP2", "SP3", "SP4", "SP5"]
RP_SLOTS = ["RP1", "RP2", "RP3"]

pools = []
for path in glob(os.path.join(POOL_DIR, "*.json")):
    with open(path, encoding="utf-8") as f:
        pools.append(json.load(f))
print(f"pools: {len(pools)}")


def eligible_slots_batter(roster, b):
    slots = [p for p in b["positions"] if p not in roster]
    if "DH" not in roster:
        slots.append("DH")
    return slots


def eligible_slots_pitcher(roster, p):
    slots = []
    if "SP" in p["roles"]:
        slots += [s for s in SP_SLOTS if s not in roster]
    if "RP" in p["roles"]:
        slots += [s for s in RP_SLOTS if s not in roster]
    return slots


def draft(strategy: str, rng: random.Random):
    roster = {}
    picked = set()
    while len(roster) < 17:
        pool = rng.choice(pools)
        cands = []
        for b in pool["batters"]:
            if b["id"] in picked:
                continue
            slots = eligible_slots_batter(roster, b)
            if slots:
                cands.append((b.get("opsPlus", 100), b["id"], slots, "bat"))
        for p in pool["pitchers"]:
            if p["id"] in picked:
                continue
            slots = eligible_slots_pitcher(roster, p)
            if slots:
                cands.append((p.get("eraPlus", 100), p["id"], slots, "pit"))
        if not cands:
            continue  # 再抽選
        cands.sort(key=lambda c: c[0])
        if strategy == "best":
            rating, pid, slots, _ = cands[-1]
        elif strategy == "worst":
            rating, pid, slots, _ = cands[0]
        else:
            rating, pid, slots, _ = cands[len(cands) // 2]
        slot = slots[0]
        roster[slot] = rating
        picked.add(pid)
    off = sum(roster[s] for s in BATTER_SLOTS) / 9
    rot = sum(roster[s] for s in SP_SLOTS) / 5
    pen = sum(roster[s] for s in RP_SLOTS) / 3
    return (off, rot, pen)


def win_prob(prod, E=2.4):
    """成績ベース(sim.ts と同一のピタゴラス式)"""
    ops, sp, rp = prod
    rs = (max(40, ops) / 100) ** 1.8
    ra = 0.65 * 100 / max(40, sp) + 0.35 * 100 / max(40, rp)
    r = (rs / ra) ** E
    return r / (1 + r)


def main():
    rng = random.Random(143)
    for strategy in ("best", "median", "worst"):
        strengths = sorted([win_prob(draft(strategy, rng)) for _ in range(300)])
        s_lo, s_md, s_hi = (
            strengths[14],
            strengths[150],
            strengths[284],
        )  # 5/50/95パーセンタイル
        for label, p in (("p05", s_lo), ("p50", s_md), ("p95", s_hi)):
            ew = p * 143
            p143 = p**143
            p0 = (1 - p) ** 143
            print(
                f"{strategy:6s} {label}: p={p:.4f} 期待勝利={ew:6.1f} "
                f"P(143-0)={p143:.3f} P(0-143)={p0:.3f}"
            )
        print()


if __name__ == "__main__":
    main()
