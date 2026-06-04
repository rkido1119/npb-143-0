import franchisesJson from './franchises.json'

export interface FranchiseMeta {
  id: string
  current: string
  short: string
  color: string
}

const list: FranchiseMeta[] = (
  franchisesJson as {
    franchises: { id: string; current: string; short: string; color: string }[]
  }
).franchises.map(({ id, current, short, color }) => ({ id, current, short, color }))

export const FRANCHISES: Record<string, FranchiseMeta> = Object.fromEntries(
  list.map((f) => [f.id, f]),
)

export function franchiseColor(id: string): string {
  return FRANCHISES[id]?.color ?? '#4a4337'
}
