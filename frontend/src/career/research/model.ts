export type Priority = 'high' | 'normal' | 'low'
export const priorities: Record<Priority, string> = { high: 'Высокий', normal: 'Обычный', low: 'Низкий' }
export const outcomes = {
  supported: 'Гипотеза поддержана',
  rejected: 'Гипотеза отвергнута',
  inconclusive: 'Недостаточно данных',
}
export type Source = { kind: string; reference: string; label: string }
export type Contribution = { name: string; hours: number; last: string; skill: string }
export type Entry = {
  admitted: boolean
  id: string
  title: string
  concept: string
  regulation: string
  staff: Record<string, string>
  questions: Record<string, string>
  axes: string[]
  rivals: Source[]
}
export type Project = {
  id: string
  entry: string
  axis: string
  priority: Priority
  concept: string
  regulation: string
  source: Source
  hypothesis: string
  allocated_on: string | null
  commissioned: string
  started: string | null
  finished: string | null
  lead: string | null
  cost_cents: number
  required: number
  worked: number
  participants: Record<string, Contribution>
  status: string
  reason: string | null
  remaining_days: number | null
}
export type Report = {
  baseline: string
  id: string
  project: string
  date: string
  axis: string
  concept: string
  regulation: string
  hypothesis: string
  source: Source
  participants: Record<string, Contribution>
  outcome: keyof typeof outcomes
  confidence: number
  conclusion: string
  applicability: Record<string, number>
  citations: string[]
  readers: Record<string, string>
}
export type Desk = {
  projects: Project[]
  reports: Report[]
  entries: Entry[]
  targets: { id: string; title: string }[]
  methods: Record<
    string,
    {
      label: string
      role: string
      hypothesis: string
      hours: number
      cost_cents: number
      planned_days: number
    }
  >
  staff: Record<string, string>
  capacity: { installed_slots: number; available_slots: number; effective_person_days_x100: number }
  spent_cents: number
  lease_spent_cents: number
  lease_daily_cents: number
  shared_free: number
  handovers: {
    mentor_name: string
    recipient_name: string
    id: string
    mentor: string
    recipient: string
    date: string
    report: string
  }[]
}
