import { useMemo, useState } from 'react'
import type { Roster } from '../game/engine'
import { SLOT_LABELS } from '../game/labels'
import { resultVerdict, SEASON_GAMES, simulateSeason } from '../game/sim'
import type { RosterPick, SeasonResult, Slot } from '../game/types'
import { ALL_SLOTS, BATTER_SLOTS } from '../game/types'
import { franchiseColor, FRANCHISES } from '../data/franchiseMeta'
import { cn } from '../lib/cn'
import OvrBadge from './OvrBadge'

interface Props {
  roster: Roster
  onReset: () => void
}

const WAREKI = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {
  era: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/** シーズンを一面記事に仕立てる */
function leadArticle(roster: Roster, result: SeasonResult): string[] {
  const picks = Object.values(roster).filter((p): p is RosterPick => p != null)
  const byRating = (a: RosterPick, b: RosterPick) => b.player.rating - a.player.rating
  const batters = picks
    .filter((p) => (BATTER_SLOTS as Slot[]).includes(p.slot))
    .sort(byRating)
  const pitchers = picks
    .filter((p) => !(BATTER_SLOTS as Slot[]).includes(p.slot))
    .sort(byRating)
  const slugger = batters[0]
  const ace = pitchers[0]

  const opening =
    result.wins === SEASON_GAMES
      ? 'ついに球史が書き換わった。負けなしの百四十三勝──開幕からただの一度も土を踏まぬまま、全時代選抜軍がシーズンを完走した。'
      : result.wins === 0
        ? '記録は記録である。全時代選抜軍、百四十三連敗。九十年の球史から十七人を集めてなお一勝も挙げられぬという奇跡を、我々は目撃した。'
        : `九十年の球史から十七人を選び抜いた全時代選抜軍は、百四十三試合を${result.wins}勝${result.losses}敗で走り抜けた。`

  const middle =
    slugger && ace
      ? `打の主役は${slugger.player.name}(${slugger.teamDisplayName}・${slugger.decade}年代)。マウンドの軸は${ace.player.name}(${ace.teamDisplayName}・${ace.decade}年代)が担った。圧巻は${result.longestWinStreak}連勝──スタンドの歓声は鳴り止まなかった。`
      : `最長${result.longestWinStreak}連勝を記録した。`

  const closing =
    result.wins >= 120
      ? 'もはや敵は、歴史の中にしかいない。'
      : result.wins >= 100
        ? '街は今夜、優勝パレードの話で持ちきりである。'
        : result.wins >= 72
          ? '頂はまだ遠い。だが補強の方向は、もう見えている。'
          : '再建は、まだ始まったばかりである。'

  return [opening, middle, closing]
}

function stampWord(wins: number): string {
  if (wins === SEASON_GAMES) return '全勝'
  if (wins === 0) return '全敗'
  if (wins >= 135) return '圧巻'
  if (wins >= 116) return '最強'
  if (wins >= 100) return '優勝'
  if (wins >= 85) return '甲級'
  if (wins >= 72) return '五割'
  if (wins >= 55) return '乙級'
  if (wins >= 30) return '暗黒'
  return '解体'
}

export default function ResultScreen({ roster, onReset }: Props) {
  const [simCount, setSimCount] = useState(0)
  // simCount を変えると再シミュレート
  // eslint-disable-next-line react-hooks/exhaustive-deps -- simCount は再抽選トリガー
  const result = useMemo(() => simulateSeason(roster), [roster, simCount])
  const verdict = resultVerdict(result)
  const [copied, setCopied] = useState(false)

  const pct = result.wins / SEASON_GAMES
  const pctText = pct.toFixed(3).replace(/^0/, '')

  const GAME_URL = 'https://rkido1119.github.io/npb-143-0/'
  const shareText = [
    `【143-0】プロ野球全時代ドラフト`,
    `${result.wins}勝${result.losses}敗 (勝率${pctText}) — ${verdict.title}`,
    `打線${Math.round(result.offense)} / 先発${Math.round(result.rotation)} / 救援${Math.round(result.bullpen)} / 最長${result.longestWinStreak}連勝`,
  ].join('\n')

  const copyResult = () => {
    navigator.clipboard.writeText(`${shareText}\n${GAME_URL}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  const shareToX = () => {
    const url = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(GAME_URL)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // モバイル等ではネイティブの共有シートも使える
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator
  const nativeShare = () => {
    navigator.share({ text: shareText, url: GAME_URL }).catch(() => {
      /* キャンセルは無視 */
    })
  }

  const article = leadArticle(roster, result)
  const perfect = result.wins === SEASON_GAMES

  return (
    <div className="pt-8" key={simCount}>
      {/* 発行日 */}
      <div className="flex items-center justify-between pb-1 text-[10px] text-ink-faint">
        <span>{WAREKI.format(new Date())}</span>
        <span>第百四十三号</span>
      </div>
      {/* 号外マストヘッド */}
      <div className="animate-rise flex items-stretch gap-3 border-y-4 border-double border-ink py-3">
        <span className="font-mincho bg-shu px-3 py-1 text-2xl font-bold tracking-[0.3em] text-paper [writing-mode:vertical-rl]">
          号外
        </span>
        <div className="flex-1">
          <h1 className="font-mincho text-3xl font-extrabold leading-tight sm:text-4xl">
            百四十三勝零敗報知
          </h1>
          <p className="mt-1 text-xs text-ink-soft">
            プロ野球全時代ドラフト シーズン終了号 ・ 一試合の勝率 {result.winProb.toFixed(3).replace(/^0/, '')}
          </p>
        </div>
        <p className="tategaki font-mincho hidden text-xs text-ink-soft sm:block">
          球史九十年・夢の十七人
        </p>
      </div>

      {/* 一面見出し */}
      <div className="relative mt-8 text-center">
        <p
          className="font-mincho animate-rise text-balance text-2xl font-bold text-ink-soft"
          style={{ animationDelay: '0.15s' }}
        >
          {verdict.title}
        </p>
        <p
          className="font-mincho animate-rise mt-2 text-7xl font-extrabold leading-none tabular-nums sm:text-8xl"
          style={{ animationDelay: '0.3s' }}
        >
          {result.wins}
          <span className="mx-2 text-4xl sm:text-5xl">勝</span>
          {result.losses}
          <span className="ml-2 text-4xl sm:text-5xl">敗</span>
        </p>
        <p
          className="animate-rise mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-ink-soft"
          style={{ animationDelay: '0.45s' }}
        >
          {verdict.detail}
        </p>
        {/* 判子(完全シーズンは金箔押し) */}
        <div
          className={cn(
            'hanko animate-stamp absolute -top-6 right-2 flex size-24 items-center justify-center sm:right-12 sm:size-28',
            perfect && 'border-[#b08d57] text-[#9a7635]',
          )}
          style={{ animationDelay: '0.8s' }}
        >
          <span className="text-3xl font-bold leading-none sm:text-4xl">
            {stampWord(result.wins)}
          </span>
        </div>
      </div>

      {/* 一面記事 */}
      <section
        className="animate-rise mx-auto mt-10 max-w-2xl"
        style={{ animationDelay: '0.5s' }}
      >
        <p aria-hidden className="rule-deco text-xs">
          ◆
        </p>
        <div className="mt-4 gap-7 text-pretty text-sm leading-7 sm:columns-2 [&>p+p]:mt-3 sm:[&>p:first-child]:first-letter:float-left sm:[&>p:first-child]:first-letter:mr-1.5 sm:[&>p:first-child]:first-letter:font-mincho sm:[&>p:first-child]:first-letter:text-5xl sm:[&>p:first-child]:first-letter:font-bold sm:[&>p:first-child]:first-letter:leading-[0.85]">
          {article.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </section>

      {/* チーム力 電光掲示 */}
      <div
        className="board animate-rise mx-auto mt-10 max-w-2xl rounded-md p-5"
        style={{ animationDelay: '0.55s' }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6">
          {(
            [
              ['打線', result.offense],
              ['先発', result.rotation],
              ['救援', result.bullpen],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="contents">
              <p className="font-dot text-sm text-lamp">{label}</p>
              <div className="flex items-center gap-3">
                <div className="h-3 flex-1 overflow-hidden border border-board-line bg-black/40">
                  <div
                    className="animate-grow-x h-full bg-lamp"
                    style={{
                      transform: `scaleX(${Math.min(100, value) / 100})`,
                      animationDelay: '0.7s',
                    }}
                  />
                </div>
                <p className="font-dot w-8 text-right text-sm tabular-nums">
                  {Math.round(value)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="font-dot mt-4 flex items-center justify-center gap-3 border-t border-board-line pt-3 text-sm">
          <span>チーム</span>
          <OvrBadge rating={Math.round(result.strength)} size="lg" labeled />
          <span className="mx-3 text-board-text/40">|</span>
          <span>
            最長連勝 <span className="text-xl text-lamp">{result.longestWinStreak}</span>
          </span>
        </div>
      </div>

      {/* 星取表 */}
      <section className="animate-rise mx-auto mt-10 max-w-2xl" style={{ animationDelay: '0.7s' }}>
        <h2 className="font-mincho border-b-2 border-ink pb-1 text-lg font-bold">
          全百四十三戦 星取表
        </h2>
        <p className="sr-only">
          全143試合の結果: {result.wins}勝{result.losses}敗
        </p>
        <div
          aria-hidden
          className="mt-3 grid grid-cols-[repeat(13,1fr)] gap-1 text-center sm:grid-cols-[repeat(22,1fr)]"
        >
          {result.games.map((won, i) => (
            <span
              key={i}
              className={cn('animate-pop text-sm leading-none', won ? 'text-shu' : 'text-ink')}
              style={{ animationDelay: `${0.8 + i * 0.012}s` }}
              title={`第${i + 1}戦 ${won ? '勝' : '負'}`}
            >
              {won ? '○' : '●'}
            </span>
          ))}
        </div>
        <p className="mt-2 text-right text-xs text-ink-faint">○=勝 ●=負</p>
      </section>

      {/* 出場選手 */}
      <section className="animate-rise mx-auto mt-10 max-w-2xl" style={{ animationDelay: '0.85s' }}>
        <h2 className="font-mincho flex items-baseline justify-between border-b-2 border-ink pb-1 text-lg font-bold">
          出場選手
          <span className="text-[10px] font-normal text-ink-faint">
            OVR = 時代補正した総合力(1〜99)・球団色の濃淡
          </span>
        </h2>
        <ul className="mt-2 columns-1 gap-6 sm:columns-2">
          {ALL_SLOTS.map((slot) => {
            const pick = roster[slot]
            if (!pick) return null
            return (
              <li
                key={slot}
                className="flex break-inside-avoid items-center gap-2 border-b border-dotted border-ink/30 py-1.5 text-sm"
              >
                <span className="font-mincho w-12 shrink-0 text-xs font-bold text-ink-soft">
                  {SLOT_LABELS[slot]}
                </span>
                <span className="flex-1 font-medium">{pick.player.name}</span>
                {(() => {
                  const crowns = (pick.player.titles ?? []).reduce(
                    (sum, [, n]) => sum + n,
                    0,
                  )
                  return crowns > 0 ? (
                    <span className="text-[10px] font-bold text-[#7a5f33]">{crowns}冠</span>
                  ) : null
                })()}
                <span className="text-[10px] text-ink-faint">
                  {FRANCHISES[pick.franchiseId]?.short}・{pick.decade}年代
                </span>
                <OvrBadge
                  rating={pick.player.rating}
                  size="sm"
                  teamColor={franchiseColor(pick.franchiseId)}
                />
              </li>
            )
          })}
        </ul>
      </section>

      {/* アクション */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setSimCount((c) => c + 1)}
          className="font-mincho cursor-pointer border-2 border-ink bg-paper px-6 py-2.5 font-bold shadow-[3px_3px_0_rgba(26,23,20,.3)] transition-[transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          同じ十七人でもう一季
        </button>
        <button
          type="button"
          onClick={shareToX}
          className="font-mincho cursor-pointer border-2 border-ink bg-ink px-6 py-2.5 font-bold text-paper shadow-[3px_3px_0_rgba(26,23,20,.3)] transition-[transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          𝕏 でポスト
        </button>
        {canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            className="font-mincho cursor-pointer border-2 border-ink bg-paper px-6 py-2.5 font-bold shadow-[3px_3px_0_rgba(26,23,20,.3)] transition-[transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            共有…
          </button>
        )}
        <button
          type="button"
          onClick={copyResult}
          className="font-mincho cursor-pointer border-2 border-ink bg-paper px-6 py-2.5 font-bold shadow-[3px_3px_0_rgba(26,23,20,.3)] transition-[transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          {copied ? 'コピーしました' : '結果をコピー'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="font-mincho cursor-pointer border-2 border-shu-deep bg-shu px-8 py-2.5 text-lg font-bold text-paper shadow-[3px_3px_0_rgba(26,23,20,.35)] transition-[transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          新しいドラフトへ
        </button>
      </div>
    </div>
  )
}
