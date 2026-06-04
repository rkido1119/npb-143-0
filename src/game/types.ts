/** 守備位置(野手) */
export type FieldPosition =
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'LF'
  | 'CF'
  | 'RF'

/** ロースター枠 */
export type Slot =
  | FieldPosition
  | 'DH'
  | 'SP1'
  | 'SP2'
  | 'SP3'
  | 'SP4'
  | 'SP5'
  | 'RP1'
  | 'RP2'
  | 'RP3'

export const FIELD_POSITIONS: FieldPosition[] = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
]

export const BATTER_SLOTS: Slot[] = [...FIELD_POSITIONS, 'DH']
export const SP_SLOTS: Slot[] = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5']
export const RP_SLOTS: Slot[] = ['RP1', 'RP2', 'RP3']
export const ALL_SLOTS: Slot[] = [...BATTER_SLOTS, ...SP_SLOTS, ...RP_SLOTS]

export type PitcherRole = 'SP' | 'RP'

/** タイトル受賞 [タイトル名, 回数] (その球団×年代の在籍中の受賞のみ) */
export type TitleEntry = [string, number]

/** プール内の野手 */
export interface PoolBatter {
  id: string
  name: string
  /** 適格守備位置。DH は全野手が適格 */
  positions: FieldPosition[]
  titles?: TitleEntry[] | null
  /** 在籍年の表示 例: "1959-69" */
  years: string
  g: number
  pa: number
  /** 安打(旧サンプルデータには無い) */
  h?: number
  hr: number
  rbi: number
  sb: number
  avg: number
  ops: number
  /** 年代間補正済みレーティング 1-99 */
  rating: number
}

/** プール内の投手 */
export interface PoolPitcher {
  id: string
  name: string
  roles: PitcherRole[]
  titles?: TitleEntry[] | null
  years: string
  g: number
  w: number
  l: number
  sv: number
  /** ホールド(旧サンプルデータには無い) */
  hld?: number
  ip: number
  so: number
  era: number
  rating: number
}

/** スピン1回で出る「球団 × 年代」の選手プール */
export interface Pool {
  franchiseId: string
  /** 年代の先頭年 例: 1980 → 1980年代 */
  decade: number
  /** 当時の球団名 例: 西鉄ライオンズ */
  teamDisplayName: string
  batters: PoolBatter[]
  pitchers: PoolPitcher[]
}

/** データインデックス(スピナー用メタ) */
export interface PoolMeta {
  franchiseId: string
  decade: number
  teamDisplayName: string
  nBatters: number
  nPitchers: number
}

export interface DataIndex {
  generatedAt?: string
  source: 'sample' | 'npb'
  decades: number[]
  pools: PoolMeta[]
}

/** ドラフトで確定した1枠 */
export interface RosterPick {
  slot: Slot
  player: PoolBatter | PoolPitcher
  kind: 'batter' | 'pitcher'
  franchiseId: string
  decade: number
  teamDisplayName: string
}

export interface SeasonResult {
  wins: number
  losses: number
  /** 1試合あたり勝率 */
  winProb: number
  /** チーム総合力 0-99 */
  strength: number
  offense: number
  rotation: number
  bullpen: number
  /** 最長連勝 */
  longestWinStreak: number
  /** 月別など演出用の勝敗列 */
  games: boolean[]
}
