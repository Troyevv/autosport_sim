export const labels: Record<string, string> = {
  engine: 'Двигатель',
  transmission: 'Трансмиссия',
  tyre: 'Шины',
  output: 'Производительность',
  thermal: 'Снижение тепловой нагрузки',
  economy: 'Снижение расхода',
  durability: 'Ресурс',
  shift: 'Быстрое переключение',
  wet: 'Отвод воды',
  warmup: 'Прогрев',
  research: 'Исследование',
  design: 'Разработка',
  bench: 'Нагрузочный стенд',
  lab: 'Лаборатория',
  produce: 'Заказ в производство',
  production: 'Изготовление',
  test: 'Испытание',
  opening: 'Стартовый допуск',
  review: 'На рассмотрении',
  released: 'Выпущена',
  withdrawn: 'Отозвана',
  complete: 'Завершено',
  active: 'В работе',
  queued: 'В очереди',
  next: 'Следующее поколение',
  problem: 'Техническая проблема',
  consult: 'Консультация',
  change: 'Изменение продукции',
  warranty: 'Гарантия',
  study: 'Назначить исследование',
  advise: 'Дать рекомендацию',
  decline: 'Отклонить',
  repair: 'Ремонт',
  replace: 'Замена',
  compensate: 'Компенсация',
  open: 'Открыто',
  client: 'Клиент',
  works: 'Заводская программа',
  priority: 'Приоритетный клиент',
  technical: 'Технический партнёр',
  commercial: 'Коммерческий партнёр',
  balanced: 'Оба поколения',
  current: 'Текущий сезон',
  'stop-current': 'Приостановить текущее поколение',
  manufacturing: 'Производственный брак',
  wear: 'Износ',
  integration: 'Интеграция',
  cooling: 'Охлаждение',
  operation: 'Режим эксплуатации',
  overload: 'Перегрузка',
  staff: 'Ошибка персонала',
  distance: 'Дистанция',
  temperature: 'Температура',
  feedback: 'Обратная связь',
  inspection: 'ОТК',
  stock: 'На складе',
  scrapped: 'Списан',
  inspect: 'Повторная проверка',
  scrap: 'Списать',
  shaft_kw: 'Мощность на валу, кВт',
  torque_nm: 'Момент на валу, Н·м',
  fuel_kg_h: 'Расход топлива, кг/ч',
  thermal_efficiency: 'Тепловой КПД',
  required_cooling_kw: 'Требуемый теплоотвод, кВт',
  first_output_nm: 'Момент на I передаче, Н·м',
  top_output_nm: 'Момент на высшей передаче, Н·м',
  mechanical_loss_kw: 'Механические потери, кВт',
  shift_interruption_ms: 'Разрыв тяги, мс',
  contact_force_n: 'Предельная сила сцепления, Н',
  tread_loss_mm_100km: 'Расчётный износ, мм/100 км',
  warmup_energy_kj: 'Энергия до рабочего окна, кДж',
  mass_kg: 'Масса, кг',
  power_kw: 'Мощность, кВт',
  peak_torque_nm: 'Пиковый момент, Н·м',
  heat_kw: 'Тепловыделение, кВт',
  fuel_g_kwh: 'Удельный расход, г/кВт·ч',
  cooling_flow_kg_s: 'Расход теплоносителя, кг/с',
  design_life_km: 'Проектный ресурс, км',
  efficiency: 'КПД',
  input_limit_nm: 'Допустимый момент, Н·м',
  first_ratio: 'Передаточное число I',
  top_ratio: 'Передаточное число высшей передачи',
  shift_ms: 'Время переключения, мс',
  loss_heat_kw: 'Тепловая нагрузка, кВт',
  vertical_rate_n_mm: 'Радиальная жёсткость, Н/мм',
  loaded_radius_m: 'Радиус под нагрузкой, м',
  friction_coefficient: 'Коэффициент сцепления',
  window_low_c: 'Начало рабочего диапазона, °C',
  window_high_c: 'Конец рабочего диапазона, °C',
  wear_mm_100km: 'Износ, мм/100 км',
  warmup_kj: 'Энергия прогрева, кДж',
  max_load_n: 'Расчётная нагрузка, Н',
  water_clearance_l_s: 'Отвод воды, л/с',
}
export const label = (key: string) => labels[key] || key
export interface Client {
  entry: string
  org: string
  name: string
  series: string
  car: string
  axis: string
  terms: { id: string; maker: string; partnership: string; support: boolean }
  equal: boolean
  stock: string[]
}
export interface Edition {
  calculations: { label: string; results: Record<string, number> }[]
  id: string
  version: number
  title: string
  status: string
  values: Record<string, number>
  forecast: Record<string, [number, number]> | null
}
export interface Product {
  entry: string
  axis: string
  title: string
  series: string
  editions: Edition[]
  years: Record<string, string | null>
}
export interface Case {
  positions?: { name: string; argument: string; stance: string }[]
  id: string
  entry: string
  client: string
  supplier: string
  axis: string
  instance: string
  kind: string
  objective: string
  message: string
  status: string
  reason?: string
  date: string
  project?: string
  compensation_cents?: number
  diagnosis?: {
    causes: Record<string, string[]>
    confidence: number
    covered: boolean
    reviewer: string | null
    observations: {
      reference: string
      channel: string
      value: number
      unit: string
      uncertainty: number
      observation: string
    }[]
  }
}
export interface Desk {
  clients: Client[]
  catalog: Product[]
  projects: {
    id: string
    action: string
    year: number
    axis: string
    entry: string
    status: string
    reason: string | null
    lead: string | null
    worked: number
    required: number
    cost: number
    disposition: string | null
    report: {
      metric: string
      difference: number
      uncertainty: number
      interpretation: string
      finding: string | null
    } | null
    conclusion: string | null
  }[]
  cases: Case[]
  targets: Record<string, string[]>
  inventory: {
    id: string
    serial: string
    axis: string
    status: string
    reason: string | null
    rejected: boolean
    checks: number
    decisions: string[]
  }[]
  allocation: string
  advisor: { seat: string; name: string } | null
  assignments: {
    name: string
    client: string
    product: string
    start: string
    end: string
    channels: string[]
    load: number
  }[]
  history: {
    instance: string
    client: string
    entry: string
    date: string
    contract: string
    warranty: boolean
  }[]
}
