import { useState, type FormEvent } from 'react'
import { Button, Dialog, Header, Panel, Facts } from '../../ui/components'
import { usePersonnel } from '../staff/model'
import { money, type Career } from '../api'
import type { SectionProps } from '../Sections'
import { category } from './model'
import { useOrder } from './useOrder'
type License = { region: string; offer: string; unit_cents: number; since: string }
type Supply = {
  contract: string
  client: string
  discount_cents: number
  production_cents: number
  margin_cents: number
  units: number
  commercial_cents: number
  confirmed_reach: number
  service_costs: Record<string, number>
}
type Data = {
  license: License | null
  audience: Record<string, number>
  receipts: { reference: string; kind: string; day: string; country: string; reach: number }[]
  sales: Record<string, { units: number; revenue_cents: number; cost_cents: number }>
  flows: Record<string, Record<string, number>>
  suppliers: Supply[]
  can_advance: boolean
}
const regions: Record<string, string> = {
  GB: 'Великобритания',
  IT: 'Италия',
  DE: 'Германия',
  FR: 'Франция',
  US: 'США',
  JP: 'Япония',
  ES: 'Испания',
}
export function Economy({ c, world, updateCareer }: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<Data>('careers/' + c.id + '/economy', c.revision),
    v = req.data,
    order = useOrder(c, updateCareer)
  const [edit, set] = useState(false),
    [tab, select] = useState('Сбыт и лицензии'),
    [year, setYear] = useState(c.date.slice(0, 4))
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (
      await order.send('finance-distribution', {
        region: f.get('region'),
        offer: f.get('offer'),
        unit_cents: Math.round(Number(f.get('price')) * 100),
      })
    )
      set(false)
  }
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Экономика организации"
        sub="Коммерческие решения и результаты по сезонам"
      />
      <div className="finance-actions">
        {[
          'Сбыт и лицензии',
          'Годовые показатели',
          ...(c.role === 'manufacturer' ? ['Экономика поставок'] : []),
          'Рынки',
        ].map((n) => (
          <Button key={n} primary={tab === n} onClick={() => select(n)}>
            {n}
          </Button>
        ))}
      </div>
      {(req.error || order.error) && <p role="alert">{req.error || order.error}</p>}
      {v && (
        <>
          {tab === 'Сбыт и лицензии' && (
            <Panel
              title="Лицензионная коллекция"
              action={
                <Button onClick={() => set(true)}>
                  {v.license ? 'Изменить условия' : 'Открыть продажи'}
                </Button>
              }
            >
              {v.license ? (
                <Facts
                  items={[
                    ['Рынок', regions[v.license.region]],
                    ['Коллекция', v.license.offer === 'premium' ? 'Премиальная' : 'Стандартная'],
                    ['Цена', money(v.license.unit_cents)],
                    ['Действует с', v.license.since],
                  ]}
                />
              ) : (
                <p className="panel-body">Договор с дистрибьютором ещё не заключён.</p>
              )}
            </Panel>
          )}
          {tab === 'Годовые показатели' && (
            <>
              <label>
                Год отчёта{' '}
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                  {[...new Set([c.date.slice(0, 4), ...Object.keys(v.flows), ...Object.keys(v.sales)])]
                    .sort()
                    .reverse()
                    .map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                </select>
              </label>
              <Panel title="Продажи дистрибьютора">
                <Facts
                  items={[
                    ['Продано единиц', v.sales[year]?.units ?? 0],
                    ['Оборот', money(v.sales[year]?.revenue_cents ?? 0)],
                    ['Себестоимость', money(v.sales[year]?.cost_cents ?? 0)],
                    [
                      'Результат лицензии',
                      money((v.sales[year]?.revenue_cents ?? 0) - (v.sales[year]?.cost_cents ?? 0)),
                    ],
                  ]}
                />
              </Panel>
              <Panel title="Денежный поток организации">
                {Object.keys(v.flows[year] ?? {}).length ? (
                  <Facts items={Object.entries(v.flows[year]).map(([k, n]) => [category(k), money(n)])} />
                ) : (
                  <p className="panel-body">За период нет проводок.</p>
                )}
              </Panel>
            </>
          )}
          {tab === 'Экономика поставок' &&
            (v.suppliers.length ? (
              v.suppliers.map((d) => (
                <Panel key={d.contract} title={world.organizations[d.client].name}>
                  <Facts
                    items={[
                      ['Маржа договора', money(d.margin_cents)],
                      ['Себестоимость поставки', money(d.production_cents)],
                      ['Скидка', money(d.discount_cents)],
                      ['Спонсорские выплаты', money(d.commercial_cents)],
                      ['Гарантийные замены', money(d.service_costs.warranty)],
                      ['Логистика', money(d.service_costs.shipping)],
                      ['Техническая поддержка', money(d.service_costs.support)],
                      ['Разработка', money(d.service_costs.research)],
                      ['Исполненный объём, ед.', d.units],
                      ['Подтверждённый охват', d.confirmed_reach],
                    ]}
                  />
                </Panel>
              ))
            ) : (
              <Panel title="Клиентские договоры">
                <p className="panel-body">Подписанных пакетов поставки пока нет.</p>
              </Panel>
            ))}
          {tab === 'Рынки' && (
            <>
              <Panel title="Региональный спрос">
                <Facts items={Object.entries(v.audience).map(([k, n]) => [regions[k] ?? k, n + ' / 100'])} />
              </Panel>
              <Panel title="Подтверждённые публикации">
                {v.receipts.length ? (
                  v.receipts.map((r) => (
                    <div className="result" key={r.reference}>
                      {r.day} · {regions[r.country] ?? r.country} · охват {r.reach}
                    </div>
                  ))
                ) : (
                  <p className="panel-body">Подтверждённых публикаций пока нет.</p>
                )}
              </Panel>
            </>
          )}
          {v.can_advance && (
            <Panel title="Финансовый период">
              <div className="panel-body">
                <Button primary disabled={order.busy} onClick={() => void order.send('finance-month', {})}>
                  Закрыть месяц
                </Button>
              </div>
            </Panel>
          )}
        </>
      )}
      {edit && (
        <Dialog title="Условия дистрибуции" onClose={() => set(false)}>
          <form className="finance-form" onSubmit={submit}>
            <label>
              Рынок
              <select name="region" defaultValue={v?.license?.region ?? 'GB'}>
                {Object.entries(regions).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Коллекция
              <select name="offer" defaultValue={v?.license?.offer ?? 'standard'}>
                <option value="standard">Стандартная · себестоимость 11,30 EUR</option>
                <option value="premium">Премиальная · себестоимость 19,40 EUR</option>
                {v?.license && <option value="withdraw">Отозвать лицензию</option>}
              </select>
            </label>
            <label>
              Цена за единицу, EUR
              <input
                type="number"
                step=".01"
                name="price"
                min="1"
                max="200"
                defaultValue={(v?.license?.unit_cents ?? 2900) / 100}
                required
              />
            </label>
            <p>
              Организация получает разницу между ценой и себестоимостью каждой проданной единицы. Размер
              партии зависит от спроса и доступных средств.
            </p>
            {order.error && <p role="alert">{order.error}</p>}
            <Button primary type="submit" disabled={order.busy}>
              Сохранить условия
            </Button>
          </form>
        </Dialog>
      )}
    </section>
  )
}
