import { useEffect, useMemo, useRef, useState } from 'react'
import type { Roster } from '../game/engine'
import {
  eligibleSlotsForBatter,
  eligibleSlotsForPitcher,
  loadPool,
  pickedIds,
  poolHasEligiblePlayer,
  spin,
  spinCandidates,
  TOTAL_ROUNDS,
} from '../game/engine'
import { fmtAvg, fmtEra, fmtIp, SLOT_LABELS } from '../game/labels'
import type {
  DataIndex,
  Pool,
  PoolBatter,
  PoolMeta,
  PoolPitcher,
  Slot,
} from '../game/types'
import { BATTER_SLOTS } from '../game/types'
import type { TitleEntry } from '../game/types'
import { franchiseColor } from '../data/franchiseMeta'
import { cn } from '../lib/cn'
import LotteryBox from './LotteryBox'
import OvrBadge from './OvrBadge'
import RosterPanel from './RosterPanel'

/** 行展開時のスロット選択パネル。リスト末尾でも見えるよう自動スクロール */
function SlotPicker({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [])
  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2 bg-paper-deep px-4 pb-3">
      {children}
    </div>
  )
}

/** タイトル受賞チップ(最大3つ+残り冠数) */
function TitleChips({ titles }: { titles?: TitleEntry[] | null }) {
  if (!titles || titles.length === 0) return null
  const shown = titles.slice(0, 3)
  const restCount = titles.slice(3).reduce((sum, [, n]) => sum + n, 0)
  return (
    <>
      {shown.map(([award, n]) => (
        <span
          key={award}
          className="border border-[#b08d57] bg-[#b08d57]/10 px-1 text-[10px] leading-4 font-bold text-[#7a5f33]"
        >
          {award}
          {n > 1 && `×${n}`}
        </span>
      ))}
      {restCount > 0 && (
        <span className="px-0.5 text-[10px] leading-4 font-bold text-[#7a5f33]">
          他{restCount}冠
        </span>
      )}
    </>
  )
}

interface Props {
  index: DataIndex
  selectedDecades: number[]
  hideStats: boolean
  roster: Roster
  onChangeRoster: (r: Roster) => void
  onComplete: () => void
  onAbort: () => void
}

type SpinState = 'idle' | 'spinning' | 'ready'

const SPIN_MS = 1500
const REEL_MS = 90

