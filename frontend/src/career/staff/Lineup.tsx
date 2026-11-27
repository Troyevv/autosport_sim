import { useState } from 'react'
import { Button, Panel } from '../../ui/components'
import { money, type Career, type World } from '../api'
import { PersonPortrait } from '../../pitwall/visuals'
import { navigate } from '../../pitwall/core/route'
import type { SectionProps } from '../Sections'
import { shortDate, usePersonnel, type Order } from './model'
import './lineup.css'

export const sportingStatus: Record<string, string> = {
  equal: 'Равноправный пилот',
  first: 'Первый пилот',
  second: 'Второй пилот',
}
export const duties: Record<string, string> = {
  race: 'Основной пилот',
  reserve: 'Резервный пилот',
  test: 'Тестовый пилот',
  academy: 'Воспитанник академии',
  relief: 'Временная замена',
}
const reasons: Record<string, string> = {
  injury: 'Травма',
  illness: 'Заболевание',
  suspension: 'Дисквалификация',
  other: 'Временная недоступность',
}
type Decision = {
  id: string
  person: string
  kind: string
  date: string
  message: string
  evidence?: string
  remedy?: string
  due?: string
  status?: string
  compensation_cents?: number
}
type Driver = {
  person: string
  seat: string
  entry: string | null
  series: string
  duties: string[]
  promised: string | null
  observed: string | null
  actual: Decision | null
  start: string
  end: string | null
  grievances: number
  simulator: { start: string; end: string } | null
  work: { date: string; kind: string; reference: string }[]
  salary_cents: number
  absence: { reason: string; expected_return: string } | null
}
type Registration = {
  reference: string
  name: string
  round: string
  seat: string
  principal: string
  deadline: string
  candidates: { person: string; name: string; reason: string | null; fee: number }[]
  cover: { person: string; start: string; end: string } | null
}
type Desk = { drivers: Driver[]; windows: Registration[]; history: Decision[] }

