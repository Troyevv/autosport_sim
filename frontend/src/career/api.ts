import type { Livery } from '../garage/model'
import type { Role } from '../game'
export type Organization = { playable?: boolean; color: string; id: string; name: string; kind: string; programs: string[]; lines: string[] }
export type Championship = {
  id: string
  name: string
  discipline: string
  playable?: boolean
  admission?: { min_age: number; max_age?: number; licence: string; licences?: string[]; age_basis?: string }
  short_name?: string
  technical_summary?: string
  superlicence?: number[]
  classes: string[]
  tyre_market: Record<string, { mode: 'sole' | 'approved' | 'open'; approved_suppliers?: string[] }>
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
  countries: Record<string,string>
  products: Record<string, { name: string }>
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
  cars: Record<string, { regulation: string; name: string; suppliers: Record<string, string> }>
  names: Record<string, string>
  faces: Record<string, string>
  assignments: Record<string, { person: string; org: string; position: string }>
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
  country: string
  nationality: string
  birth_date: string
  experience: number
  specialization: string
  skills: Record<string, number>
  potential?: number
  management?: import("./staff/pathModel").Management
  credentials?: {licences:string[];points:number}
  morale: number
  fatigue: number
}
export type Seat = {
  academy?:string|null
  id: string
  org: string
  position: string
  series: string | null
  entry: string | null
  occupant: Person | null
}
export type Career = Save & {
  mandate: import('./staff/pathModel').Mandate | null
  academies: import('./staff/pathModel').Academy[]
  scholarships: import('./staff/pathModel').Scholarship[]
  preparation_options: {id:string;name:string;facility:string;days:number;cost:number;load:number}[]
  preparations:{id:string;kind:string;names:string[];start:string;end:string;status:string}[]
  crews: Record<string, string[]>
  offers: import("./staff/model").Offer[]
  notices: {date: string; text: string}[]
  liveries: Record<string, Livery>
  garage_configurations: Record<
    string,
    { regulation: string; concept: string; geometry: string | null; installed: Record<string, string> }
  >
  player_id: string
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
  team_names:Record<string,string>
  available_cents: number
  ledger: { key: string; date: string; delta_cents: number; source: string }[]
  player_cash_cents: number
  assignments: Seat[]
  team_color: string
  pending: string[]
  next_date: string | null
  briefing_action: string
  collectives: {
    development: import("./staff/Development").DevelopmentRecord
    id: string
    name: string
    size: number
    precision: number
    speed: number
    pressure: number
    motivation: number
    cohesion: number
    atmosphere: number
    team_days: number
    relationships: import('./staff/Teamwork').Relationship[]
    capacity: number
    qualification: number
    workload: number
    fatigue: number
    payroll_cents: number
  }[]
}
export type Anatomy = { camera: number[]; body: number[][]; nativeWidth: number }
export type Garment = { rig: { span: number; collar: number[]; seat: number[] }; outline: number[][] }
export type Asset = {
  anatomy?: Anatomy
  garment?: Garment
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