export default function DraftScreen({
  index,
  selectedDecades,
  hideStats,
  roster,
  onChangeRoster,
  onComplete,
  onAbort,
}: Props) {
  const [spinState, setSpinState] = useState<SpinState>('idle')
  const [meta, setMeta] = useState<PoolMeta | null>(null)
  const [pool, setPool] = useState<Pool | null>(null)
  const [reel, setReel] = useState<{ team: string; decade: string }>({
    team: '？？？？？？',
    decade: '？？？？',
  })
  const [tab, setTab] = useState<'batters' | 'pitchers'>('batters')
  const [query, setQuery] = useState('')
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)
  const [lastSlot, setLastSlot] = useState<Slot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const reelTimer = useRef<number | null>(null)
  const abortDialog = useRef<HTMLDialogElement>(null)

  const filled = Object.values(roster).filter(Boolean).length
  const round = Math.min(filled + 1, TOTAL_ROUNDS)
  const complete = filled >= TOTAL_ROUNDS
  const picked = useMemo(() => pickedIds(roster), [roster])
  const stuck = pool != null && !poolHasEligiblePlayer(pool, roster)

  useEffect(
    () => () => {
      if (reelTimer.current) window.clearInterval(reelTimer.current)
    },
    [],
  )

  const doSpin = () => {
    const chosen = spin(index, selectedDecades, roster)
    if (!chosen) return
    setSpinState('spinning')
    setPool(null)
    setMeta(null)
    setOpenPlayer(null)
    setQuery('')
    setLoadError(null)

    // リール演出: 候補をランダムに高速表示
    const candidates = spinCandidates(index, selectedDecades, roster)
    reelTimer.current = window.setInterval(() => {
      const c = candidates[Math.floor(Math.random() * candidates.length)]
      setReel({ team: c.teamDisplayName, decade: `${c.decade}年代` })
    }, REEL_MS)

    const poolPromise = loadPool(chosen)
    const minWait = new Promise((res) => setTimeout(res, SPIN_MS))
    Promise.all([poolPromise, minWait])
      .then(([p]) => {
        if (reelTimer.current) window.clearInterval(reelTimer.current)
        setReel({ team: chosen.teamDisplayName, decade: `${chosen.decade}年代` })
        setMeta(chosen)
        setPool(p)
        const batterSlotOpen = BATTER_SLOTS.some((s) => roster[s] == null)
        setTab(batterSlotOpen && p.batters.length > 0 ? 'batters' : 'pitchers')
        setSpinState('ready')
      })
      .catch((e) => {
        if (reelTimer.current) window.clearInterval(reelTimer.current)
        setLoadError(String(e))
        setSpinState('idle')
      })
  }

  const handlePick = (
    player: PoolBatter | PoolPitcher,
    kind: 'batter' | 'pitcher',
    slot: Slot,
  ) => {
    if (!meta) return
    onChangeRoster({
      ...roster,
      [slot]: {
        slot,
        player,
        kind,
        franchiseId: meta.franchiseId,
        decade: meta.decade,
        teamDisplayName: meta.teamDisplayName,
      },
    })
    setLastSlot(slot)
    setPool(null)
    setMeta(null)
    setSpinState('idle')
    setReel({ team: '？？？？？？', decade: '？？？？' })
  }

  const color = meta ? franchiseColor(meta.franchiseId) : '#4a4337'

  return (
    <div className="pt-6">
      {/* 上部バー */}
      <div className="flex items-center justify-between">
        <h1 className="font-dot text-2xl">
          143<span className="text-shu">-</span>0
        </h1>
        <div className="flex items-center gap-3">
          <p className="font-mincho text-sm font-bold">
            第<span className="mx-1 text-xl text-shu">{round}</span>巡
            <span className="ml-1 text-xs font-normal text-ink-faint">/ 全{TOTAL_ROUNDS}巡</span>
          </p>
          <button
            type="button"
            onClick={() => {
              // 指名前なら確認なしで戻る
              if (filled === 0) onAbort()
              else abortDialog.current?.showModal()
            }}
            className="cursor-pointer border border-ink/40 px-3 py-1 text-xs text-ink-soft hover:border-ink"
          >
            中断
          </button>
        </div>
      </div>

      {/* 中断確認(ここまでの指名が失われるため) */}
      <dialog
        ref={abortDialog}
        className="news-box m-auto max-w-sm bg-paper p-6 backdrop:bg-ink/45"
      >
        <p className="font-mincho text-balance text-lg font-bold">ドラフトを中断しますか?</p>
        <p className="mt-2 text-pretty text-sm text-ink-soft">
          ここまでの{filled}巡分の指名はすべて失われます。
        </p>
        <form method="dialog" className="mt-5 flex justify-end gap-3">
          <button
            value="cancel"
            className="font-mincho cursor-pointer border border-ink/40 px-4 py-1.5 text-sm font-bold hover:border-ink"
          >
            続ける
          </button>
          <button
            value="confirm"
            onClick={onAbort}
            className="font-mincho cursor-pointer border border-shu-deep bg-shu px-4 py-1.5 text-sm font-bold text-paper"
          >
            中断する
          </button>
        </form>
      </dialog>

      {/* 電光掲示板 + 抽選 */}
      <div className="board mt-4 rounded-md p-4 ring-4 ring-ink/80 ring-offset-2 ring-offset-paper-edge sm:p-5">
        {/* 掲示板上部のランプ列(抽選中のみ点滅) */}
        <div aria-hidden className="mb-3 flex justify-center gap-2 border-b border-board-line pb-2">
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              className={cn(
                'size-1.5 rounded-full',
                spinState === 'spinning' ? 'bg-lamp animate-lamp' : 'bg-lamp/25',
              )}
              style={spinState === 'spinning' ? { animationDelay: `${i * 0.09}s` } : undefined}
            />
          ))}
        </div>
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <div className="grid flex-1 grid-cols-[1fr_auto] gap-3">
            <div className="min-w-0">
              <p className="font-dot text-[10px] tracking-[0.4em] text-lamp">TEAM 球団</p>
              <p
                className={cn(
                  'font-dot mt-1 truncate text-2xl leading-tight sm:text-3xl',
                  spinState === 'spinning' && 'animate-flap',
                )}
              >
                {reel.team}
              </p>
              {/* リール中の高速変化は読み上げず、確定時のみ通知 */}
              <p className="sr-only" aria-live="polite">
                {spinState === 'ready' && meta
                  ? `${meta.teamDisplayName} ${meta.decade}年代 が選ばれました`
                  : ''}
              </p>
            </div>
            <div className="w-32 sm:w-40">
              <p className="font-dot text-[10px] tracking-[0.4em] text-lamp">ERA 年代</p>
              <p
                className={cn(
                  'font-dot mt-1 text-2xl leading-tight tabular-nums sm:text-3xl',
                  spinState === 'spinning' && 'animate-flap',
                )}
              >
                {reel.decade}
              </p>
            </div>
          </div>
        </div>
        {stuck && (
          <div
            role="status"
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-board-line pt-2"
          >
            <p className="font-dot text-sm text-lamp animate-lamp">
              この球団に配置できる選手が残っていない
            </p>
            <button
              type="button"
              onClick={doSpin}
              className="font-mincho cursor-pointer border border-lamp px-4 py-1 text-sm font-bold text-lamp transition-colors hover:bg-lamp hover:text-board"
            >
              再抽選する
            </button>
          </div>
        )}
        {loadError && (
          <p
            role="alert"
            className="font-dot mt-3 border-t border-board-line pt-2 text-sm text-lamp"
          >
            読込失敗: {loadError} — もう一度「抽選」を押してください
          </p>
        )}
      </div>

      {/* 開幕バナー */}
      {complete && (
        <div className="news-box animate-rise mt-6 p-6 text-center">
          <p className="font-mincho text-xl font-bold">十七枠、全て埋まった。</p>
          <button
            type="button"
            onClick={onComplete}
            className="font-mincho mt-4 cursor-pointer border-2 border-shu-deep bg-shu px-12 py-3 text-xl font-bold text-paper shadow-[4px_4px_0_rgba(26,23,20,.35)] transition-[transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            シーズン開幕
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* 選手プール */}
        <div className="min-w-0">
          {!pool && !complete && (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 border-2 border-dashed border-ink/25 py-8 text-center">
              {/* 指名直後にマウスを動かさず次の抽選ができるよう、フィールドにも抽選箱を置く */}
              <LotteryBox
                onClick={doSpin}
                disabled={spinState !== 'idle'}
                spinning={spinState === 'spinning'}
                size="lg"
              />
              <div>
                <p className="font-mincho text-lg font-bold text-ink-soft">
                  {spinState === 'spinning' ? '抽選中…' : '箱をクリックして球団と年代を引け'}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  出た球団のその年代に実在した選手だけが指名できる
                </p>
              </div>
            </div>
          )}

          {pool && meta && (
            <div className="news-box animate-rise overflow-hidden">
              {/* 球団ヘッダ */}
              <div
                className="flex items-center gap-3 px-4 py-3 text-white"
                style={{ background: color }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mincho truncate text-xl font-bold leading-tight">
                    {meta.teamDisplayName}
                  </p>
                  <p className="text-xs opacity-80">
                    {meta.decade}年代 ・ 野手{pool.batters.length}名 / 投手
                    {pool.pitchers.length}名
                  </p>
                </div>
                <p className="font-dot text-3xl opacity-50">{String(meta.decade).slice(2)}s</p>
              </div>

              {/* タブ + 検索 */}
              <div className="flex flex-wrap items-center gap-2 border-b border-ink/20 px-3 py-2">
                {(['batters', 'pitchers'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'font-mincho cursor-pointer px-4 py-1.5 text-sm font-bold transition-colors',
                      tab === t ? 'bg-ink text-paper' : 'text-ink-faint hover:text-ink',
                    )}
                  >
                    {t === 'batters' ? `野手 ${pool.batters.length}` : `投手 ${pool.pitchers.length}`}
                  </button>
                ))}
                <input
                  type="search"
                  name="player-search"
                  aria-label="選手名で検索"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="選手名で検索… 例: 王"
                  className="ml-auto w-44 border border-ink/30 bg-paper px-3 py-1.5 text-sm placeholder:text-ink-faint focus:border-shu"
                />
              </div>

              {/* 列見出し(OVRが背番号と紛れないように明示) */}
              <div className="flex items-center gap-3 border-b border-ink/20 bg-paper-deep/60 px-4 py-1 text-[10px] font-bold tracking-wider text-ink-faint">
                {!hideStats && <span className="w-7 text-center">OVR</span>}
                <span className="flex-1">選手 / 守備</span>
                {!hideStats && <span>年代内通算</span>}
              </div>
              {/* 選手リスト */}
              <ul className="player-scroll max-h-[520px] overflow-y-auto">
                {tab === 'batters'
                  ? sortBatters(pool.batters, hideStats)
                      .filter((b) => b.name.includes(query))
                      .map((b) => (
                        <BatterRow
                          key={b.id}
                          batter={b}
                          hideStats={hideStats}
                          teamColor={color}
                          taken={picked.has(b.id)}
                          eligible={eligibleSlotsForBatter(roster, b)}
                          open={openPlayer === b.id}
                          onToggle={() =>
                            setOpenPlayer(openPlayer === b.id ? null : b.id)
                          }
                          onPick={(slot) => handlePick(b, 'batter', slot)}
                        />
                      ))
                  : sortPitchers(pool.pitchers, hideStats)
                      .filter((p) => p.name.includes(query))
                      .map((p) => (
                        <PitcherRow
                          key={p.id}
                          pitcher={p}
                          hideStats={hideStats}
                          teamColor={color}
                          taken={picked.has(p.id)}
                          eligible={eligibleSlotsForPitcher(roster, p)}
                          open={openPlayer === p.id}
                          onToggle={() =>
                            setOpenPlayer(openPlayer === p.id ? null : p.id)
                          }
                          onPick={(slot) => handlePick(p, 'pitcher', slot)}
                        />
                      ))}
              </ul>
            </div>
          )}
        </div>

        <RosterPanel roster={roster} lastSlot={lastSlot} showOvr={!hideStats} />
      </div>
    </div>
  )
}

