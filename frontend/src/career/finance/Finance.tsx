import { CashChart } from '../../pitwall/BusinessVisuals'
import { initialTab } from '../../pitwall/core/route'
import { useRef, useState, type FormEvent } from 'react'
import { Download, ArrowLeftRight, BadgeEuro, CalendarClock, Wallet } from 'lucide-react'
import { Button, Choices, Dialog, Facts, Header, Panel, Stats, Table } from '../../ui/components'
import { dateLabel, millions } from '../../game'
import { api, ApiError, explain, money, post, type Career } from '../api'
import type { SectionProps } from '../Sections'
import { usePersonnel } from '../staff/model'
import { category, type Statement } from './model'
import './finance.css'

const views = [
  ['overview', 'Обзор'],
  ['results', 'Доходы и расходы'],
  ['journal', 'Денежные операции'],
  ['terms', 'Обязательства'],
  ['forecast', 'Прогноз'],
  ['report', 'Финансовый отчёт'],
] as const
const headlineMoney = (cents: number) => (Math.abs(cents) < 10000000 ? money(cents) : millions(cents))
const dateText = (day: string) => dateLabel(day, true)
export function Finance({
  c,
  world,
  updateCareer,
}: SectionProps & { updateCareer: (c: Career) => void }) {
  const [tab, selectTab] = useState<(typeof views)[number][0]>(() => initialTab(views, 'overview'))
  const [scope, setScope] = useState(c.org)
  const [dialog, open] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [source, setSource] = useState(''),
    [from, setFrom] = useState(''),
    [until, setUntil] = useState('')
  const [payer, setPayer] = useState(c.org),
    [recipient, setRecipient] = useState(c.org + ':' + c.series)
  const retry = useRef({ key: '', id: '' }),
    lock = useRef(false)
  const base = 'careers/' + c.id
  const report = usePersonnel<Statement>(
    base + '/finance?scope=' + encodeURIComponent(scope) + '&revision=' + c.revision,
    c.revision,
  )
  const data = report.data
  const name = (id: string) => {
    if (id === 'person:player') return 'Личный капитал · ' + c.name
    if (id === 'consolidated') return 'Группа · консолидация'
    if (id.startsWith('academy:')) return c.academies.find((a) => a.id === id.slice(8))?.name ?? id
    if (id.startsWith('group:')) return 'Счёт группы'
    if (id.startsWith('owner:')) return 'Капитал собственника'
    if (id === c.org) return world.organizations[c.org].name
    return world.championships[id.slice(c.org.length + 1)]?.name ?? id
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (lock.current) return
    const fields = new FormData(e.currentTarget)
    const amount = Math.round(Number(fields.get('amount')) * 100)
    const finance =
      dialog === 'transfer'
        ? { payer, recipient, amount_cents: amount }
        : dialog === 'reserve'
          ? { account: payer, amount_cents: amount }
          : { person: fields.get('person') }
    const action = 'finance-' + dialog,
      key = JSON.stringify([action, finance, c.revision])
    if (retry.current.key !== key) retry.current = { key, id: crypto.randomUUID() }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      updateCareer(
        await api<Career>(
          base + '/commands',
          post({ revision: c.revision, command_id: retry.current.id, action, finance }),
        ),
      )
      open('')
    } catch (err) {
      setError(explain(err))
      if (err instanceof ApiError && err.status === 409) {
        try {
          updateCareer(await api<Career>(base))
        } catch {
          setError('Не удалось обновить карьеру.')
        }
      }
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const show = (value: string) => {
    setError('')
    open(value)
  }
  const journal = (data?.journal ?? [])
    .filter(
      (p) =>
        (!source || p.source === source) && (!from || p.date >= from) && (!until || p.date <= until),
    )
    .slice()
    .reverse()
  const [journalPage, setJournalPage] = useState(0)
  const lastPage = Math.max(0, Math.ceil(journal.length / 40) - 1),
    page = Math.min(lastPage, journalPage)
  const forecast = data?.forecast ?? []
  const journalTable = (rows: Statement['journal']) => (
    <Table
      label="Проводки"
      columns={['Дата', 'Основание', 'Контур', 'Сумма']}
      rows={rows.map((p) => ({
        id: p.org + p.key,
        cells: [dateText(p.date), category(p.source), name(p.org), money(p.delta_cents)],
      }))}
    />
  )
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Финансы"
        sub={'Отчётная дата · ' + dateText(c.date)}
      >
        <a
          className="btn"
          download
          href={'/api/' + base + '/finance/report.csv?scope=' + encodeURIComponent(scope)}
        >
          <Download size={16} />
          Выгрузить отчёт
        </a>
      </Header>
      <div className="finance-tools">
        <label>
          Финансовый контур
          <select
            aria-label="Финансовый контур"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {(data?.scopes ?? [scope]).map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {report.error && (
        <p role="alert">
          {report.error} <Button onClick={report.retry}>Повторить</Button>
        </p>
      )}
      {!data && !report.error && <p role="status">Загрузка финансового отчёта…</p>}
      {data && (
        <>
          <Choices label="Финансовые разделы" active={tab} items={views} onChange={selectTab} />
          {tab === 'overview' && (
            <>
              <div className="finance-command">
                <section className="cash-hero">
                  <span className="eyebrow">
                    {scope === 'person:player' ? 'Личные средства' : 'Денежная позиция'}
                  </span>
                  <h2>{headlineMoney(data.cash_cents)}</h2>
                  <span className="cash-precise">{money(data.cash_cents)}</span>
                  <div className="cash-rule" />
                  <Facts
                    items={[
                      ['Доступно сейчас', money(data.available_cents)],
                      ['Резерв обязательств', money(data.reserve_cents)],
                      ['Просрочено', money(data.overdue_cents)],
                    ]}
                  />
                  <p>{data.recommendation}</p>
                </section>
                <CashChart forecast={forecast} />
              </div>
              <Stats
                items={[
                  [
                    'Доступные средства',
                    headlineMoney(data.available_cents),
                    money(data.available_cents),
                    <Wallet />,
                  ],
                  [
                    'Фактический остаток',
                    headlineMoney(data.cash_cents),
                    money(data.cash_cents),
                    <BadgeEuro />,
                  ],
                  [
                    'Резерв',
                    headlineMoney(data.reserve_cents),
                    money(data.reserve_cents),
                    <CalendarClock />,
                  ],
                  [
                    'Денежный поток',
                    headlineMoney(data.cash_flow_cents),
                    'С начала учёта',
                    <ArrowLeftRight />,
                  ],
                ]}
              />
              <div className="section-grid">
                <Panel title="Сводка">
                  <Facts
                    items={[
                      ['Средства на начало', money(data.opening_cents)],
                      ['Начисленные доходы', money(data.income_cents)],
                      ['Начисленные расходы', money(data.expense_cents)],
                      ['Просрочено к оплате', money(data.overdue_cents)],
                    ]}
                  />
                  <div className="finance-actions">
                    <Button onClick={() => show('transfer')}>Перевести средства</Button>
                    <Button onClick={() => show('reserve')}>Изменить резерв</Button>
                  </div>
                </Panel>
              </div>
              <Panel title="Последние операции">{journalTable(data.journal.slice(-5).reverse())}</Panel>
            </>
          )}
          {tab === 'results' && (
            <Panel title="Операционные статьи">
              {Object.keys(data.breakdown).length ? (
                <Table
                  label="Начисления по статьям"
                  columns={['Статья', 'Доходы', 'Расходы', 'Результат']}
                  rows={Object.entries(data.breakdown).map(([k, r]) => ({
                    id: k,
                    cells: [
                      category(k),
                      money(r.income_cents),
                      money(r.expense_cents),
                      money(r.income_cents - r.expense_cents),
                    ],
                  }))}
                />
              ) : (
                <p className="panel-body">На выбранном счёте ещё нет доходов и расходов.</p>
              )}
            </Panel>
          )}
          {tab === 'journal' && (
            <Panel title="Журнал операций">
              <div className="finance-tools">
                <label>
                  Основание
                  <select
                    aria-label="Основание"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Все операции</option>
                    {[...new Set(data.journal.map((p) => p.source))].map((id) => (
                      <option value={id} key={id}>
                        {category(id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  С даты
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label>
                  По дату
                  <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                </label>
              </div>
              {journal.length ? (
                <>
                  {journalTable(journal.slice(page * 40, page * 40 + 40))}
                  {lastPage > 0 && (
                    <div className="finance-actions">
                      <Button disabled={!page} onClick={() => setJournalPage(page - 1)}>
                        Назад
                      </Button>
                      <span>
                        {page + 1} / {lastPage + 1}
                      </span>
                      <Button disabled={page === lastPage} onClick={() => setJournalPage(page + 1)}>
                        Далее
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="panel-body muted">За выбранный период проводок нет.</p>
              )}
            </Panel>
          )}
          {tab === 'terms' && (
            <Panel title="Платёжный календарь">
              {data.obligations.length ? (
                <Table
                  label="Обязательства"
                  columns={['Срок', 'Основание', 'Сумма', 'Состояние']}
                  rows={data.obligations.map((r) => ({
                    id: r.id,
                    cells: [
                      dateText(r.due),
                      category(r.category),
                      money(r.amount_cents),
                      r.overdue ? 'Просрочено' : 'По графику',
                    ],
                  }))}
                />
              ) : (
                <p className="panel-body muted">Обязательств по этому контуру нет.</p>
              )}
            </Panel>
          )}
          {tab === 'forecast' && (
            <>
              <Panel title="Сценарии движения средств">
                <Table
                  label="Прогнозы"
                  columns={['Дата', 'Негативный', 'Базовый', 'Оптимистичный']}
                  rows={forecast.map((r) => ({
                    id: r.date,
                    cells: [
                      dateText(r.date),
                      money(r.negative_cents),
                      money(r.base_cents),
                      money(r.optimistic_cents),
                    ],
                  }))}
                />
              </Panel>
              <Panel
                title="Допущения прогноза"
                action={<Button onClick={() => show('officer')}>Назначить ответственного</Button>}
              >
                <Facts
                  items={[
                    ['Финансовый директор', data.officer?.name ?? 'Не назначен'],
                    ['Рекомендация', data.recommendation],
                    ['Разброс по персоналу и финансированию мест', '±' + data.width + '%'],
                    [
                      'Первый прогнозируемый дефицит',
                      forecast.find((r) => r.base_cents < 0)?.date ??
                        'Средств достаточно на горизонте прогноза',
                    ],
                  ]}
                />
                <p className="panel-body muted">
                  Базовый сценарий учитывает даты действующих контрактов, зарплаты коллективов и сроки
                  платежей. Действующая дистрибуция оценивается по полученным роялти, содержание объектов
                  — по расходам на обслуживание.
                </p>
              </Panel>
            </>
          )}
          {tab === 'report' && (
            <div className="section-grid">
              <Panel title="Доходы и расходы">
                <Facts items={Object.entries(data.activity).map(([k, v]) => [category(k), money(v)])} />
                {!Object.keys(data.activity).length && (
                  <p className="panel-body muted">Операционной деятельности пока нет.</p>
                )}
              </Panel>
              <Panel title="Финансовый результат">
                <Facts
                  items={[
                    ['Доходы', money(data.income_cents)],
                    ['Расходы', money(data.expense_cents)],
                    ['Прибыль', money(data.profit_cents)],
                    ['Деньги и чистые начисленные требования', money(data.net_financial_assets_cents)],
                    ['Изменение денежных средств', money(data.cash_flow_cents)],
                  ]}
                />
              </Panel>
            </div>
          )}
          {tab === 'report' && (Object.keys(data.contracts).length > 0 || data.in_kind.length > 0) && (
            <div className="section-grid">
              <Panel title="Результат по договорам">
                <Facts items={Object.entries(data.contracts).map(([id, v]) => [id, money(v)])} />
              </Panel>
              <Panel title="Техническая помощь в натуральной форме">
                {data.in_kind.map((r) => (
                  <p className="panel-body" key={r.reference}>
                    {r.description} · оценка {money(r.estimated_cents)}
                  </p>
                ))}
              </Panel>
            </div>
          )}
          {dialog && (
            <Dialog
              title={
                dialog === 'transfer'
                  ? 'Перевод между счетами'
                  : dialog === 'reserve'
                    ? 'Резерв средств'
                    : 'Финансовый директор'
              }
              onClose={() => {
                if (!lock.current) open('')
              }}
            >
              <form className="finance-form" onSubmit={submit}>
                {dialog === 'officer' ? (
                  <label>
                    Сотрудник
                    <select required name="person" defaultValue={data.officer?.id ?? ''}>
                      <option value="" disabled>
                        Выберите сотрудника
                      </option>
                      {data.candidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.skill}/100
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <>
                    <label>
                      {dialog === 'transfer' ? 'Со счёта' : 'Счёт'}
                      <select value={payer} onChange={(e) => setPayer(e.target.value)}>
                        {data.accounts.map((a) => (
                          <option key={a} value={a}>
                            {name(a)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {dialog === 'transfer' && (
                      <label>
                        На счёт
                        <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                          {data.accounts.map((a) => (
                            <option key={a} value={a}>
                              {name(a)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Сумма, EUR
                      <input
                        key={payer + dialog}
                        required
                        name="amount"
                        type="number"
                        inputMode="decimal"
                        min={dialog === 'transfer' ? '0.01' : '0'}
                        max="100000000000"
                        step="0.01"
                        defaultValue={
                          dialog === 'reserve' ? (data.reserves[payer] ?? 0) / 100 : undefined
                        }
                      />
                    </label>
                  </>
                )}
                {error && <p role="alert">{error}</p>}
                <Button
                  primary
                  type="submit"
                  disabled={busy || (dialog === 'transfer' && payer === recipient)}
                >
                  {busy ? 'Сохранение…' : 'Подтвердить'}
                </Button>
              </form>
            </Dialog>
          )}
        </>
      )}
    </section>
  )
}
