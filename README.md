# 143-0 — プロ野球 全時代ドラフトゲーム

[The Diamond Lab「162-0」](https://thediamondlab.live/162-0)([82-0.com](https://www.82-0.com/) 原案) の NPB 版。

ランダムに出る「球団 × 年代」から実在の選手を1人ずつ指名し、
打線9・先発5・救援3 の17枠を埋めて 143試合のシーズンをシミュレート。
**143勝0敗の完全シーズン**を目指す。

## 遊び方

```bash
npm install
npm run dev
```

- 年代(1936〜)を選んでドラフト開始
- 「抽選」→ 球団×年代 → その球団・年代に実在した選手から1人指名 → 実際に守れる位置へ配置
- 17枠完成でシーズン開幕。結果は号外で

「成績を隠す」をONにすると数字なし・記憶だけの玄人モード。

## データパイプライン

成績データは npb.jp の個人年度別成績(公開記録)を集計して生成する。
リポジトリには生成済み JSON (`public/data/`) を同梱。再生成する場合:

```bash
# 1. npb.jp から全選手ページを取得 (~8,000ページ、レート制限つき、1-2時間)
python3 scripts/crawl_npb.py

# 2. HTML → players.jsonl (年度別 打撃/投手成績)
python3 scripts/parse_npb.py

# 3. 野手の守備位置を ja.wikipedia の Infobox から取得 (レジューム可)
python3 scripts/enrich_positions.py

# 4. (球団系譜 × 年代) プール JSON 生成 → public/data/
python3 scripts/aggregate_pools.py
```

- 球団系譜(消滅球団・改称の対応表)は `src/data/franchises.json`
- レーティングは年代内リーグ平均に対する OPS+/ERA+ ベース(時代間補正)
- `scripts/gen_sample_data.mjs` は開発用サンプルデータ(近似値)

## 技術

Vite + React + TypeScript + Tailwind CSS v4。静的SPA(バックエンド不要)。
