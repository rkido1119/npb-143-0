import { cn } from '../lib/cn'
import boxPlain from '../assets/lottery-box.png'
import boxPaper from '../assets/lottery-box-paper.png'

interface Props {
  onClick: () => void
  disabled: boolean
  spinning: boolean
  /** lg はフィールド中央用の大きめ表示 */
  size?: 'md' | 'lg'
}

/**
 * ドラフト会議の抽選箱(イラスト版)。
 * ホバーで「交渉権確定」のくじ紙が出た絵にクロスフェード。
 * 抽選中は箱が揺れる(くじを混ぜている)。
 * 画像は scripts/make_box_assets.py で透過・位置合わせ済み(同一キャンバス)。
 */
export default function LotteryBox({ onClick, disabled, spinning, size = 'md' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="抽選 — くじを引いて球団と年代を決める"
      className="group relative shrink-0 cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className={cn(
          'relative block',
          size === 'lg' ? 'size-44' : 'size-32',
          'drop-shadow-[0_0_14px_rgba(255,250,220,0.4)]',
          'transition-[filter] group-hover:drop-shadow-[0_0_24px_rgba(255,250,220,0.65)]',
          spinning && 'animate-box-shake',
        )}
      >
        <img
          src={boxPlain}
          alt=""
          width={560}
          height={560}
          className={cn(
            'absolute inset-0 size-full transition-opacity duration-200',
            !spinning && 'group-hover:opacity-0',
          )}
        />
        <img
          src={boxPaper}
          alt=""
          width={560}
          height={560}
          className={cn(
            'absolute inset-0 size-full opacity-0 transition-opacity duration-200',
            !spinning && 'group-hover:opacity-100',
          )}
        />
      </span>
      <span
        aria-hidden
        className={cn(
          'font-dot absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] tracking-widest opacity-0 transition-opacity group-hover:opacity-100',
          size === 'lg' ? 'text-ink-faint' : 'text-paper/60',
        )}
      >
        {spinning ? 'MIXING…' : 'CLICK'}
      </span>
    </button>
  )
}
