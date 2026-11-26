import { useState } from 'react'
import { BookOpen, CalendarDays, Fingerprint, FlaskConical, Layers, Plus } from 'lucide-react'
import { Button, Choices, Dialog, Facts, Header, Panel, Progress, Stats } from '../../ui/components'
import { dateLabel } from '../../game'
import { money, type Career } from '../api'
import type { SectionProps } from '../Sections'
import { useOrder } from '../finance/useOrder'
import { usePersonnel } from '../staff/model'
import { labels as workshopLabels } from '../production/model'
import { priorities, outcomes, type Desk, type Priority, type Report } from './model'
import './research.css'

type Order = ReturnType<typeof useOrder>
function PriorityOptions() {
  return Object.entries(priorities).map(([id, label]) => (
    <option key={id} value={id}>
      {label}
    </option>
  ))
}
function Commission({ data, order, close }: { data: Desk; order: Order; close: () => void }) {
  const [entryId, setEntry] = useState(data.entries[0].id)
  const entry = data.entries.find((e) => e.id === entryId)!
  const [axisId, setAxis] = useState(entry.axes[0])
  const axis = entry.axes.includes(axisId) ? axisId : entry.axes[0]
  const method = data.methods[axis]
  const [priority, setPriority] = useState<Priority>('normal'),
    [rival, setRival] = useState('')
  const lead = data.staff[entry.staff[method.role]]
  return (
    <Dialog title="Поручить исследование" onClose={close}>
      <form
        className="research-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (
            await order.send('research-commission', {
              entry: entryId,
              axis,
              priority,
              rival_entry: rival || null,
            })
          )
            close()
        }}
      >
        <label>
          Инженерная концепция
          <select
            value={entryId}
            onChange={(e) => {
              setEntry(e.target.value)
              setRival('')
            }}
          >
            {data.entries.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Направление
          <select value={axis} onChange={(e) => setAxis(e.target.value)}>
            {entry.axes.map((a) => (
              <option key={a} value={a}>
                {data.methods[a].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Источник информации
          <select value={rival} onChange={(e) => setRival(e.target.value)}>
            <option value="">Документация своей команды</option>
            {entry.rivals.map((r) => (
              <option key={r.reference} value={r.reference}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Приоритет
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <PriorityOptions />
          </select>
        </label>
        <p>{entry.questions[axis]}</p>
        <Facts
          items={[
            ['Ответственный', lead || 'Должность вакантна'],
            ['Объём работы', method.hours + ' расчётных ч'],
            ['План после выделения слота', method.planned_days + ' раб. дн.'],
            ['Расход при утверждении', money(method.cost_cents)],
          ]}
        />
        {!entry.admitted && <p>Допуск программы приостановлен.</p>}
        {!data.capacity.available_slots && (
          <p>Проект останется в очереди, пока у команды не появится свободный слот центра.</p>
        )}
        {order.error && <p role="alert">{order.error}</p>}
        <div className="research-actions">
          <Button onClick={close}>Отмена</Button>
          <button className="btn btn-primary" disabled={!lead || !entry.admitted || order.busy}>
            Утвердить расходы
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function Memory({ data, order, manage }: { data: Desk; order: Order; manage: boolean }) {
  const [targetId, setTarget] = useState(''),
    [axis, setAxis] = useState(''),
    [decision, setDecision] = useState('')
  const [transfer, setTransfer] = useState<Report | null>(null)
  const target = data.targets.find((t) => t.id === targetId) || data.targets[0]
  const reports = data.reports.filter(
    (r) => (!axis || axis === r.axis) && (!decision || decision === r.outcome),
  )
  const staff = transfer
    ? Object.values(
        data.entries.find((e) => e.id === data.projects.find((p) => p.id === transfer.project)?.entry)
          ?.staff || {},
      )
    : []
  return (
    <>
      <Panel title="Архив заключений">
        <div className="research-filters">
          <label>
            Направление
            <select value={axis} onChange={(e) => setAxis(e.target.value)}>
              <option value="">Все направления</option>
              {Object.entries(data.methods).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Результат
            <select value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="">Все результаты</option>
              {Object.entries(outcomes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {target && (
            <label>
              Оценить применимость к
              <select value={target.id} onChange={(e) => setTarget(e.target.value)}>
                {data.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!reports.length && (
          <p className="panel-body">
            {data.reports.length
              ? 'По заданным условиям заключений нет.'
              : 'Архив открыт. Здесь появится заключение специалистов после первого исследования.'}
          </p>
        )}
        {reports.map((r) => {
          const project = data.projects.find((p) => p.id === r.project)!
          const people = Object.values(data.entries.find((e) => e.id === project.entry)?.staff || {})
          return (
            <article className="research-card" key={r.id}>
              <div className="research-heading">
                <div>
                  <small>
                    {dateLabel(r.date)} · {data.methods[r.axis].label}
                  </small>
                  <h3>{r.hypothesis}</h3>
                </div>
                <span className="chip">{outcomes[r.outcome]}</span>
              </div>
              <p>{r.conclusion}</p>
              <div className="research-meta">
                <span>
                  <BookOpen size={15} /> {r.source.label}
                </span>
                <span>
                  <Fingerprint size={15} /> Уверенность в выводе · {r.confidence}%
                </span>
              </div>
              {target && (
                <p>
                  <strong>{target.title}</strong> · применимость заключения {r.applicability[target.id]}%
                </p>
              )}
              <details>
                <summary>Материалы и личный вклад</summary>
                <Facts
                  items={[
                    ['Исходная концепция', r.concept],
                    ['Исходная спецификация', r.baseline],
                    ['Регламент', r.regulation],
                    ['Источник', r.source.label],
                    ['Шифр источника', r.source.reference],
                    ['Дата поручения', dateLabel(project.commissioned)],
                    ['Стоимость работы', money(project.cost_cents)],
                    ['Регистрационный номер', r.id],
                    ...(r.citations.length ? [['Использовано в инженерных делах', r.citations.join(', ')] as [string,string]] : []),
                    ...Object.values(r.participants).map((c): [string, string] => [
                      c.name,
                      c.skill + ' · ' + c.hours + ' чел.-ч',
                    ]),
                    [
                      'Знакомы с материалом в действующем составе',
                      Object.keys(r.readers)
                        .map((p) => data.staff[p])
                        .join(', ') || 'Нет сотрудников',
                    ],
                    ...data.handovers
                      .filter((h) => h.report === r.id)
                      .map((h): [string, string] => [
                        dateLabel(h.date) + ' · передача дел',
                        h.mentor_name + ' → ' + h.recipient_name,
                      ]),
                  ]}
                />
              </details>
              {manage && people.some((p) => r.readers[p]) && people.some((p) => !r.readers[p]) && (
                <Button
                  onClick={() => {
                    order.clear()
                    setTransfer(r)
                  }}
                >
                  Передать опыт
                </Button>
              )}
            </article>
          )
        })}
      </Panel>
      {data.inspections.length > 0 && <Panel title="Протоколы контроля качества">
        {data.inspections.map(h => <article key={h.id} className="research-card">
          <small>{dateLabel(h.date)} · {h.person}</small>
          <strong>{workshopLabels[h.code]} · {h.serial}</strong>
          <p>{h.batch || 'Начальный парк'} · {h.version}</p>
        </article>)}
      </Panel>}
      {transfer && (
        <Dialog title="Передача инженерного опыта" onClose={() => setTransfer(null)}>
          <form
            className="research-form"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              if (
                await order.send('research-handover', {
                  report: transfer.id,
                  mentor: form.get('mentor'),
                  recipient: form.get('recipient'),
                })
              )
                setTransfer(null)
            }}
          >
            <p>{transfer.hypothesis}</p>
            <label>
              Наставник
              <select name="mentor">
                {staff
                  .filter((k) => transfer.readers[k])
                  .map((k) => (
                    <option key={k} value={k}>
                      {data.staff[k]}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Получатель
              <select name="recipient">
                {staff
                  .filter((k) => !transfer.readers[k])
                  .map((k) => (
                    <option key={k} value={k}>
                      {data.staff[k]}
                    </option>
                  ))}
              </select>
            </label>
            <p>Оба специалиста посвятят рабочий день разбору материалов.</p>
            {order.error && <p role="alert">{order.error}</p>}
            <button className="btn btn-primary" disabled={order.busy}>
              Провести разбор
            </button>
          </form>
        </Dialog>
      )}
    </>
  )
}

export function Research({ c, world, updateCareer }: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<Desk>('careers/' + c.id + '/research', c.revision),
    data = req.error ? undefined : req.data
  const order = useOrder(c, updateCareer, 'research'),
    rental = useOrder(c, updateCareer)
  const [tab, setTab] = useState('queue'),
    [dialog, open] = useState(''),
    [priority, setPriority] = useState<Priority>('normal')
  const manage = c.role === 'manager',
    pending = data?.projects.filter((p) => !p.finished) || []
  const selected = pending.find((p) => p.id === dialog)
  return (
    <section className="screen research-desk">
      <Header
        section={world.organizations[c.org].name + ' / Технический центр'}
        title="Исследования"
        sub="Работа специалистов и техническая память организации."
      >
        {manage && !!data?.entries.length && (
          <Button
            primary
            onClick={() => {
              order.clear()
              open('commission')
            }}
          >
            <Plus size={16} />
            Поручить исследование
          </Button>
        )}
      </Header>
      {req.error && (
        <div role="alert">
          {req.error} <Button onClick={req.retry}>Повторить загрузку</Button>
        </div>
      )}
      {!data && !req.error && <p role="status">Загрузка исследовательского центра…</p>}
      {data && (
        <>
          <Stats
            items={[
              [
                'Доступные слоты',
                String(data.capacity.available_slots),
                'На ' + dateLabel(c.date),
                <FlaskConical size={16} />,
              ],
              ['Открытые проекты', String(pending.length), 'В работе и очереди', <Layers size={16} />],
              [
                'Расходы на исследования',
                money(data.spent_cents),
                'Оплаченные поручения',
                <CalendarDays size={16} />,
              ],
              ['Заключения', String(data.reports.length), 'В технической памяти', <BookOpen size={16} />],
            ]}
          />
          <Choices
            label="Исследовательский центр"
            items={[
              ['queue', 'Очередь исследований'],
              ['memory', 'Техническая память'],
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === 'memory' ? (
            <Memory data={data} order={order} manage={manage} />
          ) : (
            <div className="research-layout">
              <Panel title="Очередь исследований">
                {!pending.length && (
                  <div className="research-empty">
                    <FlaskConical size={28} />
                    <h3>Очередь свободна</h3>
                    <p>
                      {data.entries.length
                        ? 'Поручите специалистам проверить гипотезу. Готовые заключения сохраняются в технической памяти.'
                        : 'У организации нет собственной автомобильной программы.'}
                    </p>
                  </div>
                )}
                {pending.map((p) => (
                  <article className="research-card" key={p.id}>
                    <div className="research-heading">
                      <div>
                        <small>
                          {data.methods[p.axis].label} ·{' '}
                          {data.entries.find((e) => e.concept === p.concept)?.title || p.concept}
                        </small>
                        <h3>{p.hypothesis}</h3>
                      </div>
                      <span className="chip">{p.status === 'active' ? 'В работе' : 'В очереди'}</span>
                    </div>
                    <p>
                      {p.reason
                        ? (p.allocated_on ? dateLabel(p.allocated_on) + ' · ' : '') + p.reason
                        : 'Ответственный · ' + (data.staff[p.lead || ''] || 'Вакансия')}
                    </p>
                    <Progress value={(100 * p.worked) / p.required} />
                    <div className="research-meta">
                      <span>
                        {p.worked} / {p.required} расчётных ч
                      </span>
                      <span>{money(p.cost_cents)}</span>
                      <span>{priorities[p.priority]} приоритет</span>
                    </div>
                    <details>
                      <summary>Назначение и сроки</summary>
                      <Facts
                        items={[
                          ['Ответственный', data.staff[p.lead || ''] || 'Вакансия'],
                          ['Поручено', dateLabel(p.commissioned)],
                          ['Начало работ', p.started ? dateLabel(p.started) : 'Ожидается'],
                          [
                            'Осталось при текущем темпе',
                            p.remaining_days ? p.remaining_days + ' раб. дн.' : 'Оценка после начала работ',
                          ],
                          ['Источник', p.source.label],
                          ...Object.values(p.participants).map((v): [string, string] => [
                            v.name,
                            v.hours + ' чел.-ч',
                          ]),
                        ]}
                      />
                    </details>
                    {manage && (
                      <Button
                        onClick={() => {
                          order.clear()
                          setPriority(p.priority)
                          open(p.id)
                        }}
                      >
                        Изменить приоритет
                      </Button>
                    )}
                  </article>
                ))}
              </Panel>
              <aside>
                <Panel title="Мощности центра">
                  <div className="research-side">
                    <Facts
                      items={[
                        ['Собственные слоты', data.capacity.installed_slots],
                        ['Расходы на аренду центра', money(data.lease_spent_cents)],
                        ['Доступно с учётом аренды', data.capacity.available_slots],
                        [
                          'Ресурс на день',
                          (data.capacity.effective_person_days_x100 / 100).toLocaleString('ru-RU') +
                            ' чел.-дн.',
                        ],
                      ]}
                    />
                    {manage && (
                      <Button
                        disabled={data.shared_free <= 0}
                        onClick={() => {
                          rental.clear()
                          open('lease')
                        }}
                      >
                        Арендовать слот
                      </Button>
                    )}
                    <a href="#facilities">Все объекты и бронирования →</a>
                  </div>
                </Panel>
              </aside>
            </div>
          )}
          {dialog === 'commission' && <Commission data={data} order={order} close={() => open('')} />}
          {dialog === 'lease' && (
            <Dialog title="Аренда исследовательского центра" onClose={() => open('')}>
              <div className="research-form">
                <Facts
                  items={[
                    ['Доступ', '1 слот на 7 дней'],
                    ['Начало', dateLabel(c.date)],
                    ['Арендная плата', money(7 * data.lease_daily_cents)],
                  ]}
                />
                {rental.error && <p role="alert">{rental.error}</p>}
                <Button
                  primary
                  disabled={rental.busy}
                  onClick={async () => {
                    if (
                      await rental.send('finance-lease', {
                        facility: 'shared:research',
                        start: c.date,
                        days: 7,
                        units: 1,
                        mode: 'lease',
                      })
                    )
                      open('')
                  }}
                >
                  Подтвердить аренду
                </Button>
              </div>
            </Dialog>
          )}
          {selected && (
            <Dialog title="Приоритет исследования" onClose={() => open('')}>
              <div className="research-form">
                <p>{selected.hypothesis}</p>
                <label>
                  Приоритет
                  <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                    <PriorityOptions />
                  </select>
                </label>
                {order.error && <p role="alert">{order.error}</p>}
                <Button
                  primary
                  disabled={order.busy || priority === selected.priority}
                  onClick={async () => {
                    if (await order.send('research-priority', { project: selected.id, priority })) open('')
                  }}
                >
                  Сохранить приоритет
                </Button>
              </div>
            </Dialog>
          )}
        </>
      )}
    </section>
  )
}
