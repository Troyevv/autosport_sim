import { EngineeringHeading } from '../../pitwall/EngineeringHeading'
import { readRoute, sectionTab } from '../../pitwall/core/route'
import { useState } from 'react'
import { ClipboardList, SlidersHorizontal, UsersRound } from 'lucide-react'
import { Button, Choices, Dialog, Facts, Panel } from '../../ui/components'
import { dateLabel } from '../../game'
import { units } from '../../garage/quantities'
import { type Career, money } from '../api'
import type { SectionProps } from '../Sections'
import { usePersonnel } from '../staff/model'
import { useOrder } from '../finance/useOrder'
import {
  decisions,
  focuses,
  modes,
  statuses,
  type Desk,
  type Mandate,
  type Option,
  type Position,
  type Proposal,
} from './model'
import '../research/research.css'
import './council.css'

const workSections: Record<string, string> = {
  research: '#research',
  design: '#development',
  test: '#development',
  produce: '#production',
  repair: '#production',
  lease: '#facilities',
  install: '#garage',
}
const historyLabels = { ...decisions, priority: 'Изменён приоритет', cancel: 'Заказ отменён' }
const describe = (s: string) =>
  s.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (k) => units[k]?.filter(Boolean).join(', ') || k)
const resources = (v: Option) =>
  v.hours ? v.resource + ' · ' + v.hours + ' ч · от ' + v.days + ' дн. при 24 ч/день' : v.resource
