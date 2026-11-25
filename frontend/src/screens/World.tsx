import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, List, Flag } from 'lucide-react'
import { dateLabel } from '../game'
import { useGame, useUI } from '../ui/context'
import { Header, Choices, Panel, Table, Button, Facts } from '../ui/components'
import { SeriesSwitch } from './Overview'

export function Calendar() {
  const { state, data } = useGame(),
    { go } = useUI()
  const seriesDate = { formula: '2028-05-21', gt: '2028-05-27', endurance: '2028-05-28' }[state.series]
  const [selected, select] = useState(seriesDate),
    [month, setMonth] = useState(state.date.slice(0, 7)),
    [view, setView] = useState('month'),
    [filter, setFilter] = useState<string>(state.series === 'formula' ? 'all' : state.series)
  const date = new Date(month + '-01T00:00:00Z')
  const year = date.getUTCFullYear(),
    idx = date.getUTCMonth(),
    lead = (date.getUTCDay() + 6) % 7,
    count = new Date(Date.UTC(year, idx + 1, 0)).getUTCDate()
  const events = data.schedule.filter(
    (s) => s.day.startsWith(month) && (filter === 'all' || s.series === filter),
  )
  const changeMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, idx + delta, 1)).toISOString().slice(0, 10)
    setMonth(next.slice(0, 7))
    select(next)
  }
  const selectedEvents = events.filter((e) => e.day === selected)
  return (
    <section className="screen">
      <Header
        section="Сезон 2028 / Планирование"
        title="Календарь"
        sub="Гоночные уик-энды, разработки и решения в одном расписании."
      >
        <div className="segmented">
          <button
            aria-pressed={view === 'month'}
            className={view === 'month' ? 'active' : ''}
            onClick={() => setView('month')}
          >
            <CalendarDays aria-hidden="true" size={14} /> Месяц
          </button>
          <button
            aria-pressed={view === 'list'}
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            <List aria-hidden="true" size={14} /> Список
          </button>
        </div>
      </Header>
      <div className="management-calendar-toolbar">
        <div className="management-month">
          <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <h2>{date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
          <button className="icon-btn" aria-label="Следующий месяц" onClick={() => changeMonth(1)}>
            <ChevronRight aria-hidden="true" size={16} />
          </button>
          <Button
            className="btn-sm"
            onClick={() => {
              setMonth(state.date.slice(0, 7))
              select(state.date)
            }}
          >
            Текущий месяц
          </Button>
        </div>
        <select aria-label="Программа" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Все программы</option>
          {Object.entries(data.world).map(([id, w]) => (
            <option key={id} value={id}>
              {w.title}
            </option>
          ))}
        </select>
      </div>
      <div className="management-calendar-layout">
        <div className="panel">
          {view === 'month' ? (
            <>
              <div className="management-weekdays">
                {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="management-calendar-grid">
                {Array.from({ length: lead }, (_, i) => (
                  <div key={'pad' + i} />
                ))}
                {Array.from({ length: count }, (_, i) => {
                  const iso = month + '-' + String(i + 1).padStart(2, '0'),
                    items = events.filter((s) => s.day === iso)
                  return (
                    <button
                      key={iso}
                      aria-pressed={iso === selected}
                      aria-label={dateLabel(iso) + ' ' + items.map((e) => e.title).join(', ')}
                      className={'management-calendar-day ' + (iso === selected ? 'selected' : '')}
                      onClick={() => select(iso)}
                    >
                      <span className={iso === state.date ? 'today' : ''}>{i + 1}</span>
                      {items.map((e) => (
                        <small key={e.title} className={'calendar-event ' + e.type}>
                          {e.title}
                        </small>
                      ))}
                    </button>
                  )
                })}
              </div>
            </>
          ) : events.length ? (
            events.map((e) => (
              <button className="result" onClick={() => select(e.day)} key={e.title}>
                <span>
                  {dateLabel(e.day)} · {e.title}
                </span>
                <ChevronRight aria-hidden="true" size={14} />
              </button>
            ))
          ) : (
            <div className="empty-state">В этом месяце событий нет</div>
          )}
        </div>
        <Panel title={dateLabel(selected)}>
          <div className="panel-body">
            {selectedEvents.length ? (
              selectedEvents.map((e) => (
                <article className="event-detail" key={e.title}>
                  <div className="eyebrow">{data.world[e.series].title}</div>
                  <h3>{e.title}</h3>
                  <p>{e.detail}</p>
                  <Button
                    primary
                    onClick={() =>
                      go(
                        e.type === 'development'
                          ? 'development'
                          : e.type === 'contract'
                            ? 'people'
                            : e.series === 'formula'
                              ? 'race'
                              : 'world',
                      )
                    }
                  >
                    {e.type === 'development'
                      ? 'К проектам'
                      : e.type === 'contract'
                        ? 'К составу'
                        : e.series === 'formula'
                          ? 'В гоночный центр'
                          : 'К чемпионату'}
                  </Button>
                </article>
              ))
            ) : (
              <p className="muted">Событий на этот день нет.</p>
            )}
          </div>
        </Panel>
      </div>
    </section>
  )
}
export function World() {
  const { state, data } = useGame(),
    { open } = useUI(),
    [tab, setTab] = useState('teams')
  const w = data.world[state.series]
  return (
    <section className="screen">
      <Header
        section="Единый мир / Сезон 2028"
        title="Мир автоспорта"
        sub="Чемпионаты, программы и результаты сезона."
      >
        <span className="chip">3 дисциплины</span>
      </Header>
      <SeriesSwitch />
      <div className="series-banner">
        <div>
          <div className="eyebrow">{w.short} / СЕЗОН 2028</div>
          <h2>{w.title}</h2>
          <p>
            {w.round} завершено · {w.teams.length} команд в обзоре
          </p>
        </div>
        <div>
          <div className="eyebrow">Следующий этап</div>
          <h3>{w.next}</h3>
          <small>
            {w.date} · {w.country}
          </small>
        </div>
      </div>
      <div className="section-grid">
        <Panel
          title="Положение в чемпионате"
          action={
            <Choices
              segmented
              label="Зачёт"
              items={[
                ['teams', 'Команды'],
                ['drivers', state.series === 'endurance' ? 'Экипажи' : 'Пилоты'],
              ]}
              active={tab}
              onChange={setTab}
            />
          }
        >
          {tab === 'teams' ? (
            <Table
              label="Командный зачёт"
              columns={['Поз.', 'Команда', 'Победы', 'Очки', 'Отставание']}
              rows={w.teams.map(([name, points, wins, color], i) => ({
                id: name,
                active: name.startsWith('VANTA'),
                cells: [
                  i + 1,
                  <b style={{ borderLeft: '3px solid ' + color, paddingLeft: 10 }}>{name}</b>,
                  wins,
                  points,
                  i ? w.teams[0][1] - points : '—',
                ],
              }))}
            />
          ) : (
            <Table
              label="Личный зачёт"
              columns={['Поз.', 'Участник', 'Команда', 'Очки']}
              rows={w.drivers.map(([name, team, points], i) => ({
                id: name,
                active: team.startsWith('VANTA'),
                cells: [i + 1, name, team, points],
              }))}
            />
          )}
        </Panel>
        <Panel title="Ближайшие этапы" action={<Flag aria-hidden="true" size={16} />}>
          {w.events.map(([round, date, title, track, format, length, distance]) => (
            <button
              className="result"
              key={round}
              onClick={() =>
                open(
                  title,
                  <Facts
                    items={[
                      ['Этап', round],
                      ['Дата', date],
                      ['Трасса', track],
                      ['Профиль', format],
                      ['Длина', length],
                      ['Дистанция', distance],
                    ]}
                  />,
                )
              }
            >
              <span>
                <small>
                  {date} · этап {round}
                </small>
                <strong>{title}</strong>
              </span>
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          ))}
        </Panel>
      </div>
    </section>
  )
}
