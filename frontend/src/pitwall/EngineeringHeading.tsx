import type { ReactNode } from 'react'
import './engineering.css'
type Props = { route: string; organization: string; maker: boolean; children?: ReactNode }
const mobile: Record<string, string> = {
  engineering: 'Техническая программа',
  council: 'Решения штаба',
  research: 'Исследования',
  development: 'Разработка и испытания',
  production: 'Производство',
  inventory: 'Склад экземпляров',
  manufacturer: 'Техническая служба',
}
export function EngineeringHeading({ route, organization: org, maker, children }: Props) {
  const titles: Record<string, string[]> = {
    engineering: [
      'ENGINEERING / ПРОГРАММА',
      'Машина начинается с людей',
      'Соберите исследования, чертежи и физические детали в одну техническую программу.',
    ],
    council: [
      'ENGINEERING / ШТАБ',
      'Решения, за которыми стоят люди',
      'Сопоставьте аргументы специалистов, ресурсы и цену выбранного компромисса.',
    ],
    research: [
      'ENGINEERING / ЗНАНИЯ',
      'Сначала — правильный вопрос',
      'Исследования сохраняют знания команды. Чертёж начинается с отдельного решения.',
    ],
    development: [
      'ENGINEERING / РАЗРАБОТКА',
      'От гипотезы к проверке',
      'Управляйте редакциями и испытаниями. Результат проверки определяет следующий шаг.',
    ],
    production: [
      'ENGINEERING / ЦЕХ',
      'Превратить чертёж в деталь',
      'Каждый экземпляр имеет номер, историю контроля и место в сборке.',
    ],
    inventory: [
      'ENGINEERING / СКЛАД',
      'У каждой детали есть история',
      'Готовность определяется конкретным экземпляром, а не наличием чертежа.',
    ],
    manufacturer: [
      maker ? 'MANUFACTURER / ' + org.toUpperCase() : 'ENGINEERING / ПАРТНЁРЫ',
      maker ? 'Технология. Производство. Доверие.' : 'Работа с производителями',
      maker
        ? 'Продукция, клиентские программы и подтверждённые инженерные решения.'
        : 'Договорные права, техническая поддержка и история каждого запроса.',
    ],
  }

  const [section, title, description] = titles[route]
  return (
    <header className="eng-heading">
      <div>
        <small>{section}</small>
        <h1>
          <span className="eng-desktop-title">{title}</span>
          <span className="eng-mobile-title">{mobile[route]}</span>
        </h1>
        <p>{description}</p>
      </div>
      <div className="eng-heading-action">{children}</div>
    </header>
  )
}

export function EngineeringMetrics({
  items,
}: {
  items: [string, React.ReactNode, React.ReactNode, React.ReactNode?][]
}) {
  return (
    <div className="eng-stats">
      {items.map(([label, value, sub]) => (
        <div
          key={label}
          className={
            'eng-stat ' + (typeof value === 'string' && value.includes('€') ? 'eng-money-stat' : '')
          }
        >
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{sub}</small>
        </div>
      ))}
    </div>
  )
}
