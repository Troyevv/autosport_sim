import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, List } from 'lucide-react'
import { dateLabel } from '../game'
import { Header, Button, Panel } from './components'
type CalendarItem = {
  id: string
  day: string
  title: string
  type: string
  series: string
  detail: string
  action?: ReactNode
}
export function SeasonCalendar({
  today,
  selectedDate,
  initialFilter,
  seriesNames,
  schedule,
  subtitle,
}: {
  today: string
  selectedDate: string
  initialFilter: string
  seriesNames: Record<string, string>
  schedule: CalendarItem[]
  subtitle: string
}) {
  const [selected, select] = useState(selectedDate),
    [month, setMonth] = useState(today.slice(0, 7)),
    [view, setView] = useState('month'),
    [filter, setFilter] = useState(initialFilter)
  const date = new Date(month + '-01T00:00:00Z')
  const year = date.getUTCFullYear(),
    idx = date.getUTCMonth(),
    lead = (date.getUTCDay() + 6) % 7,
    count = new Date(Date.UTC(year, idx + 1, 0)).getUTCDate()
  const events = schedule.filter(
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
      <Header section={'Сезон ' + today.slice(0, 4) + ' / Планирование'} title="Календарь" sub={subtitle}>
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
              setMonth(today.slice(0, 7))
              select(today)
            }}
          >
            Текущий месяц
          </Button>
        </div>
        <select aria-label="Программа" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Все программы</option>
          {Object.entries(seriesNames).map(([id, w]) => (
            <option key={id} value={id}>
              {w}
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
                      <span className={iso === today ? 'today' : ''}>{i + 1}</span>
                      {items.map((e) => (
                        <small key={e.id} className={'calendar-event ' + e.type}>
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
              <button className="result" onClick={() => select(e.day)} key={e.id}>
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
                <article className="event-detail" key={e.id}>
                  <div className="eyebrow">{seriesNames[e.series]}</div>
                  <h3>{e.title}</h3>
                  <p>{e.detail}</p>
                  {e.action}
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
