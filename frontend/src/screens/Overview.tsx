import { Trophy, Flag, Wallet, Gauge, Play, MapPin, Sun, ChevronRight } from 'lucide-react'
import { useGame, useUI, type Route } from '../ui/context'
import { Header, Button, Stats, Panel, Choices } from '../ui/components'
import { Inbox } from '../ui/ShellActions'
import { Profile } from './People'
import { millions, type Series } from '../game'
import { seriesNames } from '../ui/labels'
export function SeriesSwitch() {
  const { state, send } = useGame()
  return (
    <Choices
      segmented
      label="Дисциплина"
      items={Object.entries(seriesNames) as [Series, string][]}
      active={state.series}
      onChange={(series) => send({ type: 'series', series })}
    />
  )
}
export function Overview() {
  const { state, data } = useGame(),
    { go, open } = useUI()
  const w = data.world[state.series],
    program = data.programs.find((p) => p.id === state.series)!,
    formula = state.series === 'formula'
  const link = (route: Route, label: string) => (
    <button className="subtle-link" onClick={() => go(route)}>
      {label} <ChevronRight aria-hidden="true" size={12} />
    </button>
  )
  return (
    <section className="screen">
      <Header
        section={program.name + ' / Центр управления'}
        title={
          formula ? 'Штаб команды' : state.series === 'gt' ? 'Штаб GT-программы' : 'Штаб выносливости'
        }
        sub={formula ? 'Каждое решение имеет значение.' : w.title + ' · программа VANTA Group'}
      >
        <SeriesSwitch />
      </Header>
      <section className={'dashboard-hero ' + (formula ? '' : 'program-hero')}>
        {formula ? (
          <img alt="" src="/assets/hero.webp" />
        ) : (
          <div className="program-hero-mark">{w.short}</div>
        )}
        <div className="hero-content">
          <div className="hero-round">
            <i />
            СЛЕДУЮЩИЙ ЭТАП <span>/</span>{' '}
            {formula ? '06 / 18' : state.series === 'gt' ? '04 / 12' : '03 / 08'}
          </div>
          <h2>
            {formula ? (
              <>
                Гран-при
                <br />
                Лазурного берега
              </>
            ) : (
              w.next
            )}
          </h2>
          <div className="hero-meta">
            <MapPin aria-hidden="true" size={13} />
            {w.country} · {w.track}
            <b />
            {formula ? (
              <>
                <Sun aria-hidden="true" size={14} />
                24°C
              </>
            ) : (
              w.laps
            )}
          </div>
          <div className="hero-bottom">
            <Button primary onClick={() => go(formula ? 'race' : 'calendar')}>
              <Play aria-hidden="true" size={13} />
              {formula ? 'Гоночный уик-энд' : 'Календарь программы'}
            </Button>
            <small>
              {formula ? '19—21 мая' : w.date}
              <br />
              Подготовка к этапу
            </small>
          </div>
        </div>
        <div className="hero-car-tag">
          <div />
          <div>
            <strong>{formula ? 'V28 / 017' : w.short}</strong>
            <small>{program.name.toUpperCase()} · 2028 SPEC</small>
          </div>
        </div>
      </section>
      <details className="demo-summary">
        <summary>Сводные показатели</summary>
        <Stats
          items={[
            [
              'Место в чемпионате',
              program.rank + ' / ' + w.teams.length,
              'Командный зачёт',
              <Trophy aria-hidden="true" size={15} />,
            ],
            [
              'Очки команды',
              program.points,
              'После последнего этапа',
              <Flag aria-hidden="true" size={15} />,
            ],
            [
              'Доступный бюджет',
              millions(state.balanceCents),
              'Резерв VANTA Group',
              <Wallet aria-hidden="true" size={15} />,
            ],
            [
              formula ? 'Рейтинг команды' : 'Этапов пройдено',
              formula ? data.reports.teamRating + ' / 100' : w.round.split(' этапов')[0],
              formula ? 'Конкурентоспособность' : 'Сезон 2028',
              <Gauge aria-hidden="true" size={15} />,
            ],
          ]}
        />
      </details>
      <div className="dashboard-main">
        <div className="dashboard-left">
          <Panel
            title={state.series === 'endurance' ? 'Экипаж программы' : 'Основной состав'}
            action={formula ? link('people', 'Все сотрудники') : link('world', 'Чемпионат')}
          >
            {formula ? (
              <div className="driver-pair">
                {data.people.slice(0, 2).map((p) => (
                  <button
                    key={p.id}
                    className="driver-mini"
                    onClick={() => open(p.name, <Profile person={p} />)}
                  >
                    <div className="driver-mini-photo">
                      <img src={p.image} alt="" />
                      <span className="driver-mini-rating">{p.rating}</span>
                    </div>
                    <div className="driver-mini-info">
                      <span className="car-number">ПИЛОТ #{p.number}</span>
                      <h3>{p.name}</h3>
                      <span className="mini-trait">{p.traits[0][0]}</span>
                      <small>
                        P{p.position} · {p.points} очков
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="program-roster">
                {w.drivers
                  .filter((d) => d[1] === program.name)
                  .map((d) => (
                    <div className="program-person" key={d[0]}>
                      <strong>{d[0]}</strong>
                      <small>{d[2]} очков</small>
                    </div>
                  ))}
              </div>
            )}
          </Panel>
          <Panel
            title="Входящие сообщения"
            action={<span className="chip">{data.messages.length - state.read.length} новых</span>}
          >
            <Inbox />
          </Panel>
        </div>
        <div className="dashboard-right">
          <Panel title="Кубок конструкторов" action={link('world', 'Зачёт')}>
            {w.teams.slice(0, Math.max(5, Number(program.rank))).map(([name, points, , color], i) => (
              <div key={name} className={'standing-row ' + (name === program.name ? 'active' : '')}>
                <span className="rank">0{i + 1}</span>
                <strong>
                  <i className="team-line" style={{ background: color }} />
                  {name}
                </strong>
                <span className="mono">{points}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Ближайшие этапы" action={link('calendar', 'Календарь')}>
            {w.events.map(([round, date, title]) => (
              <div className="calendar-mini" key={round}>
                <div className="calendar-date">
                  <b>{date.split(' ')[0]}</b>
                  <small>{date.split(' ')[1]}</small>
                </div>
                <strong>{title}</strong>
                <span className="chip">Этап {round}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Финансовый резерв" action={link('finance', 'Журнал')}>
            <div className="budget-trend">
              <div className="budget-trend-header">
                <strong>{millions(state.balanceCents)}</strong>
              </div>
              <svg
                viewBox="0 0 300 60"
                className="chart-svg"
                role="img"
                aria-label="Архивная динамика резерва за шесть месяцев"
              >
                <path d="M0 15 L58 12 L118 28 L178 20 L238 35 L300 43 V60 H0Z" fill="#38202a" />
                <path
                  d="M0 15 L58 12 L118 28 L178 20 L238 35 L300 43"
                  fill="none"
                  stroke="#bf5368"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  )
}
