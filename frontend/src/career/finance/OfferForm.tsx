import { ContractEditor } from '../../pitwall/ContractEditor'
import { useState, type FormEvent } from 'react'
import { Button } from '../../ui/components'
import type { SectionProps } from '../Sections'
import { roles, zones, type Brand, type Bid } from './commercialModel'
export function OfferForm({
  c,
  world,
  brand,
  initial,
  busy,
  submit,
  scholars,
}: { scholars: string[]; brand: Brand; initial?: Bid; busy: boolean; submit: (b: Bid) => void } & Pick<
  SectionProps,
  'c' | 'world'
>) {
  const t = initial?.terms,
    s = initial?.supply,
    maker = c.role === 'manufacturer'
  const clients = Object.values(world.organizations).filter((o) => o.kind === 'team')
  const [org, setOrg] = useState(
    t?.org ?? (maker ? clients.find((o) => o.programs.includes(c.series))!.id : c.org),
  )
  const [series, setSeries] = useState(t?.series ?? world.organizations[org].programs[0])
  const [role, setRole] = useState(t?.role ?? 'partner'),
    [bundle, setBundle] = useState(!!s)
  const entries = Object.values(world.entries).filter((e) => e.org === org && e.championship === series)
  const drivers = [...new Set(entries.flatMap((e) => c.crews[e.id] ?? []))]
  const [selected, setSelected] = useState<string[]>(
    (t?.rights ?? [{ zone: 'garage' }]).map((r) => r.zone),
  )
  const options = (items: Record<string, string>) =>
    Object.entries(items).map(([id, name]) => (
      <option key={id} value={id}>
        {name}
      </option>
    ))
  const amount = (label: string, key: string, value: number, min = 0) => (
    <label>
      {label}, EUR
      <input type="number" name={key} defaultValue={value / 100} min={min} step="0.01" required />
    </label>
  )
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    const str = (k: string) => String(d.get(k) ?? ''),
      num = (k: string) => Number(str(k)),
      cents = (k: string) => Math.round(num(k) * 100),
      flag = (k: string) => d.has(k)
    submit({
      terms: {
        org,
        series,
        sponsor: brand.id,
        role,
        start: str('start'),
        end: str('end'),
        fixed_cents: cents('fixed'),
        advance_cents: cents('advance'),
        interval: num('interval'),
        bonus_cents: cents('bonus'),
        podium: num('podium'),
        compensation_cents: cents('exit'),
        reputation: num('rep'),
        appearances: num('media'),
        exclusive: flag('exclusive'),
        renew: flag('renew'),
        person: role === 'personal' ? str('person') : null,
        academy: role === 'academy' ? str('academy') : null,
        rights: selected.map((zone) => ({
          zone,
          share: num('share-' + zone),
          offset: num('offset-' + zone),
          priority: num('layer-' + zone),
          color: str('color-' + zone) || null,
          shared: flag('shared-' + zone),
        })),
      },
      supply: bundle
        ? {
            product: str('product'),
            price_cents: cents('price'),
            discount_cents: cents('discount'),
            support: flag('support'),
            testing: flag('testing'),
            development: flag('development'),
            academy_person: str('scholar') || null,
            seat_cents: cents('seat'),
          }
        : null,
    })
  }
  return (
    <form className="finance-form offer-form" onSubmit={send}>
      <ContractEditor
        type={bundle ? 'supply' : 'sponsor'}
        title={bundle ? 'Свяжите поставку и права.' : 'Предложите партнёру условия.'}
        eyebrow={initial ? 'Встречное предложение' : 'Проект соглашения'}
        partner={maker ? world.organizations[org].name : brand.name}
        subtitle={world.championships[series]?.name}
        clause="Стороны, срок и обязательства"
      >
        <fieldset>
          <legend>Стороны и срок</legend>
          {maker && (
            <label>
              Клиент
              <select
                value={org}
                onChange={(e) => {
                  setOrg(e.target.value)
                  setSeries(world.organizations[e.target.value].programs[0])
                }}
              >
                {clients.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Чемпионат
            <select value={series} onChange={(e) => setSeries(e.target.value)}>
              {world.organizations[org].programs.map((x) => (
                <option key={x} value={x}>
                  {world.championships[x].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Статус партнёра
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {options(roles)}
            </select>
          </label>
          {role === 'personal' && (
            <label>
              Пилот
              <select name="person" defaultValue={t?.person ?? ''} required>
                {drivers.map((p) => (
                  <option key={p} value={p}>
                    {world.names[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {role === 'academy' && (
            <label>
              Академия
              <select required name="academy" defaultValue={t?.academy ?? ''}>
                {c.academies
                  .filter((a) => a.org === org)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            С даты
            <input
              required
              type="date"
              name="start"
              min={c.date}
              defaultValue={t?.start && t.start > c.date ? t.start : c.date}
            />
          </label>
          <label>
            До даты (исключительно)
            <input
              required
              type="date"
              name="end"
              min={c.date}
              defaultValue={t?.end ?? Number(c.date.slice(0, 4)) + 1 + '-01-01'}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Выплаты и гарантии</legend>
          {amount('Фиксированная сумма', 'fixed', t?.fixed_cents ?? 1000000, 0.01)}
          {amount('Аванс в составе суммы', 'advance', t?.advance_cents ?? 100000)}
          <label>
            Период выплат
            <select name="interval" defaultValue={t?.interval ?? 3}>
              <option value="1">Ежемесячно</option>
              <option value="3">Ежеквартально</option>
              <option value="6">Раз в полгода</option>
            </select>
          </label>
          {amount('Бонус за результат', 'bonus', t?.bonus_cents ?? 0)}
          <label>
            Место не ниже
            <input name="podium" type="number" min="1" max="10" required defaultValue={t?.podium ?? 3} />
          </label>
          {amount('Компенсация при выходе', 'exit', t?.compensation_cents ?? 0)}
          <label>
            Минимальная репутация
            <input
              name="rep"
              required
              type="number"
              min="0"
              max="100"
              defaultValue={t?.reputation ?? 25}
            />
          </label>
          <label>
            Мероприятий за срок
            <input
              required
              type="number"
              name="media"
              min="0"
              max="24"
              defaultValue={t?.appearances ?? 2}
            />
          </label>
          <label>
            <input type="checkbox" name="exclusive" defaultChecked={t?.exclusive} />
            Эксклюзивность в отрасли
          </label>
          <label>
            <input type="checkbox" name="renew" defaultChecked={t?.renew ?? true} />
            Предложить продление
          </label>
        </fieldset>
        <fieldset>
          <legend>Рекламные права</legend>
          {Object.entries(zones).map(([id, name]) => (
            <div key={id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, id] : selected.filter((x) => x !== id))
                  }
                />
                {name}
              </label>
              {selected.includes(id) && (
                <>
                  <label>
                    Доля зоны, %
                    <input
                      name={'share-' + id}
                      type="number"
                      required
                      min="10"
                      max="100"
                      defaultValue={t?.rights.find((r) => r.zone === id)?.share ?? 50}
                    />
                  </label>
                  <label>
                    Левый край зоны, %
                    <input
                      name={'offset-' + id}
                      type="number"
                      required
                      min="0"
                      max="90"
                      defaultValue={t?.rights.find((r) => r.zone === id)?.offset ?? 0}
                    />
                  </label>
                  {['flank', 'upper', 'nose', 'sill', 'shoulder', 'wing'].includes(id) && (
                    <>
                      <label>
                        Минимальный слой
                        <input
                          name={'layer-' + id}
                          type="number"
                          min="0"
                          max="15"
                          defaultValue={t?.rights.find((r) => r.zone === id)?.priority ?? 0}
                        />
                      </label>
                      <label>
                        Цвет кузова (HEX, по желанию)
                        <input
                          name={'color-' + id}
                          pattern="#[a-fA-F0-9]{6}"
                          placeholder="#e10600"
                          defaultValue={t?.rights.find((r) => r.zone === id)?.color ?? ''}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      name={'shared-' + id}
                      defaultChecked={t?.rights.find((r) => r.zone === id)?.shared}
                    />
                    Совместное размещение
                  </label>
                </>
              )}
            </div>
          ))}
        </fieldset>
        {brand.id.startsWith('supplier-') && (
          <fieldset>
            <legend>Договор поставки</legend>
            <label>
              <input type="checkbox" checked={bundle} onChange={(e) => setBundle(e.target.checked)} />
              Включить техническое предложение
            </label>
            {bundle && (
              <>
                <label>
                  Компонент
                  <select name="product" defaultValue={s?.product}>
                    {(world.organizations[brand.id]?.lines ?? [])
                      .filter((x) => ['engine', 'transmission', 'tyre'].includes(x))
                      .map((x) => (
                        <option key={x} value={x}>
                          {world.products[x].name}
                        </option>
                      ))}
                  </select>
                </label>
                {amount('Цена поставки', 'price', s?.price_cents ?? 500000, 0.01)}
                {amount('Скидка', 'discount', s?.discount_cents ?? 0)}
                <label>
                  Воспитанник
                  <select name="scholar" defaultValue={s?.academy_person ?? ''}>
                    <option value="">Без финансирования</option>
                    {Object.entries(world.names)
                      .filter(([id]) => scholars.includes(id))
                      .map(([id, name]) => (
                        <option value={id} key={id}>
                          {name}
                        </option>
                      ))}
                  </select>
                </label>
                {amount('Финансирование места', 'seat', s?.seat_cents ?? 0)}
                {(['support', 'testing', 'development'] as const).map((x, i) => (
                  <label key={x}>
                    <input type="checkbox" name={x} defaultChecked={s?.[x]} />
                    {
                      [
                        'Техническая поддержка',
                        'Совместные испытания по регламенту',
                        'Совместная разработка по регламенту',
                      ][i]
                    }
                  </label>
                ))}
              </>
            )}
          </fieldset>
        )}
        <Button type="submit" primary disabled={busy}>
          Отправить условия
        </Button>
      </ContractEditor>
    </form>
  )
}
