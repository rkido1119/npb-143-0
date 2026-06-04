import type { PoolBatter, PoolPitcher, RosterPick, SeasonResult, Slot } from './types'
import { BATTER_SLOTS, RP_SLOTS, SP_SLOTS } from './types'

export const SEASON_GAMES = 143

/**
 * 勝敗は OVR ではなく「成績そのもの」から計算する。
 * - 得点力: 打線9人の平均 OPS+(時代補正済み)→ RS ∝ (OPS+/100)^1.8
 * - 失点力: 先発 ERA+(イニング65%)と救援 ERA+(35%)→ RA ∝ Σ(100/ERA+)
 * - 1試合の勝率: ピタゴラス式 p = (RS/RA)^E / (1 + (RS/RA)^E)
 *   E は「ほぼ完璧なドラフトで全勝が現実圏」になるよう較正したゲーム用指数。
 */
const RUNS_EXP = 1.8
const PYTHAG_E = 2.4
const SP_INNINGS_SHARE = 0.65

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

function batterOpsPlus(p: RosterPick): number {
  const b = p.player as PoolBatter
  return b.opsPlus ?? 100
}

function pitcherEraPlus(p: RosterPick): number {
  const x = p.player as PoolPitcher
  return Math.max(40, x.eraPlus ?? 100)
}

export interface TeamProduction {
  /** 打線の平均OPS+ */
  opsPlus: number
  /** 先発陣の平均ERA+ */
  spEraPlus: number
  /** 救援陣の平均ERA+ */
  rpEraPlus: number
}

export function teamProduction(
  roster: Partial<Record<Slot, RosterPick>>,
): TeamProduction {
  const picks = (slots: Slot[]) =>
    slots.map((s) => roster[s]).filter((p): p is RosterPick => p != null)
  return {
    opsPlus: mean(picks(BATTER_SLOTS).map(batterOpsPlus)),
    spEraPlus: mean(picks(SP_SLOTS).map(pitcherEraPlus)),
    rpEraPlus: mean(picks(RP_SLOTS).map(pitcherEraPlus)),
  }
}

/** 1試合あたりの勝率(成績ベース・ピタゴラス式) */
export function winProbability(prod: TeamProduction): number {
  const rs = Math.pow(Math.max(40, prod.opsPlus) / 100, RUNS_EXP)
  const ra =
    SP_INNINGS_SHARE * (100 / Math.max(40, prod.spEraPlus)) +
    (1 - SP_INNINGS_SHARE) * (100 / Math.max(40, prod.rpEraPlus))
  const ratio = Math.pow(rs / ra, PYTHAG_E)
  return ratio / (1 + ratio)
}

export function simulateSeason(
  roster: Partial<Record<Slot, RosterPick>>,
  rng: () => number = Math.random,
): SeasonResult {
  const prod = teamProduction(roster)
  const p = winProbability(prod)
  const games: boolean[] = []
  let wins = 0
  let streak = 0
  let longestWinStreak = 0
  for (let i = 0; i < SEASON_GAMES; i++) {
    const won = rng() < p
    games.push(won)
    if (won) {
      wins++
      streak++
      longestWinStreak = Math.max(longestWinStreak, streak)
    } else {
      streak = 0
    }
  }
  return {
    wins,
    losses: SEASON_GAMES - wins,
    winProb: p,
    strength: Math.round(p * 100),
    offense: prod.opsPlus,
    rotation: prod.spEraPlus,
    bullpen: prod.rpEraPlus,
    longestWinStreak,
    games,
  }
}

/** 結果に応じた一言評価 */
export function resultVerdict(r: SeasonResult): { title: string; detail: string } {
  if (r.wins === SEASON_GAMES)
    return {
      title: '完全制覇!! 143勝0敗',
      detail: '不滅の全勝シーズン。あなたのドラフトは伝説になった。',
    }
  if (r.wins === 0)
    return {
      title: '全敗…0勝143敗',
      detail: 'ある意味こちらも伝説。逆に狙ってもなかなかできない。',
    }
  if (r.wins >= 135)
    return { title: '歴史的シーズン', detail: 'あと一歩で完全制覇。圧倒的な戦力だった。' }
  if (r.wins >= 116)
    return { title: '球史に残る最強チーム', detail: 'シーズン勝率記録を塗り替える快進撃。' }
  if (r.wins >= 100)
    return { title: 'ぶっちぎりの優勝', detail: '100勝の大台。文句なしのリーグ制覇。' }
  if (r.wins >= 85)
    return { title: '優勝争いの常連', detail: '強い。クライマックスは確実、優勝も十分狙える。' }
  if (r.wins >= 72)
    return { title: '勝率5割の壁', detail: 'Aクラスは見える。だが頂点には何かが足りない。' }
  if (r.wins >= 55)
    return { title: 'Bクラスの定位置', detail: '来季に向けて補強ポイントを整理しよう。' }
  if (r.wins >= 30)
    return { title: '暗黒時代', detail: 'ファンの愛が試されるシーズンとなった。' }
  return { title: '球団史上最悪のシーズン', detail: '身売り話が出てもおかしくない。' }
}