function Replacement({
  w,
  c,
  world,
  order,
  busy,
}: {
  w: Registration
  c: Career
  world: World
  order: Order
  busy: boolean
}) {
  const [selected, pick] = useState('')
  const candidate = w.candidates.find((p) => p.person === selected)
  return (
    <article className="lineup-row">
      <h4>{w.name}</h4>
      <p>
        {world.names[w.principal]} · регистрация до {shortDate(w.deadline)}
      </p>
      {w.cover ? (
        <strong>
          {world.names[w.cover.person]} · {shortDate(w.cover.start)} — {shortDate(w.cover.end)}{' '}
          (исключая)
        </strong>
      ) : (
        <form
          className="staff-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (candidate)
              void order('driver-nominate', { seat: w.seat, round: w.round, person: candidate.person })
          }}
        >
          <label>
            Кандидат на замену
            <select value={selected} onChange={(e) => pick(e.target.value)}>
              <option value="">Выберите пилота</option>
              {w.candidates.map((p) => (
                <option key={p.person} value={p.person}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {candidate && (
            <p role="status">
              {candidate.reason || 'Допуск подтверждён'} · выплата {money(candidate.fee)}
            </p>
          )}
          {!w.candidates.length && <p>Допущенных кандидатов пока нет.</p>}
          {c.role === 'manager' && (
            <Button primary type="submit" disabled={busy || !candidate || !!candidate.reason}>
              Подтвердить замену
            </Button>
          )}
        </form>
      )}
    </article>
  )
}

function Review({
  driver,
  c,
  world,
  busy,
  order,
}: {
  driver: Driver
  c: Career
  world: World
  busy: boolean
  order: Order
}) {
  const [status, setStatus] = useState(driver.promised || 'equal'),
    [amount, setAmount] = useState('0')
  const series = world.championships[driver.series].name
  return (
    <details className="staff-handling">
      <summary>Пересмотреть иерархию</summary>
      <form
        className="staff-form"
        onSubmit={(e) => {
          e.preventDefault()
          void order('driver-review', {
            seat: driver.seat,
            status,
            compensation_cents: Math.round(Number(amount) * 100),
          })
        }}
      >
        <p>
          Условия для {series} вступят в силу после согласия каждого затронутого пилота. Лимит выплаты
          задаётся на человека.
        </p>
        <label>
          Предлагаемый статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(sportingStatus).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Предел компенсации, €
          <input
            required
            type="number"
            min="0"
            max={100000000}
            step=".01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <Button
          primary
          type="submit"
          disabled={busy || c.role !== 'manager' || status === driver.promised}
        >
          Обсудить условия
        </Button>
      </form>
    </details>
  )
}

export function Lineup({
  c,
  world,
  order,
  busy,
  openMarket,
}: Pick<SectionProps, 'c' | 'world' | 'media'> & {
  order: Order
  busy: boolean
  openMarket: () => void
}) {
  const result = usePersonnel<Desk>('careers/' + c.id + '/lineup', c.revision)
  if (result.error)
    return (
      <p role="alert">
        {result.error} <Button onClick={result.retry}>Повторить</Button>
      </p>
    )
  if (!result.data) return <p role="status">Загрузка состава…</p>
  const { drivers, windows, history } = result.data
  return (
    <div className="lineup-desk people-module">
      <Panel title="Гоночный состав">
        <div className="lineup-grid p-race-grid">
          {drivers
            .filter((d) => d.entry)
            .map((d) => {
              const entry = world.entries[d.entry!],
                person = c.assignments.find((a) => a.id === d.seat)?.occupant
              return (
                <article key={d.seat} className="p-race-seat lineup-driver">
                  <header>
                    <span className="p-kicker">{world.championships[d.series].name}</span>
                    <strong>№ {entry.number}</strong>
                  </header>
                  <div className="p-person-card featured">
                    <button
                      type="button"
                      className="p-person-main"
                      onClick={() => navigate('person', 'profile', d.person)}
                    >
                      <div className="p-photo">
                        <span className="p-photo-pattern" />
                        <span className="p-entry-number">{entry.number}</span>
                        {person && <PersonPortrait person={person} id={d.person} size={undefined} role="driver" />}
                      </div>
                      <div className="p-card-identity lineup-heading">
                        <div>
                          <span className="p-kicker">{d.duties.map((r) => duties[r]).join(' · ')}</span>
                          <h3>{world.names[d.person]}</h3>
                          <b>{sportingStatus[d.promised!]}</b>
                        </div>
                      </div>
                    </button>
                  </div>
                  <dl>
                    <dt>Доступность</dt>
                    <dd>
                      {d.absence
                        ? reasons[d.absence.reason] +
                          ' · прогноз ' +
                          shortDate(d.absence.expected_return)
                        : 'Допущен'}
                    </dd>
                    <dt>Роли</dt>
                    <dd>{d.duties.map((r) => duties[r]).join(' · ')}</dd>
                    <dt>Фактические условия</dt>
                    <dd>
                      {d.observed && <strong>{d.observed} · </strong>}
                      {d.actual?.message || 'Нет подтверждённых различий'}
                    </dd>
                    {d.actual?.remedy && (
                      <>
                        <dt>Устранение</dt>
                        <dd>
                          {d.actual.remedy} · {shortDate(d.actual.due!)}
                        </dd>
                      </>
                    )}
                    <dt>Претензии</dt>
                    <dd>{d.grievances}</dd>
                  </dl>
                  {c.role === 'manager' && <Review driver={d} {...{ c, world, busy, order }} />}
                </article>
              )
            })}
          {!drivers.some((d) => d.entry) && <p>Основные места вакантны.</p>}
        </div>
      </Panel>
      <div className="lineup-secondary">
        <Panel title="Резерв и испытания">
          <div className="lineup-body">
            {drivers
              .filter((d) => !d.entry)
              .map((d) => (
                <article key={d.seat}>
                  <h4>{world.names[d.person]}</h4>
                  <p>
                    {d.duties.map((r) => duties[r]).join(' · ')} · {money(d.salary_cents)} / мес.
                  </p>
                  <p>
                    {d.absence ? reasons[d.absence.reason] : 'Доступен'} · с {shortDate(d.start)}
                  </p>
                  {d.work.map((w) => (
                    <p key={w.reference}>
                      {shortDate(w.date)} ·{' '}
                      {
                        {
                          simulator: 'Симулятор',
                          practice: 'Официальная практика',
                          'track-test': 'Трассовые испытания',
                        }[w.kind]
                      }
                    </p>
                  ))}
                  {d.simulator ? (
                    <p role="status">Симулятор запланирован до {shortDate(d.simulator.end)}</p>
                  ) : (
                    c.role === 'manager' && (
                      <Button
                        disabled={busy || !!d.absence}
                        onClick={() =>
                          order('prepare-program', { kind: 'simulator', participant: d.person })
                        }
                      >
                        Назначить симулятор
                      </Button>
                    )
                  )}
                </article>
              ))}
            {!drivers.some((d) => !d.entry) && (
              <p>В резерве и испытательной программе пока нет подписанных пилотов.</p>
            )}
            {c.role === 'manager' && <Button onClick={openMarket}>Подобрать пилота</Button>}
          </div>
        </Panel>
        <Panel title="Замены на этап">
          <div className="lineup-body">
            {windows.length ? (
              windows.map((w) => <Replacement key={w.reference} {...{ w, world, c, busy, order }} />)
            ) : (
              <p>
                Заявок на замену нет. Кандидаты появятся после подтверждения недоступности и открытия
                регистрации на этап.
              </p>
            )}
          </div>
        </Panel>
      </div>
      <Panel title="История договорённостей">
        <div className="lineup-body" aria-live="polite">
          {history.length ? (
            history.map((h) => (
              <article className="lineup-event" key={h.id}>
                <small>{shortDate(h.date)}</small>
                <div>
                  <b>{world.names[h.person]}</b>
                  <p>
                    {h.message} {h.status && sportingStatus[h.status]}{' '}
                    {h.compensation_cents ? ' · ' + money(h.compensation_cents) : ''}
                  </p>
                  {h.evidence && <p>{h.evidence}</p>}
                  {h.remedy && (
                    <p>
                      {h.remedy} · {shortDate(h.due!)}
                    </p>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p>Решения о пересмотре условий и подтверждённые факты появятся здесь.</p>
          )}
        </div>
      </Panel>
    </div>
  )
}
