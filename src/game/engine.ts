import type {
  DataIndex,
  FieldPosition,
  Pool,
  PoolBatter,
  PoolMeta,
  PoolPitcher,
  RosterPick,
  Slot,
} from './types'
import { ALL_SLOTS, BATTER_SLOTS, RP_SLOTS, SP_SLOTS } from './types'

export const TOTAL_ROUNDS = ALL_SLOTS.length // 17

export type Roster = Partial<Record<Slot, RosterPick>>

/** 野手が配置可能な空き枠(実守備位置 + DH) */
export function eligibleSlotsForBatter(roster: Roster, b: PoolBatter): Slot[] {
  const open = (s: Slot) => roster[s] == null
  const slots: Slot[] = b.positions.filter((p): p is FieldPosition =>
    open(p),
  )
  if (open('DH')) slots.push('DH')
  return slots
}

/** 投手が配置可能な空き枠 */
export function eligibleSlotsForPitcher(roster: Roster, p: PoolPitcher): Slot[] {
  const slots: Slot[] = []
  if (p.roles.includes('SP')) slots.push(...SP_SLOTS.filter((s) => roster[s] == null))
  if (p.roles.includes('RP')) slots.push(...RP_SLOTS.filter((s) => roster[s] == null))
  return slots
}

export function pickedIds(roster: Roster): Set<string> {
  return new Set(
    Object.values(roster)
      .filter((p): p is RosterPick => p != null)
      .map((p) => p.player.id),
  )
}

/** プール内に「未指名かつ配置可能な」選手がいるか */
export function poolHasEligiblePlayer(pool: Pool, roster: Roster): boolean {
  const ids = pickedIds(roster)
  return (
    pool.batters.some(
      (b) => !ids.has(b.id) && eligibleSlotsForBatter(roster, b).length > 0,
    ) ||
    pool.pitchers.some(
      (p) => !ids.has(p.id) && eligibleSlotsForPitcher(roster, p).length > 0,
    )
  )
}

/**
 * スピン候補のプールメタ一覧。
 * 選択年代に属するものに限定。メタ情報だけでは適格判定できないため、
 * 野手枠が残っていれば野手のいるプール、投手枠のみなら投手のいるプールを許可。
 */
export function spinCandidates(
  index: DataIndex,
  selectedDecades: number[],
  roster: Roster,
): PoolMeta[] {
  const batterSlotOpen = BATTER_SLOTS.some((s) => roster[s] == null)
  const pitcherSlotOpen = [...SP_SLOTS, ...RP_SLOTS].some((s) => roster[s] == null)
  return index.pools.filter(
    (m) =>
      selectedDecades.includes(m.decade) &&
      ((batterSlotOpen && m.nBatters > 0) || (pitcherSlotOpen && m.nPitchers > 0)),
  )
}

export function spin(
  index: DataIndex,
  selectedDecades: number[],
  roster: Roster,
  rng: () => number = Math.random,
): PoolMeta | null {
  const candidates = spinCandidates(index, selectedDecades, roster)
  if (candidates.length === 0) return null
  return candidates[Math.floor(rng() * candidates.length)]
}

export async function loadIndex(): Promise<DataIndex> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/index.json`)
  if (!res.ok) throw new Error(`failed to load index: ${res.status}`)
  return res.json()
}

export async function loadPool(meta: PoolMeta): Promise<Pool> {
  const res = await fetch(
    `${import.meta.env.BASE_URL}data/pools/${meta.franchiseId}_${meta.decade}.json`,
  )
  if (!res.ok) throw new Error(`failed to load pool: ${res.status}`)
  return res.json()
}

export function decadeLabel(decade: number): string {
  return `${decade}年代`
}
