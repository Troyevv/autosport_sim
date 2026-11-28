import { ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { RaceCar } from '../../pitwall/visuals'
import { EngineeringHeading } from '../../pitwall/EngineeringHeading'
import { initialTab, navigate, readRoute } from '../../pitwall/core/route'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Dialog, Panel, Stats } from '../../ui/components'
import { type Career, money } from '../api'
import { type SectionProps } from '../Sections'
import { useOrder } from '../finance/useOrder'
import { usePersonnel } from '../staff/model'
import { type Desk, type Product, type Case, label } from './model'
import './manufacturer.css'

const tabs = [
  ['catalog', 'Продукция'],
  ['program', 'Программы'],
  ['research', 'Исследования и разработки'],
  ['factory', 'Испытания и цех'],
  ['clients', 'Клиенты'],
  ['cases', 'Запросы'],
  ['advisors', 'Консультанты'],
  ['diagnosis', 'Диагностика'],
  ['warranty', 'Гарантия'],
  ['history', 'История'],
] as const
const num = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label>
      {name}
      {children}
    </label>
  )
}
function options(values: string[]) {
  return values.map((v) => (
    <option key={v} value={v}>
      {label(v)}
    </option>
  ))
}

function ManufacturerWork({
  action,
  product,
  specification,
  year,
  goals,
  busy,
  error,
  close,
  send,
}: {
  action: string
  product: Product
  specification: string
  year: string
  goals: string[]
  busy: boolean
  error: string
  close: () => void
  send: (payload: Record<string, string | number>) => Promise<void>
}) {
  const [goal, setGoal] = useState(goals[0] || '')
  const restricted = action === 'design' && Boolean(product.years[year]) && goal !== 'durability'
  return (
    <Dialog title={label(action) + ' · поручение специалистам'} onClose={close}>
      <form
        className="maker-body eng-work-form"
        onSubmit={(ev) => {
          ev.preventDefault()
          const values = new FormData(ev.currentTarget)
          if (busy || restricted || !goals.includes(goal)) return
          void send({
            action,
            entry: product.entry,
            axis: product.axis,
            year: Number(year),
            objective: goal,
            specification: String(values.get('edition')),
            quantity: action === 'produce' ? Number(values.get('quantity')) : 1,
          })
        }}
      >
        <header>
          <small>
            {product.series.toUpperCase()} / {year}
          </small>
          <h3>{product.title}</h3>
          <p>{label(product.axis)}</p>
        </header>
        <Field name="Редакция">
          <select name="edition" defaultValue={specification}>
            {product.editions.map((edition) => (
              <option value={edition.id} key={edition.id}>
                Ред. {edition.version} · {label(edition.status)}
              </option>
            ))}
          </select>
        </Field>
        <Field name="Техническая цель">
          <select value={goal} onChange={(ev) => setGoal(ev.target.value)}>
            {options(goals)}
          </select>
        </Field>
        {action === 'produce' && (
          <Field name="Количество в партии">
            <input type="number" name="quantity" required min={1} max={24} step={1} defaultValue={1} />
          </Field>
        )}
        {product.years[year] && <p>{product.years[year]}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <Button type="button" onClick={close} disabled={busy}>
            Назад
          </Button>
          <Button type="submit" primary disabled={busy || restricted || !goal}>
            Утвердить поручение
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function Manufacturer({
  c,
  world,
  updateCareer,
}: SectionProps & { updateCareer: (c: Career) => void }) {
  const [work, setWork] = useState('')
  const [caseKind, setCaseKind] = useState('change')
  const maker = c.role === 'manufacturer'
  const request = usePersonnel<Desk>('careers/' + c.id + '/manufacturer', c.revision)
  const orders = useOrder(c, updateCareer, 'manufacturer'),
    staff = useOrder(c, updateCareer, 'staff')
  const serviceTabs = ['clients', 'cases', 'advisors', 'warranty', 'history']
  const visibleTabs = tabs.filter(([id]) => maker || serviceTabs.includes(id))
  const tab = initialTab(visibleTabs, maker ? 'catalog' : 'clients')
  const [query, setQuery] = useState(''),
    [series, setSeries] = useState('all'),
    [priorityOpen, showPriority] = useState(false),
    [selected, setSelected] = useState(''),
    [edition, setEdition] = useState(readRoute().entity),
    [year, setYear] = useState(c.date.slice(0, 4)),
    [clientKey, setClient] = useState(''),
    [receipt, setReceipt] = useState('')
  const d = request.data
  const product =
    d?.catalog.find((p) => p.entry + p.axis === selected) ??
    d?.catalog.find((p) => p.editions.some((v) => v.id === edition)) ??
    d?.catalog.find((p) => p.series === c.series) ??
    d?.catalog[0]
  const version = product?.editions.find((v) => v.id === edition) ?? product?.editions[0]
  const visibleClients = (d?.clients || []).filter(
    (row) =>
      (series === 'all' || row.series === series) &&
      [row.name, row.car, row.entry, world.organizations[row.terms.maker]?.name, label(row.axis)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  )
  const availableClients = tab === 'clients' ? visibleClients : d?.clients || []
  const client =
    availableClients.find((r) => r.entry + r.axis === clientKey) ??
    availableClients.find((r) =>
      [r.org, r.entry, r.terms.maker, r.entry + '|' + r.axis].includes(readRoute().entity),
    ) ??
    availableClients.find((r) => r.series === c.series) ??
    availableClients[0]
  const busy = orders.busy || staff.busy,
    org = (id: string) => world.organizations[id]?.name || id
  async function submit(action: string, payload: unknown, result: string) {
    setReceipt('')
    if (await orders.send(action, payload)) setReceipt(result)
  }
  function chooseTab(v: string) {
    if (v === tab) return
    const entity = ['catalog', 'program', 'research', 'factory'].includes(v)
      ? version?.id
      : client
        ? client.entry + '|' + client.axis
        : ''
    navigate('manufacturer', v, entity || '')
  }
  const clientSelect = d && client && (
    <Field name="Клиентская заявка">
      <select value={client.entry + client.axis} onChange={(e) => setClient(e.target.value)}>
        {d.clients.map((r) => (
          <option key={r.entry + r.axis} value={r.entry + r.axis}>
            {r.name} · № {world.entries[r.entry]?.number} · {label(r.axis)}
          </option>
        ))}
      </select>
    </Field>
  )
  const productSelect = d && product && (
    <Field name="Продукт и интерфейс">
      <select
        value={product.entry + product.axis}
        onChange={(e) => {
          setSelected(e.target.value)
          setEdition('')
        }}
      >
        {d.catalog.map((p) => (
          <option key={p.entry + p.axis} value={p.entry + p.axis}>
            {label(p.axis)} · {p.series.toUpperCase()} · {p.title}
          </option>
        ))}
      </select>
    </Field>
  )
  function form(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    return Object.fromEntries(new FormData(event.currentTarget))
  }
  function caseCard(r: Case) {
    const diag = r.diagnosis
    return (
      <article className="maker-card" key={r.id}>
        <small>
          {r.date} · {org(r.client)} · {r.entry}
        </small>
        <h3>
          {label(r.kind)} · {label(r.objective)}
        </h3>
        <p>{r.message}</p>
        {r.reference && <p>Переданный протокол · {r.reference}</p>}
        <p>
          {label(r.status)}
          {r.reason && ' · ' + r.reason}
        </p>
        {r.compensation_cents && <p>{money(r.compensation_cents)}</p>}
        {tab === 'diagnosis' && diag && (
          <>
            <p>Экземпляр · {r.instance}</p>
            <dl>
              {Object.entries(diag.causes).map(([k, v]) => (
                <div key={k}>
                  <dt>{k === 'design' ? 'Конструктивный дефект' : label(k)}</dt>
                  <dd>{v.join(', ') || 'Нет подтверждения'}</dd>
                </div>
              ))}
            </dl>
            <p>Уверенность оценки · {diag.confidence}%</p>
            {diag.observations.map((f) => (
              <p key={f.reference}>
                {f.observation}
                {f.value != null && ' · ' + num(f.value) + ' ± ' + num(f.uncertainty) + ' ' + f.unit}
              </p>
            ))}
          </>
        )}
        {!!r.positions?.length && (
          <details>
            <summary>Обсуждение инженерного штаба</summary>
            {r.positions.map((p) => (
              <p key={p.name + p.stance}>
                <strong>
                  {p.name} · {p.stance}
                </strong>{' '}
                {p.argument}
              </p>
            ))}
          </details>
        )}
        {r.project && <p>Поручение · {r.project}</p>}
        {maker && r.status === 'open' && (
          <form
            onSubmit={(ev) => {
              const v = form(ev)
              void submit('maker-resolve', { case: r.id, ...v }, 'Решение записано в дело клиента.')
            }}
          >
            <Field name="Решение штаба">
              <select name="decision">
                {options([
                  'study',
                  'advise',
                  'decline',
                  ...(r.kind === 'warranty' && diag?.covered ? ['repair', 'replace', 'compensate'] : []),
                ])}
              </select>
            </Field>
            <Field name="Обоснование">
              <input name="reason" required maxLength={220} />
            </Field>
            <Button type="submit" disabled={busy}>
              Записать решение
            </Button>
          </form>
        )}
      </article>
    )
  }
  return (
    <section className="screen engineering-module maker-desk">
      <EngineeringHeading
        route="manufacturer"
        organization={world.organizations[c.org].name}
        maker={maker}
      >
        {maker ? (
          <Button disabled={!d} onClick={() => showPriority(true)}>
            <SlidersHorizontal size={16} />
            Приоритет программы
          </Button>
        ) : c.role === 'manager' ? (
          <Button onClick={() => navigate('council', 'mandate')}>
            <SlidersHorizontal size={16} />
            Делегирование
          </Button>
        ) : (
          <span>Наблюдение владельца</span>
        )}
      </EngineeringHeading>
      {priorityOpen && d && (
        <Dialog
          title="Приоритет производителя"
          onClose={() => {
            if (!busy) showPriority(false)
          }}
        >
          <form
            className="maker-body"
            onSubmit={async (ev) => {
              const payload = form(ev)
              if (await orders.send('maker-priority', payload)) {
                showPriority(false)
                setReceipt('Приоритет программы изменён.')
              }
            }}
          >
            <p>Правила применяются к новым решениям. Уже утверждённые работы сохраняются.</p>
            <Field name="Распределение программы">
              <select name="allocation" defaultValue={d.allocation}>
                {options(['balanced', 'current', 'next', 'stop-current'])}
              </select>
            </Field>
            {orders.error && <p role="alert">{orders.error}</p>}
            <Button type="submit" primary disabled={busy}>
              Сохранить приоритет
            </Button>
          </form>
        </Dialog>
      )}
      {work && d && product && version && (
        <ManufacturerWork
          key={work + product.entry + product.axis}
          action={work}
          product={product}
          specification={version.id}
          year={year}
          goals={d.targets[product.axis] || []}
          busy={busy}
          error={orders.error}
          close={() => {
            if (!busy) setWork('')
          }}
          send={async (payload) => {
            if (await orders.send('maker-work', payload)) {
              setWork('')
              setReceipt('Поручение добавлено в календарь работ.')
            }
          }}
        />
      )}
      {request.error && (
        <p role="alert">
          {request.error} <Button onClick={request.retry}>Повторить загрузку</Button>
        </p>
      )}
      {!request.error && !d && <p role="status">Загрузка инженерных дел…</p>}
      {d && (
        <>
          <nav className="eng-tabs" aria-label="Разделы инженерного штаба">
            {visibleTabs.map(([id, title]) => (
              <button
                type="button"
                key={id}
                aria-current={id === tab ? 'page' : undefined}
                onClick={() => chooseTab(id)}
              >
                {title}
              </button>
            ))}
          </nav>

          {(orders.error || staff.error) && (
            <p role="alert" className="career-error">
              {orders.error || staff.error}
            </p>
          )}
          {receipt && <p role="status">{receipt}</p>}
          {tab === 'catalog' && (
            <>
              <div className="eng-toolbar">
                {productSelect}
                {product && version && (
                  <Field name="Спецификация">
                    <select value={version.id} onChange={(e) => setEdition(e.target.value)}>
                      {product.editions.map((v) => (
                        <option key={v.id} value={v.id}>
                          Ред. {v.version} · {label(v.status)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              {product && version ? (
                <div className="eng-product-hero">
                  <div className="eng-product-left">
                    <small>
                      {org(c.org).toUpperCase()} / {product.series.toUpperCase()}
                    </small>
                    <h2>{label(product.axis)}</h2>
                    <p className="eng-product-name">{product.title}</p>
                    <div className="eng-hero-badges">
                      <span className="chip">{label(version.status)}</span>
                      <span className="chip">Редакция {version.version}</span>
                    </div>
                    <div className="eng-product-graphic">
                      <RaceCar entryId={product.entry} />
                      <small>Продуктовый интерфейс · автомобиль клиентской программы</small>
                    </div>
                    <Button primary onClick={() => chooseTab('research')}>
                      Открыть программу разработки
                    </Button>
                  </div>
                  <div className="eng-product-right">
                    <div className="eng-product-parameters">
                      <small>Паспорт редакции</small>
                      <h3>{version.title}</h3>
                      <p>
                        {version.forecast
                          ? 'Инженерный прогноз с диапазоном неопределённости'
                          : 'Номинальные параметры исходного чертежа · игровые оценки'}
                      </p>
                      <dl>
                        {Object.entries(version.values).map(([k, v]) => (
                          <div key={k}>
                            <dt>{label(k)}</dt>
                            <dd>{version.forecast?.[k]?.map(num).join(' – ') || num(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <details>
                      <summary>Расчётные режимы нагрузки</summary>
                      {version.calculations.map((row) => (
                        <section key={row.label}>
                          <h3>{row.label}</h3>
                          <dl>
                            {Object.entries(row.results).map(([k, v]) => (
                              <div key={k}>
                                <dt>{label(k)}</dt>
                                <dd>{num(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      ))}
                    </details>
                  </div>
                </div>
              ) : (
                <p>В каталоге отсутствуют чертежи для этого направления.</p>
              )}
            </>
          )}
          {['program', 'research', 'factory'].includes(tab) && (
            <div className="maker-grid">
              <Panel
                title={
                  tab === 'program'
                    ? 'Продуктовая программа'
                    : tab === 'research'
                      ? 'От вопроса к новой редакции'
                      : 'Проверка, производство, приёмка'
                }
              >
                <div className="maker-body">
                  {productSelect}
                  {product && version && (
                    <>
                      <Field name="Целевой сезон">
                        <select value={year} onChange={(e) => setYear(e.target.value)}>
                          {Object.keys(product.years).map((y) => (
                            <option key={y}>{y}</option>
                          ))}
                        </select>
                      </Field>
                      {tab === 'program' ? (
                        <>
                          <p>
                            {product.years[year] ||
                              'Разработка допускается в рамках сезонного бюллетеня.'}
                          </p>
                          <Field name="Распределение ресурсов">
                            <select
                              disabled={busy}
                              value={d.allocation}
                              onChange={(e) =>
                                void submit(
                                  'maker-priority',
                                  { allocation: e.target.value },
                                  'Приоритет общей очереди изменён.',
                                )
                              }
                            >
                              {options(['balanced', 'current', 'next', 'stop-current'])}
                            </select>
                          </Field>
                        </>
                      ) : (
                        <>
                          {product.years[year] && <p>{product.years[year]}</p>}
                          {(tab === 'research'
                            ? ['research', 'design']
                            : ['lab', 'bench', 'produce']
                          ).map((a) => (
                            <Button
                              key={a}
                              disabled={busy || !d.targets[product.axis]?.length}
                              onClick={() => {
                                orders.clear()
                                setWork(a)
                              }}
                            >
                              {label(a)}
                            </Button>
                          ))}
                          {tab === 'factory' &&
                            version.status === 'released' &&
                            d.clients.some(
                              (r) => r.entry === product.entry && r.axis === product.axis && r.equal,
                            ) && (
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  void submit(
                                    'maker-rollout',
                                    { entry: product.entry, specification: version.id },
                                    'Единая спецификация передана всем действующим клиентам.',
                                  )
                                }
                              >
                                Сменить спецификацию у всех клиентов
                              </Button>
                            )}
                          <a href="#facilities">Мощности и аренда</a>
                        </>
                      )}
                    </>
                  )}
                </div>
              </Panel>
              <Panel title="Календарь работ">
                <div className="maker-body">
                  {!d.projects.length && <p>Утверждённых поручений пока нет.</p>}
                  {d.projects
                    .filter(
                      (p) =>
                        tab === 'program' ||
                        (tab === 'factory') === ['test', 'production'].includes(p.action),
                    )
                    .map((p) => (
                      <article key={p.id} className="maker-card">
                        <small>
                          {p.year} · {label(p.axis)} · {p.entry}
                        </small>
                        <h3>
                          {label(p.action)} · {label(p.status)}
                        </h3>
                        <p>
                          {p.lead} · {p.worked} / {p.required} ч · {money(p.cost)}
                        </p>
                        <p>{p.reason || p.conclusion}</p>
                        {p.report && (
                          <p>
                            {p.report.finding || p.report.interpretation} {label(p.report.metric)} · Δ{' '}
                            {num(p.report.difference)} ± {num(p.report.uncertainty)}
                          </p>
                        )}
                        {p.disposition === 'review' &&
                          ['released', 'withdrawn'].map((v) => (
                            <Button
                              key={v}
                              disabled={busy}
                              onClick={() =>
                                void submit(
                                  'maker-review',
                                  { project: p.id, disposition: v },
                                  'Статус чертежа обновлён.',
                                )
                              }
                            >
                              {v === 'released' ? 'Выпустить редакцию' : 'Отозвать редакцию'}
                            </Button>
                          ))}
                      </article>
                    ))}
                </div>
              </Panel>
            </div>
          )}
          {tab === 'factory' && (
            <Panel title="Склад и контроль качества">
              <div className="maker-body">
                {!d.inventory.length && (
                  <p>Изготовленные экземпляры поступят сюда на контроль качества.</p>
                )}
                {d.inventory.map((i) => (
                  <article key={i.id} className="maker-card">
                    <small>
                      {i.serial} · {label(i.axis)}
                    </small>
                    <h3>{i.rejected ? 'Отклонён ОТК' : label(i.status)}</h3>
                    <p>Проверок · {i.checks}</p>
                    {i.reason && <p>{i.reason}</p>}
                    {i.decisions
                      .filter((v) => v !== 'scrap')
                      .map((v) => (
                        <Button
                          key={v}
                          disabled={busy}
                          onClick={() =>
                            void submit(
                              'maker-item',
                              { instance: i.id, decision: v },
                              'Экземпляр передан в цех.',
                            )
                          }
                        >
                          {label(v)}
                        </Button>
                      ))}
                  </article>
                ))}
              </div>
            </Panel>
          )}
          {tab === 'clients' && (
            <>
              <div className="eng-toolbar">
                <label className="maker-client-search">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Поиск по заявкам"
                    placeholder={
                      maker ? 'Найти клиента, машину или заявку' : 'Найти производителя или продукт'
                    }
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Чемпионат клиента"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                >
                  <option value="all">Все чемпионаты</option>
                  {[...new Set(d.clients.map((row) => row.series))].map((id) => (
                    <option key={id} value={id}>
                      {world.championships[id]?.name || id}
                    </option>
                  ))}
                </select>
                <span className="eng-tag">Заявок · {visibleClients.length}</span>
              </div>
              <div className="eng-clients-layout">
                <aside className="eng-client-list" aria-label="Заявки">
                  {visibleClients.map((row) => (
                    <button
                      type="button"
                      key={row.entry + row.axis}
                      className={row === client ? 'selected' : ''}
                      aria-pressed={row === client}
                      onClick={() => setClient(row.entry + row.axis)}
                    >
                      <small>
                        {row.series.toUpperCase()} · № {world.entries[row.entry]?.number}
                      </small>
                      <strong>{maker ? row.name : org(row.terms.maker)}</strong>
                      <span>
                        {row.car} · {label(row.axis)}
                      </span>
                      <div>
                        <span className="eng-tag">
                          {row.terms.support ? 'Техподдержка' : 'Без поддержки'}
                        </span>
                        <ChevronRight size={15} />
                      </div>
                    </button>
                  ))}
                </aside>
                <div className="eng-client-detail">
                  {!client && (
                    <p>
                      {d.clients.length
                        ? 'По заданным условиям заявок нет.'
                        : 'Договорные программы отсутствуют.'}
                    </p>
                  )}
                  {client && (
                    <>
                      <div className="eng-client-feature">
                        <div className="eng-client-heading">
                          <div>
                            <small>{client.series.toUpperCase()} · КЛИЕНТСКАЯ ПРОГРАММА</small>
                            <h2>{maker ? org(client.org) : org(client.terms.maker)}</h2>
                            <p>
                              {client.car} · {label(client.axis)}
                            </p>
                          </div>
                          <Button
                            onClick={() =>
                              navigate(
                                'organization',
                                'overview',
                                maker ? client.org : client.terms.maker,
                              )
                            }
                          >
                            Организация
                          </Button>
                        </div>
                        <div className="eng-client-car">
                          <RaceCar entryId={client.entry} />
                        </div>
                        <div className="eng-client-rights">
                          <div>
                            <strong>
                              {client.terms.support ? 'Поддержка включена' : 'Поддержка не включена'}
                            </strong>
                            <span>По действующему договору</span>
                          </div>
                          <div>
                            <strong>{label(client.terms.partnership)}</strong>
                            <span>
                              {client.equal
                                ? 'Единая спецификация для клиентов'
                                : 'Разрешены совместимые омологированные поколения'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <a href="#commercial?tab=supplies">Договоры поставки и спонсорства</a>
                      {maker && (
                        <>
                          <h3>Передача со склада</h3>
                          {!client.stock.length && <p>Готовых к поставке экземпляров пока нет.</p>}
                          {client.stock.map((i) => (
                            <Button
                              key={i}
                              disabled={busy}
                              onClick={() =>
                                void submit(
                                  'maker-deliver',
                                  { entry: client.entry, instance: i },
                                  'Экземпляр передан на склад клиента.',
                                )
                              }
                            >
                              Передать {d.inventory.find((item) => item.id === i)?.serial ?? i}
                            </Button>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {['cases', 'diagnosis', 'warranty'].includes(tab) && (
            <Panel
              title={
                tab === 'warranty'
                  ? 'Ответственность по фактам'
                  : tab === 'diagnosis'
                    ? 'Что известно о причине'
                    : 'Обращения технической службы'
              }
            >
              <div className="maker-body">
                {c.role === 'manager' && client && (
                  <form
                    onSubmit={(ev) => {
                      const v = form(ev)
                      void submit(
                        'maker-request',
                        { entry: client.entry, axis: client.axis, ...v },
                        'Обращение передано производителю.',
                      )
                    }}
                  >
                    {clientSelect}
                    <Field name="Вид обращения">
                      <select
                        name="kind"
                        value={tab === 'warranty' ? 'warranty' : caseKind}
                        onChange={(e) => setCaseKind(e.target.value)}
                      >
                        {options(
                          tab === 'warranty'
                            ? ['warranty']
                            : ['change', 'next', 'consult', 'problem', 'warranty', 'data'],
                        )}
                      </select>
                    </Field>
                    {tab !== 'warranty' && caseKind === 'data' && (
                      <Field name="Разрешённый протокол">
                        <select name="reference" required key={client.entry + client.axis}>
                          {!client.shareable.length && (
                            <option value="">Нет доступных измерений по договору</option>
                          )}
                          {client.shareable.map((f) => (
                            <option key={f.reference} value={f.reference}>
                              {f.day} · {f.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field name="Приоритет клиента">
                      <select name="objective">{options(d.targets[client.axis])}</select>
                    </Field>
                    <Field name="Сообщение инженерам">
                      <input required name="message" maxLength={220} />
                    </Field>
                    <Button type="submit" primary disabled={busy}>
                      Передать запрос
                    </Button>
                  </form>
                )}
                {d.cases.filter((r) => tab !== 'warranty' || r.kind === 'warranty').map(caseCard)}
                {!d.cases.some((r) => tab !== 'warranty' || r.kind === 'warranty') && (
                  <p>По выбранным условиям обращений пока нет.</p>
                )}
              </div>
            </Panel>
          )}
          {tab === 'advisors' && (
            <Panel title="Назначения консультантов">
              <div className="maker-body">
                {d.advisor && client && (
                  <form
                    onSubmit={async (ev) => {
                      const v = form(ev)
                      if (
                        await staff.send('advisor-assign', {
                          seat: d.advisor!.seat,
                          entry: client.entry,
                          product: client.axis,
                          ...v,
                        })
                      )
                        setReceipt('Назначение зарегистрировано.')
                    }}
                  >
                    <h3>{d.advisor.name}</h3>
                    {clientSelect}
                    <Field name="Начало назначения">
                      <input name="start" type="date" required defaultValue={c.date} min={c.date} />
                    </Field>
                    <Field name="Окончание назначения">
                      <input name="end" required type="date" min={c.date} />
                    </Field>
                    <Button type="submit" disabled={busy}>
                      Назначить консультанта
                    </Button>
                  </form>
                )}
                {d.assignments.map((a) => (
                  <article className="maker-card" key={a.name + a.start}>
                    <h3>
                      {a.name} · {org(a.client)}
                    </h3>
                    <p>
                      {a.start} — {a.end} · {a.load}%
                    </p>
                    <p>{a.channels.map(label).join(' · ')}</p>
                  </article>
                ))}
                {!d.assignments.length && (
                  <p>Действующие и архивные назначения появятся после согласования поддержки.</p>
                )}
              </div>
            </Panel>
          )}
          {tab === 'history' && (
            <Panel title="История технического сотрудничества">
              <div className="maker-body">
                {d.history.map((h) => (
                  <article key={h.instance}>
                    <h3>
                      {org(h.client)} · {h.date}
                    </h3>
                    <p>
                      {h.instance} · {h.contract}
                    </p>
                  </article>
                ))}
                {d.cases.filter((r) => r.status !== 'open').map(caseCard)}
                {!d.history.length && !d.cases.some((r) => r.status !== 'open') && (
                  <p>Завершённых поставок и решений по обращениям пока нет.</p>
                )}
              </div>
            </Panel>
          )}
          <details className="eng-summary-details">
            <summary>Показатели отдела</summary>{' '}
            <Stats
              items={[
                [
                  maker ? 'Клиентские команды' : 'Поставщики',
                  new Set(d.clients.map((r) => (maker ? r.org : r.terms.maker))).size,
                  'Действующие связи',
                ],
                [
                  'Поручения',
                  d.projects.filter((p) => p.status !== 'complete').length,
                  'В очереди и в работе',
                ],
                ['Обращения', d.cases.filter((r) => r.status === 'open').length, 'Ожидают решения'],
              ]}
            />
          </details>
        </>
      )}
    </section>
  )
}
