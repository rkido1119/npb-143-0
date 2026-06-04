/** OVR(総合力 1-99)の色。高いほど墨→朱→深紅へ濃くなる。 */

interface Stop {
  at: number
  rgb: [number, number, number]
}

// 生成り紙に合う淡灰 → 墨 → 朱 → 深紅
const STOPS: Stop[] = [
  { at: 30, rgb: [176, 168, 152] }, // 淡灰(その他大勢)
  { at: 50, rgb: [122, 114, 98] }, // 鈍色(平均的レギュラー)
  { at: 65, rgb: [74, 67, 55] }, // 墨(好選手)
  { at: 78, rgb: [199, 62, 46] }, // 朱(スター)
  { at: 90, rgb: [163, 38, 25] }, // 深朱(球界の顔)
  { at: 99, rgb: [94, 12, 5] }, // 深紅(伝説)
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function ovrColor(rating: number): string {
  const r = Math.max(STOPS[0].at, Math.min(99, rating))
  for (let i = 0; i < STOPS.length - 1; i++) {
    const s0 = STOPS[i]
    const s1 = STOPS[i + 1]
    if (r <= s1.at) {
      const t = (r - s0.at) / (s1.at - s0.at)
      const [r0, g0, b0] = s0.rgb
      const [r1, g1, b1] = s1.rgb
      return `rgb(${Math.round(lerp(r0, r1, t))}, ${Math.round(
        lerp(g0, g1, t),
      )}, ${Math.round(lerp(b0, b1, t))})`
    }
  }
  return `rgb(${STOPS[STOPS.length - 1].rgb.join(', ')})`
}

/** 90以上は金縁などの特別感を出すためのティア */
export function ovrTier(rating: number): 'legend' | 'star' | 'regular' | 'sub' {
  if (rating >= 90) return 'legend'
  if (rating >= 78) return 'star'
  if (rating >= 60) return 'regular'
  return 'sub'
}

// ---- 球団カラー連動スケール ----

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [0, 0, 0.4]
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rgb: [number, number, number]
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const m = l - c / 2
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m]
}

/** WCAG相対輝度(0-1) */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/**
 * 球団カラーの濃淡で OVR を表す。
 * 低レート = 淡く色あせた球団色、高レート = 深く濃い球団色。
 * 返り値: 背景色と、実輝度ベースでコントラストを確保した文字色。
 */
export function ovrTeamColor(
  rating: number,
  teamHex: string,
): { bg: string; fg: string } {
  const [h, s, l] = hexToHsl(teamHex)
  const t = (Math.max(30, Math.min(99, rating)) - 30) / 69
  const sat = lerp(0.16, Math.min(1, s * 1.05 + 0.05), t)
  const lig = lerp(0.84, Math.max(0.28, Math.min(0.55, l * 0.8)), t)
  const fg = luminance(hslToRgb(h, sat, lig)) > 0.3 ? 'var(--color-ink)' : 'var(--color-paper)'
  return { bg: `hsl(${h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(lig * 100).toFixed(0)}%)`, fg }
}
