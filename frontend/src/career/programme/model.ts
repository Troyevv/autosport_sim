export type Proposal = {
  id: string
  title: string
  result: string
  risk: string
  cost_cents: number
  blocked: string | null
  status: string
  positions: { person: string; stance: string; argument: string; confidence: number }[]
}
export type Part = {
  axis: string
  label: string
  specification: string
  status: string
  risk: string
  ready: boolean
  next_cost_cents: number
  fits: { entry: string; instance: string; label: string }[]
  serials: string[]
  targets: { entry: string; number: string; status: string }[]
  inventory: Record<string, number>
  forecast: Record<string, [number, number]>
  cost_cents: number
}
export type Plan = {
  id: string
  year: number
  entry: string
  series: string
  name: string
  category: string
  concept: string
  strategy: string
  regulation: string
  staff: Record<string, string>
  proposals: Proposal[]
  packages: {
    id: string
    withdrawn?: boolean
    goal: string
    stage: string
    due: string
    advice: string
    parts: Part[]
    ready: number
    installed: number
    required: number
    cost_cents: number
  }[]
  rule: {
    origin: string
    announced: string
    effective: string
    freeze: string | null
    text: string
    clarification: string
    source: string | null
  }
  calendar: {
    id: string
    label: string
    kind: string
    start: string
    finished: string | null
    forecast_end: string
    required: number
    worked: number
    reason: string | null
    cost_cents: number
    reserved_cents: number
    lead: string | null
  }[]
  documents: { reference: string; component: string; issuer: string; design: boolean }[]
  knowledge: { id: string; conclusion: string; confidence: number; applicable: number }[]
  certificates: Record<string, { date: string }>
  violations: { instance: string; decision: string }[]
  spent_cents: number
  reserved_cents: number
  concept_costs: Record<string, number>
}
export type Desk = {
  year: number
  plans: Plan[]
  priority: string
  people: Record<string, string>
  goal: string
  mandate: { mode: string }
  capacity: { kind: string; label: string; free: number; used: number }[]
  finance: {
    available_cents: number
    cap: { remaining_cents: number } | null
    plan: { allocations: Record<string, number> } | null
    actual: Record<string, number>
    reserved: Record<string, number>
  }
  atr: {
    period: { number: number; end_exclusive: string }
    used: Record<string, number>
    limits: Record<string, number> | null
  } | null
  history: { id: string; date: string; plan: string | null; person: string; title: string; reason: string }[]
}
export const priorities: Record<string, string> = {
  balanced: 'Оба поколения',
  current: 'Приоритет текущего',
  next: 'Приоритет следующего',
  'stop-current': 'Остановить развитие текущего',
}
export const strategies: Record<string, string> = {
  continue: 'Продолжение концепции',
  revise: 'Пересмотр компоновки',
  replace: 'Новая концепция',
}
export const kinds: Record<string, string> = {
  research: 'Исследование',
  design: 'Разработка',
  test: 'Испытания',
  produce: 'Производство',
}
export const leads: Record<string, string> = {
  floor: 'aero',
  'rear-wing': 'aero',
  chassis: 'chassis',
  suspension: 'chassis',
  cooling: 'performance',
  engine: 'performance',
  transmission: 'performance',
  tyre: 'reliability',
  brakes: 'reliability',
}

export const deploymentLabels: Record<string, string> = {
  installed: 'Установлен',
  allocated: 'Выделен со склада',
  waiting: 'Ожидает экземпляр',
  priority: 'Ожидает по приоритету пилотов',
  incompatible: 'Несовместим',
  shared: 'Учтено в другом пакете',
}

export function regulationName(world: import('../api').World, id: string) {
  const rule = world.engineering.technical_rules?.[id]
  if (!rule) return 'Редакция регламента не указана'
  const season = world.engineering.seasons[rule.season]
  return [rule.category, season?.year, 'ред. ' + rule.version].filter(Boolean).join(' · ')
}