function Statements({ positions, people }: { positions: Position[]; people: Desk['people'] }) {
  return (
    <div className="council-statements">
      {positions.map((p) => (
        <article key={p.person + p.stance}>
          <div className="council-byline">
            <span>
              {people[p.person]?.role} · {p.stance}
            </span>
            <b>{people[p.person]?.name}</b>
          </div>
          <p>{describe(p.argument)}</p>
          <small>Уверенность {p.confidence}/100</small>
        </article>
      ))}
    </div>
  )
}
function Policy({
  policy,
  save,
  busy,
  error,
  close,
}: {
  policy: Mandate
  save: (p: Mandate) => void
  busy: boolean
  error: string
  close: () => void
}) {
  const [draft, setDraft] = useState(policy)
  const [limit, setLimit] = useState(String(policy.limit_cents / 100))
  const valid = limit.trim() !== '' && Number.isFinite(+limit) && +limit >= 0 && +limit <= 1e10
  return (
    <Dialog title="Полномочия штаба" onClose={close}>
      <div className="research-form">
        <label>
          Режим управления
          <select
            value={draft.mode}
            onChange={(e) => setDraft({ ...draft, mode: e.target.value as Mandate['mode'] })}
          >
            {Object.entries(modes).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <p>
          {draft.mode === 'manual'
            ? 'Менеджер рассматривает каждое предложение.'
            : draft.mode === 'partial'
              ? 'Руководители утверждают исследования, испытания, партии, ремонт и замену.'
              : 'Главный инженер выбирает вариант и отвечает за утверждённую программу.'}
        </p>
        <label>
          Приоритет
          <select
            value={draft.focus}
            onChange={(e) => setDraft({ ...draft, focus: e.target.value as Mandate['focus'] })}
          >
            {Object.entries(focuses).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Лимит прямых затрат на поручение, €
          <input
            type="number"
            min="0"
            max="10000000000"
            step="0.01"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <label className="council-check">
          <input
            type="checkbox"
            checked={draft.allow_rent}
            onChange={(e) => setDraft({ ...draft, allow_rent: e.target.checked })}
          />{' '}
          Разрешить аренду рабочих слотов по бюджету инфраструктуры
        </label>
        {error && <p role="alert">{error}</p>}
        <Button
          primary
          disabled={busy || !valid}
          onClick={() => save({ ...draft, limit_cents: Math.round(+limit * 100) })}
        >
          Сохранить полномочия
        </Button>
      </div>
    </Dialog>
  )
}
function Dossier({
  r,
  data,
  meeting,
  decide,
}: {
  r: Proposal
  data: Desk
  meeting: boolean
  decide?: (index: number) => void
}) {
  return (
    <Panel title={r.subject} action={<span className="chip">{statuses[r.status]}</span>}>
      <div className="research-card council-dossier">
        <small>
          {dateLabel(r.date)} · {r.entry.toUpperCase()} · {r.occasion}
        </small>
        <h3>Наблюдение</h3>
        <p>{describe(r.observation)}</p>
        <h3>Гипотеза специалиста</h3>
        <p>{r.hypothesis}</p>
        <span>
          {data.people[r.lead].name} · уверенность {r.confidence}/100
        </span>
        <details>
          <summary>Источники ({r.sources.length})</summary>
          <ul>
            {r.materials.map((source) => (
              <li key={source.id}>
                <strong>{source.kind}</strong>
                <p>{source.text}</p>
                <code>{source.id}</code>
                {source.section && <a href={'#' + source.section}>Открыть раздел</a>}
              </li>
            ))}
          </ul>
        </details>
        {r.blocked && <p role="status">{r.blocked}</p>}
        {meeting && (
          <>
            <h3>Позиции участников</h3>
            <Statements positions={r.positions} people={data.people} />
          </>
        )}
        <h3>Сравнение альтернатив</h3>
        <div className="council-alternatives">
          {r.options.map((o, i) => (
            <article key={o.action + i}>
              {i === r.recommended && <small>Рекомендация штаба</small>}
              <h4>{o.title}</h4>
              <p>{describe(o.result)}</p>
              <p>{o.risk}</p>
              <b>{money(o.cost_cents)}</b>
              <span>{resources(o)}</span>
              {decide && <Button onClick={() => decide(i)}>Рассмотреть вариант</Button>}
            </article>
          ))}
        </div>
      </div>
    </Panel>
  )
}
export function Council({
  c,
  world,
  updateCareer,
}: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<Desk>('careers/' + c.id + '/council', c.revision)
  const data = req.data
  const { send, busy, error, clear } = useOrder(c, updateCareer, 'council')
  const [tab, setTab] = useState(() =>
      sectionTab(['agenda', 'meeting', 'execution', 'archive'], 'agenda'),
    ),
    [selected, setSelected] = useState(readRoute().entity),
    [settings, setSettings] = useState(false)
  const [decision, setDecision] = useState<keyof typeof decisions>('approve'),
    [alternative, setAlternative] = useState(0)
  const [target, setTarget] = useState<Proposal | null>(null),
    [reason, setReason] = useState('')
  const [intervention, setIntervention] = useState<Proposal | null>(null),
    [change, setChange] = useState('priority')
  const open = (data?.proposals || []).filter((r) => ['open', 'deferred'].includes(r.status))
  const visible = tab === 'meeting' ? open.filter((r) => r.importance > 1) : open
  const row = visible.find((r) => r.id === selected) || visible[0]
  const manage = c.role === 'manager'
  const proposed =
    target &&
    (decision === 'investigate'
      ? target.investigation
      : target.options[decision === 'delegate' ? target.recommended : alternative])
  return (
    <section className="screen engineering-module research-desk council">
      <EngineeringHeading
        route="council"
        organization={world.organizations[c.org].name}
        maker={c.role === 'manufacturer'}
      >
        {data && manage && (
          <Button
            onClick={() => {
              clear()
              setSettings(true)
            }}
          >
            <SlidersHorizontal size={16} />
            Полномочия
          </Button>
        )}
      </EngineeringHeading>
      {req.error ? (
        <p role="alert">
          {req.error} <Button onClick={req.retry}>Повторить загрузку</Button>
        </p>
      ) : !data ? (
        <p role="status">Загрузка повестки…</p>
      ) : (
        <>
          <div className="council-summary">
            <span>
              <ClipboardList /> На рассмотрении <b>{open.length}</b>
            </span>
            <span>
              <UsersRound /> Управление <b>{modes[data.mandate.mode]}</b>
            </span>
          </div>
          <Choices
            label="Разделы инженерного штаба"
            active={tab}
            onChange={setTab}
            items={[
              ['agenda', 'Предложения'],
              ['meeting', 'Совещания'],
              ['execution', 'Исполнение'],
              ['archive', 'Протоколы'],
            ]}
          />
          {(tab === 'agenda' || tab === 'meeting') && (
            <div className="council-layout">
              <Panel title={tab === 'agenda' ? 'Проблемы и возможности' : 'Повестка совещаний'}>
                {visible.map((r) => (
                  <button
                    className="council-topic"
                    aria-pressed={r.id === row?.id}
                    key={r.id}
                    onClick={() => {
                      setSelected(r.id)
                      if (window.matchMedia('(max-width: 900px)').matches)
                        requestAnimationFrame(() =>
                          document
                            .querySelector('.council-dossier')
                            ?.closest('section')
                            ?.scrollIntoView({ block: 'start' }),
                        )
                    }}
                  >
                    <small>
                      {r.occasion} · {statuses[r.status]}
                    </small>
                    <strong>{r.subject}</strong>
                    <span>
                      {data.people[r.lead].name} · {r.entry.toUpperCase()}
                    </span>
                  </button>
                ))}
                {!visible.length && <p className="research-empty">Открытых вопросов нет.</p>}
              </Panel>
              {row && (
                <Dossier
                  r={row}
                  data={data}
                  meeting={tab === 'meeting'}
                  decide={
                    manage
                      ? (i) => {
                          clear()
                          setAlternative(i)
                          setDecision('approve')
                          setReason('')
                          setTarget(row)
                        }
                      : undefined
                  }
                />
              )}
            </div>
          )}
          {tab === 'execution' && (
            <Panel title="Утверждённые поручения">
              {!data.proposals.some((r) => r.execution) && (
                <p className="research-empty">Утверждённых поручений пока нет.</p>
              )}
              {data.proposals
                .filter((r) => r.execution)
                .map((r) => (
                  <article className="research-card" key={r.id}>
                    <div className="research-heading">
                      <h3>
                        {r.chosen?.title} · {r.subject}
                      </h3>
                      <span className="chip">
                        {statuses[r.execution!.status] || r.execution!.status}
                      </span>
                    </div>
                    <p>
                      {data.people[r.lead].name} · {r.entry.toUpperCase()}
                    </p>
                    {r.execution!.required !== undefined && (
                      <span>
                        Выполнено {r.execution!.worked} из {r.execution!.required} ч
                      </span>
                    )}
                    <p>{r.execution!.reason || r.execution!.result}</p>
                    {r.work && <code>{r.work}</code>}
                    {r.chosen && workSections[r.chosen.action] && (
                      <a href={workSections[r.chosen.action]}>Открыть рабочий раздел</a>
                    )}
                    {manage && r.chosen && ['queued', 'active'].includes(r.execution!.status) && (
                      <Button
                        onClick={() => {
                          clear()
                          setIntervention(r)
                          setChange('priority')
                          setReason('')
                        }}
                      >
                        Изменить поручение
                      </Button>
                    )}
                  </article>
                ))}
            </Panel>
          )}
          {tab === 'archive' && (
            <Panel title="Протоколы решений">
              {!data.history.length && (
                <p className="research-empty">
                  Решений пока нет. Рассмотренные предложения появятся здесь.
                </p>
              )}
              {data.history.map((h) => {
                const r = data.proposals.find((r) => r.id === h.proposal)!
                return (
                  <article className="research-card" key={h.id}>
                    <small>
                      {dateLabel(h.date)} · {data.people[h.person].name}
                    </small>
                    <h3>
                      {r.subject} · {h.choice?.title || historyLabels[h.code]}
                    </h3>
                    <p>{h.reason}</p>
                    <details>
                      <summary>Протокол обсуждения</summary>
                      <p>{describe(h.observation)}</p>
                      <Statements positions={h.positions} people={data.people} />
                      {r.execution && (
                        <p>
                          {statuses[r.execution.status]} · {r.execution.result || r.execution.reason}
                        </p>
                      )}
                    </details>
                  </article>
                )
              })}
            </Panel>
          )}
          {settings && (
            <Policy
              busy={busy}
              error={error}
              policy={data.mandate}
              close={() => {
                if (!busy) setSettings(false)
              }}
              save={async (p) => {
                if (await send('council-mandate', p)) setSettings(false)
              }}
            />
          )}
          {intervention && (
            <Dialog
              title="Изменить поручение"
              onClose={() => {
                if (!busy) setIntervention(null)
              }}
            >
              <div className="research-form">
                <strong>
                  {intervention.chosen?.title} · {intervention.subject}
                </strong>
                <label>
                  Изменение
                  <select value={change} onChange={(e) => setChange(e.target.value)}>
                    <option value="priority">Понизить приоритет</option>
                    {intervention.chosen?.action === 'produce' && (
                      <option value="cancel">Отменить партию</option>
                    )}
                  </select>
                </label>
                <label>
                  Причина вмешательства
                  <textarea value={reason} maxLength={400} onChange={(e) => setReason(e.target.value)} />
                </label>
                {change === 'cancel' && (
                  <p>Цех прекратит работу. Понесённые расходы сохранятся в учёте.</p>
                )}
                {error && <p role="alert">{error}</p>}
                <Button
                  primary
                  disabled={busy || !reason.trim()}
                  onClick={async () => {
                    if (await send('council-intervene', { proposal: intervention.id, change, reason }))
                      setIntervention(null)
                  }}
                >
                  Изменить исполнение
                </Button>
              </div>
            </Dialog>
          )}
          {target && proposed && (
            <Dialog
              title="Решение по предложению"
              onClose={() => {
                if (!busy) setTarget(null)
              }}
            >
              <div className="research-form">
                <strong>
                  {target.subject} · {data.people[target.lead].name}
                </strong>
                <label>
                  Действие менеджера
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as keyof typeof decisions)}
                  >
                    {Object.entries(decisions).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {['approve', 'investigate', 'delegate'].includes(decision) && (
                  <>
                    <h3>{proposed.title}</h3>
                    <Facts
                      items={[
                        ['Прямые затраты', money(proposed.cost_cents)],
                        ['Потребность', resources(proposed)],
                      ]}
                    />
                    <p>{describe(proposed.result)}</p>
                  </>
                )}
                <label>
                  Основание решения
                  <textarea maxLength={400} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                {error && <p role="alert">{error}</p>}
                <Button
                  primary
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await send('council-decide', {
                        proposal: target.id,
                        decision,
                        alternative,
                        reason,
                      })
                    )
                      setTarget(null)
                  }}
                >
                  Подтвердить решение
                </Button>
              </div>
            </Dialog>
          )}
        </>
      )}
    </section>
  )
}
