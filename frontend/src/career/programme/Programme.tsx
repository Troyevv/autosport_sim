import { useState } from 'react'
import { CalendarDays, Layers3, SlidersHorizontal } from 'lucide-react'
import { Button, Choices, Dialog, Facts, Header, Panel, Progress } from '../../ui/components'
import { dateLabel } from '../../game'
import { fmt, units } from '../../garage/quantities'
import { type Career, money } from '../api'
import type { SectionProps } from '../Sections'
import { usePersonnel } from '../staff/model'
import { useOrder } from '../finance/useOrder'
import { modes } from '../council/model'
import { type Desk, type Plan, type Proposal, priorities, strategies, kinds, leads } from './model'
import './programme.css'

const deploymentLabels: Record<string, string> = {
  installed: 'Установлен', allocated: 'Выделен со склада', waiting: 'Ожидает экземпляр',
  priority: 'Ожидает по приоритету пилотов', incompatible: 'Несовместим',
  shared: 'Учтено в другом пакете',
}

function Packages({
  plan,
  people,
  manage,
  onEdit,
  onFit,
}: {
  plan: Plan
  people: Desk['people']
  manage: boolean
  onFit: (entry: string, instance: string, label: string) => void
  onEdit: (id: string, due: string) => void
}) {
  return (
    <>
      {plan.packages.map((pkg) => (
        <Panel
          key={pkg.id}
          title="Пакет обновлений"
          action={
            <span>
              {pkg.ready} из {pkg.parts.length} готово
            </span>
          }
        >
          <div className="programme-body">
            <h3>{pkg.goal}</h3>
            <p className="programme-meta">
              <CalendarDays size={15} /> {dateLabel(pkg.due, true)} · {pkg.stage}
            </p>
            <p>{pkg.advice} Установлено {pkg.installed} из {pkg.required} экземпляров.</p>
            <div className="programme-parts">
              {pkg.parts.map((part) => (
                <article key={part.axis}>
                  <div className="programme-line">
                    <strong>{part.label}</strong>
                    <span>{part.status}</span>
                  </div>
                  <p>
                    {people[plan.staff[leads[part.axis]]] || 'Вакансия'} · {money(part.cost_cents)}
                  </p>
                  <details>
                    <summary>Спецификация и допуск</summary>
                    <p className="programme-id">{part.specification}</p>
                    <p>{part.risk}</p>
                    {part.next_cost_cents > 0 && (
                      <p>Смета следующего поручения · {money(part.next_cost_cents)}</p>
                    )}
                    <p>
                      Связанный узел ·{' '}
                      {pkg.parts
                        .filter((x) => x.axis !== part.axis)
                        .map((x) => x.label)
                        .join(', ')}
                    </p>
                    {Object.entries(part.forecast).map(([key, [lo, hi]]) => (
                      <p key={key}>
                        {units[key]?.[0] || key} · {fmt(lo)}–{fmt(hi)} {units[key]?.[1]}
                      </p>
                    ))}
                    {part.targets.length > 0 && (
                      <>
                        {part.targets.map((t) => <p key={t.entry}>№{t.number} · {deploymentLabels[t.status]}</p>)}
                        <p>Выделено со склада для пакета · {part.serials.length}</p>
                        <p>По этой спецификации в организации: на складе · {part.inventory.stock || 0},
                          установлено · {part.inventory.installed || 0}, на контроле · {part.inventory.inspection || 0},
                          в ремонте · {part.inventory.repair || 0}, списано · {part.inventory.scrapped || 0}.</p>
                        <a href="#production">Экземпляры и распределение по заявкам</a>
                      </>
                    )}
                    {manage &&
                      (part.fits || []).map((f) => (
                        <Button
                          key={f.entry + f.instance}
                          onClick={() => onFit(f.entry, f.instance, f.label)}
                        >
                          Установить · {f.label}
                        </Button>
                      ))}
                  </details>
                </article>
              ))}
            </div>
            <div className="programme-line">
              <small>Прямые затраты пакета</small>
              <strong>{money(pkg.cost_cents)}</strong>
            </div>
            {manage && !pkg.withdrawn && (
              <Button onClick={() => onEdit(pkg.id, pkg.due)}>Пересмотреть внедрение</Button>
            )}
          </div>
        </Panel>
      ))}
    </>
  )
}
function Resources({ data, c }: { data: Desk; c: Career }) {
  const f = data.finance,
    atr = data.atr
  return (
    <div className="programme-grid">
      <Panel title="Распределение ресурсов">
        <Facts
          items={[
            ['Решение менеджера', priorities[data.priority]],
            ['Свободные средства', money(f.available_cents)],
            [
              'Утверждено на разработку',
              money(f.plan?.allocations.engineering ?? c.account.development_budget_cents),
            ],
            ['Расходы на разработку', money(f.actual.engineering || 0)],
            ['Обязательства по разработке', money(f.reserved.engineering || 0)],
            ...(f.cap ? [['Остаток Cost Cap', money(f.cap.remaining_cents)] as const] : []),
          ]}
        />
        <div className="programme-body">
          <a href="#budget">Открыть бюджет организации</a>
        </div>
      </Panel>
      <Panel title="Общие мощности">
        <div className="programme-body">
          {data.capacity.map((s) => (
            <div className="programme-line" key={s.kind}>
              <span>{s.label}</span>
              <strong>
                {s.free} своб. · {s.used} зан.
              </strong>
            </div>
          ))}
          <a href="#facilities">Управление инфраструктурой</a>
        </div>
      </Panel>
      <Panel title="Загрузка подразделений">
        <div className="programme-body">
          {c.collectives.map((g) => (
            <div className="programme-proposal" key={g.id}>
              <strong>{g.name}</strong>
              <p>
                {g.size} чел. · квалификация {g.qualification}/100 · загрузка {g.workload}%
              </p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Работы по поколениям">
        <div className="programme-body">
          {data.plans.map((plan) => (
            <div key={plan.id} className="programme-proposal">
              <strong>
                {plan.year} · {plan.category} · {plan.name}
              </strong>
              <p>
                Оплачено {money(plan.spent_cents)} · резерв{' '}
                {money(plan.reserved_cents)}
              </p>
            </div>
          ))}
        </div>
      </Panel>
      {atr && (
        <Panel title={'ATR · период ' + atr.period.number}>
          <Facts
            items={[
              ['Следующая граница', dateLabel(atr.period.end_exclusive, true)],
              ...Object.entries({
                runs: 'Прогоны',
                wind_on_minutes: 'Минуты под потоком',
                occupancy_minutes: 'Занятость трубы, мин',
                cfd_geometries: 'Геометрии CFD',
                cfd_milli_mauh: 'CFD, мMAUh',
              }).map(
                ([k, label]) =>
                  [label, atr.used[k] + ' / ' + (atr.limits?.[k] ?? 'ожидает классификации')] as const,
              ),
            ]}
          />
        </Panel>
      )}
    </div>
  )
}

export function Programme({ c, world, updateCareer }: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<Desk>('careers/' + c.id + '/programme', c.revision),
    data = req.data
  const orders = useOrder(c, updateCareer, 'programme'),
    council = useOrder(c, updateCareer, 'council'),
    fit = useOrder(c, updateCareer, 'engineering')
  const [tab, setTab] = useState('plans'),
    [selected, select] = useState(''),
    [modal, open] = useState(''),
    [value, setValue] = useState(''),
    [serial, setSerial] = useState({ entry: '', instance: '', label: '' }),
    [deployment, setDeployment] = useState({ id: '', due: '' }),
    [proposal, pick] = useState<Proposal | null>(null)
  const plan = data?.plans.find((p) => p.id === selected) || data?.plans[0],
    manage = c.role === 'manager'
  function settings(kind: string, v: string) {
    fit.clear()
    orders.clear()
    council.clear()
    setValue(v)
    open(kind)
  }
  async function confirm() {
    if (!plan) return
    if (modal === 'install') {
      if (await fit.send('component-install', { entry: serial.entry, instance: serial.instance })) open('')
      return
    }
    if (modal === 'deployment') {
      if (
        await orders.send('programme-deployment', {
          entry: plan.entry,
          year: plan.year,
          package: deployment.id,
          decision: value,
          due: value === 'defer' ? deployment.due : null,
        })
      )
        open('')
      return
    }
    const ok =
      modal === 'priority'
        ? await orders.send('programme-priority', { allocation: value })
        : modal === 'concept'
          ? await orders.send('programme-concept', { entry: plan.entry, year: plan.year, strategy: value })
          : proposal && (await council.send('council-decide', { proposal: proposal.id, decision: value }))
    if (ok) open('')
  }
  return (
    <section className="screen season-programme">
      <Header
        section={world.organizations[c.org].name}
        title="Техническая программа"
        sub="Решения инженерного штаба по машинам текущего и следующего сезонов."
      >
        {manage && data && plan && (
          <Button onClick={() => settings('priority', data.priority)}>
            <SlidersHorizontal size={16} />
            Изменить приоритет
          </Button>
        )}
      </Header>
      {req.error ? (
        <p role="alert">
          {req.error} <Button onClick={req.retry}>Повторить загрузку</Button>
        </p>
      ) : !data ? (
        <p role="status">Загрузка технической программы…</p>
      ) : !plan ? (
        <Panel title="Программы организации">
          <p className="programme-body">
            У организации нет собственной заявки. Технические программы ведут команды чемпионата.
          </p>
        </Panel>
      ) : (
        <>
          <div className="programme-ribbon">
            <span>
              <Layers3 size={16} />
              {priorities[data.priority]}
            </span>
            <span>Делегирование · {modes[data.mandate.mode as keyof typeof modes]}</span>
            <a href="#council">Инженерный штаб</a>
          </div>
          <div className="programme-cars" role="group" aria-label="Поколения машин">
            {data.plans.map((p) => (
              <button aria-pressed={p.id === plan.id} key={p.id} onClick={() => select(p.id)}>
                <span>{p.year === data.year ? 'Текущая машина' : 'Следующее поколение'}</span>
                <strong>
                  {p.year} <small>{p.category}</small>
                </strong>
                <span>
                  {p.year === data.year ? p.name : 'Основа · ' + p.name} · {p.calendar.length} работ
                </span>
              </button>
            ))}
          </div>
          <Choices
            label="Разделы программы"
            active={tab}
            onChange={setTab}
            items={[
              ['plans', 'Программа'],
              ['resources', 'Ресурсы'],
              ['calendar', 'Календарь работ'],
              ['concept', 'Концепция'],
              ['rules', 'Регламент'],
              ['history', 'Решения'],
            ]}
          />
          {tab === 'plans' && (
            <div className="programme-grid">
              <div className="programme-stack">
                <Packages
                  plan={plan}
                  people={data.people}
                  manage={manage}
                  onFit={(entry, instance, label) => {
                    setSerial({ entry, instance, label })
                    settings('install', '')
                  }}
                  onEdit={(id, due) => {
                    setDeployment({ id, due })
                    settings('deployment', 'defer')
                  }}
                />
              </div>
              <Panel title={'Предложения штаба · ' + plan.year}>
                <div className="programme-body">
                  <p>Главный инженер · {data.people[plan.staff['chief-engineer']] || 'Вакансия'}</p>
                  {plan.proposals.map((r) => (
                    <article className="programme-proposal" key={r.id}>
                      <h3>{r.title}</h3>
                      <p>{r.result}</p>
                      <p>{r.blocked || r.risk}</p>
                      <div className="programme-line">
                        <strong>{money(r.cost_cents)}</strong>
                        <Button
                          onClick={() => {
                            pick(r)
                            settings('decision', 'approve')
                          }}
                        >
                          Рассмотреть
                        </Button>
                      </div>
                    </article>
                  ))}
                  {!plan.proposals.length && (
                    <p>Открытых предложений нет. Ход утверждённых поручений доступен в календаре.</p>
                  )}
                </div>
              </Panel>
            </div>
          )}
          {tab === 'resources' && <Resources c={c} data={data} />}
          {tab === 'calendar' && (
            <Panel title={'Календарь технических работ · ' + plan.year}>
              <div className="programme-body">
                {!plan.calendar.length && <p>Штаб ожидает утверждения первого поручения.</p>}
                {plan.calendar.map((p) => (
                  <article key={p.id} className="programme-proposal">
                    <div className="programme-line">
                      <h3>{p.label}</h3>
                      <span>{kinds[p.kind]}</span>
                    </div>
                    <p>
                      {dateLabel(p.start, true)} → {dateLabel(p.forecast_end, true)} ·{' '}
                      {p.finished ? 'Завершено' : 'Прогноз при доступной мощности'}
                    </p>
                    <Progress value={(100 * p.worked) / p.required} />
                    <p>
                      {p.worked} / {p.required} ч · {money(p.cost_cents)}{' '}
                      {p.reserved_cents > 0 && ' · резерв ' + money(p.reserved_cents)}{' '}
                      {p.lead && ' · ' + data.people[p.lead]}
                    </p>
                    {p.reason && <p>{p.reason}</p>}
                  </article>
                ))}
              </div>
            </Panel>
          )}
          {tab === 'concept' && (
            <div className="programme-grid">
              <Panel title={'Инженерная концепция · ' + plan.year}>
                <div className="programme-body">
                  <h3>{strategies[plan.strategy]}</h3>
                  <p>{plan.name}</p>
                  <p className="programme-id">{plan.concept}</p>
                  <p>
                    Штаб оценивает совместную работу узлов по чертежам и протоколам. Пересмотр требует двух
                    исследований и проверки сборки.
                  </p>
                  {manage && (
                    <Button onClick={() => settings('concept', plan.strategy)}>Выбрать направление</Button>
                  )}
                </div>
              </Panel>
              <Panel title="Техническая память">
                <div className="programme-body">
                  {plan.documents.length > 0 && (
                    <details>
                      <summary>Документация стартовой машины · {plan.documents.length}</summary>
                      {plan.documents.map((doc) => (
                        <p key={doc.reference}>
                          {doc.component} · {doc.issuer} · {doc.design ? 'конструкторская документация' : 'монтажная документация'}
                        </p>
                      ))}
                    </details>
                  )}
                  {plan.knowledge.length === 0 ? (
                    <p>Исследовательских заключений пока нет.</p>
                  ) : (
                    plan.knowledge.map((r) => (
                      <article key={r.id}>
                        <p>{r.conclusion}</p>
                        <strong>
                          Уверенность {r.confidence}% · применимость {r.applicable}%
                        </strong>
                      </article>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          )}
          {tab === 'rules' && (
            <div className="programme-grid">
              <Panel title={plan.rule.origin}>
                <Facts
                  items={[
                    ['Редакция', plan.regulation],
                    ['Объявлен', dateLabel(plan.rule.announced, true)],
                    ['Действует с', dateLabel(plan.rule.effective, true)],
                    ...(plan.rule.freeze ? [['Заморозка', dateLabel(plan.rule.freeze, true)] as const] : []),
                  ]}
                />
                <div className="programme-body">
                  <p>{plan.rule.text}</p>
                  <p>{plan.rule.clarification}</p>
                  {plan.rule.source && (
                    <a href={plan.rule.source} target="_blank" rel="noreferrer">
                      Источник стартовых правил
                    </a>
                  )}
                </div>
              </Panel>
              <Panel title="Технический допуск">
                <div className="programme-body">
                  {Object.entries(plan.certificates).map(([v, cert]) => (
                    <p className="programme-id" key={v}>
                      {dateLabel(cert.date)} · {v}
                    </p>
                  ))}
                  {Object.keys(plan.certificates).length === 0 && (
                    <p>Сезонных заявок на омологацию пока нет.</p>
                  )}
                  {plan.violations.map((v) => (
                    <p key={v.instance}>
                      {v.instance} · {v.decision}
                    </p>
                  ))}
                </div>
              </Panel>
            </div>
          )}
          {tab === 'history' && (
            <Panel title="История технических решений">
              <div className="programme-body">
                {data.history
                  .filter((h) => !h.plan || h.plan === plan.id)
                  .map((h) => (
                    <article className="programme-proposal" key={h.id}>
                      <small>
                        {dateLabel(h.date, true)} · {h.person}
                      </small>
                      <h3>{h.title}</h3>
                      <p>{h.reason}</p>
                    </article>
                  ))}
                {!data.history.some((h) => !h.plan || h.plan === plan.id) && (
                  <p>Утверждённые решения появятся здесь с датой и именем ответственного.</p>
                )}
              </div>
            </Panel>
          )}
          {modal && (
            <Dialog
              title={
                modal === 'priority'
                  ? 'Приоритет поколений'
                  : modal === 'concept'
                    ? 'Направление концепции'
                    : modal === 'deployment'
                      ? 'Внедрение пакета'
                      : proposal?.title || 'Решение штаба'
              }
              onClose={() => open('')}
            >
              <form
                className="programme-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void confirm()
                }}
              >
                {modal === 'deployment' && value === 'defer' && (
                  <label>
                    Новый срок внедрения
                    <input
                      required
                      type="date"
                      value={deployment.due}
                      onChange={(e) => setDeployment({ ...deployment, due: e.target.value })}
                    />
                  </label>
                )}
                {modal === 'install' && (
                  <p>Установка на заявку {serial.label}. Снятый экземпляр вернётся на склад.</p>
                )}
                {modal === 'decision' && proposal && (
                  <>
                    {proposal.positions.map((p) => (
                      <p key={p.person}>
                        <strong>
                          {data.people[p.person]} · {p.stance}
                        </strong>
                        <br />
                        {p.argument}
                      </p>
                    ))}
                    <p>Прямые затраты · {money(proposal.cost_cents)}</p>
                  </>
                )}
                {modal !== 'install' && (
                  <label>
                    {modal === 'priority'
                      ? 'Распределение работ'
                      : modal === 'concept'
                        ? 'Стратегия разработки'
                        : 'Действие менеджера'}
                    <select value={value} onChange={(e) => setValue(e.target.value)}>
                      {Object.entries(
                        modal === 'priority'
                          ? priorities
                          : modal === 'concept'
                            ? strategies
                            : modal === 'deployment'
                              ? { defer: 'Перенести срок', withdraw: 'Отказаться от внедрения' }
                              : {
                                  approve: 'Утвердить',
                                  defer: 'Перенести',
                                  reject: 'Отказаться',
                                  delegate: 'Поручить главному инженеру',
                                },
                      ).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {modal === 'priority' && (
                  <p>
                    Первый выбор свободных специалистов и площадок получит приоритетное поколение. Остановка
                    приостанавливает развитие текущей машины. Оплаченные обязательства сохраняются.
                  </p>
                )}
                {modal === 'concept' && (
                  <p>
                    Исследования компоновки ·{' '}
                    {money(value === plan.strategy ? 0 : plan.concept_costs[value] || 0)}. Полученный
                    результат потребует проверки.
                  </p>
                )}
                {(orders.error || council.error || fit.error) && (
                  <p role="alert">{orders.error || council.error || fit.error}</p>
                )}
                <Button type="submit" primary disabled={!manage || orders.busy || council.busy || fit.busy}>
                  Подтвердить решение
                </Button>
              </form>
            </Dialog>
          )}
        </>
      )}
    </section>
  )
}