function sortBatters(bs: PoolBatter[], hideStats: boolean): PoolBatter[] {
  return [...bs].sort(
    hideStats
      ? (a, b) => a.name.localeCompare(b.name, 'ja')
      : (a, b) => b.rating - a.rating || b.ops - a.ops,
  )
}

function sortPitchers(ps: PoolPitcher[], hideStats: boolean): PoolPitcher[] {
  return [...ps].sort(
    hideStats
      ? (a, b) => a.name.localeCompare(b.name, 'ja')
      : (a, b) => b.rating - a.rating || b.w * 2 + b.sv - (a.w * 2 + a.sv),
  )
}

interface BatterRowProps {
  batter: PoolBatter
  hideStats: boolean
  teamColor: string
  taken: boolean
  eligible: Slot[]
  open: boolean
  onToggle: () => void
  onPick: (slot: Slot) => void
}

function BatterRow({
  batter: b,
  hideStats,
  teamColor,
  taken,
  eligible,
  open,
  onToggle,
  onPick,
}: BatterRowProps) {
  const disabled = taken || eligible.length === 0
  return (
    <li className="border-b border-ink/10 odd:bg-ink/[0.025] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          'flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-paper-deep',
          open && 'bg-paper-deep',
        )}
      >
        {!hideStats && <OvrBadge rating={b.rating} size="sm" teamColor={teamColor} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{b.name}</span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            {b.positions.map((p) => (
              <span
                key={p}
                className="font-mincho border border-ink/30 px-1 text-[10px] leading-4 text-ink-soft"
              >
                {SLOT_LABELS[p]}
              </span>
            ))}
            {b.positions.length === 0 && (
              <span className="font-mincho border border-dashed border-ink/30 px-1 text-[10px] leading-4 text-ink-faint">
                守備位置不詳・指のみ
              </span>
            )}
            <span className="text-[10px] leading-4 text-ink-faint">{b.years}</span>
            {!hideStats && <TitleChips titles={b.titles} />}
          </span>
        </span>
        {!hideStats && (
          <span className="font-dot w-full text-right text-xs leading-5 text-ink-soft tabular-nums sm:w-auto sm:shrink-0 sm:border-l sm:border-ink/15 sm:pl-3">
            {/* 1行目: 試合数・安打数 / 2行目: 主要成績(盗塁は最後) */}
            <span className="block">
              <span className={cn(b.h != null && 'mr-3')}>{b.g}試合</span>
              {b.h != null && <span>{b.h}安</span>}
            </span>
            <span className="block">
              <span className="mr-3">{fmtAvg(b.avg)}</span>
              <span className="mr-3">{b.hr}本</span>
              <span className="mr-3">{b.rbi}点</span>
              <span className="mr-3 text-ink">OPS {b.ops.toFixed(3)}</span>
              <span>{b.sb}盗</span>
            </span>
          </span>
        )}
        {taken && <span className="font-mincho shrink-0 text-xs text-shu">指名済</span>}
        {!taken && eligible.length === 0 && (
          <span className="font-mincho shrink-0 text-xs text-ink-faint">枠なし</span>
        )}
      </button>
      {open && !disabled && (
        <SlotPicker>
          <span className="font-mincho text-xs font-bold text-ink-soft">どこに置く?</span>
          {eligible.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="font-mincho cursor-pointer border border-shu bg-paper px-3 py-1 text-sm font-bold text-shu transition-colors hover:bg-shu hover:text-paper"
            >
              {SLOT_LABELS[s]}
            </button>
          ))}
        </SlotPicker>
      )}
    </li>
  )
}

