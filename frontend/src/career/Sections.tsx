import { useState } from 'react'
import { CalendarDays, ChevronRight, Flag, MapPin } from 'lucide-react'
import { dateLabel, millions } from '../game'
import { Button, Dialog, Facts, Header, Panel, Stats, Table } from '../ui/components'
import { SeasonCalendar } from '../ui/SeasonCalendar'
import { assetUrl, type World, type Career, type Asset } from './api'
export { Finance } from './finance/Finance'
export { People } from './staff/People'

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
  const gridPhoto =
    series.playable !== false && entries[0] && '/assets/garage/2025-v1/grid/' + entries[0].id + '.webp'
  return (
    <section className="screen">
      <Header
        section={org.name + ' / Центр управления'}
        title={labels[c.role]}
        sub={[series.name, org.name, ...org.lines.map((line) => world.products[line].name)].join(' · ')}
      />
      <section className="dashboard-hero program-hero career-hero">
        {photo || gridPhoto ? (
          <img
            alt=""
            className={photo ? undefined : 'junior-grid-photo'}
            src={photo || gridPhoto || undefined}
          />
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
          ['Доступный остаток', millions(c.available_cents), 'Средства организации'],
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
                    ? e.entrant ?? world.organizations[e.org].name
                    : c.crews[e.id].map((id) => world.names[id]).join(' · ') || 'Вакантно'}
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
        type: e.kind === 'round' || e.kind === 'invitational' ? 'race' : 'development',
        detail: [e.circuit, dateLabel(e.start) + ' — ' + dateLabel(e.end), ...e.sessions].join(' · '),
      }))}
    />
  )
}
export function Championships({ world, c, media }: SectionProps) {
  const [series, choose] = useState(c.series),
    r = world.championships[series],
    es = Object.values(world.entries).filter((e) => e.championship === series)
  const [organization, setOrganization] = useState('')
  const profile = world.organizations[organization]
  const baseLocation = profile && [profile.base, world.countries[profile.base_country ?? '']].filter(Boolean).join(', ')
  const profileEntries = Object.values(world.entries).filter(
    (e) => e.org === organization || Object.values(world.cars[e.car].suppliers).includes(organization),
  )
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
          <p>
            {r.playable === false ? 'Фоновая серия · ' : ''}
            {r.finish}
          </p>
        </div>
        {logo && <img className="career-logo" alt={r.name} src={logo} />}
      </div>
      <Panel title="Регламент">
        <Facts
          items={[
            ['Классы', r.classes.join(' · ')],
            ...(r.technical_summary ? [['Техника', r.technical_summary] as const] : []),
            ...(r.superlicence && r.admission
              ? [
                  [
                    'Допуск',
                    [
                      r.admission.max_age
                        ? r.admission.min_age + '–' + r.admission.max_age + ' лет'
                        : 'от ' + r.admission.min_age + ' лет',
                      r.admission.age_basis === 'calendar_year' ? 'по году рождения' : 'на дату участия',
                      (r.admission.licences || [r.admission.licence]).join(' / '),
                    ].join(' · '),
                  ] as const,
                  ['Баллы суперлицензии по итогам сезона', r.superlicence.join(' · ')] as const,
                ]
              : []),
            ...Object.entries(r.tyre_market).map(([category, policy]): [string, string] => {
              const modes = {
                sole: 'Единый поставщик',
                approved: 'Допущенные поставщики',
                open: 'Открытая конкуренция',
              }
              const suppliers = (policy.approved_suppliers ?? []).map((id) => world.organizations[id].name)
              return ['Шины · ' + category, [modes[policy.mode], ...suppliers].join(' · ')]
            }),
            ['Экипаж', r.crew[0] === r.crew[1] ? r.crew[0] : r.crew.join('–')],
            ['Сессии', Object.values(r.sessions)[0].join(' · ')],
            [
              r.discipline === 'Karting' ? 'Очки за финал' : 'Очки за гонку',
              (r.points.race || r.points['6h']).toString().replaceAll(',', ' · '),
            ],
            ...Object.entries({
              reverse: 'Очки за реверсивную гонку',
              short: 'Очки за короткую гонку',
              pole: 'Поул',
              fastest_eligible: 'Лучший круг при выполнении условий',
              reverse_position_gained: 'За отыгранное место в реверсивной гонке',
              qualifying_heats: 'Итог отборочных заездов',
              super_heats: 'Итог суперхитов',
              best_rounds_per_phase: 'Лучших этапов в зачёт каждой фазы',
              fastest_final: 'Лучший круг финала',
            })
              .filter(([key]) => r.superlicence && key in r.points)
              .map(([key, label]): [string, string] => [label, [r.points[key]].flat().join(' · ')]),
          ]}
        />
      </Panel>
      {r.previous_season && (
        <Panel title="Архив сезона 2024">
          <div className="panel-body">
            <p>{r.previous_season.fact}</p>
            <a href={r.previous_season.source} target="_blank" rel="noreferrer">Публикация организатора</a>
          </div>
        </Panel>
      )}
      <Panel title={'Заявки · ' + es.length}>
        <Table
          label="Заявки чемпионата"
          columns={['№', 'Организация', 'Машина', 'Пилоты', 'Поставщики']}
          rows={es.map((e) => ({
            id: e.id,
            active: e.org === c.org,
            cells: [
              e.number,
              <button className="subtle-link org-link" onClick={() => setOrganization(e.org)}>
                {e.entrant ?? world.organizations[e.org].name}
              </button>,
              world.cars[e.car].name,
              c.crews[e.id].map((id) => world.names[id]).join(' · ') || 'Вакантно',
              <div className="supplier-links">
                {Object.entries(world.cars[e.car].suppliers).map(([slot, id]) => (
                  <button key={slot} title={world.products[slot]?.name} className="subtle-link org-link" onClick={() => setOrganization(id)}>
                    {world.organizations[id].name}
                  </button>
                ))}
              </div>,
            ],
          }))}
        />
      </Panel>
      {profile && (
        <Dialog title={profile.name} onClose={() => setOrganization('')}>
          <Facts
            items={[
              ['Организация', profile.kind === 'team' ? 'Гоночная команда' : 'Производитель'],
              ...(profile.registration ? [
                ['Регистрация', <a href={profile.registration.source} target="_blank" rel="noreferrer">{profile.registration.legal_name} · {world.countries[profile.registration.country]}</a>] as const,
                ...(profile.registration.headquarters ? [['Адрес регистрации', profile.registration.headquarters] as const] : []),
              ] : profile.domicile ? [['Юрисдикция оператора · оценка', world.countries[profile.domicile]] as const] : []),
              ...(profile.country ? [['Страна программы', world.countries[profile.country] ?? profile.country] as const] : []),
              ...(profile.base_country ? [['Техническая база', profile.base_source ? <a href={profile.base_source} target="_blank" rel="noreferrer">{baseLocation}</a> : baseLocation] as const] : []),
              ...(profile.affiliations ?? []).map((a) => ['Связь организаций', <a href={a.source} target="_blank" rel="noreferrer">{a.label}</a>] as const),
              ['Чемпионаты', profile.programs.map((id) => world.championships[id].name).join(' · ')],
              ...(profile.lines.length
                ? [['Продукция', profile.lines.map((line) => world.products[line].name).join(' · ')] as const]
                : []),
            ]}
          />
          <h3>Заявки сезона · {profileEntries.length}</h3>
          <div className="org-programs">
            {profile.programs.map((id) => (
              <section key={id}>
                <h4>{world.championships[id].name}</h4>
                <ul>
                  {profileEntries
                    .filter((e) => e.championship === id)
                    .map((e) => (
                      <li key={e.id}>
                        <b>№ {e.number}</b>
                        <div>
                          <strong>
                            {c.crews[e.id].map((person) => world.names[person]).join(' · ') || 'Вакантно'}
                          </strong>
                          <small>
                            {[
                              profile.kind === 'supplier' && world.organizations[e.org].name,
                              world.cars[e.car].name,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog>
      )}
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
