import type { Contribution, Priority } from '../research/model'
export type Version = { id: string; title: string; version: number; maker: string }
export type Axis = {
  id: string
  label: string
  blocked: string | null
  lead: string | null
  methods: string[]
  hours: number
  price: number
  fitted: string
  versions: Version[]
}
export type Entry = {
  id: string
  title: string
  regulation: string
  concept: string
  atr_applicable: boolean
  admitted: boolean
  axes: Axis[]
}
export type Reading = { specification: string; value: number; raw: number; pressure_pa: number | null }
export type Report = {
  metric: string
  a: Reading
  b: Reading
  conditions: string
  difference: number
  uncertainty: number
  interpretation: string
  finding: string | null
  detected: boolean
}
export type Project = {
  id: string
  kind: 'design' | 'test'
  axis: string
  entry: string
  baseline: string
  candidate?: string
  specification?: string
  priority: Priority
  brief?: string
  method?: string
  site_kind: string
  concept: string
  regulation: string
  commissioned: string
  started: string | null
  finished: string | null
  lead: string | null
  reason: string | null
  worked: number
  required: number
  status: string
  paid: boolean
  cost_cents: number
  remaining_days: number
  participants: Record<string, Contribution>
  grants: {
    reference: string
    start: string
    facility: string
    condition: number
    effective_person_days_x100: number
  }[]
  evidence: { report: string; hypothesis: string; conclusion: string; confidence: number }[]
  findings: string[]
  forecast?: Record<string, [number, number]>
  package_forecast?: Record<string, number>
  test_inputs?: string[]
  report?: Report
  disposition?: 'review' | 'released' | 'withdrawn'
  decisions: { id: string; date: string; code: string }[]
}
export type Desk = {
  spent_cents: number
  rent_cents: number
  entries: Entry[]
  projects: Project[]
  staff: Record<string, string>
  capacity: Record<
    string,
    {
      label: string
      owned: number
      used: number
      slots: number
      free: number
      rent: number
      condition: number
    }
  >
  tests: Record<string, { label: string; site: string; cost: number; atr: Record<string, number> }>
}
export const decisions: Record<string, string> = {
  issued: 'Передана на проверку',
  measured: 'Подписан протокол',
  review: 'На проверке',
  released: 'Допущена к производству',
  withdrawn: 'Отозвана',
}
export const quota: Record<string, string> = {
  runs: 'прогонов',
  wind_on_minutes: 'мин под потоком',
  occupancy_minutes: 'мин занятости',
  cfd_geometries: 'геометрии',
  cfd_milli_mauh: 'милли-MAUh',
}
export const version = (id: string) => 'ред. ' + id.split('/').at(-1)
