export type Brand = {
  id: string
  name: string
  country: string
  category: string
  series: string[]
  markets: string[]
  priority: string
  drivers: string[]
  organizations: string[]
  min_reputation: number
  min_popularity: number
  remaining_estimate_cents: number
}
export type Right = { zone: string; share: number; shared: boolean; offset?:number; priority?:number; color?:string|null }
export type Terms = {
  sponsor: string
  org: string
  series: string
  role: string
  start: string
  end: string
  fixed_cents: number
  advance_cents: number
  interval: number
  bonus_cents: number
  podium: number
  rights: Right[]
  exclusive: boolean
  appearances: number
  reputation: number
  compensation_cents: number
  renew: boolean
  person?: string | null
  academy?: string | null
}
export type Supply = {
  product: string
  price_cents: number
  discount_cents: number
  support: boolean
  seat_cents: number
  academy_person?: string | null
  testing: boolean
  development: boolean
}
export type Bid = { terms: Terms; supply?: Supply | null }
export type Offer = Bid & {
  id: string
  actor: string
  status: string
  reason: string
  history: Bid[]
  deadline: string
}
export type Contract = Terms & { id: string; status: string; source: string | null }
export type Market = {
  brands: Brand[]
  offers: Offer[]
  contracts: Contract[]
  supplies: {
    id: string
    org: string
    sponsor: string
    product: string
    sale_cents: number
    discount_cents: number
    cost_cents: number
    support: boolean
    testing: boolean
    development: boolean
    status: string
  }[]
}
export const roles: Record<string, string> = {
  title: 'Титульный спонсор',
  principal: 'Генеральный партнёр',
  technical: 'Технический партнёр',
  partner: 'Спонсор команды',
  personal: 'Личный спонсор',
  academy: 'Партнёр академии',
}
export const zones: Record<string, string> = {
  flank: 'Понтоны / борт',
  upper: 'Верх кузова',
  nose: 'Нос',
  sill: 'Нижняя панель',
  shoulder: 'Передний борт',
  wing: 'Антикрыло',
  suit: 'Экипировка пилота',
  uniform: 'Форма персонала',
  garage: 'Гараж',
  hospitality: 'Инфраструктура',
  press: 'Пресс-волл',
  launch: 'Презентация',
}
export const statuses: Record<string, string> = {
  offered: 'Получено предложение',
  counter: 'Встречное предложение',
  expired: 'Истёк срок',
  signed: 'Договор подписан',
  terminated: 'Расторгнут',
  rejected: 'Отказ',
  superseded: 'Условия пересмотрены',
}
export const priorities: Record<string, string> = {
  technology: 'Техническая кооперация',
  markets: 'Выход на рынки',
  visibility: 'Узнаваемость',
  hospitality: 'Работа с клиентами',
  juniors: 'Поддержка молодых пилотов',
}
