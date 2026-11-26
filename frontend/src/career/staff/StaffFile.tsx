import { sportingStatus } from './Lineup'
import { Development } from './Development'
import { useState } from 'react'
import { Button, Choices, Dialog, Facts, Progress } from '../../ui/components'
import type { SectionProps } from '../Sections'
import { Connections, Handling, CompareWork } from './Teamwork'
import { CountryFlag } from '../Country'
import { MediaProfile, mediaTraits } from './MediaProfile'
import { DriverBacking, Scouting, ManagerProfile, estimate } from './DriverPath'
import { Portrait } from '../Portrait'
import { money } from '../api'
import {
  daysAfter,
  seatName,
  shortDate,
  usePersonnel,
  type Candidate,
  type Dossier,
  type Order,
} from './model'

type Props = SectionProps & {
  employee: Candidate
  people: Candidate[]
  order: Order
  busy: boolean
  error: string
  onClose: () => void
  onSent: () => void
}
const tabs = [
  ['profile', 'Профиль'],
  ['career', 'Карьера'],
  ['media', 'Публичный профиль'],
  ['teamwork', 'Взаимодействие'],
  ['compare', 'Сравнение'],
  ['terms', 'Договор'],
  ['backing', 'Поддержка'],
] as const

export function StaffFile(props: Props) {
  const { employee, c, world, onClose } = props
  const [wet, rain] = useState(false),
    [tab, view] = useState<(typeof tabs)[number][0]>('profile')
  const path = 'careers/' + c.id + '/personnel/' + employee.id
  const result = usePersonnel<Dossier>(path + '?wet=' + wet, c.revision)
  const data = result.data
  return (
    <Dialog title={employee.name} onClose={onClose}>
      <div className="staff-file">
        <div className="staff-identity">
          <Portrait
            person={employee}
            org={employee.org}
            color={employee.org ? world.organizations[employee.org].color : '#888888'}
            driver={employee.position === 'driver'}
            media={props.media}
          />
          <div>
            <small>{world.positions[employee.position].name}</small>
            <h3>{employee.org ? world.organizations[employee.org].name : 'Свободный агент'}</h3>
            <p>
              {employee.age} лет · <CountryFlag id={employee.country} countries={world.countries} />{' '}
              {world.countries[employee.country]}
            </p>
            <span className="staff-tag">{employee.tag}</span>
          </div>
          <div className="staff-score">
            <b>{data?.profile.rating ?? employee.rating}</b>
            <small>рейтинг</small>
          </div>
        </div>
        <Choices
          items={tabs.filter(([id]) => id !== 'backing' || employee.position === 'driver')}
          active={tab}
          onChange={view}
          label="Разделы досье"
        />
        {props.error && (
          <p className="career-error" role="alert">
            {props.error}
          </p>
        )}
        {result.error && (
          <p role="alert">
            {result.error} <Button onClick={result.retry}>Повторить</Button>
          </p>
        )}
        {!data && !result.error && <p role="status">Загрузка досье…</p>}
        {data && tab === 'profile' && (
          <>
            <div className="staff-subhead">
              <h3>Профиль навыков</h3>
              {employee.position === 'driver' && (
                <label className="staff-check">
                  <input type="checkbox" checked={wet} onChange={(e) => rain(e.target.checked)} />
                  Мокрая трасса
                </label>
              )}
            </div>
            <p className="muted">
              Шкала 0–100. База → эффективное значение. Рейтинг — взвешенное среднее. Множитель рядом с
              навыком показывает его вес для этой профессии.
            </p>
            <div className="staff-skills">
              {world.positions[employee.position].skills.map((k) => (
                <div key={k}>
                  <span>
                    {k} <small>×{data.profile.weights[k]}</small>
                  </span>
                  <strong>
                    {data.person.skills[k]} → {data.profile.values[k]}
                  </strong>
                  <Progress value={data.profile.values[k]} />
                </div>
              ))}
            </div>
            <p className="muted">
              Общие поправки к навыкам · состояние {data.profile.readiness}, освоенность дисциплины{' '}
              {data.profile.familiarity}.
            </p>
            <h3>Трейты</h3>
            <div className="staff-traits">
              {data.profile.traits.map((t) => (
                <article key={t.id}>
                  <small>
                    {t.kind} · {t.active ? 'Действует' : 'Вне условий'}
                  </small>
                  <strong>{t.name}</strong>
                  <span>
                    {t.condition} · {t.skill} {t.delta > 0 ? '+' : ''}
                    {t.delta}
                    {t.end && ' · до ' + shortDate(t.end)}
                  </span>
                </article>
              ))}
            </div>
            <Facts
              items={[
                ['Специализация', data.person.specialization],
                ['Оценка потенциала', estimate(data)],
                ['Мораль / усталость', data.person.morale + ' / ' + data.person.fatigue],
              ]}
            />
          </>
        )}
        {data && tab === 'teamwork' && (
          <>
            <Handling data={data} />
            <Connections rows={data.relationships} />
          </>
        )}
        {data && tab === 'profile' && data.person.management && <ManagerProfile p={data.person} />}
        {data && tab === 'media' && <MediaProfile data={data} world={world} />}
        {data && tab === 'backing' && <DriverBacking {...props} data={data} />}
        {data && tab === 'career' && data.person.position === 'driver' && <Scouting {...props} data={data} />}
        {data && tab === 'career' && <CareerFile {...props} data={data} />}
        {data && tab === 'compare' && <Comparison {...props} data={data} wet={wet} />}
        {data && tab === 'terms' && <Terms {...props} data={data} />}
      </div>
    </Dialog>
  )
}
type FileProps = Props & { data: Dossier }
function CareerFile({ data, c, world, order, busy }: FileProps) {
  const p = data.person,
    current = data.current
  const managed = current && current.org === c.org && data.options.some((o) => o.id === current.seat)
  return (
    <>
      <div className="staff-subhead">
        <h3>Опыт и развитие</h3>
        <span>{p.experience} лет опыта</span>
      </div>
      <Facts
        items={[
          ['Дата рождения', shortDate(p.birth_date)],
          ...(p.reaction != null ? [['Реакция', p.reaction] as [string, number]] : []),
          ['Оценка потенциала', estimate(data)],
          ['Амбиции / лояльность', p.ambition + ' / ' + p.loyalty],
          ['Профессионализм', p.professionalism],
          ['Профессиональная репутация / адаптивность', p.reputation + ' / ' + p.adaptability],
          ['Усталость', p.fatigue],
        ]}
      />
      <div className="staff-disciplines">
        {Object.entries(p.adaptation).map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <b>{v} / 100</b>
            <span>{p.discipline_days[k]} дней опыта</span>
          </div>
        ))}
      </div>
      <Development data={data.development} />
      <h3>История назначений</h3>
      {data.history.map((r, i) => (
        <article key={i} className="staff-timeline">
          <small>
            {r.start > c.date ? 'Предстоит' : r.end && r.end <= c.date ? 'Завершено' : 'Действует'} ·{' '}
            {shortDate(r.start)} — {r.end ? shortDate(r.end) : 'без срока'}
          </small>
          <strong>{world.organizations[r.org].name}</strong>
          <span>
            {r.series?.toUpperCase()} {r.entry && ' · № ' + world.entries[r.entry].number} ·{' '}
            {world.positions[r.position].name}
            {r.salary_cents != null && ' · ' + money(r.salary_cents) + ' / мес.'}
            {r.transfer_on && ' · Переход ' + shortDate(r.transfer_on)}
            {r.agreed_end && r.end !== r.agreed_end && ' · Исходный срок до ' + shortDate(r.agreed_end)}
          </span>
        </article>
      ))}
      {data.lineup_history?.map(r=><p key={r.id}>{shortDate(r.date)} · {r.message}</p>)}
      {!data.history.length && <p>Назначений в карьере пока нет.</p>}
      {p.position === 'technical-advisor' && (
        <>
          <h3>Поддержка клиентов</h3>
          {data.support.map((r) => (
            <p key={r.id}>
              {world.organizations[r.client].name} · {shortDate(r.start)} — {shortDate(r.end)}
            </p>
          ))}
          {managed && <SupportForm {...{ c, world, order, busy }} seat={current.seat} />}
        </>
      )}
    </>
  )
}
function SupportForm({
  c,
  world,
  order,
  busy,
  seat,
}: Pick<Props, 'c' | 'world' | 'order' | 'busy'> & { seat: string }) {
  const clients = Object.values(world.entries).flatMap((e) =>
    Object.entries(world.cars[e.car].suppliers)
      .filter(([, org]) => org === c.org)
      .map(([product]) => ({
        entry: e.id,
        product,
        label: world.organizations[e.org].name + ' · № ' + e.number + ' · ' + world.products[product].name,
      })),
  )
  const [i, pick] = useState(0),
    [start, from] = useState(c.date),
    [end, until] = useState(daysAfter(c.date, 7))
  return (
    <form
      className="staff-form"
      onSubmit={(e) => {
        e.preventDefault()
        order('advisor-assign', { seat, entry: clients[i].entry, product: clients[i].product, start, end })
      }}
    >
      <label>
        Клиент по поставке
        <select value={i} onChange={(e) => pick(Number(e.target.value))}>
          {clients.map((v, i) => (
            <option key={v.entry + v.product} value={i}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <Dates {...{ start, end, from, until, min: c.date }} />
      <Button type="submit" disabled={busy || !clients.length}>
        Назначить консультанта
      </Button>
    </form>
  )
}
function Comparison(props: FileProps & { wet: boolean }) {
  const { employee, people, c, data, world, media, wet } = props
  const peers = people.filter((p) => p.position === employee.position && p.id !== employee.id)
  const [other, pick] = useState(peers.find((p) => p.org === c.org)?.id || peers[0]?.id || '')
  const peer = peers.find((p) => p.id === other)
  if (!peer) return <p>Нет второго сотрудника этой профессии.</p>
  return (
    <>
      <label className="staff-label">
        Сравнить с
        <select value={other} onChange={(e) => pick(e.target.value)}>
          {peers.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name} · {p.org ? world.organizations[p.org].name : 'Свободный агент'}
            </option>
          ))}
        </select>
      </label>
      <div className="staff-vs">
        {[employee, peer].map((p) => (
          <div key={p.id}>
            <Portrait
              person={p}
              org={p.org}
              color={p.org ? world.organizations[p.org].color : '#888888'}
              driver={p.position === 'driver'}
              media={media}
            />
            <strong>{p.name}</strong>
          </div>
        ))}
      </div>
      <PeerSkills key={other} {...{ peer, world, c, data, wet }} />
    </>
  )
}
function PeerSkills({
  peer,
  world,
  c,
  data,
  wet,
}: Pick<FileProps, 'world' | 'c' | 'data'> & { peer: Candidate; wet: boolean }) {
  const other = usePersonnel<Dossier>('careers/' + c.id + '/personnel/' + peer.id + '?wet=' + wet, c.revision)
  if (other.error)
    return (
      <p role="alert">
        {other.error} <Button onClick={other.retry}>Повторить</Button>
      </p>
    )
  if (!other.data) return <p role="status">Загрузка сравнения…</p>
  const second = other.data
  return (
    <>
      <p className="muted">Эффективные навыки · {wet ? 'мокрая трасса' : 'обычные условия'}</p>
      <div className="staff-compare">
        {world.positions[peer.position].skills.map((k) => (
          <div key={k}>
            <b>{data.profile.values[k]}</b>
            <span>{k}</span>
            <b>{second.profile.values[k]}</b>
          </div>
        ))}
        <div>
          <b>{data.profile.rating}</b>
          <strong>Рейтинг</strong>
          <b>{second.profile.rating}</b>
        </div>
      </div>
      {data.person.reaction != null && (
        <div className="staff-compare">
          <div>
            <b>{data.person.reaction}</b>
            <span>Базовая реакция</span>
            <b>{second.person.reaction}</b>
          </div>
        </div>
      )}
      {Object.keys({ ...data.development.experience, ...second.development.experience }).length > 0 && (
        <details className="staff-handling">
          <summary>Сравнить подтверждённый опыт</summary>
          <div className="staff-compare">
            {Object.keys({ ...data.development.experience, ...second.development.experience })
              .sort()
              .map((k) => (
                <div key={k}>
                  <b>{data.development.experience[k] ?? '—'}</b>
                  <span>{k}</span>
                  <b>{second.development.experience[k] ?? '—'}</b>
                </div>
              ))}
          </div>
        </details>
      )}
      <CompareWork left={data} right={second} />
      <details className="staff-handling">
        <summary>Сравнить публичные профили</summary>
        <div className="staff-compare">
          {(['reputation', 'authority', 'popularity', 'loyalty'] as const).map((k, i) => (
            <div key={k}>
              <b>{data.person[k]}</b>
              <span>
                {['Профессиональная репутация', 'Авторитет', 'Медийная популярность', 'Лояльность'][i]}
              </span>
              <b>{second.person[k]}</b>
            </div>
          ))}
          {Object.entries(mediaTraits).map(([k, label]) => (
            <div key={k}>
              <b>{data.person.media_traits[k]}</b>
              <span>{label}</span>
              <b>{second.person.media_traits[k]}</b>
            </div>
          ))}
        </div>
      </details>
    </>
  )
}
function Dates({
  start,
  end,
  from,
  until,
  min,
}: {
  start: string
  end: string
  from: (v: string) => void
  until: (v: string) => void
  min: string
}) {
  return (
    <div className="staff-pair">
      <label>
        Начало
        <input type="date" required value={start} min={min} onChange={(e) => from(e.target.value)} />
      </label>
      <label>
        Окончание (исключая)
        <input
          type="date"
          required
          value={end}
          min={start ? daysAfter(start, 1) : min}
          onChange={(e) => until(e.target.value)}
        />
      </label>
    </div>
  )
}
function Terms({ data, c, world, busy, order, onSent }: FileProps) {
  const current = data.current
  const managed = current && current.org === c.org && data.options.some((o) => o.id === current.seat)
  const options = data.options
  const vacant = (id: string) => !c.assignments.find((a) => a.id === id)?.occupant
  const first = options.find((o) => o.id === current?.seat) || options.find((o) => vacant(o.id)) || options[0]
  const [seat, target] = useState(first?.id || ''),
    [salary, pay] = useState(String((first?.ask_cents || 0) / 100)),
    [bonus, signing] = useState('0')
  const [status, setStatus] = useState(current?.driver_status || 'equal')
  const [combined, setCombined] = useState(false), [outside,setOutside]=useState(false)
  const driver = data.person.position === 'driver'
  const supporting = !!c.assignments.find(a=>a.id===seat)?.duty
  const [remit, setRemit] = useState('standard')
  const firstStart = first?.available || daysAfter(c.date, 3)
  const seasonEnd = (date: string) => String(Number(date.slice(0, 4)) + 1) + '-01-01'
  const [start, from] = useState(firstStart),
    [end, until] = useState(seasonEnd(firstStart)),
    [release, confirm] = useState(false)
  const expectation = options.find((o) => o.id === seat)?.ask_cents
  const query = new URLSearchParams({
    ...(driver && !supporting ? {driver_status:status} : {}),
    outside_starts:String(driver && outside),combined_duties:String(driver && supporting && combined),
    remit,
    seat,
    start,
    end,
    salary_cents: String(Math.round(Number(salary) * 100)),
  })
  const quote = usePersonnel<{
    buyout_cents: number | null
    considerations?: string[]
    support_cents?: number
    net_cents?: number
    reason: string | null
  }>(
    seat && start && end ? 'careers/' + c.id + '/personnel/' + data.person.id + '/quote?' + query : null,
    c.revision,
  )
  return (
    <>
      <div className="staff-subhead">
        <h3>{current ? 'Действующий договор' : 'Свободный агент'}</h3>
      </div>
      {current && (
        <Facts
          items={[
            ...(current.driver_status ? [['Спортивный статус',sportingStatus[current.driver_status]] as [string,string]] : []),
            ['Работодатель', world.organizations[current.org].name],
            [
              'Оклад / месяц',
              current.salary_cents == null ? 'Закрытые условия' : money(current.salary_cents),
            ],
            ['До', current.end ? shortDate(current.end) : 'Без срока'],
            [
              'Выкуп / компенсация',
              current.buyout_cents == null ? 'Закрытые условия' : money(current.buyout_cents),
            ],
          ]}
        />
      )}
      {managed && (
        <div className="staff-release">
          {release ? (
            <>
              <p>
                Освободить место сегодня и выплатить{' '}
                {current.buyout_cents == null ? 'Закрытые условия' : money(current.buyout_cents)}?
              </p>
              <Button disabled={busy} onClick={() => confirm(false)}>
                Отмена
              </Button>{' '}
              <Button
                disabled={busy}
                onClick={async () => {
                  if (await order('staff-release', { seat: current.seat })) onSent()
                }}
              >
                Подтвердить расторжение
              </Button>
            </>
          ) : (
            <Button onClick={() => confirm(true)}>Расторгнуть контракт</Button>
          )}
        </div>
      )}
      {!first ? (
        <p className="muted">В вашей зоне полномочий нет мест этой профессии.</p>
      ) : (
        <form
          className="staff-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              await order('offer-send', {
                ...(driver ? supporting ? {combined_duties:combined,outside_starts:outside} : {driver_status:status,outside_starts:outside} : {}),
                remit,
                person: data.person.id,
                seat,
                start,
                end,
                salary_cents: Math.round(Number(salary) * 100),
                bonus_cents: Math.round(Number(bonus) * 100),
              })
            )
              onSent()
          }}
        >
          <h3>Предложение сотруднику</h3>
          <label>
            Должность и место
            <select
              value={seat}
              onChange={(e) => {
                target(e.target.value)
                const option = options.find((o) => o.id === e.target.value)
                pay(String((option?.ask_cents || 0) / 100))
                if (option?.available) {
                  from(option.available)
                  until(seasonEnd(option.available))
                }
              }}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {seatName(o.id, c, world)} ·{' '}
                  {vacant(o.id) ? 'вакантно' : c.assignments.find((a) => a.id === o.id)?.occupant?.name}
                </option>
              ))}
            </select>
          </label>
          {driver && !supporting && <label>Статус по договору<select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(sportingStatus).map(([id,text])=><option key={id} value={id}>{text}</option>)}</select></label>}
          {driver && supporting && <label className="staff-check"><input type="checkbox" checked={combined} onChange={e=>setCombined(e.target.checked)}/>Совмещать резерв и испытания</label>}
          {driver && <label className="staff-check"><input type="checkbox" checked={outside} onChange={e=>setOutside(e.target.checked)}/>Разрешить выступления в другой серии в свободные даты</label>}
          {data.person.position !== 'driver' && (
            <label>
              Профессиональные полномочия
              <select value={remit} onChange={(e) => setRemit(e.target.value)}>
                <option value="standard">В рамках должности</option>
                <option value="independent">Самостоятельное руководство</option>
                <option value="supervised">Под контролем руководителя</option>
              </select>
            </label>
          )}
          {quote.data?.considerations?.map((v) => (
            <p className="muted" key={v}>
              {v}
            </p>
          ))}
          {quote.data?.reason && (
            <p className="staff-warning" role="status">
              {quote.data.reason}
            </p>
          )}
          {quote.error && (
            <p role="alert">
              {quote.error} <Button onClick={quote.retry}>Повторить расчёт</Button>
            </p>
          )}
          <Dates {...{ start, end, from, until, min: daysAfter(c.date, 2) }} />
          <div className="staff-pair">
            <label>
              Оклад в месяц, €
              <input
                required
                type="number"
                min=".01"
                step=".01"
                max={100000000}
                value={salary}
                onChange={(e) => pay(e.target.value)}
              />
            </label>
            <label>
              Бонус за подписание, €
              <input
                required
                type="number"
                min="0"
                step=".01"
                max={100000000}
                value={bonus}
                onChange={(e) => signing(e.target.value)}
              />
            </label>
          </div>
          <Facts
            items={[
              ['Ожидаемый оклад', money(expectation || 0)],
              [
                'Выкуп при подписании',
                quote.data?.buyout_cents != null ? money(quote.data.buyout_cents) : '—',
              ],
              ...(data.person.position === 'driver'
                ? ([
                    [
                      'Взносы на дату вступления',
                      quote.data?.support_cents != null ? money(quote.data.support_cents) : '—',
                    ],
                    [
                      'Чистый эффект в месяц',
                      quote.data?.net_cents != null ? money(quote.data.net_cents) : '—',
                    ],
                  ] as [string, string][])
                : []),
              ['Остаток организации', money(c.account.cash_cents)],
            ]}
          />
          <p className="muted">
            Ответ кандидата придёт на следующий игровой день. При согласии бонус и выкуп списываются сразу.
            Форма и оклад меняются в день вступления.
          </p>
          <Button
            primary
            type="submit"
            disabled={
              busy ||
              !quote.data ||
              !!quote.data.reason ||
              c.offers.some((o) => o.person === data.person.id && ['sent', 'countered'].includes(o.status))
            }
          >
            {busy ? 'Отправка…' : 'Отправить предложение'}
          </Button>
        </form>
      )}
    </>
  )
}
