import type { Slot } from './types'

export const SLOT_LABELS: Record<Slot, string> = {
  C: '捕',
  '1B': '一',
  '2B': '二',
  '3B': '三',
  SS: '遊',
  LF: '左',
  CF: '中',
  RF: '右',
  DH: '指',
  SP1: '先発①',
  SP2: '先発②',
  SP3: '先発③',
  SP4: '先発④',
  SP5: '先発⑤',
  RP1: '救援①',
  RP2: '救援②',
  RP3: '救援③',
}

export const POSITION_LABELS: Record<string, string> = {
  C: '捕手',
  '1B': '一塁',
  '2B': '二塁',
  '3B': '三塁',
  SS: '遊撃',
  LF: '左翼',
  CF: '中堅',
  RF: '右翼',
  DH: '指名打者',
  SP: '先発',
  RP: '救援',
}

export function fmtAvg(x: number): string {
  return x.toFixed(3).replace(/^0/, '')
}

export function fmtEra(x: number): string {
  return x.toFixed(2)
}

export function fmtIp(x: number): string {
  return `${Math.round(x)}`
}
