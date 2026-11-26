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
  openPerson,
}: Pick<SectionProps, 'c' | 'world'> & { busy: boolean; order: Order; openPerson: (v: string) => void }) {
  const m = c.mandate!
  const [goal, setGoal] = useState(m.goal),
    [priority, setPriority] = useState(m.priority),
    [horizon, setHorizon] = useState(m.horizon),
    [budget, setBudget] = useState(String(m.limit_cents / 100)),
    [autonomy, setAutonomy] = useState(m.autonomy)
  return (
    <div className="section-grid">
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
      <div className="career-stack">
        {c.academies.map((a) => (
          <Panel key={a.id} title={a.name}>
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
                  Действующих договоров нет. Владелец может принять пилота через раздел «Поддержка» в его
                  досье.
                </p>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
