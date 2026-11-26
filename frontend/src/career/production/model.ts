import type { Priority } from '../research/model'

type Quote = { hours: number; cents: number }
export type Drawing = {
  id: string
  slot: string
  label: string
  version: number
  title: string
  modes: { id: string; reason: string | null; normal: Quote; rush: Quote }[]
}
type Entry = {
  id: string
  title: string
  choices: Drawing[]
  crew: { id: string; name: string; status: string }[]
}
export type Facility = {
  kind: string
  label: string
  daily_cents: number
  rentable: number
  crew: null | { name: string; size: number; qualification: number; workload: number; fatigue: number }
  sites: { id: string; owned: boolean; condition: number; slots: number; used: number }[]
}
type Event = {
  id: string
  date: string
  code: string
  entry: string
  version: string
  instance: string | null
  batch: string | null
  person: string
}
export type Item = {
  id: string
  serial: string
  slot: string
  label: string
  title: string
  version: number
  specification: string
  batch: string | null
  made: string | null
  cost_cents: number | null
  status: string
  installed: string | null
  rejected: boolean
  reason: string | null
  remaining_m: number
  distance_m: number
  wear_ppm: number
  damaged: boolean
  targets: { entry: string; reason: string | null }[]
  actions: string[]
  repair_cents: number
  fits: { date: string; entry: string; code: string; person: string }[]
}
export type Batch = {
  id: string
  entry: string
  specification: string
  quantity: number
  priority: Priority
  rush: boolean
  outsource: boolean
  commissioned: string
  finished: string | null
  cost_cents: number
  facility_cents: number
  required: number
  worked: number
  status: string
  reason: string | null
  days: number
  last_shift: string | null
  estimated_finish: string
  grants: { reference: string; start: string; condition: number; effective_person_days_x100: number }[]
}
export type Need = {
  entry: string
  specification: string
  slot: string
  mechanic: string
  engineer: string
  cars: number
  stock: number
  pending: number
  replace: number
  quantity: number
}
export type Desk = {
  entries: Entry[]
  items: Item[]
  batches: Batch[]
  needs: Need[]
  history: Event[]
  people: Record<string, string>
  capacity: Facility[]
  limit_cents: number
}
export const labels: Record<string, string> = {
  queued: 'В очереди',
  active: 'В работе',
  complete: 'Изготовлена',
  cancelled: 'Отменена',
  inspection: 'На контроле качества',
  stock: 'На складе',
  installed: 'Установлен',
  repair: 'В ремонте',
  scrapped: 'Списан',
  ordered: 'Заказ утверждён',
  manufactured: 'Изготовлен',
  quarantine: 'Изъят по протоколу партии',
  additional: 'Назначена дополнительная проверка',
  accepted: 'Допущен по протоколу',
  'batch-defect': 'Обнаружен брак партии',
  rejected: 'Экземпляр отклонён',
  repaired: 'Ремонт завершён',
  inspect: 'Назначен контроль',
  scrap: 'Списан',
  removed: 'Снят с машины',
}
export const decisions: Record<string, string> = {
  inspect: 'Направить на контроль',
  repair: 'Назначить ремонт',
  scrap: 'Списать экземпляр',
}
export const componentTitle = (d: Drawing) => d.label + ' · ред. ' + d.version + ' · ' + d.title
export const entryTitle = (d: Desk, id: string) => d.entries.find((e) => e.id === id)?.title ?? id
