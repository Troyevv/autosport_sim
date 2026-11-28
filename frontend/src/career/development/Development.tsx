import { sectionTab } from '../../pitwall/core/route'
import { EngineeringHeading } from '../../pitwall/EngineeringHeading'
import { useState } from 'react'
import { Activity, DraftingCompass, FlaskConical, Plus } from 'lucide-react'
import { Button, Choices, Dialog, Facts, Panel, Progress, Stats } from '../../ui/components'
import { dateLabel } from '../../game'
import { fmt, units } from '../../garage/quantities'
import { type Career, money } from '../api'
import type { SectionProps } from '../Sections'
import { useOrder } from '../finance/useOrder'
import { priorities } from '../research/model'
import { usePersonnel } from '../staff/model'
import { Commission } from './Commission'
import { type Desk, type Project, type Report, decisions, version } from './model'
import '../research/research.css'
import './development.css'

export function Measurements({ r }: { r: Report }) {
  const [label, unit] = units[r.metric] || [r.metric, '']
  return (
    <section className="measurement">
      <h4>
        {label} · {unit || 'коэффициент'}
      </h4>
      <div className="measurement-pair">
        {(['a', 'b'] as const).map((k) => (
          <div key={k}>
            <small>
              Образец {k === 'a' ? 'А' : 'Б'} · {version(r[k].specification)}
            </small>
            <strong>
              {fmt(r[k].value)} <small>{unit}</small>
            </strong>
            {r[k].pressure_pa && (
              <small>
                {fmt(r[k].raw)} Н при {r[k].pressure_pa} Па
              </small>
            )}
          </div>
        ))}
      </div>
      <p>{r.conditions}</p>
      <p>
        <b>Разница Б − А</b> {fmt(r.difference)} ± {fmt(r.uncertainty)} {unit}
      </p>
      <p>
        <b>Заключение инженера</b> · {r.interpretation}{' '}
        {r.finding && 'Конструктивный дефект · ' + r.finding}
      </p>
    </section>
  )
}
type Action = {
  kind: 'design' | 'test' | 'priority' | 'review' | 'rent'
  id?: string
  decision?: string
}
function FileCard({
  p,
  data,
  manage,
  open,
}: {
  p: Project
  data: Desk
  manage: boolean
  open: (a: Action) => void
}) {
  const e = data.entries.find((e) => e.id === p.entry)!,
    axis = e.axes.find((a) => a.id === p.axis)!
  const title = p.kind === 'test' ? data.tests[p.method!].label : axis.label
  return (
    <article className="research-card development-card">
      <div className="research-heading">
        <div>
          <small>
            {e.title} · {p.kind === 'test' ? axis.label : 'Конструкторский отдел'}
          </small>
          <h3>{title}</h3>
        </div>
        <span className="chip">
          {p.disposition
            ? decisions[p.disposition]
            : p.finished
              ? 'Протокол готов'
              : p.status === 'active'
                ? 'В работе'
                : 'В очереди'}
        </span>
      </div>
      <div className="research-meta">
        <span>{data.staff[p.lead || ''] || p.participants[p.lead || '']?.name || 'Вакансия'}</span>
        <span>{priorities[p.priority]} приоритет</span>
        <span>
          {money(p.cost_cents)} · {p.paid ? 'оплачено' : 'смета'}
        </span>
      </div>
      <p>
        Исходная {version(p.baseline)}
        {p.specification
          ? ' → ' + version(p.specification)
          : p.candidate
            ? ' / Б · ' + version(p.candidate)
            : ''}{' '}
        · Поручено {dateLabel(p.commissioned)}
      </p>
      {!p.finished && (
        <>
          <Progress value={Math.round((100 * p.worked) / p.required)} />
          <p>
            {p.kind === 'design' ? p.worked + ' / ' + p.required + ' расчётных ч · ' : ''}Остаток при
            доступном слоте · {p.remaining_days} дн., до {dateLabel(p.estimated_finish)}.
          </p>
          {p.reason && <p>{p.reason}</p>}
        </>
      )}
      {p.finished && (
        <p>
          Завершено {dateLabel(p.finished)} · {p.grants.length} слот-дн.
        </p>
      )}
      {p.findings.length > 0 && (
        <strong className="negative">
          Выявлен конструктивный дефект · протоколов {p.findings.length}
        </strong>
      )}
      {p.report && <Measurements r={p.report} />}
      {p.forecast && (
        <details>
          <summary>Прогноз специалистов и риски</summary>
          <p>
            {p.brief === 'balanced'
              ? 'Приоритет совместимости.'
              : 'Приоритет характеристик. Повышенный риск дефекта.'}
          </p>
          <Facts
            items={Object.entries(p.forecast).map(([k, [lo, hi]]) => [
              units[k][0],
              fmt(lo) + ' – ' + fmt(hi) + ' ' + units[k][1],
            ])}
          />
          <h4>Прогноз изменения сборки</h4>
          <Facts
            items={Object.entries(p.package_forecast || {}).map(([k, v]) => [
              units[k][0],
              (v > 0 ? '+' : '') + fmt(v) + ' ' + units[k][1],
            ])}
          />
        </details>
      )}
      <details>
        <summary>Материалы дела и вклад</summary>
        <p>
          {p.id} · {p.regulation} · {p.concept}
        </p>
        {p.evidence.length === 0 ? (
          <p>Основание — документация исходной редакции.</p>
        ) : (
          p.evidence.map((r) => (
            <div key={r.report}>
              <b>{r.hypothesis}</b>
              <p>
                {r.report} · {r.conclusion} · уверенность {r.confidence}%
              </p>
            </div>
          ))
        )}
        {p.test_inputs?.map((id) => (
          <p key={id}>Учтён протокол · {id}</p>
        ))}
        {Object.entries(p.participants).map(([id, c]) => (
          <p key={id}>
            {c.name} · {c.skill} · {c.hours} ч
          </p>
        ))}
        {p.grants.map((g) => (
          <p key={g.reference}>
            {dateLabel(g.start)} · {data.capacity[p.site_kind].label} · состояние {g.condition}% ·{' '}
            {fmt(g.effective_person_days_x100 / 100)} чел.-дн.
          </p>
        ))}
        {p.decisions.map((d) => (
          <p key={d.id}>
            {dateLabel(d.date)} · {decisions[d.code]}
          </p>
        ))}
      </details>
      {manage && (
        <div className="research-actions">
          {!p.finished && (
            <Button onClick={() => open({ kind: 'priority', id: p.id })}>Изменить приоритет</Button>
          )}
          {p.specification && (
            <>
              <Button onClick={() => open({ kind: 'test', id: p.id })}>Испытать редакцию</Button>
              <Button onClick={() => open({ kind: 'design', id: p.id })}>Доработать</Button>
              {p.disposition !== 'released' &&
                !p.findings.length &&
                data.projects.some((t) => t.candidate === p.specification && t.finished) && (
                  <Button onClick={() => open({ kind: 'review', id: p.id, decision: 'released' })}>
                    Допустить к производству
                  </Button>
                )}
              {p.disposition !== 'withdrawn' && (
                <Button onClick={() => open({ kind: 'review', id: p.id, decision: 'withdrawn' })}>
                  Отозвать редакцию
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </article>
  )
}

export function Development({
  c,
  world,
  updateCareer,
}: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<Desk>('careers/' + c.id + '/development', c.revision),
    data = req.error ? undefined : req.data
  const order = useOrder(c, updateCareer, 'development'),
    rental = useOrder(c, updateCareer)
  const [tab, setTab] = useState(() => sectionTab(['design', 'test', 'archive'], 'design')),
    [dialog, setDialog] = useState<Action | null>(null),
    [priority, setPriority] = useState('normal')
  const selected = data?.projects.find((p) => p.id === dialog?.id),
    manage = c.role === 'manager'
  function open(a: Action) {
    order.clear()
    rental.clear()
    setPriority(data?.projects.find((p) => p.id === a.id)?.priority || 'normal')
    setDialog(a)
  }
  const close = () => setDialog(null)
  const [query, setQuery] = useState('')
  const files =
    data?.projects
      .filter((p) => (tab === 'archive' ? p.finished : !p.finished && p.kind === tab))
      .filter((p) =>
        [p.id, data.entries.find((e) => e.id === p.entry)?.title, p.axis, p.kind]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase().trim()),
      ) || []
  return (
    <section className="screen engineering-module research-desk development-desk">
      <EngineeringHeading
        route="development"
        organization={world.organizations[c.org].name}
        maker={c.role === 'manufacturer'}
      />
      {req.error && (
        <p role="alert">
          {req.error} <Button onClick={req.retry}>Повторить загрузку</Button>
        </p>
      )}
      {!data && !req.error && <p role="status">Загрузка инженерных дел…</p>}
      {data && (
        <>
          <Choices
            label="Инженерные дела"
            items={[
              ['design', 'Разработка'],
              ['test', 'Испытания'],
              ['archive', 'Архив решений'],
            ]}
            active={tab}
            onChange={setTab}
          />
          <div className="eng-section-lead">
            <div>
              <h2>
                {tab === 'archive'
                  ? 'Редакции и результаты проверок'
                  : tab === 'test'
                    ? 'Сначала сопоставимые условия'
                    : 'Конструкторское бюро'}
              </h2>
              <p>
                {tab === 'test'
                  ? 'Проверяйте конкретные редакции. Метод, погрешность и условия остаются рядом с результатом.'
                  : 'Свяжите исходный чертёж, задачу инженера и границы применимости.'}
              </p>
            </div>
            <div className="eng-inline-actions">
              {manage && !!data?.entries.length && (
                <>
                  <Button onClick={() => open({ kind: 'test' })}>
                    <FlaskConical size={16} />
                    Назначить испытание
                  </Button>
                  <Button primary onClick={() => open({ kind: 'design' })}>
                    <Plus size={16} />
                    Поручить разработку
                  </Button>
                </>
              )}
            </div>
          </div>

          <details className="eng-summary-details">
            <summary>Показатели отдела</summary>{' '}
            <Stats
              items={[
                [
                  'Проекты КБ',
                  data.projects.filter((p) => p.kind === 'design' && !p.finished).length,
                  'В очереди и в работе',
                  <DraftingCompass size={16} />,
                ],
                [
                  'Сеансы испытаний',
                  data.projects.filter((p) => p.kind === 'test' && !p.finished).length,
                  'Ожидают измерений',
                  <Activity size={16} />,
                ],
                [
                  'Расходы отдела',
                  money(data.spent_cents),
                  'Аренда объектов отдельно · ' + money(data.rent_cents),
                ],
                ['Архив', data.projects.filter((p) => p.finished).length, 'Завершённые дела'],
              ]}
            />
          </details>

          <label className="eng-filter">
            <input
              type="search"
              aria-label="Поиск инженерного дела"
              placeholder="Найти работу или редакцию"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="research-layout">
            <Panel
              title={
                tab === 'archive'
                  ? 'Спецификации и протоколы'
                  : tab === 'design'
                    ? 'Очередь конструкторского бюро'
                    : 'Программа испытаний'
              }
            >
              {files.length ? (
                files.map((p) => <FileCard key={p.id} p={p} data={data} manage={manage} open={open} />)
              ) : (
                <div className="research-empty">
                  <DraftingCompass />
                  <h3>{tab === 'archive' ? 'Архив пока пуст' : 'Свободная очередь'}</h3>
                  <p>
                    {!data.entries.length
                      ? 'Раздел показывает дела конструкторских подразделений гоночных команд.'
                      : tab === 'archive'
                        ? 'Здесь сохраняются выпущенные чертежи, отзывы и результаты сравнений.'
                        : tab === 'design'
                          ? 'Выберите заявку и исходную редакцию для работы отдела.'
                          : 'Назначьте метод и сравниваемые редакции.'}
                  </p>
                </div>
              )}
            </Panel>
            <aside>
              <Panel title="Мощности на сегодня">
                {Object.entries(data.capacity).map(([k, v]) => (
                  <div className="research-card" key={k}>
                    <div className="research-heading">
                      <h3>{v.label}</h3>
                      <span className="chip">{v.slots} своб.</span>
                    </div>
                    <p>
                      Своих слотов {v.owned} · занято сегодня {v.used}. Общий центр · {v.condition}%
                      состояния · {money(v.rent)}/день
                    </p>
                    {manage && (
                      <Button disabled={v.free < 1} onClick={() => open({ kind: 'rent', id: k })}>
                        Арендовать · {v.label}
                      </Button>
                    )}
                  </div>
                ))}
              </Panel>
            </aside>
          </div>
          {dialog && (dialog.kind === 'design' || dialog.kind === 'test') && (
            <Commission data={data} mode={dialog.kind} source={selected} order={order} close={close} />
          )}
          {dialog?.kind === 'rent' && (
            <Dialog title="Аренда мощности" onClose={close}>
              <p>
                {data.capacity[dialog.id!].label} · один слот на семь дней с {dateLabel(c.date)}.
              </p>
              <p>Расход на инфраструктуру · {money(data.capacity[dialog.id!].rent * 7)}</p>
              {rental.error && <p role="alert">{rental.error}</p>}
              <Button
                primary
                disabled={rental.busy}
                onClick={async () => {
                  if (
                    await rental.send('finance-lease', {
                      facility: 'shared:' + dialog.id,
                      start: c.date,
                      days: 7,
                      units: 1,
                      mode: 'lease',
                    })
                  )
                    close()
                }}
              >
                Подтвердить аренду
              </Button>
            </Dialog>
          )}
          {selected && dialog?.kind === 'priority' && (
            <Dialog title="Изменить приоритет" onClose={close}>
              <form
                className="research-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (await order.send('development-priority', { project: selected.id, priority }))
                    close()
                }}
              >
                <label>
                  Приоритет
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {Object.entries(priorities).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                {order.error && <p role="alert">{order.error}</p>}
                <button className="btn btn-primary" disabled={order.busy}>
                  Сохранить приоритет
                </button>
              </form>
            </Dialog>
          )}
          {selected && dialog?.kind === 'review' && (
            <Dialog title="Решение по редакции" onClose={close}>
              <p>
                {version(selected.specification!)} · {decisions[dialog.decision!]}. Решение будет внесено
                в дело.
              </p>
              {order.error && <p role="alert">{order.error}</p>}
              <Button
                primary
                disabled={order.busy}
                onClick={async () => {
                  if (
                    await order.send('development-review', {
                      project: selected.id,
                      disposition: dialog.decision,
                    })
                  )
                    close()
                }}
              >
                Подтвердить решение
              </Button>
            </Dialog>
          )}
        </>
      )}
    </section>
  )
}
