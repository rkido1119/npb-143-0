import { ovrColor, ovrTeamColor, ovrTier } from '../game/ovr'
import { cn } from '../lib/cn'

interface Props {
  rating: number
  size?: 'sm' | 'md' | 'lg'
  /** ラベル「OVR」を上に表示 */
  labeled?: boolean
  /** 球団カラー(指定すると球団色の濃淡で OVR を表す) */
  teamColor?: string
}

const SIZES = {
  sm: 'size-7 text-sm',
  md: 'size-9 text-lg',
  lg: 'size-14 text-3xl',
}

/** 落款印スタイルの OVR バッジ。高いほど色が濃い。90+ は金縁。 */
export default function OvrBadge({ rating, size = 'md', labeled = false, teamColor }: Props) {
  const tier = ovrTier(rating)
  const palette = teamColor
    ? ovrTeamColor(rating, teamColor)
    : { bg: ovrColor(rating), fg: 'var(--color-paper)' }
  return (
    <span className="inline-flex shrink-0 flex-col items-center gap-0.5">
      {labeled && (
        <span className="text-[8px] font-bold tracking-widest text-ink-faint">OVR</span>
      )}
      <span
        className={cn(
          'font-dot flex items-center justify-center tabular-nums',
          SIZES[size],
          tier === 'legend'
            ? 'shadow-[0_0_0_1.5px_#b08d57,1.5px_1.5px_0_1.5px_rgba(26,23,20,.3)]'
            : 'shadow-[1.5px_1.5px_0_rgba(26,23,20,.25)]',
        )}
        style={{ background: palette.bg, color: palette.fg }}
        title={`OVR ${rating}`}
        aria-label={`OVR ${rating}`}
      >
        {rating}
      </span>
    </span>
  )
}
