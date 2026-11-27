import { shortDate as short } from './v2/advisory-model'
import React, { useState, useSyncExternalStore } from 'react'
import { useGame, useStored, dateLabel } from './core'
import {
  Badge,
  Button,
  Icon,
  Input,
  Panel,
  PageHeading,
  Stat,
  DataTable,
  Select,
  Tabs,
  EmptyState,
} from './ui'
import { RaceCar, PersonPortrait } from './visuals'
import './world.css'
const calendarNarrow = window.matchMedia('(max-width:699px)')
function watchCalendarWidth(update) {
  calendarNarrow.addEventListener('change', update)
  return () => calendarNarrow.removeEventListener('change', update)
}
export function Calendar() {
  const narrow = useSyncExternalStore(watchCalendarWidth, () => calendarNarrow.matches)
  const g = useGame(),
    c = g.game.career,
    linkedEvent = g.world.events.find((e) => e.id === g.entity),
    [mode, setMode] = useStored('calendar.mode', g.tab === 'list' || narrow ? 'list' : 'month'),
    [series, setSeries] = useStored('calendar.series', linkedEvent?.series || c.series),
    [kind, setKind] = useStored('calendar.kind', 'all'),
    [month, setMonth] = useStored('calendar.month', (linkedEvent?.start || c.date).slice(0, 7))
  const all = g.world.events
    .slice()
    .filter((e) => (series === 'all' || e.series === series) && (kind === 'all' || e.kind === kind))
    .sort((a, b) => a.start.localeCompare(b.start))
  const selected = all.filter(
    (e) => e.start.slice(0, 7) <= month && (e.end || e.start).slice(0, 7) >= month,
  )
  function detail(e) {
    g.openDialog({
      title: e.name,
      content: (
        <div className="stack">
          <Badge tone="accent">{g.world.championships[e.series]?.name || 'Организация'}</Badge>
          <p>
            {dateLabel(e.start)}
            {e.end !== e.start ? ' — ' + dateLabel(e.end) : ''}
          </p>
          <h3>{e.circuit}</h3>
          <p>{e.note || e.sessions?.join(' · ') || 'Событие программы'}</p>
          <Button onClick={() => g.navigate('world', 'calendar', e.series)}>
            Чемпионат и участники
          </Button>
        </div>
      ),
    })
  }
  useEntityEffect(() => {
    if (linkedEvent) {
      setSeries(linkedEvent.series)
      setKind('all')
      setMonth(linkedEvent.start.slice(0, 7))
      detail(linkedEvent)
    }
  }, g.entity)
  function dayDetail(dt, events) {
    if (events.length === 1) return detail(events[0])
    g.openDialog({
      title: dateLabel(dt),
      content: (
        <div className="stack calendar-day-agenda">
          <p>{events.length} событий в выбранных чемпионатах.</p>
          {events.map((e) => (
            <Button key={e.id} variant="secondary" onClick={() => detail(e)}>
              <span>
                {e.name}
                <small>{g.world.championships[e.series]?.name || 'Организация'}</small>
              </span>
              <Icon name="ArrowRight" size={16} />
            </Button>
          ))}
        </div>
      ),
    })
  }
  function move(n) {
    const d = new Date(month + '-15')
    d.setMonth(d.getMonth() + n)
    setMonth(d.toISOString().slice(0, 7))
  }
  const first = new Date(month + '-01T12:00:00'),
    offset = (first.getDay() + 6) % 7,
    days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return (
    <div className="calendar-screen">
      <PageHeading
        eyebrow="Программа сезона / Ваше время"
        title="Календарь"
        description="Гонки, испытания, презентации и задачи организации — в одном расписании."
        actions={
          <Button disabled title="В текущем сезоне календарь формирует организатор">
            <Icon name="Plus" />
            Добавить событие · недоступно
          </Button>
        }
      />
      <div className="toolbar">
        <Select
          label="Чемпионат"
          value={series}
          onChange={(e) => setSeries(e.target.value)}
          options={[
            { value: 'all', label: 'Весь мир' },
            ...Object.values(g.world.championships).map((s) => ({
              value: s.id,
              label: s.name,
            })),
          ]}
        />
        <Select
          label="События"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={[
            { value: 'all', label: 'Все события' },
            { value: 'round', label: 'Гонки' },
            { value: 'testing', label: 'Испытания' },
            { value: 'invitational', label: 'Пригласительные этапы' },
            { value: 'presentation', label: 'Презентации' },
          ]}
        />
      </div>
      <Tabs
        value={mode}
        onChange={setMode}
        items={[
          { id: 'month', label: 'Месяц' },
          { id: 'list', label: 'Хронология' },
        ]}
      />
      <Panel
        title={
          <span className="calendar-month">
            <button aria-label="Предыдущий месяц" onClick={() => move(-1)}>
              ←
            </button>
            {first.toLocaleDateString('ru-RU', { month: 'long' }) + ' ' + first.getFullYear()}
            <button aria-label="Следующий месяц" onClick={() => move(1)}>
              →
            </button>
          </span>
        }
        actions={
          <Button variant="ghost" onClick={() => setMonth(c.date.slice(0, 7))}>
            Сегодня
          </Button>
        }
      >
        {mode === 'month' ? (
          <div className="calendar-grid">
            {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((x) => (
              <small key={x}>{x}</small>
            ))}
            {Array.from({ length: offset + days }, (_, i) => {
              const d = i - offset + 1,
                dt = month + '-' + String(d).padStart(2, '0'),
                events = selected.filter((e) => e.start <= dt && (e.end || e.start) >= dt)
              return (
                <div
                  key={i}
                  className={(dt === c.date ? 'today ' : '') + (events.length ? 'has-events' : '')}
                >
                  {d > 0 && (
                    <>
                      <strong className="calendar-date-label">{d}</strong>
                      <button
                        className="calendar-day-detail"
                        disabled={!events.length}
                        aria-label={dateLabel(dt) + ': ' + events.length + ' событий'}
                        onClick={() => dayDetail(dt, events)}
                      >
                        <strong>{d}</strong>
                        {events.length > 0 && <span>{events.length}</span>}
                      </button>
                      {events.map((e) => (
                        <button className="calendar-event-button" key={e.id} onClick={() => detail(e)}>
                          {e.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="calendar-list">
            {selected.map((e) => (
              <button key={e.id} onClick={() => detail(e)}>
                <time>
                  <strong>{e.start.slice(8)}</strong>
                  {new Date(e.start).toLocaleDateString('ru-RU', {
                    month: 'short',
                  })}
                </time>
                <span>
                  <small>
                    {g.world.championships[e.series]?.name} ·{' '}
                    {e.kind === 'presentation'
                      ? 'Презентация'
                      : e.kind === 'testing'
                        ? 'Тесты'
                        : e.kind === 'meeting'
                          ? 'Задача команды'
                          : 'Этап'}
                  </small>
                  <strong>{e.name}</strong>
                  <small>{e.circuit}</small>
                </span>
                <Icon name="ArrowUpRight" />
              </button>
            ))}
            {!selected.length && (
              <EmptyState
                title="В этом месяце событий нет"
                description="Перейдите к следующему месяцу или выберите весь игровой мир."
              />
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
function useEntityEffect(fn, key) {
  React.useEffect(fn, [key])
}
export function Championships() {
  const g = useGame(),
    [series, setSeries] = useStored(
      'world.series',
      g.world.championships[g.entity] ? g.entity : g.game.career.series,
    ),
    [q, setQ] = useStored('world.query', g.world.organizations[g.entity]?.name || ''),
    [category, setCategory] = useStored('world.category', 'all')
  useEntityEffect(() => {
    if (g.world.championships[g.entity]) {
      setSeries(g.entity)
      setCategory('all')
      setQ('')
    } else if (g.world.organizations[g.entity]) {
      setQ(g.world.organizations[g.entity].name)
      setCategory('all')
    }
  }, g.entity)
  const s = g.world.championships[series],
    tab = g.tab || 'entries',
    entries = Object.values(g.world.entries).filter((e) => e.championship === series)
  return (
    <>
      <PageHeading
        eyebrow="Один мир / 11 чемпионатов"
        title="Мир соревнований"
        description="Программы, участники и регламент каждого чемпионата."
      />
      <div className="series-switch" aria-label="Выбор чемпионата">
        {Object.values(g.world.championships).map((x) => (
          <button
            key={x.id}
            className={x.id === series ? 'active' : ''}
            onClick={() => {
              setSeries(x.id)
              setCategory('all')
              setQ('')
            }}
          >
            <small>{x.discipline}</small>
            <strong>{x.id.toUpperCase()}</strong>
          </button>
        ))}
      </div>
      <div className={'championship-hero ' + (tab !== 'entries' ? 'compact-hero' : '')}>
        <div>
          <span className="eyebrow">{s.discipline} / 2025</span>
          <h2>{s.name}</h2>
          <p>{s.finish}</p>
        </div>
        {tab === 'entries' && g.game.garageCatalog?.entries?.[entries[0]?.id] && (
          <RaceCar entryId={entries[0].id} />
        )}
        <div className="championship-facts">
          <Stat label="заявок" value={entries.length} />
          <Stat label="организаций" value={new Set(entries.map((e) => e.org)).size} />
          <Stat
            label="этапов"
            value={g.world.events.filter((e) => e.series === series && e.kind === 'round').length}
          />
          <Stat
            label="пилотов в экипаже"
            value={s.crew[0] === s.crew[1] ? s.crew[0] : s.crew.join('–')}
          />
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={g.setTab}
        items={[
          { id: 'entries', label: 'Стартовая сетка', count: entries.length },
          { id: 'calendar', label: 'Календарь сезона' },
          { id: 'rules', label: 'Регламент' },
          { id: 'history', label: 'История' },
        ]}
      />
      {tab === 'entries' && (
        <>
          <div className="toolbar">
            <Input
              label="Найти команду или номер"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Команда, заявка…"
            />
            <Select
              label="Класс"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: 'all', label: 'Все классы' },
                ...s.classes.map((x) => ({ value: x, label: x })),
              ]}
            />
          </div>
          <div className="world-entry-list">
            {entries
              .filter(
                (e) =>
                  (category === 'all' || e.category === category) &&
                  ((e.entrant || g.world.organizations[e.org]?.name) + ' ' + e.number)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
              )
              .map((e) => (
                <article key={e.id}>
                  <strong className="entry-number">{e.number}</strong>
                  <div>
                    <button className="link-button" onClick={() => g.openOrganization(e.org)}>
                      {e.entrant || g.world.organizations[e.org]?.name}
                    </button>
                    <p>
                      {g.world.cars[e.car]?.name || 'Модель не раскрыта'} · {e.category}
                    </p>
                    <div className="crew-chips">
                      {(g.game.career.crews[e.id] || e.crew || []).map((id) => (
                        <button key={id} onClick={() => g.openPerson(id)}>
                          {g.game.personnel.find((p) => p.id === id)?.name ||
                            g.world.names[id] ||
                            'Досье участника'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {g.game.garageCatalog?.entries?.[e.id] && (
                    <button
                      className="world-car"
                      aria-label={'Автомобиль №' + e.number}
                      onClick={() => g.navigate('garage', 'overview', e.id)}
                    >
                      <RaceCar entryId={e.id} studio={false} />
                    </button>
                  )}
                </article>
              ))}
          </div>
        </>
      )}
      {tab === 'calendar' && (
        <Panel title="Сезон 2025">
          <DataTable
            rows={g.world.events.filter((e) => e.series === series)}
            columns={[
              { key: 'start', label: 'Дата', render: (e) => short(e.start) },
              {
                key: 'name',
                label: 'Событие',
                render: (e) => (
                  <button className="link-button" onClick={() => g.navigate('calendar', 'list', e.id)}>
                    {e.name}
                  </button>
                ),
              },
              { key: 'circuit', label: 'Трасса' },
              {
                key: 'sessions',
                label: 'Сессии',
                render: (e) => e.sessions.join(' · '),
              },
            ]}
          />
        </Panel>
      )}
      {tab === 'rules' && (
        <div className="two-col">
          <Panel title="Спортивные правила">
            <p>
              {s.technical_summary ||
                'Правила чемпионата определяют допуск участников, состав экипажа и технические решения.'}
            </p>
            <dl className="detail-list">
              <div>
                <dt>Экипаж</dt>
                <dd>
                  {s.crew[0] === s.crew[1] ? s.crew[0] : s.crew.join('–')}{' '}
                  {s.crew[0] === 1 && s.crew[1] === 1 ? 'пилот' : 'пилотов'}
                </dd>
              </div>
              <div>
                <dt>Лицензия</dt>
                <dd>
                  {{
                    super: 'Суперлицензия',
                    a: 'Международная A',
                    b: 'Международная B',
                    c: 'Международная C',
                    kart: 'Картинговая',
                  }[s.admission?.licence] ||
                    s.admission?.licence ||
                    'По регламенту серии'}
                </dd>
              </div>
              <div>
                <dt>Минимальный возраст</dt>
                <dd>{s.admission?.min_age || 'По категории'}</dd>
              </div>
              <div>
                <dt>Классы</dt>
                <dd>{s.classes.join(', ')}</dd>
              </div>
              <div>
                <dt>Минимум лицензионных очков</dt>
                <dd>{s.admission?.min_points ?? 'Не требуется'}</dd>
              </div>
              <div>
                <dt>Автомобилей у команды</dt>
                <dd>{s.cars_per_team}</dd>
              </div>
              <div>
                <dt>Организатор</dt>
                <dd>{s.governing_body}</dd>
              </div>
            </dl>
            {s.technical_summary && <p>{s.technical_summary}</p>}
            {s.superlicence?.length > 0 && <p>Баллы суперлицензии · {s.superlicence.join(' / ')}</p>}
            <details>
              <summary>Программы гоночного уик-энда</summary>
              {Object.entries(s.sessions || {}).map(([k, v]) => (
                <p key={k}>
                  <strong>
                    {k === 'standard'
                      ? 'Основная программа'
                      : k === 'sprint'
                        ? 'Спринтерский формат'
                        : k}
                  </strong>
                  <br />
                  {v.join(' · ')}
                </p>
              ))}
            </details>
          </Panel>
          <Panel title="Очки и допуск шин">
            {Object.entries(s.points).map(([k, v]) => (
              <p key={k}>
                <strong>{k === 'race' ? 'Гонка' : k === 'sprint' ? 'Спринт' : k}</strong> ·{' '}
                {Array.isArray(v) ? v.join(' / ') : v}
              </p>
            ))}
            <div className="divider" />
            {Object.entries(s.tyre_market || {}).map(([k, v]) => (
              <p key={k}>
                {k}:{' '}
                {v.mode === 'sole'
                  ? 'Единый поставщик'
                  : v.mode === 'approved'
                    ? 'Допущенные поставщики'
                    : 'Открытый рынок'}{' '}
                ·{' '}
                {(v.approved_suppliers || [])
                  .map((id) => g.world.organizations[id]?.name || id)
                  .join(', ')}
              </p>
            ))}
          </Panel>
        </div>
      )}
      {tab === 'history' && (
        <Panel title="Прошлый сезон">
          <p>
            {s.previous_season?.fact ||
              'Историческая справка для этой серии отсутствует в исходном каталоге.'}
          </p>
          {s.previous_season?.source && (
            <a className="button ghost" href={s.previous_season.source} target="_blank" rel="noreferrer">
              Источник чемпионата
            </a>
          )}
          <div className="divider" />
          <h3>Сезон 2025</h3>
          <p>Результаты стартов появятся после появления подтверждённых спортивных фактов.</p>
          <Button variant="ghost" onClick={() => g.navigate('statistics')}>
            Журнал фактов
          </Button>
        </Panel>
      )}
    </>
  )
}
export function Messages() {
  const g = useGame(),
    [read, setRead] = useStored('inbox.read', []),
    [archive, setArchive] = useStored('inbox.archive', []),
    [filter, setFilter] = useState('all'),
    [q, setQ] = useState(''),
    [id, setId] = useState('')
  const all = [
    ...(g.game.projections.council?.proposals || []).map((p) => ({
      id: p.id,
      title: p.subject,
      description: p.observation,
      detail: p.hypothesis,
      date: p.date,
      person: p.lead,
      route: 'council',
      entity: p.id,
      tag: ['open', 'deferred'].includes(p.status) ? 'Нужно решение' : 'Рассмотрено',
    })),
    ...g.game.career.notices
      .map((n, i) => ({
        id: n.id || [n.date, i].join('/'),
        title: n.text,
        description: 'Сообщение организации',
        date: n.date,
        tag: 'Уведомление',
      }))
      .reverse(),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const list = all.filter(
      (x) =>
        (filter === 'archive' ? archive.includes(x.id) : !archive.includes(x.id)) &&
        (filter !== 'unread' || !read.includes(x.id)) &&
        ((x.title || '') + ' ' + (x.description || '')).toLowerCase().includes(q.toLowerCase()),
    ),
    current = list.find((x) => x.id === id) || list[0]
  return (
    <div className={'messages-screen ' + (id ? 'viewing' : '')}>
      <PageHeading
        eyebrow="Командный пункт / Входящие"
        title="Входящие"
        description="Предложения штаба и история решений. Сообщение ведёт прямо к работе."
        actions={
          <Button variant="ghost" onClick={() => setRead(all.map((x) => x.id))}>
            Прочитать всё
          </Button>
        }
      />
      <Tabs
        value={filter}
        onChange={(v) => {
          setFilter(v)
          setId('')
        }}
        items={[
          {
            id: 'all',
            label: 'Входящие',
            count: all.filter((x) => !archive.includes(x.id)).length,
          },
          {
            id: 'unread',
            label: 'Непрочитанное',
            count: all.filter((x) => !read.includes(x.id) && !archive.includes(x.id)).length,
          },
          { id: 'archive', label: 'Архив' },
        ]}
      />
      <div className={'inbox-layout ' + (id ? 'has-selection' : '')}>
        <section className="message-list">
          <input
            aria-label="Поиск сообщений"
            placeholder="Поиск сообщений"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {list.map((m) => (
            <button
              key={m.id}
              className={
                (m.id === current?.id ? 'active ' : '') + (!read.includes(m.id) ? 'unread' : '')
              }
              onClick={() => {
                setId(m.id)
                setRead((p) => [...new Set([...p, m.id])])
              }}
            >
              <small>
                {m.tag} · {short(m.date)}
              </small>
              <strong>{m.title}</strong>
              <p>{m.description}</p>
            </button>
          ))}
          {!list.length && <EmptyState title="Здесь всё разобрано" />}
        </section>
        <section className="message-body">
          {current ? (
            <>
              <Button className="message-back" variant="ghost" onClick={() => setId('')}>
                ← К списку сообщений
              </Button>
              <header>
                <span>
                  {current.person && <PersonPortrait id={current.person} />}
                  <b>
                    {g.game.personnel.find((p) => p.id === current.person)?.name ||
                      'Канцелярия организации'}
                  </b>
                </span>
                <button
                  className="icon-button"
                  aria-label={archive.includes(current.id) ? 'Вернуть из архива' : 'Архивировать'}
                  onClick={() => {
                    setArchive((p) =>
                      p.includes(current.id) ? p.filter((x) => x !== current.id) : [...p, current.id],
                    )
                    setId('')
                  }}
                >
                  <Icon name="Archive" />
                </button>
              </header>
              <Badge tone={current.tag === 'Нужно решение' ? 'warning' : 'neutral'}>{current.tag}</Badge>
              <h2>{current.title}</h2>
              <p>{current.description}</p>
              {current.detail && <blockquote>{current.detail}</blockquote>}
              {current.route && (
                <Button onClick={() => g.navigate(current.route, '', current.entity || '')}>
                  {current.route === 'statistics' ? 'Открыть запись в журнале' : 'Перейти к решению'}{' '}
                  <Icon name="ArrowRight" />
                </Button>
              )}
            </>
          ) : (
            <EmptyState title="Сообщение не выбрано" />
          )}
        </section>
      </div>
    </div>
  )
}
