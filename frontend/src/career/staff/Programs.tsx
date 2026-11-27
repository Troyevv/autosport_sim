import { PersonPortrait } from '../../pitwall/visuals'
import { useState } from 'react'
import { Button, Facts, Panel } from '../../ui/components'
import type { SectionProps } from '../Sections'
import { money } from '../api'
import { shortDate, type Order } from './model'
import { styles, periods } from './pathModel'
export function Programs({
  c,
  world,
  busy,
  order,
  section,
  openPerson,
}: Pick<SectionProps, 'c' | 'world'> & {
  section: string
  busy: boolean
  order: Order
  openPerson: (v: string) => void
}) {
  const m = c.mandate!
  const [goal, setGoal] = useState(m.goal),
    [priority, setPriority] = useState(m.priority),
    [horizon, setHorizon] = useState(m.horizon),
    [budget, setBudget] = useState(String(m.limit_cents / 100)),
    [autonomy, setAutonomy] = useState(m.autonomy)
  return (
    <div className="people-module program-workspace">
      {section === 'programs' && m.manager && (
        <div className="p-leadership-layout">
          <div className="p-person-card featured">
            <button className="p-person-main" onClick={() => openPerson(m.manager!)}>
              <div className="p-photo">
                <PersonPortrait
                  id={m.manager}
                  person={c.assignments.find((s) => s.occupant?.id === m.manager)?.occupant}
                  role="manager"
                  size={undefined}
                />
              </div>
              <div className="p-card-identity">
                <span className="p-kicker">Менеджер организации</span>
                <h3>{m.manager === c.player_id ? c.name : world.names[m.manager]}</h3>
              </div>
            </button>
          </div>
          <div className="p-mandate">
            <span className="p-kicker">Мандат и ожидания</span>
            <h2>{styles[m.goal]}</h2>
            <Facts
              items={[
                ['Приоритет', m.priority === 'required' ? 'Обязательно' : 'Желательно'],
                ['Горизонт', periods[m.horizon]],
                ['Доверие', m.trust],
              ]}
            />
          </div>
        </div>
      )}
      {section === 'programs' && (
        <Panel title="Мандат менеджера">
          <div className="path-panel">
            {m.manager ? (
              <Button onClick={() => openPerson(m.manager!)}>
                {m.manager === c.player_id ? c.name : world.names[m.manager]}
              </Button>
            ) : (
              <p>Должность менеджера вакантна.</p>
            )}
            <Facts
              items={[
                ['Цель владельца', styles[m.goal]],
                ['Горизонт', periods[m.horizon]],
                ['Приоритет', m.priority === 'required' ? 'Обязательно' : 'Желательно'],
                ['Лимит месячного оклада', money(m.limit_cents)],
                ['Автономия / доверие', m.autonomy + ' / ' + m.trust],
                ['Удовлетворённость', m.satisfaction],
                ['Позиция менеджера', m.response],
              ]}
            />
            {c.role === 'owner' && (
              <form
                className="staff-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  order('manager-mandate', {
                    goal,
                    priority,
                    horizon,
                    autonomy,
                    limit_cents: Math.round(Number(budget) * 100),
                  })
                }}
              >
                <label>
                  Цель
                  <select value={goal} onChange={(e) => setGoal(e.target.value)}>
                    {Object.entries(styles).map(([k, n]) => (
                      <option value={k} key={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="staff-pair">
                  <label>
                    Период
                    <select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                      {Object.entries(periods).map(([k, n]) => (
                        <option key={k} value={k}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Приоритет
                    <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                      <option value="desired">Желательно</option>
                      <option value="required">Обязательно</option>
                    </select>
                  </label>
                </div>
                <div className="staff-pair">
                  <label>
                    Лимит оклада, €
                    <input
                      required
                      type="number"
                      min="0"
                      step=".01"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </label>
                  <label>
                    Автономия, 0–100
                    <input
                      required
                      type="number"
                      min="0"
                      max="100"
                      value={autonomy}
                      onChange={(e) => setAutonomy(Number(e.target.value))}
                    />
                  </label>
                </div>
                <Button primary disabled={busy || !m.manager} type="submit">
                  Передать мандат
                </Button>
              </form>
            )}
            {m.history
              .slice(-3)
              .reverse()
              .map((h, i) => (
                <p key={i}>
                  {shortDate(h.date)} · {styles[h.goal]} · {h.response}
                </p>
              ))}
          </div>
        </Panel>
      )}
      {section !== 'programs' && (
        <div className="career-stack">
          {!c.academies.length && (
            <p>
              У организации нет академии. Поддержку пилота можно проверить в его досье на кадровом рынке.
            </p>
          )}
          {section === 'funding' && (
            <a className="btn" href="#market">
              Выбрать пилота на кадровом рынке
            </a>
          )}
          {c.academies.map((a) => (
            <div key={a.id}>
              <div className="p-academy-hero">
                <span className="p-kicker">Программа развития</span>
                <h2>{a.name}</h2>
                <div className="p-academy-metrics">
                  <span>
                    <small>Бюджет программы</small>
                    <strong>{money(a.budget_cents)}</strong>
                  </span>
                  <span>
                    <small>Выплачено за места</small>
                    <strong>{money(a.spent_cents)}</strong>
                  </span>
                  <span>
                    <small>Действующих договоров</small>
                    <strong>
                      {c.scholarships.filter((s) => s.academy === a.id && s.end > c.date).length}
                    </strong>
                  </span>
                </div>
              </div>
              <Panel title={a.name}>
                <div className="path-panel">
                  <Facts
                    items={[
                      ['Бюджет программы', money(a.budget_cents)],
                      ['Выплачено за места', money(a.spent_cents)],
                    ]}
                  />
                  <h3>Штат академии</h3>
                  {c.assignments
                    .filter((s) => s.academy === a.id)
                    .map((s) => (
                      <div className="result" key={s.id}>
                        <span>
                          <small>{world.positions[s.position].name}</small>
                          {s.occupant?.name || 'Вакантно'}
                        </span>
                        {s.occupant && <Button onClick={() => openPerson(s.occupant!.id)}>Досье</Button>}
                      </div>
                    ))}
                  <h3>Воспитанники</h3>
                  {c.scholarships
                    .filter((s) => s.academy === a.id && s.end > c.date)
                    .map((s) => (
                      <Button key={s.id} onClick={() => openPerson(s.person)}>
                        {world.names[s.person]} · до {shortDate(s.end)}
                      </Button>
                    ))}
                  {!c.scholarships.some((s) => s.academy === a.id && s.end > c.date) && (
                    <p className="muted">
                      Действующих договоров нет. Владелец может принять пилота через раздел «Поддержка» в
                      его досье.
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
