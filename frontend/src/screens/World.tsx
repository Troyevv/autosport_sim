import { useState } from 'react'
import { ChevronRight, Flag } from 'lucide-react'
import { useGame, useUI } from '../ui/context'
import { Header, Choices, Panel, Table, Button, Facts } from '../ui/components'
import { SeasonCalendar } from '../ui/SeasonCalendar'
import { SeriesSwitch } from './Overview'

export function Calendar() {
  const { state, data } = useGame(),
    { go } = useUI()
  const seriesDate = { formula: '2028-05-21', gt: '2028-05-27', endurance: '2028-05-28' }[state.series]
  return (
    <SeasonCalendar
      today={state.date}
      selectedDate={seriesDate}
      initialFilter={state.series === 'formula' ? 'all' : state.series}
      seriesNames={Object.fromEntries(Object.entries(data.world).map(([id, w]) => [id, w.title]))}
      subtitle="Гоночные уик-энды, разработки и решения в одном расписании."
      schedule={data.schedule.map((e) => ({
        ...e,
        id: e.series + e.title,
        action: (
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
        ),
      }))}
    />
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
