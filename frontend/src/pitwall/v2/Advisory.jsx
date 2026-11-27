import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useGame, useStored } from '../core'
import { Icon } from '../ui'
import { PersonPortrait } from '../visuals'
import { DataChart } from './charts'
import {
  AXES,
  CATEGORIES,
  METRICS,
  STAGES,
  SUPPORTED_ROUTES,
  addDays,
  asList,
  buildBrief,
  engineeringModel,
  euro,
  financeModel,
  metric,
  number,
  orgName,
  peopleModel,
  person,
  positionName,
  productionModel,
  routeKind,
  shortDate,
  total,
} from './advisory-model'
import './advisory.css'

const SERIES = ['var(--org-accent,#d4cec2)', '#d4ad7b', '#949491', '#c4908a']
const euros = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
const choice = (id, label) => ({ id, label })
function LinkButton({ children, onClick, primary = false, icon = 'ArrowUpRight', ...rest }) {
  return (
    <button
      type="button"
      className={'adv-button' + (primary ? ' primary' : '')}
      onClick={onClick}
      {...rest}
    >
      {children}
      {icon && <Icon name={icon} size={15} />}
    </button>
  )
}
function Info({ children, tone = '' }) {
  return (
    <div className={'adv-note ' + tone}>
      <Icon name={tone === 'warning' ? 'TriangleAlert' : 'Info'} size={16} />
      <p>{children}</p>
    </div>
  )
}
function Field({ label, children }) {
  return (
    <label className="adv-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
function Segments({ items, value, onChange, label }) {
  return (
    <div className="adv-segments" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          aria-pressed={value === item.id}
          key={item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
function Empty({ title, children, action }) {
  return (
    <div className="adv-empty">
      <Icon name="FileSearch" size={25} />
      <div>
        <h4>{title}</h4>
        <p>{children}</p>
        {action}
      </div>
    </div>
  )
}
function Facts({ rows }) {
  return (
    <dl className="adv-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
function PersonLink({ g, p, description, compact = false }) {
  return (
    <button
      type="button"
      className={'adv-person' + (compact ? ' compact' : '')}
      onClick={() => p?.id && g.openPerson(p.id)}
      disabled={!p?.id}
    >
      {p ? (
        <PersonPortrait person={p} size={compact ? 36 : 64} />
      ) : (
        <span className="adv-person-unknown">
          <Icon name="UserRound" size={25} />
        </span>
      )}
      <span>
        <b>{p?.name || 'Ответственный не назначен'}</b>
        <small>{description || positionName(g, p?.position)}</small>
      </span>
      {p?.id && <Icon name="ArrowUpRight" size={13} />}
    </button>
  )
}

/** Readable first, auditable second. Actual source statements remain distinct
 * from the interface's deterministic summaries and local follow-up markers. */
export function AdvisorBrief({
  route,
  brief: provided,
  context = {},
  compact = false,
  contextual = false,
  onExplore,
  onNavigate,
}) {
  const g = useGame(),
    brief = provided || buildBrief(g, route || g.route, context),
    [marks, setMarks] = useStored('v2.advisor.reading', {}),
    [expanded, setExpanded] = useState(false),
    id = useId()
  useEffect(() => setExpanded(false), [brief?.id, g.scope])
  if (!brief) return null
  const mark = marks[brief.id],
    navigate = onNavigate || g.navigate,
    availableOptions = brief.options.filter((option) => !option.analysis || onExplore)
  const follow = () => {
    const watched = mark?.state === 'watching'
    setMarks((old) => ({
      ...old,
      [brief.id]: { state: watched ? 'read' : 'watching', date: g.game.career.date },
    }))
    g.notify(
      watched
        ? 'Пометка контроля снята'
        : 'Доклад отмечен для контроля. Поручение сотруднику не создано.',
    )
  }
  const act = (option) => {
    if (option.analysis) {
      onExplore?.(option.analysis)
      return
    }
    navigate(option.route, option.tab || '', option.entity || '')
  }
  return (
    <section
      className={
        'adv-brief ' +
        (compact ? 'compact ' : '') +
        (contextual ? 'compact-context ' : '') +
        (expanded ? 'is-expanded ' : '') +
        'kind-' +
        brief.kind
      }
      aria-label={brief.eyebrow}
    >
      <div className="adv-brief-rail">
        <span className="adv-document-mark">
          <Icon
            name={
              brief.kind === 'finance'
                ? 'ChartNoAxesCombined'
                : brief.kind === 'people'
                  ? 'UsersRound'
                  : brief.kind === 'production'
                    ? 'Factory'
                    : brief.kind === 'capital'
                      ? 'Landmark'
                      : 'Radio'
            }
            size={20}
          />
        </span>
        <span>BRIEFING</span>
        <i />
      </div>
      <div className="adv-brief-main">
        <header className="adv-brief-heading">
          <div>
            <span className="adv-eyebrow">{brief.eyebrow}</span>
            <h2>{brief.title}</h2>
          </div>
          <span className={'adv-urgency ' + brief.urgency?.tone}>
            <Icon name="Clock3" size={13} />
            {brief.urgency?.label}
          </span>
        </header>
        <div className="adv-report-body">
          <aside>
            <PersonLink g={g} p={brief.author} description={brief.authorRole} />
            <span className="adv-report-date">
              {shortDate(brief.date)} ·{' '}
              {brief.author?.id === 'player' ? 'ваша финансовая сводка' : 'материалы организации'}
            </span>
            {brief.competence && (
              <div className="adv-competence">
                <span>{brief.competence.label}</span>
                <b>
                  {brief.competence.value}
                  <small> / 100</small>
                </b>
              </div>
            )}
          </aside>
          <div className="adv-brief-narrative">
            <p className="adv-report-summary">{brief.summary}</p>
            <p className="adv-report-consequence">{brief.consequence}</p>
            <Facts rows={brief.facts} />
          </div>
        </div>
        <div className="adv-brief-controls">
          <button
            type="button"
            className="adv-disclosure"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded(!expanded)}
          >
            <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} />
            {expanded
              ? 'Свернуть основания'
              : contextual
                ? 'Доклад и варианты'
                : 'Варианты, основания и ограничения'}
            {brief.positions.length > 1 && <span>{brief.positions.length} позиции специалистов</span>}
          </button>
          <button
            type="button"
            className={'adv-watch ' + (mark?.state === 'watching' ? 'active' : '')}
            onClick={follow}
            aria-pressed={mark?.state === 'watching'}
          >
            <Icon name={mark?.state === 'watching' ? 'BookmarkCheck' : 'Bookmark'} size={15} />
            {mark?.state === 'watching' ? 'На контроле' : 'Взять на контроль'}
          </button>
        </div>
        {expanded && (
          <div className="adv-brief-details" id={id}>
            {brief.positions.length > 0 && (
              <div
                className="adv-positions"
                style={{ '--position-columns': Math.min(brief.positions.length, 3) }}
              >
                <h3>
                  {brief.positions.some((p) => p.stance === 'Возражение')
                    ? 'Почему штаб не единодушен'
                    : 'Позиции специалистов'}
                </h3>
                {brief.positions.map((position, i) => (
                  <article
                    key={position.person?.id || i}
                    className={position.stance === 'Возражение' ? 'is-objection' : ''}
                  >
                    <div>
                      <PersonLink g={g} p={position.person} compact />
                      <span className="adv-stance">{position.stance}</span>
                    </div>
                    <blockquote>{position.argument}</blockquote>
                    <small>
                      Оценка автора:{' '}
                      {position.confidence == null ? 'не раскрыта' : position.confidence + ' / 100'}
                    </small>
                  </article>
                ))}
              </div>
            )}
            <div className="adv-options">
              <h3>Решения на вашем уровне</h3>
              {availableOptions.map((option, index) => (
                <button
                  type="button"
                  key={option.label + index}
                  onClick={() => act(option)}
                  className={'adv-option ' + (option.recommended ? 'recommended' : '')}
                >
                  <span className="adv-option-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="adv-option-body">
                    <b>
                      {option.label}
                      {option.recommended && <em>Рекомендация автора</em>}
                    </b>
                    <span>{option.detail}</span>
                    {option.warning && (
                      <small>
                        <Icon name="TriangleAlert" size={12} />
                        {option.warning}
                      </small>
                    )}
                  </span>
                  <span className="adv-option-cost">
                    {option.cost != null && <b>{euro(option.cost)}</b>}
                    {option.days != null && (
                      <small>{option.days ? option.days + ' дн.' : 'Без новой работы'}</small>
                    )}
                    <Icon name="ArrowUpRight" size={17} />
                  </span>
                </button>
              ))}
            </div>
            <div className="adv-source-panel">
              <span className="adv-eyebrow">Что известно и чего мы пока не знаем</span>
              {brief.limits.map((limit, i) => (
                <p key={i}>
                  <Icon name="Info" size={13} />
                  {limit}
                </p>
              ))}
              <small>
                Основание: {brief.source} · SHA {g.game.career.date}. Редакционная сводка по доступным
                данным карьеры.
              </small>
            </div>
          </div>
        )}
        {!expanded && availableOptions.length > 0 && (
          <div className="adv-first-action">
            <span>{g.role === 'owner' ? 'Ваша зона решения' : 'Следующий шаг'}</span>
            <LinkButton primary onClick={() => act(availableOptions[0])}>
              {availableOptions[0].label}
            </LinkButton>
          </div>
        )}
      </div>
    </section>
  )
}

function Forecast({ g, model, state, update }) {
  const horizon = state.horizon || 6,
    months = model.forecast.slice(0, horizon),
    mode = state.forecastMode || 'scenarios',
    spend = Number(state.scenarioSpend) || 0,
    point = months[Math.min(state.monthIndex || 0, months.length - 1)]
  const rows = months.map((row) => ({ ...row, decision: row.base - spend }))
  return (
    <>
      <div className="adv-analytics-toolbar">
        <Segments
          label="Режим финансового прогноза"
          items={[choice('scenarios', 'Сценарии API'), choice('decision', 'Проверить решение')]}
          value={mode}
          onChange={(value) => update({ forecastMode: value })}
        />
        <Segments
          label="Горизонт прогноза"
          items={[choice(3, '3 месяца'), choice(6, '6 месяцев')]}
          value={horizon}
          onChange={(value) => update({ horizon: value, monthIndex: 0 })}
        />
      </div>
      {mode === 'decision' && (
        <div className="adv-scenario">
          <div>
            <span className="adv-eyebrow">Что если · локальный расчёт</span>
            <h4>Разовый расход перед началом периода</h4>
            <p>
              Проверяем только влияние на остаток. Доходность инвестиции, новые зарплаты и будущие
              обязательства здесь не моделируются.
            </p>
          </div>
          <Field label="Сумма решения, €">
            <input
              type="number"
              min="0"
              step="1000"
              value={spend}
              onChange={(e) => update({ scenarioSpend: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <span className="adv-scenario-result">
            Доступно после решения
            <b className={model.available / 100 - spend < 0 ? 'danger' : ''}>
              {euro(model.available - spend * 100, true)}
            </b>
          </span>
        </div>
      )}
      <div className="adv-analysis-split">
        <div>
          <DataChart
            type="band"
            title={
              mode === 'decision'
                ? 'Как решение меняет денежную позицию'
                : 'Денежная позиция на горизонте решений'
            }
            description="Не история заработка, а опубликованные сценарии будущего остатка."
            rows={rows}
            series={
              mode === 'decision'
                ? [
                    { key: 'base', label: 'Базовый', color: SERIES[0] },
                    { key: 'decision', label: 'После разового расхода', color: SERIES[1] },
                  ]
                : [
                    { key: 'base', label: 'Базовый', color: SERIES[0] },
                    { key: 'low', label: 'Негативный', color: SERIES[1] },
                    { key: 'high', label: 'Оптимистичный', color: SERIES[2] },
                  ]
            }
            unit="€"
            yLabel="Денежные средства"
            xLabel="Дата прогноза"
            height={260}
            formatValue={euros}
            onSelect={(_, index) => update({ monthIndex: index })}
            selected={state.monthIndex || 0}
            source={'Финансовая проекция · ' + orgName(g, model.scope)}
            onSource={() => g.navigate('finance', 'forecast')}
            note={'Разброс сценариев не является доверительным интервалом и не гарантирует результат.'}
          />
        </div>
        <aside className="adv-insight">
          <span className="adv-eyebrow">Выбранная дата</span>
          <h4>{point ? shortDate(point.date) : 'Нет прогноза'}</h4>
          <Facts
            rows={
              point
                ? [
                    ['Базовый остаток', euro(point.base * 100, true)],
                    ['Негативный сценарий', euro(point.low * 100, true)],
                    ['Оптимистичный сценарий', euro(point.high * 100, true)],
                    ...(mode === 'decision'
                      ? [['После решения', euro((point.base - spend) * 100, true)]]
                      : []),
                  ]
                : []
            }
          />
          <p>
            Деньги на этой дате зависят от обязательств и предположений исходной проекции. Просмотрите
            платежи, прежде чем увеличивать расходы.
          </p>
          <LinkButton onClick={() => g.navigate('finance', 'terms')}>Связанные обязательства</LinkButton>
        </aside>
      </div>
    </>
  )
}

function Obligations({ g, model, state, update }) {
  const category = state.obligationCategory || 'all',
    cutoff =
      state.obligationHorizon === '30'
        ? addDays(g.game.career.date, 30)
        : state.obligationHorizon === '90'
          ? addDays(g.game.career.date, 90)
          : null
  const rows = model.obligations.filter(
    (row) => (category === 'all' || row.category === category) && (!cutoff || row.due <= cutoff),
  )
  const groups = {}
  for (const row of rows) {
    groups[row.due] ||= {
      label:
        shortDate(row.due) +
        (row.due.slice(0, 4) !== g.game.career.date.slice(0, 4) ? ' ' + row.due.slice(0, 4) : ''),
      date: row.due,
      outgoing: 0,
      incoming: 0,
    }
    groups[row.due][row.amount_cents < 0 ? 'outgoing' : 'incoming'] += Math.abs(row.amount_cents) / 100
  }
  const categories = [...new Set(model.obligations.map((o) => o.category))]
  return (
    <>
      <div className="adv-analytics-toolbar">
        <Field label="Статья обязательств">
          <select value={category} onChange={(e) => update({ obligationCategory: e.target.value })}>
            <option value="all">Все статьи</option>
            {categories.map((key) => (
              <option key={key} value={key}>
                {CATEGORIES[key] || key}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Срок">
          <select
            value={state.obligationHorizon || 'all'}
            onChange={(e) => update({ obligationHorizon: e.target.value })}
          >
            <option value="all">Весь раскрытый период</option>
            <option value="30">Ближайшие 30 дней</option>
            <option value="90">Ближайшие 90 дней</option>
          </select>
        </Field>
      </div>
      <DataChart
        type="bar"
        title="Когда деньги понадобятся"
        rows={Object.values(groups)}
        series={[
          { key: 'outgoing', label: 'Предстоящие выплаты', color: SERIES[1] },
          { key: 'incoming', label: 'Ожидаемые поступления', color: SERIES[0] },
        ]}
        unit="€"
        formatValue={euros}
        source="finance.obligations · суммы сгруппированы по дате"
        height={250}
        onSelect={(row) => update({ obligationDate: row.date })}
        note="Это договорные обязательства из среза карьеры. Новые локальные договоры не создают автоматически график backend-платежей."
      />
      <div className="adv-subheading">
        <h4>
          {state.obligationDate
            ? 'Платежи к ' + shortDate(state.obligationDate)
            : 'Ближайшие договорные платежи'}
        </h4>
        {state.obligationDate && (
          <button type="button" onClick={() => update({ obligationDate: null })}>
            Показать все даты
          </button>
        )}
      </div>
      <div className="adv-obligations">
        {rows
          .filter((row) => !state.obligationDate || row.due === state.obligationDate)
          .slice(0, state.showAllObligations ? 300 : 8)
          .map((row) => (
            <button
              type="button"
              className="adv-obligation"
              key={row.id}
              onClick={() => g.navigate('finance', 'terms', row.id)}
            >
              <span className="adv-obligation-date">
                {shortDate(row.due)}
                <small>{row.overdue ? 'Просрочено' : 'По договору'}</small>
              </span>
              <span>
                <b>{CATEGORIES[row.category] || row.category}</b>
                <small>{obligationName(g, row)}</small>
              </span>
              <strong className={row.amount_cents < 0 ? 'outgoing' : 'incoming'}>
                {euro(row.amount_cents)}
              </strong>
              <Icon name="ArrowUpRight" size={15} />
            </button>
          ))}
      </div>
      {!rows.length && (
        <Empty title="По выбранным условиям обязательств нет">
          Измените период или статью. Отсутствие строки не означает отсутствие будущих расходов.
        </Empty>
      )}
      {rows.length > 8 && !state.showAllObligations && (
        <LinkButton icon="ChevronDown" onClick={() => update({ showAllObligations: true })}>
          Все {rows.length} обязательств
        </LinkButton>
      )}
    </>
  )
}
function obligationName(g, row) {
  const candidate = asList(g.game.personnel).find((p) => row.contract?.includes(p.id))
  if (candidate) return candidate.name
  const c = asList(g.game.projections?.commercial?.contracts).find((c) => c.id === row.contract)
  if (c)
    return (
      g.game.projections.commercial.brands?.find((b) => b.id === c.sponsor)?.name ||
      orgName(g, c.sponsor)
    )
  return row.contract?.startsWith('base:')
    ? 'Инфраструктурное обязательство'
    : row.contract?.startsWith('salary')
      ? 'Действующее вознаграждение'
      : 'Договор ' + String(row.contract || row.id).slice(-18)
}

function Budget({ g, model, state, update }) {
  const report = model.budget,
    rows = model.allocations,
    selected = rows.find((row) => row.key === state.budgetCategory) || rows[0],
    cap = report.cap
  return (
    <>
      <div className="adv-analysis-split">
        <DataChart
          type="comparison"
          title="Утверждённый ресурс подразделений"
          description={
            orgName(g, g.game.career.org) +
            ' · план сезона ' +
            (report.year || g.game.career.date.slice(0, 4))
          }
          rows={rows}
          series={[
            { key: 'limit', label: 'Лимит плана', color: SERIES[2] },
            { key: 'spent', label: 'Фактические расходы', color: SERIES[1] },
            { key: 'committed', label: 'Зарезервировано', color: SERIES[0] },
          ]}
          unit="€"
          height={330}
          formatValue={euros}
          onSelect={(row) => update({ budgetCategory: row.key })}
          source="budget.plan / actual / reserved"
          note="Локальные платежи не классифицируются заново вторым бюджетным движком."
        />
        <aside className="adv-insight">
          <span className="adv-eyebrow">Выбранная статья</span>
          <h4>{selected?.label || 'План не утверждён'}</h4>
          {selected && (
            <Facts
              rows={[
                ['План', euro(selected.limit * 100, true)],
                ['Расходы', euro(selected.spent * 100, true)],
                ['Обязательства', euro(selected.committed * 100, true)],
                ['Свободно в плане', euro(selected.available * 100, true)],
              ]}
            />
          )}
          <p>
            {g.role === 'manager'
              ? 'Вы можете предложить перераспределение. Владелец утверждает новый план.'
              : 'План распределяет разрешённые расходы. Он не увеличивает деньги организации.'}
          </p>
          <LinkButton
            primary
            onClick={() => g.navigate('budget', g.role === 'manager' ? 'requests' : 'plan')}
          >
            {g.role === 'manager' ? 'Запросить пересмотр' : 'Пересмотреть план'}
          </LinkButton>
        </aside>
      </div>
      {cap ? (
        <div className="adv-regulation">
          <div>
            <span className="adv-eyebrow">Финансовый регламент</span>
            <h4>{cap.version}</h4>
            <p>Отдельный ограничитель расходов, не остаток кассы.</p>
          </div>
          <Facts
            rows={[
              ['Лимит', euro(cap.limit_cents, true)],
              ['Учтено', euro(cap.spent_cents, true)],
              ['Обязательства', euro(cap.committed_cents, true)],
              ['Осталось', euro(cap.remaining_cents, true)],
            ]}
          />
          <LinkButton onClick={() => g.navigate('cap', 'financial')}>
            Состав регламентных расходов
          </LinkButton>
        </div>
      ) : (
        <Info>
          Для этой роли и серии исходная проекция не назначает финансовый потолок. Правила F1
          автоматически не переносятся.
        </Info>
      )}
    </>
  )
}

function FinanceAnalytics({ g, state, update, section }) {
  const f = financeModel(g, state.scope),
    page = ['forecast', 'obligations', 'budget', 'history'].includes(section) ? section : 'forecast'
  const movements = asList(f.view.journal).filter(
    (row) => row.key !== 'opening' && row.source !== 'opening' && row.category !== 'opening',
  )
  const days = {}
  for (const movement of movements) {
    const date = movement.date
    if (date) {
      days[date] ||= { label: shortDate(date), date, income: 0, expense: 0 }
      const value = movement.delta_cents ?? movement.amount_cents ?? 0
      days[date][value >= 0 ? 'income' : 'expense'] += Math.abs(value) / 100
    }
  }
  return (
    <>
      <div className="adv-analytics-toolbar">
        <Field label="Финансовый контур">
          <select value={f.scope} onChange={(e) => update({ scope: e.target.value })}>
            {f.scopes.map((scope) => (
              <option key={scope} value={scope}>
                {orgName(g, scope)}
              </option>
            ))}
          </select>
        </Field>
        <span className="adv-context-stamp">
          <Icon name="LockKeyhole" size={13} />
          Доступные в карьере счета
        </span>
      </div>
      <Segments
        label="Финансовая аналитика"
        value={page}
        onChange={(value) => update({ section: value })}
        items={[
          choice('forecast', 'Прогноз'),
          choice('obligations', 'Обязательства'),
          choice('budget', 'Бюджет и лимиты'),
          choice('history', 'Фактические движения'),
        ]}
      />
      {page === 'forecast' ? (
        <Forecast g={g} model={f} state={state} update={update} />
      ) : page === 'obligations' ? (
        <Obligations g={g} model={f} state={state} update={update} />
      ) : page === 'budget' ? (
        <Budget g={g} model={f} state={state} update={update} />
      ) : (
        <>
          <DataChart
            type="bar"
            title="Фактические поступления и расходы"
            rows={Object.values(days).sort((a, b) => a.date.localeCompare(b.date))}
            series={[
              { key: 'income', label: 'Поступления', color: SERIES[0] },
              { key: 'expense', label: 'Выплаты', color: SERIES[1] },
            ]}
            unit="€"
            formatValue={euros}
            source="Журнал выбранного счёта"
            note="Стартовый капитал не превращается в доход от деятельности. Исторические месяцы до создания карьеры не дорисовываются."
            emptyMessage="В срезе нет движений выбранного счёта. Здесь появятся реальные записи журнала, а не выдуманная линия роста."
          />
          <DataChart
            type="comparison"
            title="Структура признанных доходов и расходов"
            rows={f.breakdown}
            series={[
              { key: 'income', label: 'Доходы', color: SERIES[0] },
              { key: 'expense', label: 'Расходы', color: SERIES[1] },
            ]}
            unit="€"
            formatValue={euros}
            source="finance.breakdown · исходный срез"
            note="Признанный финансовый результат отличается от поступления денег. Локальные операции показаны в журнале, исходная структура не пересчитана."
          />
          <LinkButton onClick={() => g.navigate('finance', 'journal')}>
            Открыть бухгалтерский источник
          </LinkButton>
        </>
      )}
    </>
  )
}

function EngineeringAnalytics({ g, state, update, section }) {
  const e = engineeringModel(g),
    page = ['comparison', 'evidence', 'capacity'].includes(section) ? section : 'comparison'
  const product =
    e.products.find((p) => p.id === state.product) ||
    e.products.find((p) => p.versions.length > 1) ||
    e.products[0]
  const keys = [
    ...new Set((product?.versions || []).flatMap((v) => Object.keys(v.values || {}))),
  ].filter((key) => (product?.versions || []).some((v) => typeof v.values?.[key] === 'number'))
  const selectedMetric = keys.includes(state.metric)
      ? state.metric
      : keys.includes('drag_area_m2')
        ? 'drag_area_m2'
        : keys[0],
    meta = metric(selectedMetric),
    versions = product?.versions || []
  const rows = versions
    .filter((v) => typeof v.values[selectedMetric] === 'number')
    .map((v) => ({
      label: 'Ред. ' + v.version + (v.installed ? ' · установлена' : ''),
      value: v.values[selectedMetric],
      id: v.id,
      title: v.title,
    }))
  const calculation = versions.find((v) => v.id === state.edition) || versions[0],
    calcKeys = [
      ...new Set(asList(calculation?.calculations).flatMap((c) => Object.keys(c.results || {}))),
    ],
    calcMetric = calcKeys.includes(state.calcMetric) ? state.calcMetric : calcKeys[0]
  const sourceTests = e.projects.filter((p) => p.kind === 'test' && p.observations?.length)
  return (
    <>
      <Segments
        label="Инженерная аналитика"
        value={page}
        onChange={(value) => update({ section: value })}
        items={[
          choice('comparison', 'Спецификации'),
          choice('evidence', 'Расчёты и наблюдения'),
          choice('capacity', 'Ресурсы бюро'),
        ]}
      />
      {page !== 'capacity' && (
        <div className="adv-analytics-toolbar">
          <Field label={g.role === 'manufacturer' ? 'Продуктовая программа' : 'Автомобиль и узел'}>
            <select
              value={product?.id || ''}
              onChange={(ev) =>
                update({ product: ev.target.value, metric: null, edition: null, calcMetric: null })
              }
            >
              {e.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          {page === 'comparison' && (
            <Field label="Сравниваемая величина">
              <select
                value={selectedMetric || ''}
                onChange={(ev) => update({ metric: ev.target.value })}
              >
                {keys.map((key) => (
                  <option key={key} value={key}>
                    {metric(key).join(', ')}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}
      {page === 'comparison' && (
        <>
          <div className="adv-analysis-split">
            <DataChart
              type="bar"
              title={meta[0] || 'Сравнение спецификаций'}
              description={product?.label}
              rows={rows}
              series={[{ key: 'value', label: meta[0], color: SERIES[0] }]}
              unit={meta[1]}
              height={260}
              source={
                g.role === 'manufacturer'
                  ? 'manufacturer.catalog.editions.values'
                  : 'Раскрытые parameters собственных экземпляров'
              }
              onSelect={(row) => update({ edition: row.id })}
              note="Сравнивается одна физическая величина. Меньшее или большее значение не объявляется универсально лучшим автомобилем."
            />
            <aside className="adv-insight">
              <span className="adv-eyebrow">Техническое чтение</span>
              <h4>{calculation?.title || 'Нет раскрытой спецификации'}</h4>
              <p>
                Смотрите компромисс по соседним параметрам. Снижение сопротивления может сопровождаться
                изменением прижима; эффект на результат здесь не рассчитывается.
              </p>
              {calculation && (
                <Facts
                  rows={Object.entries(calculation.values || {})
                    .filter(
                      ([key, value]) =>
                        typeof value === 'number' &&
                        (keys.length < 8 ||
                          [
                            'mass_kg',
                            'lift_area_m2',
                            'drag_area_m2',
                            'efficiency',
                            'shift_ms',
                            'design_life_km',
                          ].includes(key)),
                    )
                    .slice(0, 6)
                    .map(([key, value]) => [metric(key)[0], number(value, 3) + ' ' + metric(key)[1]])}
                />
              )}
              <LinkButton
                onClick={() =>
                  g.navigate(
                    g.role === 'manufacturer' ? 'manufacturer' : 'development',
                    g.role === 'manufacturer' ? 'catalog' : 'archive',
                    calculation?.id || '',
                  )
                }
              >
                Исходная спецификация
              </LinkButton>
            </aside>
          </div>
          {versions.length === 1 && (
            <Info>
              В этой программе раскрыта одна редакция. Доступен индивидуальный технический профиль;
              сравнить его пока не с чем.
            </Info>
          )}
          <div className="adv-version-strip">
            {versions.map((version) => (
              <button
                type="button"
                key={version.id}
                className={calculation?.id === version.id ? 'selected' : ''}
                onClick={() => update({ edition: version.id })}
              >
                <span>Редакция {version.version}</span>
                <b>{version.title}</b>
                <small>
                  {version.installed
                    ? 'На выбранном автомобиле'
                    : version.status === 'opening'
                      ? 'Стартовая спецификация'
                      : 'Раскрыта в своей программе'}
                </small>
                <Icon name="Layers2" size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      {page === 'evidence' && (
        <>
          <div className="adv-evidence-banner">
            <Icon name="Microscope" size={25} />
            <div>
              <h4>Расчёт, прогноз и измерение — разные основания</h4>
              <p>
                Расчётные режимы имеют отдельное основание. Без доступного измерительного протокола
                результат испытания остаётся неподтверждённым.
              </p>
            </div>
          </div>
          {calcKeys.length > 0 ? (
            <>
              <div className="adv-analytics-toolbar">
                <Field label="Редакция">
                  <select
                    value={calculation?.id || ''}
                    onChange={(ev) => update({ edition: ev.target.value })}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Ред. {v.version} · {v.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Расчётная величина">
                  <select
                    value={calcMetric || ''}
                    onChange={(ev) => update({ calcMetric: ev.target.value })}
                  >
                    {calcKeys.map((key) => (
                      <option value={key} key={key}>
                        {metric(key).join(', ')}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <DataChart
                type="comparison"
                title="Проверка расчётных режимов"
                rows={asList(calculation.calculations)
                  .filter((c) => typeof c.results?.[calcMetric] === 'number')
                  .map((c) => ({ label: c.label, value: c.results[calcMetric] }))}
                unit={metric(calcMetric)[1]}
                source="Каталог производителя · calculations"
                note="Расчётные режимы спецификации. Это не телеметрия с трассы и не статистика отказов."
              />
            </>
          ) : (
            <Empty title="Измерительных протоколов пока нет">
              Срез раскрывает спецификацию, но не результаты испытаний этого узла. При запуске испытания
              сохранится отдельная работа; её завершение в эталоне отмечается вручную.
              <LinkButton
                onClick={() =>
                  g.navigate(
                    g.role === 'manufacturer' ? 'manufacturer' : 'development',
                    g.role === 'manufacturer' ? 'factory' : 'test',
                    product?.entry || '',
                  )
                }
              >
                Открыть испытательную программу
              </LinkButton>
            </Empty>
          )}
          {sourceTests.length > 0 && (
            <div className="adv-evidence-log">
              {sourceTests.map((test) => (
                <article key={test.id}>
                  <span className="adv-eyebrow">
                    {test.local ? 'Локально внесённый протокол' : 'Протокол источника'}
                  </span>
                  <h4>{test.title}</h4>
                  <p>
                    {test.result ||
                      test.conclusion ||
                      'Откройте исходный протокол для ознакомления с наблюдениями.'}
                  </p>
                  <LinkButton onClick={() => g.navigate('development', 'test', test.id)}>
                    Протокол
                  </LinkButton>
                </article>
              ))}
            </div>
          )}
          <Info>
            Численный диапазон неопределённости показывается только там, где он опубликован источником.
            Оценка уверенности сотрудника не превращается в выдуманную погрешность измерения.
          </Info>
        </>
      )}
      {page === 'capacity' && (
        <>
          <DataChart
            type="comparison"
            title="Ресурсы для проектирования и проверок"
            rows={e.capacity.map((c) => ({
              label: c.label,
              installed: c.installed,
              used: c.used,
              key: c.key,
            }))}
            series={[
              { key: 'installed', label: 'Собственные слоты', color: SERIES[2] },
              { key: 'used', label: 'Занято в источнике', color: SERIES[1] },
            ]}
            unit="слоты"
            source="development.capacity"
            height={300}
            note="Свободная аренда и собственные мощности — разные ресурсы. Текущая локальная очередь показана отдельно."
          />
          <div className="adv-capacity-rental">
            {e.capacity.map((c) => (
              <div key={c.key}>
                <b>{c.label}</b>
                <span>{euro(c.rent)} / день аренды</span>
                <small>{c.free} доступных арендных слотов в срезе</small>
              </div>
            ))}
          </div>
          <LinkButton onClick={() => g.navigate('facilities', 'capacity')}>
            Мощности и бронирования
          </LinkButton>
        </>
      )}
    </>
  )
}

function ProductionAnalytics({ g, state, update, section }) {
  const p = productionModel(g),
    e = engineeringModel(g),
    page = ['schedule', 'capacity', 'stock'].includes(section)
      ? section
      : g.route === 'inventory'
        ? 'stock'
        : 'schedule'
  const proposal =
    e.proposals.find((pr) => pr.id === state.planProposal && !pr.localDecision) ||
    e.proposals.find((pr) => !pr.localDecision && pr.options?.some((o) => o.days > 0))
  const proposed = proposal?.options?.find((o) => o.days > 0),
    showPlan = !!state.showPlan && !!proposed
  const timeline = showPlan
    ? [
        {
          label: proposed.title,
          start: g.game.career.date,
          end: addDays(g.game.career.date, proposed.days),
          id: proposal.id,
          color: '#e9ad65',
          discussion: true,
        },
      ]
    : p.timeline
  const horizon = Number(state.scheduleDays) || 30,
    until = addDays(g.game.career.date, horizon),
    visibleTimeline = timeline
      .filter((row) => row.start <= until && row.end >= g.game.career.date)
      .map((row) => ({
        ...row,
        sourceStart: row.start,
        sourceEnd: row.end,
        label: row.label + (row.end > until ? ' · продолжается' : ''),
        start: row.start < g.game.career.date ? g.game.career.date : row.start,
        end: row.end > until ? until : row.end,
      }))
  return (
    <>
      <Segments
        label="Аналитика производственной готовности"
        value={page}
        onChange={(value) => update({ section: value })}
        items={[
          choice('schedule', 'Календарь работ'),
          choice('capacity', 'Мощности и люди'),
          choice('stock', 'Запас компонентов'),
        ]}
      />
      {page === 'schedule' && (
        <>
          <div className="adv-analytics-toolbar">
            <Field label="Горизонт">
              <select
                value={horizon}
                onChange={(ev) => update({ scheduleDays: Number(ev.target.value) })}
              >
                <option value={14}>14 дней</option>
                <option value={30}>30 дней</option>
                <option value={90}>90 дней</option>
                <option value={365}>Год</option>
              </select>
            </Field>
            {proposed && g.role !== 'owner' && (
              <label className="adv-check">
                <input
                  type="checkbox"
                  checked={showPlan}
                  onChange={(ev) => update({ showPlan: ev.target.checked })}
                />
                <span>Оценить предложение штаба</span>
              </label>
            )}
          </div>
          {showPlan && (
            <div className="adv-discussion-plan">
              <span className="adv-eyebrow">План к обсуждению · работа не запущена</span>
              <h4>{proposed.title}</h4>
              <p>
                Длительность {proposed.days} дн. и цена {euro(proposed.cost_cents)} взяты из предложения.
                Начало «сегодня» — ваш сценарий, без проверки очереди и резервирования мощности.
              </p>
              <LinkButton onClick={() => g.navigate('council', 'agenda', proposal.id)}>
                Рассмотреть перед утверждением
              </LinkButton>
            </div>
          )}
          <DataChart
            type="gantt"
            title={
              showPlan ? 'Как предложение выглядит во времени' : 'Утверждённые работы и бронирования'
            }
            rows={visibleTimeline}
            unit="календарные даты"
            height={Math.max(230, visibleTimeline.length * 43 + 75)}
            source={
              showPlan
                ? 'council.proposals.options.days · локальный сценарий начала'
                : 'Исходные бронирования + явно созданные локальные работы'
            }
            onSelect={(row) =>
              row.discussion
                ? g.navigate('council', 'agenda', row.id)
                : g.navigate(row.route, row.tab, row.entity)
            }
            note={
              'Окно просмотра: ' +
              shortDate(g.game.career.date) +
              ' — ' +
              shortDate(until) +
              '; длинные бронирования обрезаны по границе просмотра, а не завершены: полный срок сохранён в исходном документе. Конфликт мощности проверяется в рабочем процессе.'
            }
            emptyMessage="В этом горизонте нет утверждённых работ. Создайте исследование, производственный заказ или бронирование — его срок появится здесь."
          />
          {!visibleTimeline.length && (
            <div className="adv-empty-actions">
              <LinkButton
                primary
                onClick={() =>
                  g.navigate(
                    g.role === 'owner'
                      ? 'leadership'
                      : g.role === 'manufacturer'
                        ? 'manufacturer'
                        : 'production',
                    g.role === 'owner' ? 'mandate' : g.role === 'manufacturer' ? 'factory' : 'queue',
                  )
                }
              >
                {g.role === 'owner' ? 'Открыть доклад менеджера' : 'Запланировать работу'}
              </LinkButton>
              <LinkButton onClick={() => g.navigate('facilities', 'bookings')}>Бронирования</LinkButton>
            </div>
          )}
        </>
      )}
      {page === 'capacity' && (
        <>
          <div className="adv-analysis-split">
            <DataChart
              type="comparison"
              title="Мощность и её текущее использование"
              rows={p.capacity.map((c) => ({ label: c.label, slots: c.slots, used: c.used }))}
              series={[
                { key: 'slots', label: 'Назначенные слоты', color: SERIES[2] },
                { key: 'used', label: 'Используется в срезе', color: SERIES[1] },
              ]}
              unit="слоты"
              height={280}
              source="production.capacity.sites"
              note="Подтверждённые окна доступности учитываются в источнике; новый объект во время строительства не создаёт свободную мощность."
            />
            <aside className="adv-insight">
              <span className="adv-eyebrow">Опубликованные рабочие окна</span>
              <h4>{shortDate(p.windows[0]?.start || g.game.career.date)}</h4>
              {p.windows.map((window) => (
                <div className="adv-window" key={window.process}>
                  <b>
                    {{
                      research: 'Исследования',
                      development: 'Проектирование',
                      production: 'Производство',
                    }[window.process] || window.process}
                  </b>
                  <span>
                    {window.available_slots} из {window.installed_slots} слотов{' '}
                    {window.end <= g.game.career.date ? 'были доступны' : 'доступны'}
                  </span>
                  <small>
                    {number(window.effective_person_days_x100 / 100, 2)} эффективных чел.-дн. ·{' '}
                    {shortDate(window.start)}–{shortDate(window.end)}
                  </small>
                </div>
              ))}
              <LinkButton onClick={() => g.navigate('facilities', 'capacity')}>
                Исходный план мощностей
              </LinkButton>
            </aside>
          </div>
          <DataChart
            type="comparison"
            title="Нагрузка коллектива"
            rows={p.capacity
              .filter((c) => c.crew)
              .map((c) => ({
                label: c.crew.name,
                workload: c.crew.workload,
                fatigue: c.crew.fatigue,
                size: c.crew.size,
              }))}
            series={[
              { key: 'workload', label: 'Нагрузка', color: SERIES[0] },
              { key: 'fatigue', label: 'Усталость', color: SERIES[1] },
            ]}
            unit="шкала API 0–100"
            height={240}
            source="production.capacity.crew"
            note="Эти показатели относятся к производственным группам, а не к усталости каждого именованного сотрудника."
          />
        </>
      )}
      {page === 'stock' && (
        <>
          <div className="adv-stock-summary">
            <Facts
              rows={[
                ['Готовых экземпляров', p.items.filter((i) => i.status === 'stock').length],
                ['На автомобилях', p.items.filter((i) => i.status === 'installed').length],
                [
                  'На проверке или ремонте',
                  p.items.filter((i) => ['inspection', 'repair', 'quality'].includes(i.status)).length,
                ],
                ['Свободно мест', p.storage.free ?? 'Не раскрыто'],
              ]}
            />
          </div>
          <DataChart
            type="bar"
            title="Физические экземпляры по назначению"
            rows={p.groups}
            series={[
              { key: 'stock', label: 'На складе', color: SERIES[0] },
              { key: 'installed', label: 'Установлено', color: SERIES[2] },
              { key: 'inspection', label: 'Проверка / ремонт', color: SERIES[1] },
            ]}
            unit="шт."
            source="production.items + manufacturer.inventory + локальные экземпляры"
            height={270}
            onSelect={(row) => update({ stockAxis: row.key })}
            note="Номер чертежа не считается физической деталью. Статусы обновляются после явных локальных действий."
          />
          <div className="adv-subheading">
            <h4>{state.stockAxis ? AXES[state.stockAxis] : 'Рекомендации исходного плана запаса'}</h4>
            {state.stockAxis && (
              <button type="button" onClick={() => update({ stockAxis: null })}>
                Все узлы
              </button>
            )}
          </div>
          <div className="adv-stock-needs">
            {p.needs
              .filter((n) => !state.stockAxis || n.slot === state.stockAxis)
              .map((need, i) => (
                <button
                  key={need.specification + i}
                  type="button"
                  onClick={() =>
                    g.navigate(
                      g.role === 'owner' ? 'leadership' : 'production',
                      g.role === 'owner' ? 'mandate' : 'needs',
                      need.specification,
                    )
                  }
                >
                  <Icon name="Package" size={19} />
                  <span>
                    <b>{AXES[need.slot] || need.slot}</b>
                    <small>
                      {need.stock} в резерве · {need.pending} в исходной очереди
                    </small>
                  </span>
                  <strong>
                    +{need.quantity}
                    <small>рекомендовано</small>
                  </strong>
                  <Icon name="ArrowUpRight" size={14} />
                </button>
              ))}
          </div>
          {!p.needs.length && (
            <Info>
              Источник не сформировал рекомендаций запаса для этой организации. Реальные экземпляры
              показаны выше.
            </Info>
          )}
        </>
      )}
    </>
  )
}

function PeopleAnalytics({ g, state, update, section }) {
  const p = peopleModel(g),
    page = ['skills', 'workforce', 'structure'].includes(section) ? section : 'skills'
  const positions = [
      ...new Set(p.own.filter((p) => p.skills && p.id !== 'player').map((p) => p.position)),
    ],
    selectedPosition = positions.includes(state.position)
      ? state.position
      : positions.includes(g.route === 'drivers' ? 'driver' : 'scout')
        ? g.route === 'drivers'
          ? 'driver'
          : 'scout'
        : positions[0]
  const candidates = p.own.filter(
      (p) => p.position === selectedPosition && p.skills && p.id !== 'player',
    ),
    a = candidates.find((p) => p.id === state.personA) || candidates[0],
    b =
      candidates.find((p) => p.id === state.personB && p.id !== a?.id) ||
      candidates.find((p) => p.id !== a?.id)
  const skills = [...new Set([...Object.keys(a?.skills || {}), ...Object.keys(b?.skills || {})])].filter(
    (key) => typeof a?.skills?.[key] === 'number' || typeof b?.skills?.[key] === 'number',
  )
  const rows = skills.map((skill) => ({ label: skill, a: a?.skills?.[skill], b: b?.skills?.[skill] }))
  return (
    <>
      <Segments
        label="Аналитика персонала"
        items={[
          choice('skills', 'Компетенции'),
          choice('workforce', 'Рабочие группы'),
          choice('structure', 'Ответственность'),
        ]}
        value={page}
        onChange={(value) => update({ section: value })}
      />
      {page === 'skills' && (
        <>
          <div className="adv-analytics-toolbar">
            <Field label="Профиль для сравнения">
              <select
                value={selectedPosition || ''}
                onChange={(ev) => update({ position: ev.target.value, personA: null, personB: null })}
              >
                {positions.map((position) => (
                  <option key={position} value={position}>
                    {positionName(g, position)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Специалист">
              <select
                value={a?.id || ''}
                onChange={(ev) => update({ personA: ev.target.value, personB: null })}
              >
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {b && (
              <Field label="Сравнить с">
                <select value={b.id} onChange={(ev) => update({ personB: ev.target.value })}>
                  {candidates
                    .filter((p) => p.id !== a?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
          <div className="adv-comparison-people">
            {[a, b].filter(Boolean).map((p, i) => (
              <div key={p.id} style={{ '--person-series': SERIES[i] }}>
                <PersonLink g={g} p={p} />
                <Facts
                  rows={[
                    ['Усталость', p.fatigue == null ? 'Не раскрыта' : p.fatigue + ' / 100'],
                    ['Мораль', p.morale == null ? 'Не раскрыта' : p.morale + ' / 100'],
                    ['Опыт', p.experience == null ? 'Не раскрыт' : p.experience + ' лет'],
                  ]}
                />
              </div>
            ))}
          </div>
          <DataChart
            type="comparison"
            title="Сравнение профильных навыков"
            rows={rows}
            series={[
              { key: 'a', label: a?.name || 'Первый специалист', color: SERIES[0] },
              ...(b ? [{ key: 'b', label: b.name, color: SERIES[1] }] : []),
            ]}
            unit="навык 0–100"
            height={Math.max(270, rows.length * 36 + 70)}
            source="Раскрытые skills собственных сотрудников · career.assignments"
            note="Показаны исходные навыки, а не прогноз результата. Модификаторы состояния и эффективные оценки смотрите в досье."
          />
          {!b && (
            <Info>
              В этой должности раскрыт один сотрудник. Открыт его индивидуальный профиль компетенций.
            </Info>
          )}
          <Info>
            Динамика развития требует последовательных наблюдений. У текущего стартового среза нет
            временного ряда, поэтому график роста не нарисован.
          </Info>
        </>
      )}
      {page === 'workforce' && (
        <>
          <DataChart
            type="bar"
            title="Как распределён коллектив"
            rows={p.crews.map((c) => ({ label: c.label, value: c.size }))}
            unit="человек"
            source="production.capacity.crew.size"
            height={260}
          />
          <DataChart
            type="comparison"
            title="Нагрузка, квалификация и усталость групп"
            rows={p.crews.map((c) => ({
              label: c.label,
              qualification: c.qualification,
              workload: c.workload,
              fatigue: c.fatigue,
            }))}
            series={[
              { key: 'qualification', label: 'Квалификация', color: SERIES[2] },
              { key: 'workload', label: 'Нагрузка', color: SERIES[0] },
              { key: 'fatigue', label: 'Усталость', color: SERIES[1] },
            ]}
            unit="шкала API 0–100"
            source="production.capacity.crew"
            note="Каждая шкала сохраняет смысл исходной проекции. Это не общий рейтинг качества персонала."
          />
          <LinkButton onClick={() => g.navigate('preparation')}>Программы подготовки</LinkButton>
        </>
      )}
      {page === 'structure' && (
        <>
          <div className="adv-org-structure">
            {p.seats.map((seat) => (
              <article key={seat.id}>
                <span className="adv-eyebrow">{positionName(g, seat.position)}</span>
                <PersonLink
                  g={g}
                  p={seat.occupant}
                  compact
                  description={
                    seat.academy
                      ? 'Академия организации'
                      : seat.series
                        ? g.world.championships?.[seat.series]?.name
                        : 'Организация'
                  }
                />
                <span className="adv-authority-label">
                  {g.role === 'owner'
                    ? seat.position === 'manager' || seat.academy
                      ? 'Ваша кадровая компетенция'
                      : 'Оперативное назначение менеджера'
                    : ['owner', 'manager', 'manufacturer'].includes(seat.position) || seat.academy
                      ? 'За пределами оперативного назначения'
                      : 'Оперативное назначение'}
                </span>
              </article>
            ))}
          </div>
          <Info>
            Смена сотрудника и увольнение читаются из текущего локального состояния. Сводка не выдаёт
            владельцу инструменты менеджера.
          </Info>
        </>
      )}
    </>
  )
}

function CapitalAnalytics({ g, state, update }) {
  const source = g.game.projections?.capital || {},
    valuation = source.valuation || {},
    assetRows = Object.entries(
      asList(source.assets).reduce(
        (groups, a) => ({ ...groups, [a.kind]: (groups[a.kind] || 0) + (a.book_cents || 0) / 100 }),
        {},
      ),
    ).map(([label, value]) => ({ label, value }))
  return (
    <>
      <div className="adv-analysis-split">
        <DataChart
          type="comparison"
          title="Из чего складывается оценка"
          rows={[
            { label: 'Денежные средства', value: (valuation.cash_cents || 0) / 100 },
            { label: 'Активы', value: (valuation.assets_cents || 0) / 100 },
            { label: 'Договорная стоимость', value: (valuation.contract_value_cents || 0) / 100 },
            { label: 'Долг', value: -(valuation.debt_cents || 0) / 100 },
            { label: 'Просроченные обязательства', value: -(valuation.overdue_cents || 0) / 100 },
          ]}
          unit="€"
          source="capital.valuation · исходная оценка"
          formatValue={euros}
          height={300}
        />
        <aside className="adv-insight">
          <span className="adv-eyebrow">Стратегическая ответственность</span>
          <h4>Программ в проекции: {asList(source.programs).length}</h4>
          <p>
            Контролируйте капитал, назначайте руководителей и согласовывайте ресурсы. Оперативная
            готовность остаётся предметом доклада менеджера.
          </p>
          <LinkButton onClick={() => g.navigate('capital', 'assets')}>
            Активы и спортивные допуски
          </LinkButton>
          <LinkButton onClick={() => g.navigate('leadership', 'mandate')}>
            Мандат руководителя
          </LinkButton>
        </aside>
      </div>
      <DataChart
        type="bar"
        title="Структура балансовой стоимости активов"
        rows={assetRows}
        unit="€"
        formatValue={euros}
        source="capital.assets.book_cents"
        note="Балансовая стоимость не гарантирует рыночную цену сделки. Локальные операции капитала проверяются в исходном разделе."
      />
    </>
  )
}

/** Parent can use briefOnly in compact role home compositions, and this full
 * workspace above an existing module. No existing form or mechanic is replaced. */
export function OperationalAnalytics({
  route,
  briefOnly = false,
  analyticsOnly = false,
  compactBrief = false,
  defaultExpanded = false,
  className = '',
  onNavigate,
}) {
  const g = useGame(),
    current = route || g.route,
    kind = routeKind(current),
    [allState, setAllState] = useStored('v2.analytics', {}),
    workbenchRef = useRef(null),
    id = useId()
  const state = allState[kind] || {},
    update = (patch) => setAllState((old) => ({ ...old, [kind]: { ...(old[kind] || {}), ...patch } }))
  const opened = state.expanded ?? defaultExpanded
  if (!kind || (!SUPPORTED_ROUTES.includes(current) && !briefOnly)) return null
  const initial =
    current === 'budget' || current === 'cap'
      ? 'budget'
      : current === 'inventory'
        ? 'stock'
        : current === 'facilities'
          ? 'capacity'
          : current === 'research'
            ? 'evidence'
            : current === 'drivers'
              ? 'skills'
              : null
  const section = state.section || initial
  const explore = (target) => {
    update({ expanded: true, section: target })
    setTimeout(() => workbenchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 70)
  }
  const labels = {
    finance: 'Финансовые сценарии и обязательства',
    engineering: 'Инженерные основания решения',
    production: 'Готовность запасов, людей и мощностей',
    people: 'Компетенции и ответственность',
    capital: 'Структура капитала и программ',
  }
  return (
    <div
      className={'pw-operational ' + (compactBrief ? 'compact-brief ' : '') + className}
      data-advisory-route={current}
    >
      {!analyticsOnly && (
        <AdvisorBrief
          route={current}
          context={{ scope: state.scope, proposal: state.proposal }}
          onExplore={briefOnly ? undefined : explore}
          compact={compactBrief || briefOnly}
          contextual={compactBrief}
          onNavigate={onNavigate}
        />
      )}
      {!briefOnly && (
        <section
          className={'adv-workbench ' + (opened ? 'is-open' : '')}
          ref={workbenchRef}
          aria-label={labels[kind]}
        >
          <button
            type="button"
            className="adv-workbench-toggle"
            aria-expanded={opened}
            aria-controls={id}
            onClick={() => update({ expanded: !opened })}
          >
            <span className="adv-workbench-icon">
              <Icon name="ChartNoAxesCombined" size={20} />
            </span>
            <span>
              <small>Разобраться в деталях</small>
              <b>{labels[kind]}</b>
            </span>
            <span className="adv-workbench-hint">{opened ? 'Свернуть анализ' : 'Открыть анализ'}</span>
            <Icon name={opened ? 'ChevronUp' : 'ChevronDown'} size={18} />
          </button>
          {opened && (
            <div className="adv-workbench-content" id={id}>
              {kind === 'finance' ? (
                <FinanceAnalytics g={g} state={state} update={update} section={section} />
              ) : kind === 'engineering' ? (
                <EngineeringAnalytics g={g} state={state} update={update} section={section} />
              ) : kind === 'production' ? (
                <ProductionAnalytics g={g} state={state} update={update} section={section} />
              ) : kind === 'people' ? (
                <PeopleAnalytics g={g} state={state} update={update} section={section} />
              ) : (
                <CapitalAnalytics g={g} state={state} update={update} />
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
export default OperationalAnalytics
