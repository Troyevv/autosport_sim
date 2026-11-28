import { useState } from 'react'
import { Activity, CalendarDays } from 'lucide-react'
import { Icon, Button as PaperButton } from '../../pitwall/ui'
import { Button, Dialog } from '../../ui/components'
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
          Перенос сохранения · {shortDate(data.migration.date)}. Завершённых программ по прежним
          правилам: {data.migration.completed}.{' '}
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
export function PreparationDesk({
  c,
  order,
  busy,
  error,
}: {
  c: Career
  order: Order
  busy: boolean
  error: string
}) {
  const [proposal, propose] = useState('')
  const option = c.preparation_options.find((row) => row.id === proposal)
  const [declined, setDeclined] = useState(false)
  const labels = Object.fromEntries(c.preparation_options.map((p) => [p.id, p.name]))
  return (
    <section className="people-module prep-desk">
      <div className="p-prep-options">
        {c.preparation_options.map((row) => {
          const occupied = c.preparations.some((r) => r.kind === row.id && r.status === 'scheduled')
          const icon =
            (
              {
                simulator: 'Gamepad2',
                fitness: 'Activity',
                'pit-drill': 'Timer',
                academy: 'GraduationCap',
                debrief: 'MessagesSquare',
                'bench-test': 'Gauge',
              } as Record<string, string>
            )[row.id] || 'Calendar'
          return (
            <article key={row.id}>
              <Icon name={icon} size={28} />
              <span className="p-kicker">{row.facility}</span>
              <h2>{row.name}</h2>
              <div className="p-prep-price">
                <strong>{money(row.cost)}</strong>
                <span>
                  {row.days} дн. · нагрузка +{row.load}
                </span>
              </div>
              {row.unavailable && <p>{row.unavailable}</p>}
              <PaperButton
                variant={occupied || row.unavailable ? 'secondary' : 'primary'}
                disabled={busy || occupied || Boolean(row.unavailable)}
                onClick={() => {
                  propose(row.id)
                  setDeclined(false)
                }}
                aria-label={'Утвердить программу · ' + row.name}
              >
                {occupied ? 'Слот занят' : 'Утвердить программу'}
              </PaperButton>
            </article>
          )
        })}
      </div>
      {option && (
        <Dialog
          title={option.name}
          onClose={() => {
            if (!busy) propose('')
          }}
        >
          <div className="p-facts">
            <dl>
              <dt>Объект</dt>
              <dd>{option.facility}</dd>
              <dt>Продолжительность</dt>
              <dd>{option.days} дн.</dd>
              <dt>Нагрузка</dt>
              <dd>+{option.load}</dd>
              <dt>Стоимость программы</dt>
              <dd>{money(option.cost)}</dd>
              <dt>Участники</dt>
              <dd>{option.participants?.join(' · ') || 'Состав определяет штаб'}</dd>
            </dl>
          </div>
          {option.unavailable && <p>{option.unavailable}</p>}
          {declined && <p role="alert">{error}</p>}
          <div className="form-actions">
            <Button disabled={busy} onClick={() => propose('')}>
              Назад
            </Button>
            <Button
              primary
              disabled={busy || Boolean(option.unavailable)}
              onClick={async () => {
                if (await order('prepare-program', { kind: option.id })) propose('')
                else setDeclined(true)
              }}
            >
              Подтвердить программу
            </Button>
          </div>
        </Dialog>
      )}
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
