import type { Roster } from '../game/engine'
import { SLOT_LABELS } from '../game/labels'
import type { Slot } from '../game/types'
import { BATTER_SLOTS, RP_SLOTS, SP_SLOTS } from '../game/types'
import { franchiseColor, FRANCHISES } from '../data/franchiseMeta'
import OvrBadge from './OvrBadge'

interface Props {
  roster: Roster
  /** 直前の指名で埋まった枠(ハイライト用) */
  lastSlot?: Slot | null
  /** OVRバッジを表示するか(玄人モードでは隠す) */
  showOvr?: boolean
}

function SlotRow({
  slot,
  roster,
  last,
  showOvr,
}: {
  slot: Slot
  roster: Roster
  last: boolean
  showOvr: boolean
}) {
  const pick = roster[slot]
  return (
    <li
      className={`flex items-center gap-2 border-b border-ink/15 px-2 py-1.5 text-sm last:border-b-0 ${
        last ? 'bg-shu/10' : ''
      }`}
    >
      <span
        className={`font-mincho w-12 shrink-0 text-center text-xs font-bold ${
          pick ? 'text-ink' : 'text-ink-faint'
        }`}
      >
        {SLOT_LABELS[slot]}
      </span>
      {pick ? (
        <>
          <span
            className="h-3 w-1 shrink-0"
            style={{ background: franchiseColor(pick.franchiseId) }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate font-medium">{pick.player.name}</span>
          <span className="shrink-0 text-[10px] text-ink-faint">
            {FRANCHISES[pick.franchiseId]?.short ?? pick.franchiseId}
            {String(pick.decade).slice(2)}
          </span>
          {showOvr && (
            <OvrBadge
              rating={pick.player.rating}
              size="sm"
              teamColor={franchiseColor(pick.franchiseId)}
            />
          )}
        </>
      ) : (
        <span className="flex-1 text-xs text-ink-faint">— 未指名 —</span>
      )}
    </li>
  )
}

export default function RosterPanel({ roster, lastSlot, showOvr = true }: Props) {
  const filled = Object.values(roster).filter(Boolean).length
  return (
    <aside className="news-box p-3">
      <h2 className="font-mincho flex items-baseline justify-between border-b-2 border-ink pb-1.5 text-base font-bold">
        出場選手登録表
        <span className="font-dot text-xs text-ink-soft tabular-nums">{filled}/17</span>
      </h2>
      <p className="font-mincho mt-2 bg-ink px-2 py-0.5 text-xs font-bold text-paper">打線</p>
      <ul>
        {BATTER_SLOTS.map((s) => (
          <SlotRow key={s} slot={s} roster={roster} last={lastSlot === s} showOvr={showOvr} />
        ))}
      </ul>
      <p className="font-mincho mt-2 bg-ink px-2 py-0.5 text-xs font-bold text-paper">先発</p>
      <ul>
        {SP_SLOTS.map((s) => (
          <SlotRow key={s} slot={s} roster={roster} last={lastSlot === s} showOvr={showOvr} />
        ))}
      </ul>
      <p className="font-mincho mt-2 bg-ink px-2 py-0.5 text-xs font-bold text-paper">救援</p>
      <ul>
        {RP_SLOTS.map((s) => (
          <SlotRow key={s} slot={s} roster={roster} last={lastSlot === s} showOvr={showOvr} />
        ))}
      </ul>
    </aside>
  )
}
