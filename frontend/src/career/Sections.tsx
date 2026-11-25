import { useState } from 'react'
import { CalendarDays, ChevronRight, Flag, MapPin } from 'lucide-react'
import { dateLabel, millions } from '../game'
import { Button, Dialog, Facts, Header, Panel, Stats, Table } from '../ui/components'
import { SeasonCalendar } from '../ui/SeasonCalendar'
import { assetUrl, money, type World, type Career, type Seat, type Asset } from './api'
import { Portrait } from './Portrait'

export type SectionProps = { world: World; c: Career; media: Asset[] }
const labels = { manager: 'Штаб команды', owner: 'Штаб владельца', manufacturer: 'Штаб производителя' }
export function Overview({ world, c, media }: SectionProps) {
  const org = world.organizations[c.org],
    series = world.championships[c.series]
  const events = world.events.filter(
    (e) => e.series === c.series && e.end >= c.date && (!e.org || e.org === c.org),
  )
  const event = events[0],
    seats = c.assignments.filter((a) => a.occupant && a.occupant.id !== 'player')
  const entries = Object.values(world.entries).filter(
    (e) =>
      e.championship === c.series &&
      (e.org === c.org || Object.values(world.cars[e.car].suppliers).includes(c.org)),
  )
  const photo = entries.map((e) => assetUrl(media, 'car', e.car)).find(Boolean)
  return (
    <section className="screen">
      <Header
        section={org.name + ' / Центр управления'}
        title={labels[c.role]}
        sub={[series.name, org.name, ...org.lines.map(line=>world.products[line].name)].join(' · ')}
      />
      <section className="dashboard-hero program-hero career-hero">
        {photo ? (
          <img alt="" src={photo} />
        ) : (
          <div className="program-hero-mark">{c.series.toUpperCase()}</div>
        )}
        <div className="hero-content">
          <div className="hero-round">
            <i />
            {event ? 'КАЛЕНДАРЬ ПРОГРАММЫ' : 'КАЛЕНДАРЬ ЗАВЕРШЁН'}
          </div>
          <h2>{event?.name || series.name}</h2>
          {event && (
            <div className="hero-meta">
              <MapPin size={15} />
              {event.circuit} · {dateLabel(event.start)} — {dateLabel(event.end)}
            </div>
          )}
          <div className="hero-bottom">
            <a className="btn btn-primary" href="#calendar">
              <CalendarDays size={15} /> К календарю
            </a>
            {event && (
              <small>
                {event.round ? 'Этап ' + event.round : event.sessions[0]}
                <br />
                {series.name}
              </small>
            )}
          </div>
        </div>
      </section>
      <Stats
        items={[
          ['Доступный остаток', millions(c.account.cash_cents), 'Средства организации'],
          ['Бюджет', millions(c.account.budget_cents), 'Утверждено на сезон'],
          ['Прогноз', millions(c.account.forecast_cents), 'После ближайшей выплаты'],
          [
            c.role === 'manufacturer' ? 'Клиентские заявки' : 'Заявки',
            entries.length,
            series.classes.join(' · '),
          ],
        ]}
      />
      <div className="section-grid">
        <Panel
          title={c.role === 'manufacturer' ? 'Клиенты программы' : 'Заявки программы'}
          action={<Flag size={15} />}
        >
          {entries.map((e) => (
            <div key={e.id} className="result">
              <span className="chip">#{e.number}</span>
              <span>
                <strong>{world.cars[e.car].name}</strong>
                <small>
                  {c.role === 'manufacturer'
                    ? world.organizations[e.org].name
                    : e.crew.map((id) => world.names[id]).join(' · ')}
                </small>
              </span>
            </div>
          ))}
        </Panel>
        <div className="career-stack">
          <Panel
            title="Ближайшие этапы"
            action={
              <a className="subtle-link" href="#calendar">
                Календарь <ChevronRight size={12} />
              </a>
            }
          >
            {events.slice(0, 3).map((e) => (
              <div className="result" key={e.id}>
                <span>
                  <small>{dateLabel(e.start)}</small>
                  <strong>{e.name}</strong>
                </span>
                <span className="chip">{e.round ? 'Этап ' + e.round : e.sessions[0]}</span>
              </div>
            ))}
            {!events.length && <p className="panel-body muted">Этапов больше нет.</p>}
          </Panel>
          <Panel
            title="Люди организации"
            action={
              <a className="subtle-link" href="#people">
                Состав <ChevronRight size={12} />
              </a>
            }
          >
            <div className="result">
              <span>Известные участники состава</span>
              <b>{new Set(seats.map((a) => a.occupant!.id)).size}</b>
            </div>
            <div className="result">
              <span>Коллективы</span>
              <b>{c.collectives.length}</b>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  )
}
export function Calendar({ world, c }: SectionProps) {
  return (
    <SeasonCalendar
      key={c.date}
      today={c.date}
      selectedDate={c.date}
      initialFilter={c.series}
      seriesNames={Object.fromEntries(Object.entries(world.championships).map(([id, v]) => [id, v.name]))}
      subtitle="Начало гоночных уик-эндов и программа сессий."
      schedule={world.events.map((e) => ({
        id: e.id,
        day: e.start,
        series: e.series,
        title: world.championships[e.series].name + ' · ' + e.name,
        type: e.kind === 'round' ? 'race' : 'development',
        detail: [e.circuit, dateLabel(e.start) + ' — ' + dateLabel(e.end), ...e.sessions].join(' · '),
      }))}
    />
  )
}
export function Championships({ world, c, media }: SectionProps) {
  const [series, choose] = useState(c.series),
    r = world.championships[series],
    es = Object.values(world.entries).filter((e) => e.championship === series)
  const logo = assetUrl(media, 'logo', series)
  return (
    <section className="screen">
      <Header
        section={'Сезон ' + world.origin.season}
        title="Чемпионаты"
        sub="Регламенты, машины и экипажи стартового состава."
      >
        <select aria-label="Чемпионат" value={series} onChange={(e) => choose(e.target.value)}>
          {Object.values(world.championships).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Header>
      <div className="series-banner">
        <div>
          <div className="eyebrow">{r.discipline}</div>
          <h2>{r.name}</h2>
          <p>{r.finish}</p>
        </div>
        {logo && <img className="career-logo" alt={r.name} src={logo} />}
      </div>
      <Panel title="Регламент">
        <Facts
          items={[
            ['Классы', r.classes.join(' · ')],
            ...Object.entries(r.tyre_market).map(([category,policy]):[string,string]=>[
              'Шины · '+category,
              ({sole:'Единый поставщик',approved:'Допущенные поставщики',open:'Открытая конкуренция'}[policy.mode]||policy.mode)+' · '+policy.approved_suppliers.map(id=>world.organizations[id].name).join(', ')
            ]),
            ['Экипаж', r.crew[0] === r.crew[1] ? r.crew[0] : r.crew.join('–')],
            ['Сессии', Object.values(r.sessions)[0].join(' · ')],
            ['Очки за гонку', (r.points.race || r.points['6h']).toString().replaceAll(',', ' · ')],
          ]}
        />
      </Panel>
      <Panel title={'Заявки · ' + es.length}>
        <Table
          label="Заявки чемпионата"
          columns={['№', 'Организация', 'Машина', 'Пилоты', 'Поставщики']}
          rows={es.map((e) => ({
            id: e.id,
            active: e.org === c.org,
            cells: [
              e.number,
              world.organizations[e.org].name,
              world.cars[e.car].name,
              e.crew.map((id) => world.names[id]).join(' · '),
              Object.values(world.cars[e.car].suppliers)
                .map((id) => world.organizations[id].name)
                .join(' · '),
            ],
          }))}
        />
      </Panel>
    </section>
  )
}
export function People({ world, c, media }: SectionProps) {
  const [selected, select] = useState<Seat | null>(null),
    [query, search] = useState('')
  const seats = c.assignments.filter((a) => a.occupant),
    person = selected?.occupant
  const matching = seats.filter((a) =>
    (a.occupant!.name + ' ' + world.positions[a.position].name)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  return (
    <section className="screen">
      <Header
        section={world.organizations[c.org].name}
        title="Пилоты и персонал"
        sub="Назначения в организации и коллективы. Характеристики и фонд оплаты — игровые оценки."
      />
      <label className="people-search">
        <input
          aria-label="Найти человека"
          type="search"
          placeholder="Имя или должность"
          value={query}
          onChange={(e) => search(e.target.value)}
        />
      </label>
      <div className="career-roster">
        {matching.map((a) => (
          <button className="career-person" key={a.id} onClick={() => select(a)}>
            <Portrait
              person={a.occupant!}
              org={a.org}
              color={c.team_color}
              driver={a.position === 'driver'}
              media={media}
            />
            <span>
              <small>{world.positions[a.position].name}</small>
              <strong>{a.occupant!.name}</strong>
              {a.series && <small>{world.championships[a.series].name}</small>}
            </span>
          </button>
        ))}
      </div>
      {!matching.length && <p className="empty-state">Совпадений нет.</p>}
      <Panel title="Коллективы">
        <Table
          label="Инженеры и рабочие"
          columns={['Коллектив', 'Человек', 'Квалификация', 'Нагрузка', 'Усталость', 'ФОТ / месяц']}
          rows={c.collectives.map((g) => ({
            id: g.id,
            cells: [
              g.name,
              g.size,
              g.qualification,
              g.workload + '%',
              g.fatigue + '%',
              money(g.payroll_cents),
            ],
          }))}
        />
      </Panel>
      <details className="panel career-details">
        <summary>Должности без опубликованного назначения</summary>
        {c.assignments
          .filter((a) => !a.occupant)
          .map((a) => (
            <div className="result" key={a.id}>
              <span>{world.positions[a.position].name}</span>
              <small>
                {a.entry
                  ? '№ ' + world.entries[a.entry]?.number
                  : a.series
                    ? world.championships[a.series].name
                    : 'Организация'}
              </small>
            </div>
          ))}
      </details>
      {selected && person && (
        <Dialog title={person.name} onClose={() => select(null)}>
          <div className="career-dossier">
            <Portrait
              person={person}
              org={selected.org}
              color={c.team_color}
              driver={selected.position === 'driver'}
              media={media}
            />
            <div>
              <p className="eyebrow">{world.positions[selected.position].name}</p>
              <h3>{world.organizations[c.org].name}</h3>
              <p>{person.origin === 'real' ? 'Стартовый состав' : 'Игрок'}</p>
            </div>
          </div>
          <Facts items={Object.entries(person.skills)} />
          <small className="muted">Игровые оценки по шкале 0–100</small>
        </Dialog>
      )}
    </section>
  )
}
export function Finance({ c, world }: SectionProps) {
  return (
    <section className="screen">
      <Header
        section={world.organizations[c.org].name}
        title="Финансы"
        sub="Проводки организации в евро. Стартовый капитал, бюджет и зарплаты заданы игровыми правилами."
      />
      <Stats
        items={[
          ['Остаток', millions(c.account.cash_cents), money(c.account.cash_cents)],
          ['Утверждённый бюджет', millions(c.account.budget_cents), 'На сезон'],
          ['Прогноз остатка', millions(c.account.forecast_cents), 'После ближайшей выплаты'],
          ['Личный капитал', money(c.player_cash_cents), c.name],
        ]}
      />
      <Panel title="Журнал операций">
        <Table
          label="Проводки"
          columns={['Дата', 'Операция', 'Сумма']}
          rows={c.ledger
            .slice()
            .reverse()
            .map((p) => ({
              id: p.key,
              cells: [
                dateLabel(p.date, true),
                p.source === 'opening' ? 'Стартовый капитал' : 'Фонд оплаты коллективов',
                money(p.delta_cents),
              ],
            }))}
        />
      </Panel>
    </section>
  )
}
export function Briefing({
  world,
  c,
  onConfirm,
  busy,
}: {
  world: World
  c: Career
  onConfirm: () => void
  busy: boolean
}) {
  const e = world.events.find((e) => e.id === c.pending[0])
  if (!e) return null
  return (
    <div className="career-briefing">
      <div>
        <small>
          {world.championships[e.series].name} · {dateLabel(e.start)}
        </small>
        <h3>{e.name}</h3>
        <p>{e.sessions.join(' · ')}</p>
      </div>
      <Button primary onClick={onConfirm} disabled={busy}>
        Подтвердить брифинг
      </Button>
    </div>
  )
}
