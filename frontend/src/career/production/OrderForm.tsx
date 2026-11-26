import { useState } from 'react'
import { Button, Dialog, Facts } from '../../ui/components'
import { money } from '../api'
import { priorities } from '../research/model'
import { type Desk, type Need, componentTitle } from './model'

export function OrderForm({
  data,
  need,
  close,
  busy,
  error,
  submit,
}: {
  data: Desk
  need?: Need
  close: () => void
  busy: boolean
  error: string
  submit: (payload: unknown) => void
}) {
  const [eid, setEntry] = useState(need?.entry || data.entries[0].id)
  const entry = data.entries.find((e) => e.id === eid)!
  const [sid, setSpec] = useState(need?.specification || '')
  const drawing =
    entry.choices.find((d) => d.id === sid) ||
    entry.choices.find((d) => !d.modes[0].reason) ||
    entry.choices[0]
  const [external, setExternal] = useState(!!need && !!drawing.modes[0].reason)
  const [rush, setRush] = useState(false),
    [qty, setQty] = useState(String(need?.quantity || 1))
  const [priority, setPriority] = useState('normal')
  const mode = drawing.modes[external ? 1 : 0],
    unit = rush ? mode.rush : mode.normal
  const quantity = Number(qty),
    cost = quantity * unit.cents
  const reason =
    mode.reason ||
    (!Number.isInteger(quantity) || quantity < 1 || quantity > 24
      ? 'Выберите от 1 до 24 экземпляров.'
      : cost > data.limit_cents
        ? 'Недостаточно бюджета или свободных средств.'
        : '')
  return (
    <Dialog title="Новый производственный заказ" onClose={close}>
      <form
        className="research-form workshop-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!reason && !busy)
            submit({ entry: eid, specification: drawing.id, quantity, priority, rush, outsource: external })
        }}
      >
        <label>
          Заявка
          <select
            value={eid}
            onChange={(e) => {
              setEntry(e.target.value)
              setSpec('')
            }}
          >
            {data.entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Спецификация
          <select value={drawing.id} onChange={(e) => setSpec(e.target.value)}>
            {entry.choices.map((d) => (
              <option key={d.id} value={d.id}>
                {componentTitle(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="workshop-fields">
          <label>
            Количество
            <input type="number" min="1" max="24" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label>
            Приоритет
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(priorities).map(([id, v]) => (
                <option key={id} value={id}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Исполнитель
          <select
            value={external ? 'external' : 'internal'}
            onChange={(e) => setExternal(e.target.value === 'external')}
          >
            <option value="internal">Цех команды</option>
            <option value="external">Подрядчик по регламенту</option>
          </select>
        </label>
        <label className="workshop-check">
          <input type="checkbox" checked={rush} onChange={(e) => setRush(e.target.checked)} />
          Срочное изготовление
        </label>
        <Facts
          items={[
            ['К оплате при заказе', money(cost)],
            ['Работа цеха', unit.hours * quantity + ' нормо-ч'],
            ['Ориентир при 24 нормо-ч за смену', Math.ceil((unit.hours * quantity) / 24) + ' смен'],
            ['Доступный бюджет', money(data.limit_cents)],
          ]}
        />
        {rush && <p>Сокращённый цикл повышает вероятность брака. Надбавка включена в смету.</p>}
        {external && (
          <p>Слот подрядчика оплачивается за каждую смену · {money(data.capacity[0].daily_cents * 1.2)}.</p>
        )}
        {(reason || error) && <p role="alert">{reason || error}</p>}
        <Button primary type="submit" disabled={!!reason || busy}>
          Утвердить заказ
        </Button>
      </form>
    </Dialog>
  )
}
