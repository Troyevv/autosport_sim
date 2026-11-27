import { businessTab, BusinessTabs } from '../../pitwall/BusinessTabs'
import { useState, type FormEvent } from 'react'
import { Button, Dialog, Header, Panel } from '../../ui/components'
import { usePersonnel } from '../staff/model'
import type { SectionProps } from '../Sections'
import type { Career } from '../api'
import { useOrder } from './useOrder'
import { zones, type Right, type Market } from './commercialModel'
type Check = Right & {
  entry: string | null
  fulfilled: boolean
  offset?: number
  priority?: number
  color?: string
}
type Inventory = {
  contract: string
  sponsor: string
  org: string
  end: string
  items: Check[]
  mounts: Record<string, { x: number; scale: number }>
}
export function Rights({
  c,
  world,
  updateCareer,
}: SectionProps & { updateCareer: (c: Career) => void }) {
  const result = usePersonnel<Inventory[]>(
    'careers/' + c.id + '/rights?revision=' + c.revision,
    c.revision,
  )
  const market = usePersonnel<Market>('careers/' + c.id + '/commercial', c.revision)
  const [edit, setEdit] = useState<{ d: Inventory; r: Check } | null>(null),
    order = useOrder(c, updateCareer)
  const tab = businessTab('rights')
  const inventory = result.data
    ?.map((d) => ({
      ...d,
      items: d.items.filter((r) => tab === 'all' || r.fulfilled === (tab === 'fulfilled')),
    }))
    .filter((d) => d.items.length || tab === 'all')
  const brand = (id: string) => market.data?.brands.find((b) => b.id === id)?.name ?? 'Партнёр'
  async function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!edit) return
    const f = new FormData(e.currentTarget)
    if (
      await order.send('finance-mount', {
        contract: edit.d.contract,
        zone: edit.r.zone,
        x: Number(f.get('x')),
        scale: Number(f.get('scale')),
        remove: (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'remove',
      })
    )
      setEdit(null)
  }
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Рекламные права"
        sub="Инвентарь договоров и проверка фактических размещений на игровую дату."
      />
      <BusinessTabs page="rights" />
      {result.data && (
        <div className="rights-coverage">
          <strong>
            {result.data.flatMap((d) => d.items).filter((r) => r.fulfilled).length}{' '}
            <small>/ {result.data.flatMap((d) => d.items).length}</small>
          </strong>
          <span>размещений выполнено</span>
          <progress
            aria-label="Исполнение рекламных прав"
            value={result.data.flatMap((d) => d.items).filter((r) => r.fulfilled).length}
            max={Math.max(1, result.data.flatMap((d) => d.items).length)}
          />
        </div>
      )}
      {result.error && (
        <p role="alert">
          {result.error} <Button onClick={result.retry}>Повторить</Button>
        </p>
      )}
      {!result.data && !result.error && <p role="status">Загрузка инвентаря…</p>}
      {inventory?.length === 0 && (
        <Panel title="Инвентарь">
          <p className="panel-body">Для выбранного фильтра нет рекламных прав.</p>
        </Panel>
      )}
      {inventory?.map((d) => (
        <Panel key={d.contract} title={brand(d.sponsor)} action={<small>До {d.end}</small>}>
          {d.items.length === 0 && (
            <p className="panel-body">Обязательные поверхности не согласованы.</p>
          )}
          {d.items.map((r) => (
            <div className="result rights-row" key={r.zone + (r.entry || '')}>
              <span>
                <strong>
                  {zones[r.zone]} {r.entry ? ' · №' + world.entries[r.entry].number : ''}
                </strong>
                {!r.entry && d.mounts[r.zone] && (
                  <span className="mounted-sign">
                    <b
                      style={{
                        left: 100 * d.mounts[r.zone].x + '%',
                        width: 100 * d.mounts[r.zone].scale + '%',
                      }}
                    >
                      {brand(d.sponsor)}
                    </b>
                  </span>
                )}
                <small>
                  <meter min={0} max={100} value={r.share} aria-label="Доля поверхности" /> {r.share}% ·{' '}
                  {r.shared ? 'Допускает совместное размещение' : 'Индивидуальное размещение'} ·{' '}
                  {r.fulfilled ? 'Размещено' : 'Требуется размещение'}
                </small>
              </span>
              {r.entry ? (
                <a className="btn" href={'#livery?entity=' + encodeURIComponent(r.entry)}>
                  В гараж
                </a>
              ) : (
                c.org === d.org && (
                  <Button
                    onClick={() => {
                      order.clear()
                      setEdit({ d, r })
                    }}
                  >
                    Разместить
                  </Button>
                )
              )}
            </div>
          ))}
        </Panel>
      ))}
      {edit && (
        <Dialog
          title={zones[edit.r.zone] + ' · ' + brand(edit.d.sponsor)}
          onClose={() => {
            if (!order.busy) setEdit(null)
          }}
        >
          <form className="finance-form" onSubmit={apply}>
            <p>Текстовое обозначение бренда · {brand(edit.d.sponsor)}</p>
            <label>
              Центр по горизонтали, %
              <input
                required
                type="number"
                name="x"
                min="0"
                max="100"
                defaultValue={Math.round((edit.d.mounts[edit.r.zone]?.x ?? 0.5) * 100)}
              />
            </label>
            <label>
              Размер, %
              <input
                required
                type="number"
                name="scale"
                min="10"
                max="100"
                defaultValue={Math.round(
                  (edit.d.mounts[edit.r.zone]?.scale ?? edit.r.share / 100) * 100,
                )}
              />
            </label>
            {order.error && <p role="alert">{order.error}</p>}
            <div className="finance-actions">
              <Button primary type="submit" disabled={order.busy}>
                Установить знак
              </Button>
              {edit.d.mounts[edit.r.zone] && (
                <Button type="submit" value="remove" disabled={order.busy}>
                  Снять знак
                </Button>
              )}
            </div>
          </form>
        </Dialog>
      )}
    </section>
  )
}
