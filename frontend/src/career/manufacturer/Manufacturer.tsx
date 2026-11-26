import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Choices, Header, Panel, Stats } from '../../ui/components'
import { type Career, money } from '../api'
import { type SectionProps } from '../Sections'
import { useOrder } from '../finance/useOrder'
import { usePersonnel } from '../staff/model'
import { type Desk, type Case, label } from './model'
import './manufacturer.css'

const tabs = [
  ['catalog', 'Каталог'],
  ['program', 'Программы'],
  ['research', 'Исследования и разработки'],
  ['factory', 'Испытания и производство'],
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

export function Manufacturer({
  c,
  world,
  updateCareer,
}: SectionProps & { updateCareer: (c: Career) => void }) {
  const maker = c.role === 'manufacturer'
  const request = usePersonnel<Desk>('careers/' + c.id + '/manufacturer', c.revision)
  const orders = useOrder(c, updateCareer, 'manufacturer'),
    staff = useOrder(c, updateCareer, 'staff')
  const [tab, setTab] = useState(maker ? 'catalog' : 'clients'),
    [selected, setSelected] = useState(''),
    [edition, setEdition] = useState(''),
    [year, setYear] = useState(c.date.slice(0, 4)),
    [target, setTarget] = useState('output'),
    [clientKey, setClient] = useState(''),
    [receipt, setReceipt] = useState('')
  const d = request.data
  const product =
    d?.catalog.find((p) => p.entry + p.axis === selected) ??
    d?.catalog.find((p) => p.series === c.series) ??
    d?.catalog[0]
  const version = product?.editions.find((v) => v.id === edition) ?? product?.editions[0]
  const client =
    d?.clients.find((r) => r.entry + r.axis === clientKey) ??
    d?.clients.find((r) => r.series === c.series) ??
    d?.clients[0]
  const busy = orders.busy || staff.busy,
    org = (id: string) => world.organizations[id]?.name || id
  async function submit(action: string, payload: unknown, result: string) {
    setReceipt('')
    if (await orders.send(action, payload)) setReceipt(result)
  }
  function chooseTab(v: string) {
    setTab(v)
    setReceipt('')
    orders.clear()
    staff.clear()
  }
  const clientSelect = d && client && (
    <Field name="Клиентская заявка">
      <select value={client.entry + client.axis} onChange={(e) => setClient(e.target.value)}>
        {d.clients.map((r) => (
          <option key={r.entry + r.axis} value={r.entry + r.axis}>
            {r.name} · {r.entry} · {label(r.axis)}
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
          setTarget('output')
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
                {f.observation} · {f.value} ± {f.uncertainty} {f.unit}
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
    <section className="screen maker-desk">
      <Header
        section={org(c.org) + ' / Техническая служба'}
        title={maker ? 'Инженерный центр производителя' : 'Техническое сотрудничество'}
        sub="Спецификации, обязательства перед командами и решения инженерного штаба."
      />
      {request.error && (
        <p role="alert">
          {request.error} <Button onClick={request.retry}>Повторить загрузку</Button>
        </p>
      )}
      {!request.error && !d && <p role="status">Загрузка инженерных дел…</p>}
      {d && (
        <>
          <Stats
            items={[
              [
                maker ? 'Клиентские команды' : 'Поставщики',
                new Set(d.clients.map((r) => (maker ? r.org : r.terms.maker))).size,
                'Действующие связи',
              ],
              ['Поручения', d.projects.filter((p) => p.status !== 'complete').length, 'В очереди и в работе'],
              ['Обращения', d.cases.filter((r) => r.status === 'open').length, 'Ожидают решения'],
            ]}
          />
          <Choices
            label="Разделы технической службы"
            active={tab}
            onChange={chooseTab}
            items={tabs.filter(
              ([v]) => maker || ['clients', 'cases', 'advisors', 'warranty', 'history'].includes(v),
            )}
          />
          {(orders.error || staff.error) && (
            <p role="alert" className="career-error">
              {orders.error || staff.error}
            </p>
          )}
          {receipt && <p role="status">{receipt}</p>}
          {tab === 'catalog' && (
            <Panel title="Каталог продукции">
              <div className="maker-body">
                {productSelect}
                {product && version ? (
                  <>
                    <Field name="Спецификация">
                      <select value={version.id} onChange={(e) => setEdition(e.target.value)}>
                        {product.editions.map((v) => (
                          <option key={v.id} value={v.id}>
                            Ред. {v.version} · {label(v.status)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <h3>
                      {product.title} · {version.title}
                    </h3>
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
                  </>
                ) : (
                  <p>В каталоге отсутствуют чертежи для этого направления.</p>
                )}
              </div>
            </Panel>
          )}
          {['program', 'research', 'factory'].includes(tab) && (
            <div className="maker-grid">
              <Panel title={tab === 'program' ? 'Технические программы' : 'Поручение специалистам'}>
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
                            {product.years[year] || 'Разработка допускается в рамках сезонного бюллетеня.'}
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
                          <Field name="Редакция">
                            <select value={version.id} onChange={(e) => setEdition(e.target.value)}>
                              {product.editions.map((v) => (
                                <option key={v.id} value={v.id}>
                                  Ред. {v.version} · {label(v.status)}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field name="Техническая цель">
                            <select value={target} onChange={(e) => setTarget(e.target.value)}>
                              {options(d.targets[product.axis])}
                            </select>
                          </Field>
                          {product.years[year] && <p>{product.years[year]}</p>}
                          {(tab === 'research' ? ['research', 'design'] : ['lab', 'bench', 'produce']).map(
                            (a) => (
                              <Button
                                key={a}
                                disabled={
                                  busy || (a === 'design' && !!product.years[year] && target !== 'durability')
                                }
                                onClick={() =>
                                  void submit(
                                    'maker-work',
                                    {
                                      action: a,
                                      entry: product.entry,
                                      axis: product.axis,
                                      year: Number(year),
                                      objective: target,
                                      specification: version.id,
                                    },
                                    'Поручение добавлено в календарь работ.',
                                  )
                                }
                              >
                                {label(a)}
                              </Button>
                            ),
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
          {tab === 'clients' && (
            <Panel title="Договор и доступная продукция">
              <div className="maker-body">
                {clientSelect}
                {client && (
                  <>
                    <h3>
                      {client.car} · {org(client.terms.maker)}
                    </h3>
                    <p>
                      {label(client.terms.partnership)} · {client.terms.id}
                    </p>
                    <p>
                      {client.equal
                        ? 'Единая спецификация для клиентов'
                        : 'Разрешены совместимые омологированные поколения'}
                    </p>
                    <a href="#commercial">Договоры поставки и спонсорства</a>
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
                            Передать {i}
                          </Button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </Panel>
          )}
          {['cases', 'diagnosis', 'warranty'].includes(tab) && (
            <Panel
              title={
                tab === 'warranty'
                  ? 'Гарантийные обращения'
                  : tab === 'diagnosis'
                    ? 'Оценка причин по доступным фактам'
                    : 'Запросы клиентов'
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
                      <select name="kind">
                        {options(
                          tab === 'warranty'
                            ? ['warranty']
                            : ['change', 'next', 'consult', 'problem', 'warranty'],
                        )}
                      </select>
                    </Field>
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
                          start: c.date,
                          ...v,
                        })
                      )
                        setReceipt('Назначение зарегистрировано.')
                    }}
                  >
                    <h3>{d.advisor.name}</h3>
                    {clientSelect}
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
        </>
      )}
    </section>
  )
}
