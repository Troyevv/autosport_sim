import type { Role } from '../game'
export type Organization = { id: string; name: string; kind: string; programs: string[]; lines: string[] }
export type Championship = {
  id: string
  name: string
  discipline: string
  classes: string[]
  tyre_market:Record<string,{mode:string;approved_suppliers:string[]}>
  crew: number[]
  finish: string
  sessions: Record<string, string[]>
  points: Record<string, number | number[]>
}
export type Event = {
  id: string
  series: string
  start: string
  end: string
  circuit: string
  name: string
  kind: string
  round?: number
  sessions: string[]
  org?: string
}
export type World = {
  products:Record<string,{name:string}>
  engineering: {
    seasons: Record<string, { year: number; status: string; championship: string }>
    generations: Record<string, { category: string }>
    cost_cap: { base_cents: number; currency: string; reference_rounds: number; start: string }
  }
  version: string
  origin: { season: number; verified: string }
  organizations: Record<string, Organization>
  championships: Record<string, Championship>
  positions: Record<string, { name: string; skills: string[] }>
  entries: Record<
    string,
    {
      id: string
      org: string
      championship: string
      number: string
      crew: string[]
      car: string
      category: string
    }
  >
  cars: Record<string, { name: string; suppliers: Record<string, string> }>
  names: Record<string, string>
  events: Event[]
}
export type Save = {
  id: string
  name: string
  role: Role
  org: string
  series: string
  date: string
  revision: number
}
export type Person = {
  id: string
  name: string
  face: string | null
  origin: string
  skills: Record<string, number>
  potential: number
  morale: number
  fatigue: number
}
export type Seat = {
  id: string
  org: string
  position: string
  series: string | null
  entry: string | null
  occupant: Person | null
}
export type Career = Save & {
  account: {
    cash_cents: number
    budget_cents: number
    forecast_cents: number
    payroll_cents: number
    currency: string
    development_budget_cents: number
    development_spent_cents: number
    development_reserved_cents: number
  }
  targets: { program: string; generation: string; target_season: string }[]
  atr: {
    period: { number: number; start: string }
    percent: number | null
    limits: Record<string, number> | null
  } | null
  ledger: { key: string; date: string; delta_cents: number; source: string }[]
  player_cash_cents: number
  assignments: Seat[]
  team_color: string
  pending: string[]
  next_date: string | null
  briefing_action: string
  collectives: {
    id: string
    name: string
    size: number
    qualification: number
    workload: number
    fatigue: number
    payroll_cents: number
  }[]
}
export type Asset = {
  kind: string
  entity: string
  sha256: string
  source: string
  author: string
  license: string
  changes: string
}
export function assetUrl(media: Asset[], kind: string, entity: string | null) {
  const a = media.find((a) => a.kind === kind && a.entity === entity)
  return a ? '/api/media/' + a.kind + '/' + a.entity + '?v=' + a.sha256 : undefined
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch('/api/' + url, init)
  if (!r.ok) {
    const error = await r.json().catch(() => ({}))
    throw new ApiError(
      r.status,
      typeof error.detail === 'string' ? error.detail : 'Проверьте поля и повторите операцию.',
    )
  }
  return r.json()
}
export const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export const money = (cents: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(
    cents / 100,
  )
export const explain = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Нет связи с приложением. Повторите попытку.'
