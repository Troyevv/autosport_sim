import {businessTab,BusinessTabs} from '../../pitwall/BusinessTabs'
import { useState, type FormEvent } from 'react'
import { Button, Dialog, Facts, Header, Panel } from '../../ui/components'
import { usePersonnel } from '../staff/model'
import { money, type Career } from '../api'
import type { SectionProps } from '../Sections'
import { useOrder } from './useOrder'
const names: Record<string, string> = {
  personnel: 'Персонал',
  engineering: 'Разработка',
  operations: 'Операции',
  commercial: 'Коммерция',
  facilities: 'Инфраструктура',
  reserve: 'Резерв',
}
const units: Record<string, string> = {
  runs: 'Прогоны',
  wind_on_minutes: 'Под потоком, мин',
  occupancy_minutes: 'Занятость трубы, мин',
  cfd_geometries: 'Геометрии CFD',
  cfd_milli_mauh: 'CFD, 0,001 MAUh',
}
type Alloc = Record<string, number>
type Request = { id: string; status: string; reason: string; decision_reason?: string; allocations: Alloc }
type View = {
  cash_cents: number
  available_cents: number
  plan: { allocations: Alloc; revision: number; approved: string } | null
  actual: Alloc
  reserved: Alloc
  requests: Request[]
  cap: {
    version: string
    limit_cents: number
    spent_cents: number
    committed_cents: number
    remaining_cents: number
    forecast_cents: number
    source: string
    indexation: string
    rounds: number
  } | null
  atr: {
    period: { number: number; start: string; end_exclusive: string }
    percent: number | null
    limits: Alloc | null
    used: Alloc
  } | null
  audits: { id: string; year: string; severity: string; fine_cents: number }[]
}
type Props = SectionProps & { updateCareer: (c: Career) => void }
export function Budget({ c, world, updateCareer }: Props) {
  const tab = businessTab('budget')
  const current = Number(c.date.slice(0, 4)),
    [year, yearTo] = useState(current),
    [edit, setEdit] = useState<Request | 'new' | null>(null)
  const req = usePersonnel<View>('careers/' + c.id + '/budget?year=' + year, c.revision),
    v = req.data,
    order = useOrder(c, updateCareer)
  const decide = c.role === 'owner' || c.role === 'manufacturer',
    propose = c.role !== 'owner'
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget),
      amounts = Object.fromEntries(Object.keys(names).map((k) => [k, Math.round(Number(f.get(k)) * 100)])),
      reason = f.get('reason'),
      response = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    const ok =
      edit === 'new'
        ? await order.send('finance-budget-propose', { year, reason, allocations: amounts })
        : edit &&
          (await order.send('finance-budget-decide', {
            proposal: edit.id,
            response,
            reason,
            ...(response === 'adjust' ? { allocations: amounts } : {}),
          }))
    if (ok) setEdit(null)
  }
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Бюджет сезона"
        sub="Сезонная смета и решения владельца"
      />
      <BusinessTabs page="budget"/>
      <label>
        Сезон{' '}
        <select value={year} onChange={(e) => yearTo(Number(e.target.value))}>
          {[current - 1, current, current + 1]
            .filter((y) => y >= 2025)
            .map((y) => (
              <option key={y}>{y}</option>
            ))}
        </select>
      </label>
      {(order.error || req.error) && <p role="alert">{order.error || req.error}</p>}
      {v && (
        <>
          {tab === 'plan' && <Panel title="Полномочия и средства">
            <Facts
              items={[
                ['На счету', money(v.cash_cents)],
                ['Доступно', money(v.available_cents)],
                [
                  'Утверждённая смета',
                  v.plan
                    ? money(Object.values(v.plan.allocations).reduce((a, b) => a + b, 0))
                    : 'На согласовании',
                ],
                ['Последнее утверждение', v.plan?.approved ?? '—'],
              ]}
            />
          </Panel>}
          {tab === 'plan' && <Panel title="Распределение по направлениям">
            {Object.entries(names).map(([k, n]) => (
              <div className="result" key={k}>
                <span>
                  <strong>{n}</strong>
                  <small>
                    Потрачено {money(v.actual[k] ?? 0)} · обязательства {money(v.reserved[k])}
                  </small>
                </span>
                <span>{money(v.plan?.allocations[k] ?? 0)}</span>
              </div>
            ))}
          </Panel>}
          {tab === 'requests' && <Panel title="Заявки и решения">
            {v.requests.map((r) => (
              <div className="result" key={r.id}>
                <span>
                  <strong>{r.reason}</strong>
                  <small>
                    {
                      {
                        pending: 'На рассмотрении',
                        approve: 'Утверждено',
                        reject: 'Отклонено',
                        adjust: 'Скорректировано',
                      }[r.status]
                    }{' '}
                    · {r.decision_reason}
                  </small>
                </span>
                {r.status === 'pending' && decide && <Button onClick={() => setEdit(r)}>Рассмотреть</Button>}
              </div>
            ))}
            {year >= current && !v.requests.some((r) => r.status === 'pending') && (
              <div className="panel-body">
                {propose ? (
                  <Button onClick={() => setEdit('new')}>Подать смету</Button>
                ) : (
                  year === current && (
                    <Button
                      disabled={order.busy}
                      onClick={() => void order.send('finance-budget-review', {})}
                    >
                      Запросить смету менеджера
                    </Button>
                  )
                )}
              </div>
            )}
          </Panel>}
        </>
      )}
      {edit && (
        <Dialog
          title={edit === 'new' ? 'Заявка на бюджет' : 'Решение владельца'}
          onClose={() => setEdit(null)}
        >
          <form className="finance-form" onSubmit={submit}>
            {Object.entries(names).map(([k, n]) => (
              <label key={k}>
                {n}, EUR
                <input
                  required
                  name={k}
                  min="0"
                  step=".01"
                  type="number"
                  defaultValue={((edit === 'new' ? v?.plan?.allocations[k] : edit.allocations[k]) ?? 0) / 100}
                />
              </label>
            ))}
            <label>
              Обоснование
              <input name="reason" required minLength={2} maxLength={200} />
            </label>
            {order.error && <p role="alert">{order.error}</p>}
            <div className="finance-actions">
              {edit === 'new' ? (
                <Button primary type="submit" disabled={order.busy}>
                  Отправить заявку
                </Button>
              ) : (
                ['approve', 'adjust', 'reject'].map((val, i) => (
                  <Button key={val} value={val} type="submit" disabled={order.busy}>
                    {['Утвердить исходную', 'С корректировкой', 'Отклонить'][i]}
                  </Button>
                ))
              )}
            </div>
          </form>
        </Dialog>
      )}
    </section>
  )
}
export function CostCap({ c, world }: Props) {
  const tab = businessTab('cap')
  const req = usePersonnel<View>('careers/' + c.id + '/budget', c.revision),
    v = req.data,
    cap = v?.cap,
    atr = v?.atr
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Регламентные лимиты"
        sub="Финансовый период и квоты инженерных ресурсов"
      />
      <BusinessTabs page="cap"/>
      {req.error && <p role="alert">{req.error}</p>}
      {v && (
        <>
          {tab === 'financial' && <Panel title="Финансовый регламент">
            {cap ? (
              <>
                <Facts
                  items={[
                    ['Потолок расходов', money(cap.limit_cents)],
                    ['Учтённые расходы', money(cap.spent_cents)],
                    ['Обязательства', money(cap.committed_cents)],
                    ['Доступно до лимита', money(cap.remaining_cents)],
                    ['Прогноз при текущем темпе', money(cap.forecast_cents)],
                    ['Этапы', cap.rounds],
                    ['Индексация', cap.indexation],
                  ]}
                />
                <p className="panel-body">
                  Исключения модели F1 включают маркетинг, зарплаты пилотов и трёх самых высокооплачиваемых
                  сотрудников. <a href={cap.source}>{cap.version}</a>
                </p>
              </>
            ) : (
              <p className="panel-body">
                Для этой организации и сезона потолок расходов не установлен в базе регламентов.
              </p>
            )}
          </Panel>}
          {tab === 'atr' && <Panel title="Аэродинамические испытания">
            {atr ? (
              <>
                <p className="panel-body">
                  ATP {atr.period.number} · {atr.period.start} — {atr.period.end_exclusive} ·{' '}
                  {atr.percent === null ? 'Ожидает классификации' : atr.percent + '%'}
                </p>
                <Facts
                  items={Object.entries(units).map(([k, n]) => [
                    n,
                    atr.used[k] + ' / ' + (atr.limits?.[k] ?? '—'),
                  ])}
                />
              </>
            ) : (
              <p className="panel-body">Для текущего периода нет применимого лимита ATR.</p>
            )}
          </Panel>}
          {tab === 'audits' && <Panel title="Закрытые периоды">
            {v.audits.length ? (
              v.audits.map((a) => (
                <div className="result" key={a.id}>
                  {a.year} ·{' '}
                  {
                    {
                      minor: 'Малое превышение',
                      material: 'Существенное превышение',
                      compliant: 'Лимит соблюдён',
                    }[a.severity]
                  }{' '}
                  · {money(a.fine_cents)}
                </div>
              ))
            ) : (
              <p className="panel-body">
                Проверки завершённых периодов появятся после закрытия финансового года.
              </p>
            )}
          </Panel>}
        </>
      )}
    </section>
  )
}
