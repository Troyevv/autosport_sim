import { useState, type FormEvent } from 'react'
import { Button, Dialog, Header, Facts, Panel } from '../../ui/components'
import { usePersonnel } from '../staff/model'
import { money, type Career } from '../api'
import type { SectionProps } from '../Sections'
import { useOrder } from './useOrder'
type Asset = {
  id: string
  owner: string
  kind: string
  country: string
  status: string
  condition: number
  ready: string
  level: number
  capacity: number
  free: number
  book_cents: number
  daily_cents: number
  effective_person_days_x100: number
}
type Quote = {
  build_cents: number
  monthly_cents: number
  staff: number
  days: number
}
type Inventory = {
  types: Record<string, string>
  locations: string[]
  quotes: Record<string, Record<string, Quote>>
  staff: number
  processes: Record<string, string>
  windows: {
    process: string
    installed_slots: number
    available_slots: number
    effective_person_days_x100: number
    confirmed_queue: string[]
  }[]
  assets: Asset[]
  bookings: {
    id: string
    facility: string
    start: string
    end: string
    mode: string
    purpose?: string
    units: number
    cost_cents: number
  }[]
}
const operations: Record<string, string> = {
  research: 'Исследования',
  development: 'Разработка',
  production: 'Производство',
  testing: 'Испытания',
  inspection: 'Контроль качества',
  storage: 'Хранение',
  engineering: 'Испытания',
  preparation: 'Подготовка персонала',
}
const modes: Record<string, string> = { lease: 'Аренда', outsource: 'Аутсорсинг', use: 'Выделение мощности' }
const personDays = (value: number) => (value / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
const states: Record<string, string> = {
  active: 'В эксплуатации',
  construction: 'Строительство',
  upgrade: 'Модернизация',
}
export function Facilities({ c, world, updateCareer }: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<Inventory>('careers/' + c.id + '/facilities', c.revision),
    v = req.data,
    order = useOrder(c, updateCareer)
  const [tab, setTab] = useState('Организация'),
    [dialog, open] = useState<Asset | 'build' | null>(null),
    [kind, select] = useState('simulator'),
    [country, locate] = useState('GB'),
    [assetFilter, filterAssets] = useState('')
  const q = v?.quotes[kind][country]
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!dialog) return
    const f = new FormData(e.currentTarget)
    const ok =
      dialog === 'build'
        ? await order.send('finance-build', { kind, country })
        : dialog.owner === c.org
          ? await order.send('finance-upgrade', { facility: dialog.id })
          : await order.send('finance-lease', {
              facility: dialog.id,
              start: f.get('start'),
              days: Number(f.get('days')),
              units: Number(f.get('units')),
              mode: f.get('mode'),
            })
    if (ok) open(null)
  }
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Инфраструктура"
        sub="Объекты, производственные мощности и аренда"
      />
      <div className="finance-actions">
        {['Организация', 'Мощности', 'Аренда и аутсорсинг', 'Бронирования'].map((n) => (
          <Button key={n} primary={n === tab} onClick={() => setTab(n)}>
            {n}
          </Button>
        ))}
      </div>
      {req.error && <p role="alert">{req.error}</p>}
      {v && (
        <Panel
          title={tab}
          action={
            tab === 'Организация' &&
            c.role !== 'manager' && (
              <Button
                onClick={() => {
                  order.clear()
                  open('build')
                }}
              >
                Начать строительство
              </Button>
            )
          }
        >
          {tab === 'Мощности' ? (
            <div className="panel-body">
              <p className="muted">
                Доступно на {c.date} с учётом аренды, бронирований, занятости коллективов и состояния
                оборудования.
              </p>
              <div className="capacity-grid">
                {v.windows.map((pool) => (
                  <section className="capacity-card" key={pool.process}>
                    <h3>{operations[pool.process]}</h3>
                    <Facts
                      items={[
                        ['Собственные проектные места', pool.installed_slots],
                        ['Свободные места с учётом аренды', pool.available_slots],
                        ['Доступно за день, чел.-дн.', personDays(pool.effective_person_days_x100)],
                        ['Заказы в работе', pool.confirmed_queue.length],
                      ]}
                    />
                    <Button
                      onClick={() => {
                        filterAssets(
                          Object.keys(v.processes).find((k) => v.processes[k] === pool.process) ?? '',
                        )
                        setTab('Аренда и аутсорсинг')
                      }}
                    >
                      Подобрать объект
                    </Button>
                  </section>
                ))}
              </div>
            </div>
          ) : tab === 'Бронирования' ? (
            v.bookings.length ? (
              v.bookings.map((b) => (
                <div className="result" key={b.id}>
                  <span>
                    <strong>{v.types[v.assets.find((a) => a.id === b.facility)?.kind ?? '']}</strong>
                    <small>
                      {modes[b.mode]} · {b.purpose && operations[b.purpose]} {b.start} — {b.end} · {b.units}{' '}
                      ед.
                    </small>
                  </span>
                  {money(b.cost_cents)}
                </div>
              ))
            ) : (
              <p className="panel-body">Предстоящих бронирований нет.</p>
            )
          ) : (
            <>
              {tab === 'Организация' && (
                <p className="panel-body">Доступный штат коллективов · {v.staff} чел.</p>
              )}
              {tab === 'Аренда и аутсорсинг' && (
                <div className="finance-tools">
                  <label>
                    Тип объекта
                    <select value={assetFilter} onChange={(e) => filterAssets(e.target.value)}>
                      <option value="">Все типы</option>
                      {Object.entries(v.types).map(([k, n]) => (
                        <option key={k} value={k}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {v.assets
                .filter((a) =>
                  tab === 'Организация'
                    ? a.owner === c.org
                    : a.owner !== c.org && a.status === 'active' && (!assetFilter || assetFilter === a.kind),
                )
                .map((a) => (
                  <div className="result rights-row" key={a.id}>
                    <span>
                      <strong>
                        {v.types[a.kind]} · {a.country}
                      </strong>
                      <small>
                        {world.organizations[a.owner]?.name ?? 'Независимый оператор'} · {states[a.status]} ·{' '}
                        {a.status === 'active'
                          ? 'Свободно ' + a.free + ' из ' + a.capacity
                          : 'Ввод ' + a.ready}
                      </small>
                      <small>
                        {operations[v.processes[a.kind]] && operations[v.processes[a.kind]] + ' · '}
                        {a.owner === c.org
                          ? 'Оценка ' + money(a.book_cents) + ' · состояние ' + a.condition + '%'
                          : 'Ставка ' + money(a.daily_cents) + '/сут.'}
                      </small>
                      {a.status === 'active' && (
                        <small>
                          Уровень {a.level} · {personDays(a.effective_person_days_x100)} чел.-дн. в сутки
                        </small>
                      )}
                    </span>
                    {a.status === 'active' && (a.owner !== c.org || c.role !== 'manager') && (
                      <Button
                        onClick={() => {
                          order.clear()
                          open(a)
                        }}
                      >
                        {a.owner === c.org ? 'Модернизировать' : 'Забронировать'}
                      </Button>
                    )}
                  </div>
                ))}
              {tab === 'Организация' && !v.assets.some((a) => a.owner === c.org) && (
                <p className="panel-body">
                  Собственных объектов пока нет. Доступные мощности операторов размещены в разделе аренды.
                </p>
              )}
            </>
          )}
        </Panel>
      )}
      {dialog && v && (
        <Dialog title={dialog === 'build' ? 'Новый объект' : v.types[dialog.kind]} onClose={() => open(null)}>
          <form className="finance-form" onSubmit={submit}>
            {dialog === 'build' ? (
              <>
                <label>
                  Тип объекта
                  <select value={kind} onChange={(e) => select(e.target.value)}>
                    {Object.entries(v.types).map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Расположение
                  <select value={country} onChange={(e) => locate(e.target.value)}>
                    {v.locations.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                {q && (
                  <Facts
                    items={[
                      ['Стоимость', money(q.build_cents)],
                      ['Срок', q.days + ' дн.'],
                      ['Обслуживание в месяц', money(q.monthly_cents)],
                      ['Персонал', q.staff],
                      ['Назначение', operations[v.processes[kind]] ?? 'Обеспечение организации'],
                    ]}
                  />
                )}
              </>
            ) : dialog.owner === c.org ? (
              <Facts
                items={[
                  ['Следующий уровень', dialog.level + 1],
                  [
                    'Стоимость',
                    money((v.quotes[dialog.kind][dialog.country].build_cents * dialog.level) / 2),
                  ],
                  ['Простой, дней', Math.floor(v.quotes[dialog.kind][dialog.country].days / 2)],
                ]}
              />
            ) : (
              <>
                <label>
                  Договор
                  <select name="mode">
                    <option value="lease">Аренда</option>
                    <option value="outsource">Аутсорсинг (+20%)</option>
                  </select>
                </label>
                <label>
                  Начало
                  <input type="date" name="start" min={c.date} defaultValue={c.date} required />
                </label>
                <label>
                  Дней
                  <input type="number" name="days" min="1" max="366" defaultValue="2" required />
                </label>
                <label>
                  Единиц мощности
                  <input type="number" name="units" min="1" max="8" defaultValue="1" required />
                </label>
                <p>Ставка за единицу в сутки · {money(dialog.daily_cents)}</p>
              </>
            )}
            {order.error && <p role="alert">{order.error}</p>}
            <Button primary type="submit" disabled={order.busy}>
              Подтвердить
            </Button>
          </form>
        </Dialog>
      )}
    </section>
  )
}
