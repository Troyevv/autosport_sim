import { useRef, useState, type CSSProperties } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Search, Users } from 'lucide-react'
import { Button, Choices, Dialog, Header, Panel, Table } from '../../ui/components'
import { api, ApiError, explain, money, post, type Career } from '../api'
import { Portrait } from '../Portrait'
import type { SectionProps } from '../Sections'
import { StaffFile } from './StaffFile'
import { seatName, shortDate, statuses, usePersonnel, type Candidate, type Order } from './model'
import { GroupWork } from './Teamwork'
import { Programs } from './Programs'
import './staff.css'

const views = [
  ['roster', 'Состав'],
  ['market', 'Кадровый рынок'],
  ['offers', 'Переговоры'],
  ['groups', 'Коллективы'],
  ['programs', 'Руководство'],
] as const
export function People({
  c,
  world,
  media,
  updateCareer,
}: SectionProps & { updateCareer: (career: Career) => void }) {
  const [tab, setTab] = useState<(typeof views)[number][0]>('roster')
  const [query, search] = useState(''),
    [position, profession] = useState(''),
    [series, program] = useState('')
  const [free, availability] = useState(false),
    [page, paginate] = useState(0)
  const [selected, select] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [ranking, rank] = useState('rating')
  const [confirm, setConfirm] = useState('')
  const opener = useRef<HTMLButtonElement>(null)
  const lock = useRef(false),
    retry = useRef({ key: '', id: '' })
  const base = 'careers/' + c.id
  const directory = usePersonnel<Candidate[]>(base + '/personnel', c.revision)
  const people = directory.data || []
  const pool = people.filter((p) => tab === 'market' || p.org === c.org)
  const matching = pool
    .filter(
      (p) =>
        (!position || p.position === position) &&
        (!series || p.programs.includes(series)) &&
        (!free || !p.org) &&
        (
          p.name +
          ' ' +
          world.positions[p.position].name +
          ' ' +
          (p.org ? world.organizations[p.org].name : '')
        )
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.position === 'driver') - Number(a.position === 'driver') ||
        (tab === 'market' && ranking === 'fit'
          ? b.fit - a.fit
          : tab === 'market' && ranking === 'net'
            ? (b.financial?.net_cents ?? 0) - (a.financial?.net_cents ?? 0)
            : 0) ||
        b.rating - a.rating ||
        a.name.localeCompare(b.name),
    )
  const last = Math.max(0, Math.ceil(matching.length / 12) - 1),
    current = Math.min(page, last)
  const employee = people.find((p) => p.id === selected)
  const order: Order = async (action, args) => {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    setError('')
    const key = JSON.stringify([c.revision, action, args])
    if (retry.current.key !== key) retry.current = { key, id: crypto.randomUUID() }
    try {
      updateCareer(
        await api<Career>(
          base + '/commands',
          post({ action, revision: c.revision, command_id: retry.current.id, staff: args }),
        ),
      )
      retry.current.key = ''
      return true
    } catch (e) {
      setError(explain(e))
      if (e instanceof ApiError && e.status === 409) {
        try {
          updateCareer(await api<Career>(base))
        } catch {
          setError('Не удалось обновить карьеру. Проверьте соединение.')
        }
      }
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const offer = c.offers.find((o) => o.id === confirm)
  function changeTab(v: typeof tab) {
    setTab(v)
    paginate(0)
    availability(false)
    profession('')
    program('')
    search('')
    setError('')
  }
  return (
    <section className="screen staff-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Пилоты и персонал"
        sub="Состав организации, развитие сотрудников и контрактные решения."
      />
      <div className="staff-summary">
        <div>
          <Users />
          <span>
            Места в штате
            <strong>
              {c.assignments.filter((a) => a.occupant).length} / {c.assignments.length}
            </strong>
          </span>
        </div>
        <div>
          <span>
            Фонд оплаты в месяц<strong>{money(c.account.payroll_cents)}</strong>
          </span>
        </div>
        <div>
          <span>
            Открытые переговоры
            <strong>{c.offers.filter((o) => ['sent', 'countered'].includes(o.status)).length}</strong>
          </span>
        </div>
      </div>
      <Choices
        items={views.filter(([id]) => id !== 'programs' || c.mandate)}
        active={tab}
        onChange={changeTab}
        label="Кадровый центр"
      />
      {error && !selected && !confirm && (
        <p className="career-error" role="alert">
          {error}
        </p>
      )}
      {tab === 'programs' && (
        <Programs
          {...{ c, world, busy, order }}
          openPerson={(id) => {
            if (document.activeElement instanceof HTMLButtonElement) opener.current = document.activeElement
            select(id)
            setError('')
          }}
        />
      )}
      {directory.error && (
        <p role="alert">
          {directory.error} <Button onClick={directory.retry}>Повторить загрузку</Button>
        </p>
      )}
      {(tab === 'roster' || tab === 'market') && (
        <>
          <div className="staff-filters">
            <label className="staff-search">
              <Search size={17} />
              <input
                type="search"
                aria-label="Найти человека"
                placeholder="Имя, должность или организация"
                value={query}
                onChange={(e) => {
                  search(e.target.value)
                  paginate(0)
                }}
              />
            </label>
            <select
              aria-label="Профессия"
              value={position}
              onChange={(e) => {
                profession(e.target.value)
                paginate(0)
              }}
            >
              <option value="">Все профессии</option>
              {Object.entries(world.positions)
                .filter(([id]) => pool.some((p) => p.position === id))
                .map(([id, v]) => (
                  <option key={id} value={id}>
                    {v.name}
                  </option>
                ))}
            </select>
            <select
              aria-label="Чемпионат"
              value={series}
              onChange={(e) => {
                program(e.target.value)
                paginate(0)
              }}
            >
              <option value="">Все чемпионаты</option>
              {Object.values(world.championships).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {tab === 'market' && (
              <label className="staff-check">
                <input
                  type="checkbox"
                  checked={free}
                  onChange={(e) => {
                    availability(e.target.checked)
                    paginate(0)
                  }}
                />
                Свободные агенты
              </label>
            )}
          </div>
          <div className="staff-listhead">
            <h2>{tab === 'market' ? 'Кандидаты' : 'Люди организации'}</h2>
            <span>{matching.length} чел.</span>
            {tab === 'market' && (
              <select
                aria-label="Сортировка рынка"
                value={ranking}
                onChange={(e) => {
                  rank(e.target.value)
                  paginate(0)
                }}
              >
                <option value="rating">По спортивному рейтингу</option>
                <option value="net">По чистому эффекту</option>
                {c.mandate && <option value="fit">По предпочтению менеджера</option>}
              </select>
            )}
          </div>
          <div className="staff-grid">
            {matching.slice(current * 12, current * 12 + 12).map((p) => (
              <button
                key={p.id}
                className="staff-card"
                style={{ '--kit': p.org ? world.organizations[p.org].color : '#777' } as CSSProperties}
                onClick={(e) => {
                  opener.current = e.currentTarget
                  select(p.id)
                  setError('')
                }}
              >
                <div className="staff-photo">
                  <Portrait
                    person={p}
                    org={p.org}
                    color={p.org ? world.organizations[p.org].color : '#888888'}
                    driver={p.position === 'driver'}
                    media={media}
                  />
                </div>
                <div className="staff-card-copy">
                  <small>{world.positions[p.position].name}</small>
                  <strong>{p.name}</strong>
                  <span>{p.org ? world.organizations[p.org].name : 'Свободный агент'}</span>
                </div>
                <div className="staff-score">
                  <b>{p.rating}</b>
                  <small>рейтинг</small>
                </div>
                {tab === 'market' && p.financial && (
                  <div className="staff-money">
                    <span>
                      Поддержка <b>{money(p.financial.support_cents)}</b>
                    </span>
                    <span>
                      Баланс в месяц <b>{money(p.financial.net_cents)}</b>
                    </span>
                  </div>
                )}
                <div className="staff-card-foot">
                  <span>
                    {p.specialty} <b>{p.strength}</b>
                  </span>
                  <ArrowUpRight size={15} />
                </div>
              </button>
            ))}
          </div>
          {!directory.data && !directory.error && <p role="status">Загружаем состав…</p>}
          {directory.data && !matching.length && (
            <div className="empty-state">По этим условиям сотрудников нет.</div>
          )}
          {last > 0 && (
            <div className="staff-pages">
              <Button
                disabled={!current}
                onClick={() => paginate(current - 1)}
                aria-label="Предыдущая страница"
              >
                <ChevronLeft size={16} />
              </Button>
              {current + 1} / {last + 1}
              <Button
                disabled={current === last}
                onClick={() => paginate(current + 1)}
                aria-label="Следующая страница"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
          {tab === 'roster' && c.assignments.some((a) => !a.occupant) && (
            <Panel title="Вакантные места">
              {c.assignments
                .filter((a) => !a.occupant)
                .map((a) => (
                  <div className="result" key={a.id}>
                    <span>{seatName(a.id, c, world)}</span>
                    <Button
                      onClick={() => {
                        changeTab('market')
                        profession(a.position)
                      }}
                    >
                      Найти кандидата
                    </Button>
                  </div>
                ))}
            </Panel>
          )}
        </>
      )}
      {tab === 'groups' && (
        <Panel title="Инженерные подразделения и бригады">
          <Table
            label="Коллективы организации"
            columns={[
              'Подразделение',
              'Человек',
              'Квалификация',
              'Нагрузка',
              'Усталость',
              'Резерв, чел.-дн./день',
              'ФОТ / месяц',
            ]}
            rows={c.collectives.map((g) => ({
              id: g.id,
              cells: [
                g.name,
                g.size,
                g.qualification,
                g.workload + '%',
                g.fatigue + '%',
                (g.capacity / 100).toLocaleString('ru-RU'),
                money(g.payroll_cents),
              ],
            }))}
          />
        </Panel>
      )}
      {tab === 'groups' && <GroupWork groups={c.collectives} />}
      {tab === 'offers' && (
        <div className="section-grid">
          <Panel title="Предложения">
            {!c.offers.length && (
              <p className="panel-body muted">
                Переговоров пока нет. Выберите сотрудника на кадровом рынке и предложите условия.
              </p>
            )}
            {c.offers
              .slice()
              .reverse()
              .map((o) => (
                <article className="staff-offer" key={o.id}>
                  <small>{statuses[o.status]}</small>
                  <h3>{people.find((p) => p.id === o.person)?.name || world.names[o.person]}</h3>
                  <p>
                    {seatName(o.seat, c, world)} · {money(o.salary_cents)} / мес.
                  </p>
                  <p>
                    {shortDate(o.start)} — {shortDate(o.end)} · бонус {money(o.bonus_cents)}
                  </p>
                  <p>{o.message}</p>
                  {o.status === 'sent' && <strong>Ответ {shortDate(o.response)}</strong>}
                  {o.status === 'countered' && <strong>Ответьте до {shortDate(o.deadline)}</strong>}
                  {['countered', 'sent'].includes(o.status) && (
                    <div className="form-actions">
                      {o.status === 'countered' && (
                        <Button primary disabled={busy} onClick={() => setConfirm(o.id)}>
                          Рассмотреть условия
                        </Button>
                      )}
                      <Button disabled={busy} onClick={() => order('offer-withdraw', { offer: o.id })}>
                        Отозвать
                      </Button>
                    </div>
                  )}
                </article>
              ))}
          </Panel>
          <Panel title="Кадровые сообщения">
            {c.notices
              .slice()
              .reverse()
              .map((n, i) => (
                <div className="result" key={i}>
                  <span>
                    <small>{shortDate(n.date)}</small>
                    {n.text}
                  </span>
                </div>
              ))}
            {!c.notices.length && <p className="panel-body muted">Новых сообщений нет.</p>}
          </Panel>
        </div>
      )}
      {offer && (
        <Dialog title="Подтвердить договор" onClose={() => setConfirm('')}>
          <p>
            {world.names[offer.person]} · {money(offer.salary_cents)} / мес. Бонус {money(offer.bonus_cents)}.
            Выкуп действующих договоров {money(offer.buyout_cents)} при подписании.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <Button onClick={() => setConfirm('')}>Назад</Button>
            <Button
              primary
              disabled={busy}
              onClick={async () => {
                if (await order('offer-accept', { offer: offer.id })) setConfirm('')
              }}
            >
              Подписать договор
            </Button>
          </div>
        </Dialog>
      )}
      {employee && (
        <StaffFile
          key={employee.id}
          {...{ employee, people, c, world, media, order, busy, error }}
          onClose={() => {
            select('')
            setError('')
            requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
          }}
          onSent={() => {
            select('')
            changeTab('offers')
          }}
        />
      )}
    </section>
  )
}
