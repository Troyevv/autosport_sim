export type Analyst = { id: string; name: string; skill: number }
export type Statement = {
  scope: string
  scopes: string[]
  accounts: string[]
  cash_cents: number
  available_cents: number
  reserve_cents: number
  opening_cents: number
  cash_flow_cents: number
  net_financial_assets_cents: number
  income_cents: number
  expense_cents: number
  profit_cents: number
  overdue_cents: number
  contracts: Record<string, number>
  in_kind: { reference: string; description: string; estimated_cents: number }[]
  activity: Record<string, number>
  width: number
  officer: Analyst | null
  candidates: Analyst[]
  reserves: Record<string, number>
  forecast: { date: string; base_cents: number; negative_cents: number; optimistic_cents: number }[]
  history: { month: string; delta_cents: number }[]
  obligations: {
    id: string
    due: string
    category: string
    contract: string
    amount_cents: number
    overdue: boolean
  }[]
  journal: { date: string; org: string; key: string; source: string; delta_cents: number }[]
}
const categories: Record<string, string> = {
  opening: 'Начальный капитал',
  depreciation:'Амортизация',disposal:'Результат продажи актива',
  allocation: 'Внутренний перевод',
  payroll: 'Оплата коллективов',
  'staff-payroll': 'Зарплаты',
  'driver-backing': 'Финансирование места',
  'backing-exit': 'Прекращение поддержки',
  signing: 'Подписание контракта',
  buyout: 'Выкуп контракта',
  severance: 'Выходное пособие',
  sponsorship: 'Спонсорство',
  prize: 'Призовые',
  merchandise: 'Атрибутика',
  licensing: 'Лицензирование',
  hospitality: 'Гостевые программы',
  supply: 'Поставки',
  production: 'Производство',
  logistics: 'Логистика',
  repairs: 'Ремонт',
  fine: 'Штраф',
  infrastructure: 'Инфраструктура',
  marketing: 'Маркетинг',
  academy: 'Академия',
  interest: 'Проценты',
  engineering: 'Разработка',
  loan: 'Заём',
  principal: 'Возврат займа',
  investment: 'Инвестиции',
  dividend: 'Дивиденды',
  'asset-purchase': 'Покупка активов',
}
export const category = (id: string) => categories[id] ?? id
