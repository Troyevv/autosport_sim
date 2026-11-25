import type { GameCatalog, Role, Series, ProjectSpec } from './catalog'
export type { Role, Series, Person } from './catalog'
export type Project = ProjectSpec & { installed: boolean }
export type Offer = {
  id: string
  name: string
  kind: 'Контракт' | 'Поставка'
  years: number
  annualEuro: number
}
export type Entry = { id: string; date: string; label: string; cents: number }
export interface GameState {
  role: Role
  series: Series
  date: string
  balanceCents: number
  ledger: Entry[]
  offers: Offer[]
  projects: Project[]
  read: string[]
  shares: Record<Series, number>
  orders: string[]
  load: number
  inspected: string[]
  specs: string[]
  engineers: Record<'aero' | 'power' | 'reliability', number>
  shifts: number
  terms: Record<string, { cents: number; support: string }>
  compact: boolean
  mandates: Record<'contracts' | 'strategy' | 'development', boolean>
  partnerSigned: boolean
  facilities: string[]
  completed: string[]
  goals: Record<Series, string>
  motion: boolean
  frame: number
  strategy: Record<string, { pace: string; energy: string; pit: string }>
  radio: { lap: number; text: string }[]
}
export type Command =
  | { type: 'role'; role: Role }
  | { type: 'series'; series: Series }
  | { type: 'read'; id: string }
  | { type: 'advance' | 'reset' | 'nextFrame' }
  | { type: 'motion'; enabled: boolean }
  | { type: 'offer'; offer: Offer }
  | { type: 'project' | 'install' | 'order' | 'inspect' | 'spec'; id: string }
  | { type: 'engineers'; values: GameState['engineers'] }
  | { type: 'mandates'; values: GameState['mandates'] }
  | { type: 'terms'; id: string; cents: number; support: string }
  | { type: 'shifts'; value: number }
  | { type: 'compact'; enabled: boolean }
  | { type: 'partner' }
  | { type: 'facility' | 'finishOrder'; id: string }
  | { type: 'goal'; series: Series; value: string }
  | { type: 'allocate'; shares: GameState['shares'] }
  | { type: 'strategy'; id: string; field: 'pace' | 'energy' | 'pit'; value: string }

export interface GameAdapter {
  readonly catalog: GameCatalog
  snapshot(): GameState
  subscribe(listener: () => void): () => void
  dispatch(command: Command): void
}
export const eur = (euros: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    euros,
  )
export const millions = (cents: number) =>
  '€' + (cents / 100000000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' млн'
export function dateLabel(iso: string, year = false) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(iso + 'T00:00:00Z'))
}
