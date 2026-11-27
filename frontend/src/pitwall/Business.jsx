import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useGame, useStored, money, dateLabel } from './core'
import {
  Badge,
  Button,
  ContextMenu,
  DataTable,
  EmptyState,
  Facts,
  Icon,
  Input,
  Meter,
  PageHeading,
  Panel,
  Select,
  Stat,
  Tabs,
} from './ui'
import { PersonPortrait } from './visuals'
import { useOrder } from '../career/finance/useOrder'
import { usePersonnel } from '../career/staff/model'
import './business.css'
import {
  ContractFrame,
  ContractClause,
  ContractComparison,
  ContractImpact,
  ContractDocument,
  ContractTimeline,
  ContractSeal,
  ContractSigningSummary,
  openContractForm,
} from './v2/Contracts'
const LABEL = {
  personnel: 'Персонал',
  engineering: 'Разработка',
  operations: 'Соревнования',
  commercial: 'Коммерция',
  facilities: 'Инфраструктура',
  reserve: 'Резерв',
  payroll: 'Зарплаты',
  opening: 'Начальный капитал',
  'driver-backing': 'Финансирование пилотов',
  infrastructure: 'Инфраструктура',
  'asset-purchase': 'Покупка активов',
  sponsorship: 'Спонсорство',
  supply: 'Поставки',
  loan: 'Заём',
  transfer: 'Перевод',
  dividend: 'Дивиденды',
  maintenance: 'Обслуживание',
  merchandise: 'Мерч',
  research: 'Исследования',
  production: 'Производство',
  development: 'Разработка',
  design: 'Проектирование',
  testing: 'Испытания',
  shipping: 'Логистика',
  warranty: 'Гарантия',
  support: 'Техподдержка',
  engine: 'Двигатель',
  transmission: 'Трансмиссия',
  tyre: 'Шины',
  chassis: 'Шасси',
  client: 'Клиент',
  technical: 'Технический партнёр',
  works: 'Заводская программа',
  title: 'Титульный',
  partner: 'Партнёр',
  academy: 'Академия',
  personal: 'Личный',
  press: 'Пресс-стена',
  hospitality: 'Гостевая зона',
  garage: 'Боксы',
  suit: 'Комбинезон',
  sidepod: 'Понтоны',
  rearwing: 'Заднее крыло',
  frontwing: 'Переднее крыло',
  nose: 'Нос',
  body: 'Кузов',
  signed: 'Подписан',
  pending: 'Ожидает ответа',
  counter: 'Ответ партнёра',
  accepted: 'Принят',
  rejected: 'Отклонён',
  terminated: 'Расторгнут',
  active: 'Работает',
  construction: 'Строится',
  upgrade: 'Модернизируется',
  lease: 'Аренда',
  outsource: 'Аутсорсинг',
  premium: 'Премиум',
  standard: 'Стандарт',
  budget: 'Доступный',
}
Object.assign(LABEL, {
  adhesives: 'Клеевые технологии',
  airline: 'Авиалинии',
  apparel: 'Одежда',
  'auto-parts': 'Автозапчасти',
  'auto-retail': 'Продажа автомобилей',
  automotive: 'Автопром',
  aviation: 'Авиация',
  banking: 'Банки',
  batteries: 'Аккумуляторы',
  bearings: 'Подшипники',
  bodywork: 'Кузовные детали',
  brakes: 'Тормоза',
  brokerage: 'Брокерские услуги',
  'car-care': 'Уход за автомобилем',
  'car-rental': 'Аренда автомобилей',
  circuits: 'Автодромы',
  cleaning: 'Чистящие средства',
  coatings: 'Покрытия',
  coffee: 'Кофе',
  'commercial-vehicles': 'Коммерческий транспорт',
  communications: 'Связь',
  components: 'Компоненты',
  computing: 'Компьютеры',
  cruises: 'Круизы',
  'crypto-exchange': 'Криптовалютная биржа',
  cybersecurity: 'Кибербезопасность',
  drivetrain: 'Трансмиссии',
  ecommerce: 'Онлайн-торговля',
  electronics: 'Электроника',
  'energy-drink': 'Энергетические напитки',
  'engine-parts': 'Детали двигателя',
  'engineering-software': 'Инженерное ПО',
  'enterprise-it': 'Корпоративные ИТ',
  entertainment: 'Развлечения',
  filtration: 'Фильтрация',
  'finance-app': 'Финансовые приложения',
  food: 'Продукты питания',
  footwear: 'Обувь',
  freight: 'Грузоперевозки',
  fuel: 'Топливо',
  gaming: 'Игровая индустрия',
  heating: 'Отопление',
  'identity-software': 'Управление доступом',
  imaging: 'Визуальные технологии',
  industrial: 'Промышленность',
  insurance: 'Страхование',
  'insurance-software': 'Страховое ПО',
  interiors: 'Интерьеры',
  juice: 'Соки',
  'kart-chassis': 'Шасси картов',
  logistics: 'Логистика',
  lottery: 'Лотерея',
  lubricants: 'Смазочные материалы',
  machinery: 'Оборудование',
  machining: 'Мехобработка',
  materials: 'Материалы',
  mining: 'Горная промышленность',
  navigation: 'Навигация',
  networking: 'Сетевое оборудование',
  nutrition: 'Спортивное питание',
  'office-equipment': 'Офисная техника',
  optics: 'Оптика',
  packaging: 'Упаковка',
  payments: 'Платежи',
  peripherals: 'Периферия',
  'precious-metals': 'Драгоценные металлы',
  racewear: 'Гоночная экипировка',
  remittances: 'Денежные переводы',
  'safety-equipment': 'Защитное оборудование',
  seals: 'Уплотнения',
  semiconductors: 'Полупроводники',
  simulation: 'Симуляторы',
  'soft-drinks': 'Безалкогольные напитки',
  software: 'Программное обеспечение',
  'sport-retail': 'Спортивные товары',
  springs: 'Пружины',
  steel: 'Сталь',
  steering: 'Рулевое управление',
  'storage-it': 'Хранение данных',
  streaming: 'Стриминг',
  suspension: 'Подвеска',
  teamwear: 'Командная одежда',
  telematics: 'Телематика',
  tools: 'Инструменты',
  toys: 'Игрушки',
  trading: 'Торговля',
  travelwear: 'Одежда для путешествий',
  'tyre-retail': 'Продажа шин',
  watches: 'Часы',
  water: 'Вода',
  wheels: 'Колёса',
  workwear: 'Рабочая одежда',
})
const ALLOCS = ['personnel', 'engineering', 'operations', 'commercial', 'facilities', 'reserve']
const PALETTE = ['#b7aaa0', 'var(--org-accent)', '#8da698', '#c49c70', '#b8a1b9', '#79736e']
const TABS = {
  finance: [
    ['overview', 'Обзор'],
    ['results', 'Результат'],
    ['journal', 'Журнал'],
    ['terms', 'Обязательства'],
    ['forecast', 'Прогноз'],
    ['report', 'Отчёт'],
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
  facilities: [
    ['organization', 'База'],
    ['capacity', 'Мощности'],
    ['rent', 'Аренда'],
    ['bookings', 'Бронирования'],
  ],
  capital: [
    ['overview', 'Собственность'],
    ['loans', 'Займы'],
    ['assets', 'Активы и программы'],
    ['history', 'История'],
  ],
  commercial: [
    ['brands', 'Партнёры'],
    ['offers', 'Переговоры'],
    ['contracts', 'Контракты'],
    ['supplies', 'Поставки'],
  ],
  rights: [
    ['all', 'Все права'],
    ['pending', 'Требуют размещения'],
    ['fulfilled', 'Выполнены'],
  ],
  economy: [
    ['licenses', 'Мерч и лицензии'],
    ['annual', 'Годовой цикл'],
    ['markets', 'Регионы'],
    ['supply', 'Экономика поставок'],
  ],
}
const TITLES = {
  finance: 'Финансы',
  budget: 'Бюджет сезона',
  cap: 'Регламентные лимиты',
  facilities: 'Инфраструктура',
  capital: 'Собственность и капитал',
  commercial: 'Коммерческий центр',
  rights: 'Рекламные права',
  economy: 'Экономика организации',
}
const txt = (k) => LABEL[k] || k || 'Не указано'
const uid = () => crypto.randomUUID()
const arr = (v) => (Array.isArray(v) ? v : Object.values(v || {}))
const sum = (a, fn = (x) => x) => a.reduce((n, x) => n + Number(fn(x) || 0), 0)
const cents = (v) => Math.round(Number(String(v ?? '0').replace(',', '.')) * 100)
const euros = (v) => Number(v || 0) / 100
const later = (d, days) =>
  new Date(new Date(d + 'T12:00:00Z').getTime() + days * 864e5).toISOString().slice(0, 10)
const period = (s, e) => dateLabel(s) + ' — ' + dateLabel(e)
const validCents = (v) => Number.isSafeInteger(v) && v >= 0
const delta = (t) =>
  t.delta_cents ?? (t.kind === 'income' ? Math.abs(t.amount_cents || 0) : -Math.abs(t.amount_cents || 0))
const field = (name, label, value, type = 'number', extra = {}) => ({
  name,
  label,
  value,
  type,
  ...(type === 'number' ? { min: 0, step: '0.01' } : {}),
  ...extra,
})
const opts = (obj) => Object.entries(obj || {}).map(([value, label]) => ({ value, label }))
function note(text) {
  return (
    <p className="business-note">
      <Icon name="Info" size={15} />
      {text}
    </p>
  )
}
function useBusiness() {
  const g = useGame(),
    org = g.game.career.org,
    base = g.game.projections
  const order = useOrder(g.game.career, g.updateCareer)
  const run = (name, payload) => order.send('finance-' + name, payload, true)
  const action = (name, payload) => run(name, payload).catch((e) => g.notify(e.message))
  const save = async (name, payload) => {
    await run(name, payload)
    g.closeDialog()
  }
  const orgName = (id) =>
    g.world.organizations[id]?.name ||
    (id === 'person:player'
      ? 'Личный счёт'
      : id?.startsWith('owner:')
        ? 'Капитал владельца'
        : id?.startsWith('academy:')
          ? g.game.career.academies?.find((a) => 'academy:' + a.id === id)?.name || 'Академия'
          : id?.startsWith('group:')
            ? 'Группа компаний'
            : id === 'consolidated'
              ? 'Консолидированный отчёт'
              : g.world.programs[id]
                ? g.world.championships[g.world.programs[id].championship]?.name
                : id || 'Не указано')
  const personName = (id) => g.game.personnel.find((p) => p.id === id)?.name || g.world.names[id] || id
  return {
    g,
    org,
    base,
    run,
    action,
    save,
    orgName,
    personName,
    available: g.game.career.available_cents,
    cash: g.game.career.account.cash_cents,
  }
}
function csvDownload(filename, rows) {
  const text = rows
    .map((r) => r.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(';'))
    .join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 500)
}
function CashChart({ forecast = [], adjustment = 0, large = false }) {
  const [scenario, setScenario] = useState('base_cents'),
    [selected, setSelected] = useState(0)
  const rows = forecast.map((x) => ({ ...x, value: x[scenario] + adjustment })),
    max = Math.max(...rows.map((x) => x.value), 1),
    min = Math.min(...rows.map((x) => x.value), max * 0.8),
    range = max - min || 1
  const points = rows.map((x, i) => [
    25 + (i * 650) / Math.max(1, rows.length - 1),
    120 - ((x.value - min) / range) * 90,
  ])
  const picked = rows[Math.min(selected, rows.length - 1)]
  return (
    <div className={'cash-chart ' + (large ? 'large' : '')}>
      <div className="chart-heading">
        <div>
          <span className="eyebrow">Горизонт · 6 месяцев</span>
          <h3>Денежная позиция</h3>
        </div>
        <select
          value={scenario}
          aria-label="Сценарий прогноза"
          onChange={(e) => setScenario(e.target.value)}
        >
          <option value="base_cents">Базовый сценарий</option>
          <option value="negative_cents">Негативный</option>
          <option value="optimistic_cents">Оптимистичный</option>
        </select>
      </div>
      {rows.length ? (
        <>
          <div className="chart-focus">
            <strong>{money(picked?.value)}</strong>
            <small>{dateLabel(picked?.date)}</small>
          </div>
          <svg viewBox="0 0 700 155" role="img" aria-label="Прогноз денежных средств">
            <defs>
              <linearGradient id="cashFill" x2="0" y2="1">
                <stop stopColor="var(--org-accent)" stopOpacity=".3" />
                <stop offset="1" stopColor="var(--org-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[30, 75, 120].map((y) => (
              <line key={y} x1="25" x2="675" y1={y} y2={y} stroke="#504942" strokeDasharray="3 5" />
            ))}
            <polygon
              points={'25,145 ' + points.map((x) => x.join(',')).join(' ') + ' 675,145'}
              fill="url(#cashFill)"
            />
            <polyline
              points={points.map((x) => x.join(',')).join(' ')}
              fill="none"
              stroke="var(--org-accent)"
              strokeWidth="2.5"
            />
            {points.map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={selected === i ? 5 : 3} fill="var(--org-accent)" />
                <circle
                  cx={x}
                  cy={y}
                  r="16"
                  fill="transparent"
                  tabIndex="0"
                  role="button"
                  aria-label={dateLabel(rows[i].date) + ': ' + money(rows[i].value)}
                  onClick={() => setSelected(i)}
                  onFocus={() => setSelected(i)}
                  onMouseEnter={() => setSelected(i)}
                />
              </g>
            ))}
          </svg>
          <div className="chart-months">
            {rows.map((x, i) => (
              <button
                key={x.date}
                className={i === selected ? 'active' : ''}
                onClick={() => setSelected(i)}
              >
                {new Date(x.date).toLocaleDateString('ru', { month: 'short' })}
              </button>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="Прогноз не раскрыт"
          description="Для выбранного счёта нет опубликованного прогноза."
        />
      )}
    </div>
  )
}
function FinanceView({ tab }) {
  const b = useBusiness(),
    { g, org, base } = b,
    [scope, setScope] = useState(org),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('all')
  const contexts = g.game.financeContexts || {},
    scopes = base.finance?.scopes || [org]
  const selected = scopes.includes(scope) ? scope : org,
    view =
      contexts[selected] ||
      (selected === org ? base.finance : selected === 'person:player' ? base['finance-player'] : null)
  const balance = view?.cash_cents
  function scopeName(id) {
    return b.orgName(id)
  }
  function contractName(id) {
    const person = g.game.personnel.find((p) => id?.includes(p.id))
    if (person) return person.name
    const all = [...arr(base.commercial?.contracts), ...arr(base.commercial?.supplies)]
    const contract = all.find((c) => c.id === id)
    return contract
      ? base.commercial?.brands.find((x) => x.id === contract.sponsor)?.name ||
          b.orgName(contract.sponsor)
      : id?.startsWith('base:')
        ? Object.values(base.facilities?.assets || []).find((x) => x.id === id)?.kind
          ? txt(base.facilities.types[base.facilities.assets.find((x) => x.id === id).kind])
          : 'Объект инфраструктуры'
        : txt(id)
  }
  const journal = arr(view?.journal).filter(
    (x) =>
      (category === 'all' || x.category === category || x.source === category) &&
      (!query ||
        [x.description, contractName(x.contract), txt(x.category), txt(x.source), dateLabel(x.date)]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())),
  )
  const terms = (view?.obligations || []).filter(
    (x) =>
      (category === 'all' || x.category === category) &&
      (!query ||
        [contractName(x.contract), txt(x.category), x.due]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())),
  )
  const categoryOptions = [
    { value: 'all', label: 'Все статьи' },
    ...[
      ...new Set(
        [...(view?.obligations || []), ...(view?.journal || [])].map((x) => x.category || x.source),
      ),
    ]
      .filter(Boolean)
      .map((x) => ({ value: x, label: txt(x) })),
  ]
  function transfer() {
    const accounts = [
      ...new Set([
        org,
        ...(view?.accounts || []).filter((x) => !x.startsWith('person:')),
        ...scopes.filter((x) => x === org || g.world.programs[x]),
      ]),
    ]
    if (accounts.length < 2) {
      g.notify('В этом контуре нет второго доступного счёта.', 'warning')
      return
    }
    g.openForm({
      title: 'Перевод между счетами',
      description:
        'Средства остаются внутри организации. Личный капитал не смешивается с бюджетом команды.',
      fields: [
        field('from', 'Откуда', accounts[0], 'select', {
          options: accounts.map((x) => ({ value: x, label: scopeName(x) })),
        }),
        field('to', 'Куда', accounts[1], 'select', {
          options: accounts.map((x) => ({ value: x, label: scopeName(x) })),
        }),
        field('amount', 'Сумма, €', 1000),
      ],
      validate: (v) =>
        v.from === v.to
          ? 'Выберите разные счета.'
          : !validCents(cents(v.amount)) || cents(v.amount) <= 0
            ? 'Введите положительную сумму.'
            : null,
      onSubmit: (v) =>
        b.run('transfer', { payer: v.from, recipient: v.to, amount_cents: cents(v.amount) }),
    })
  }
  function reserve() {
    const accounts = (view.accounts || []).filter((x) => !x.startsWith('person:'))
    g.openForm({
      title: 'Резерв доступных средств',
      description:
        'Резерв уменьшает свободные деньги, но не меняет фактический остаток. Договорные обязательства учитываются отдельно.',
      fields: [
        field('account', 'Счёт', accounts[0], 'select', {
          options: accounts.map((x) => ({ value: x, label: scopeName(x) })),
        }),
        field('amount', 'Целевой резерв, €', euros(view.reserves?.[accounts[0]] ?? 0)),
      ],
      onSubmit: (v) => b.run('reserve', { account: v.account, amount_cents: cents(v.amount) }),
    })
  }
  function assignOfficer() {
    g.openForm({
      title: 'Ответственный за прогноз',
      description: 'Сотрудник, который подготовит следующий финансовый обзор.',
      fields: [
        field('person', 'Сотрудник', view?.officer?.id, 'select', {
          options: (view?.candidates || []).map((p) => ({
            value: p.id,
            label: p.name + ' · аналитика ' + p.skill,
          })),
        }),
      ],
      onSubmit: (v) => b.run('officer', { person: v.person }),
    })
  }
  function exportReport() {
    csvDownload('autosport-finance-' + selected + '.csv', [
      ['AUTOSPORT SIM', g.game.career.date, 'EUR cents'],
      ['Счёт', scopeName(selected)],
      ['Денежные средства', balance],
      ['Доступно', view?.available_cents || 0],
      [],
      ['Дата', 'Статья', 'Описание', 'Сумма, центы'],
      ...journal.map((x) => [
        x.date,
        txt(x.category || x.source),
        x.description || x.source,
        x.delta_cents,
      ]),
    ])
    g.notify('Финансовый отчёт сохранён в CSV')
  }
  if (!view)
    return (
      <EmptyState
        title="Этот финансовый контур не загружен"
        description="Данные другой организации не используются вместо текущего счёта."
        action={<Button onClick={() => setScope(org)}>К счёту организации</Button>}
      />
    )
  const officer = g.game.personnel.find((x) => x.id === view.officer?.id)
  return (
    <div className="business-stack">
      <div className="finance-toolbar">
        <Select
          label="Финансовый контур"
          value={selected}
          onChange={(e) => {
            setScope(e.target.value)
            setQuery('')
            setCategory('all')
          }}
          options={scopes.map((x) => ({ value: x, label: scopeName(x) }))}
        />
        <div className="heading-actions">
          <Button variant="secondary" icon={<Icon name="ArrowLeftRight" />} onClick={transfer}>
            Перевести средства
          </Button>
          {selected !== 'person:player' && (
            <Button variant="ghost" onClick={reserve}>
              Изменить резерв
            </Button>
          )}
          <Button variant="ghost" icon={<Icon name="Download" />} onClick={exportReport}>
            CSV
          </Button>
        </div>
      </div>
      {(tab === 'overview' || tab === 'forecast') && (
        <div className="finance-command">
          <section className="cash-hero">
            <span className="eyebrow">
              {selected === 'person:player' ? 'Личные средства' : 'Денежная позиция'}
            </span>
            <h2>{money(balance, true)}</h2>
            <span className="cash-precise">{money(balance)}</span>
            <div className="cash-rule" />
            <Facts
              rows={[
                ['Доступно сейчас', money(view.available_cents || 0)],
                ['Резерв обязательств', money(view.reserve_cents || 0)],
                ['Просрочено', money(view.overdue_cents)],
              ]}
            />
            <p>
              {selected === 'person:player'
                ? 'Этот счёт принадлежит игроку. Покупка доли и личные расходы не используют кассу команды.'
                : view.recommendation}
            </p>
          </section>
          <CashChart forecast={view.forecast} large={tab === 'forecast'} />
        </div>
      )}
      {tab === 'overview' && (
        <>
          <div className="metric-strip">
            <Stat label="Доход" value={money(view.income_cents, true)} detail="Начисленный результат" />
            <Stat label="Расход" value={money(view.expense_cents, true)} detail="Фактические расходы" />
            <Stat
              label="Прибыль / убыток"
              value={money(view.profit_cents, true)}
              detail="Не равна остатку денег"
            />
            <Stat
              label="Денежный поток"
              value={money(view.cash_flow_cents || 0, true)}
              detail="Поступления минус выплаты"
            />
          </div>
          <div className="business-split">
            <Panel
              title="Ближайшие обязательства"
              subtitle="Срок и влияние на денежную позицию"
              actions={
                <Button variant="ghost" onClick={() => g.setTab('terms')}>
                  Все {view.obligations.length}
                </Button>
              }
            >
              <div className="obligation-list">
                {view.obligations.slice(0, 5).map((x) => (
                  <button
                    key={x.id}
                    className="obligation-line"
                    onClick={() =>
                      g.openDialog({
                        title: contractName(x.contract),
                        content: (
                          <Facts
                            rows={[
                              ['Срок', dateLabel(x.due)],
                              ['Статья', txt(x.category)],
                              ['Сумма', money(x.amount_cents)],
                              ['Статус', x.overdue ? 'Просрочено' : 'Ожидает срока'],
                            ]}
                          />
                        ),
                      })
                    }
                  >
                    <span className="day-stamp">
                      {new Date(x.due).getDate()}
                      <small>
                        {new Date(x.due).toLocaleDateString('ru', {
                          month: 'short',
                        })}
                      </small>
                    </span>
                    <span>
                      <strong>{contractName(x.contract)}</strong>
                      <small>{txt(x.category)}</small>
                    </span>
                    <b className={x.amount_cents < 0 ? '' : 'text-good'}>{money(x.amount_cents)}</b>
                  </button>
                ))}
                {!view.obligations.length && (
                  <EmptyState
                    title="Обязательств нет"
                    description="На выбранном счёте нет предстоящих выплат."
                  />
                )}
              </div>
            </Panel>
            <Panel title="Финансовая служба">
              <div className="finance-officer">
                {officer && <PersonPortrait person={officer} size={90} />}
                <div>
                  <span className="eyebrow">Ответственный за обзор</span>
                  <h3>{officer?.name || view.officer?.name || 'Не назначен'}</h3>
                  <p>Точность прогноза зависит от исходных данных и качества аналитики.</p>
                </div>
              </div>
              <div className="heading-actions">
                <Button variant="secondary" onClick={assignOfficer}>
                  Назначить
                </Button>
                {officer && (
                  <Button variant="ghost" onClick={() => g.openPerson(officer.id)}>
                    Досье
                  </Button>
                )}
              </div>
              {note('Прогноз учитывает текущие обязательства организации и остатки на счетах.')}
            </Panel>
          </div>
        </>
      )}
      {tab === 'results' && (
        <Panel
          title="Результат по направлениям"
          subtitle="Начисления и кассовые движения показаны раздельно"
        >
          <div className="result-bars">
            {Object.entries(view.breakdown || {}).map(([k, v]) => (
              <div key={k}>
                <span>{txt(k)}</span>
                <div className="result-tracks">
                  <i
                    style={{
                      width: Math.max(2, (v.income_cents / Math.max(view.income_cents, 1)) * 100) + '%',
                    }}
                  />
                  <i
                    className="expense"
                    style={{
                      width:
                        Math.max(2, (v.expense_cents / Math.max(view.expense_cents, 1)) * 100) + '%',
                    }}
                  />
                </div>
                <strong>{money(v.income_cents - v.expense_cents)}</strong>
              </div>
            ))}
          </div>
          {!Object.keys(view.breakdown || {}).length && (
            <EmptyState
              title="Начислений за период пока нет"
              description="Начальные деньги организации показаны в журнале как капитал. Они не записаны в операционный доход."
            />
          )}
          <Facts
            rows={[
              ['Чистые финансовые активы', money(view.net_financial_assets_cents)],
              ['Начальные деньги', money(view.opening_cents)],
              ['Изменение кассы', money(view.cash_flow_cents || 0)],
            ]}
          />
        </Panel>
      )}
      {(tab === 'journal' || tab === 'terms') && (
        <Panel
          title={tab === 'journal' ? 'Финансовый журнал' : 'Календарь обязательств'}
          subtitle={
            tab === 'journal'
              ? 'Каждая запись имеет дату, источник и сумму.'
              : 'Здесь видны условия уже заключённых договоров.'
          }
        >
          <div className="toolbar">
            <Input
              label="Поиск"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Человек, статья, назначение"
            />
            <Select
              label="Статья"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={categoryOptions}
            />
          </div>
          <DataTable
            rows={tab === 'journal' ? journal : terms}
            columns={
              tab === 'journal'
                ? [
                    {
                      key: 'date',
                      label: 'Дата',
                      render: (x) => dateLabel(x.date),
                    },
                    {
                      key: 'source',
                      label: 'Операция',
                      render: (x) => <span>{x.description || txt(x.source)}</span>,
                    },
                    {
                      key: 'category',
                      label: 'Статья',
                      render: (x) => txt(x.category || x.source),
                    },
                    {
                      key: 'delta_cents',
                      label: 'Сумма',
                      render: (x) => (
                        <b className={x.delta_cents >= 0 ? 'text-good' : ''}>{money(x.delta_cents)}</b>
                      ),
                    },
                  ]
                : [
                    {
                      key: 'due',
                      label: 'Срок',
                      render: (x) => dateLabel(x.due),
                    },
                    {
                      key: 'contract',
                      label: 'Основание',
                      render: (x) => contractName(x.contract),
                    },
                    {
                      key: 'category',
                      label: 'Статья',
                      render: (x) => txt(x.category),
                    },
                    {
                      key: 'amount_cents',
                      label: 'Сумма',
                      render: (x) => money(x.amount_cents),
                    },
                    {
                      key: 'overdue',
                      label: 'Статус',
                      render: (x) => (
                        <Badge tone={x.overdue ? 'danger' : 'neutral'}>
                          {x.overdue ? 'Просрочено' : 'По графику'}
                        </Badge>
                      ),
                    },
                  ]
            }
            empty="Ничего не найдено"
          />
        </Panel>
      )}
      {tab === 'forecast' && (
        <Panel title="Сценарии прогноза" subtitle="Оценки API на ближайшие шесть месяцев">
          <DataTable
            rows={view.forecast || []}
            columns={[
              { key: 'date', label: 'Месяц', render: (x) => dateLabel(x.date) },
              ...['negative_cents', 'base_cents', 'optimistic_cents'].map((key, i) => ({
                key,
                label: ['Негативный', 'Базовый', 'Оптимистичный'][i],
                render: (x) => money(x[key]),
              })),
            ]}
          />
          {note(
            'Разброс сценариев отражает неопределённость. Он не гарантирует доходность или принятие коммерческих предложений.',
          )}
        </Panel>
      )}
      {tab === 'report' && (
        <Panel
          title="Отчёт для руководства"
          actions={
            <Button onClick={exportReport} icon={<Icon name="Download" />}>
              Скачать отчёт
            </Button>
          }
        >
          <div className="report-cover">
            <span className="eyebrow">AUTOSPORT SIM / FINANCIAL REVIEW</span>
            <h2>{scopeName(selected)}</h2>
            <p>{dateLabel(g.game.career.date)} · EUR</p>
            <Facts
              rows={[
                ['Средства', money(balance)],
                ['Доступно', money(view.available_cents || 0)],
                ['Обязательств', view.obligations.length],
                ['Прибыль', money(view.profit_cents)],
              ]}
            />
          </div>
          {note('CSV содержит операции выбранного счёта. Суммы выгружаются целыми евроцентами.')}
        </Panel>
      )}
    </div>
  )
}
function BudgetView({ tab, cap = false }) {
  const b = useBusiness(),
    { g } = b,
    [year, setYear] = useState(g.game.career.date.slice(0, 4))
  const result = usePersonnel(
    'careers/' + g.game.career.id + '/budget?year=' + year,
    g.game.career.revision,
  )
  const report = result.data || (String(b.base.budget?.year) === year ? b.base.budget : null)
  const plan = report?.plan,
    alloc = plan?.allocations || {},
    total = sum(Object.values(alloc)),
    requests = arr(report?.requests),
    canApprove = g.role !== 'manager'
  const [draft, setDraft] = useState(alloc)
  useEffect(() => setDraft(alloc), [year, g.scope, plan])
  function saveBudget(allocations) {
    const pending = requests.find((x) => x.status === 'pending')
    if (canApprove && pending)
      return b.run('budget-decide', {
        proposal: pending.id,
        response: 'adjust',
        allocations,
        reason: 'Пересмотр распределения по статьям',
      })
    return b.run('budget-propose', {
      year: Number(year),
      allocations,
      reason: 'Сезонный план организации',
    })
  }
  function savePlan() {
    const allocations = Object.fromEntries(ALLOCS.map((k) => [k, Number(draft[k] || 0)]))
    if (Object.values(allocations).some((n) => !validCents(n))) {
      g.notify('Проверьте суммы бюджета.', 'warning')
      return
    }
    const amount = sum(Object.values(allocations))
    g.confirm({
      title: canApprove ? 'Утвердить бюджет ' + year : 'Отправить бюджет владельцу',
      body:
        'Общая сумма ' +
        money(amount) +
        '. Бюджет ограничивает расходы по статьям; остаток денег остаётся отдельной величиной.',
      confirmLabel: canApprove ? 'Утвердить' : 'Отправить запрос',
      onConfirm: () => saveBudget(allocations),
    })
  }
  function request() {
    g.openForm({
      title: 'Запрос на перераспределение бюджета',
      fields: [
        field('category', 'Статья', 'engineering', 'select', {
          options: ALLOCS.map((k) => ({ value: k, label: txt(k) })),
        }),
        field('amount', 'Дополнительная сумма, €', 100000),
        field('reason', 'Обоснование', '', 'textarea', {
          required: true,
          wide: true,
        }),
      ],
      validate: (v) => (cents(v.amount) <= 0 ? 'Сумма должна быть больше нуля.' : null),
      onSubmit: (v) =>
        b.run('budget-propose', {
          year: Number(year),
          reason: v.reason,
          allocations: { ...alloc, [v.category]: (alloc[v.category] || 0) + cents(v.amount) },
        }),
    })
  }
  if (cap) {
    const limit = report?.cap,
      atr = report?.atr
    return (
      <div className="business-stack">
        <div className="toolbar">
          <Select
            label="Сезон"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            options={[2025, 2026].map((y) => ({
              value: String(y),
              label: String(y),
            }))}
          />
          <Badge>{g.world.championships[g.game.career.series]?.name}</Badge>
        </div>
        {tab === 'financial' &&
          (limit ? (
            <>
              <div className="limit-hero">
                <span className="eyebrow">{limit.version}</span>
                <h2>{money(limit.remaining_cents, true)}</h2>
                <p>Остаток регламентного лимита</p>
                <Meter value={limit.spent_cents + limit.committed_cents} max={limit.limit_cents} />
                <div className="metric-strip">
                  <Stat label="Лимит" value={money(limit.limit_cents, true)} />
                  <Stat label="Учтено" value={money(limit.spent_cents, true)} />
                  <Stat label="Обязательства" value={money(limit.committed_cents, true)} />
                  <Stat label="Прогноз" value={money(limit.forecast_cents, true)} />
                </div>
              </div>
              <Panel title="Границы финансового регламента">
                <Facts
                  rows={[
                    ['Период', period(limit.start, limit.end)],
                    ['Календарь', limit.rounds + ' этапа'],
                    ['Индексация', limit.indexation],
                    [
                      'Исключения',
                      (limit.exclusions || [])
                        .map(
                          (x) =>
                            ({
                              marketing: 'Маркетинг',
                              'driver-remuneration': 'Вознаграждение пилотов',
                              'three-highest-paid-non-drivers': 'Три наиболее оплачиваемых сотрудника',
                            })[x] || x,
                        )
                        .join(', '),
                    ],
                  ]}
                />
                <a href={limit.source} target="_blank" rel="noreferrer">
                  Открыть источник регламента ↗
                </a>
                {note(
                  'Регламентный лимит, доступные деньги и утверждённый бюджет — три разных ограничения.',
                )}
              </Panel>
            </>
          ) : (
            <EmptyState
              title="Финансовый потолок не применяется"
              description="В этой роли, серии или сезоне API не назначает Cost Cap. Правила F1 не переносятся автоматически."
            />
          ))}
        {tab === 'atr' &&
          (atr ? (
            <Panel
              title={'Аэродинамический период ' + atr.period.number}
              subtitle={period(atr.period.start, atr.period.end_exclusive)}
            >
              <div className="atr-banner">
                <strong>{atr.percent}%</strong>
                <p>
                  Коэффициент организации
                  <br />
                  по действующему регламенту
                </p>
              </div>
              <div className="capacity-list">
                {Object.entries(atr.limits).map(([k, v]) => (
                  <div className="capacity-row" key={k}>
                    <span>
                      {{
                        runs: 'Прогоны трубы',
                        wind_on_minutes: 'Время продувки, мин',
                        occupancy_minutes: 'Занятость трубы, мин',
                        cfd_geometries: 'CFD-геометрии',
                        cfd_milli_mauh: 'Вычислительный ресурс CFD',
                      }[k] || k}
                    </span>
                    <Meter value={atr.used[k]} max={v} />
                    <strong>
                      {atr.used[k]} / {v}
                    </strong>
                  </div>
                ))}
              </div>
              <Button variant="secondary" onClick={() => g.navigate('research')}>
                Перейти к исследованиям
              </Button>
            </Panel>
          ) : (
            <EmptyState
              title="Ограничения ATR не назначены"
              description="Для текущей программы нет применимого аэродинамического периода."
            />
          ))}
        {tab === 'audits' && (
          <Panel
            title="Проверки и решения"
            actions={
              <Button variant="secondary" onClick={() => b.action('budget-review', {})}>
                Зафиксировать проверку
              </Button>
            }
          >
            <DataTable
              rows={arr(report?.audits)}
              columns={[
                {
                  key: 'date',
                  label: 'Дата',
                  render: (x) => dateLabel(x.date),
                },
                { key: 'year', label: 'Сезон' },
                {
                  key: 'text',
                  label: 'Заключение',
                  render: (x) => x.text || x.reason || 'Запись регламента',
                },
              ]}
              empty="Проверки ещё не проводились"
            />
          </Panel>
        )}
      </div>
    )
  }
  return (
    <div className="business-stack">
      <div className="finance-toolbar">
        <Select
          label="Сезон"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          options={[2025, 2026].map((y) => ({
            value: String(y),
            label: String(y),
          }))}
        />
        <Button variant="secondary" disabled={g.role === 'owner'} onClick={request}>
          Запросить бюджет
        </Button>
      </div>
      {tab === 'plan' && (
        <>
          <div className="budget-heading">
            <div>
              <span className="eyebrow">
                {plan ? 'План утверждён ' + dateLabel(plan.approved) : 'План не утверждён'}
              </span>
              <strong>{money(sum(Object.values(draft)), true)}</strong>
              <p>Распределение бюджета сезона {year}</p>
            </div>
            <div className="budget-compare">
              <small>Доступно в кассе</small>
              <b>{money(b.available, true)}</b>
              <span>Сезонный план может включать будущие доходы.</span>
            </div>
          </div>
          <div className="allocation-band">
            {ALLOCS.map((k, i) => (
              <i
                key={k}
                style={{
                  background: PALETTE[i],
                  flex: Math.max(1, ((draft[k] || 0) / Math.max(sum(Object.values(draft)), 1)) * 100),
                }}
                title={txt(k) + ': ' + money(draft[k])}
              />
            ))}
          </div>
          <section className="allocation-sheet">
            <div className="allocation-head">
              <span>Статья</span>
              <span>Лимит, €</span>
              <span>Израсходовано</span>
              <span>Зарезервировано</span>
              <span>Свободно по плану</span>
            </div>
            {ALLOCS.map((k, i) => (
              <div className="allocation-row" key={k}>
                <label htmlFor={'alloc-' + k}>
                  <i style={{ background: PALETTE[i] }} />
                  {txt(k)}
                </label>
                <input
                  id={'alloc-' + k}
                  type="number"
                  min="0"
                  step=".01"
                  value={euros(draft[k])}
                  onChange={(e) => setDraft((p) => ({ ...p, [k]: cents(e.target.value) }))}
                />
                <span>{money(report?.actual?.[k] || 0)}</span>
                <span>{money(report?.reserved?.[k] || 0)}</span>
                <strong
                  className={
                    (draft[k] || 0) - (report?.actual?.[k] || 0) - (report?.reserved?.[k] || 0) < 0
                      ? 'text-warning'
                      : ''
                  }
                >
                  {money((draft[k] || 0) - (report?.actual?.[k] || 0) - (report?.reserved?.[k] || 0))}
                </strong>
              </div>
            ))}
          </section>
          <div className="budget-footer">
            <p>
              {g.role === 'manager'
                ? 'Менеджер предлагает изменения. Утверждение остаётся у владельца.'
                : 'Изменение плана вступит в силу в карьере.'}
            </p>
            <Button variant="ghost" onClick={() => setDraft(alloc)}>
              Вернуть утверждённый план
            </Button>
            <Button
              disabled={g.role === 'owner' && !requests.some((x) => x.status === 'pending')}
              onClick={savePlan}
            >
              {canApprove ? 'Утвердить бюджет' : 'Отправить владельцу'}
            </Button>
          </div>
          {note(
            'Суммы вводятся в евро и сохраняются целыми евроцентами. Резервы исходных контрактов показаны отдельно от фактических расходов.',
          )}
        </>
      )}
      {tab === 'requests' && (
        <Panel title="Запросы подразделений" subtitle="Обоснование, запрошенная сумма и решение">
          <div className="request-list">
            {requests.map((x) => (
              <article key={x.id} className="request-line">
                <span className="request-marker">
                  <Icon name="GitPullRequest" />
                </span>
                <div>
                  <Badge tone={x.status === 'approved' ? 'good' : 'warning'}>
                    {x.status === 'approved'
                      ? 'Одобрено'
                      : x.status === 'rejected'
                        ? 'Отклонено'
                        : 'На рассмотрении'}
                  </Badge>
                  <h3>{txt(x.category) || 'Пересмотр плана'}</h3>
                  <p>{x.reason}</p>
                  <small>
                    {dateLabel(x.date || x.created)} · Сезон {x.year || year}
                  </small>
                </div>
                <strong>
                  {money(x.amount_cents || x.amount || sum(Object.values(x.allocations || {})))}
                </strong>
                {canApprove && x.status === 'pending' && (
                  <div className="heading-actions">
                    <Button
                      onClick={() =>
                        b.action('budget-decide', {
                          proposal: x.id,
                          response: 'approve',
                          reason: x.reason,
                        })
                      }
                    >
                      Одобрить
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        b.action('budget-decide', {
                          proposal: x.id,
                          response: 'reject',
                          reason: 'Бюджет не согласован',
                        })
                      }
                    >
                      Отклонить
                    </Button>
                  </div>
                )}
              </article>
            ))}
            {!requests.length && (
              <EmptyState
                title="Нерассмотренных запросов нет"
                description="Менеджер и подразделения ещё не запросили дополнительных лимитов."
                action={
                  <Button disabled={g.role === 'owner'} onClick={request}>
                    Создать запрос
                  </Button>
                }
              />
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
function FacilitiesView({ tab }) {
  const b = useBusiness(),
    { g, org } = b,
    desk = b.base.facilities || {},
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [country, setCountry] = useState('all')
  const assets = arr(desk.assets),
    own = assets.filter((a) => a.owner === org),
    bookings = arr(desk.bookings),
    filtered = assets.filter(
      (a) =>
        (tab === 'rent' ? a.owner !== org : a.owner === org) &&
        (kind === 'all' || a.kind === kind) &&
        (country === 'all' || a.country === country) &&
        (!query ||
          [desk.types?.[a.kind], b.orgName(a.owner), g.world.countries?.[a.country]]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
  const [limit, setLimit] = useState(20)
  function build() {
    g.openDialog({
      title: 'Новый объект инфраструктуры',
      wide: true,
      content: (
        <BuildComposer
          desk={desk}
          available={b.available}
          onSave={(type, location) => b.save('build', { kind: type, country: location })}
        />
      ),
    })
  }
  function upgrade(a) {
    const q = desk.quotes?.[a.kind]?.[a.country]
    if (!q) return
    const cost = Math.floor((q.build_cents * a.level) / 2),
      locked = bookings.some((x) => x.facility === a.id && x.end > g.game.career.date)
    g.confirm({
      title: 'Модернизация: ' + desk.types[a.kind],
      body: locked
        ? 'На будущие даты уже забронированы слоты. Модернизация заблокирована, пока они не освободятся.'
        : 'Стоимость ' +
          money(cost) +
          ', срок ' +
          Math.floor(q.days / 2) +
          ' дней. Объект будет недоступен на время работ.',
      confirmLabel: locked ? 'Понятно' : 'Начать модернизацию',
      onConfirm: () => b.run('upgrade', { facility: a.id }),
    })
  }
  function rent(a) {
    openContractForm(g, {
      contractType: 'facilitylease',
      contractMeta: {
        counterparty: b.orgName(a.owner),
        facility: desk.types[a.kind],
        daily_cents: desk.quotes[a.kind][a.country].daily_cents,
        available_cents: b.available,
      },
      title: 'Резервирование: ' + desk.types[a.kind],
      description:
        b.orgName(a.owner) +
        ' · ' +
        g.world.countries[a.country] +
        '. Ориентир по исходному каталогу: ' +
        money(desk.quotes[a.kind][a.country].daily_cents) +
        ' за слот в день.',
      fields: [
        field('start', 'Начало', g.game.career.date, 'date', {
          min: g.game.career.date,
          required: true,
        }),
        field('days', 'Дней', 7, 'number', { min: 1, max: 366, step: 1 }),
        field('units', 'Слотов', 1, 'number', {
          min: 1,
          max: Math.min(8, a.free || a.capacity),
          step: 1,
        }),
        field('mode', 'Формат', 'lease', 'select', {
          options: [
            { value: 'lease', label: 'Аренда мощностей' },
            { value: 'outsource', label: 'Аутсорсинг · +20%' },
          ],
        }),
      ],
      validate: (v) => (v.start < g.game.career.date ? 'Начало не может быть в прошлом.' : null),
      onSubmit: (v) =>
        b.run('lease', {
          facility: a.id,
          start: v.start,
          days: Number(v.days),
          units: Number(v.units),
          mode: v.mode,
        }),
    })
  }
  const facilityIcons = {
    tunnel: 'Wind',
    cfd: 'Cpu',
    factory: 'Factory',
    bench: 'Gauge',
    laboratory: 'FlaskConical',
    academy: 'GraduationCap',
    logistics: 'Truck',
    warehouse: 'Package',
    office: 'Building2',
    simulator: 'Gamepad2',
    design: 'Ruler',
  }
  const assetRows = (
    <div className="facility-list">
      {filtered.slice(0, limit).map((a) => (
        <article className="facility-row" key={a.id}>
          <div className="facility-type">
            <Icon name={facilityIcons[a.kind] || 'Building2'} size={28} />
            <span>
              {a.level}
              <small>уровень</small>
            </span>
          </div>
          <div className="facility-name">
            <h3>{desk.types?.[a.kind] || a.kind}</h3>
            <p>
              {tab === 'rent' ? b.orgName(a.owner) : g.world.organizations[org].base} ·{' '}
              {g.world.countries[a.country]}
            </p>
            <Badge tone={a.status === 'active' ? 'good' : 'warning'}>{txt(a.status)}</Badge>
            {a.status !== 'active' && <small>Готовность {dateLabel(a.ready)}</small>}
          </div>
          <div className="facility-capacity">
            <span>Свободно / всего</span>
            <strong>
              {a.free ?? 0} / {a.capacity ?? 0}
            </strong>
            <Meter value={a.free || 0} max={a.capacity || 1} />
          </div>
          <div className="facility-condition">
            <span>Состояние</span>
            <strong>{a.condition}%</strong>
            <small>{money(a.book_cents, true)} · балансовая</small>
          </div>
          <div className="facility-actions">
            {tab === 'rent' ? (
              <Button
                variant="secondary"
                disabled={a.status !== 'active' || !a.free}
                onClick={() => rent(a)}
              >
                Арендовать
              </Button>
            ) : (
              <ContextMenu
                label={'Действия: ' + desk.types?.[a.kind]}
                items={[
                  {
                    label: 'Паспорт объекта',
                    onClick: () =>
                      g.openDialog({
                        title: desk.types[a.kind],
                        content: (
                          <Facts
                            rows={[
                              ['Владелец', b.orgName(a.owner)],
                              ['Местоположение', g.world.countries[a.country]],
                              ['Уровень', a.level],
                              ['Состояние', a.condition + '%'],
                              ['Балансовая стоимость', money(a.book_cents)],
                              ['Готовность', dateLabel(a.ready)],
                              ['Свободных слотов', a.free],
                            ]}
                          />
                        ),
                      }),
                  },
                  ...(a.status === 'active' && a.level < 8
                    ? [{ label: 'Модернизировать', onClick: () => upgrade(a) }]
                    : []),
                  {
                    label: 'К активам организации',
                    onClick: () => g.navigate('capital', 'assets', a.id),
                  },
                ]}
              />
            )}
          </div>
        </article>
      ))}
      {!filtered.length && (
        <EmptyState
          title="Объекты не найдены"
          description="Измените фильтр или начните строительство."
        />
      )}
      {filtered.length > limit && (
        <Button variant="ghost" onClick={() => setLimit((x) => x + 30)}>
          Ещё {Math.min(30, filtered.length - limit)} объектов
        </Button>
      )}
    </div>
  )
  return (
    <div className="business-stack">
      {tab === 'organization' && (
        <>
          <div className="facility-hero">
            <div>
              <span className="eyebrow">
                {g.world.organizations[org].base} /{' '}
                {g.world.countries[g.world.organizations[org].country]}
              </span>
              <h2>{g.role === 'manufacturer' ? 'Производственная база' : 'База организации'}</h2>
              <p>Мощности, люди и доступ к ресурсам определяют темп развития.</p>
              <Button onClick={build} icon={<Icon name="Plus" />}>
                Построить объект
              </Button>
            </div>
            <div className="facility-readout">
              <strong>{own.length}</strong>
              <span>объектов</span>
              <strong>{desk.staff}</strong>
              <span>сотрудников коллективов</span>
            </div>
          </div>
          <div className="toolbar">
            <Input
              label="Поиск по базе"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Труба, академия, склад"
            />
            <Select
              label="Тип объекта"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={[{ value: 'all', label: 'Все типы' }, ...opts(desk.types)]}
            />
          </div>
          {assetRows}
        </>
      )}
      {tab === 'capacity' && (
        <>
          <div className="metric-strip">
            <Stat label="Установлено слотов" value={sum(own, (x) => x.capacity)} />
            <Stat label="Свободных слотов" value={sum(own, (x) => x.free)} />
            <Stat label="Активных объектов" value={own.filter((x) => x.status === 'active').length} />
            <Stat label="Работы на базе" value={own.filter((x) => x.status !== 'active').length} />
          </div>
          <Panel
            title="Рабочие окна подразделений"
            subtitle="Эффективная мощность учитывает персонал, квалификацию и доступ к оборудованию"
          >
            <div className="capacity-list">
              {arr(desk.windows).map((w, i) => (
                <div className="capacity-row wide" key={i}>
                  <div>
                    <h3>{txt(w.process)}</h3>
                    <small>{period(w.start, w.end)}</small>
                  </div>
                  <div>
                    <span>
                      {w.available_slots} свободно из {w.installed_slots}
                    </span>
                    <Meter value={w.available_slots} max={w.installed_slots} />
                  </div>
                  <strong>
                    {Number(w.effective_person_days_x100 / 100).toFixed(2)}
                    <small>эффективных чел.-дн.</small>
                  </strong>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      g.navigate(
                        {
                          research: 'research',
                          design: 'development',
                          production: 'production',
                        }[w.process] || 'engineering',
                      )
                    }
                  >
                    Открыть
                  </Button>
                </div>
              ))}
            </div>
            {note('Рабочая мощность увеличится по завершении строительства.')}
          </Panel>
        </>
      )}
      {tab === 'rent' && (
        <Panel
          title="Доступные мощности паддока"
          subtitle="Реальные объекты мира. Аренда учитывает свободные слоты, период и стоимость."
        >
          <div className="toolbar">
            <Input
              label="Организация или объект"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(20)
              }}
            />
            <Select
              label="Тип"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value)
                setLimit(20)
              }}
              options={[{ value: 'all', label: 'Все типы' }, ...opts(desk.types)]}
            />
            <Select
              label="Страна"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                setLimit(20)
              }}
              options={[
                { value: 'all', label: 'Все страны' },
                ...arr(desk.locations).map((x) => ({
                  value: x,
                  label: g.world.countries[x],
                })),
              ]}
            />
          </div>
          {assetRows}
        </Panel>
      )}
      {tab === 'bookings' && (
        <Panel
          title="Календарь доступа"
          actions={
            <Button variant="secondary" onClick={() => g.setTab('rent')}>
              Найти мощность
            </Button>
          }
        >
          <DataTable
            rows={bookings}
            columns={[
              {
                key: 'facility',
                label: 'Объект',
                render: (x) => {
                  const a = assets.find((a) => a.id === x.facility)
                  return (
                    <span>
                      {desk.types?.[a?.kind] || 'Объект'}
                      <small className="local-label">{b.orgName(a?.owner)}</small>
                    </span>
                  )
                },
              },
              {
                key: 'start',
                label: 'Период',
                render: (x) => period(x.start, x.end),
              },
              { key: 'units', label: 'Слотов' },
              { key: 'mode', label: 'Формат', render: (x) => txt(x.mode) },
              {
                key: 'cost_cents',
                label: 'Стоимость',
                render: (x) => money(x.cost_cents),
              },
              {
                key: 'org',
                label: 'Пользователь',
                render: (x) => b.orgName(x.org),
              },
            ]}
            empty="Мощности ещё не забронированы"
          />
        </Panel>
      )}
    </div>
  )
}
function BuildComposer({ desk, available, onSave }) {
  const g = useGame(),
    [type, setType] = useState(Object.keys(desk.types)[0]),
    [location, setLocation] = useState(
      desk.locations.includes(g.world.organizations[g.game.career.org].country)
        ? g.world.organizations[g.game.career.org].country
        : desk.locations[0],
    ),
    [error, setError] = useState('')
  const q = desk.quotes?.[type]?.[location]
  return (
    <div className="business-stack">
      <div className="form-grid">
        <Select
          label="Тип объекта"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={opts(desk.types)}
        />
        <Select
          label="Страна"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          options={desk.locations.map((x) => ({
            value: x,
            label: g.world.countries[x],
          }))}
        />
      </div>
      <div className="build-quote">
        <Icon name="Construction" size={48} />
        <div>
          <span className="eyebrow">Предложение строительства</span>
          <h2>{money(q?.build_cents)}</h2>
          <p>
            {q?.days} дней · готовность {dateLabel(later(g.game.career.date, q?.days || 0))}
          </p>
        </div>
      </div>
      <Facts
        rows={[
          ['Ежемесячное содержание', money(q?.monthly_cents)],
          ['Базовая потребность в сотрудниках', q?.staff],
          ['Ориентир аренды / день', money(q?.daily_cents)],
          ['Доступные средства', money(available)],
        ]}
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={g.closeDialog}>
          Отмена
        </Button>
        <Button
          disabled={!q || q.build_cents > available}
          onClick={async () => {
            try {
              await onSave(type, location)
            } catch (e) {
              setError(e.message)
            }
          }}
        >
          Начать строительство
        </Button>
      </div>
    </div>
  )
}
function CapitalView({ tab }) {
  const b = useBusiness(),
    { g, org } = b,
    d = b.base.capital || {},
    [query, setQuery] = useState('')
  const assetRecords = arr(d.assets)
  const shares = d.shares || {},
    ownerKey = 'owner:' + org,
    control = (shares[ownerKey] || 0) >= 5001,
    allowed = g.role !== 'manager',
    loans = arr(d.loans),
    debt = sum(
      loans.filter((x) => x.status !== 'paid'),
      (x) => x.remaining_cents ?? x.principal_cents,
    ),
    ownerFunds = d.owner_cents,
    value = d.valuation?.value_cents
  function ownerGuard() {
    if (!allowed) throw Error('Решение доступно собственнику, а не менеджеру.')
    if (!control) throw Error('Для этого решения нужен контрольный пакет более 50%.')
  }
  function invest() {
    openContractForm(g, {
      contractType: 'investment',
      contractMeta: {
        counterparty: b.orgName(org),
        available_cents: b.available,
      },
      title: 'Инвестиция в организацию',
      description: 'Источник средств учитывается отдельно от кассы организации.',
      fields: [
        field('source', 'Источник', 'owner', 'select', {
          options: [
            {
              value: 'owner',
              label: 'Капитал владельца · ' + money(ownerFunds),
            },
            {
              value: 'personal',
              label: 'Личный счёт · ' + money(d.personal_cents),
            },
          ],
        }),
        field('amount', 'Сумма, €', 100000),
      ],
      onSubmit: (v) => b.run('invest', { amount_cents: cents(v.amount), source: v.source }),
    })
  }
  function dividend() {
    g.openForm({
      title: 'Распределение дивидендов',
      description:
        'Получатели определяются долями капитала. Выплата уменьшит доступные средства организации.',
      fields: [field('amount', 'Общая выплата, €', 100000)],
      onSubmit: (v) => b.run('dividend', { amount_cents: cents(v.amount) }),
    })
  }
  function equity() {
    openContractForm(g, {
      contractType: 'investment',
      contractMeta: {
        counterparty: 'Собственник / инвестор',
        valuation_cents: value,
        available_cents: b.available,
      },
      title: 'Привлечение акционерного капитала',
      fields: [
        field('mode', 'Сделка', 'issue', 'select', {
          options: [
            { value: 'issue', label: 'Новые акции · деньги в организацию' },
            { value: 'sale', label: 'Продажа своей доли · деньги владельцу' },
          ],
        }),
        field('percent', 'Доля инвестора, %', 10, 'number', {
          min: 0.01,
          max: 99.99,
          step: 0.01,
        }),
      ],
      onSubmit: (v) => b.run('equity', { basis_points: cents(v.percent), issue: v.mode === 'issue' }),
    })
  }
  function loan() {
    openContractForm(g, {
      contractType: 'loan',
      contractMeta: {
        counterparty: 'Кредитор организации',
        valuation_cents: value,
        debt_cents: debt,
        available_cents: b.available,
      },
      title: 'Финансирование через заём',
      description:
        'Ставка рассчитывается по уровню долговой нагрузки. Максимум — 60% оценки организации; просрочка блокирует выдачу.',
      fields: [
        field('amount', 'Сумма, €', 250000),
        field('months', 'Срок, месяцев', 12, 'number', {
          min: 2,
          max: 60,
          step: 1,
        }),
      ],
      onSubmit: (v) => b.run('loan', { principal_cents: cents(v.amount), months: Number(v.months) }),
    })
  }
  function repay(x) {
    g.confirm({
      title: 'Досрочное погашение займа',
      body:
        'Основной долг ' +
        money(x.remaining_cents ?? x.principal_cents) +
        '. Будущие неначисленные проценты не включены.',
      confirmLabel: 'Погасить',
      onConfirm: () => b.run('repay', { loan: x.id }),
    })
  }
  function restructure(x) {
    g.confirm({
      title: 'Изменить график займа',
      body: 'Однократная реструктуризация: срок увеличится на 6 месяцев (до 60), ставка — на 1,5 процентного пункта.',
      confirmLabel: 'Согласовать',
      onConfirm: () => b.run('restructure', { loan: x.id }),
    })
  }
  function sellAsset(a) {
    const sell = a.owner === org,
      price = Math.max(1, Math.floor(a.book_cents * (sell ? 0.75 : 1.15)))
    g.confirm({
      title: (sell ? 'Продажа' : 'Покупка') + ' актива',
      body:
        a.kind +
        ' · цена сделки ' +
        money(price) +
        '. Оценка по правилу карьеры: продажа 75% балансовой стоимости, покупка 115%.',
      confirmLabel: sell ? 'Продать' : 'Приобрести',
      onConfirm: () => b.run('asset', { asset: a.id, side: sell ? 'sell' : 'buy' }),
    })
  }
  function tradeProgram(x) {
    const sell = x.org === org,
      account = g.game.financeContexts?.[x.id],
      basis = Math.max(
        10000,
        (account?.cash_cents || x.capital_cents || 0) +
          Math.floor(g.game.career.account.budget_cents / 20),
      ),
      price = Math.floor(basis * (sell ? 0.8 : 1))
    g.confirm({
      title: sell ? 'Продажа спортивной программы' : 'Покупка спортивной программы',
      body:
        g.world.championships[x.series]?.name +
        ' · ' +
        money(price) +
        '. Спортивный допуск рассматривается отдельно от сделки с капиталом.',
      confirmLabel: sell ? 'Продать' : 'Приобрести',
      onConfirm: () => b.run('program-sale', { program: x.id, side: sell ? 'sell' : 'buy' }),
    })
  }
  function launch() {
    if (g.world.organizations[org]?.kind !== 'team') {
      g.notify(
        'Спортивные программы учреждаются гоночной организацией. Производитель участвует через заводское партнёрство.',
      )
      return
    }
    const present = new Set(arr(d.programs).map((x) => x.series))
    g.openForm({
      title: 'Новая спортивная программа',
      description:
        'Регистрация программы не означает автоматический допуск к гонкам. Регламентное решение организатора — отдельный этап.',
      fields: [
        field('series', 'Чемпионат', '', 'select', {
          options: Object.values(g.world.championships)
            .filter((x) => !present.has(x.id))
            .map((x) => ({ value: x.id, label: x.name })),
          required: true,
        }),
        field('amount', 'Стартовый капитал, €', 500000),
      ],
      onSubmit: (v) => b.run('program-launch', { series: v.series, amount_cents: cents(v.amount) }),
    })
  }
  const assets = assetRecords.filter(
      (a) => !query || a.kind.toLowerCase().includes(query.toLowerCase()),
    ),
    programs = arr(d.programs)
  return (
    <div className="business-stack">
      {!allowed &&
        note(
          'Менеджер видит структуру организации и стоимость активов. Сделки с собственностью, капиталом и займами доступны владельцу.',
        )}
      {tab === 'overview' && (
        <>
          <div className="capital-stage">
            <section>
              <span className="eyebrow">Оценка организации / игровая модель</span>
              <h2>{money(value, true)}</h2>
              <p>{b.orgName(org)}</p>
              <Facts
                rows={[
                  ['Денежные средства', money(b.cash)],
                  ['Активы', money(d.valuation?.assets_cents || 0)],
                  ['Долг', money(debt)],
                  ['Стоимость договоров', money(d.valuation?.contract_value_cents)],
                ]}
              />
            </section>
            <section className="ownership-panel">
              <h3>Структура капитала</h3>
              <div className="ownership-band">
                {Object.entries(shares).map(([k, v], i) => (
                  <span
                    key={k}
                    style={{ flex: v, background: PALETTE[i % 6] }}
                    title={k + ' ' + v / 100 + '%'}
                  />
                ))}
              </div>
              {Object.entries(shares).map(([k, v], i) => (
                <div className="share-row" key={k}>
                  <i style={{ background: PALETTE[i % 6] }} />
                  <span>
                    {k === 'capital:fund'
                      ? 'Инвестиционный фонд'
                      : k === ownerKey
                        ? 'Владелец организации'
                        : b.orgName(k)}
                  </span>
                  <strong>{v / 100}%</strong>
                </div>
              ))}
              <div className="owner-wallet">
                <small>Капитал владельца</small>
                <strong>{ownerFunds == null ? 'Не раскрыт' : money(ownerFunds)}</strong>
              </div>
              {allowed && (
                <div className="heading-actions">
                  <Button onClick={invest}>Внести средства</Button>
                  <Button variant="secondary" disabled={!control} onClick={equity}>
                    Привлечь инвестора
                  </Button>
                  <Button variant="ghost" disabled={!control} onClick={dividend}>
                    Дивиденды
                  </Button>
                </div>
              )}
            </section>
          </div>
          <Panel title="Финансовая устойчивость">
            <Facts
              rows={[
                [
                  'Статус',
                  d.crisis?.status === 'solvent' ? 'Платёжеспособна' : d.crisis?.status || 'Нет данных',
                ],
                ['Просрочка', money(d.valuation?.overdue_cents)],
                ['Личные деньги игрока', money(d.personal_cents)],
              ]}
            />
            {allowed &&
              !control &&
              note(
                'Контрольный пакет утрачен. Для большинства корпоративных решений требуется более 50% голосов.',
              )}
          </Panel>
        </>
      )}
      {tab === 'loans' && (
        <Panel
          title="Долговой портфель"
          subtitle="Основной долг, срок, ставка и доступные решения"
          actions={
            allowed && (
              <Button disabled={!control} onClick={loan}>
                Оформить заём
              </Button>
            )
          }
        >
          <div className="loan-list">
            {loans.map((x) => (
              <article key={x.id} className="loan-row">
                <div className="loan-number">
                  <Icon name="Landmark" size={30} />
                  <strong>{money(x.remaining_cents ?? x.principal_cents, true)}</strong>
                  <small>Основной долг</small>
                </div>
                <div>
                  <Badge tone={x.status === 'paid' ? 'good' : 'neutral'}>
                    {x.status === 'paid' ? 'Погашен' : 'Действующий'}
                  </Badge>
                  <h3>
                    {x.rate_bps / 100}% годовых · {x.months} месяцев
                  </h3>
                  <p>
                    Выдан {dateLabel(x.start)} · первоначально {money(x.principal_cents)}
                  </p>
                  {x.restructured && <small>График пересмотрен</small>}
                </div>
                {allowed && x.status !== 'paid' && (
                  <div className="heading-actions">
                    <Button variant="secondary" onClick={() => repay(x)}>
                      Погасить
                    </Button>
                    {!x.restructured && (
                      <Button variant="ghost" disabled={!control} onClick={() => restructure(x)}>
                        Пересмотреть график
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {!loans.length && (
              <EmptyState
                title="Кредитный портфель пуст"
                description="У организации нет действующих займов."
                action={allowed && <Button onClick={loan}>Изучить финансирование</Button>}
              />
            )}
          </div>
        </Panel>
      )}
      {tab === 'assets' && (
        <>
          <Panel
            title="Активы организации"
            actions={
              <Button variant="secondary" onClick={() => g.navigate('facilities')}>
                К инфраструктуре
              </Button>
            }
          >
            <Input
              label="Найти актив"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Академия, завод, труба"
            />
            <DataTable
              rows={assets}
              columns={[
                { key: 'kind', label: 'Актив' },
                {
                  key: 'owner',
                  label: 'Владелец',
                  render: (x) => b.orgName(x.owner),
                },
                {
                  key: 'book_cents',
                  label: 'Балансовая стоимость',
                  render: (x) => money(x.book_cents),
                },
                {
                  key: 'action',
                  label: 'Решение',
                  render: (x) =>
                    allowed ? (
                      <Button variant="ghost" disabled={!control} onClick={() => sellAsset(x)}>
                        {x.owner === org ? 'Продать' : 'Приобрести'}
                      </Button>
                    ) : (
                      <Badge>Решает владелец</Badge>
                    ),
                },
              ]}
            />
          </Panel>
          <Panel
            title="Спортивные программы"
            actions={
              allowed &&
              g.role !== 'manufacturer' && (
                <Button disabled={!control} onClick={launch}>
                  Новая программа
                </Button>
              )
            }
          >
            <div className="program-list">
              {programs.map((x) => (
                <div className="program-record" key={x.id}>
                  <button
                    className="program-open"
                    onClick={() => g.navigate('engineering', 'plans', x.id)}
                  >
                    <span className="program-abbr">
                      {g.world.championships[x.series]?.short || x.series.toUpperCase()}
                    </span>
                    <span>
                      <strong>{g.world.championships[x.series]?.name}</strong>
                      <small>С {dateLabel(x.since)}</small>
                    </span>
                    <Badge tone={x.status === 'admitted' ? 'good' : 'warning'}>
                      {x.status === 'admitted' ? 'Допущена' : 'Ожидает допуска'}
                    </Badge>
                    <Icon name="ArrowUpRight" />
                  </button>
                  {allowed && (
                    <span className="program-trade-actions" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" disabled={!control} onClick={() => tradeProgram(x)}>
                        {x.org === org ? 'Продать' : 'Приобрести'}
                      </Button>
                    </span>
                  )}
                </div>
              ))}
              {!programs.length && (
                <EmptyState
                  title="Собственных спортивных программ нет"
                  description="Производитель работает с клиентами через договоры поставок."
                  action={
                    <Button variant="secondary" onClick={() => g.navigate('manufacturer', 'clients')}>
                      К клиентам
                    </Button>
                  }
                />
              )}
            </div>
          </Panel>
        </>
      )}
      {tab === 'history' && (
        <Panel title="Корпоративные решения">
          <DataTable
            rows={arr(d.history)}
            columns={[
              { key: 'date', label: 'Дата', render: (x) => dateLabel(x.date) },
              {
                key: 'title',
                label: 'Решение',
                render: (x) => x.title || txt(x.kind),
              },
              {
                key: 'amount_cents',
                label: 'Сумма',
                render: (x) => (x.amount_cents == null ? '—' : money(x.amount_cents)),
              },
            ]}
            empty="Корпоративных сделок ещё не было"
          />
        </Panel>
      )}
    </div>
  )
}
function CommercialView({ tab }) {
  const b = useBusiness(),
    { g, org } = b,
    d = b.base.commercial || {},
    maker = g.role === 'manufacturer',
    [queries, setQueries] = useStored('business.commercial.queries', {}),
    query = queries[tab] || '',
    setQuery = (value) => setQueries((previous) => ({ ...previous, [tab]: value })),
    [category, setCategory] = useState('all'),
    [series, setSeries] = useState('all'),
    [limit, setLimit] = useState(24)
  const contracts = arr(d.contracts),
    offers = [
      ...arr(d.offers).map((x) => ({
        ...x,
        ...x.terms,
        ...x.supply,
        reply: x.reason,
        technical: !!x.supply,
        supplier: x.terms?.sponsor,
        list_cents: x.supply?.price_cents || 0,
        sale_cents: (x.supply?.price_cents || 0) - (x.supply?.discount_cents || 0),
      })),
    ],
    supplies = arr(d.supplies)
  const brandName = (id) => d.brands?.find((x) => x.id === id)?.name || b.orgName(id),
    orgs = Object.values(g.world.organizations).filter(
      (x) =>
        x.kind === 'team' &&
        (!maker || x.programs.some((s) => g.world.organizations[org].programs.includes(s))),
    )
  const items = maker ? orgs : arr(d.brands)
  const filteredContracts = contracts.filter((x) =>
    [brandName(x.sponsor), b.orgName(x.org)].join(' ').toLowerCase().includes(query.toLowerCase()),
  )
  const filtered = items.filter(
    (x) =>
      (!query ||
        [x.name, x.category, g.world.countries[x.country]]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (category === 'all' || x.category === category) &&
      (series === 'all' || (x.series || x.programs || []).includes(series)),
  )
  function propose(brand, contract) {
    g.openDialog({
      title: contract ? 'Новый раунд переговоров' : 'Коммерческое предложение',
      contractType: maker || contract?.technical ? 'technical' : 'sponsor',
      wide: true,
      content: (
        <OfferComposer
          brand={brand}
          contract={contract}
          maker={maker}
          desk={d}
          onSave={(proposal) =>
            contract?.terms
              ? b.save('bid-reply', { offer: contract.id, decision: 'counter', counter: proposal })
              : b.save('bid', proposal)
          }
        />
      ),
    })
  }
  function showOffer(x) {
    g.openDialog({
      title: 'Предложение · ' + (maker ? b.orgName(x.org) : brandName(x.sponsor)),
      contractType: x.technical ? 'technical' : 'sponsor',
      wide: true,
      content: (
        <div className="business-stack">
          <ContractDocument
            record={{
              type: x.technical ? 'technical' : 'sponsor',
              title: maker ? b.orgName(x.org) : brandName(x.sponsor),
              data: x,
              status: x.status,
              negotiation: true,
            }}
          />
          {x.reply && <p className="contract-demo-choice">{x.reply}</p>}
          {x.original_discount_cents != null && (
            <ContractComparison
              currentLabel="Ваш проект"
              proposedLabel="Ответ партнёра"
              rows={[
                ['Скидка', money(x.original_discount_cents), money(x.discount_cents)],
                [
                  'Испытания',
                  x.original_testing ? 'Запрошены' : 'Не запрошены',
                  x.testing ? 'Согласованы' : 'Не включены',
                ],
                [
                  'Стоимость поставки',
                  money((x.list_cents || 0) - x.original_discount_cents),
                  money(x.sale_cents),
                ],
              ]}
            />
          )}
          <ContractTimeline
            events={x.history || []}
            initialDate={x.created || x.start}
            initialText="Предложение из доступной проекции"
          />
        </div>
      ),
    })
  }
  function accept(offer) {
    g.openDialog({
      title: 'Согласование частей пакета',
      contractType: offer.technical ? 'technical' : 'sponsor',
      wide: true,
      content: (
        <AcceptanceReview offer={offer} onAccept={(choice) => signOffer({ ...offer, ...choice })} />
      ),
    })
  }
  function signOffer(offer) {
    g.confirm({
      title: 'Подписать коммерческий пакет',
      contractType: offer.technical ? 'technical' : 'sponsor',
      wide: true,
      content: (
        <ContractSigningSummary
          type={offer.technical ? 'technical' : 'sponsor'}
          counterparty={maker ? b.orgName(offer.org) : brandName(offer.sponsor)}
          start={offer.start}
          end={offer.end}
          amount={offer.acceptSponsorship === false ? 0 : offer.advance_cents}
          rows={[
            [
              'Гарантированная часть',
              offer.acceptSponsorship === false ? 'Не принимается' : money(offer.fixed_cents),
            ],
            ['Стоимость поставки', offer.technical ? money(offer.sale_cents) : 'Не входит'],
            [
              'Технические права',
              [
                offer.support ? 'Поддержка' : null,
                offer.testing ? 'Испытания' : null,
                offer.development ? 'Разработка' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Не включены',
            ],
            ['Движение аванса', maker ? 'Расход производителя' : 'Поступление организации'],
          ]}
          note="Подпись фиксирует только принятые части пакета. Будущие права вступают в силу в дату начала."
        />
      ),
      body:
        brandName(offer.sponsor) +
        ' · ' +
        b.orgName(offer.org) +
        (offer.acceptSponsorship === false
          ? '. Спонсорство не принимается. Период '
          : '. Гарантия ' + money(offer.fixed_cents) + ' за период ') +
        period(offer.start, offer.end) +
        '.' +
        (offer.technical ? ' Поставка: ' + money(offer.sale_cents) + ' после скидки.' : ''),
      confirmLabel: 'Подписать',
      onConfirm: () => b.run('bid-reply', { offer: offer.id, decision: 'accept', ...offer.selection }),
    })
  }
  function showContract(c) {
    g.openDialog({
      title: brandName(c.sponsor),
      wide: true,
      contractType: c.role === 'technical' ? 'technical' : 'sponsor',
      content: (
        <div className="business-stack">
          <ContractDocument
            record={{
              type: c.role === 'technical' ? 'technical' : 'sponsor',
              title: brandName(c.sponsor),
              data: c,
              status: c.status,
            }}
          />
          <ContractTimeline events={c.history || []} initialDate={c.start} />
          {c.evidence && <p>{c.evidence}</p>}
          {c.source && (
            <p>
              <a href={c.source} target="_blank" rel="noreferrer">
                Источник партнёрства сезона 2025
              </a>
            </p>
          )}
          {c.additional_source && (
            <p>
              <a href={c.additional_source} target="_blank" rel="noreferrer">
                Дополнительный источник
              </a>
            </p>
          )}{' '}
          <div className="heading-actions">
            <Button onClick={() => g.navigate('rights', 'all', c.id)}>Проверить размещение</Button>
            <Button
              variant="secondary"
              onClick={() =>
                propose(
                  maker ? g.world.organizations[c.org] : d.brands.find((x) => x.id === c.sponsor),
                  c,
                )
              }
            >
              Переговоры о продлении
            </Button>
            {c.status === 'signed' && (
              <Button
                variant="ghost"
                onClick={() =>
                  g.confirm({
                    title: 'Прекратить контракт',
                    body:
                      'Компенсация по условиям: ' +
                      money(c.compensation_cents) +
                      '. Контракт и его рекламные права будут помечены прекращёнными.',
                    confirmLabel: 'Прекратить',
                    danger: true,
                    onConfirm: () => b.run('end-deal', { contract: c.id }),
                  })
                }
              >
                Расторгнуть
              </Button>
            )}
          </div>
        </div>
      ),
    })
  }
  function showSupply(x) {
    g.openDialog({
      title: maker ? b.orgName(x.org) : b.orgName(x.sponsor),
      wide: true,
      contractType: 'supply',
      content: (
        <div className="business-stack">
          <ContractDocument
            record={{
              type: 'supply',
              title: maker ? b.orgName(x.org) : b.orgName(x.sponsor),
              data: x,
              status: x.status,
            }}
          />
          {x.status === 'terminated' &&
            note(
              'Договор расторгнут ' +
                dateLabel(x.terminated_at || g.game.career.date) +
                '. Технические права прекращены.',
            )}
          {x.status !== 'terminated' &&
            x.start > g.game.career.date &&
            note('Будущий договор. Текущие условия обслуживания клиента сохраняются.')}
          <div className="heading-actions">
            <Button onClick={() => g.navigate('manufacturer', 'clients', maker ? x.org : x.sponsor)}>
              Техническая служба
            </Button>
            {x.status === 'signed' && (
              <Button
                variant="ghost"
                onClick={() =>
                  g.confirm({
                    title: 'Расторгнуть поставку',
                    body: 'Будущая поставка и её права будут прекращены в карьере. Уже проведённые операции сохраняются.',
                    confirmLabel: 'Расторгнуть',
                    danger: true,
                    onConfirm: () => b.run('end-supply', { contract: x.id }),
                  })
                }
              >
                Расторгнуть поставку
              </Button>
            )}
            {maker && (
              <Button
                variant="secondary"
                onClick={() =>
                  propose(g.world.organizations[x.org], {
                    ...x,
                    fixed_cents: 0,
                    technical: true,
                  })
                }
              >
                Обсудить новый пакет
              </Button>
            )}
          </div>
        </div>
      ),
    })
  }
  const seen = useRef('')
  useEffect(() => {
    const key = g.entity + ':' + tab + ':' + g.scope
    if (!g.entity || seen.current === key) return
    const item = (tab === 'supplies' ? supplies : contracts).find((x) => x.id === g.entity)
    if (item) {
      seen.current = key
      tab === 'supplies' ? showSupply(item) : showContract(item)
    }
  }, [g.entity, tab, g.scope])
  return (
    <div className="business-stack">
      {tab === 'brands' && (
        <>
          <div className="commercial-banner">
            <div>
              <span className="eyebrow">
                {maker ? 'Партнёрство на трассе' : 'Коммерческий портфель'}
              </span>
              <h2>
                {maker ? 'Технологии находят свою команду.' : 'Сильная команда привлекает партнёров.'}
              </h2>
              <p>
                {maker
                  ? 'Соберите пакет поставок, поддержки и встречных рекламных прав.'
                  : 'Согласуйте деньги, размещение, мероприятия и коммерческие права в одном пакете.'}
              </p>
            </div>
            <div>
              <strong>{contracts.filter((c) => c.status === 'signed').length}</strong>
              <span>действующих контрактов</span>
              <strong>{supplies.length}</strong>
              <span>{maker ? 'клиентских договоров' : 'договоров поставки'}</span>
            </div>
          </div>
          <div className="toolbar">
            <Input
              label={maker ? 'Клиентская организация' : 'Бренд или категория'}
              placeholder={maker ? 'Найти команду' : 'Название партнёра'}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(24)
              }}
            />
            {!maker && (
              <Select
                label="Категория"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  setLimit(24)
                }}
                options={[
                  { value: 'all', label: 'Все категории' },
                  ...[...new Set(items.map((x) => x.category))]
                    .filter(Boolean)
                    .map((x) => ({ value: x, label: txt(x) })),
                ]}
              />
            )}
            <Select
              label="Чемпионат"
              value={series}
              onChange={(e) => {
                setSeries(e.target.value)
                setLimit(24)
              }}
              options={[
                { value: 'all', label: 'Все чемпионаты' },
                ...Object.values(g.world.championships).map((x) => ({
                  value: x.id,
                  label: x.name,
                })),
              ]}
            />
          </div>
          <div className="brand-grid">
            {filtered.slice(0, limit).map((x) => (
              <article className="brand-tile" key={x.id}>
                <div className="brand-wordmark" style={maker ? { borderLeftColor: x.color } : undefined}>
                  <h3>{x.name}</h3>
                  <small>{maker ? 'Гоночная организация' : txt(x.category)}</small>
                </div>
                <p>{g.world.countries[x.country] || 'Международный партнёр'}</p>
                <div className="series-chips">
                  {(x.series || x.programs || []).map((s) => (
                    <span key={s}>{g.world.championships[s]?.short || s.toUpperCase()}</span>
                  ))}
                </div>
                {!maker && (
                  <Facts
                    rows={[
                      ['Оценка свободного бюджета', money(x.remaining_estimate_cents, true)],
                      ['Репутация от', x.min_reputation],
                      ['Популярность от', x.min_popularity],
                    ]}
                  />
                )}
                <div className="heading-actions">
                  <Button variant="secondary" onClick={() => propose(x)}>
                    {maker ? 'Предложить пакет' : 'Начать переговоры'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      maker
                        ? g.openOrganization(x.id)
                        : g.openDialog({
                            title: x.name,
                            content: (
                              <div className="business-stack">
                                <Facts
                                  rows={[
                                    ['Страна', g.world.countries[x.country]],
                                    ['Категория', txt(x.category)],
                                    ['Приоритет', txt(x.priority)],
                                    [
                                      'Рынки',
                                      (x.markets || []).map((c) => g.world.countries[c]).join(', '),
                                    ],
                                    ['Оценка доступного бюджета', money(x.remaining_estimate_cents)],
                                  ]}
                                />
                                {note(
                                  'Бюджет партнёра — оценка доступной коммерческой информации. Реальные деньги чужой организации не раскрываются.',
                                )}
                                <Button onClick={() => propose(x)}>Составить предложение</Button>
                              </div>
                            ),
                          })
                    }
                  >
                    Профиль
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <EmptyState
              title="Партнёры не найдены"
              description="Попробуйте другое название, категорию или чемпионат."
            />
          )}
          {filtered.length > limit && (
            <Button variant="ghost" onClick={() => setLimit((x) => x + 24)}>
              Показать ещё {Math.min(24, filtered.length - limit)}
            </Button>
          )}
        </>
      )}
      {tab === 'offers' && (
        <Panel
          title="Переговорный стол"
          subtitle="Предложение → ответ партнёра → проверка условий → подписание"
          actions={<Button onClick={() => propose()}>Новое предложение</Button>}
        >
          <div className="offer-list">
            {offers.map((x) => (
              <article className="offer-row v2-commercial-offer" key={x.id}>
                <div className="offer-status">
                  <Badge
                    tone={
                      x.status === 'rejected' ? 'danger' : x.status === 'signed' ? 'good' : 'warning'
                    }
                  >
                    {txt(x.status)}
                  </Badge>
                  <small>{dateLabel(x.created || x.start)}</small>
                </div>
                <div>
                  <h3>{maker ? b.orgName(x.org) : brandName(x.sponsor)}</h3>
                  <p>
                    {g.world.championships[x.series]?.name} · {period(x.start, x.end)}
                  </p>
                  <small>{x.reply || 'Предложение ожидает решения партнёра.'}</small>
                </div>
                <strong>
                  {money(x.fixed_cents)}
                  <small>Гарантия</small>
                </strong>
                <div className="heading-actions">
                  <Button variant="ghost" onClick={() => showOffer(x)}>
                    Условия
                  </Button>
                  {['offered', 'counter'].includes(x.status) && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        g.confirm({
                          title: 'Отклонить предложение?',
                          confirmLabel: 'Отклонить',
                          onConfirm: () => b.run('bid-reply', { offer: x.id, decision: 'reject' }),
                        })
                      }
                    >
                      Отклонить
                    </Button>
                  )}
                  {['offered', 'counter'].includes(x.status) && (
                    <>
                      <Button onClick={() => accept(x)}>Принять условия</Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          propose(
                            maker
                              ? g.world.organizations[x.org]
                              : d.brands.find((y) => y.id === x.sponsor),
                            x,
                          )
                        }
                      >
                        Встречное предложение
                      </Button>
                    </>
                  )}
                  {x.status === 'signed' && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const c = contracts.find((c) => c.id === x.contract),
                          s = supplies.find((s) => s.id === x.supply)
                        if (c) showContract(c)
                        else if (s) showSupply(s)
                      }}
                    >
                      {x.contract ? 'Контракт' : 'Поставка'}
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {!offers.length && (
              <EmptyState
                title="Переговоры ещё не начаты"
                description="Выберите партнёра и сформируйте условия пакета."
                action={<Button onClick={() => g.setTab('brands')}>Открыть рынок</Button>}
              />
            )}
          </div>
        </Panel>
      )}
      {tab === 'contracts' && (
        <Panel title="Подписанные договоры" subtitle="Гарантия, срок, мероприятия и рекламные права">
          <div className="toolbar">
            <Input
              label="Поиск контракта"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Партнёр или организация"
            />
          </div>
          <div className="contract-list">
            {filteredContracts.map((c) => (
              <button className="contract-row" key={c.id} onClick={() => showContract(c)}>
                <span
                  className="contract-stripe"
                  style={{
                    background: g.world.organizations[c.org]?.color || '#a8c2d3',
                  }}
                />
                <div>
                  <span className="eyebrow">
                    {txt(c.role)} / {g.world.championships[c.series]?.short || c.series}
                  </span>
                  <h3>{brandName(c.sponsor)}</h3>
                  <small>{maker ? b.orgName(c.org) : period(c.start, c.end)}</small>
                </div>
                <div className="contract-sum">
                  <strong>{money(c.fixed_cents)}</strong>
                  <small>Гарантия · {c.interval} мес.</small>
                </div>
                <Badge tone={c.status === 'signed' ? 'good' : 'neutral'}>{txt(c.status)}</Badge>
                <Icon name="ArrowUpRight" />
              </button>
            ))}
          </div>
          {!filteredContracts.length && (
            <EmptyState
              title={query ? 'По запросу нет подписанных договоров' : 'Подписанных договоров пока нет'}
              description={
                query
                  ? 'Поиск «' +
                    query +
                    '» сохранён при переходе между коммерческими разделами. Измените его или откройте все договоры.'
                  : 'Соглашения появятся после завершения переговоров и подписания.'
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setQuery('')}>
                    Показать все договоры
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => g.navigate('commercial', 'brands')}>
                    Выбрать партнёра
                  </Button>
                )
              }
            />
          )}
        </Panel>
      )}
      {tab === 'supplies' && (
        <Panel
          title={maker ? 'Договоры с клиентами' : 'Поставщики организации'}
          subtitle="Цена, скидка и технические права — единый коммерческий договор"
          actions={maker && <Button onClick={() => propose()}>Предложить пакет</Button>}
        >
          <div className="toolbar">
            <Input
              label="Поиск договора"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Команда, поставщик, продукт"
            />
          </div>
          <DataTable
            rows={supplies.filter((x) =>
              [
                b.orgName(x.org),
                b.orgName(x.sponsor),
                txt(x.product),
                g.world.championships[x.series]?.name,
              ]
                .join(' ')
                .toLowerCase()
                .includes(query.toLowerCase()),
            )}
            onRowClick={showSupply}
            columns={[
              {
                key: 'org',
                label: maker ? 'Клиент' : 'Поставщик',
                render: (x) => (
                  <button
                    className="link-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      showSupply(x)
                    }}
                  >
                    {b.orgName(maker ? x.org : x.sponsor)}
                  </button>
                ),
              },
              {
                key: 'series',
                label: 'Программа',
                render: (x) => (
                  <span>
                    {g.world.championships[x.series]?.short || x.series.toUpperCase()}
                    <small className="local-label">{txt(x.product)}</small>
                  </span>
                ),
              },
              {
                key: 'sale_cents',
                label: 'Стоимость',
                render: (x) => (
                  <span>
                    {money(x.sale_cents)}
                    {x.discount_cents > 0 && (
                      <small className="local-label">Скидка {money(x.discount_cents)}</small>
                    )}
                  </span>
                ),
              },
              {
                key: 'partnership',
                label: 'Пакет',
                render: (x) => txt(x.partnership),
              },
              {
                key: 'end',
                label: 'Период',
                render: (x) => (
                  <span>
                    {period(x.start, x.end)}
                    {x.status === 'terminated' ? (
                      <Badge tone="neutral">Расторгнут</Badge>
                    ) : (
                      x.start > g.game.career.date && <Badge tone="warning">Будущий договор</Badge>
                    )}
                  </span>
                ),
              },
              {
                key: 'support',
                label: 'Права',
                render: (x) => (
                  <span>
                    {x.status === 'terminated'
                      ? 'Прекращены'
                      : [
                          x.support ? 'Поддержка' : null,
                          x.testing ? 'Испытания' : null,
                          x.development ? 'Разработка' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Стандартная поставка'}
                  </span>
                ),
              },
            ]}
            empty="Договоров поставки нет"
          />
        </Panel>
      )}
    </div>
  )
}
function AcceptanceReview({ offer, onAccept }) {
  const [choice, setChoice] = useState({
      sponsorship: true,
      supply: !!offer.technical,
      discount: !!offer.discount_cents,
      support: !!offer.support,
      testing: !!offer.testing,
      development: !!offer.development,
      seat: !!offer.seat_cents,
    }),
    [error, setError] = useState('')
  const selections = [
    ['sponsorship', 'Спонсорские условия · ' + money(offer.fixed_cents), true],
    ['supply', 'Договор поставки · ' + money(offer.list_cents), offer.technical],
    ['discount', 'Скидка · ' + money(offer.discount_cents), offer.discount_cents],
    ['support', 'Техническое сопровождение', offer.support],
    ['testing', 'Совместные испытания', offer.testing],
    ['development', 'Совместная разработка', offer.development],
    ['seat', 'Финансирование места · ' + money(offer.seat_cents), offer.seat_cents],
  ]
  return (
    <div className="business-stack">
      <ContractFrame
        type={offer.technical ? 'technical' : 'sponsor'}
        title={offer.technical ? 'Выберите глубину сотрудничества.' : 'Согласуйте ценность партнёрства.'}
        eyebrow="Ответ партнёра"
      >
        <ContractClause number={1} title="Какие обязательства принимаем">
          <p className="contract-note">
            Можно принять спонсорство и отдельные части технического пакета. Отсутствующая в ответе
            партнёра услуга недоступна для выбора.
          </p>
          <div className="acceptance-list">
            {selections.map(([key, label, available]) => (
              <label className="check-label" key={key}>
                <input
                  type="checkbox"
                  checked={choice[key]}
                  disabled={!available || (!['sponsorship', 'supply'].includes(key) && !choice.supply)}
                  onChange={(e) => setChoice((p) => ({ ...p, [key]: e.target.checked }))}
                />
                <span>{label}</span>
                {!available && <Badge>Не предложено</Badge>}
              </label>
            ))}
          </div>
          <Facts
            rows={[
              [
                'Поставка после скидки',
                choice.supply
                  ? money((offer.list_cents || 0) - (choice.discount ? offer.discount_cents || 0 : 0))
                  : 'Не принимается',
              ],
              ['Гарантия спонсора', choice.sponsorship ? money(offer.fixed_cents) : 'Не принимается'],
            ]}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Button
            onClick={() => {
              if (!choice.sponsorship && !choice.supply) {
                setError('Выберите хотя бы одну часть пакета.')
                return
              }
              const discount = choice.supply && choice.discount ? offer.discount_cents : 0
              onAccept({
                selection: choice,
                acceptSponsorship: choice.sponsorship,
                technical: choice.supply,
                discount_cents: discount,
                sale_cents: (offer.list_cents || 0) - discount,
                support: choice.supply && choice.support,
                testing: choice.supply && choice.testing,
                development: choice.supply && choice.development,
                seat_cents: choice.supply && choice.seat ? offer.seat_cents : 0,
                academy_person: choice.supply && choice.seat ? offer.academy_person : null,
              })
            }}
          >
            Проверить итог перед подписью
          </Button>
        </ContractClause>
      </ContractFrame>
    </div>
  )
}
function RightsSummary({ rights = [] }) {
  return (
    <div className="rights-summary">
      <h3>Согласованные поверхности</h3>
      {rights.length ? (
        rights.map((r, i) => (
          <div key={i}>
            <span>{txt(r.zone)}</span>
            <div className="rights-mini-track">
              <i style={{ left: (r.offset || 0) + '%', width: r.share + '%' }} />
            </div>
            <strong>{r.share}%</strong>
            <small>{r.shared ? 'Совместное' : 'Индивидуальное'} размещение</small>
          </div>
        ))
      ) : (
        <p>Дополнительные рекламные поверхности не запрошены.</p>
      )}
    </div>
  )
}
function RightsEditor({ rights, onChange }) {
  const zones = [
    'garage',
    'press',
    'hospitality',
    'suit',
    'uniform',
    'launch',
    'flank',
    'upper',
    'nose',
    'sill',
    'shoulder',
    'wing',
  ]
  function change(i, key, value) {
    onChange(rights.map((r, n) => (n === i ? { ...r, [key]: value } : r)))
  }
  return (
    <div className="business-stack">
      {rights.map((r, i) => (
        <section className="right-offer-row" key={i}>
          <header>
            <h3>Поверхность {i + 1}</h3>
            <Button variant="ghost" onClick={() => onChange(rights.filter((_, n) => n !== i))}>
              Убрать
            </Button>
          </header>
          <div className="form-grid">
            <Select
              label="Поверхность"
              name={'right:' + i + ':zone'}
              value={r.zone}
              options={zones.map((x) => ({ value: x, label: txt(x) }))}
              onChange={(e) => change(i, 'zone', e.target.value)}
            />
            {[
              ['share', 'Минимальная ширина, %', 1, 100],
              ['offset', 'Начало области, %', 0, 99],
              ['priority', 'Приоритет слоя', 0, 20],
            ].map(([key, label, min, max]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  name={'right:' + i + ':' + key}
                  type="number"
                  min={min}
                  max={max}
                  step="1"
                  value={r[key] || 0}
                  onChange={(e) => change(i, key, Number(e.target.value))}
                />
              </label>
            ))}
            <label>
              <span>Цвет кузова · HEX или без ограничения</span>
              <input
                name={'right:' + i + ':color'}
                value={r.color || ''}
                placeholder="#E10600"
                pattern="#[0-9A-Fa-f]{6}"
                onChange={(e) => change(i, 'color', e.target.value || null)}
              />
            </label>
            <label className="check-label">
              <input
                name={'right:' + i + ':shared'}
                type="checkbox"
                checked={!!r.shared}
                onChange={(e) => change(i, 'shared', e.target.checked)}
              />
              <span>Разрешить совместное размещение</span>
            </label>
          </div>
          <div className="rights-placement-preview">
            <span>{txt(r.zone)}</span>
            <div>
              <i style={{ left: r.offset + '%', width: r.share + '%' }}>{r.share}%</i>
            </div>
            <small>0%</small>
            <small>100%</small>
          </div>
        </section>
      ))}
      {rights.length < 12 && (
        <Button
          variant="secondary"
          onClick={() =>
            onChange([
              ...rights,
              {
                zone: 'garage',
                share: 10,
                offset: 20,
                priority: 0,
                shared: false,
                color: null,
              },
            ])
          }
        >
          Добавить рекламную поверхность
        </Button>
      )}
      {!rights.length && note('Предложение не включает обязательных рекламных поверхностей.')}
    </div>
  )
}
function OfferComposer({ brand, contract, maker, desk, onSave }) {
  const b = useBusiness(),
    { g, org } = b,
    [step, setStep] = useState('parties'),
    [error, setError] = useState('')
  const teams = Object.values(g.world.organizations).filter(
      (x) =>
        x.kind === 'team' &&
        (!maker || x.programs.some((s) => g.world.organizations[org].programs.includes(s))),
    ),
    defaultOrg = maker ? brand?.id || contract?.org || teams[0]?.id : org
  const [values, setValues] = useState({
    sponsor: contract?.sponsor || (!maker ? brand?.id || desk.brands[0]?.id : org),
    org: defaultOrg,
    series:
      contract?.series ||
      (g.world.organizations[defaultOrg]?.programs || []).find(
        (series) => !maker || g.world.organizations[org]?.programs.includes(series),
      ) ||
      g.game.career.series,
    start: contract?.created ? contract.start : contract?.end || '2026-01-01',
    end: contract?.created ? contract.end : contract?.end ? later(contract.end, 365) : '2027-01-01',
    fixed: euros(contract?.fixed_cents || 1200000),
    advance: euros(contract?.advance_cents || 120000),
    bonus: euros(contract?.bonus_cents || 100000),
    compensation: euros(contract?.compensation_cents || 240000),
    interval: contract?.interval || 3,
    appearances: contract?.appearances || 3,
    role: maker ? 'technical' : contract?.role || 'partner',
    zone: contract?.rights?.[0]?.zone || 'garage',
    share: contract?.rights?.[0]?.share || 10,
    offset: contract?.rights?.[0]?.offset || 20,
    priority: contract?.rights?.[0]?.priority || 0,
    exclusive: !!contract?.exclusive,
    renew: contract?.renew ?? true,
    podium: contract?.podium || 3,
    reputation: contract?.reputation || 40,
    person: contract?.person || '',
    academy: contract?.academy || '',
    shared: false,
    technical: maker || !!contract?.technical,
    partnership: contract?.partnership || 'technical',
    product: contract?.product || g.world.organizations[org]?.lines?.[0] || 'engine',
    supplier: contract?.sponsor?.startsWith('supplier-')
      ? contract.sponsor
      : Object.values(g.world.organizations).find((x) => x.kind === 'supplier' && x.lines?.length)?.id ||
        '',
    list: euros(contract?.list_cents || 2340000),
    discount: euros(contract?.discount_cents || 250000),
    support: contract?.support ?? true,
    testing: contract?.testing ?? false,
    development: contract?.development ?? false,
    academy_person: contract?.academy_person || '',
    seat: euros(contract?.seat_cents || 0),
    rights: contract?.rights?.length
      ? contract.rights.map((r) => ({ ...r }))
      : [
          {
            zone: 'garage',
            share: 10,
            offset: 20,
            priority: 0,
            shared: false,
            color: null,
          },
        ],
  })
  const form = useRef(null)
  const update = (k, v) => setValues((p) => ({ ...p, [k]: v }))
  const bind = (k, label, type = 'text', props = {}) => (
    <label>
      <span>{label}</span>
      <input
        name={k}
        type={type}
        value={values[k]}
        onInput={(e) => update(k, e.currentTarget.value)}
        onChange={(e) => update(k, e.target.value)}
        {...props}
      />
    </label>
  )
  const select = (k, label, options) => (
    <Select
      label={label}
      name={k}
      value={values[k]}
      onChange={(e) => {
        update(k, e.target.value)
        if (k === 'org')
          update(
            'series',
            (g.world.organizations[e.target.value]?.programs || []).find(
              (series) => !maker || g.world.organizations[org]?.programs.includes(series),
            ) || g.game.career.series,
          )
      }}
      options={options}
    />
  )
  const check = (k, label) => (
    <label className="check-label">
      <input
        type="checkbox"
        name={k}
        checked={!!values[k]}
        onChange={(e) => update(k, e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
  function capture() {
    const data = new FormData(form.current),
      next = { ...values, rights: values.rights.map((r) => ({ ...r })) }
    for (const [k, v] of data) {
      if (k.startsWith('right:')) {
        const [, i, key] = k.split(':')
        next.rights[Number(i)][key] = ['share', 'offset', 'priority'].includes(key)
          ? Number(v)
          : v || null
      } else next[k] = v
    }
    for (const k of ['exclusive', 'renew', 'technical', 'support', 'testing', 'development'])
      if (form.current.elements[k]) next[k] = form.current.elements[k].checked
    if (step === 'rights')
      next.rights.forEach(
        (r, i) => (r.shared = !!form.current.elements['right:' + i + ':shared']?.checked),
      )
    setValues(next)
    return next
  }
  async function submit(e) {
    e.preventDefault()
    if (step !== 'review') {
      capture()
      setStep('review')
      return
    }
    const v = capture(),
      fixed = cents(v.fixed),
      advance = cents(v.advance),
      list = cents(v.list),
      discount = cents(v.discount)
    if (!v.sponsor || !v.org || !v.series) {
      setError('Выберите стороны и чемпионат.')
      setStep('parties')
      return
    }
    if (v.start < g.game.career.date || v.end <= v.start) {
      setError('Проверьте даты: начало не в прошлом, окончание позже начала.')
      setStep('parties')
      return
    }
    if (
      [fixed, advance, cents(v.bonus), cents(v.compensation), list, discount, cents(v.seat)].some(
        (n) => !validCents(n),
      ) ||
      advance > fixed ||
      discount > list
    ) {
      setError('Проверьте деньги: аванс не выше гарантии, скидка не выше цены поставки.')
      setStep('terms')
      return
    }
    if (
      v.rights.some(
        (r) =>
          Number(r.offset) + Number(r.share) > 100 ||
          Number(r.share) < 1 ||
          Number(r.offset) < 0 ||
          Number(r.priority) < 0 ||
          (r.color && !/^#[0-9a-f]{6}$/i.test(r.color)),
      )
    ) {
      setError('Рекламная поверхность должна укладываться в диапазон 0–100%.')
      setStep('rights')
      return
    }
    if (v.technical && !maker && !String(v.sponsor).startsWith('supplier-')) {
      setError(
        'Технический пакет доступен, когда спонсор является производителем компонентов. Выберите его на первом шаге.',
      )
      setStep('parties')
      return
    }
    if ((v.role === 'personal' && !v.person) || (v.role === 'academy' && !v.academy)) {
      setError('Выберите получателя личной или академической поддержки.')
      setStep('parties')
      return
    }
    if (!!cents(v.seat) !== !!v.academy_person) {
      setError('Оплата места требует выбранного действующего воспитанника и положительной суммы.')
      setStep('terms')
      return
    }
    const row = {
      sponsor: maker ? org : v.sponsor,
      org: v.org,
      receiver:
        v.role === 'personal'
          ? 'driver:' + v.person
          : v.role === 'academy'
            ? 'academy:' + v.academy
            : v.org,
      person: v.role === 'personal' ? v.person : null,
      academy: v.role === 'academy' ? v.academy : null,
      podium: Number(v.podium),
      reputation: Number(v.reputation),
      series: v.series,
      start: v.start,
      end: v.end,
      fixed_cents: fixed,
      advance_cents: advance,
      bonus_cents: cents(v.bonus),
      compensation_cents: cents(v.compensation),
      interval: Number(v.interval),
      appearances: Number(v.appearances),
      role: v.role,
      exclusive: !!v.exclusive,
      renew: !!v.renew,
      technical: !!v.technical,
      supplier: maker ? org : v.sponsor,
      product: v.product,
      partnership: v.partnership,
      list_cents: list,
      discount_cents: discount,
      sale_cents: Math.max(0, list - discount),
      support: !!v.support,
      testing: !!v.testing,
      development: !!v.development,
      academy_person: v.academy_person || null,
      seat_cents: cents(v.seat),
      rights: v.rights,
    }
    const keys = [
      'sponsor',
      'org',
      'person',
      'academy',
      'podium',
      'reputation',
      'series',
      'start',
      'end',
      'fixed_cents',
      'advance_cents',
      'bonus_cents',
      'compensation_cents',
      'interval',
      'appearances',
      'role',
      'exclusive',
      'renew',
      'rights',
    ]
    const terms = Object.fromEntries(keys.map((k) => [k, row[k]]))
    const supply = row.technical
      ? {
          product: row.product,
          price_cents: row.list_cents,
          discount_cents: row.discount_cents,
          support: row.support,
          testing: row.testing,
          development: row.development,
          academy_person: row.academy_person,
          seat_cents: row.seat_cents,
        }
      : null
    try {
      await onSave({ terms, supply })
    } catch (e) {
      setError(e.message)
    }
  }
  const steps = [
      { id: 'parties', label: '1 · Стороны' },
      { id: 'terms', label: '2 · Условия' },
      { id: 'rights', label: '3 · Права' },
      { id: 'review', label: '4 · Проверка' },
    ],
    active = steps.findIndex((x) => x.id === step)
  return (
    <form ref={form} onSubmit={submit} className="business-stack offer-composer">
      <ContractFrame
        type={values.technical ? 'technical' : 'sponsor'}
        title={maker ? 'Ваш продукт. Их следующая победа.' : 'Партнёрство с взаимными обязательствами.'}
        eyebrow={contract ? 'Новый раунд переговоров' : 'Проект соглашения'}
        counterparty={
          maker ? b.orgName(values.org) : desk.brands.find((x) => x.id === values.sponsor)?.name
        }
        aside={
          <>
            <ContractImpact
              title={maker ? 'Коммерческая позиция' : 'Пакет партнёра'}
              rows={[
                ['Гарантия', money(cents(values.fixed))],
                ['Аванс', money(cents(values.advance))],
                [
                  'Поставка',
                  values.technical ? money(cents(values.list) - cents(values.discount)) : 'Не входит',
                ],
                ['Период', period(values.start, values.end)],
              ]}
              note={
                maker
                  ? 'Гарантия и аванс — обязательства производителя перед клиентом. Поставка — встречное обязательство клиента.'
                  : 'Финансирование связано с рекламными правами, мероприятиями и условиями расторжения.'
              }
            />
            {contract && (
              <ContractComparison
                currentLabel="Текущие"
                proposedLabel="Проект"
                rows={[
                  ['Гарантия', money(contract.fixed_cents), money(cents(values.fixed))],
                  [
                    'Поставка',
                    money(contract.sale_cents),
                    values.technical ? money(cents(values.list) - cents(values.discount)) : 'Не входит',
                  ],
                ]}
              />
            )}
          </>
        }
      >
        <Tabs
          items={steps}
          value={step}
          onChange={(s) => {
            capture()
            setStep(s)
            setError('')
          }}
        />
        {step === 'parties' && (
          <div className="contract-step-content">
            <h3>{maker ? 'Общая гоночная программа' : 'Стороны и срок партнёрства'}</h3>
            <p>
              {maker
                ? 'Выберите клиента в совместимом чемпионате. Поставка, технические права и встречная реклама будут связаны одним предложением.'
                : 'Определите, кого поддерживает бренд: организацию, академию или конкретного пилота.'}
            </p>
            <div className="form-grid">
              {maker
                ? select(
                    'org',
                    'Клиент',
                    teams.map((x) => ({ value: x.id, label: x.name })),
                  )
                : select(
                    'sponsor',
                    'Коммерческий партнёр',
                    desk.brands.map((x) => ({ value: x.id, label: x.name })),
                  )}
              {select(
                'series',
                'Программа',
                (g.world.organizations[values.org]?.programs || [])
                  .filter((s) => !maker || g.world.organizations[org].programs.includes(s))
                  .map((s) => ({
                    value: s,
                    label: g.world.championships[s].name,
                  })),
              )}
              {bind('start', 'Начало договора', 'date', {
                min: g.game.career.date,
                required: true,
              })}
              {bind('end', 'Окончание договора', 'date', {
                min: values.start,
                required: true,
              })}
              {select(
                'role',
                'Формат',
                maker
                  ? [{ value: 'technical', label: 'Техническое партнёрство' }]
                  : ['partner', 'principal', 'title', 'academy', 'personal', 'technical'].map((x) => ({
                      value: x,
                      label: txt(x),
                    })),
              )}
              {values.role === 'personal' &&
                select(
                  'person',
                  'Пилот',
                  g.game.personnel
                    .filter((p) => p.org === org && p.position === 'driver')
                    .map((p) => ({ value: p.id, label: p.name })),
                )}
              {values.role === 'academy' &&
                select(
                  'academy',
                  'Академия',
                  g.game.career.academies.map((a) => ({
                    value: a.id,
                    label: a.name,
                  })),
                )}
            </div>
            {note(
              'Коммерческие и технические условия связываются одним предложением. Будущая дата начала не меняет действующий пакет клиента.',
            )}
          </div>
        )}
        {step === 'terms' && (
          <div className="contract-step-content">
            <h3>
              {values.technical
                ? 'Коммерческая цена технического доступа'
                : 'Цена и обязательства обеих сторон'}
            </h3>
            <p>
              Гарантированная часть, условия бонуса, календарь выплат и выход из соглашения
              рассматриваются вместе.
            </p>
            <div className="form-grid">
              {bind('fixed', 'Гарантированная часть, €', 'number', {
                min: 0,
                step: '.01',
              })}
              {bind('advance', 'Аванс, €', 'number', { min: 0, step: '.01' })}
              {bind('bonus', 'Бонус, €', 'number', { min: 0, step: '.01' })}
              {bind('compensation', 'Компенсация при прекращении, €', 'number', { min: 0, step: '.01' })}
              {select(
                'interval',
                'Период выплаты',
                [1, 3, 6].map((n) => ({ value: n, label: n + ' мес.' })),
              )}
              {bind('podium', 'Бонус за место не ниже', 'number', {
                min: 1,
                max: 10,
                step: 1,
              })}
              {bind('reputation', 'Минимальная репутация', 'number', {
                min: 0,
                max: 100,
                step: 1,
              })}
              {bind('appearances', 'Коммерческих мероприятий', 'number', {
                min: 0,
                max: 24,
                step: 1,
              })}
            </div>
            <div className="check-row">
              {check('exclusive', 'Эксклюзивность в категории')}
              {check('renew', 'Право продления')}
              {check('technical', 'Включить техническую поставку')}
            </div>
            {values.technical && (
              <section className="technical-package">
                <h3>Технический пакет</h3>
                <div className="form-grid">
                  {!maker && (
                    <p className="span-all">
                      Технический поставщик: {desk.brands.find((x) => x.id === values.sponsor)?.name}. Он
                      должен быть производителем компонентов в выбранной программе.
                    </p>
                  )}
                  {select(
                    'product',
                    'Продукт',
                    (maker
                      ? g.world.organizations[org].lines
                      : ['engine', 'transmission', 'tyre', 'chassis']
                    ).map((x) => ({ value: x, label: txt(x) })),
                  )}
                  {select(
                    'partnership',
                    'Уровень партнёрства',
                    ['client', 'technical', 'works'].map((x) => ({
                      value: x,
                      label: txt(x),
                    })),
                  )}
                  {bind('list', 'Каталожная стоимость поставки, €', 'number', {
                    min: 0,
                    step: '.01',
                  })}
                  {bind('discount', 'Скидка, €', 'number', {
                    min: 0,
                    step: '.01',
                  })}
                  {select('academy_person', 'Участник академии', [
                    { value: '', label: 'Не назначен' },
                    ...arr(desk.scholars).map((id) => ({
                      value: id,
                      label: b.personName(id),
                    })),
                  ])}
                  {bind('seat', 'Финансирование места, €', 'number', {
                    min: 0,
                    step: '.01',
                  })}
                </div>
                <div className="check-row">
                  {check('support', 'Техническая поддержка')}
                  {check('testing', 'Доступ к испытаниям')}
                  {check('development', 'Совместная разработка')}
                </div>
                <div className="package-total">
                  <span>Стоимость после скидки</span>
                  <strong>{money(Math.max(0, cents(values.list) - cents(values.discount)))}</strong>
                </div>
              </section>
            )}
          </div>
        )}
        {step === 'rights' && (
          <div className="contract-step-content">
            <h3>Как партнёр присутствует в вашей команде</h3>
            <p>
              Согласуйте поверхность и долю размещения. Права затем проверяются по ливрее и коммерческим
              подтверждениям.
            </p>
            <RightsEditor rights={values.rights} onChange={(r) => update('rights', r)} />
            {note(
              'На кузове подтверждением служит сохранённая ливрея. Для пресс-стены, боксов и формы размещение подтверждается отдельно.',
            )}
          </div>
        )}
        {step === 'review' && (
          <>
            <div className="contract-masthead">
              <div>
                <span className="eyebrow">Предложение к отправке</span>
                <h2>
                  {maker
                    ? b.orgName(values.org)
                    : desk.brands.find((x) => x.id === values.sponsor)?.name}
                </h2>
                <p>{period(values.start, values.end)}</p>
              </div>
              <strong>
                {money(cents(values.fixed))}
                <small>Гарантия</small>
              </strong>
            </div>
            <Facts
              rows={[
                ['Аванс', money(cents(values.advance))],
                ['Платёжный период', values.interval + ' мес.'],
                ['Мероприятия', values.appearances],
                [
                  'Поставка после скидки',
                  values.technical
                    ? money(cents(values.list) - cents(values.discount))
                    : 'Без технической поставки',
                ],
                [
                  'Технические права',
                  [
                    values.support ? 'Поддержка' : null,
                    values.testing ? 'Испытания' : null,
                    values.development ? 'Разработка' : null,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Не запрошены',
                ],
                ['Реклама', values.rights.map((r) => txt(r.zone) + ' · ' + r.share + '%').join('; ')],
                ['Эксклюзивность', values.exclusive ? 'Да' : 'Нет'],
              ]}
            />
            {note(
              'Отправка создаст ожидающее предложение. Подписание станет доступно после ответа партнёра.',
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            variant="ghost"
            onClick={
              active
                ? () => {
                    capture()
                    setStep(steps[active - 1].id)
                  }
                : g.closeDialog
            }
          >
            {active ? 'Назад' : 'Отмена'}
          </Button>
          {active < 3 ? (
            <Button
              key="next-step"
              type="button"
              onClick={(e) => {
                e.preventDefault()
                capture()
                setStep(steps[active + 1].id)
              }}
            >
              Далее
            </Button>
          ) : (
            <Button key="send-offer" type="submit">
              Отправить предложение
            </Button>
          )}
        </div>
      </ContractFrame>
    </form>
  )
}
const CAR_ZONES = new Set(['flank', 'upper', 'nose', 'sill', 'shoulder', 'wing'])
Object.assign(LABEL, {
  priority: 'Приоритетный клиент',
  preparation: 'Подготовка',
  signing: 'Подписание контракта',
  principal: 'Генеральный партнёр',
  uniform: 'Форма персонала',
  launch: 'Презентация',
  technology: 'Техническая кооперация',
  markets: 'Выход на рынки',
  visibility: 'Узнаваемость',
  juniors: 'Молодые пилоты',
  offered: 'Получено предложение',
  expired: 'Срок истёк',
  superseded: 'Условия пересмотрены',
  'staff-payroll': 'Зарплаты персонала',
  investment: 'Инвестиции',
  'asset-sale': 'Продажа активов',
  program: 'Спортивная программа',
  withdrawn: 'Отозвано',
  flank: 'Борт',
  upper: 'Верх кузова',
  sill: 'Порог',
  shoulder: 'Плечо кузова',
  wing: 'Антикрыло',
})
function placementMatches(layer, right, paint) {
  if (!layer || layer.zone !== right.zone) return false
  if (right.color && paint?.colors?.[0]?.toLowerCase() !== right.color.toLowerCase()) return false
  const width = 100 * layer.scale * Math.abs(Math.cos(((layer.angle || 0) * Math.PI) / 180)),
    center = 100 * layer.x,
    left = Math.max(0, center - width / 2),
    edge = Math.min(100, center + width / 2),
    offset = right.offset || 0
  return (
    edge - left + 1e-6 >= right.share &&
    (!offset || (left <= offset + 1 && edge >= offset + right.share - 1))
  )
}
function RightsView({ tab }) {
  const b = useBusiness(),
    { g, org } = b,
    [query, setQuery] = useState('')
  const brands = b.base.commercial?.brands || [],
    brandName = (id) => brands.find((x) => x.id === id)?.name || b.orgName(id)
  const source = arr(b.base.rights)
  const rows = source.flatMap((c) =>
    c.items.map((right, i) => {
      const saved = c.mounts?.[right.zone],
        fulfilled = right.fulfilled
      return {
        ...right,
        ...c,
        items: undefined,
        id: c.contract + ':' + i,
        fulfilled,
        future: c.start > g.game.career.date,
        saved,
      }
    }),
  )
  const filtered = rows.filter(
    (x) =>
      (tab === 'all' || (tab === 'pending' ? !x.fulfilled : x.fulfilled)) &&
      (!g.entity || source.some((s) => s.contract === g.entity)
        ? !g.entity || x.contract === g.entity
        : true) &&
      (!query ||
        [brandName(x.sponsor), txt(x.zone), x.entry, b.orgName(x.org)]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())),
  )
  function mount(x) {
    if (x.org !== org) {
      g.openDialog({
        title: 'Размещает клиентская команда',
        content: (
          <div className="business-stack">
            <p>
              Рекламная поверхность принадлежит {b.orgName(x.org)}. Производитель видит исполнение
              договора, а размещение выполняет команда.
            </p>
            <Button onClick={() => g.navigate('manufacturer', 'clients', x.org)}>К клиенту</Button>
          </div>
        ),
      })
      return
    }
    if (x.entry) {
      g.setSelectedEntry(x.entry)
      g.navigate('livery', 'decals', x.contract)
      return
    }
    g.openDialog({
      title: 'Размещение: ' + brandName(x.sponsor),
      wide: true,
      content: (
        <MountComposer
          right={x}
          brand={brandName(x.sponsor)}
          onSave={(layer) =>
            b.save('mount', {
              contract: x.contract,
              zone: x.zone,
              x: layer?.x ?? 0.5,
              scale: layer?.scale ?? 0.3,
              remove: !layer,
            })
          }
        />
      ),
    })
  }
  return (
    <div className="business-stack">
      <div className="rights-status">
        <div>
          <strong>
            {rows.filter((x) => x.fulfilled).length}
            <span> / {rows.length}</span>
          </strong>
          <p>поверхностей соответствуют договору</p>
        </div>
        <div>
          <Meter value={rows.filter((x) => x.fulfilled).length} max={rows.length || 1} />
          <p>Проверка учитывает размер, область, цвет и перекрытие логотипа.</p>
        </div>
        <Button variant="secondary" onClick={() => g.navigate('commercial', 'contracts')}>
          К договорам
        </Button>
      </div>
      <div className="toolbar">
        <Input
          label="Поиск по правам"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Партнёр, машина, поверхность"
        />
        {g.entity && (
          <Button variant="ghost" onClick={() => g.navigate('rights', tab)}>
            Все договоры
          </Button>
        )}
      </div>
      <div className="rights-register">
        {filtered.map((x) => (
          <article key={x.id} className={'right-row ' + (x.fulfilled ? 'fulfilled' : '')}>
            <div className="right-mark">
              <Icon name={x.fulfilled ? 'Check' : 'AlertTriangle'} size={21} />
            </div>
            <div className="right-party">
              <h3>{brandName(x.sponsor)}</h3>
              <p>
                {txt(x.zone)}
                {x.entry ? ' · №' + g.world.entries[x.entry]?.number : ''}
              </p>
              <small>{x.org !== org ? b.orgName(x.org) : dateLabel(x.end)}</small>
            </div>
            <div className="right-zone">
              <span>
                {x.offset || 0}–{(x.offset || 0) + x.share}% поверхности
              </span>
              <div className="rights-mini-track">
                <i style={{ left: (x.offset || 0) + '%', width: x.share + '%' }} />
              </div>
              <small>
                Минимум {x.share}% · приоритет {x.priority || 0}
              </small>
            </div>
            <Badge tone={x.future ? 'neutral' : x.fulfilled ? 'good' : 'warning'}>
              {x.future ? 'Будущие права' : x.fulfilled ? 'Выполнено' : 'Нужно разместить'}
            </Badge>
            <Button
              variant={x.fulfilled ? 'ghost' : 'secondary'}
              disabled={x.future && x.org === org}
              onClick={() => mount(x)}
            >
              {x.org !== org
                ? 'Посмотреть клиента'
                : x.entry
                  ? 'В редактор'
                  : x.fulfilled
                    ? 'Изменить'
                    : 'Разместить'}
            </Button>
          </article>
        ))}
        {!filtered.length && (
          <EmptyState
            title={tab === 'fulfilled' ? 'Подтверждённых размещений пока нет' : 'Неисполненных прав нет'}
            description="Права появляются после подписания коммерческого договора."
          />
        )}
      </div>
      {note(
        'Изменения в редакторе учитываются только после сохранения ливреи. Черновик не подтверждает рекламные обязательства.',
      )}
    </div>
  )
}
function MountComposer({ right, brand, onSave }) {
  const [x, setX] = useState(
      Math.round((right.saved?.x ?? ((right.offset || 0) + right.share / 2) / 100) * 100),
    ),
    [width, setWidth] = useState(Math.round((right.saved?.scale ?? right.share / 100) * 100)),
    [error, setError] = useState('')
  const layer = {
      asset: right.sponsor,
      zone: right.zone,
      x: x / 100,
      y: 0.5,
      scale: width / 100,
      angle: 0,
    },
    good = placementMatches(layer, right, {})
  return (
    <div className="business-stack">
      <div className={'signage-preview ' + right.zone}>
        <span className="eyebrow">{txt(right.zone)}</span>
        <div className="signage-track">
          <div
            className="signage-target"
            style={{
              left: (right.offset || 0) + '%',
              width: right.share + '%',
            }}
          />
          <div
            className="signage-mark"
            style={{
              left: Math.max(0, x - width / 2) + '%',
              width: Math.min(width, 100 - x + width / 2) + '%',
            }}
          >
            {brand}
          </div>
        </div>
        <p>Пунктир — область по договору. Знак должен покрывать её.</p>
      </div>
      <div className="form-grid">
        <label>
          <span>Центр размещения, %</span>
          <input
            type="number"
            aria-label="Центр размещения, %"
            min="0"
            max="100"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
            aria-label="Положение знака"
          />
        </label>
        <label>
          <span>Ширина знака, %</span>
          <input
            type="number"
            aria-label="Ширина знака, %"
            min="10"
            max="100"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
          <input
            type="range"
            min="10"
            max="100"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            aria-label="Ширина знака"
          />
        </label>
      </div>
      <Badge tone={good ? 'good' : 'warning'}>
        {good ? 'Геометрия соответствует правам' : 'Нужно покрыть всю область и минимальную ширину'}
      </Badge>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {right.saved && (
          <Button variant="ghost" onClick={() => onSave(null).catch((e) => setError(e.message))}>
            Удалить знак
          </Button>
        )}
        <Button
          onClick={async () => {
            try {
              if (width < 10 || width > 100 || x < 0 || x > 100)
                throw Error('Положение 0–100%, ширина 10–100%.')
              await onSave(layer)
            } catch (e) {
              setError(e.message)
            }
          }}
        >
          Сохранить размещение
        </Button>
      </div>
    </div>
  )
}
function EconomyView({ tab }) {
  const b = useBusiness(),
    { g } = b,
    d = b.base.economy || {},
    license = d.license,
    regions = Object.keys(d.audience || {}),
    sales = arr(d.sales),
    flows = Object.entries(d.flows || {}),
    suppliers = arr(d.suppliers)
  function distribution() {
    g.openForm({
      title: 'Лицензия на коллекцию мерча',
      description:
        'Лицензия задаёт регион, сегмент и оптовую цену единицы. Объём продаж появится после экономического расчёта карьеры.',
      fields: [
        field('region', 'Регион', license?.region || g.world.organizations[b.org].country, 'select', {
          options: regions.map((r) => ({
            value: r,
            label: g.world.countries[r],
          })),
        }),
        field('offer', 'Сегмент', license?.offer || 'premium', 'select', {
          options: [
            { value: 'standard', label: 'Стандарт · себестоимость 11,30 €' },
            { value: 'premium', label: 'Премиум · себестоимость 19,40 €' },
          ],
        }),
        field('price', 'Оптовая цена единицы, €', euros(license?.unit_cents || 3990), 'number', {
          min: 1,
          max: 200,
          step: '.01',
        }),
      ],
      onSubmit: (v) =>
        b.run('distribution', { region: v.region, offer: v.offer, unit_cents: cents(v.price) }),
    })
  }
  const cost = license?.offer === 'premium' ? 1940 : 1130
  return (
    <div className="business-stack">
      {tab === 'licenses' && (
        <>
          <div className="merch-stage">
            <div>
              <span className="eyebrow">COLLECTION / {g.game.career.date.slice(0, 4)}</span>
              <h2>Команда за пределами трассы</h2>
              <p>Региональный спрос, лицензия на коллекцию и экономика каждой продажи.</p>
              <Button onClick={distribution}>
                {license ? 'Изменить лицензию' : 'Оформить лицензию'}
              </Button>
            </div>
            <div className="merch-wordmark" style={{ borderColor: g.world.organizations[b.org].color }}>
              <span>{g.world.organizations[b.org].name}</span>
              <small>TEAM COLLECTION</small>
            </div>
          </div>
          {license ? (
            <Panel
              title="Действующая лицензия"
              actions={
                <Button
                  variant="ghost"
                  onClick={() =>
                    g.confirm({
                      title: 'Отозвать лицензию',
                      body: 'Новые продажи этой коллекции будут остановлены. Уже полученные результаты сохраняются.',
                      confirmLabel: 'Отозвать',
                      onConfirm: () =>
                        b.run('distribution', {
                          region: license.region,
                          unit_cents: license.unit_cents,
                          offer: 'withdraw',
                        }),
                    })
                  }
                >
                  Отозвать
                </Button>
              }
            >
              <div className="metric-strip">
                <Stat label="Регион" value={g.world.countries[license.region]} />
                <Stat label="Сегмент" value={txt(license.offer)} />
                <Stat label="Цена единицы" value={money(license.unit_cents)} />
                <Stat
                  label="Маржа единицы"
                  value={money(license.unit_cents - cost)}
                  detail={'Себестоимость ' + money(cost)}
                />
              </div>
              <p>
                Действует с {dateLabel(license.since)}. Прогноз спроса не выдаётся за состоявшиеся
                продажи.
              </p>
            </Panel>
          ) : (
            <EmptyState
              title="Лицензия на коллекцию не оформлена"
              description="Выберите рынок и сегмент, затем задайте цену. Пустой реестр продаж отражает исходное состояние карьеры."
            />
          )}
          <Panel title="Фактические продажи">
            <DataTable
              rows={sales}
              columns={[
                {
                  key: 'region',
                  label: 'Регион',
                  render: (x) => g.world.countries[x.region] || x.region,
                },
                { key: 'units', label: 'Единиц' },
                {
                  key: 'revenue_cents',
                  label: 'Выручка',
                  render: (x) => money(x.revenue_cents),
                },
                {
                  key: 'margin_cents',
                  label: 'Маржа',
                  render: (x) => money(x.margin_cents),
                },
              ]}
              empty="Продаж пока нет"
            />
          </Panel>
        </>
      )}
      {tab === 'markets' && (
        <Panel title="Региональная аудитория" subtitle="Подтверждённый охват из данных карьеры">
          <div className="region-grid">
            {regions.map((r) => (
              <button
                className="region-row"
                key={r}
                onClick={() =>
                  g.openDialog({
                    title: g.world.countries[r],
                    content: (
                      <div className="business-stack">
                        <Facts
                          rows={[
                            ['Подтверждённый охват', d.audience[r]],
                            ['Лицензия', license?.region === r ? txt(license.offer) : 'Не оформлена'],
                            ['Цена коллекции', license?.region === r ? money(license.unit_cents) : '—'],
                          ]}
                        />
                        <p>
                          Интервью, домашние этапы, мероприятия и продажи могут влиять на охват. Источник
                          фиксирует наблюдения отдельно от прогнозов.
                        </p>
                        <Button onClick={distribution}>Настроить лицензию</Button>
                      </div>
                    ),
                  })
                }
              >
                <span>{g.world.countries[r]}</span>
                <strong>{d.audience[r]}</strong>
                <Meter value={d.audience[r]} max={Math.max(...Object.values(d.audience), 1)} />
                <small>{license?.region === r ? 'Лицензия активна' : 'Рынок доступен'}</small>
              </button>
            ))}
          </div>
          <h3>Источники охвата</h3>
          <DataTable
            rows={arr(d.receipts)}
            columns={[
              { key: 'day', label: 'Дата', render: (x) => dateLabel(x.day) },
              {
                key: 'country',
                label: 'Регион',
                render: (x) => g.world.countries[x.country],
              },
              { key: 'kind', label: 'Событие', render: (x) => txt(x.kind) },
              { key: 'reach', label: 'Охват' },
            ]}
            empty="Новых подтверждений охвата нет"
          />
        </Panel>
      )}
      {tab === 'annual' && (
        <>
          <Panel title="Годовой экономический цикл">
            <div className="annual-flow">
              {[
                [
                  '01',
                  'Договоры',
                  'Обновите коммерческие пакеты и кадровые соглашения',
                  'commercial',
                  'contracts',
                ],
                ['02', 'План', 'Утвердите бюджет и программу развития', 'budget', 'plan'],
                [
                  '03',
                  'Исполнение',
                  'Следите за обязательствами, производством и рекламой',
                  'finance',
                  'terms',
                ],
                [
                  '04',
                  'Закрытие',
                  'Сравните фактический результат и подготовьте следующий сезон',
                  'finance',
                  'report',
                ],
              ].map(([n, title, description, route, t]) => (
                <button key={n} onClick={() => g.navigate(route, t)}>
                  <span>{n}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <Icon name="ArrowUpRight" />
                </button>
              ))}
            </div>
            <div className="annual-status">
              <Badge tone={d.can_advance ? 'good' : 'warning'}>
                {d.can_advance ? 'Экономический переход доступен' : 'Сезонный календарь не завершён'}
              </Badge>
              <p>
                {d.can_advance
                  ? 'Можно провести начисления следующего месяца.'
                  : 'Переход месяца открывается после завершения опубликованного календаря.'}
              </p>
              {d.can_advance && (
                <Button onClick={() => b.action('month', {})}>Перейти к следующему месяцу</Button>
              )}
              <Button variant="secondary" onClick={() => g.navigate('calendar')}>
                Открыть календарь
              </Button>
            </div>
          </Panel>
          <Panel title="Потоки за период">
            {flows.length ? (
              <Facts
                rows={flows.map(([key, v]) => [
                  txt(key),
                  typeof v === 'number' ? money(v) : JSON.stringify(v),
                ])}
              />
            ) : (
              <EmptyState
                title="Период ещё не закрывался"
                description="Годовой результат появится после фактических операций и закрытия периода в симуляции."
              />
            )}
          </Panel>
        </>
      )}
      {tab === 'supply' && (
        <Panel
          title="Экономика обслуживания клиентов"
          subtitle="Производство, поддержка, гарантия и коммерческие скидки"
        >
          <DataTable
            rows={suppliers}
            columns={[
              {
                key: 'client',
                label: 'Клиент',
                render: (x) => (
                  <button
                    className="link-button"
                    onClick={() => g.navigate('manufacturer', 'clients', x.client)}
                  >
                    {b.orgName(x.client)}
                  </button>
                ),
              },
              { key: 'units', label: 'Поставлено' },
              {
                key: 'production_cents',
                label: 'Производство',
                render: (x) => money(x.production_cents),
              },
              {
                key: 'service_costs',
                label: 'Обслуживание',
                render: (x) => (
                  <button
                    className="link-button"
                    onClick={() =>
                      g.openDialog({
                        title: 'Затраты на обслуживание',
                        content: (
                          <Facts
                            rows={Object.entries(x.service_costs || {}).map(([k, v]) => [
                              txt(k),
                              money(v),
                            ])}
                          />
                        ),
                      })
                    }
                  >
                    {money(sum(Object.values(x.service_costs || {})))}
                  </button>
                ),
              },
              {
                key: 'discount_cents',
                label: 'Скидки',
                render: (x) => money(x.discount_cents),
              },
              {
                key: 'margin_cents',
                label: 'Маржа',
                render: (x) => money(x.margin_cents),
              },
            ]}
            empty="Договорных затрат пока нет"
          />
          {note(
            'Нулевые фактические расходы означают отсутствие проведённых операций на стартовую дату. Будущая стоимость договора остаётся в коммерческом разделе.',
          )}
        </Panel>
      )}
    </div>
  )
}
export default function Business() {
  const g = useGame(),
    route = TABS[g.route] ? g.route : 'finance'
  let items = TABS[route]
  if (route === 'economy' && g.role !== 'manufacturer') items = items.filter((x) => x[0] !== 'supply')
  const tab = items.some((x) => x[0] === g.tab) ? g.tab : items[0][0]
  const subtitles = {
    finance: 'Деньги, обязательства и решения на одной линии времени.',
    budget: 'Распределяйте ресурсы между скоростью, людьми и устойчивостью.',
    cap: 'Применимые регламенты, фактическое использование и доступный остаток.',
    facilities: 'Управляйте рабочими мощностями и доступом к оборудованию.',
    capital:
      g.role === 'manager'
        ? 'Структура организации и границы полномочий менеджера.'
        : 'Инвестиции, доли, долговая нагрузка и спортивные программы.',
    commercial:
      g.role === 'manufacturer'
        ? 'Клиентские пакеты, поставки и встречные коммерческие обязательства.'
        : 'Партнёры, контракты, переговоры и коммерческая ценность команды.',
    rights: 'От договора к видимому размещению на машине и в паддоке.',
    economy: 'Региональная аудитория, лицензионные продажи и годовой цикл.',
  }
  return (
    <div className="business-module">
      <PageHeading
        eyebrow={
          (g.role === 'manufacturer' ? 'Производитель' : g.role === 'owner' ? 'Владелец' : 'Менеджер') +
          ' / ' +
          g.world.organizations[g.game.career.org].name
        }
        title={TITLES[route]}
        description={subtitles[route]}
      />
      <Tabs
        items={items.map(([id, label]) => ({ id, label }))}
        value={tab}
        onChange={(t) => g.setTab(t)}
      />
      {route === 'finance' ? (
        <FinanceView key={g.scope} tab={tab} />
      ) : route === 'budget' ? (
        <BudgetView key={g.scope} tab={tab} />
      ) : route === 'cap' ? (
        <BudgetView key={g.scope} tab={tab} cap />
      ) : route === 'facilities' ? (
        <FacilitiesView key={g.scope} tab={tab} />
      ) : route === 'capital' ? (
        <CapitalView key={g.scope} tab={tab} />
      ) : route === 'commercial' ? (
        <CommercialView key={g.scope} tab={tab} />
      ) : route === 'rights' ? (
        <RightsView key={g.scope} tab={tab} />
      ) : (
        <EconomyView key={g.scope} tab={tab} />
      )}
    </div>
  )
}
