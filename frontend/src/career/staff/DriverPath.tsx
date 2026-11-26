import { useState } from 'react'
import { Button, Facts } from '../../ui/components'
import type { SectionProps } from '../Sections'
import { money } from '../api'
import { shortDate, type Dossier, type Order } from './model'
import { sources, styles } from './pathModel'
type Props = Pick<SectionProps, 'world' | 'c'> & { data: Dossier; busy: boolean; order: Order }
export function estimate(d: Dossier) {
  if (d.person.potential !== undefined) return String(d.person.potential)
  const r = d.reports.at(-1)
  return r ? r.low + '–' + r.high : 'Нет наблюдений'
}
export function ManagerProfile({ p }: { p: Dossier['person'] }) {
  const m = p.management!
  return (
    <>
      <h3>Управленческий профиль</h3>
      <Facts
        items={[
          ['Стиль', styles[m.style]],
          ['Амбиции', p.ambition],
          ['Финансовая дисциплина', m.discipline],
          ['Предпочтение молодых пилотов', m.youth],
          ['Предпочтение профильных специалистов', m.specialists],
        ]}
      />
    </>
  )
}
export function Scouting({ data, c, world, busy, order }: Props) {
  const last = data.reports.at(-1)
  return (
    <div className="path-block">
      <div className="staff-subhead">
        <h3>Скаутский отчёт</h3>
        <b>{estimate(data)}</b>
      </div>
      <p>
        {last
          ? 'Диапазон оценки · ' + world.names[last.scout] + ' · ' + shortDate(last.date)
          : 'Для оценки потенциала нужно наблюдение скаута.'}
      </p>
      {data.scout_available && (
        <Button
          disabled={busy || (!!last && last.next > c.date)}
          onClick={() => order('scout-driver', { person: data.person.id })}
        >
          {last && last.next > c.date
            ? 'Следующее наблюдение · ' + shortDate(last.next)
            : 'Запросить наблюдение'}
        </Button>
      )}
      {data.results.length > 0 && (
        <>
          <h3>Результаты заездов</h3>
          {data.results.map((r) => (
            <p key={r.session_id}>
              {shortDate(r.day)} · {world.championships[r.series].name} · №{world.entries[r.entry].number} ·{' '}
              {r.place ? 'место ' + r.place : 'без классификации'}
            </p>
          ))}
        </>
      )}
      {data.classifications.map((row) => (
        <p key={row.season}>
          {row.season} · место {row.place} · баллы суперлицензии {row.certified_points}
        </p>
      ))}
      {data.person.credentials && (
        <small>
          Лицензии ·{' '}
          {data.person.credentials.licences
            .map((v) => ({ international: 'международная', super: 'суперлицензия' })[v] || v)
            .join(', ')}{' '}
          · Баллы {data.person.credentials.points}
        </small>
      )}
    </div>
  )
}
export function DriverBacking(props: Props) {
  const { data, c, world, busy, order } = props
  const [confirm, ask] = useState('')
  return (
    <>
      <h3>Финансирование пилота</h3>
      <p className="muted">
        Взносы перечисляются команде за дни действующего места. Оклад выплачивается пилоту по трудовому
        договору.
      </p>
      {!data.financing.length && <p>Договоров поддержки нет.</p>}
      {data.financing.map((f) => (
        <article className="path-block" key={f.id}>
          <div className="staff-subhead">
            <h3>{sources[f.source]}</h3>
            <strong>{money(f.monthly_cents)} / мес.</strong>
          </div>
          <p>
            {world.organizations[f.payer]?.name || sources[f.source]} →{' '}
            {f.portable ? 'действующая команда' : world.organizations[f.team!]?.name || 'по месту'}
          </p>
          <Facts
            items={[
              ['Срок', shortDate(f.start) + ' — ' + shortDate(f.end)],
              ['Статус', f.reason || (f.end <= c.date ? 'Завершён' : 'Действует')],
              ['Условия места', f.guarantee ? 'Место гарантировано' : 'Оплата за участие'],
              ['Перенос при переходе', f.portable ? 'Следует за пилотом' : 'Только исходная команда'],
              ...(f.paid_cents != null ? [['Выплачено', money(f.paid_cents)] as const] : []),
              ...(f.arrears
                ? [['Просрочено', money(Object.values(f.arrears).reduce((a, b) => a + b, 0))] as const]
                : []),
              ...(f.minimum_starts
                ? [
                    [
                      'Условие продолжения',
                      f.minimum_starts +
                        ' старта за 90 дней' +
                        (f.best_place ? ', финиш в топ-' + f.best_place : ''),
                    ] as const,
                  ]
                : []),
            ]}
          />
          {f.status === 'active' &&
            f.end > c.date &&
            (f.source === 'academy'
              ? f.payer === c.org && c.role === 'owner'
              : (f.payer === c.org && c.role === 'manufacturer') ||
                (data.current?.org === c.org && (f.portable || f.team === c.org) && c.role === 'manager')) &&
            (confirm === f.id ? (
              <>
                <p>Прекратить договор и выплатить компенсацию {money(f.exit_cents)}?</p>
                <div className="form-actions">
                  <Button onClick={() => ask('')}>Отмена</Button>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      if (await order('funding-end', { agreement: f.id })) ask('')
                    }}
                  >
                    Подтвердить прекращение
                  </Button>
                </div>
              </>
            ) : (
              <Button onClick={() => ask(f.id)}>Прекратить поддержку</Button>
            ))}
        </article>
      ))}
      {data.scholarships.map((s) => (
        <article className="path-block" key={s.id}>
          <small>АКАДЕМИЧЕСКИЙ ДОГОВОР</small>
          <h3>{s.name}</h3>
          <p>
            {shortDate(s.start)} — {shortDate(s.end)} ·{' '}
            {s.exercised
              ? 'Опцион реализован'
              : s.option
                ? 'Опцион продления на ' + s.option_days + ' дней'
                : 'Без опциона'}{' '}
            · {s.priority ? 'Приоритет академии' : 'Открытые переговоры'}
          </p>
          {s.priority_until && <p>Окно академии до {shortDate(s.priority_until)}</p>}
          {s.end > c.date &&
            ((s.org === c.org && s.option && !s.exercised) ||
              (c.role === 'manager' && s.org !== c.org && s.priority && !s.priority_until)) && (
              <Button disabled={busy} onClick={() => order('academy-right', { agreement: s.id })}>
                {s.org === c.org ? 'Использовать опцион' : 'Запросить окно переговоров'}
              </Button>
            )}
        </article>
      ))}
      {c.role === 'owner' && c.academies.length > 0 && !data.scholarships.some((s) => s.end > c.date) && (
        <FundingForm {...props} academy />
      )}
      {c.role === 'manufacturer' && <FundingForm {...props} academy={false} />}
    </>
  )
}
function FundingForm({ c, world, data, busy, order, academy }: Props & { academy: boolean }) {
  const clients = new Set(
    Object.values(world.entries)
      .filter((e) => academy || Object.values(world.cars[e.car].suppliers).includes(c.org))
      .map((e) => e.org),
  )
  const [recipient, setRecipient] = useState(
      academy
        ? ''
        : data.current && clients.has(data.current.org)
          ? data.current.org
          : Array.from(clients)[0] || '',
    ),
    [monthly, setMonthly] = useState('1000'),
    [end, setEnd] = useState('2025-12-31')
  const [first, setFirst] = useState(academy || (!!data.current && clients.has(data.current.org))),
    [option, setOption] = useState(true)
  return (
    <form
      className="staff-form path-block"
      onSubmit={(e) => {
        e.preventDefault()
        const base = {
          person: data.person.id,
          monthly_cents: Math.round(Number(monthly) * 100),
          end,
          ...(recipient ? { recipient } : {}),
        }
        if (academy) order('academy-enroll', { ...base, academy: c.academies[0].id, option, priority: first })
        else order('manufacturer-backing', { ...base, portable: option, guarantee: first })
      }}
    >
      <h3>{academy ? 'Принять в академию' : 'Поддержать пилота клиента'}</h3>
      <label>
        Команда — получатель взносов
        <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
          {academy && <option value="">Действующая команда воспитанника</option>}
          {[...clients].sort().map((id) => (
            <option key={id} value={id}>
              {world.organizations[id].name}
            </option>
          ))}
        </select>
      </label>
      <div className="staff-pair">
        <label>
          Взнос в месяц, €
          <input
            required
            type="number"
            min="1"
            max="100000000"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
          />
        </label>
        <label>
          До даты
          <input required type="date" value={end} min={c.date} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="staff-check">
        <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} />
        {academy ? 'Приоритет переговоров' : 'Гарантия места'}
      </label>
      <label className="staff-check">
        <input type="checkbox" checked={option} onChange={(e) => setOption(e.target.checked)} />
        {academy ? 'Опцион академии' : 'Перенос взносов при трансфере'}
      </label>
      <Button primary type="submit" disabled={busy}>
        {academy ? 'Заключить договор воспитанника' : 'Заключить договор поддержки'}
      </Button>
    </form>
  )
}
