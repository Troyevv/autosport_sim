import { useState } from 'react'
import { Panel, Progress } from '../../ui/components'
import { shortDate, type Dossier } from './model'
import type { Career } from '../api'

export type Relationship = {
  kind: string
  peer: string
  name: string
  days: number
  active: boolean
  trust: number | null
  spells: { start: string; end: string; org: string }[]
  events: { date: string; outcome: string }[]
}
const activities: Record<string, string> = {
  feedback: 'Обратная связь с инженером',
  strategy: 'Работа со стратегом',
  teammates: 'Напарники',
  technical: 'Техническое согласование',
  workshop: 'Работа с бригадой',
  handover: 'Передача работ между отделами',
}
const outcomes: Record<string, string> = {
  'confirmed-feedback': 'Инженер принял обратную связь',
  'unclear-feedback': 'Инженер запросил уточнение',
  'sound-advice': 'Рекомендация подтвердилась',
  'missed-warning': 'Предупреждение упущено',
  cooperation: 'Согласованные действия',
  conflict: 'Конфликт напарников',
  'successful-work': 'Работа принята',
  rework: 'Потребовалась доработка',
  'verified-analysis': 'Анализ подтверждён',
  'incomplete-analysis': 'Недостаточно данных',
  'accepted-handover': 'Отдел принял работу',
  'incomplete-handover': 'Отдел запросил уточнение',
}
export function Connections({ rows }: { rows: Relationship[] }) {
  return (
    <section className="staff-connections">
      <h3>Совместная работа</h3>
      {!rows.length && <p className="muted">Совместных назначений в карьере пока нет.</p>}
      {[...rows]
        .sort((a, b) => Number(b.active) - Number(a.active) || b.days - a.days)
        .map((r) => (
          <article className="staff-connection" key={r.kind + r.peer}>
            <div className="staff-subhead">
              <small>{activities[r.kind]}</small>
              <small>{r.active ? 'В составе' : 'Архив'}</small>
            </div>
            <strong>{r.name}</strong>
            <div className="staff-subhead">
              <span>{r.days} дн. вместе</span>
              <span>{r.trust === null ? 'Внешний коллектив' : 'Доверие · ' + r.trust + ' / 100'}</span>
            </div>
            {r.trust !== null && <Progress value={r.trust} />}
            {(r.spells.length > 0 || r.events.length > 0) && (
              <details>
                <summary>История работы</summary>
                {r.spells.map((s) => (
                  <p key={s.start}>
                    {shortDate(s.start)} — {shortDate(s.end)}
                  </p>
                ))}
                {r.events.map((e, i) => (
                  <p key={i}>
                    {shortDate(e.date)} · {outcomes[e.outcome]}
                  </p>
                ))}
              </details>
            )}
          </article>
        ))}
    </section>
  )
}
export function Handling({ data }: { data: Dossier }) {
  const preferences = data.person.preferences
  if (!preferences) return null
  return (
    <div className="staff-handling">
      <h3>Предпочтения машины</h3>
      {Object.entries(preferences).map(([key, value]) => (
        <div key={key}>
          <div className="staff-subhead">
            <strong>{key}</strong>
            <b>{value} / 100</b>
          </div>
          <Progress value={value} />
          <div className="staff-subhead">
            <small>{key === 'Баланс' ? 'Недостаточная поворачиваемость' : 'Плавный'}</small>
            <small>{key === 'Баланс' ? 'Избыточная поворачиваемость' : 'Острый'}</small>
          </div>
        </div>
      ))}
    </div>
  )
}
export function CompareWork({ left, right }: { left: Dossier; right: Dossier }) {
  const keys = Object.keys(activities).filter((k) =>
    [...left.relationships, ...right.relationships].some((r) => r.kind === k),
  )
  const [choice, setChoice] = useState('')
  const kind = keys.includes(choice) ? choice : keys[0]
  const pair = [left, right].map(
    (p) =>
      p.relationships
        .filter((r) => r.kind === kind)
        .sort((a, b) => Number(b.active) - Number(a.active) || b.days - a.days)[0],
  )
  return (
    <>
      {left.person.preferences && (
        <div className="staff-compare">
          {Object.entries(left.person.preferences).map(([k, v]) => (
            <div key={k}>
              <b>{v}</b>
              <span>{k}</span>
              <b>{right.person.preferences?.[k]}</b>
            </div>
          ))}
        </div>
      )}
      {kind && (
        <section className="staff-handling">
          <h3>Сравнение совместного опыта</h3>
          <label>
            Вид работы
            <select value={kind} onChange={(e) => setChoice(e.target.value)}>
              {keys.map((k) => (
                <option value={k} key={k}>
                  {activities[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="staff-duo">
            {pair.map((r, i) => (
              <div key={i}>
                <small>{[left, right][i].person.name}</small>
                <strong>{r?.name || 'Нет назначений'}</strong>
                {r && (
                  <>
                    <span>
                      {r.days} дн. вместе · {r.active ? 'в составе' : 'архив'}
                    </span>
                    <span>{r.trust === null ? 'Доверие неизвестно' : 'Доверие · ' + r.trust}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

const groupMetrics = {
  qualification: 'Квалификация',
  precision: 'Точность',
  speed: 'Скорость работ',
  pressure: 'Работа под давлением',
  cohesion: 'Слаженность',
  motivation: 'Мотивация',
  atmosphere: 'Атмосфера в подразделении',
  team_days: 'Совместная работа, дней',
} as const

export function GroupWork({ groups }: { groups: Career['collectives'] }) {
  const [id, setId] = useState(groups[0]?.id)
  const [compare, setCompare] = useState('')
  const g = groups.find((v) => v.id === id)
  const other = groups.find((v) => v.id === compare && v.id !== id)
  if (!g) return null
  return (
    <Panel title="Профессиональное взаимодействие">
      <div className="path-panel">
        <label>
          Подразделение
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {groups.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Сравнить подразделения
          <select value={other?.id || ''} onChange={(e) => setCompare(e.target.value)}>
            <option value="">Только выбранное подразделение</option>
            {groups
              .filter((v) => v.id !== id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
        <div className="staff-compare unit-comparison" aria-label="Показатели подразделений">
          <div>
            <strong>{g.name}</strong>
            <span></span>
            <strong>{other?.name || ''}</strong>
          </div>
          {(Object.keys(groupMetrics) as (keyof typeof groupMetrics)[]).map((k) => (
            <div key={k}>
              <b>{g[k]}</b>
              <span>{groupMetrics[k]}</span>
              <b>{other?.[k]}</b>
            </div>
          ))}
        </div>
        <Connections rows={g.relationships} />
      </div>
    </Panel>
  )
}
