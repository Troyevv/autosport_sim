import { useState } from 'react'
import { Activity, CalendarDays, ClipboardList, Timer } from 'lucide-react'
import { Button } from '../../ui/components'
import { money, type Career } from '../api'
import { shortDate, type Order } from './model'

export type DevelopmentRecord = {
  migration?: { completed: number; date: string; cancelled: { skill: string } | null } | null
  experience: Record<string, number>
  history: {
    label: string
    discipline: string | null
    fact: {
      date: string
      event_id: string
      kind: string
      result?: string
      difficulty?: number
      context: { achievement?: string; reviewed?: string; wet?: boolean; series?: string }
    }
    changes: Record<string, { before: number; after: number; xp: number }>
  }[]
}
const results: Record<string, string> = {
  completed: 'Выполнено',
  failed: 'Неудачный результат',
  reviewed: 'Разобрано',
}
const achievements: Record<string, string> = {
  'validated-design': 'Принятая разработка',
  'resolved-fault': 'Устранённая неисправность',
  'met-objective': 'Достигнутая цель',
  win: 'Победа',
  podium: 'Подиум',
  pole: 'Поул',
  title: 'Чемпионский титул',
}
export function Development({ data }: { data: DevelopmentRecord }) {
  const [limit, more] = useState(6)
  return (
    <section className="work-history">
      <div className="staff-subhead">
        <h3>Профессиональная динамика</h3>
        <Activity aria-hidden="true" size={19} />
      </div>
      {data.migration && (
        <p className="muted">
          Перенос сохранения · {shortDate(data.migration.date)}. Завершённых программ по прежним правилам:{' '}
          {data.migration.completed}.{' '}
          {data.migration.cancelled &&
            'Закрыт незавершённый индивидуальный план «' + data.migration.cancelled.skill + '».'}
        </p>
      )}
      {!data.history.length ? (
        <p className="muted">В доступной истории пока нет подтверждённых профессиональных событий.</p>
      ) : (
        <>
          <div className="work-skills">
            {Object.entries(data.experience)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{v} ед. опыта</strong>
                </div>
              ))}
          </div>
          <ol className="work-events">
            {data.history.slice(0, limit).map(({ label, fact: f, changes, discipline }) => (
              <li key={f.event_id}>
                <time dateTime={f.date}>{shortDate(f.date)}</time>
                <div>
                  <strong>{label}</strong>
                  <small>
                    {[
                      results[f.result || ''],
                      f.context.achievement && achievements[f.context.achievement],
                      f.context.series?.toUpperCase(),
                      discipline,
                      f.context.wet && 'Мокрая трасса',
                      f.difficulty && 'Сложность ' + f.difficulty,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  {f.context.reviewed && <small>Основание разбора · {f.context.reviewed}</small>}
                  {Object.entries(changes).map(([k, v]) => (
                    <p key={k}>
                      {k} <b>{v.before === v.after ? v.after : v.before + ' → ' + v.after}</b>
                      {v.xp > 0 && <span>+{v.xp} опыта</span>}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {data.history.length > limit && <Button onClick={() => more(limit + 12)}>Показать ещё</Button>}
        </>
      )}
    </section>
  )
}
export function PreparationDesk({ c, order, busy }: { c: Career; order: Order; busy: boolean }) {
  const labels = Object.fromEntries(c.preparation_options.map((p) => [p.id, p.name]))
  return (
    <section className="prep-desk">
      <div className="staff-subhead">
        <h2>Программы подготовки</h2>
        <ClipboardList aria-hidden="true" />
      </div>
      <p className="muted">
        Утвердите время и бюджет. Штаб распределит работу с учётом календаря, действующих назначений и
        усталости.
      </p>
      <div className="prep-options">
        {c.preparation_options.map((p) => {
          const occupied = c.preparations.some((r) => r.kind === p.id && r.status === 'scheduled')
          return (
            <article key={p.id}>
              <small>{p.facility}</small>
              <h3>{p.name}</h3>
              <div className="prep-metrics">
                <span>
                  <Timer size={15} />
                  {p.days} дн.
                </span>
                <span>Нагрузка +{p.load}</span>
                <strong>{money(p.cost)}</strong>
              </div>
              <Button
                disabled={busy || occupied}
                onClick={() => order('prepare-program', { kind: p.id })}
                aria-label={'Утвердить программу · ' + p.name}
              >
                {occupied ? 'Слот занят' : 'Утвердить программу'}
              </Button>
            </article>
          )
        })}
      </div>
      <div className="staff-subhead">
        <h3>Расписание и результаты</h3>
        <CalendarDays aria-hidden="true" size={18} />
      </div>
      {c.preparations.length === 0 ? (
        <p className="muted">У организации пока нет утверждённых программ.</p>
      ) : (
        [...c.preparations].reverse().map((r) => (
          <article className="staff-timeline" key={r.id}>
            <small>
              {shortDate(r.start)} — {shortDate(r.end)}
            </small>
            <strong>
              {labels[r.kind]} ·{' '}
              {r.status === 'completed'
                ? 'Завершено'
                : r.status === 'scheduled'
                  ? 'Запланировано'
                  : r.status === 'awaiting-result'
                    ? 'Ожидается протокол испытаний'
                    : 'Прервано'}
            </strong>
            <span>{r.names.join(' · ')}</span>
          </article>
        ))
      )}
    </section>
  )
}
