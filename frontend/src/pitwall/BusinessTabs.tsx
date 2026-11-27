import { navigate, readRoute } from './core/route'

const sections = {
  capital: [
    ['overview', 'Собственность'],
    ['loans', 'Займы'],
    ['assets', 'Активы и программы'],
    ['history', 'История'],
  ],
  budget: [
    ['plan', 'План сезона'],
    ['requests', 'Запросы'],
  ],
  cap: [
    ['financial', 'Cost Cap'],
    ['atr', 'ATR'],
    ['audits', 'Проверки'],
  ],
  rights: [
    ['all', 'Все права'],
    ['pending', 'Требуют размещения'],
    ['fulfilled', 'Выполнены'],
  ],
} as const
type Page = keyof typeof sections
export function businessTab(page: Page) {
  const tab = readRoute().tab
  if (page === 'capital' && tab === 'programs') return 'assets'
  return sections[page].find(([id]) => id === tab)?.[0] || sections[page][0][0]
}
export function BusinessTabs({ page }: { page: Page }) {
  return (
    <nav className="tabs business-tabs" aria-label="Разделы отдела">
      {sections[page].map(([id, label]) => (
        <button
          className={'tab ' + (id === businessTab(page) ? 'active' : '')}
          key={id}
          aria-pressed={id === businessTab(page)}
          onClick={() => navigate(page, id)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
