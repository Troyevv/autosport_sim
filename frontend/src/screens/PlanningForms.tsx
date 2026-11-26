import { useState } from 'react'
import { useGame, useUI } from '../ui/context'
import { Facts } from '../ui/components'
import type { GameState } from '../game'

export function Mandates() {
  const { state, send } = useGame(),
    { close } = useUI(),
    [values, set] = useState(state.mandates)
  const labels = {
    contracts: 'Контракты пилотов',
    strategy: 'Гоночная стратегия',
    development: 'Проекты разработки',
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send({ type: 'mandates', values })
        close()
      }}
    >
      <p>
        Выберите направления самостоятельной работы руководителей в демонстрационном плане делегирования.
      </p>
      {(Object.keys(labels) as (keyof GameState['mandates'])[]).map((k) => (
        <label key={k} className="toggle-row">
          {labels[k]}
          <input
            type="checkbox"
            checked={values[k]}
            onChange={(e) => set({ ...values, [k]: e.target.checked })}
          />
        </label>
      ))}
      <button className="btn btn-primary">Сохранить полномочия</button>
    </form>
  )
}
export function Capacity() {
  const { state, data, send } = useGame(),
    { close } = useUI(),
    [shifts, set] = useState(state.shifts)
  const load = data.shiftLoads[shifts] + state.load - data.shiftLoads[state.shifts]
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send({ type: 'shifts', value: shifts })
        close()
      }}
    >
      <label className="field">
        Рабочие смены
        <select value={shifts} onChange={(e) => set(+e.target.value)}>
          <option value="1">Одна смена</option>
          <option value="2">Две смены</option>
          <option value="3">Три смены</option>
        </select>
      </label>
      <Facts
        items={[
          ['Плановая загрузка', load + '%'],
          ['Свободная мощность', Math.max(0, 100 - load) + '%'],
        ]}
      />
      {load > 100 && <p>Для принятых заказов недостаточно мощности.</p>}
      <button className="btn btn-primary" disabled={load > 100}>
        Применить план
      </button>
    </form>
  )
}
export function Terms({ id }: { id: string }) {
  const { state, send } = useGame(),
    { close } = useUI(),
    [price, setPrice] = useState(String(state.terms[id].cents / 100000000)),
    [support, setSupport] = useState(state.terms[id].support)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send({ type: 'terms', id, cents: Math.round(Number(price) * 100000000), support })
        close()
      }}
    >
      <label className="field">
        Цена пакета, млн евро
        <input
          type="number"
          min="1"
          max="30"
          step="0.1"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label className="field">
        Техническая поддержка
        <select value={support} onChange={(e) => setSupport(e.target.value)}>
          {['Стандартная', 'Инженер на каждый этап', 'Заводская поддержка'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary">Обновить предложение</button>
    </form>
  )
}