interface PitcherRowProps {
  pitcher: PoolPitcher
  hideStats: boolean
  teamColor: string
  taken: boolean
  eligible: Slot[]
  open: boolean
  onToggle: () => void
  onPick: (slot: Slot) => void
}

function PitcherRow({
  pitcher: p,
  hideStats,
  teamColor,
  taken,
  eligible,
  open,
  onToggle,
  onPick,
}: PitcherRowProps) {
  const disabled = taken || eligible.length === 0
  // 先発/救援それぞれ最初の空き枠のみ提示
  const spSlot = eligible.find((s) => s.startsWith('SP'))
  const rpSlot = eligible.find((s) => s.startsWith('RP'))
  return (
    <li className="border-b border-ink/10 odd:bg-ink/[0.025] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          'flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-paper-deep',
          open && 'bg-paper-deep',
        )}
      >
        {!hideStats && <OvrBadge rating={p.rating} size="sm" teamColor={teamColor} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.name}</span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            {p.roles.map((r) => (
              <span
                key={r}
                className="font-mincho border border-ink/30 px-1 text-[10px] leading-4 text-ink-soft"
              >
                {r === 'SP' ? '先発' : '救援'}
              </span>
            ))}
            <span className="text-[10px] leading-4 text-ink-faint">{p.years}</span>
            {!hideStats && <TitleChips titles={p.titles} />}
          </span>
        </span>
        {!hideStats && (
          <span className="font-dot w-full text-right text-xs leading-5 text-ink-soft tabular-nums sm:w-auto sm:shrink-0 sm:border-l sm:border-ink/15 sm:pl-3">
            {/* 並び: 登板数 → 主要成績(回/勝敗/防/奪) → S/H */}
            <span className="block">
              <span className="mr-3">{p.g}登板</span>
              <span className="mr-3">{fmtIp(p.ip)}回</span>
              <span>{p.w}勝{p.l}敗</span>
            </span>
            <span className="block">
              <span className="mr-3 text-ink">防 {fmtEra(p.era)}</span>
              <span className={cn((p.sv > 0 || (p.hld ?? 0) > 0) && 'mr-3')}>{p.so}奪</span>
              {p.sv > 0 && <span className={cn((p.hld ?? 0) > 0 && 'mr-3')}>{p.sv}S</span>}
              {(p.hld ?? 0) > 0 && <span>{p.hld}H</span>}
            </span>
          </span>
        )}
        {taken && <span className="font-mincho shrink-0 text-xs text-shu">指名済</span>}
        {!taken && eligible.length === 0 && (
          <span className="font-mincho shrink-0 text-xs text-ink-faint">枠なし</span>
        )}
      </button>
      {open && !disabled && (
        <SlotPicker>
          <span className="font-mincho text-xs font-bold text-ink-soft">どこに置く?</span>
          {spSlot && (
            <button
              type="button"
              onClick={() => onPick(spSlot)}
              className="font-mincho cursor-pointer border border-shu bg-paper px-3 py-1 text-sm font-bold text-shu transition-colors hover:bg-shu hover:text-paper"
            >
              {SLOT_LABELS[spSlot]}
            </button>
          )}
          {rpSlot && (
            <button
              type="button"
              onClick={() => onPick(rpSlot)}
              className="font-mincho cursor-pointer border border-shu bg-paper px-3 py-1 text-sm font-bold text-shu transition-colors hover:bg-shu hover:text-paper"
            >
              {SLOT_LABELS[rpSlot]}
            </button>
          )}
        </SlotPicker>
      )}
    </li>
  )
}
