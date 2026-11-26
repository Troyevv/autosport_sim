import { useState } from 'react'
import { Button, Dialog, Facts, Panel } from '../../ui/components'
import { dateLabel } from '../../game'
import { sportingStatus, duties } from '../staff/Lineup'
import { money } from '../api'
import { type Item, type Desk, labels, entryTitle, decisions } from './model'

export function Inventory({
  data,
  quality,
  open,
}: {
  data: Desk
  quality: boolean
  open: (i: Item) => void
}) {
  const [phase, setPhase] = useState('all'),
    [query, setQuery] = useState('')
  const items = data.items.filter(
    (i) =>
      (quality
        ? i.status === 'inspection' || i.status === 'repair'
        : phase === 'all' || i.status === phase) &&
      [i.label, i.serial, i.title, i.batch].join(' ').toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <Panel title={quality ? 'Очередь контроля и ремонта' : 'Реестр физических экземпляров'}>
      <div className="research-filters">
        <label>
          Поиск по реестру
          <input
            type="search"
            placeholder="Узел, партия или серийный номер"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!quality && (
          <label>
            Состояние
            <select value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="all">Все состояния</option>
              {['stock', 'installed', 'inspection', 'repair', 'scrapped'].map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {items.length === 0 && (
        <p className="research-empty">
          {quality ? 'Нет экземпляров на проверке или в ремонте.' : 'По выбранным условиям деталей нет.'}
        </p>
      )}
      <div className="workshop-register">
        {items.map((i) => (
          <button type="button" className="workshop-row" onClick={() => open(i)} key={i.id}>
            <span>
              <strong>
                {i.label} · ред. {i.version}
              </strong>
              <small>
                {i.serial} · {i.batch || 'Начальный парк'}
              </small>
            </span>
            <span>
              {i.rejected && i.status === 'inspection' ? 'Отклонён на контроле' : labels[i.status]}
              <small>
                {i.installed
                  ? entryTitle(data, i.installed)
                  : i.reason || 'Ресурс ' + (i.remaining_m / 1000).toLocaleString('ru') + ' км'}
              </small>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  )
}
export function ItemCard({
  i,
  data,
  manage,
  busy,
  error,
  close,
  submit,
}: {
  i: Item
  data: Desk
  manage: boolean
  busy: boolean
  error: string
  close: () => void
  submit: (action: string, payload: unknown) => void
}) {
  const [decision, setDecision] = useState(''),
    [eid, setEntry] = useState(i.targets.find((t) => !t.reason)?.entry || i.targets[0]?.entry || '')
  const history = [...data.history.filter((h) => h.instance === i.id), ...i.fits].sort((a, b) =>
    b.date.localeCompare(a.date),
  )
  const target = i.targets.find((t) => t.entry === eid)
  const reason =
    target?.reason ||
    (i.status === 'stock' && !i.targets.length
      ? 'Нет допустимой установки с учётом состояния, ресурса и регламента.'
      : '')
  return (
    <Dialog title={i.label + ' · ' + i.serial} onClose={close}>
      <div className="research-form workshop-form">
        <div>
          <span className="chip">{labels[i.status]}</span>
          <h3>
            {i.title} · редакция {i.version}
          </h3>
        </div>
        <Facts
          items={[
            ['Партия', i.batch || 'Начальный парк'],
            ['Дата изготовления', i.made ? dateLabel(i.made) : 'До начала учёта'],
            ['Себестоимость', i.cost_cents !== null ? money(i.cost_cents) : 'Нет исходных данных'],
            ['Пробег', (i.distance_m / 1000).toLocaleString('ru') + ' км'],
            ['Износ', (i.wear_ppm / 10000).toLocaleString('ru') + ' %'],
            ['Остаточный ресурс', (i.remaining_m / 1000).toLocaleString('ru') + ' км'],
            ['Состояние', i.damaged ? 'Повреждён' : i.rejected ? 'Отклонён по протоколу' : labels[i.status]],
            ['Установка', i.installed ? entryTitle(data, i.installed) : 'Свободен от установки'],
          ]}
        />
        <details>
          <summary>Идентификаторы экземпляра и чертежа</summary>
          <p>{i.id}</p>
          <p>{i.specification}</p>
        </details>
        <section>
          <h3>История экземпляра</h3>
          {history.length ? (
            history.map((h, n) => (
              <div className="workshop-log" key={n}>
                <small>
                  {dateLabel(h.date)} · {data.people[h.person]}
                </small>
                <strong>
                  {labels[h.code]} · {entryTitle(data, h.entry)}
                </strong>
              </div>
            ))
          ) : (
            <p>Операций после начала учёта ещё нет.</p>
          )}
        </section>
        {i.reason && <p>{i.reason}</p>}
        {manage && (
          <>
            {i.status === 'stock' && i.targets.length > 0 && (
              <label>
                Распределение между автомобилями
                <select value={eid} onChange={(e) => setEntry(e.target.value)}>
                  {i.targets.map((t) => (
                    <option value={t.entry} key={t.entry}>
                      {entryTitle(data, t.entry)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {i.status === 'stock' &&
              data.entries
                .find((e) => e.id === eid)
                ?.crew.map((person) => (
                  <p key={person.id}>
                    {person.name} · {sportingStatus[person.status] || duties[person.status]}
                  </p>
                ))}
            {reason && <p>{reason}</p>}
            {decision ? (
              <>
                <p>
                  {decision === 'scrap'
                    ? 'Списание окончательно закрывает этот экземпляр.'
                    : decision === 'repair'
                      ? 'Стоимость ремонта · ' + money(i.repair_cents)
                      : 'Подтвердите операцию с экземпляром ' + i.serial + '.'}
                </p>
                <div className="research-actions">
                  <Button onClick={() => setDecision('')} disabled={busy}>
                    Назад
                  </Button>
                  <Button
                    primary
                    disabled={busy}
                    onClick={() =>
                      decision === 'install'
                        ? submit('component-install', { entry: eid, instance: i.id })
                        : submit('production-disposition', { instance: i.id, decision })
                    }
                  >
                    Подтвердить операцию
                  </Button>
                </div>
              </>
            ) : (
              <div className="research-actions">
                {i.status === 'stock' && (
                  <Button primary disabled={!target || !!reason} onClick={() => setDecision('install')}>
                    Установить на машину
                  </Button>
                )}
                {i.actions.map((a) => (
                  <Button key={a} onClick={() => setDecision(a)}>
                    {decisions[a]}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}
