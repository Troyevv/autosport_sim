import { units, fmt } from './quantities'
import { useEffect, useState } from 'react'
import { api, explain, type Career } from '../career/api'
import { useOrder } from '../career/finance/useOrder'
import { Button, Dialog, Facts, Panel } from '../ui/components'
import { dateLabel } from '../game'

type Part = {
  instance: string
  serial: string
  specification: string
  version: number
  title: string
  slot: string
  label: string
  parameters: Record<string, number>
  remaining_m: number
  distance_m: number
  wear_ppm: number
  damaged: boolean
}
type Desk = {
  locked_slots: Record<string,string>
  installation_block: string | null
  development: Record<string, [number, number]>
  policy: 'constructor' | 'standard' | 'homologated'
  since: string
  parts: Record<string, Part>
  assembly: Record<string, number>
  specialists: Record<string, string | null>
  spares: (Part & { assigned_number: string | null })[]
  history: {
    date: string
    id: string
    slot: string
    instance: string
    removed: string
    fitted: Record<string, { serial: string; version: number; distance_m: number; title: string }>
    mechanic: string
    assembly: Record<string, number>
  }[]
  usage: {
    entry: string
    instance: string
    date: string
    reference: string
    distance_m: number
    wear_ppm: number
  }[]
}
function quantities(values: Record<string, number>) {
  return Object.entries(values).map(([k, v]): [string, string] => [units[k][0], fmt(v) + ' ' + units[k][1]])
}
const policy = {
  constructor: 'Конструкторская программа',
  standard: 'Единая техника серии',
  homologated: 'Омологация модели',
}
const roles: Record<string, string> = {
  'chief-engineer': 'Главный инженер',
  'chief-mechanic': 'Главный механик',
  aero: 'Аэродинамика',
  chassis: 'Шасси',
  performance: 'Интеграция',
  reliability: 'Надёжность',
}
type Props = { entry: string; c: Career; update: (c: Career) => void }
export function Components({ entry, c, update }: Props) {
  const [data, setData] = useState<Desk>(),
    [error, setError] = useState(''),
    [attempt, retry] = useState(0)
  const [slot, choose] = useState('rear-wing'),
    [spareId, select] = useState(''),
    [confirm, setConfirm] = useState(false)
  const order = useOrder(c, update, 'engineering')
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setData(undefined)
    api<Desk>(`careers/${c.id}/components/${entry}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(explain(err))
      })
    return () => controller.abort()
  }, [entry, c.id, c.revision, attempt])
  if (!data)
    return (
      <Panel title="Технический паспорт">
        <div className="garage-fields">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <Button onClick={() => retry(attempt + 1)}>Повторить загрузку</Button>
            </>
          ) : (
            <p role="status">Загрузка паспорта…</p>
          )}
        </div>
      </Panel>
    )
  const current = data.parts[slot] || Object.values(data.parts)[0]
  const spares = data.spares.filter((p) => p.slot === current.slot)
  const spare = spares.find((p) => p.instance === spareId) || spares[0]
  const km = (m: number) => fmt(m / 1000) + ' км'
  return (
    <div className="component-desk">
      <Panel title="Технический паспорт">
        <div className="garage-fields">
          <small>{policy[data.policy]}</small>
          <label>
            Узел машины
            <select
              value={current.slot}
              onChange={(e) => {
                choose(e.target.value)
                select('')
                order.clear()
              }}
            >
              {Object.values(data.parts).map((p) => (
                <option key={p.slot} value={p.slot}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <strong>
            {current.title} · v{current.version}
          </strong>
          <span>
            Экземпляр № <code className="component-id">{current.serial}</code>
          </span>
        </div>
        <Facts
          items={[
            ['Пробег с ' + dateLabel(data.since), km(current.distance_m)],
            ['До лимита пробега', km(current.remaining_m)],
            ['Износ', fmt(current.wear_ppm / 10000) + ' %'],
            [
              'Состояние',
              current.damaged
                ? 'Повреждён'
                : current.remaining_m === 0 || current.wear_ppm === 1000000
                  ? 'Ресурс исчерпан'
                  : 'Исправен',
            ],
          ]}
        />
        <div className="garage-fields">
          <details>
            <summary>Параметры спецификации</summary>
            <Facts items={quantities(current.parameters)} />
            <small>Чертёж</small>
            <p>
              <code>{current.specification}</code>
            </p>
          </details>
          {c.role === 'manager' &&
            (spare ? (
              <>
                <label>
                  Доступные экземпляры
                  <select value={spare.instance} onChange={(e) => select(e.target.value)}>
                    {spares.map((p) => (
                      <option key={p.instance} value={p.instance}>
                        {p.title} · v{p.version} ·{' '}
                        {p.instance.endsWith('/spare') ? 'запас' : p.instance.split('/')[0]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  primary
                  disabled={order.busy || !!spare.assigned_number || !!data.installation_block}
                  onClick={() => setConfirm(true)}
                >
                  Согласовать установку
                </Button>
                {spare.assigned_number && (
                  <small>По договору приоритет у заявки №{spare.assigned_number}.</small>
                )}
                {!!data.installation_block && <small>{data.installation_block}</small>}
              </>
            ) : (
              <small>{data.locked_slots[current.slot] || 'Исправных запасных экземпляров для этого узла нет.'}</small>
            ))}
          {order.error && <p role="alert">{order.error}</p>}
        </div>
      </Panel>
      <Panel title="Инженерная концепция">
        <div className="garage-fields">
          <p>
            Расчёт сборки при скоростном напоре 1,5 кПа. Жёсткость подвески и шин определяет рабочий просвет
            днища. Сечение воздухозаборника ограничивает охлаждение и длительную мощность.
          </p>
          <Facts items={quantities(data.assembly)} />
          <small>Проектные параметры — игровые оценки.</small>
          {Object.keys(data.development).length > 0 && (
            <details>
              <summary>Оценка направлений развития</summary>
              <p>
                Главный инженер оценивает возможное относительное изменение профильного параметра при
                следующей доработке.
              </p>
              <Facts
                items={Object.entries(data.development).map(([k, [lo, hi]]) => [
                  data.parts[k].label,
                  lo + '–' + hi + ' %',
                ])}
              />
            </details>
          )}
          <details>
            <summary>Инженерная группа и бюджет</summary>
            <Facts
              items={[
                ...Object.entries(data.specialists).map(([k, v]): [string, string] => [
                  roles[k],
                  v || 'Вакантно',
                ]),
                ['Бюджет разработки', fmt(c.account.development_budget_cents / 100) + ' €'],
                ['Израсходовано', fmt(c.account.development_spent_cents / 100) + ' €'],
                ['Зарезервировано', fmt(c.account.development_reserved_cents / 100) + ' €'],
              ]}
            />
          </details>
        </div>
      </Panel>
      <Panel title="Журнал сборки">
        <div className="garage-fields">
          {!data.history.length && <p>С начала учёта замен не было.</p>}
          {data.history.map((h) => (
            <details key={h.id}>
              <summary>
                {dateLabel(h.date)} · {data.parts[h.slot].label}
              </summary>
              <p>{h.mechanic}</p>
              <p>
                Снят <code>{h.removed}</code>
              </p>
              <p>
                Установлен <code>{h.instance}</code>
              </p>
              <Facts items={quantities(h.assembly)} />
              <details>
                <summary>Состав на дату установки</summary>
                <Facts
                  items={Object.entries(h.fitted).map(([k, p]) => [
                    data.parts[k].label,
                    p.title + ' · v' + p.version + ' · № ' + p.serial + ' · ' + km(p.distance_m),
                  ])}
                />
              </details>
            </details>
          ))}
          <details>
            <summary>Эксплуатация выбранного экземпляра</summary>
            {data.usage.some((e) => e.instance === current.instance) ? (
              data.usage
                .filter((e) => e.instance === current.instance)
                .map((e) => (
                  <p key={e.reference}>
                    {dateLabel(e.date)} · {e.entry} · {km(e.distance_m)} · износ +{fmt(e.wear_ppm / 10000)} %
                  </p>
                ))
            ) : (
              <p>Подтверждённых записей нет.</p>
            )}
          </details>
        </div>
      </Panel>
      {confirm && spare && (
        <Dialog
          title="Установка компонента"
          onClose={() => {
            if (!order.busy) setConfirm(false)
          }}
        >
          <p>
            {current.label} · {spare.title} · v{spare.version}
          </p>
          <Facts
            items={[
              ['Главный механик', data.specialists['chief-mechanic']],
              ['До лимита пробега', km(spare.remaining_m)],
              ...quantities(spare.parameters),
            ]}
          />
          <p>Снятый экземпляр вернётся в запас команды.</p>
          <Button disabled={order.busy} onClick={() => setConfirm(false)}>
            Отмена
          </Button>{' '}
          <Button
            primary
            disabled={order.busy}
            onClick={async () => {
              await order.send('component-install', { entry, instance: spare.instance })
              setConfirm(false)
            }}
          >
            Подтвердить установку
          </Button>
        </Dialog>
      )}
    </div>
  )
}
