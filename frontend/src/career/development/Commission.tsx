import { useState } from 'react'
import { Button, Dialog, Facts } from '../../ui/components'
import { money } from '../api'
import { useOrder } from '../finance/useOrder'
import { priorities, type Priority } from '../research/model'
import { quota, version, type Desk, type Project } from './model'

export function Commission({
  data,
  mode,
  source,
  order,
  close,
}: {
  data: Desk
  mode: 'design' | 'test'
  source?: Project
  order: ReturnType<typeof useOrder>
  close: () => void
}) {
  const [eid, setEntry] = useState(source?.entry || data.entries[0].id)
  const entry = data.entries.find((e) => e.id === eid)!
  const [topic, setTopic] = useState(
    source?.axis || (mode === 'design' && entry.axes.find((a) => !a.blocked)?.id) || entry.axes[0].id,
  )
  const axis = entry.axes.find((a) => a.id === topic) || entry.axes[0]
  const [base, setBase] = useState((mode === 'design' && source?.specification) || source?.baseline || '')
  const [candidate, setCandidate] = useState(source?.specification || '')
  const baseline =
    axis.versions.find((v) => v.id === base) || axis.versions.find((v) => v.id === axis.fitted)!
  const target = axis.versions.find((v) => v.id === candidate) || axis.versions[axis.versions.length - 1]
  const [method, setMethod] = useState(axis.methods[0]),
    [brief, setBrief] = useState('balanced'),
    [priority, setPriority] = useState<Priority>('normal')
  const protocol = axis.methods.includes(method) ? method : axis.methods[0],
    test = data.tests[protocol]
  const design = mode === 'design',
    site = data.capacity[design ? 'design' : test.site]
  const blocked = !entry.admitted
    ? 'Допуск программы приостановлен.'
    : !axis.lead
      ? 'Ответственная должность вакантна.'
      : design
        ? axis.blocked
        : null
  const options = axis.versions.map((v) => (
    <option key={v.id} value={v.id}>
      {version(v.id)} · {v.title}
    </option>
  ))
  return (
    <Dialog title={design ? 'Поручить разработку' : 'Назначить испытание'} onClose={close}>
      <form
        className="research-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const common = { entry: eid, baseline: baseline.id, priority }
          if (
            await order.send(
              design ? 'development-design' : 'development-test',
              design ? { ...common, brief } : { ...common, candidate: target.id, method: protocol },
            )
          )
            close()
        }}
      >
        <label>
          Заявка
          <select value={eid} onChange={(e) => setEntry(e.target.value)}>
            {data.entries.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Узел
          <select value={axis.id} onChange={(e) => setTopic(e.target.value)}>
            {entry.axes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {design ? 'Исходная редакция' : 'Образец А'}
          <select value={baseline.id} onChange={(e) => setBase(e.target.value)}>
            {options}
          </select>
        </label>
        {design ? (
          <label>
            Задача отдела
            <select value={brief} onChange={(e) => setBrief(e.target.value)}>
              <option value="balanced">Сдержать нагрузку на смежные узлы</option>
              <option value="performance">Расширить рабочий диапазон узла</option>
            </select>
          </label>
        ) : (
          <>
            <label>
              Образец Б
              <select value={target.id} onChange={(e) => setCandidate(e.target.value)}>
                {options}
              </select>
            </label>
            <label>
              Метод проверки
              <select value={protocol} onChange={(e) => setMethod(e.target.value)}>
                {axis.methods.map((k) => (
                  <option key={k} value={k}>
                    {data.tests[k].label}
                  </option>
                ))}
              </select>
            </label>
            {baseline.id === target.id && <p>Два измерения одной редакции для проверки повторяемости.</p>}
          </>
        )}
        <label>
          Приоритет
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(priorities).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Facts
          items={[
            ['Ответственный', data.staff[axis.lead || ''] || 'Вакансия'],
            ['Изготовитель исходной версии', baseline.maker],
            ['Оборудование', site.label],
            ['Доступно слотов сегодня', site.slots],
            ['Срок после выделения слота', design ? Math.ceil(axis.hours / 24) + ' раб. дн.' : '1 раб. день'],
            [
              design ? 'Расход при утверждении' : 'Расход в день проверки',
              money(design ? axis.price : test.cost),
            ],
            ...(design
              ? ([
                  [
                    'Инженерный риск',
                    brief === 'balanced'
                      ? 'Ограниченный эффект, возможен дефект'
                      : 'Выше разброс результата и риск дефекта',
                  ],
                ] as [string, string][])
              : []),
            ...(!design && entry.atr_applicable && Object.keys(test.atr).length
              ? ([
                  [
                    'Расход ATR',
                    Object.entries(test.atr)
                      .map(([k, v]) => v + ' ' + quota[k])
                      .join(' · '),
                  ],
                ] as [string, string][])
              : []),
          ]}
        />
        {blocked && <p role="status">{blocked}</p>}
        {order.error && <p role="alert">{order.error}</p>}
        <div className="research-actions">
          <Button onClick={close}>Отмена</Button>
          <button className="btn btn-primary" disabled={!!blocked || order.busy}>
            Утвердить поручение
          </button>
        </div>
      </form>
    </Dialog>
  )
}
