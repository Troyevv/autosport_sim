import { EngineeringHeading, EngineeringMetrics } from '../../pitwall/EngineeringHeading'
import { readRoute } from '../../pitwall/core/route'
import { useState } from 'react'
import { Factory, Package, ClipboardCheck, Plus } from 'lucide-react'
import { Button, Choices, Dialog, Facts, Panel, Progress } from '../../ui/components'
import { dateLabel } from '../../game'
import { type Career, money } from '../api'
import type { SectionProps } from '../Sections'
import { useOrder } from '../finance/useOrder'
import { usePersonnel } from '../staff/model'
import { priorities } from '../research/model'
import { type Desk, type Need, type Batch, type Facility, labels, entryTitle } from './model'
import { Inventory, ItemCard } from './Inventory'
import { OrderForm } from './OrderForm'
import '../research/research.css'
import './production.css'

type Action =
  | { kind: 'order'; need?: Need }
  | { kind: 'item'; id: string }
  | { kind: 'rent'; site: Facility }
  | { kind: 'cancel' | 'priority'; batch: Batch }

export function Production({
  c,
  world,
  updateCareer,
}: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<Desk>('careers/' + c.id + '/production', c.revision),
    data = req.error ? undefined : req.data
  const factory = useOrder(c, updateCareer, 'production'),
    rental = useOrder(c, updateCareer),
    install = useOrder(c, updateCareer, 'engineering')
  const [tab, setTab] = useState(() =>
      readRoute().page === 'inventory'
        ? 'stock'
        : ['needs', 'stock', 'quality', 'archive'].includes(readRoute().tab)
          ? readRoute().tab
          : 'queue',
    ),
    [action, setAction] = useState<Action | null>(null),
    [priority, setPriority] = useState('normal')
  const manage = c.role === 'manager',
    busy = factory.busy || rental.busy || install.busy
  const error = factory.error || rental.error || install.error
  const open = (a: Action) => {
    factory.clear()
    rental.clear()
    install.clear()
    setAction(a)
    if (a.kind === 'priority') setPriority(a.batch.priority)
  }
  const close = () => {
    if (!busy) setAction(null)
  }
  async function submit(name: string, payload: unknown) {
    const desk = name === 'finance-lease' ? rental : name === 'component-install' ? install : factory
    if (await desk.send(name, payload)) setAction(null)
  }
  const title = (eid: string, sid: string) => {
    const d = data?.entries.find((e) => e.id === eid)?.choices.find((d) => d.id === sid)
    return d ? d.label + ' · ред. ' + d.version : sid
  }
  const queues = data?.batches.filter((b) => !b.finished) || []
  const selected = action?.kind === 'item' ? data?.items.find((i) => i.id === action.id) : undefined
  return (
    <section className="screen engineering-module research-desk workshop">
      <EngineeringHeading
        route={readRoute().page === 'inventory' ? 'inventory' : 'production'}
        organization={world.organizations[c.org].name}
        maker={c.role === 'manufacturer'}
      >
        {manage && !!data?.entries.length && (
          <Button primary onClick={() => open({ kind: 'order' })}>
            <Plus size={16} />
            Новый заказ
          </Button>
        )}
      </EngineeringHeading>
      {req.error && (
        <p role="alert">
          {req.error} <Button onClick={req.retry}>Повторить загрузку</Button>
        </p>
      )}
      {!data && !req.error && <p role="status">Загрузка производственных нарядов…</p>}
      {data && (
        <>
          <Choices
            label="Производственные участки"
            active={tab}
            onChange={setTab}
            items={[
              ['queue', 'Очередь заказов'],
              ['stock', 'Склад'],
              ['quality', 'Контроль качества'],
              ['needs', 'Потребность'],
              ['archive', 'Журнал'],
            ]}
          />
          <EngineeringMetrics
            items={[
              ['Заказы в работе', queues.length, 'В очереди и в цехе', <Factory size={16} />],
              [
                'На складе',
                data.items.filter((i) => i.status === 'stock').length,
                'Свободные экземпляры',
                <Package size={16} />,
              ],
              [
                'На контроле',
                data.items.filter((i) => i.status === 'inspection').length,
                'Приёмка и повторная проверка',
                <ClipboardCheck size={16} />,
              ],
              ['Доступно для заказа', money(data.limit_cents), 'В пределах финансового мандата'],
            ]}
          />

          <div className="research-layout">
            <div className="workshop-main">
              {tab === 'queue' && (
                <Panel title="Производственные заказы">
                  {queues.length === 0 && (
                    <div className="research-empty">
                      <Factory />
                      <h3>Очередь свободна</h3>
                      <p>
                        {data.entries.length
                          ? 'Выберите допущенный чертёж или откройте заявку специалистов в разделе «Потребность».'
                          : 'Заказы этой программы ведёт производственная служба гоночной команды.'}
                      </p>
                    </div>
                  )}
                  {queues.map((b) => (
                    <article key={b.id} className="research-card">
                      <div className="research-heading">
                        <div>
                          <small>
                            {b.id} · {entryTitle(data, b.entry)}
                          </small>
                          <h3>{title(b.entry, b.specification)}</h3>
                        </div>
                        <span className="chip">{labels[b.status]}</span>
                      </div>
                      <div className="research-meta">
                        <span>{b.quantity} экз.</span>
                        <span>{priorities[b.priority]} приоритет</span>
                        <span>{b.rush ? 'Срочная партия' : 'Плановая партия'}</span>
                      </div>
                      <Progress value={(100 * b.worked) / b.required} />
                      <p>
                        {b.worked} / {b.required} нормо-ч · {b.days} смен до завершения при доступной
                        мощности, ориентир {dateLabel(b.estimated_finish)}.
                      </p>
                      <p>
                        {b.outsource ? 'Подрядчик' : 'Цех команды'} · оплачено{' '}
                        {money(b.cost_cents + b.facility_cents)} · заказ от {dateLabel(b.commissioned)}
                      </p>
                      {b.reason && (
                        <strong>
                          {b.last_shift && dateLabel(b.last_shift) + ' · '}
                          {b.reason}
                        </strong>
                      )}
                      {b.grants.length > 0 && (
                        <details>
                          <summary>Отработанные смены · {b.grants.length}</summary>
                          {b.grants.map((g) => (
                            <p key={g.reference}>
                              {dateLabel(g.start)} · состояние {g.condition}% ·{' '}
                              {g.effective_person_days_x100 / 100} чел.-дн.
                            </p>
                          ))}
                        </details>
                      )}
                      {manage && (
                        <div className="research-actions">
                          <Button onClick={() => open({ kind: 'priority', batch: b })}>
                            Изменить приоритет
                          </Button>
                          <Button onClick={() => open({ kind: 'cancel', batch: b })}>
                            Отменить заказ
                          </Button>
                        </div>
                      )}
                    </article>
                  ))}
                </Panel>
              )}
              {(tab === 'stock' || tab === 'quality') && (
                <Inventory
                  key={tab}
                  data={data}
                  quality={tab === 'quality'}
                  open={(i) => open({ kind: 'item', id: i.id })}
                />
              )}
              {tab === 'needs' && (
                <Panel title="Заявки механиков и инженеров">
                  {!data.needs.length && (
                    <p className="research-empty">Нет заключений ответственных специалистов.</p>
                  )}
                  {data.needs.map((n) => (
                    <article key={n.specification} className="research-card">
                      <div className="research-heading">
                        <h3>{title(n.entry, n.specification)}</h3>
                        <span className="chip">
                          {n.quantity ? 'Нужно ' + n.quantity + ' экз.' : 'Запас обеспечен'}
                        </span>
                      </div>
                      <p>
                        {data.people[n.mechanic]} · {data.people[n.engineer]}
                      </p>
                      <p>
                        Машин {n.cars} · требуют замены или обновления {n.replace} · на складе {n.stock}{' '}
                        · ожидается {n.pending}.
                      </p>
                      {manage && n.quantity > 0 && (
                        <Button onClick={() => open({ kind: 'order', need: n })}>
                          Оформить по заявке
                        </Button>
                      )}
                    </article>
                  ))}
                </Panel>
              )}
              {tab === 'archive' && (
                <Panel title="История производства и приёмки">
                  {!data.history.length && (
                    <p className="research-empty">Производственных записей пока нет.</p>
                  )}
                  {data.history.map((h) => (
                    <div className="research-card" key={h.id}>
                      <small>
                        {dateLabel(h.date)} · {h.batch || 'Обслуживание парка'}
                      </small>
                      <strong>
                        {labels[h.code]} · {title(h.entry, h.version)}
                      </strong>
                      <span>
                        {data.people[h.person]} · {entryTitle(data, h.entry)}
                      </span>
                      {h.instance && (
                        <Button onClick={() => open({ kind: 'item', id: h.instance! })}>
                          Открыть экземпляр
                        </Button>
                      )}
                      {!h.instance && (
                        <p>
                          {data.batches.find((b) => b.id === h.batch)?.quantity} экз. ·{' '}
                          {money(data.batches.find((b) => b.id === h.batch)?.cost_cents || 0)}
                        </p>
                      )}
                    </div>
                  ))}
                </Panel>
              )}
            </div>
            <aside>
              <Panel title="Мощности и персонал">
                {data.capacity.map((site) => (
                  <article key={site.kind} className="research-card">
                    <div className="research-heading">
                      <h3>{site.label}</h3>
                      <span className="chip">
                        {site.sites.reduce((sum, s) => sum + s.slots, 0)} своб.
                      </span>
                    </div>
                    {site.sites.map((s) => (
                      <p key={s.id}>
                        {s.owned ? 'Собственная площадка' : 'Внешняя площадка'} · состояние {s.condition}
                        % · занято {s.used}
                      </p>
                    ))}
                    {site.kind === 'warehouse' ? (
                      <p>
                        Занято {data.storage.used} из {data.storage.total} мест · под заказы{' '}
                        {data.storage.reserved} · свободно {data.storage.free}.
                      </p>
                    ) : site.crew ? (
                      <>
                        <strong>
                          {site.crew.name} · {site.crew.size} чел.
                        </strong>
                        <p>
                          Квалификация {site.crew.qualification}/100 · загрузка {site.crew.workload}% ·
                          усталость {site.crew.fatigue}%
                        </p>
                      </>
                    ) : (
                      <p>Подразделение не укомплектовано.</p>
                    )}
                    {manage && (
                      <Button disabled={site.rentable < 1} onClick={() => open({ kind: 'rent', site })}>
                        Арендовать · {site.label}
                      </Button>
                    )}
                  </article>
                ))}
              </Panel>
            </aside>
          </div>
          {action?.kind === 'order' && (
            <OrderForm
              data={data}
              need={action.need}
              close={close}
              busy={busy}
              error={error}
              submit={(p) => submit('production-order', p)}
            />
          )}
          {selected && (
            <ItemCard
              key={selected.id}
              i={selected}
              data={data}
              manage={manage}
              busy={busy}
              error={error}
              close={close}
              submit={submit}
            />
          )}
          {action?.kind === 'rent' && (
            <Dialog title="Аренда рабочего участка" onClose={close}>
              <div className="research-form">
                <Facts
                  items={[
                    ['Объект', action.site.label],
                    ['Срок', '7 дней с ' + dateLabel(c.date)],
                    ['Мощность', '1 слот'],
                    ['Стоимость', money(7 * action.site.daily_cents)],
                  ]}
                />
                {error && <p role="alert">{error}</p>}
                <Button
                  primary
                  disabled={busy}
                  onClick={() =>
                    submit('finance-lease', {
                      facility: 'shared:' + action.site.kind,
                      start: c.date,
                      days: 7,
                      units: 1,
                      mode: 'lease',
                    })
                  }
                >
                  Подтвердить аренду
                </Button>
              </div>
            </Dialog>
          )}
          {(action?.kind === 'cancel' || action?.kind === 'priority') && (
            <Dialog
              title={action.kind === 'cancel' ? 'Отмена партии' : 'Приоритет партии'}
              onClose={close}
            >
              <div className="research-form">
                <strong>
                  {action.batch.id} · {title(action.batch.entry, action.batch.specification)}
                </strong>
                {action.kind === 'cancel' ? (
                  <p>
                    После отмены цех прекратит работу. Понесённые расходы{' '}
                    {money(action.batch.cost_cents + action.batch.facility_cents)} сохранятся в учёте.
                  </p>
                ) : (
                  <label>
                    Новый приоритет
                    <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                      {Object.entries(priorities).map(([id, name]) => (
                        <option value={id} key={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {error && <p role="alert">{error}</p>}
                <Button
                  primary
                  disabled={busy}
                  onClick={() =>
                    submit(
                      'production-' + action.kind,
                      action.kind === 'cancel'
                        ? { batch: action.batch.id }
                        : { batch: action.batch.id, priority },
                    )
                  }
                >
                  Подтвердить решение
                </Button>
              </div>
            </Dialog>
          )}
        </>
      )}
    </section>
  )
}
