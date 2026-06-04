import type { RosterPick, SeasonResult, Slot } from './types'
import { BATTER_SLOTS, RP_SLOTS, SP_SLOTS } from './types'

export const SEASON_GAMES = 143

/**
 * チーム総合力(1-99)→1試合の勝率。実データ分布で較正した非対称ロジスティック:
 * - 全力ドラフト(S≈83) → 約140勝・全勝確率 数%(スピン運+完璧な指名で届く)
 * - 中位ドラフト(S≈50) → 7割前後の勝率帯=並のAクラス争い
 * - わざと弱く(S≈37) → 1桁勝利、0-143も現実圏
 */
export function winProbability(strength: number): number {
  const pivot = 50
  const k = strength >= pivot ? 24 : 9
  return 1 / (1 + Math.pow(10, -(strength - pivot) / k))
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

export function teamStrength(roster: Partial<Record<Slot, RosterPick>>): {
  offense: number
  rotation: number
  bullpen: number
  strength: number
} {
  const ratings = (slots: Slot[]) =>
    slots
      .map((s) => roster[s])
      .filter((p): p is RosterPick => p != null)
      .map((p) => p.player.rating)
  const offense = mean(ratings(BATTER_SLOTS))
  const rotation = mean(ratings(SP_SLOTS))
  const bullpen = mean(ratings(RP_SLOTS))
  const strength = 0.5 * offense + 0.32 * rotation + 0.18 * bullpen
  return { offense, rotation, bullpen, strength }
}

export function simulateSeason(
  roster: Partial<Record<Slot, RosterPick>>,
  rng: () => number = Math.random,
): SeasonResult {
  const { offense, rotation, bullpen, strength } = teamStrength(roster)
  const p = winProbability(strength)
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
    strength,
    offense,
    rotation,
    bullpen,
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
