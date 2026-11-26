export type Management = { style: string; discipline: number; youth: number; specialists: number }
export type Mandate = {
  manager: string | null
  owner: string | null
  goal: string
  priority: string
  horizon: string
  autonomy: number
  limit_cents: number
  trust: number
  satisfaction: number
  response: string
  history: { date: string; goal: string; response: string }[]
}
export type Funding = {
  id: string
  person: string
  payer: string
  source: string
  team: string | null
  monthly_cents: number
  paid_cents: number
  exit_cents: number
  arrears: Record<string, number>
  best_place: number | null
  minimum_starts: number
  portable: boolean
  guarantee: boolean
  status: string
  reason: string | null
  start: string
  end: string
}
export type Scholarship = {
  id: string
  academy: string
  org: string
  name: string
  person: string
  start: string
  end: string
  option_days: number
  option: boolean
  priority: boolean
  priority_until: string | null
  exercised: boolean
  reserved_cents: number
}
export type Academy = { id: string; org: string; name: string; budget_cents: number; spent_cents: number }
export type Report = { low: number; high: number; date: string; next: string; scout: string }
export const styles: Record<string, string> = {
  development: 'Развитие молодых',
  performance: 'Спортивный результат',
  economy: 'Финансовая устойчивость',
  technical: 'Техническое развитие',
}
export const periods: Record<string, string> = {
  race: 'Гонка',
  intermediate: 'Промежуточный',
  season: 'Сезон',
  long: 'Долгосрочный',
}
export const sources: Record<string, string> = {
  family: 'Семья',
  sponsor: 'Личный спонсор',
  academy: 'Академия',
  manufacturer: 'Производитель',
  national: 'Национальная программа',
}
