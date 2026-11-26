export const modes = { manual: 'Ручной', partial: 'Частичный', full: 'Полный' }
export const focuses = {
  balanced: 'Баланс программы',
  knowledge: 'Снижение неопределённости',
  readiness: 'Готовность машин',
}
export const decisions = {
  approve: 'Утвердить',
  investigate: 'Запросить исследование',
  delegate: 'Делегировать',
  defer: 'Отложить',
  reject: 'Отклонить',
}
export const statuses: Record<string, string> = {
  open: 'К рассмотрению',
  deferred: 'Отложено',
  decided: 'Решение принято',
  rejected: 'Отклонено',
  superseded: 'Основания изменились',
  queued: 'В очереди',
  active: 'В работе',
  complete: 'Выполнено',
  cancelled: 'Отменено',
  stock: 'На складе',
  repair: 'В ремонте',
  inspection: 'На приёмке',
}
export type Mandate = {
  mode: keyof typeof modes
  focus: keyof typeof focuses
  limit_cents: number
  allow_rent: boolean
}
export type Option = {
  action: string
  title: string
  result: string
  risk: string
  resource: string
  hours: number
  days: number
  cost_cents: number
}
export type Position = { person: string; stance: string; argument: string; confidence: number }
export type Proposal = {
  id: string
  entry: string
  subject: string
  occasion: string
  sources: string[]
  materials: { id: string; kind: string; text: string; section: string | null }[]
  observation: string
  hypothesis: string
  lead: string
  chief: string | null
  confidence: number
  positions: Position[]
  options: Option[]
  recommended: number
  importance: number
  date: string
  status: string
  blocked: string | null
  chosen?: Option
  work?: string
  investigation: Option
  execution: {
    status: string
    worked?: number
    required?: number
    reason?: string
    result?: string
    finished?: string
  } | null
}
export type Desk = {
  mandate: Mandate
  proposals: Proposal[]
  people: Record<string, { name: string; role: string }>
  history: {
    id: string
    date: string
    person: string
    proposal: string
    observation: string
    code: keyof typeof decisions | 'priority' | 'cancel'
    reason: string
    choice: Option | null
    positions: Position[]
  }[]
}
