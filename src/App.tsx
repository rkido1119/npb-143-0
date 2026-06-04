import { useEffect, useState } from 'react'
import { loadIndex } from './game/engine'
import type { Roster } from './game/engine'
import type { DataIndex } from './game/types'
import SetupScreen from './components/SetupScreen'
import DraftScreen from './components/DraftScreen'
import ResultScreen from './components/ResultScreen'

type Phase = 'setup' | 'draft' | 'result'

export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('setup')
  const [selectedDecades, setSelectedDecades] = useState<number[]>([])
  const [hideStats, setHideStats] = useState(false)
  const [roster, setRoster] = useState<Roster>({})

  useEffect(() => {
    loadIndex()
      .then((idx) => {
        setIndex(idx)
        setSelectedDecades(idx.decades)
      })
      .catch((e) => setLoadError(String(e)))
  }, [])

  // 画面遷移時にスクロール位置を先頭へ戻す
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [phase])

  const reset = () => {
    setRoster({})
    setPhase('setup')
  }

  return (
    <div className="paper-bg min-h-screen">
      <main className="mx-auto max-w-6xl px-4 pb-16">
        {loadError && (
          <div className="news-box mx-auto mt-20 max-w-md p-6 text-center">
            <p className="font-mincho text-lg font-bold">データの読込に失敗しました</p>
            <p className="mt-2 text-sm text-ink-soft">{loadError}</p>
          </div>
        )}
        {!index && !loadError && (
          <div className="flex h-dvh items-center justify-center">
            <p role="status" className="font-dot text-xl text-ink-soft animate-lamp">
              九十年分の球史を読み込み中…
            </p>
          </div>
        )}
        {index && phase === 'setup' && (
          <SetupScreen
            index={index}
            selectedDecades={selectedDecades}
            onChangeDecades={setSelectedDecades}
            hideStats={hideStats}
            onChangeHideStats={setHideStats}
            onStart={() => {
              setRoster({})
              setPhase('draft')
            }}
          />
        )}
        {index && phase === 'draft' && (
          <DraftScreen
            index={index}
            selectedDecades={selectedDecades}
            hideStats={hideStats}
            roster={roster}
            onChangeRoster={setRoster}
            onComplete={() => setPhase('result')}
            onAbort={reset}
          />
        )}
        {index && phase === 'result' && <ResultScreen roster={roster} onReset={reset} />}
      </main>
      <footer className="border-t border-ink/20 py-6 text-center text-xs text-ink-faint">
        <p className="mx-auto max-w-2xl px-4 text-pretty">
          本家{' '}
          <a
            href="https://thediamondlab.live/162-0"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            162-0 (The Diamond Lab)
          </a>{' '}
          /{' '}
          <a href="https://www.82-0.com/" target="_blank" rel="noreferrer" className="underline">
            82-0.com
          </a>{' '}
          へのオマージュ。成績データは npb.jp の公開記録を集計したものです。
          {index?.source === 'sample' && ' (現在は開発用サンプルデータ・成績は近似値)'}
        </p>
      </footer>
    </div>
  )
}
