import { useState, type FormEvent } from 'react'
import { Button, Choices, Dialog, Facts, Header, Panel } from '../../ui/components'
import type { SectionProps } from '../Sections'
import { money, type Career } from '../api'
import { usePersonnel } from '../staff/model'
import { useOrder } from './useOrder'
import { OfferForm } from './OfferForm'
import {
  roles,
  zones,
  statuses,
  priorities,
  type Market,
  type Offer,
  type Bid,
  type Terms,
} from './commercialModel'
const tabs = [
  ['brands', 'Рынок спонсоров'],
  ['offers', 'Переговоры'],
  ['contracts', 'Договоры'],
] as const
function Conditions({ t }: { t: Terms }) {
  return (
    <Facts
      items={[
        ['Срок', t.start + ' — ' + t.end],
        ['Статус партнёра', roles[t.role]],
        ['Гарантировано', money(t.fixed_cents)],
        ['В том числе аванс', money(t.advance_cents)],
        ['Интервал выплат', t.interval + ' мес.'],
        ['Бонус за результат', money(t.bonus_cents) + ' · топ-' + t.podium],
        [
          'Реклама',
          t.rights.map((r) => zones[r.zone] + ' ' + r.share + '%').join(', ') || 'По стартовому соглашению',
        ],
        ['Эксклюзивность', t.exclusive ? 'Да' : 'Нет'],
        ['Мероприятия', t.appearances],
        ['Минимальная репутация', t.reputation],
        ['Компенсация', money(t.compensation_cents)],
        ['Продление', t.renew ? 'Предусмотрено' : 'Без продления'],
      ]}
    />
  )
}
export function Commercial({ world, c, updateCareer }: SectionProps & { updateCareer: (c: Career) => void }) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('brands'),
    [query, setQuery] = useState(''),
    [series, setSeries] = useState(''),
    [page, setPage] = useState(0)
  const [profile, setProfile] = useState(''),
    [edit, setEdit] = useState(''),
    [view, setView] = useState(''),
    [counter, setCounter] = useState<Offer | null>(null)
  const order = useOrder(c, updateCareer)
  const req = usePersonnel<Market>('careers/' + c.id + '/commercial', c.revision),
    data = req.data
  const name = (id: string) =>
    data?.brands.find((b) => b.id === id)?.name ?? world.organizations[id]?.name ?? id
  const brands = (data?.brands ?? []).filter(
    (b) =>
      (!series || b.series.includes(series)) && b.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const pages = Math.max(1, Math.ceil(brands.length / 12)),
    current = Math.min(page, pages - 1)
  const detail = data?.brands.find((b) => b.id === profile),
    brand = data?.brands.find((b) => b.id === edit)
  const offer = data?.offers.find((o) => o.id === view),
    deal = data?.contracts.find((d) => d.id === view)
  async function submit(b: Bid) {
    const ok = counter
      ? await order.send('finance-bid-reply', { offer: counter.id, decision: 'counter', counter: b })
      : await order.send('finance-bid', b)
    if (ok) {
      setEdit('')
      setCounter(null)
      setProfile('')
      setView('')
      setTab('offers')
    }
  }
  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!offer) return
    const d = new FormData(e.currentTarget),
      decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    const r = Object.fromEntries(
      ['sponsorship', 'supply', 'discount', 'support', 'seat', 'testing', 'development'].map((k) => [
        k,
        d.has(k),
      ]),
    )
    if (await order.send('finance-bid-reply', { offer: offer.id, decision, ...r })) setView('')
  }
  const close = () => {
    if (!order.busy) {
      setView('')
      setEdit('')
      setProfile('')
      setCounter(null)
      order.clear()
    }
  }
  const error = order.error && (
    <p role="alert" className="career-error">
      {order.error}
    </p>
  )
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Коммерческий отдел"
        sub="Партнёры, переговоры и действующие соглашения программы."
      />
      <Choices label="Коммерческие разделы" items={tabs} active={tab} onChange={setTab} />
      {req.error && (
        <p role="alert">
          {req.error} <Button onClick={req.retry}>Повторить</Button>
        </p>
      )}
      {!data && !req.error && <p role="status">Загрузка рынка…</p>}
      {data && tab === 'brands' && (
        <Panel title="Рынок спонсоров" action={<span>{brands.length} компаний</span>}>
          <div className="finance-tools">
            <label>
              Название
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setPage(0)
                  setQuery(e.target.value)
                }}
              />
            </label>
            <label>
              Интерес к серии
              <select
                value={series}
                onChange={(e) => {
                  setPage(0)
                  setSeries(e.target.value)
                }}
              >
                <option value="">Все чемпионаты</option>
                {Object.values(world.championships).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="brand-grid">
            {brands.slice(current * 12, current * 12 + 12).map((b) => (
              <button className="brand-card" key={b.id} onClick={() => setProfile(b.id)}>
                <small>{world.countries[b.country]}</small>
                <strong>{b.name}</strong>
                <span>{priorities[b.priority]}</span>
                <small>
                  {b.series.map((s) => world.championships[s]?.short_name ?? s.toUpperCase()).join(' · ')}
                </small>
              </button>
            ))}
          </div>
          {!brands.length && <p className="panel-body">Компаний по фильтру нет.</p>}
          <div className="finance-actions">
            <Button disabled={!current} onClick={() => setPage(current - 1)}>
              Назад
            </Button>
            <span>
              {current + 1} / {pages}
            </span>
            <Button disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>
              Далее
            </Button>
          </div>
        </Panel>
      )}
      {data && tab === 'offers' && (
        <Panel title="Ход переговоров">
          {data.offers.length ? (
            data.offers
              .slice()
              .reverse()
              .map((o) => (
                <button key={o.id} className="result commercial-row" onClick={() => setView(o.id)}>
                  <span>
                    <strong>
                      {name(o.terms.sponsor)} · {name(o.terms.org)}
                    </strong>
                    <small>
                      {statuses[o.status]} · до {o.deadline}
                    </small>
                  </span>
                  <b>{money(o.terms.fixed_cents)}</b>
                </button>
              ))
          ) : (
            <p className="panel-body muted">
              Открытых переговоров нет. Выберите компанию на рынке спонсоров.
            </p>
          )}
        </Panel>
      )}
      {data && tab === 'contracts' && (
        <>
          <Panel title="Спонсорские соглашения">
            {data.contracts.map((d) => (
              <button key={d.id} className="result commercial-row" onClick={() => setView(d.id)}>
                <span>
                  <strong>
                    {name(d.sponsor)} · {roles[d.role]}
                  </strong>
                  <small>
                    {statuses[d.status]} · {d.end}
                  </small>
                </span>
                <b>{money(d.fixed_cents)}</b>
              </button>
            ))}
            {!data.contracts.length && (
              <p className="panel-body muted">Спонсорские соглашения отсутствуют.</p>
            )}
          </Panel>
          <Panel title="Связанные поставки">
            {data.supplies.map((d) => (
              <div className="panel-body" key={d.id}>
                <h3>
                  {name(d.sponsor)} · {world.products[d.product].name}
                </h3>
                <Facts
                  items={[
                    ['Клиент', name(d.org)],
                    [
                      'Статус партнёрства',
                      {
                        client: 'Клиент',
                        technical: 'Технический партнёр',
                        commercial: 'Коммерческий партнёр',
                        priority: 'Приоритетный партнёр',
                        works: 'Заводская программа',
                      }[d.partnership ?? 'client'],
                    ],
                    ['Цена после скидки', money(d.sale_cents)],
                    ['Скидка', money(d.discount_cents)],
                    ...(c.org === d.sponsor ? [['Себестоимость', money(d.cost_cents)] as const] : []),
                    ['Поддержка', d.support ? 'Включена' : 'Отдельно'],
                    ['Совместные испытания', d.testing ? 'По регламенту' : 'Нет'],
                    ['Совместная разработка', d.development ? 'По регламенту' : 'Нет'],
                  ]}
                />
                {d.status === 'signed' && (
                  <Button
                    disabled={order.busy}
                    onClick={() => void order.send('finance-end-supply', { contract: d.id })}
                  >
                    Расторгнуть поставку
                  </Button>
                )}
              </div>
            ))}
            {!data.supplies.length && (
              <p className="panel-body muted">Дополнительных пакетов поставки нет.</p>
            )}
          </Panel>
        </>
      )}
      {detail && !brand && (
        <Dialog title={detail.name} onClose={close}>
          <div className="panel-body">
            <Facts
              items={[
                ['Страна', world.countries[detail.country]],
                ['Целевые рынки', detail.markets.map((k) => world.countries[k]).join(', ')],
                ['Стратегия', priorities[detail.priority]],
                ['Свободный бюджет · оценка', money(detail.remaining_estimate_cents)],
                ['Минимум популярности / репутации', detail.min_popularity + ' / ' + detail.min_reputation],
                ['Интерес к организациям', detail.organizations.map(name).join(', ')],
                ['Интерес к пилотам', detail.drivers.map((p) => world.names[p]).join(', ')],
              ]}
            />
            <p className="muted">Предпочтения, бюджеты и условия выплат — игровые оценки.</p>
            <Button
              primary
              onClick={() => {
                setEdit(c.role === 'manufacturer' ? c.org : detail.id)
                setCounter(null)
              }}
              disabled={c.role === 'manufacturer' && detail.id !== c.org}
            >
              Начать переговоры
            </Button>
          </div>
        </Dialog>
      )}
      {brand && (
        <Dialog title={'Условия · ' + brand.name} onClose={close}>
          {error}
          <OfferForm
            c={c}
            world={world}
            brand={brand}
            scholars={data?.scholars ?? []}
            busy={order.busy}
            initial={counter ?? undefined}
            submit={submit}
          />
        </Dialog>
      )}
      {offer && !brand && (
        <Dialog title={'Переговоры · ' + name(offer.terms.sponsor)} onClose={close}>
          <div className="panel-body">
            <p>{offer.reason}</p>
            <Conditions t={offer.terms} />
            {offer.history.length > 1 && (
              <details>
                <summary>История предложений</summary>
                {offer.history.map((b, i) => (
                  <p key={i}>
                    {i + 1}. {money(b.terms.fixed_cents)} · аванс {money(b.terms.advance_cents)} ·{' '}
                    {b.terms.appearances} мероприятий
                  </p>
                ))}
              </details>
            )}
            {['offered', 'counter'].includes(offer.status) && (
              <form className="finance-form" onSubmit={reply}>
                <label>
                  <input type="checkbox" name="sponsorship" defaultChecked />
                  Принять спонсорские условия
                </label>
                {offer.supply && (
                  <fieldset>
                    <legend>Поставка · {money(offer.supply.price_cents)}</legend>
                    {Object.entries({
                      supply: 'Договор поставки',
                      discount: 'Скидка ' + money(offer.supply.discount_cents),
                      support: 'Техническое сопровождение',
                      seat: 'Оплата места ' + money(offer.supply.seat_cents),
                      testing: 'Совместные испытания',
                      development: 'Совместные разработки',
                    }).map(([k, v]) => (
                      <label key={k}>
                        <input
                          type="checkbox"
                          name={k}
                          disabled={
                            k !== 'supply' &&
                            !offer.supply?.[
                              k === 'seat'
                                ? 'seat_cents'
                                : k === 'discount'
                                  ? 'discount_cents'
                                  : (k as 'support')
                            ]
                          }
                        />
                        {v}
                      </label>
                    ))}
                  </fieldset>
                )}
                {error}
                <div className="finance-actions">
                  <Button
                    primary
                    type="submit"
                    value="accept"
                    disabled={order.busy || (offer.actor === c.org && c.role === 'manufacturer')}
                  >
                    Подписать выбранное
                  </Button>
                  <Button
                    onClick={() => {
                      setCounter(offer)
                      setEdit(offer.terms.sponsor)
                    }}
                  >
                    Встречные условия
                  </Button>
                  <Button type="submit" value="reject" disabled={order.busy}>
                    Отказаться
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Dialog>
      )}
      {deal && (
        <Dialog title={'Договор · ' + name(deal.sponsor)} onClose={close}>
          <div className="panel-body">
            <Conditions t={deal} />
            {deal.source && (
              <p>
                <a href={deal.source} target="_blank" rel="noreferrer">
                  Источник партнёрства сезона 2025
                </a>
              </p>
            )}
            <p className="muted">Суммы и сроки расчётов заданы экономикой карьеры.</p>
            {error}
            {deal.status === 'signed' && (
              <Button
                disabled={order.busy}
                onClick={async () => {
                  if (await order.send('finance-end-deal', { contract: deal.id })) close()
                }}
              >
                Расторгнуть с выплатой {money(deal.compensation_cents)}
              </Button>
            )}
          </div>
        </Dialog>
      )}
    </section>
  )
}
