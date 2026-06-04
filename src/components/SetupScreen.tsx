import type { DataIndex } from '../game/types'
import { cn } from '../lib/cn'

interface Props {
  index: DataIndex
  selectedDecades: number[]
  onChangeDecades: (d: number[]) => void
  hideStats: boolean
  onChangeHideStats: (v: boolean) => void
  onStart: () => void
}

const MIN_DECADES = 2

export default function SetupScreen({
  index,
  selectedDecades,
  onChangeDecades,
  hideStats,
  onChangeHideStats,
  onStart,
}: Props) {
  const toggle = (d: number) => {
    onChangeDecades(
      selectedDecades.includes(d)
        ? selectedDecades.filter((x) => x !== d)
        : [...selectedDecades, d].sort((a, b) => a - b),
    )
  }
  const poolCount = (d: number) => index.pools.filter((p) => p.decade === d).length
  const selectedPoolCount = index.pools.filter((p) =>
    selectedDecades.includes(p.decade),
  ).length
  const canStart = selectedDecades.length >= MIN_DECADES && selectedPoolCount >= 4

  return (
    <div className="animate-rise">
      {/* 題字 */}
      <header className="relative flex items-stretch justify-between gap-4 pt-10 pb-8">
        <div className="hidden sm:block">
          {/* 縦書きは height が行長になるため、折り返さないよう max-content を指定 */}
          <p className="tategaki font-mincho h-max text-lg font-bold text-ink-soft">
            プロ野球全時代ドラフト遊戯
          </p>
        </div>
        <div className="flex-1 text-center">
          <div className="board mx-auto inline-block rounded-md px-8 py-6 sm:px-14">
            <p className="font-dot text-xs tracking-[0.5em] text-lamp">
              NIPPON PROFESSIONAL BASEBALL
            </p>
            <h1 className="font-dot mt-2 text-7xl leading-none sm:text-8xl">
              143<span className="mx-1 text-lamp">-</span>0
            </h1>
            <p className="font-dot mt-3 text-sm tracking-widest text-board-text/70">
              全勝で終われるか。
            </p>
          </div>
          <p className="font-mincho mt-6 text-balance text-xl font-bold sm:text-2xl">
            九十年の球史から、最強の十七人を。
          </p>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-ink-soft">
            抽選で出た「球団 × 年代」に実在した選手を一人ずつ指名。
            打線・先発・救援の十七枠を埋めて、百四十三試合のシーズンへ。
            完全試合ならぬ<strong className="akasen text-shu">完全シーズン — 143勝0敗</strong>
            を目指せ。
          </p>
        </div>
        <div className="hidden sm:block">
          <p className="tategaki font-mincho h-max text-lg font-bold text-ink-soft">
            消えた球団も、伝説も、全部出る。
          </p>
        </div>
      </header>

      {/* 遊び方 */}
      <section className="news-box mx-auto max-w-3xl p-5 sm:p-6">
        <h2 className="font-mincho border-b-2 border-ink pb-2 text-lg font-bold">
          <span className="mr-2 inline-block bg-ink px-2 py-0.5 text-paper">遊び方</span>
          三つの掟
        </h2>
        <ol className="mt-4 grid gap-4 text-sm leading-relaxed sm:grid-cols-3">
          <li>
            <span className="font-mincho text-2xl font-bold text-shu">一、</span>
            <strong>抽選</strong> — 球団と年代がランダムに決まる。南海も近鉄も阪急も出る。
          </li>
          <li>
            <span className="font-mincho text-2xl font-bold text-shu">二、</span>
            <strong>指名</strong> — その球団・その年代に実在した選手から一人を選び、
            実際に守れる位置へ置く。
          </li>
          <li>
            <span className="font-mincho text-2xl font-bold text-shu">三、</span>
            <strong>開幕</strong> — 十七枠が埋まればシーズン開始。成績は時代間で補正され、
            勝敗が決まる。
          </li>
        </ol>
      </section>

      {/* 年代選択 */}
      <section className="mx-auto mt-8 max-w-3xl">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mincho text-lg font-bold">抽選に含める年代</h2>
          <p className="text-xs text-ink-faint">
            {selectedDecades.length} 年代 / {selectedPoolCount} プール選択中
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {index.decades.map((d) => {
            const on = selectedDecades.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(d)}
                className={cn(
                  'font-mincho cursor-pointer border px-4 py-2 text-sm font-bold transition-colors',
                  on
                    ? 'border-shu bg-shu text-paper shadow-[2px_2px_0_rgba(163,38,25,.4)]'
                    : 'border-ink/40 bg-paper-deep text-ink-faint hover:border-ink hover:text-ink',
                )}
              >
                {d}年代
                <span className={`ml-1.5 text-[10px] ${on ? 'text-paper/70' : ''}`}>
                  {d === 1930 ? '昭和11〜' : ''}
                  {poolCount(d)}球団
                </span>
              </button>
            )
          })}
        </div>
        <p id="start-note" className="mt-2 text-xs text-ink-faint">
          ※ 年代を絞るほど選手層が薄くなり、難度が上がる(最低{MIN_DECADES}年代)。
        </p>

        {/* 玄人モード */}
        <button
          type="button"
          role="switch"
          aria-checked={hideStats}
          onClick={() => onChangeHideStats(!hideStats)}
          className="news-box mt-6 flex w-full cursor-pointer items-center gap-4 p-4 text-left transition-transform hover:-translate-y-0.5"
        >
          <span
            className={cn(
              'flex h-6 w-11 shrink-0 items-center rounded-full border border-ink/50 p-0.5 transition-colors',
              hideStats ? 'bg-shu' : 'bg-paper-deep',
            )}
          >
            <span
              className={cn(
                'size-4.5 rounded-full bg-paper shadow transition-transform',
                hideStats && 'translate-x-5',
              )}
            />
          </span>
          <span>
            <span className="font-mincho font-bold">
              成績を隠す<span className="ml-2 text-xs text-shu">玄人専用</span>
            </span>
            <span className="block text-xs text-ink-soft">
              数字は一切見せない。名前と記憶だけでドラフトする。
            </span>
          </span>
        </button>
      </section>

      {/* 開始 */}
      <div className="mt-10 text-center">
        <button
          type="button"
          disabled={!canStart}
          aria-describedby="start-note"
          onClick={onStart}
          className="font-mincho cursor-pointer border-2 border-shu-deep bg-shu px-14 py-4 text-2xl font-bold text-paper shadow-[4px_4px_0_rgba(26,23,20,.35)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_rgba(26,23,20,.35)] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          ドラフト開始
        </button>
        <p className="mt-3 text-xs text-ink-faint">全17巡 — 野手9・先発5・救援3</p>
      </div>
    </div>
  )
}
