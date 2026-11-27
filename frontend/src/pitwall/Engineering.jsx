import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Search,
  FlaskConical,
  DraftingCompass,
  Gauge,
  Factory,
  Package,
  ShieldCheck,
  Wrench,
  Users,
  ChevronRight,
  Check,
  X,
  SlidersHorizontal,
  AlertTriangle,
  Clock,
  FileText,
  CalendarDays,
  MoreHorizontal,
  Play,
  CheckCircle2,
  Info,
  BarChart3,
  Layers,
  LockKeyhole,
  RotateCcw,
  Send,
  Microscope,
} from 'lucide-react'
import { useGame, useStored, money, dateLabel } from './core'
import { PersonPortrait, RaceCar } from './visuals'

import './engineering.css'
import { useOrder } from '../career/finance/useOrder'
const EC = createContext(null)
const useE = () => useContext(EC)
const list = (v) => (Array.isArray(v) ? v : Object.values(v || {}))
const idOf = (v) => (typeof v === 'string' ? v : v?.id)
const uid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
const plural = (n, one, few, many) =>
  n +
  ' ' +
  (n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many)
const number = (v) =>
  v == null ? 'Не раскрыто' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
const dayAdd = (d, n) =>
  new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
const AXES = {
  floor: 'Днище',
  chassis: 'Шасси и кузов',
  cooling: 'Охлаждение',
  tyre: 'Шины',
  'rear-wing': 'Заднее антикрыло',
  suspension: 'Подвеска',
  brakes: 'Тормоза',
  engine: 'Силовая установка',
  transmission: 'Трансмиссия',
}
const GOALS = {
  balanced: 'Баланс смежных узлов',
  performance: 'Рабочий диапазон',
  output: 'Производительность',
  shift: 'Быстрое переключение',
  thermal: 'Тепловая нагрузка',
  durability: 'Ресурс',
  economy: 'Эффективность',
  wet: 'Дождь',
  warmup: 'Прогрев',
  reliability: 'Исправление дефекта',
}
const STATES = {
  opening: 'Базовая спецификация',
  stock: 'На складе',
  installed: 'На автомобиле',
  inspection: 'На проверке',
  repair: 'В ремонте',
  scrapped: 'Списано',
  delivered: 'У клиента',
  queued: 'В очереди',
  active: 'В работе',
  complete: 'Завершено',
  completed: 'Завершено',
  cancelled: 'Отменено',
  open: 'Открыто',
  resolved: 'Решение принято',
  study: 'Исследование назначено',
  advise: 'Рекомендация передана',
  decline: 'Отказ обоснован',
  replace: 'Замена передана',
  compensate: 'Компенсация',
  deferred: 'Отложено',
  decided: 'Решение принято',
  rejected: 'Отклонено',
  released: 'Выпущено',
  review: 'На рассмотрении',
  withdrawn: 'Отозвано',
  superseded: 'Основания изменились',
}
const STAGES = {
  research: 'Исследование',
  'research-ready': 'Заключение готово',
  design: 'В конструкторском бюро',
  'design-ready': 'Чертёж готов к проверке',
  test: 'На испытании',
  review: 'Решение о выпуске',
  released: 'Редакция выпущена',
  production: 'Изготовление партии',
  quality: 'На контроле качества',
  stock: 'Готово на складе',
  installed: 'Установлено',
  delivered: 'Передано клиенту',
  withdrawn: 'Редакция отозвана',
  completed: 'Проверка завершена',
  cancelled: 'Отменено',
}
const PRIORITY = { high: 'Высокий', normal: 'Обычный', low: 'Низкий' }
const ALLOCATION = {
  balanced: 'Оба поколения',
  current: 'Текущий сезон',
  next: 'Следующее поколение',
  'stop-current': 'Приостановить текущее поколение',
}
const STRATEGY = {
  continue: 'Продолжение концепции',
  revise: 'Пересмотр компоновки',
  replace: 'Новая концепция',
}
const MODES = {
  manual: 'Ручное управление',
  partial: 'Частичное делегирование',
  full: 'Полное делегирование',
}
const FOCUS = {
  balanced: 'Баланс программы',
  knowledge: 'Снижение неопределённости',
  readiness: 'Готовность машин',
}
const METHODS = {
  calculation: 'Расчётная проверка',
  lab: 'Лаборатория',
  bench: 'Нагрузочный стенд',
  cfd: 'CFD',
  tunnel: 'Аэродинамическая труба',
}
const METRICS = {
  shaft_kw: 'Мощность на валу, кВт',
  torque_nm: 'Момент на валу, Н·м',
  fuel_kg_h: 'Расход топлива, кг/ч',
  thermal_efficiency: 'Тепловой КПД',
  required_cooling_kw: 'Теплоотвод, кВт',
  first_output_nm: 'Момент на I передаче, Н·м',
  top_output_nm: 'Момент на высшей передаче, Н·м',
  mechanical_loss_kw: 'Механические потери, кВт',
  shift_interruption_ms: 'Разрыв тяги, мс',
  contact_force_n: 'Сила сцепления, Н',
  tread_loss_mm_100km: 'Износ, мм / 100 км',
  warmup_energy_kj: 'Энергия прогрева, кДж',
  mass_kg: 'Масса, кг',
  power_kw: 'Мощность, кВт',
  peak_torque_nm: 'Пиковый момент, Н·м',
  heat_kw: 'Тепловыделение, кВт',
  fuel_g_kwh: 'Удельный расход, г/кВт·ч',
  cooling_flow_kg_s: 'Расход теплоносителя, кг/с',
  design_life_km: 'Проектный ресурс, км',
  efficiency: 'КПД',
  input_limit_nm: 'Допустимый момент, Н·м',
  first_ratio: 'Передаточное число I',
  top_ratio: 'Передаточное число высшей передачи',
  shift_ms: 'Переключение, мс',
  loss_heat_kw: 'Тепловая нагрузка, кВт',
  vertical_rate_n_mm: 'Радиальная жёсткость, Н/мм',
  loaded_radius_m: 'Радиус под нагрузкой, м',
  friction_coefficient: 'Коэффициент сцепления',
  window_low_c: 'Начало рабочего окна, °C',
  window_high_c: 'Конец рабочего окна, °C',
  wear_mm_100km: 'Износ, мм / 100 км',
  warmup_kj: 'Энергия прогрева, кДж',
  max_load_n: 'Расчётная нагрузка, Н',
  water_clearance_l_s: 'Отвод воды, л/с',
}
const TABSETS = {
  engineering: [
    ['plans', 'Программа'],
    ['resources', 'Ресурсы'],
    ['calendar', 'План работ'],
    ['concept', 'Концепция'],
    ['rules', 'Регламент'],
    ['history', 'Решения'],
  ],
  council: [
    ['agenda', 'Повестка'],
    ['meeting', 'Совещания'],
    ['execution', 'Исполнение'],
    ['archive', 'Архив'],
  ],
  research: [
    ['queue', 'Исследования'],
    ['memory', 'Техническая память'],
  ],
  development: [
    ['design', 'Разработка'],
    ['test', 'Испытания'],
    ['archive', 'Редакции и протоколы'],
  ],
  production: [
    ['queue', 'Очередь цеха'],
    ['stock', 'Экземпляры'],
    ['quality', 'Контроль качества'],
    ['needs', 'Потребность'],
    ['archive', 'История'],
  ],
  manufacturer: [
    ['catalog', 'Продукция'],
    ['program', 'Программы'],
    ['research', 'Исследования и разработки'],
    ['factory', 'Испытания и цех'],
    ['clients', 'Клиенты'],
    ['cases', 'Запросы'],
    ['advisors', 'Консультанты'],
    ['diagnosis', 'Диагностика'],
    ['warranty', 'Гарантия'],
    ['history', 'История'],
  ],
}
const PHASES = [
  ['research', 'Исследование', FlaskConical],
  ['design', 'Разработка', DraftingCompass],
  ['test', 'Испытание', Gauge],
  ['released', 'Выпуск', FileText],
  ['production', 'Производство', Factory],
  ['quality', 'Приёмка', ShieldCheck],
  ['stock', 'Склад', Package],
]
const tone = (s) =>
  ['stock', 'released', 'installed', 'complete', 'completed', 'delivered', 'accepted'].includes(s)
    ? 'good'
    : ['withdrawn', 'scrapped', 'cancelled', 'rejected'].includes(s)
      ? 'danger'
      : ['review', 'inspection', 'quality', 'deferred'].includes(s)
        ? 'warn'
        : 'muted'
const opts = (o) => Object.entries(o).map(([value, label]) => ({ value, label }))
function B({ children, onClick, primary = false, variant, icon: Icon, disabled = false, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      onClick={onClick}
      disabled={disabled}
      className={
        'eng-button ' +
        (primary || variant === 'primary'
          ? 'is-primary'
          : variant === 'danger'
            ? 'is-danger'
            : variant === 'quiet'
              ? 'is-quiet'
              : '')
      }
    >
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  )
}
function Tag({ children, status, tone: color }) {
  return (
    <span className={'eng-tag ' + (color || tone(status))}>
      {children || STAGES[status] || STATES[status] || status}
    </span>
  )
}
function Card({ title, kicker, action, children, className = '' }) {
  return (
    <section className={'eng-card ' + className}>
      {(title || action) && (
        <header>
          {title && (
            <div>
              {kicker && <small>{kicker}</small>}
              <h2>{title}</h2>
            </div>
          )}
          {action}
        </header>
      )}
      <div className="eng-card-body">{children}</div>
    </section>
  )
}
function Facts({ items }) {
  return (
    <dl className="eng-facts">
      {items.filter(Boolean).map(([label, value], i) => (
        <div key={label + i}>
          <dt>{label}</dt>
          <dd>{value ?? 'Не раскрыто'}</dd>
        </div>
      ))}
    </dl>
  )
}
function Stat({ label, value, sub }) {
  return (
    <div
      className={
        'eng-stat ' +
        (typeof value === 'string' && value.includes('€')
          ? 'eng-money-stat'
          : typeof value === 'string' && value.length > 18
            ? 'eng-text-stat'
            : '')
      }
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  )
}
function Note({ children, tone = 'info' }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <div className={'eng-note ' + tone}>
      <Icon size={17} />
      <div>{children}</div>
    </div>
  )
}
function Empty({ icon: Icon = FileText, title, children, action }) {
  return (
    <div className="eng-empty">
      <Icon size={27} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  )
}
function Progress({ value = 0, max = 100, label }) {
  const p = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="eng-progress">
      {label && (
        <div>
          <span>{label}</span>
          <b>
            {number(value)} / {number(max)}
          </b>
        </div>
      )}
      <span role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <i style={{ width: p + '%' }} />
      </span>
    </div>
  )
}
function Tabs({ items, value, onChange }) {
  return (
    <nav className="eng-tabs" aria-label="Разделы инженерного штаба">
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-current={value === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
function Person({ id, name, role, compact = false }) {
  const e = useE()
  const person = e.person(id)
  return (
    <button
      type="button"
      className={'eng-person ' + (compact ? 'compact' : '')}
      onClick={() => id && e.g.openPerson?.(id)}
      disabled={!id}
    >
      <PersonPortrait
        person={person || { id, name: name || e.name(id) }}
        id={id}
        size={compact ? 34 : 46}
      />
      <span>
        <strong>{name || e.name(id)}</strong>
        <small>{role || person?.role || 'Инженерный штаб'}</small>
      </span>
      {id && <ArrowUpRight size={13} />}
    </button>
  )
}
function SearchBox({ value, onChange, placeholder = 'Поиск по названию, заявке или номеру' }) {
  return (
    <label className="eng-search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button type="button" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <X size={15} />
        </button>
      )}
    </label>
  )
}
function Pipeline({ stage, steps = [], disposition, onSelect }) {
  let i = PHASES.findIndex(([s]) => s === stage)
  if (stage === 'research-ready') i = 0
  if (stage === 'design-ready') i = 1
  if (stage === 'review') i = 2
  if (['installed', 'delivered'].includes(stage)) i = 6
  return (
    <div className="eng-pipeline">
      {PHASES.map(([s, l, Icon], n) => {
        const recorded =
            (steps || []).some((step) => step.stage === s && step.completed) ||
            (s === 'released' && disposition === 'released'),
          done = n !== i && recorded
        return (
          <button
            type="button"
            key={s}
            className={n === i ? 'current' : done ? 'done' : ''}
            onClick={() => onSelect?.(s)}
            disabled={!onSelect}
          >
            <span>{done ? <Check size={15} /> : <Icon size={17} />}</span>
            <b>{l}</b>
            <small>
              {n === i
                ? 'Сейчас'
                : done
                  ? 'Завершено'
                  : n < i
                    ? 'Не отмечено'
                    : String(n + 1).padStart(2, '0')}
            </small>
          </button>
        )
      })}
    </div>
  )
}
function Modal({ title, eyebrow, children, onClose, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const el = ref.current
    const t = setTimeout(() => el?.querySelector('input,select,textarea,button')?.focus(), 0)
    const key = (ev) => {
      if (ev.key === 'Escape') onClose()
      if (ev.key === 'Tab') {
        const f = [
          ...el.querySelectorAll(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]',
          ),
        ]
        if (!f.length) return
        const first = f[0],
          last = f.at(-1)
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault()
          last.focus()
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', key)
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', key)
      document.body.style.overflow = old
      previous?.focus?.()
    }
  }, [])
  return createPortal(
    <div
      className="eng-modal-layer"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={'eng-modal ' + (wide ? 'wide' : '')}
      >
        <header>
          <div>
            <small>{eyebrow || 'ИНЖЕНЕРНЫЙ ШТАБ'}</small>
            <h2>{title}</h2>
          </div>
          <button type="button" className="eng-icon-button" aria-label="Закрыть окно" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        <div className="eng-modal-body">{children}</div>
      </section>
    </div>,
    document.querySelector('.pitwall') || document.body,
  )
}
function Form({
  initial = {},
  fields,
  title,
  description,
  submit = 'Подтвердить',
  onSubmit,
  validate,
  summary,
  onClose,
  danger = false,
}) {
  const [v, setV] = useState(initial),
    [error, setError] = useState('')
  async function send(ev) {
    ev.preventDefault()
    const problem = validate?.(v)
    if (problem) {
      setError(problem)
      return
    }
    try {
      await onSubmit(v)
      onClose()
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <form className="eng-form" onSubmit={send}>
      {description && <p className="eng-form-intro">{description}</p>}
      <div className="eng-form-grid">
        {fields.map((f) => {
          if (f.hidden?.(v)) return null
          const choices = typeof f.options === 'function' ? f.options(v) : f.options
          return (
            <label
              key={f.key}
              className={
                (f.type === 'textarea' || f.wide ? 'wide ' : '') +
                (f.type === 'checkbox' ? 'eng-check' : '')
              }
            >
              {f.type === 'checkbox' ? (
                <>
                  <input
                    type="checkbox"
                    checked={!!v[f.key]}
                    onChange={(ev) => setV({ ...v, [f.key]: ev.target.checked })}
                  />
                  <span>{f.label}</span>
                </>
              ) : (
                <>
                  <span>{f.label}</span>
                  {f.type === 'select' ? (
                    <select
                      value={v[f.key] ?? ''}
                      required={f.required !== false}
                      onChange={(ev) => setV({ ...v, [f.key]: ev.target.value })}
                    >
                      {choices?.map((o) => (
                        <option key={o.value ?? o} value={o.value ?? o}>
                          {o.label ?? o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={v[f.key] ?? ''}
                      maxLength={f.maxLength || 500}
                      required={f.required !== false}
                      onChange={(ev) => setV({ ...v, [f.key]: ev.target.value })}
                    />
                  ) : (
                    <input
                      type={f.type || 'text'}
                      value={v[f.key] ?? ''}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      maxLength={f.maxLength}
                      required={f.required !== false}
                      onChange={(ev) => setV({ ...v, [f.key]: ev.target.value })}
                    />
                  )}
                </>
              )}
              {f.help && <small>{typeof f.help === 'function' ? f.help(v) : f.help}</small>}
            </label>
          )
        })}
      </div>
      {summary && (
        <div className="eng-form-summary">{typeof summary === 'function' ? summary(v) : summary}</div>
      )}
      {error && (
        <p className="eng-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
      <footer>
        <B onClick={onClose}>Отмена</B>
        <B type="submit" primary={!danger} variant={danger ? 'danger' : undefined}>
          {submit}
        </B>
      </footer>
    </form>
  )
}
function Chart({ calculations = [], metric }) {
  const keys = Object.keys(calculations[0]?.results || {}),
    [chosen, setChosen] = useState(metric || keys[0] || '')
  const k = keys.includes(chosen) ? chosen : keys[0],
    max = Math.max(...calculations.map((c) => Math.abs(c.results[k] || 0)), 1)
  return (
    <div className="eng-chart">
      {keys.length > 1 && (
        <label className="eng-select-label">
          <span>Показатель</span>
          <select value={k} onChange={(ev) => setChosen(ev.target.value)}>
            {keys.map((key) => (
              <option key={key} value={key}>
                {METRICS[key] || key}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="eng-chart-bars">
        {calculations.map((c, i) => (
          <div key={c.label} className="eng-chart-bar">
            <span>{c.label}</span>
            <div>
              <i
                style={{
                  width: (Math.abs(c.results[k] || 0) / max) * 100 + '%',
                }}
              />
            </div>
            <b>{number(c.results[k])}</b>
          </div>
        ))}
      </div>
      <small>Расчётные режимы исходной спецификации. Это не измерения с гоночной трассы.</small>
    </div>
  )
}
function WorkForm({ kind = 'research', source, defaults = {}, onClose }) {
  const e = useE(),
    { desks, maker } = e
  const [v, setV] = useState({
    entry: source?.entry || defaults.entry || e.g.selectedEntry || '',
    axis: source?.axis || defaults.axis || '',
    baseline:
      (kind === 'test' ? source?.baseline : source?.specification) ||
      source?.baseline ||
      defaults.specification ||
      '',
    candidate: source?.specification || '',
    year: String(source?.year || defaults.year || e.year),
    priority: source?.priority || 'normal',
    objective: source?.objective || 'durability',
    brief: 'balanced',
    method: source?.method || '',
    quantity: defaults.quantity || 1,
    rush: false,
    outsource: false,
    rival: '',
    ...defaults,
  })
  const [error, setError] = useState('')
  const change = (key, value) => setV({ ...v, [key]: value })
  const entries = maker
    ? list(desks.manufacturer.catalog).map((p) => ({
        id: p.entry,
        title: p.title,
        axis: p.axis,
        ...p,
      }))
    : kind === 'research'
      ? list(desks.research.entries)
      : kind === 'production'
        ? list(desks.production.entries)
        : list(desks.development.entries)
  const selected =
    entries.find((x) => x.id === v.entry && (!maker || !v.axis || x.axis === v.axis)) || entries[0]
  const eid = selected?.id
  const axes = maker
    ? [{ id: selected?.axis, label: AXES[selected?.axis] }]
    : kind === 'research'
      ? (selected?.axes || []).map((a) => ({ id: a, label: AXES[a] }))
      : kind === 'production'
        ? [
            ...new Map(
              (selected?.choices || []).map((c) => [c.slot, { id: c.slot, label: c.label }]),
            ).values(),
          ]
        : selected?.axes || []
  const ax = axes.find((a) => a.id === v.axis) || axes.find((a) => !a.blocked) || axes[0] || {}
  const axis = ax.id
  const researchEntry = list(desks.research.entries).find((x) => x.id === eid)
  const methodData = desks.research.methods?.[axis] || {}
  const devAxis =
    list(desks.development.entries)
      .find((x) => x.id === eid)
      ?.axes?.find((a) => a.id === axis) || {}
  const productionEntry = list(desks.production.entries).find((x) => x.id === eid)
  const baseChoices = (productionEntry?.choices || []).filter((c) => c.slot === axis)
  const baselineVersions = maker
    ? selected?.editions || []
    : kind === 'production'
      ? baseChoices
      : ax.versions || devAxis.versions || []
  const versions = baselineVersions
  const base =
    versions.find((x) => x.id === v.baseline) || versions.find((x) => x.id === ax.fitted) || versions[0]
  const candidate = versions.find((x) => x.id === v.candidate) || versions.at(-1) || base
  const methods = maker ? ['bench', 'lab'] : devAxis.methods || ax.methods || ['calculation']
  const protocol = methods.includes(v.method) ? v.method : methods[0]
  const test = desks.development.tests?.[protocol] || {}
  const choice = baseChoices.find((c) => c.id === base?.id) || baseChoices[0]
  const mode = choice?.modes?.[v.outsource ? 1 : 0] || choice?.modes?.[0]
  const unit =
    mode?.[v.rush ? 'rush' : 'normal'] ||
    (maker && methodData.cost_cents != null
      ? {
          cents: methodData.cost_cents,
          hours: Math.max(8, Math.floor(methodData.hours / 2)),
        }
      : null)
  const qty = Number(v.quantity)
  const cents =
    kind === 'research'
      ? methodData.cost_cents
      : kind === 'design'
        ? (devAxis.price ?? (methodData.cost_cents != null ? methodData.cost_cents * 3 : null))
        : kind === 'test'
          ? test.cost
          : unit?.cents != null
            ? unit.cents * qty
            : null
  const hours =
    kind === 'research'
      ? methodData.hours
      : kind === 'design'
        ? (devAxis.hours ?? (methodData.hours != null ? methodData.hours + 24 : null))
        : kind === 'test'
          ? 1
          : unit?.hours != null
            ? unit.hours * qty
            : null
  const lead = maker
    ? e.career.assignments?.find(
        (a) =>
          a.position ===
          (kind === 'test'
            ? 'analyst'
            : axis === 'transmission'
              ? 'transmissions'
              : axis === 'engine'
                ? 'engines'
                : 'tyres'),
      )?.occupant?.id
    : kind === 'research'
      ? researchEntry?.staff?.[methodData.role]
      : devAxis.lead
  const freeze = maker ? selected?.years?.[v.year] : null
  let blocked = !selected
    ? 'Нет доступной технической программы.'
    : selected.admitted === false
      ? 'Допуск программы приостановлен.'
      : !maker && kind === 'design' && ax.blocked
        ? ax.blocked
        : maker && kind === 'design' && freeze && v.objective !== 'durability'
          ? freeze
          : kind === 'production' && mode?.reason
            ? mode.reason
            : kind === 'production' && (!Number.isInteger(qty) || qty < 1 || qty > 24)
              ? 'Количество должно быть целым числом от 1 до 24.'
              : kind === 'production' &&
                  desks.production.storage?.free != null &&
                  qty > desks.production.storage.free
                ? 'Недостаточно свободных мест на складе.'
                : null
  if (kind === 'production' && base?.status && base.status !== 'released' && base.status !== 'opening')
    blocked = 'Редакция ещё не выпущена для производства.'
  if (!lead && ['research', 'design', 'test'].includes(kind) && !blocked)
    blocked = 'Нет специалиста с нужным техническим назначением. Сначала назначьте сотрудника в штабе.'
  if (cents == null && !blocked)
    blocked = 'Смета отсутствует в проекции этой программы. Выберите доступный узел.'
  const title = {
    research: 'Поручить исследование',
    design: 'Поручить разработку',
    test: 'Назначить испытание',
    production: 'Заказать партию',
  }[kind]
  const submit = async (ev) => {
    ev.preventDefault()
    if (blocked) {
      setError(blocked)
      return
    }
    const payloads = {
      research: { entry: eid, axis, priority: v.priority, rival_entry: v.rival || null },
      design: { entry: eid, baseline: base?.id, brief: v.brief, priority: v.priority },
      test: {
        entry: eid,
        baseline: base?.id,
        candidate: candidate?.id,
        method: protocol,
        priority: v.priority,
      },
      production: {
        entry: eid,
        specification: base?.id,
        quantity: qty,
        rush: v.rush,
        outsource: v.outsource,
        priority: v.priority,
      },
    }
    const commands = {
      research: 'research-commission',
      design: 'development-design',
      test: 'development-test',
      production: 'production-order',
    }
    try {
      if (maker)
        await e.run('maker-work', {
          entry: eid,
          axis,
          year: Number(v.year),
          action: kind === 'test' ? protocol : kind === 'production' ? 'produce' : kind,
          objective: v.objective,
          specification: (kind === 'test' ? candidate?.id : base?.id) || null,
          quantity: qty,
        })
      else await e.run(commands[kind], payloads[kind])
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <form className="eng-form" onSubmit={submit}>
      <div className="eng-form-grid">
        <label className="wide">
          <span>{maker ? 'Продукт и интерфейс' : 'Заявка и техническая программа'}</span>
          <select
            value={maker ? eid + '|' + axis : eid || ''}
            onChange={(ev) => {
              const [id, a] = ev.target.value.split('|')
              setV({
                ...v,
                entry: id,
                axis: a || '',
                baseline: '',
                candidate: '',
                rival: '',
              })
            }}
          >
            {entries.map((x) => (
              <option key={x.id + (x.axis || '')} value={maker ? x.id + '|' + x.axis : x.id}>
                {maker ? (x.series || '').toUpperCase() + ' · ' + AXES[x.axis] + ' · ' : ''}
                {x.title}
              </option>
            ))}
          </select>
        </label>
        {!maker && (
          <label>
            <span>Направление</span>
            <select
              value={axis || ''}
              onChange={(ev) =>
                setV({
                  ...v,
                  axis: ev.target.value,
                  baseline: '',
                  candidate: '',
                })
              }
            >
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || AXES[a.id]}
                </option>
              ))}
            </select>
          </label>
        )}
        {maker && (
          <label>
            <span>Целевой сезон</span>
            <select value={v.year} onChange={(ev) => change('year', ev.target.value)}>
              {Object.keys(selected?.years || { [e.year]: null, [e.year + 1]: null }).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        )}
        {kind !== 'research' && (
          <label>
            <span>{kind === 'test' ? 'Образец А' : 'Исходная редакция'}</span>
            <select value={base?.id || ''} onChange={(ev) => change('baseline', ev.target.value)}>
              {versions.map((b) => (
                <option key={b.id} value={b.id}>
                  Ред. {b.version} · {b.title || AXES[axis]}{' '}
                  {b.status ? '· ' + (STATES[b.status] || b.status) : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'research' && !maker && (
          <label className="wide">
            <span>Источник информации</span>
            <select value={v.rival} onChange={(ev) => change('rival', ev.target.value)}>
              <option value="">Документация своей команды</option>
              {researchEntry?.rivals?.map((r) => (
                <option key={r.reference} value={r.entry || r.reference}>
                  {r.label}
                </option>
              ))}
            </select>
            <small>Публичный заявочный лист не раскрывает чертёж и скрытые параметры соперника.</small>
          </label>
        )}
        {maker && kind !== 'production' && (
          <label>
            <span>Техническая цель</span>
            <select value={v.objective} onChange={(ev) => change('objective', ev.target.value)}>
              {(desks.manufacturer.targets?.[axis] || ['durability']).map((k) => (
                <option key={k} value={k}>
                  {GOALS[k] || k}
                </option>
              ))}
            </select>
          </label>
        )}
        {!maker && kind === 'design' && (
          <label>
            <span>Задача отдела</span>
            <select value={v.brief} onChange={(ev) => change('brief', ev.target.value)}>
              {opts({
                balanced: GOALS.balanced,
                performance: GOALS.performance,
              }).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'test' && (
          <>
            <label>
              <span>Образец Б</span>
              <select
                value={candidate?.id || ''}
                onChange={(ev) => change('candidate', ev.target.value)}
              >
                {versions.map((b) => (
                  <option key={b.id} value={b.id}>
                    Ред. {b.version} · {b.title || AXES[axis]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Метод проверки</span>
              <select value={protocol} onChange={(ev) => change('method', ev.target.value)}>
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {desks.development.tests?.[m]?.label || METHODS[m]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {kind === 'production' && (
          <>
            <label>
              <span>Количество экземпляров</span>
              <input
                type="number"
                min={1}
                max={24}
                value={v.quantity}
                onChange={(ev) => change('quantity', ev.target.value)}
              />
            </label>
            {!maker && (
              <>
                <label>
                  <span>Исполнитель</span>
                  <select
                    value={v.outsource ? 'external' : 'internal'}
                    onChange={(ev) => change('outsource', ev.target.value === 'external')}
                  >
                    <option value="internal">Собственный цех</option>
                    <option value="external">Подрядчик по регламенту</option>
                  </select>
                </label>
                <label className="eng-check">
                  <input
                    type="checkbox"
                    checked={v.rush}
                    onChange={(ev) => change('rush', ev.target.checked)}
                  />
                  <span>Срочное изготовление</span>
                </label>
              </>
            )}
          </>
        )}
        {!maker && (
          <label>
            <span>Приоритет</span>
            <select value={v.priority} onChange={(ev) => change('priority', ev.target.value)}>
              {opts(PRIORITY).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {kind === 'research' && (
        <Note>
          {researchEntry?.questions?.[axis] ||
            methodData.hypothesis ||
            'Сформировать заключение по доступным исходным данным.'}
        </Note>
      )}
      {freeze && <Note tone="warn">{freeze}</Note>}
      <div className="eng-quote">
        <div>
          <small>{kind === 'test' ? 'Расход в день проверки' : 'Смета нового поручения'}</small>
          <strong>{cents == null ? 'Требуется расчёт' : money(cents)}</strong>
        </div>
        <Facts
          items={[
            [
              'Объём работы',
              hours == null ? 'Не раскрыто' : kind === 'test' ? '1 парный сеанс' : number(hours) + ' ч',
            ],
            [
              'Ориентир после выделения слота',
              hours == null ? 'Не раскрыто' : Math.max(1, Math.ceil(hours / 24)) + ' раб. дн.',
            ],
            ['Ответственный', e.name(lead)],
            kind === 'production' && [
              'Складские места',
              desks.production.storage?.free ?? 'Не раскрыто',
            ],
          ]}
        />
      </div>
      {kind === 'test' && Object.keys(test.atr || {}).length > 0 && (
        <Note>
          Расход ATR:{' '}
          {Object.entries(test.atr)
            .map(
              ([k, v]) =>
                number(v) +
                ' ' +
                ({
                  runs: 'прогонов',
                  wind_on_minutes: 'мин под потоком',
                  occupancy_minutes: 'мин занятости',
                  cfd_geometries: 'геометрий',
                  cfd_milli_mauh: 'милли-MAUh',
                }[k] || k),
            )
            .join(' · ')}
          . Проверка полномочий остаётся частью игрового backend.
        </Note>
      )}
      {v.rush && (
        <Note tone="warn">
          Надбавка за срочность включена в смету. Ускорение повышает риск производственного брака.
        </Note>
      )}
      {(blocked || error) && (
        <p className="eng-error" role="alert">
          {error || blocked}
        </p>
      )}
      <footer>
        <B onClick={onClose}>Отмена</B>
        <B type="submit" primary disabled={!!blocked}>
          Утвердить поручение
        </B>
      </footer>
    </form>
  )
}
function openWork(e, kind, source, defaults) {
  e.setDialog({
    type: 'work',
    kind,
    source,
    defaults,
    title: {
      research: 'Новое исследование',
      design: 'Новая разработка',
      test: 'Испытание редакции',
      production: 'Производственный заказ',
    }[kind],
    wide: true,
  })
}
function projectOpen(e, id) {
  e.setDialog({
    type: 'project',
    id,
    title: 'Дело технической программы',
    wide: true,
  })
}
function itemOpen(e, id) {
  e.setDialog({
    type: 'item',
    id,
    title: 'Паспорт физического экземпляра',
    wide: true,
  })
}
function sourceProjects(e, kind) {
  const desk =
    e.desks[kind === 'production' ? 'production' : kind === 'research' ? 'research' : 'development']
  return list(kind === 'production' ? desk.batches : desk.projects)
    .filter((p) => kind === 'production' || kind === 'research' || p.kind === kind)
    .map((p) => ({
      ...p,
      stage:
        p.disposition ||
        (p.status === 'complete'
          ? kind === 'research'
            ? 'research-ready'
            : kind === 'design'
              ? 'design-ready'
              : kind === 'test'
                ? 'review'
                : 'quality'
          : p.status === 'cancelled'
            ? 'cancelled'
            : kind),
      year:
        p.year ||
        Number(p.season?.slice(-4) || p.commissioned?.slice(0, 4)) ||
        Number(e.date?.slice(0, 4)),
      axis:
        p.axis ||
        desk.entries?.find((x) => x.id === p.entry)?.choices?.find((c) => c.id === p.specification)
          ?.slot,
      source: true,
      kind,
    }))
}
function ProjectRows({ projects, empty, action }) {
  const e = useE()
  return (
    <div className="eng-work-list">
      {projects.length ? (
        projects.map((p) => (
          <button type="button" className="eng-work-row" key={p.id} onClick={() => projectOpen(e, p.id)}>
            <div className={'eng-work-icon ' + tone(p.stage)}>
              {p.stage === 'production' ? (
                <Factory size={20} />
              ) : p.stage === 'test' ? (
                <Gauge size={20} />
              ) : p.stage === 'research' ? (
                <FlaskConical size={20} />
              ) : (
                <DraftingCompass size={20} />
              )}
            </div>
            <div className="eng-work-name">
              <small>
                {e.entryTitle(p.entry)} · {p.year || e.year}
              </small>
              <strong>{p.title || AXES[p.axis] || 'Техническое поручение'}</strong>
              <span>
                {p.reason ||
                  p.conclusion ||
                  GOALS[p.objective] ||
                  GOALS[p.brief] ||
                  'Связь с программой и исходной редакцией сохранена'}
              </span>
            </div>
            <div className="eng-work-progress">
              <Tag status={p.stage} />
              <Progress value={p.worked || 0} max={p.required || 1} />
            </div>
            <div className="eng-work-amount">
              <strong>{money(p.cost_cents ?? p.cost ?? 0)}</strong>
              <span>
                {p.kind === 'test'
                  ? p.worked >= p.required
                    ? '1 / 1 сеанс'
                    : '0 / 1 сеанс'
                  : number(p.worked || 0) + ' / ' + number(p.required || 0) + ' ч'}
              </span>
            </div>
            <ChevronRight size={18} />
          </button>
        ))
      ) : (
        <Empty icon={FlaskConical} title={empty || 'Очередь свободна'} action={action}>
          Поручения появятся после решения штаба. Исходная спецификация уже доступна для независимой
          разработки и испытаний.
        </Empty>
      )}
    </div>
  )
}
function Programme() {
  const e = useE(),
    d = e.desks.programme
  const [selected, setSelected] = useState('')
  const plans = list(d.plans),
    plan = plans.find((p) => p.id === selected) || plans[0]
  if (!plan)
    return (
      <Empty title="Программа не раскрыта этой карьере">
        Программы производителя доступны в его каталоге и клиентских интерфейсах.
      </Empty>
    )
  const own = e.projects.filter((p) => p.entry === plan.entry && p.year === plan.year)
  const chosenConcept = plan.strategy
  const head = plan.staff?.['chief-engineer']
  const localSpend = own.reduce((n, p) => n + (p.cost_cents || 0), 0)
  return (
    <>
      <div className="eng-program-switch">
        <div>
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === plan.id ? 'selected' : ''}
              onClick={() => setSelected(p.id)}
            >
              <small>{p.year === e.year ? 'ТЕКУЩИЙ СЕЗОН' : 'СЛЕДУЮЩЕЕ ПОКОЛЕНИЕ'}</small>
              <strong>
                {p.name}
                <span>{p.year}</span>
              </strong>
            </button>
          ))}
        </div>
        <span className="eng-generation-priority">
          <i />
          {ALLOCATION[d.priority] || d.priority}
        </span>
      </div>
      {e.tab === 'plans' ? (
        <>
          <div className="eng-program-quick">
            <B icon={Users} primary onClick={() => e.navigate('council', 'agenda')}>
              Решения штаба ·{' '}
              {e.desks.council.proposals?.filter((p) =>
                ['open', 'deferred'].includes(p.status || 'open'),
              ).length || 0}
            </B>
            {e.manage && (
              <B
                icon={Plus}
                onClick={() =>
                  openWork(e, 'research', null, {
                    entry: plan.entry,
                    year: plan.year,
                  })
                }
              >
                Новая работа
              </B>
            )}
          </div>
          <div className="eng-program-hero">
            <div className="eng-blueprint-lines" />
            <div className="eng-program-copy">
              <small>
                {(plan.series || '').toUpperCase()} / {plan.category}
              </small>
              <h2>{plan.name}</h2>
              <p>
                {{
                  performance: 'Развивать рабочий диапазон и готовность машины.',
                  balanced: 'Согласовать темп развития, надёжность и затраты.',
                  reliability: 'Укрепить надёжность программы.',
                }[d.goal] || 'Согласовать развитие автомобиля и готовность команды к сезону.'}
              </p>
              <div className="eng-hero-badges">
                <Tag tone={plan.admitted === false ? 'danger' : 'good'}>
                  {plan.admitted === false ? 'Допуск приостановлен' : 'Программа допущена'}
                </Tag>
                <Tag>{STRATEGY[chosenConcept] || chosenConcept}</Tag>
              </div>
            </div>
            <div className="eng-car-stage">
              <RaceCar entryId={plan.entry} entry={plan.entry} />
              <span>
                {plan.year} · {e.entryTitle(plan.entry)}
              </span>
            </div>
            <div className="eng-program-hero-footer">
              <Person id={head} role="Главный инженер программы" />
              <B
                icon={ArrowUpRight}
                onClick={() => {
                  e.g.setSelectedEntry?.(plan.entry)
                  e.navigate('garage', 'components', plan.entry)
                }}
              >
                Открыть машину
              </B>
            </div>
          </div>
          <div className="eng-stats">
            <Stat
              label="В программе"
              value={
                (plan.packages || []).length +
                ' ' +
                ((plan.packages || []).length === 1 ? 'пакет' : 'пакета')
              }
              sub="Связанные обновления к этапам"
            />
            <Stat
              label="Работы программы"
              value={
                own.filter(
                  (p) => !['cancelled', 'withdrawn', 'installed', 'delivered'].includes(p.stage),
                ).length
              }
              sub="Изменяется после поручений"
            />
            <Stat
              label="Фактические расходы"
              value={money(plan.spent_cents || 0)}
              sub={localSpend ? '+ ' + money(localSpend) + ' в карьере' : 'По исходной карьере'}
            />
            <Stat
              label="Зарезервировано"
              value={money(plan.reserved_cents || 0)}
              sub="Отдельно от денежных средств"
            />
          </div>
          <div className="eng-main-grid">
            <div className="eng-stack">
              {(plan.packages || []).map((pkg) => (
                <PackagePlan key={pkg.id} plan={plan} pkg={pkg} />
              ))}
            </div>
            <div className="eng-stack">
              <Card title="Позиция главного инженера" kicker="ПЕРЕД СЛЕДУЮЩИМ ЭТАПОМ">
                <Person id={head} role="Главный инженер" />
                <p className="eng-quote-text">
                  {plan.packages?.[0]?.advice ||
                    'Согласовать приоритеты исследований и готовность физических экземпляров.'}
                </p>
                <B icon={Users} onClick={() => e.navigate('council', 'agenda', plan.proposals?.[0]?.id)}>
                  Открыть повестку
                </B>
              </Card>
              <Card title="Связи программы">
                <div className="eng-link-list">
                  {[
                    ['research', 'queue', 'Исследования и знания', FlaskConical],
                    ['development', 'design', 'Чертежи и испытания', DraftingCompass],
                    ['production', 'needs', 'Потребность цеха', Factory],
                    ['manufacturer', 'clients', 'Поставщики и поддержка', Wrench],
                  ].map(([r, t, label, Icon]) => (
                    <button type="button" key={r} onClick={() => e.navigate(r, t)}>
                      <Icon size={19} />
                      <span>{label}</span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : e.tab === 'resources' ? (
        <Resources />
      ) : e.tab === 'calendar' ? (
        <WorkCalendar plan={plan} />
      ) : e.tab === 'concept' ? (
        <div className="eng-main-grid">
          <Card title={plan.name + ' · ' + plan.year} kicker="ИНЖЕНЕРНАЯ КОНЦЕПЦИЯ">
            <div className="eng-concept-car">
              <RaceCar entryId={plan.entry} />
            </div>
            <Tag>{STRATEGY[chosenConcept]}</Tag>
            <p>
              Концепция связывает компоновку, исследовательские выводы и применимость чертежей. Смена
              поколения сохраняет архив.
            </p>
            <Facts
              items={[
                ['Регламент', plan.regulation],
                ['Концепция', plan.concept],
                ['Технический руководитель', e.name(head)],
              ]}
            />
            {e.manage && (
              <B
                primary
                icon={DraftingCompass}
                onClick={() =>
                  e.openForm({
                    title: 'Выбор инженерной концепции',
                    initial: { strategy: chosenConcept },
                    fields: [
                      {
                        key: 'strategy',
                        label: 'Стратегия следующего поколения',
                        type: 'select',
                        options: opts(STRATEGY),
                      },
                    ],
                    summary: (v) => (
                      <Facts
                        items={[
                          ['Разовый расход', money(plan.concept_costs?.[v.strategy] || 0)],
                          [
                            'Последствие',
                            v.strategy === 'continue'
                              ? 'Сохраняются компоновка и применимость текущих знаний.'
                              : 'Потребуется повторная проверка совместимости решений.',
                          ],
                        ]}
                      />
                    ),
                    validate: (v) =>
                      plan.year <= e.year
                        ? 'Концепцию действующего сезона менять нельзя. Выберите следующее поколение.'
                        : null,
                    onSubmit: (v) =>
                      e.run('programme-concept', {
                        entry: plan.entry,
                        year: plan.year,
                        strategy: v.strategy,
                      }),
                  })
                }
              >
                Пересмотреть концепцию
              </B>
            )}
          </Card>
          <Card title="Память программы">
            <div className="eng-document-list">
              {(plan.knowledge || []).length ? (
                plan.knowledge.map((k) => (
                  <article key={k.id}>
                    <FileText size={18} />
                    <div>
                      <strong>{k.conclusion}</strong>
                      <small>
                        Уверенность {k.confidence}% · Применимость {k.applicable}%
                      </small>
                    </div>
                  </article>
                ))
              ) : (
                <Note>
                  Подтверждённые выводы появятся после исследований. Отсутствие отчёта не означает
                  отсутствие технической документации.
                </Note>
              )}
              {(plan.documents || []).map((doc) => (
                <article key={doc.reference}>
                  <Layers size={18} />
                  <div>
                    <strong>{AXES[doc.component] || doc.component}</strong>
                    <small>
                      {doc.design ? 'Доступен чертёж' : 'Документация поставщика'} · {e.org(doc.issuer)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
            <B onClick={() => e.navigate('research', 'memory')}>Открыть техническую память</B>
          </Card>
        </div>
      ) : e.tab === 'rules' ? (
        <div className="eng-main-grid">
          <Card title="Допуск и сезонный бюллетень" kicker={plan.rule?.origin}>
            <div className="eng-regulation-flag">
              <ShieldCheck size={36} />
              <div>
                <strong>{plan.year}</strong>
                <span>
                  {plan.category} · {plan.series?.toUpperCase()}
                </span>
              </div>
            </div>
            <h3>{plan.rule?.text}</h3>
            <p>{plan.rule?.clarification}</p>
            <Facts
              items={[
                ['Опубликован', dateLabel(plan.rule?.announced)],
                ['Действует с', dateLabel(plan.rule?.effective)],
                [
                  'Заморозка',
                  plan.rule?.freeze ? dateLabel(plan.rule.freeze) : 'Не установлена для этой программы',
                ],
              ]}
            />
            {plan.rule?.source && (
              <a className="eng-button" href={plan.rule.source} target="_blank" rel="noreferrer">
                Источник регламента <ArrowUpRight size={16} />
              </a>
            )}
          </Card>
          <Card title="Омологация редакций">
            <p>
              Допуск относится к конкретному сезону, интерфейсу и редакции. Выпуск чертежа сам по себе не
              разрешает установку.
            </p>
            {Object.entries(plan.certificates || {}).map(([id, c]) => (
              <div className="eng-row" key={id}>
                <span className="eng-break">{id}</span>
                <Tag status="released">{dateLabel(c.date)}</Tag>
              </div>
            ))}
            {e.manage && (
              <B
                onClick={() =>
                  e.openForm({
                    title: 'Подать редакцию на омологацию',
                    initial: {
                      specification: own.find((p) => p.stage === 'released')?.specification || '',
                    },
                    fields: [
                      {
                        key: 'specification',
                        label: 'Выпущенная редакция',
                        type: 'select',
                        options: own
                          .filter((p) =>
                            ['released', 'production', 'quality', 'stock', 'installed'].includes(
                              p.stage,
                            ),
                          )
                          .map((p) => ({
                            value: p.specification,
                            label: AXES[p.axis] + ' · ред. ' + p.version,
                          })),
                      },
                    ],
                    validate: (v) =>
                      !v.specification ? 'Сначала выпустите редакцию по результатам испытания.' : null,
                    description: 'Допуск действует для выбранной спецификации, заявки и сезона.',
                    onSubmit: (v) =>
                      e.run('programme-homologate', {
                        entry: plan.entry,
                        year: plan.year,
                        specification: v.specification,
                      }),
                  })
                }
              >
                Подать редакцию
              </B>
            )}
            {(plan.violations || []).length > 0 && (
              <Note tone="warn">{plan.violations.map((x) => x.decision).join(' · ')}</Note>
            )}
          </Card>
        </div>
      ) : (
        <History rows={list(d.history)} />
      )}
    </>
  )
}
function PackagePlan({ plan, pkg }) {
  const e = useE(),
    change = pkg,
    withdrawn = change.withdrawn || pkg.withdrawn
  function deployment(decision) {
    e.openForm({
      title: decision === 'withdraw' ? 'Отменить пакет обновлений' : 'Перенести срок пакета',
      danger: decision === 'withdraw',
      initial: { due: dayAdd(change.due || pkg.due || e.date, 7), reason: '' },
      fields: [
        ...(decision === 'defer'
          ? [
              {
                key: 'due',
                label: 'Новый срок готовности',
                type: 'date',
                min: dayAdd(e.date, 1),
              },
            ]
          : []),
        { key: 'reason', label: 'Обоснование решения', type: 'textarea' },
      ],
      description:
        decision === 'withdraw'
          ? 'Пакет перестанет исполняться. Завершённые чертежи и физические экземпляры останутся в архиве и на складе. Отмена не возвращает понесённые расходы.'
          : 'Новый срок должен быть позже действующего срока и текущей даты.',
      validate: (v) =>
        decision === 'defer' && (v.due <= e.date || v.due <= (change.due || pkg.due))
          ? 'Выберите более позднюю дату.'
          : null,
      onSubmit: (v) =>
        e.run('programme-deployment', {
          entry: plan.entry,
          year: plan.year,
          package: pkg.id,
          decision,
          ...(decision === 'defer' ? { due: v.due } : {}),
        }),
    })
  }
  return (
    <Card
      title={pkg.stage}
      kicker={'ПАКЕТ ОБНОВЛЕНИЙ · ' + dateLabel(change.due || pkg.due)}
      action={
        <Tag tone={withdrawn ? 'danger' : 'muted'}>
          {withdrawn ? 'Отменён' : (pkg.installed || 0) + ' / ' + (pkg.required || 0) + ' установлено'}
        </Tag>
      }
    >
      <h3 className="eng-package-goal">{pkg.goal}</h3>
      <div className="eng-package-parts">
        {pkg.parts.map((part) => {
          const p = e.projects
            .filter((x) => x.entry === plan.entry && x.axis === part.axis && x.year === plan.year)
            .at(-1)
          return (
            <div className="eng-package-part" key={part.axis}>
              <div>
                <strong>{part.label}</strong>
                <small>{p ? STAGES[p.stage] : part.status}</small>
              </div>
              <div className="eng-step-dots">
                {PHASES.map(([s, l], i) => {
                  let n = p ? PHASES.findIndex((x) => x[0] === p.stage) : -1
                  if (p?.stage === 'research-ready') n = 0
                  if (p?.stage === 'design-ready') n = 1
                  if (['installed', 'delivered'].includes(p?.stage)) n = 6
                  return <span key={s} title={l} className={i <= n ? 'done' : ''} />
                })}
              </div>
              <div>
                <span>
                  {p ? money(p.cost_cents) : 'Следующий шаг ' + money(part.next_cost_cents || 0)}
                </span>
                {e.manage && !withdrawn ? (
                  <B
                    variant="quiet"
                    icon={ArrowRight}
                    onClick={() =>
                      p
                        ? projectOpen(e, p.id)
                        : openWork(
                            e,
                            part.action?.action === 'produce'
                              ? 'production'
                              : part.action?.action || 'research',
                            null,
                            {
                              entry: plan.entry,
                              axis: part.axis,
                              year: plan.year,
                              specification: part.specification,
                            },
                          )
                    }
                  >
                    {p ? 'Продолжить' : 'Рассмотреть'}
                  </B>
                ) : (
                  <Tag>{withdrawn ? 'Исполнение остановлено' : 'Наблюдение'}</Tag>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <details className="eng-details">
        <summary>Зависимости и риск пакета</summary>
        <p>{pkg.advice}</p>
        {pkg.parts.map((p) => (
          <p key={p.axis}>
            <strong>{p.label}:</strong> {p.risk}
          </p>
        ))}
      </details>
      {e.manage && !withdrawn && (
        <div className="eng-inline-actions">
          <B onClick={() => deployment('defer')} icon={CalendarDays}>
            Перенести срок
          </B>
          <B variant="quiet" onClick={() => deployment('withdraw')}>
            Отменить пакет
          </B>
        </div>
      )}
    </Card>
  )
}
function Resources() {
  const e = useE(),
    d = e.desks.programme,
    fin = d.finance || {},
    atr = d.atr
  return (
    <>
      <div className="eng-stats">
        <Stat
          label="Доступные средства"
          value={money(e.available ?? e.career.available_cents)}
          sub="С учётом подтверждённых заказов"
        />
        <Stat
          label="Cost Cap · остаток"
          value={fin.cap ? money(fin.cap.remaining_cents) : 'Не применяется'}
          sub="Регламентный лимит, не баланс счёта"
        />
        <Stat
          label="Расходы программы"
          value={money(Object.values(fin.actual || {}).reduce((a, b) => a + b, 0))}
          sub="Исходная финансовая проекция"
        />
        <Stat
          label="Режим штаба"
          value={MODES[e.desks.council.mandate?.mode] || 'Ручное управление'}
          sub="Меняется в делегировании"
        />
      </div>
      <div className="eng-main-grid">
        <Card
          title="Мощности и занятость"
          action={
            <B variant="quiet" icon={ArrowUpRight} onClick={() => e.navigate('facilities', 'capacity')}>
              Инфраструктура
            </B>
          }
        >
          <div className="eng-resource-table">
            {list(d.capacity).map((c) => (
              <div key={c.kind}>
                <span className="eng-resource-icon">
                  <Factory size={19} />
                </span>
                <div>
                  <strong>{c.label}</strong>
                  <small>
                    {c.free} свободно · {c.used} занято
                  </small>
                </div>
                <Progress value={c.used} max={c.used + c.free || 1} />
                <B variant="quiet" onClick={() => e.navigate('facilities', 'rent', c.kind)}>
                  Аренда
                </B>
              </div>
            ))}
          </div>
          <Note>
            Исследовательский центр, КБ, стенд, CFD, труба и цех имеют отдельную загрузку. Свободный
            бюджет не создаёт свободный слот.
          </Note>
        </Card>
        <Card
          title="Ограничения аэродинамики"
          kicker={atr ? 'ATR · ПЕРИОД ' + atr.period?.number : 'РЕГЛАМЕНТ'}
        >
          {atr ? (
            <>
              <p>Текущий период заканчивается {dateLabel(atr.period?.end_exclusive)}.</p>
              {Object.entries(atr.limits || {}).map(([k, max]) => (
                <Progress
                  key={k}
                  value={atr.used?.[k] || 0}
                  max={max}
                  label={
                    {
                      runs: 'Прогоны',
                      wind_on_minutes: 'Минуты под потоком',
                      occupancy_minutes: 'Минуты занятости',
                      cfd_geometries: 'Геометрии CFD',
                      cfd_milli_mauh: 'Милли-MAUh',
                    }[k] || k
                  }
                />
              ))}
              <B onClick={() => e.navigate('cap', 'atr')}>Подробный учёт ATR</B>
            </>
          ) : (
            <Empty icon={Gauge} title="ATR не применяется">
              У этой программы другие ограничения. Мощность оборудования и бюджет учитываются отдельно.
            </Empty>
          )}
        </Card>
      </div>
      <Card
        title="Люди, которые выполняют программу"
        action={
          <B variant="quiet" onClick={() => e.navigate('staff', 'collectives')}>
            Все коллективы
          </B>
        }
      >
        <div className="eng-collectives">
          {list(e.career.collectives).map((c) => (
            <div key={c.id}>
              <strong>{c.name}</strong>
              <span>
                {c.size} сотрудников · квалификация {c.qualification}
              </span>
              <Progress value={c.workload} label="Текущая нагрузка" />
              <Progress value={c.fatigue} label="Усталость" />
              <small>Фонд оплаты {money(c.payroll_cents)}</small>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
function WorkCalendar({ plan }) {
  const e = useE(),
    [scope, setScope] = useState('all')
  const rows = [
    ...(plan?.calendar || []).map((p) => ({
      ...p,
      title: p.label,
      kind: p.kind,
      start: p.start,
      end: p.forecast_end,
    })),
    ...e.projects
      .filter((p) => !plan || (p.entry === plan.entry && p.year === plan.year))
      .map((p) => ({
        ...p,
        title: AXES[p.axis],
        start: p.commissioned,
        end: p.estimated_finish,
      })),
  ].filter((p) => scope === 'all' || p.kind === scope)
  const start = e.date
  return (
    <Card
      title="Календарь инженерных работ"
      action={
        <select aria-label="Вид работы" value={scope} onChange={(ev) => setScope(ev.target.value)}>
          <option value="all">Все работы</option>
          {[
            ['research', 'Исследования'],
            ['design', 'Разработка'],
            ['test', 'Испытания'],
            ['production', 'Производство'],
          ].map(([id, l]) => (
            <option key={id} value={id}>
              {l}
            </option>
          ))}
        </select>
      }
    >
      <div className="eng-timeline-ruler">
        <span>Сегодня · {dateLabel(start)}</span>
        <span>+ 1 нед.</span>
        <span>+ 2 нед.</span>
        <span>+ 3 нед.</span>
        <span>+ 4 нед.</span>
      </div>
      {rows.length ? (
        rows.map((p) => {
          const offset = Math.max(0, (new Date(p.start) - new Date(start)) / 86400000),
            len = Math.max(1, (new Date(p.end) - new Date(p.start)) / 86400000)
          return (
            <button
              type="button"
              key={p.id}
              className="eng-timeline-row"
              onClick={() =>
                p.local
                  ? projectOpen(e, p.id)
                  : e.navigate(
                      p.kind === 'research'
                        ? 'research'
                        : p.kind === 'production'
                          ? 'production'
                          : 'development',
                      p.kind === 'test' ? 'test' : undefined,
                      p.id,
                    )
              }
            >
              <div>
                <strong>{p.title}</strong>
                <small>{p.reason || STAGES[p.stage] || p.kind}</small>
              </div>
              <div className="eng-timeline-track">
                <i
                  style={{
                    left: Math.min(88, (offset / 35) * 100) + '%',
                    width: Math.max(8, Math.min(100 - (offset / 35) * 100, (len / 35) * 100)) + '%',
                  }}
                >
                  {p.kind === 'test'
                    ? p.worked >= p.required
                      ? '1 / 1 сеанс'
                      : '0 / 1 сеанс'
                    : number(p.worked || 0) + ' / ' + number(p.required || 0) + ' ч'}
                </i>
              </div>
              <span>{dateLabel(p.end)}</span>
            </button>
          )
        })
      ) : (
        <Empty
          icon={CalendarDays}
          title="В календаре ещё нет утверждённых работ"
          action={
            e.manage && (
              <B
                primary
                onClick={() =>
                  openWork(e, 'research', null, {
                    entry: plan?.entry,
                    year: plan?.year,
                  })
                }
              >
                Поручить исследование
              </B>
            )
          }
        >
          Утверждённый заказ получит место в плане. Дата завершения остаётся оценкой до выделения
          мощности и специалистов.
        </Empty>
      )}
    </Card>
  )
}
function History({ rows = [] }) {
  const e = useE(),
    [q, setQ] = useState('')
  const filtered = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  return (
    <Card
      title="История решений"
      action={<SearchBox value={q} onChange={setQ} placeholder="Найти решение или обоснование" />}
    >
      <div className="eng-history">
        {filtered.length ? (
          filtered.map((r, i) => (
            <article key={r.id || r.instance || i}>
              <span className="eng-history-dot" />
              <div>
                <small>
                  {dateLabel(r.date)} {''}
                </small>
                <h3>{r.title || r.observation || STATES[r.code] || r.code || 'Передача экземпляра'}</h3>
                {r.reason && <p>{r.reason}</p>}
                {r.instance && (
                  <B variant="quiet" onClick={() => itemOpen(e, r.instance)}>
                    Паспорт экземпляра
                    {e.items.find((x) => x.id === r.instance)?.serial
                      ? ' · ' + e.items.find((x) => x.id === r.instance).serial
                      : ''}
                  </B>
                )}
                {r.person && <Person id={r.person} compact />}
              </div>
            </article>
          ))
        ) : (
          <Empty icon={FileText} title={q ? 'Совпадений нет' : 'История ещё не началась'}>
            {q
              ? 'Измените поисковый запрос.'
              : 'Решения, отмены и передачи экземпляров сохранятся здесь после первого действия.'}
          </Empty>
        )}
      </div>
    </Card>
  )
}
function councilDecision(e, p, initial = 'approve', option = p.recommended || 0) {
  e.openForm({
    title: 'Решение по предложению',
    wide: true,
    initial: { decision: initial, alternative: String(option), reason: '' },
    fields: [
      {
        key: 'decision',
        label: 'Решение',
        type: 'select',
        options: opts({
          approve: 'Утвердить выбранный вариант',
          investigate: 'Запросить исследование',
          delegate: 'Делегировать',
          defer: 'Отложить',
          reject: 'Отклонить',
        }),
      },
      {
        key: 'alternative',
        label: 'Альтернатива',
        type: 'select',
        options: p.options.map((o, i) => ({
          value: String(i),
          label: o.title,
        })),
        hidden: (v) => !['approve', 'delegate'].includes(v.decision),
      },
      {
        key: 'reason',
        label: 'Обоснование для штаба',
        type: 'textarea',
        wide: true,
      },
    ],
    summary: (v) => {
      const o = v.decision === 'investigate' ? p.investigation : p.options[Number(v.alternative)]
      return (
        <>
          <h3>{p.subject}</h3>
          {['approve', 'delegate', 'investigate'].includes(v.decision) && o ? (
            <>
              <p>{o.result}</p>
              <Facts
                items={[
                  ['Стоимость', money(o.cost_cents || 0)],
                  ['Работа', number(o.hours || 0) + ' ч'],
                  ['Ресурс', o.resource],
                  ['Риск', o.risk],
                ]}
              />
            </>
          ) : (
            <p>Позиции участников и обоснование сохранятся в деле.</p>
          )}
        </>
      )
    },
    validate: (v) => (p.blocked && ['approve', 'delegate'].includes(v.decision) ? p.blocked : null),
    onSubmit: (v) =>
      e.run('council-decide', {
        proposal: p.id,
        decision: v.decision,
        alternative: Number(v.alternative),
        reason: v.reason,
      }),
  })
}
function Council() {
  const e = useE(),
    d = e.desks.council
  const [selected, setSelected] = useState(e.g.entity || ''),
    [alternative, setAlternative] = useState(0),
    [filter, setFilter] = useState('all')
  useEffect(() => {
    if (e.g.entity) setSelected(e.g.entity)
  }, [e.g.entity])
  const proposals = list(d.proposals).map((p) => ({
    ...p,
  }))
  const active = proposals.filter((p) => ['open', 'deferred'].includes(p.status || 'open'))
  const filtered = active.filter(
    (p) => filter === 'all' || (filter === 'critical' ? p.importance >= 5 : p.status === 'deferred'),
  )
  const current = filtered.find((p) => p.id === selected) || filtered[0]
  useEffect(() => {
    setAlternative(current?.recommended || 0)
  }, [current?.id])
  const mandate = d.mandate || {}
  if (e.tab === 'archive')
    return (
      <History
        rows={[
          ...list(e.desks.production.history).filter(
            (h) => h.command?.startsWith('council') || h.command === 'meeting',
          ),
          ...(d.history || []),
        ]}
      />
    )
  if (e.tab === 'execution') {
    const decided = proposals.filter((p) => p.project || p.work || p.execution)
    return (
      <Card title="От решения к исполнению">
        <ProjectRows
          projects={[
            ...e.projects.filter((p) => p.proposal),
            ...decided
              .filter((p) => !p.project)
              .map((p) => ({
                id: p.work || p.id,
                entry: p.entry,
                title: p.subject,
                stage: p.execution?.status || 'research',
                kind: 'research',
                required: p.execution?.required,
                worked: p.execution?.worked,
                cost_cents: p.chosen?.cost_cents || 0,
                reason: p.execution?.reason,
              })),
          ]}
          empty="Решений к исполнению пока нет"
          action={<B onClick={() => e.navigate('council', 'agenda')}>Вернуться к повестке</B>}
        />
      </Card>
    )
  }
  if (e.tab === 'meeting') {
    const people = Object.entries(d.people || {})
    return (
      <div className="eng-main-grid">
        <Card
          title="Техническое совещание"
          kicker="ЛЮДИ / АРГУМЕНТЫ / РЕШЕНИЕ"
          action={
            e.manage && (
              <B primary icon={Plus} disabled title="Повестку формирует инженерный штаб">
                Записать совещание
              </B>
            )
          }
        >
          <div className="eng-meeting-table">
            <div className="eng-meeting-center">
              <Users size={32} />
              <strong>Инженерный штаб</strong>
              <span>{active.length} вопросов в повестке</span>
            </div>
            <div className="eng-meeting-people">
              {people.map(([id, p]) => (
                <Person key={id} id={id} name={p.name} role={p.role} />
              ))}
            </div>
          </div>
          <Note>
            Совещание помогает увидеть расхождения. Выбор варианта сохраняется с аргументами и авторами,
            а не теряется в общей очереди.
          </Note>
        </Card>
        <Card title="Протоколы совещаний">
          <Empty icon={FileText} title="Протоколы совещаний">
            {d.history?.length
              ? 'Принятые решения доступны в архиве штаба.'
              : 'Штаб ещё не принимал решений по повестке.'}
          </Empty>
        </Card>
      </div>
    )
  }
  return (
    <>
      <div className="eng-council-strip">
        <Stat
          label={e.manage ? 'На вашем решении' : 'На рассмотрении штаба'}
          value={active.length}
          sub="Предложений штаба"
        />
        <Stat
          label="Делегирование"
          value={MODES[mandate.mode] || 'Ручное управление'}
          sub={FOCUS[mandate.focus]}
        />
        <Stat
          label="Лимит одного решения"
          value={money(mandate.limit_cents || 0)}
          sub={mandate.allow_rent ? 'Аренда разрешена' : 'Аренда требует согласования'}
        />
      </div>
      <div className="eng-council-layout">
        <aside className="eng-agenda">
          <div className="eng-agenda-heading">
            <strong>ПОВЕСТКА</strong>
            <select
              aria-label="Фильтр предложений"
              value={filter}
              onChange={(ev) => setFilter(ev.target.value)}
            >
              <option value="all">Все вопросы</option>
              <option value="critical">Высокая значимость</option>
              <option value="deferred">Отложенные</option>
            </select>
          </div>
          {filtered.map((p) => (
            <button
              type="button"
              key={p.id}
              className={p.id === current?.id ? 'selected' : ''}
              onClick={() => setSelected(p.id)}
            >
              <small>{e.entryTitle(p.entry)}</small>
              <strong>{p.subject}</strong>
              <span>{p.occasion}</span>
              <div>
                <Tag status={p.status || 'open'} />
                <span>{money(p.options?.[p.recommended]?.cost_cents || 0)}</span>
              </div>
            </button>
          ))}
          {!filtered.length && (
            <Empty title="Повестка разобрана">Решения доступны в исполнении и архиве.</Empty>
          )}
        </aside>
        {current ? (
          <section className="eng-council-dossier">
            <div className="eng-dossier-title">
              <small>{dateLabel(current.date)} · ИНИЦИАТОР</small>
              <Person id={current.lead} role="Инициатор предложения" />
              <h2>{current.subject}</h2>
              <p>{current.occasion}</p>
            </div>
            <div className="eng-evidence-grid">
              <div>
                <small>НАБЛЮДЕНИЕ</small>
                <p>{current.observation}</p>
              </div>
              <div>
                <small>ГИПОТЕЗА</small>
                <p>{current.hypothesis}</p>
                <Tag>Уверенность {current.confidence}%</Tag>
              </div>
            </div>
            <h3>Позиции специалистов</h3>
            <div className="eng-positions">
              {current.positions?.map((p, i) => (
                <article key={p.person + i}>
                  <Person id={p.person} compact role={p.stance} />
                  <p>{p.argument}</p>
                  <small>Уверенность {p.confidence}%</small>
                </article>
              ))}
            </div>
            <div className="eng-options-heading">
              <h3>Что мы можем сделать</h3>
              <Tag>Выберите вариант</Tag>
            </div>
            <div className="eng-alternatives">
              {current.options.map((o, i) => (
                <button
                  type="button"
                  key={i}
                  className={alternative === i ? 'selected' : ''}
                  onClick={() => setAlternative(i)}
                >
                  <div>
                    <span className="eng-radio">{alternative === i && <i />}</span>
                    <strong>{o.title}</strong>
                    {current.recommended === i && <Tag tone="good">Рекомендация</Tag>}
                  </div>
                  <p>{o.result}</p>
                  <span>
                    {money(o.cost_cents)} · {o.hours} ч · {o.resource}
                  </span>
                  <small>Риск: {o.risk}</small>
                </button>
              ))}
            </div>
            {current.blocked && <Note tone="warn">{current.blocked}</Note>}
            {e.manage && (
              <div className="eng-decision-bar">
                <B onClick={() => councilDecision(e, current, 'reject', alternative)}>Отклонить</B>
                <B onClick={() => councilDecision(e, current, 'defer', alternative)}>Отложить</B>
                <B onClick={() => councilDecision(e, current, 'investigate', alternative)}>
                  Исследовать
                </B>
                <B
                  primary
                  icon={Check}
                  onClick={() => councilDecision(e, current, 'approve', alternative)}
                  disabled={!!current.blocked}
                >
                  Утвердить вариант
                </B>
              </div>
            )}
            <details className="eng-details">
              <summary>Материалы и источники</summary>
              {current.materials?.map((m) => (
                <p key={m.id}>
                  {m.text}{' '}
                  {m.section && (
                    <B variant="quiet" onClick={() => e.navigate(m.section)}>
                      Открыть раздел
                    </B>
                  )}
                </p>
              ))}
              {current.sources?.map((s) => (
                <small className="eng-break" key={s}>
                  {s}
                </small>
              ))}
            </details>
          </section>
        ) : (
          <Card title="Следующие решения">
            <Empty icon={CheckCircle2} title="По выбранному фильтру вопросов нет">
              Измените фильтр или откройте журнал принятых решений.
            </Empty>
          </Card>
        )}
      </div>
    </>
  )
}
function Research() {
  const e = useE(),
    d = e.desks.research,
    [axis, setAxis] = useStored('engineering.research.axis', 'all')
  const projects = sourceProjects(e, 'research').filter(
    (p) =>
      (axis === 'all' || p.axis === axis) &&
      JSON.stringify(p).toLowerCase().includes(e.query.toLowerCase()),
  )
  const reports = list(d.reports)
  if (e.tab === 'memory')
    return (
      <>
        <div className="eng-toolbar">
          <SearchBox
            value={e.query}
            onChange={e.setQuery}
            placeholder="Найти заключение, автора или источник"
          />
          <select
            aria-label="Направление знаний"
            value={axis}
            onChange={(ev) => setAxis(ev.target.value)}
          >
            <option value="all">Все направления</option>
            {opts(AXES).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="eng-memory-grid">
          {reports
            .filter(
              (r) =>
                (axis === 'all' || r.axis === axis) &&
                JSON.stringify(r).toLowerCase().includes(e.query.toLowerCase()),
            )
            .map((r) => (
              <Card
                key={r.id}
                title={r.hypothesis || AXES[r.axis]}
                kicker={dateLabel(r.date)}
                action={
                  <Tag
                    tone={
                      r.outcome === 'supported' ? 'good' : r.outcome === 'rejected' ? 'danger' : 'warn'
                    }
                  >
                    {{
                      supported: 'Гипотеза поддержана',
                      rejected: 'Гипотеза отвергнута',
                      inconclusive: 'Недостаточно данных',
                    }[r.outcome] || 'Заключение'}
                  </Tag>
                }
              >
                <p className="eng-report-conclusion">{r.conclusion}</p>
                <Facts
                  items={[
                    [
                      'Уверенность',
                      r.confidence == null ? 'Не рассчитывается в карьере' : r.confidence + '%',
                    ],
                    ['Источник', r.source?.label || r.sourceLabel || 'Документация программы'],
                    ['Регламент', r.regulation || 'В рамках выбранной программы'],
                  ]}
                />
                <div className="eng-inline-actions">
                  <B
                    onClick={() =>
                      r.local
                        ? projectOpen(e, r.project)
                        : e.setDialog({
                            title: 'Исследовательское заключение',
                            content: (
                              <div className="eng-stack">
                                <p>{r.hypothesis}</p>
                                <p>{r.conclusion}</p>
                                <Facts
                                  items={Object.entries(r.applicability || {}).map(([k, v]) => [
                                    k,
                                    v + '%',
                                  ])}
                                />
                              </div>
                            ),
                          })
                    }
                  >
                    Открыть дело
                  </B>
                  {e.manage && (
                    <B icon={Users} onClick={() => handover(e, r)}>
                      Передать знания
                    </B>
                  )}
                </div>
              </Card>
            ))}
        </div>
        {!reports.length && (
          <Card title="Архив технических заключений">
            <Empty
              icon={FileText}
              title="Исследования ещё не завершены"
              action={
                e.manage && (
                  <B primary onClick={() => openWork(e, 'research')}>
                    Поручить исследование
                  </B>
                )
              }
            >
              В архиве будут сохранены источники, авторы, вывод, применимость и уровень уверенности.
              Начальные чертежи уже доступны в гараже.
            </Empty>
          </Card>
        )}
        <Card title="Передача опыта внутри штаба">
          {list(d.handovers).length ? (
            list(d.handovers).map((h) => (
              <div className="eng-transfer" key={h.id}>
                <Person id={h.mentor} name={h.mentor_name} compact />
                <ArrowRight size={17} />
                <Person id={h.recipient} name={h.recipient_name} compact />
                <span>{dateLabel(h.date)}</span>
                <Tag>{'В архиве'}</Tag>
              </div>
            ))
          ) : (
            <Note>
              Передача знания занимает рабочий день обоих специалистов. Архив организации сохраняется
              после увольнения автора.
            </Note>
          )}
        </Card>
        <Card title="Контроль и входные факты">
          <div className="eng-document-list">
            {(d.inspections || []).map((x) => (
              <article key={x.id}>
                <ShieldCheck size={18} />
                <div>
                  <strong>
                    {x.serial} · {STATES[x.code] || x.code}
                  </strong>
                  <small>
                    {dateLabel(x.date)} · {e.name(x.person)}
                  </small>
                </div>
              </article>
            ))}
          </div>
          {!d.inspections?.length && (
            <p>Новые протоколы контроля появятся после проверки физических экземпляров.</p>
          )}
        </Card>
      </>
    )
  return (
    <>
      <div className="eng-section-lead">
        <div>
          <h2>Исследовательский центр</h2>
          <p>Проверьте гипотезу до того, как вкладывать ресурсы в новую редакцию.</p>
        </div>
        {e.manage && (
          <B primary icon={Plus} onClick={() => openWork(e, 'research')}>
            Новое исследование
          </B>
        )}
      </div>
      <div className="eng-stats">
        <Stat label="В работе и очереди" value={projects.filter((p) => p.stage === 'research').length} />
        <Stat label="Технические заключения" value={reports.length} />
        <Stat
          label="Доступные слоты"
          value={d.capacity?.available_slots ?? '—'}
          sub={'Установлено ' + (d.capacity?.installed_slots ?? '—')}
        />
        <Stat
          label="Расходы исследований"
          value={money(
            (d.spent_cents || 0) +
              e.projects.reduce(
                (n, p) =>
                  n +
                  (p.steps || [])
                    .filter((s) => s.stage === 'research')
                    .reduce((a, s) => a + s.cost_cents, 0),
                0,
              ),
          )}
        />
      </div>
      <div className="eng-main-grid">
        <Card
          title="Рабочая очередь"
          action={<SearchBox value={e.query} onChange={e.setQuery} placeholder="Поиск исследования" />}
        >
          <ProjectRows
            projects={projects}
            empty="Центр готов к новой гипотезе"
            action={e.manage && <B onClick={() => openWork(e, 'research')}>Поручить исследование</B>}
          />
        </Card>
        <Card title="Вопросы вашей программы" kicker="ИНЖЕНЕРНЫЙ БРИФ">
          {list(d.entries)
            .slice(0, 1)
            .flatMap((en) =>
              Object.entries(en.questions || {}).map(([axis, q]) => (
                <button
                  type="button"
                  className="eng-question"
                  key={axis}
                  disabled={!e.manage}
                  onClick={() => openWork(e, 'research', null, { entry: en.id, axis })}
                >
                  <span>{AXES[axis]}</span>
                  <strong>{q}</strong>
                  <ArrowUpRight size={17} />
                </button>
              )),
            )}
          <B onClick={() => e.navigate('council', 'agenda')}>Предложения штаба</B>
        </Card>
      </div>
    </>
  )
}
function handover(e, r) {
  const staff = Object.entries(e.desks.research.staff || {}),
    mentor = r.lead || Object.keys(r.participants || {})[0] || staff[0]?.[0]
  e.openForm({
    title: 'Передать знания по заключению',
    initial: {
      mentor,
      recipient: staff.find(([id]) => id !== mentor)?.[0] || '',
      target: '',
    },
    fields: [
      {
        key: 'mentor',
        label: 'Наставник',
        type: 'select',
        options: staff.map(([value, label]) => ({ value, label })),
      },
      {
        key: 'recipient',
        label: 'Получатель знаний',
        type: 'select',
        options: staff.map(([value, label]) => ({ value, label })),
      },
      { key: 'target', label: 'Для какой задачи', required: false, wide: true },
    ],
    description:
      'Оба специалиста выделяют рабочий день. Передаётся опыт конкретного дела, а не общий бонус навыка.',
    validate: (v) =>
      v.mentor === v.recipient
        ? 'Наставник и получатель должны быть разными людьми.'
        : !v.mentor || !v.recipient
          ? 'Нужны два действующих специалиста.'
          : null,
    onSubmit: (v) =>
      e.run('research-handover', { report: r.id, mentor: v.mentor, recipient: v.recipient }),
  })
}
function Development() {
  const e = useE(),
    d = e.desks.development,
    [filter, setFilter] = useStored('engineering.development.axis', 'all')
  const isTest = e.tab === 'test'
  const baseline =
    e.tab === 'archive'
      ? list(d.projects)
          .filter((p) => p.status === 'complete')
          .map((p) => ({
            ...p,
            source: true,
            stage: p.disposition || 'completed',
          }))
      : sourceProjects(e, isTest ? 'test' : 'design')
  const rows = baseline.filter(
    (p) =>
      (filter === 'all' || p.axis === filter) &&
      JSON.stringify(p).toLowerCase().includes(e.query.toLowerCase()),
  )
  return (
    <>
      <div className="eng-section-lead">
        <div>
          <h2>
            {e.tab === 'archive'
              ? 'Редакции и результаты проверок'
              : isTest
                ? 'Сначала сопоставимые условия'
                : 'Конструкторское бюро'}
          </h2>
          <p>
            {isTest
              ? 'Проверяйте конкретные редакции. Метод, погрешность и условия остаются рядом с результатом.'
              : 'Свяжите исходный чертёж, задачу инженера и границы применимости.'}
          </p>
        </div>
        {e.manage && (
          <B primary icon={Plus} onClick={() => openWork(e, isTest ? 'test' : 'design')}>
            {isTest ? 'Назначить испытание' : 'Новая разработка'}
          </B>
        )}
      </div>
      <div className="eng-toolbar">
        <SearchBox value={e.query} onChange={e.setQuery} />
        <select
          value={filter}
          onChange={(ev) => setFilter(ev.target.value)}
          aria-label="Направление разработки"
        >
          <option value="all">Все узлы</option>
          {opts(AXES).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Card
        title={
          e.tab === 'archive'
            ? 'Архив технических дел'
            : isTest
              ? 'Очередь испытаний'
              : 'Текущие разработки'
        }
      >
        <ProjectRows
          projects={rows}
          action={
            e.manage && (
              <B onClick={() => openWork(e, isTest ? 'test' : 'design')}>
                {isTest ? 'Проверить исходную редакцию' : 'Поручить разработку'}
              </B>
            )
          }
        />
      </Card>
      {isTest ? (
        <div className="eng-tests-grid">
          {Object.entries(d.tests || {}).map(([id, t]) => (
            <button
              type="button"
              key={id}
              className="eng-test-method"
              disabled={!e.manage}
              onClick={() => openWork(e, 'test', null, { method: id })}
            >
              <Gauge size={23} />
              <strong>{t.label}</strong>
              <span>{money(t.cost)}</span>
              <small>
                {Object.keys(t.atr || {}).length ? 'Расходует квоту ATR' : 'Не расходует квоту ATR'}
              </small>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Card title="Доступные исходные чертежи" kicker="РЕДАКЦИИ РЕАЛЬНОЙ КАРЬЕРЫ">
          <div className="eng-drawings">
            {list(d.entries)
              .slice(0, 1)
              .flatMap((en) =>
                en.axes.map((a) => (
                  <div key={a.id} className="eng-drawing">
                    <div className="eng-drawing-glyph">
                      <Layers size={34} />
                      <small>{a.id.toUpperCase()}</small>
                    </div>
                    <div>
                      <strong>{a.label}</strong>
                      <span>
                        {a.versions.length} редакций · {money(a.price)}
                      </span>
                      <small>{a.blocked || e.name(a.lead)}</small>
                    </div>
                    <B
                      variant="quiet"
                      disabled={!e.manage || !!a.blocked}
                      onClick={() =>
                        openWork(e, 'design', null, {
                          entry: en.id,
                          axis: a.id,
                        })
                      }
                    >
                      Разработать
                    </B>
                  </div>
                )),
              )}
          </div>
        </Card>
      )}
    </>
  )
}
function ProjectDossier({ id }) {
  const e = useE()
  const p =
    e.projects.find((x) => x.id === id) ||
    ['research', 'design', 'test', 'production']
      .flatMap((k) => sourceProjects(e, k))
      .find((x) => x.id === id) ||
    list(e.desks.manufacturer.projects).find((x) => x.id === id)
  if (!p)
    return (
      <Empty title="Техническое дело недоступно">
        Проект отсутствует в доступной проекции текущей карьеры.
      </Empty>
    )
  const physical = e.items.filter((i) => i.project === p.id || i.batch === p.id)
  function change(command, args) {
    return e.run(command, args)
  }

  function cancel() {
    e.openForm({
      title: p.stage === 'production' ? 'Отменить производственный заказ' : 'Вмешаться в исполнение',
      initial: { reason: '' },
      fields: [{ key: 'reason', label: 'Причина отмены', type: 'textarea' }],
      danger: true,
      description:
        'Понесённые расходы и история сохраняются. Незавершённая работа не создаёт готовых физических экземпляров.',
      onSubmit: (v) =>
        p.stage === 'production'
          ? change('production-cancel', { batch: p.id })
          : change('council-intervene', { proposal: p.proposal, change: 'cancel', reason: v.reason }),
    })
  }
  function release(disposition) {
    e.openForm({
      title: disposition === 'released' ? 'Выпустить редакцию' : 'Отозвать редакцию',
      initial: { reason: '' },
      fields: [
        {
          key: 'reason',
          label: 'Обоснование технического решения',
          type: 'textarea',
        },
      ],
      danger: disposition === 'withdrawn',
      description:
        disposition === 'released'
          ? 'Выпущенный чертёж можно передать в производство. Допуск к установке проверяется отдельно.'
          : 'Новые заказы и поставки по этой редакции остановятся. Существующие экземпляры сохраняют паспорта и историю.',
      onSubmit: () =>
        change(e.maker ? 'maker-review' : 'development-review', { project: p.id, disposition }),
    })
  }
  return (
    <div className="eng-project-dossier">
      <div className="eng-project-head">
        <div>
          <small>
            {e.entryTitle(p.entry)} · {p.year || e.year}
          </small>
          <h3>{AXES[p.axis] || p.title}</h3>
          <p>{GOALS[p.objective] || GOALS[p.brief] || p.hypothesis || p.title}</p>
        </div>
        <Tag status={p.stage} />
      </div>
      <Pipeline stage={p.stage} steps={p.steps} disposition={p.disposition} />
      <Facts
        items={[
          ['Понесённые расходы', money(p.cost_cents ?? p.cost ?? 0)],
          [
            'Объём текущей работы',
            p.kind === 'test'
              ? p.worked >= p.required
                ? '1 / 1 сеанс'
                : '0 / 1 сеанс'
              : number(p.worked || 0) + ' / ' + number(p.required || 0) + ' ч',
          ],
          ['Поручено', dateLabel(p.commissioned)],
          ['Редакция', p.version ? '№ ' + p.version : p.specification || 'Исходная'],
          p.method && ['Метод испытания', p.methodLabel || METHODS[p.method]],
          ['Приоритет', PRIORITY[p.priority] || p.priority || 'Обычный'],
        ]}
      />
      <Person id={p.lead} role="Ответственный за работу" />
      {p.reason && <Note tone="warn">{p.reason}</Note>}
      {p.researchReport && (
        <Card title="Исследовательское заключение">
          <p>{p.researchReport.conclusion}</p>
          <Tag>
            {
              {
                supported: 'Поддержана',
                rejected: 'Отвергнута',
                inconclusive: 'Недостаточно данных',
              }[p.researchReport.outcome]
            }
          </Tag>
        </Card>
      )}
      {p.report && (
        <Card title="Протокол испытания">
          <p>{p.report.conclusion || p.report.finding || p.report.interpretation}</p>
          <Facts
            items={[
              ['Показатель', METRICS[p.report.metric] || p.report.metric],
              ['Разница', p.report.difference],
              ['Неопределённость', p.report.uncertainty],
              ['Условия', p.report.conditions],
            ]}
          />
        </Card>
      )}
      {physical.length > 0 && (
        <Card title="Физические экземпляры партии">
          <div className="eng-serial-list">
            {physical.map((i) => (
              <button type="button" key={i.id} onClick={() => itemOpen(e, i.id)}>
                <Package size={18} />
                <strong>{i.serial}</strong>
                <Tag status={i.status} />
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </Card>
      )}
      {e.manage && (
        <div className="eng-next-step">
          {['research', 'design', 'test', 'production'].includes(p.stage) ? (
            <>
              <div>
                <small>ПРОВЕРКА СЦЕНАРИЯ</small>
                <strong>Перейти к следующему событию текущей работы</strong>
                <p>Изменится очередь, появится следующий доступный шаг.</p>
              </div>
              <B
                primary
                icon={Check}
                onClick={() => {
                  e.close()
                  e.g.onAdvance()
                }}
              >
                Перейти к следующему событию
              </B>
            </>
          ) : p.stage === 'research-ready' ? (
            <>
              <div>
                <small>СЛЕДУЮЩЕЕ РЕШЕНИЕ</small>
                <strong>Передать заключение в КБ</strong>
                <p>Исследование не меняет автомобиль. Требуется отдельная разработка.</p>
              </div>
              <B primary icon={ArrowRight} onClick={() => openWork(e, 'design', p)}>
                Поручить разработку
              </B>
            </>
          ) : p.stage === 'design-ready' ? (
            <>
              <div>
                <small>СЛЕДУЮЩЕЕ РЕШЕНИЕ</small>
                <strong>Проверить новую редакцию</strong>
                <p>Сопоставьте исходный чертёж с кандидатом.</p>
              </div>
              <B primary icon={Gauge} onClick={() => openWork(e, 'test', p)}>
                Назначить испытание
              </B>
            </>
          ) : p.stage === 'review' ? (
            <>
              <div>
                <small>ТЕХНИЧЕСКИЙ ДОПУСК</small>
                <strong>Рассмотреть протокол</strong>
                <p>Выпуск разрешает производство; отзыв сохраняет неудачный опыт.</p>
              </div>
              <B variant="danger" onClick={() => release('withdrawn')}>
                Отозвать
              </B>
              <B primary disabled={p.report?.outcome === 'defect'} onClick={() => release('released')}>
                Выпустить редакцию
              </B>
            </>
          ) : p.stage === 'released' ? (
            <>
              <div>
                <small>ЧЕРТЁЖ ГОТОВ</small>
                <strong>Нужны физические экземпляры</strong>
                <p>Определите количество и способ изготовления.</p>
              </div>
              <B primary icon={Factory} onClick={() => openWork(e, 'production', p)}>
                Заказать партию
              </B>
            </>
          ) : p.stage === 'quality' ? (
            <>
              <div>
                <small>ПАРТИЯ ИЗГОТОВЛЕНА</small>
                <strong>Каждый экземпляр проходит приёмку</strong>
                <p>
                  Принятых: {physical.filter((i) => i.status === 'stock').length} / {physical.length}
                </p>
              </div>
              <B
                primary
                onClick={() => {
                  e.close()
                  e.navigate(e.maker ? 'manufacturer' : 'production', e.maker ? 'factory' : 'quality')
                }}
              >
                Открыть контроль
              </B>
            </>
          ) : ['stock', 'installed', 'delivered'].includes(p.stage) ? (
            <>
              <div>
                <small>ФИЗИЧЕСКИЙ РЕЗУЛЬТАТ</small>
                <strong>
                  {p.stage === 'delivered'
                    ? 'Экземпляры переданы клиентам'
                    : 'Редакция доступна в реестре'}
                </strong>
              </div>
              <B
                onClick={() => {
                  e.close()
                  e.navigate('inventory')
                }}
              >
                Открыть склад
              </B>
            </>
          ) : (
            <Note>Работа закрыта. Её история и понесённые расходы сохранены.</Note>
          )}
        </div>
      )}
      {e.manage && (
        <div className="eng-inline-actions">
          {['research', 'design', 'test', 'production'].includes(p.stage) && (
            <>
              <B
                onClick={() =>
                  e.openForm({
                    title: 'Изменить приоритет поручения',
                    initial: { priority: p.priority || 'normal', reason: '' },
                    fields: [
                      {
                        key: 'priority',
                        label: 'Новый приоритет',
                        type: 'select',
                        options: opts(PRIORITY),
                      },
                      ...(p.proposal
                        ? [
                            {
                              key: 'reason',
                              label: 'Обоснование вмешательства',
                              type: 'textarea',
                            },
                          ]
                        : []),
                    ],
                    onSubmit: (v) =>
                      p.proposal
                        ? change('council-intervene', {
                            proposal: p.proposal,
                            change: 'priority',
                            reason: v.reason,
                          })
                        : p.stage === 'production'
                          ? change('production-priority', { batch: p.id, priority: v.priority })
                          : change(
                              p.stage === 'research' ? 'research-priority' : 'development-priority',
                              { project: p.id, priority: v.priority },
                            ),
                  })
                }
              >
                Приоритет
              </B>
              <B variant="quiet" disabled={p.stage !== 'production' && !p.proposal} onClick={cancel}>
                Отменить работу
              </B>
            </>
          )}
          {['released', 'production', 'quality', 'stock'].includes(p.stage) && (
            <B variant="quiet" onClick={() => release('withdrawn')}>
              Отозвать редакцию
            </B>
          )}
        </div>
      )}
      <details className="eng-details">
        <summary>Основания, затраты и история этапов</summary>
        <p className="eng-break">Исходная редакция: {p.baseline || 'Не раскрыта'}</p>
        <p className="eng-break">
          Источник: {p.sourceLabel || p.sourceReference || 'Собственная техническая документация'}
        </p>
        {(p.steps || []).map((step, i) => (
          <div className="eng-row" key={i}>
            <span>
              {STAGES[step.stage]} · {dateLabel(step.date)}
            </span>
            <span>
              {money(step.cost_cents || 0)} · {number(step.hours || 0)} ч
            </span>
          </div>
        ))}
      </details>
    </div>
  )
}
function Production() {
  const e = useE(),
    d = e.desks.production
  const count = (state) => e.items.filter((i) => i.status === state).length
  return (
    <>
      <div className="eng-stats">
        <Stat
          label="Заказы в работе"
          value={
            list(d.batches).filter((b) => b.status !== 'complete' && b.status !== 'cancelled').length
          }
        />
        <Stat label="Контроль качества" value={count('inspection')} />
        <Stat label="Готово к установке" value={count('stock')} />
        <Stat
          label="Складские места"
          value={d.storage ? d.storage.used + ' / ' + d.storage.total : 'Не раскрыто'}
          sub="Установленные детали учитываются отдельно"
        />
      </div>
      {e.tab === 'stock' ? (
        <Inventory />
      ) : e.tab === 'quality' ? (
        <Inventory initialStatus="inspection" quality />
      ) : e.tab === 'archive' ? (
        <History
          rows={[
            ...list(e.desks.production.history).filter(
              (h) =>
                h.command?.includes('production') ||
                h.command?.includes('item') ||
                h.command === 'component-install',
            ),
            ...(d.history || []),
          ]}
        />
      ) : e.tab === 'needs' ? (
        <Card title="Потребность в физических экземплярах" kicker="РЕКОМЕНДАЦИИ МЕХАНИКОВ">
          <div className="eng-needs">
            {list(d.needs).map((n, i) => (
              <article key={n.entry + n.slot + i}>
                <div>
                  <small>{e.entryTitle(n.entry)}</small>
                  <h3>{AXES[n.slot] || n.slot}</h3>
                  <p>
                    Заявок {n.cars} · На складе {n.stock} · В производстве {n.pending} · На замену{' '}
                    {n.replace}
                  </p>
                </div>
                <div>
                  <strong>{n.quantity}</strong>
                  <small>рекомендуется заказать</small>
                </div>
                <B
                  primary
                  disabled={!e.manage || n.quantity < 1}
                  onClick={() =>
                    openWork(e, 'production', null, {
                      entry: n.entry,
                      axis: n.slot,
                      specification: n.specification,
                      quantity: n.quantity,
                    })
                  }
                >
                  Заказать
                </B>
              </article>
            ))}
          </div>
          {!d.needs?.length && (
            <Empty title="Дефицит не выявлен">
              Потребность формируется по сборкам, запасам, износу и утверждённым заказам.
            </Empty>
          )}
        </Card>
      ) : (
        <>
          <Card
            title="Рабочая очередь цеха"
            action={
              e.manage && (
                <B primary icon={Plus} onClick={() => openWork(e, 'production')}>
                  Новый заказ
                </B>
              )
            }
          >
            <ProjectRows
              projects={[...sourceProjects(e, 'production').filter((p) => p.stage === 'production')]}
              empty="Цех готов принять заказ"
              action={
                e.manage && <B onClick={() => openWork(e, 'production')}>Изготовить исходную редакцию</B>
              }
            />
          </Card>
          <Card
            title="Производственные мощности"
            action={<B onClick={() => e.navigate('facilities', 'capacity')}>Управлять мощностями</B>}
          >
            <div className="eng-collectives">
              {list(d.capacity).map((c) => (
                <article key={c.kind}>
                  <Factory size={24} />
                  <h3>{c.label}</h3>
                  <p>
                    {c.crew
                      ? c.crew.name + ' · ' + c.crew.size + ' сотрудников'
                      : 'Складская инфраструктура'}
                  </p>
                  {(c.sites || []).map((site) => (
                    <p key={site.id}>
                      {site.owned ? 'Своя площадка' : 'Внешняя площадка'} · состояние {site.condition}% ·{' '}
                      {site.used} / {site.slots} слотов занято
                    </p>
                  ))}
                  <Facts
                    items={[
                      ['Квалификация', c.crew?.qualification],
                      [
                        'Рабочая нагрузка',
                        c.crew?.workload == null ? 'Не раскрыто' : c.crew.workload + '%',
                      ],
                      ['Усталость', c.crew?.fatigue == null ? 'Не применяется' : c.crew.fatigue + '%'],
                      ['Арендная ставка', money(c.daily_cents)],
                    ]}
                  />
                </article>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  )
}
function Inventory({ initialStatus = 'all', quality = false }) {
  const e = useE(),
    [status, setStatus] = useStored(
      'engineering.inventory.' + (quality ? 'quality' : 'stock') + '.status',
      initialStatus,
    ),
    [slot, setSlot] = useStored('engineering.inventory.slot', 'all'),
    [sort, setSort] = useStored('engineering.inventory.sort', 'serial'),
    [linked, setLinked] = useState(e.g.entity || '')
  useEffect(() => {
    setLinked(e.g.entity || '')
  }, [e.g.entity])
  const rows = e.items
    .filter(
      (i) =>
        (!linked || i.id === linked || i.specification === linked || i.entry === linked) &&
        (status === 'all' || i.status === status) &&
        (slot === 'all' || (i.slot || i.axis) === slot) &&
        [i.serial, i.title, AXES[i.slot], i.specification]
          .join(' ')
          .toLowerCase()
          .includes(e.query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'version'
        ? (b.version || 0) - (a.version || 0)
        : String(a.serial || a.id).localeCompare(String(b.serial || b.id)),
    )
  return (
    <Card
      title={quality ? 'Приёмка физических экземпляров' : 'Реестр компонентов'}
      action={<Tag>{plural(rows.length, 'экземпляр', 'экземпляра', 'экземпляров')}</Tag>}
    >
      {linked && (
        <div className="context-source">
          <span>
            Открыто по рекомендации:{' '}
            {e.items.find((i) => i.id === linked || i.specification === linked || i.entry === linked)
              ?.title ||
              e.entryTitle(linked) ||
              'связанный компонент'}
          </span>
          <B onClick={() => setLinked('')}>Показать весь склад</B>
        </div>
      )}
      <div className="eng-inventory-toolbar">
        <SearchBox
          value={e.query}
          onChange={e.setQuery}
          placeholder="Найти серийный номер или компонент"
        />
        <select
          aria-label="Состояние экземпляра"
          value={status}
          onChange={(ev) => setStatus(ev.target.value)}
        >
          <option value="all">Все состояния</option>
          {opts(STATES)
            .filter((o) =>
              ['stock', 'installed', 'inspection', 'repair', 'scrapped', 'delivered'].includes(o.value),
            )
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </select>
        <select aria-label="Тип компонента" value={slot} onChange={(ev) => setSlot(ev.target.value)}>
          <option value="all">Все узлы</option>
          {opts(AXES).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Сортировка экземпляров"
          value={sort}
          onChange={(ev) => setSort(ev.target.value)}
        >
          <option value="serial">По номеру</option>
          <option value="version">По редакции</option>
        </select>
      </div>
      <div className="eng-inventory-table">
        <div className="eng-inventory-head">
          <span>Компонент / экземпляр</span>
          <span>Состояние</span>
          <span>Редакция</span>
          <span>Остаточный ресурс</span>
          <span>Расположение</span>
          <span />
        </div>
        {rows.map((i) => (
          <button
            type="button"
            key={i.id}
            className="eng-inventory-row"
            onClick={() => itemOpen(e, i.id)}
          >
            <div>
              <strong>{i.label || AXES[i.slot || i.axis]}</strong>
              <code>{i.serial || i.id}</code>
            </div>
            <Tag status={i.status} />
            <span className="eng-item-version">Ред. {i.version || '—'}</span>
            <span className="eng-item-resource">
              {i.remaining_m == null ? 'После проверки' : number(i.remaining_m / 1000) + ' км'}
              {i.distance_m != null && <small>Пробег {number(i.distance_m / 1000)} км</small>}
            </span>
            <span className="eng-item-location">
              {i.installed
                ? e.entryTitle(i.installed)
                : i.deliveredEntry
                  ? e.entryTitle(i.deliveredEntry)
                  : i.status === 'scrapped'
                    ? 'Архив'
                    : 'Организация'}
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      {!rows.length && (
        <Empty
          icon={Package}
          title="В этой выборке нет экземпляров"
          action={
            <B
              onClick={() => {
                setStatus('all')
                setSlot('all')
                e.setQuery('')
              }}
            >
              Сбросить фильтры
            </B>
          }
        >
          Чертёж, заказ и физическая деталь — разные сущности. После изготовления партия поступит на
          приёмку.
        </Empty>
      )}
    </Card>
  )
}
function itemDisposition(e, item, decision) {
  const labels = {
    accept: 'Принять по протоколу',
    inspect: 'Направить на проверку',
    repair: 'Назначить ремонт',
    scrap: 'Списать экземпляр',
  }
  e.openForm({
    title: labels[decision],
    initial: { reason: '' },
    fields: [{ key: 'reason', label: 'Основание решения', type: 'textarea' }],
    danger: decision === 'scrap',
    description:
      decision === 'accept'
        ? 'Контроль проверит состояние физического экземпляра.'
        : decision === 'scrap'
          ? 'Экземпляр останется в истории и станет недоступным для установки.'
          : 'Занятость оборудования и фактическая длительность работ рассчитываются игровым backend.',
    summary: (
      <Facts
        items={[
          ['Экземпляр', item.serial],
          ['Стоимость ремонта', decision === 'repair' ? money(item.repair_cents) : 'Не применяется'],
        ]}
      />
    ),
    onSubmit: (v) =>
      e.run(e.maker ? 'maker-item' : 'production-disposition', { instance: item.id, decision }),
  })
}
function ItemDossier({ id }) {
  const e = useE(),
    item = e.items.find((x) => x.id === id)
  if (!item)
    return (
      <Empty title="Экземпляр недоступен">
        Паспорт относится к другой организации или отсутствует в доступной проекции.
      </Empty>
    )
  const axis = item.slot || item.axis
  const project = e.projects.find((p) => p.id === item.project)
  const compatible = (item.targets || []).filter((x) => !x.reason)
  const installable =
    item.status === 'stock' && !item.rejected && !item.damaged && project?.stage !== 'withdrawn'
  function install() {
    const entries = compatible.length
      ? compatible
      : list(e.desks.production.entries).map((x) => ({ entry: x.id }))
    e.openForm({
      title: 'Установить физический экземпляр',
      initial: {
        entry: entries.find((x) => x.entry === e.g.selectedEntry)?.entry || entries[0]?.entry || '',
      },
      fields: [
        {
          key: 'entry',
          label: 'Автомобиль',
          type: 'select',
          options: entries.map((x) => ({
            value: x.entry,
            label: e.entryTitle(x.entry),
          })),
        },
      ],
      description:
        'Предыдущий экземпляр этого узла вернётся на склад. Номер и история новой детали сохранятся.',
      summary: (v) => {
        const previous = e.game.components?.[v.entry]?.parts?.[axis]
        return (
          <Facts
            items={[
              ['Новый экземпляр', item.serial],
              ['Предыдущий экземпляр', previous?.serial || previous?.instance || 'Исходная сборка'],
            ]}
          />
        )
      },
      validate: (v) =>
        !v.entry
          ? 'Нет совместимой заявки.'
          : item.year > e.year
            ? 'Редакция следующего сезона ещё не допущена к установке.'
            : null,
      onSubmit: (v) => e.run('component-install', { entry: v.entry, instance: item.id }),
    })
  }
  return (
    <div className="eng-item-dossier">
      <div className="eng-item-passport">
        <div className="eng-item-engraving">
          <Package size={40} />
          <span>{AXES[axis]}</span>
          <strong>{item.serial}</strong>
          <small>
            Редакция {item.version || '—'} · {'Паспорт экземпляра'}
          </small>
        </div>
        <div>
          <Tag status={item.status} />
          <h3>{item.title || item.label || AXES[axis]}</h3>
          <Facts
            items={[
              [
                'Остаточный ресурс',
                item.remaining_m == null
                  ? 'Не раскрыт · после проверки'
                  : number(item.remaining_m / 1000) + ' км',
              ],
              [
                'Подтверждённый пробег',
                item.distance_m == null ? 'Не раскрыт' : number(item.distance_m / 1000) + ' км',
              ],
              ['Изготовлен', item.made ? dateLabel(item.made) : 'Стартовый экземпляр'],
              ['Себестоимость', item.cost_cents == null ? 'Не раскрыта' : money(item.cost_cents)],
              ['Проверок', item.checks ?? 'Не раскрыто'],
              [
                'Размещение',
                item.service_org
                  ? 'Сервис ' + e.org(item.service_org)
                  : item.installed
                    ? e.entryTitle(item.installed)
                    : item.deliveredEntry
                      ? e.entryTitle(item.deliveredEntry)
                      : STATES[item.status],
              ],
            ]}
          />
        </div>
      </div>
      {item.reason && <Note tone="warn">{item.reason}</Note>}
      {project?.stage === 'withdrawn' && (
        <Note tone="warn">Редакция отозвана. Новые установки и передачи по ней недоступны.</Note>
      )}
      {e.manage && (
        <div className="eng-inline-actions">
          {item.status === 'inspection' && (
            <B primary icon={ShieldCheck} onClick={() => itemDisposition(e, item, 'accept')}>
              Принять по протоколу
            </B>
          )}
          {item.status === 'repair' && (
            <B primary onClick={() => itemDisposition(e, item, 'inspect')}>
              Вернуть на контроль
            </B>
          )}
          {installable && !e.maker && (
            <B primary icon={Wrench} onClick={install}>
              Установить на автомобиль
            </B>
          )}
          {installable && e.maker && (
            <B primary icon={Send} onClick={() => delivery(e, item)}>
              Передать клиенту
            </B>
          )}
          {['stock', 'inspection'].includes(item.status) && (
            <>
              <B onClick={() => itemDisposition(e, item, 'inspect')}>Повторная проверка</B>
              {(item.actions || item.decisions || []).includes('repair') && (
                <B onClick={() => itemDisposition(e, item, 'repair')}>Ремонт</B>
              )}
              <B variant="quiet" onClick={() => itemDisposition(e, item, 'scrap')}>
                Списать
              </B>
            </>
          )}
        </div>
      )}
      {item.installed && (
        <B
          icon={ArrowUpRight}
          onClick={() => {
            e.close()
            e.g.setSelectedEntry?.(item.installed)
            e.navigate('garage', 'components', item.installed)
          }}
        >
          Открыть сборку автомобиля
        </B>
      )}
      {item.deliveredEntry && (
        <Note>
          {item.service_org
            ? 'Экземпляр на обслуживании у ' +
              e.org(item.service_org) +
              '. Владелец — ' +
              e.org(item.deliveredOrg) +
              '.'
            : 'Экземпляр находится у клиента. Установку выполняет его команда.'}
          <B
            variant="quiet"
            onClick={() => {
              e.close()
              e.navigate('manufacturer', 'clients', item.deliveredEntry)
            }}
          >
            Открыть клиентскую программу
          </B>
        </Note>
      )}
      {item.status === 'scrapped' && (
        <Note>Списанный экземпляр сохраняется в реестре. Повторная установка недоступна.</Note>
      )}
      <Card title="Совместимость и происхождение">
        <p className="eng-break">{item.specification}</p>
        {(item.targets || []).map((t) => (
          <div className="eng-row" key={t.entry}>
            <span>{e.entryTitle(t.entry)}</span>
            <Tag tone={t.reason ? 'warn' : 'good'}>{t.reason || 'Совместим'}</Tag>
          </div>
        ))}
        {project && <B onClick={() => projectOpen(e, project.id)}>Открыть техническое дело</B>}
      </Card>
      <details className="eng-details">
        <summary>История установок и контроля</summary>
        {(item.fits || []).map((f, i) => (
          <div className="eng-row" key={i}>
            <span>
              {dateLabel(f.date)} · {e.entryTitle(f.entry)}
            </span>
            <span>
              {STATES[f.code] || f.code} · {e.name(f.person)}
            </span>
          </div>
        ))}
        {list(e.desks.production.history)
          .filter((h) => h.instance === item.id)
          .map((h) => (
            <p key={h.id}>
              {dateLabel(h.date)} · {h.title} · {h.reason}
            </p>
          ))}
        {!(item.fits || []).length &&
          !list(e.desks.production.history).some((h) => h.instance === item.id) && (
            <p>Операций с экземпляром ещё не было.</p>
          )}
      </details>
    </div>
  )
}
function Manufacturer() {
  const e = useE(),
    d = e.desks.manufacturer
  const [selected, setSelected] = useStored('engineering.manufacturer.product', ''),
    [edition, setEdition] = useStored('engineering.manufacturer.edition', ''),
    [season, setSeason] = useStored('engineering.manufacturer.season', String(e.year))
  const catalog = list(d.catalog)
  useEffect(() => {
    const work = e.projects.find((p) => p.id === e.g.entity),
      target = catalog.find(
        (p) =>
          (p.editions || []).some((v) => v.id === e.g.entity) ||
          (p.entry === (work?.entry || e.g.entity) && (!work || p.axis === work.axis)),
      )
    if (target) {
      setSelected(target.entry + '|' + target.axis)
      setEdition(
        work?.specification || (target.editions || []).find((v) => v.id === e.g.entity)?.id || '',
      )
      if (work?.year) setSeason(String(work.year))
    }
  }, [e.g.entity])
  const product =
    catalog.find((p) => p.entry + '|' + p.axis === selected) ||
    catalog.find((p) => p.series === e.career.series) ||
    catalog[0]
  const versions = product?.editions || []
  const version = versions.find((v) => v.id === edition) || versions[0]
  if (['clients', 'cases', 'diagnosis', 'warranty', 'advisors', 'history'].includes(e.tab)) {
    if (e.tab === 'clients') return <Clients />
    if (e.tab === 'advisors') return <Advisors />
    if (e.tab === 'history')
      return (
        <History
          rows={[
            ...list(e.desks.production.history).filter(
              (h) =>
                h.command?.startsWith('maker') ||
                h.command?.includes('client') ||
                h.command === 'advisor-assign',
            ),
            ...(d.history || []),
          ]}
        />
      )
    return <Cases />
  }
  if (!product)
    return (
      <Empty title="Собственные продукты отсутствуют">
        Эта карьера работает с продукцией поставщиков в разделе партнёров.
      </Empty>
    )
  const local = e.projects.filter(
    (p) => p.entry === product.entry && p.axis === product.axis && Number(p.year) === Number(season),
  )
  return (
    <>
      <div className="eng-maker-toolbar">
        <label>
          <span>Продукт и интерфейс</span>
          <select
            value={product.entry + '|' + product.axis}
            onChange={(ev) => {
              setSelected(ev.target.value)
              setEdition('')
            }}
          >
            {catalog.map((p) => (
              <option key={p.entry + p.axis} value={p.entry + '|' + p.axis}>
                {p.series.toUpperCase()} · {p.title} · {AXES[p.axis]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Сезон программы</span>
          <select value={season} onChange={(ev) => setSeason(ev.target.value)}>
            {Object.keys(product.years).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        {e.tab === 'catalog' && (
          <label>
            <span>Редакция</span>
            <select value={version?.id || ''} onChange={(ev) => setEdition(ev.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Ред. {v.version} · {v.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {e.tab === 'catalog' ? (
        <>
          <div className="eng-product-hero">
            <div className="eng-product-left">
              <small>
                {e.org(e.career.org).toUpperCase()} / {product.series.toUpperCase()}
              </small>
              <h2>{AXES[product.axis]}</h2>
              <p className="eng-product-name">{product.title}</p>
              <div className="eng-hero-badges">
                <Tag status={version.status}>
                  {version.status === 'opening' ? 'Стартовая спецификация' : STATES[version.status]}
                </Tag>
                <Tag>Редакция {version.version}</Tag>
              </div>
              <div className="eng-product-graphic" aria-label="Автомобиль клиентской программы">
                <RaceCar entryId={product.entry} />
                <small>Продуктовый интерфейс · автомобиль клиентской программы</small>
              </div>
              <B
                primary
                icon={DraftingCompass}
                onClick={() =>
                  openWork(e, 'design', null, {
                    entry: product.entry,
                    axis: product.axis,
                    year: Number(season),
                    specification: version.id,
                  })
                }
              >
                Развивать продукт
              </B>
            </div>
            <div className="eng-product-right">
              <div className="eng-product-parameters">
                <h3>Паспорт редакции</h3>
                {Object.keys(version.values || {}).length ? (
                  <Facts
                    items={Object.entries(version.values).map(([k, v]) => [METRICS[k] || k, number(v)])}
                  />
                ) : (
                  <Note>Характеристики этой редакции пока не раскрыты.</Note>
                )}
              </div>
            </div>
          </div>
          <div className="eng-main-grid">
            <Card title="Расчётные режимы" kicker="КАК УЗЕЛ ВЕДЁТ СЕБЯ ПОД НАГРУЗКОЙ">
              {version.calculations?.length ? (
                <Chart calculations={version.calculations} />
              ) : (
                <Empty icon={Gauge} title="Новых измерений пока нет">
                  Выберите исходную редакцию для просмотра реальных расчётных режимов.
                </Empty>
              )}
            </Card>
            <Card title="Продукт в игровом мире">
              <div className="eng-client-car">
                <RaceCar entryId={product.entry} />
              </div>
              <Facts
                items={[
                  ['Применение', product.title],
                  [
                    'Клиентских заявок',
                    d.clients.filter((c) => c.car === product.title && c.axis === product.axis).length,
                  ],
                  ['Правило сезона', product.years[season] || 'Развитие в рамках сезонного бюллетеня'],
                ]}
              />
              <B
                icon={ArrowUpRight}
                onClick={() => e.navigate('manufacturer', 'clients', product.entry)}
              >
                Открыть клиентов
              </B>
            </Card>
          </div>
        </>
      ) : e.tab === 'program' ? (
        <>
          <div className="eng-stats">
            <Stat label="Продуктовых интерфейсов" value={catalog.length} />
            <Stat label="Клиентских заявок" value={d.clients.length} />
            <Stat
              label="Работ в программе"
              value={local.filter((p) => !['cancelled', 'withdrawn'].includes(p.stage)).length}
            />
            <Stat label="Приоритет ресурсов" value={ALLOCATION[d.allocation]} />
          </div>
          <Card title={product.title + ' · ' + season} kicker="ПРОГРАММА ПОКОЛЕНИЯ">
            <Pipeline
              stage={local.at(-1)?.stage || 'research'}
              onSelect={(s) =>
                e.navigate(
                  'manufacturer',
                  ['production', 'quality', 'stock', 'test'].includes(s) ? 'factory' : 'research',
                )
              }
            />
            <Note tone={product.years[season] ? 'warn' : 'info'}>
              {product.years[season] ||
                'Исследуйте компромисс продукта, проверьте редакцию и обеспечьте клиентов физическими экземплярами.'}
            </Note>
            <ProjectRows projects={local} />
          </Card>
          <WorkCalendar />
        </>
      ) : (
        <>
          <div className="eng-section-lead">
            <div>
              <h2>
                {e.tab === 'research'
                  ? 'От вопроса к новой редакции'
                  : 'Проверка, производство, приёмка'}
              </h2>
              <p>
                {product.title} · {AXES[product.axis]} · {season}
              </p>
            </div>
            <div className="eng-inline-actions">
              {e.tab === 'research' ? (
                <>
                  <B
                    icon={FlaskConical}
                    onClick={() =>
                      openWork(e, 'research', null, {
                        entry: product.entry,
                        axis: product.axis,
                        year: Number(season),
                      })
                    }
                  >
                    Исследование
                  </B>
                  <B
                    primary
                    icon={Plus}
                    onClick={() =>
                      openWork(e, 'design', null, {
                        entry: product.entry,
                        axis: product.axis,
                        year: Number(season),
                      })
                    }
                  >
                    Разработка
                  </B>
                </>
              ) : (
                <>
                  <B
                    icon={Gauge}
                    onClick={() =>
                      openWork(e, 'test', null, {
                        entry: product.entry,
                        axis: product.axis,
                        year: Number(season),
                        baseline: version.id,
                      })
                    }
                  >
                    Испытание
                  </B>
                  <B
                    primary
                    icon={Factory}
                    onClick={() =>
                      openWork(e, 'production', null, {
                        entry: product.entry,
                        axis: product.axis,
                        year: Number(season),
                        specification: version.id,
                      })
                    }
                  >
                    Заказать партию
                  </B>
                </>
              )}
            </div>
          </div>
          {product.years[season] && <Note tone="warn">{product.years[season]}</Note>}
          <Card title="Утверждённые поручения">
            <ProjectRows
              projects={local.filter((p) =>
                e.tab === 'research'
                  ? ['research', 'research-ready', 'design', 'design-ready', 'withdrawn'].includes(
                      p.stage,
                    )
                  : !['research', 'research-ready', 'design', 'design-ready'].includes(p.stage),
              )}
            />
          </Card>
          {e.tab === 'factory' && (
            <>
              <div className="eng-section-lead">
                <div>
                  <h2>Физические экземпляры</h2>
                  <p>
                    Готовый узел передаётся клиенту. Производитель не устанавливает его на чужой
                    автомобиль.
                  </p>
                </div>
                <B onClick={() => rollout(e, product, Number(season))}>Единый выпуск для клиентов</B>
              </div>
              <Inventory />
            </>
          )}
        </>
      )}
    </>
  )
}
function deliverable(e, item, client) {
  if (item.status !== 'stock' || item.rejected || item.damaged) return 'Экземпляр не готов к передаче.'
  const p = e.projects.find((p) => p.id === item.project)
  if (p?.stage === 'withdrawn') return 'Редакция отозвана.'
  if (item.year > e.year) return 'Поколение следующего сезона ещё не действует.'
  return (client.stock || []).includes(item.id)
    ? null
    : 'Этот экземпляр недоступен для поставки данному клиенту.'
  return null
}
function delivery(e, item, initialClient) {
  const clients = list(e.desks.manufacturer.clients).filter(
    (c) => (item.slot || item.axis) === c.axis && !deliverable(e, item, c),
  )
  e.openForm({
    title: 'Передать экземпляр клиенту',
    initial: {
      client:
        initialClient?.entry ||
        clients.find((c) => !deliverable(e, item, c))?.entry ||
        clients[0]?.entry ||
        '',
    },
    fields: [
      {
        key: 'client',
        label: 'Клиентская заявка',
        type: 'select',
        options: clients.map((c) => ({
          value: c.entry,
          label: c.series.toUpperCase() + ' · ' + c.name + ' · ' + c.entry,
        })),
      },
    ],
    summary: (v) => {
      const c = clients.find((x) => x.entry === v.client)
      return (
        <>
          <Facts
            items={[
              ['Экземпляр', item.serial],
              ['Получатель', c?.name],
              [
                'Договор',
                c ? e.org(c.terms.maker) + ' → ' + c.name + ' · ' + c.series.toUpperCase() : 'Не выбран',
              ],
            ]}
          />
          {c && deliverable(e, item, c) && <Note tone="warn">{deliverable(e, item, c)}</Note>}
        </>
      )
    },
    description:
      'Меняется владение экземпляром. Установка, коммерческий платёж и выручка не возникают автоматически.',
    validate: (v) => {
      const c = clients.find((x) => x.entry === v.client)
      return !c ? 'Выберите клиента.' : deliverable(e, item, c)
    },
    onSubmit: (v) => e.run('maker-deliver', { entry: v.client, instance: item.id }),
  })
}
function rollout(e, product, year) {
  const candidates = e.projects.filter(
    (p) =>
      p.entry === product.entry &&
      p.axis === product.axis &&
      p.year === year &&
      ['released', 'production', 'quality', 'stock', 'delivered'].includes(p.stage),
  )
  const cohort = list(e.desks.manufacturer.clients).filter(
    (c) => c.car === product.title && c.axis === product.axis && c.equal,
  )
  e.openForm({
    title: 'Единая спецификация клиентской программы',
    initial: { specification: candidates.at(-1)?.specification || '' },
    fields: [
      {
        key: 'specification',
        label: 'Выпущенная редакция',
        type: 'select',
        options: candidates.map((p) => ({
          value: p.specification,
          label: 'Ред. ' + p.version + ' · ' + GOALS[p.objective],
        })),
      },
    ],
    description:
      'Для смены стандарта необходим запас для каждой действующей заявки. Отдельный клиент не получает преимущество раньше остальных.',
    summary: (v) => (
      <Facts
        items={[
          ['Клиентских заявок', cohort.length],
          [
            'Готовых экземпляров',
            e.items.filter((i) => i.specification === v.specification && i.status === 'stock').length,
          ],
          ['Целевой сезон', year],
        ]}
      />
    ),
    validate: (v) =>
      !cohort.length
        ? 'Для этого продукта не требуется единая клиентская спецификация.'
        : year <= 2025
          ? 'Стандартная спецификация сезона 2025 заморожена. Разработка следующего поколения не разрешает её досрочное внедрение.'
          : year > e.year
            ? 'Сезон нового поколения ещё не наступил.'
            : !v.specification
              ? 'Нет выпущенной редакции.'
              : e.items.filter((i) => i.specification === v.specification && i.status === 'stock')
                    .length < cohort.length
                ? 'Недостаточно готовых экземпляров для всех действующих клиентов.'
                : null,
    onSubmit: (v) => e.run('maker-rollout', { entry: product.entry, specification: v.specification }),
  })
}
function Clients() {
  const e = useE(),
    d = e.desks.manufacturer
  const [picked, setPicked] = useStored('engineering.clients.selected', ''),
    [series, setSeries] = useStored('engineering.clients.series', 'all')
  const all = list(d.clients)
  useEffect(() => {
    if (e.g.entity) {
      const c = all.find(
        (c) => c.entry === e.g.entity || c.org === e.g.entity || c.terms.maker === e.g.entity,
      )
      if (c) {
        setPicked(c.entry + '|' + c.axis)
        setSeries('all')
      }
    }
  }, [e.g.entity])
  const rows = all.filter(
    (c) =>
      (series === 'all' || c.series === series) &&
      [c.name, c.car, c.entry, e.org(c.terms.maker), AXES[c.axis]]
        .join(' ')
        .toLowerCase()
        .includes(e.query.toLowerCase()),
  )
  const selected = rows.find((c) => c.entry + '|' + c.axis === picked) || rows[0]
  if (!all.length)
    return (
      <Empty title="Договорные программы отсутствуют">
        Продукция и действующие клиенты определяются договорами текущей организации.
      </Empty>
    )
  const c = selected
  const future = c
    ? (e.commercial.supplies || []).filter(
        (s) =>
          s.status === 'signed' &&
          s.start > e.date &&
          s.end > e.date &&
          s.org === c.org &&
          s.sponsor === c.terms.maker &&
          s.product === c.axis &&
          s.series === c.series,
      )
    : []
  const ready = c ? e.items.filter((i) => !deliverable(e, i, c)) : []
  return (
    <>
      <div className="eng-toolbar">
        <SearchBox
          value={e.query}
          onChange={e.setQuery}
          placeholder={e.maker ? 'Найти клиента, машину или заявку' : 'Найти производителя или продукт'}
        />
        <select
          aria-label="Чемпионат клиента"
          value={series}
          onChange={(ev) => setSeries(ev.target.value)}
        >
          <option value="all">Все чемпионаты</option>
          {[...new Set(all.map((c) => c.series))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Tag>{rows.length} заявок</Tag>
      </div>
      <div className="eng-clients-layout">
        <aside className="eng-client-list">
          {rows.map((c) => (
            <button
              type="button"
              key={c.entry + c.axis}
              className={c.entry + c.axis === selected?.entry + selected?.axis ? 'selected' : ''}
              onClick={() => setPicked(c.entry + '|' + c.axis)}
            >
              <small>
                {c.series.toUpperCase()} · {c.entry}
              </small>
              <strong>{e.maker ? c.name : e.org(c.terms.maker)}</strong>
              <span>
                {c.car} · {AXES[c.axis]}
              </span>
              <div>
                <Tag tone={c.terms.support ? 'good' : 'muted'}>
                  {c.terms.support ? 'Техподдержка' : 'Без поддержки'}
                </Tag>
                <ChevronRight size={15} />
              </div>
            </button>
          ))}
        </aside>
        {c ? (
          <div className="eng-client-detail">
            <div className="eng-client-header">
              <div>
                <small>{c.series.toUpperCase()} · КЛИЕНТСКАЯ ПРОГРАММА</small>
                <h2>{e.maker ? c.name : e.org(c.terms.maker)}</h2>
                <p>
                  {c.car} · {AXES[c.axis]} · {c.entry}
                </p>
              </div>
              <B
                variant="quiet"
                icon={ArrowUpRight}
                onClick={() => e.g.openOrganization(e.maker ? c.org : c.terms.maker)}
              >
                Организация
              </B>
            </div>
            <div className="eng-client-car">
              <RaceCar entryId={c.entry} />
            </div>
            <div className="eng-client-rights">
              <div>
                <ShieldCheck size={22} />
                <strong>{c.terms.support ? 'Поддержка включена' : 'Поддержка не включена'}</strong>
                <span>По действующему договору</span>
              </div>
              <div>
                <Layers size={22} />
                <strong>{c.equal ? 'Единая спецификация' : 'Совместимые поколения'}</strong>
                <span>{c.equal ? 'Общие правила для клиентов' : 'Допуск конкретного интерфейса'}</span>
              </div>
              <div>
                <FileText size={22} />
                <strong>{c.shareable?.length || 0} протоколов</strong>
                <span>Разрешено передать</span>
              </div>
            </div>
            <Card
              title="Действующий договор"
              action={
                <B
                  variant="quiet"
                  icon={ArrowUpRight}
                  onClick={() => e.navigate('commercial', 'supplies', c.terms.id)}
                >
                  Условия поставки
                </B>
              }
            >
              <Facts
                items={[
                  ['Изготовитель', e.org(c.terms.maker)],
                  [
                    'Партнёрство',
                    {
                      works: 'Заводская программа',
                      priority: 'Приоритетный клиент',
                      technical: 'Технический партнёр',
                      client: 'Клиент',
                      commercial: 'Коммерческий партнёр',
                    }[c.terms.partnership] || c.terms.partnership,
                  ],
                  ['Договор', c.terms.id],
                  ['Период', dateLabel(c.terms.start) + ' — ' + dateLabel(c.terms.end)],
                  ['Испытания', c.terms.testing ? 'Предусмотрены договором' : 'Не включены'],
                  [
                    'Совместная разработка',
                    c.terms.development ? 'Предусмотрена договором' : 'Не включена',
                  ],
                ]}
              />
              {future.map((s) => (
                <div className="eng-future-contract" key={s.id}>
                  <Tag tone={s.start > e.date ? 'warn' : 'good'}>
                    {s.start > e.date ? 'Будущий договор' : 'Подписанный пакет'}
                  </Tag>
                  <h4>
                    {dateLabel(s.start)} — {dateLabel(s.end)}
                  </h4>
                  <p>
                    {money(s.sale_cents)} · скидка {money(s.discount_cents || 0)}
                  </p>
                  <p>
                    Поддержка {s.support ? 'включена' : 'не включена'} · испытания{' '}
                    {s.testing ? 'разрешены' : 'не включены'}
                  </p>
                  {s.start > e.date && (
                    <small>Будущие права не изменяют текущий договор до даты начала.</small>
                  )}
                  <B onClick={() => e.navigate('commercial', 'supplies', s.id)}>
                    Открыть коммерческий пакет
                  </B>
                </div>
              ))}
            </Card>
            <Card title={e.maker ? 'Готовые экземпляры для передачи' : 'Техническое сотрудничество'}>
              {e.maker ? (
                <>
                  {ready.length ? (
                    <div className="eng-serial-list">
                      {ready.map((i) => (
                        <div key={i.id}>
                          <B variant="quiet" onClick={() => itemOpen(e, i.id)}>
                            {i.serial}
                          </B>
                          <span>Ред. {i.version}</span>
                          <B primary icon={Send} onClick={() => delivery(e, i, c)}>
                            Передать
                          </B>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Note>
                      Нет готовых совместимых экземпляров для этой заявки. Выпустите редакцию, изготовьте
                      партию и завершите контроль.
                    </Note>
                  )}
                  <B
                    onClick={() =>
                      openWork(e, 'production', null, {
                        entry: d.catalog.find((p) => p.title === c.car && p.axis === c.axis)?.entry,
                        axis: c.axis,
                      })
                    }
                  >
                    Заказать для клиента
                  </B>
                </>
              ) : (
                <div className="eng-inline-actions">
                  {e.manage && (
                    <B primary disabled={e.maker || !e.manage} onClick={() => newCase(e, c)}>
                      Направить запрос
                    </B>
                  )}
                  <B onClick={() => e.navigate('manufacturer', 'advisors', c.entry)}>Консультанты</B>
                  <B onClick={() => e.navigate('manufacturer', 'warranty', c.entry)}>Гарантия</B>
                </div>
              )}
            </Card>
            {e.items.some((i) => i.deliveredEntry === c.entry) && (
              <Card title="Переданные экземпляры">
                <div className="eng-serial-list">
                  {e.items
                    .filter((i) => i.deliveredEntry === c.entry)
                    .map((i) => (
                      <button type="button" key={i.id} onClick={() => itemOpen(e, i.id)}>
                        <Package size={16} />
                        <strong>{i.serial}</strong>
                        <Tag status="delivered" />
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Card title="Клиенты">
            <Empty title="Ничего не найдено">Измените поисковый запрос или чемпионат.</Empty>
          </Card>
        )}
      </div>
    </>
  )
}
function newCase(e, initial) {
  const clients = list(e.desks.manufacturer.clients)
  if (!clients.length) {
    e.g.notify?.('Нет действующего договора для обращения.')
    return
  }
  const seed = initial || clients.find((c) => c.entry === e.g.entity) || clients[0]
  const getClient = (v) => clients.find((c) => c.entry + '|' + c.axis === v.client) || seed
  const instances = (v) => {
    const c = getClient(v)
    return e.items.filter(
      (i) => (i.slot || i.axis) === c?.axis && (i.installed === c.entry || i.deliveredEntry === c.entry),
    )
  }
  e.openForm({
    title: e.maker ? 'Смоделировать входящее обращение' : 'Обращение к производителю',
    wide: true,
    initial: {
      client: seed.entry + '|' + seed.axis,
      kind: e.tab === 'warranty' ? 'warranty' : 'consult',
      objective: 'durability',
      instance: '',
      reference: '',
      message: '',
    },
    fields: [
      {
        key: 'client',
        label: 'Клиентская заявка',
        type: 'select',
        wide: true,
        options: clients.map((c) => ({
          value: c.entry + '|' + c.axis,
          label: c.series.toUpperCase() + ' · ' + c.name + ' · ' + c.entry + ' · ' + AXES[c.axis],
        })),
      },
      {
        key: 'kind',
        label: 'Вид обращения',
        type: 'select',
        options: opts({
          consult: 'Консультация',
          problem: 'Техническая проблема',
          change: 'Изменение продукции',
          next: 'Следующее поколение',
          warranty: 'Гарантия',
          data: 'Передача технических данных',
        }),
      },
      {
        key: 'objective',
        label: 'Технический приоритет',
        type: 'select',
        options: (v) =>
          (e.desks.manufacturer.targets?.[getClient(v).axis] || ['durability']).map((k) => ({
            value: k,
            label: GOALS[k],
          })),
      },
      {
        key: 'instance',
        label: 'Конкретный экземпляр',
        type: 'select',
        required: false,
        options: (v) => [
          { value: '', label: 'Общее обращение по программе' },
          ...instances(v).map((i) => ({
            value: i.id,
            label: i.serial + ' · ' + STATES[i.status],
          })),
        ],
      },
      {
        key: 'reference',
        label: 'Разрешённый протокол',
        type: 'select',
        hidden: (v) => v.kind !== 'data',
        options: (v) => [
          { value: '', label: 'Выберите разрешённый источник' },
          ...(getClient(v)?.shareable || []).map((f) => ({
            value: f.reference,
            label: f.day + ' · ' + f.label,
          })),
        ],
      },
      {
        key: 'message',
        label: 'Что требуется от инженеров',
        type: 'textarea',
        maxLength: 220,
      },
    ],
    description: e.maker
      ? 'Запрос формирует клиентская команда.'
      : 'Запрос сохраняет заявку, компонент, конкретный экземпляр и разрешённый источник данных.',
    validate: (v) =>
      v.instance && !instances(v).some((i) => i.id === v.instance)
        ? 'Экземпляр не находится у выбранного клиента.'
        : v.kind === 'data' && !getClient(v).shareable.some((x) => x.reference === v.reference)
          ? 'По договору нет выбранного разрешённого протокола.'
          : null,
    onSubmit: (v) =>
      e.run('maker-request', {
        entry: getClient(v).entry,
        axis: getClient(v).axis,
        kind: v.kind,
        objective: v.objective,
        message: v.message,
        instance: v.instance || null,
        reference: v.reference || null,
      }),
  })
}
function Cases() {
  const e = useE(),
    [status, setStatus] = useState('open')
  const all = list(e.desks.manufacturer.cases).map((c) => ({
    ...c,
  }))
  const rows = all.filter(
    (c) =>
      (e.tab !== 'warranty' || c.kind === 'warranty') &&
      (status === 'all' || (status === 'resolved' && c.status !== 'open') || c.status === status) &&
      JSON.stringify(c).toLowerCase().includes(e.query.toLowerCase()),
  )
  const count = all.filter((c) => c.status === 'open').length
  return (
    <>
      <div className="eng-section-lead">
        <div>
          <h2>
            {e.tab === 'diagnosis'
              ? 'Что известно о причине'
              : e.tab === 'warranty'
                ? 'Ответственность по фактам'
                : 'Обращения технической службы'}
          </h2>
          <p>
            {e.tab === 'diagnosis'
              ? 'Наблюдение, гипотеза и доказанная причина представлены отдельно.'
              : count + ' открытых обращений · договорные права определяют доступные решения.'}
          </p>
        </div>
        {e.manage && (
          <B primary icon={Plus} disabled={e.maker || !e.manage} onClick={() => newCase(e)}>
            {e.maker ? 'Входящий сценарий' : 'Новое обращение'}
          </B>
        )}
      </div>
      <div className="eng-toolbar">
        <SearchBox value={e.query} onChange={e.setQuery} placeholder="Поиск обращения или клиента" />
        <select
          aria-label="Состояние обращения"
          value={status}
          onChange={(ev) => setStatus(ev.target.value)}
        >
          <option value="open">Открытые</option>
          <option value="all">Все обращения</option>
          <option value="resolved">Решённые</option>
        </select>
      </div>
      <div className="eng-case-list">
        {rows.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() =>
              e.setDialog({
                type: 'case',
                id: c.id,
                title: 'Дело технической поддержки',
                wide: true,
              })
            }
          >
            <div className="eng-case-marker">
              {c.kind === 'warranty' ? <ShieldCheck size={25} /> : <Microscope size={25} />}
            </div>
            <div>
              <small>
                {dateLabel(c.date)} · {e.org(c.client)} · {c.entry}
              </small>
              <strong>
                {
                  {
                    warranty: 'Гарантийное обращение',
                    problem: 'Техническая проблема',
                    consult: 'Консультация',
                    change: 'Изменение продукта',
                    next: 'Следующее поколение',
                    data: 'Передача протокола',
                  }[c.kind]
                }{' '}
                · {GOALS[c.objective]}
              </strong>
              <p>{c.message}</p>
              <span>
                {c.diagnosis
                  ? 'Диагностика: ' +
                    (c.diagnosis.covered ? 'есть основание гарантии' : 'гарантия не подтверждена')
                  : 'Причина не установлена'}
              </span>
            </div>
            <Tag status={c.status} />
            <ChevronRight size={20} />
          </button>
        ))}
      </div>
      {!rows.length && (
        <div className="eng-main-grid">
          <Card title="Техническая служба">
            <Empty icon={ShieldCheck} title="Открытых обращений нет">
              Первое обращение будет связано с клиентской программой, правами договора и конкретными
              данными. Причина отказа не назначается автоматически.
            </Empty>
          </Card>
          <Card title="Как принимается решение">
            <ol className="eng-process-list">
              <li>
                <span>01</span>
                <div>
                  <strong>Зафиксировать наблюдение</strong>
                  <p>Что произошло, с каким экземпляром и при каких условиях.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Проверить доступные данные</strong>
                  <p>Контроль партии, разрешённые протоколы, сведения консультанта.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Обосновать решение</strong>
                  <p>Исследование, рекомендация, ремонт или гарантийная компенсация.</p>
                </div>
              </li>
            </ol>
          </Card>
        </div>
      )}
    </>
  )
}
function caseResolutionContext(e, c) {
  const client = list(e.desks.manufacturer.clients).find((x) => x.entry === c.entry && x.axis === c.axis)
  const item = e.items.find((x) => x.id === c.instance)
  const quote = e.desks.research.methods?.[c.axis]?.cost_cents
  const replacement = client
    ? e.items.find((x) => x.id !== c.instance && !deliverable(e, x, client))
    : null
  const chief = e.career.assignments?.find((a) => a.position === 'chief-engineer' && a.person)
  const lead = e.career.assignments?.find(
    (a) =>
      a.position ===
        (c.axis === 'transmission' ? 'transmissions' : c.axis === 'engine' ? 'engines' : 'tyres') &&
      a.person,
  )
  return { client, item, quote, replacement, chief, lead }
}
function caseResolutionError(e, c, choice) {
  const { client, item, quote, replacement, chief, lead } = caseResolutionContext(e, c)
  if (!e.maker || c.supplier !== e.career.org || c.status !== 'open')
    return 'Обращение недоступно для решения.'
  if (!chief) return 'Не назначен руководитель инженерного штаба.'
  if (!lead) return 'Не назначен профильный руководитель.'
  if (
    choice !== 'decline' &&
    (!client || client.terms.id !== (c.contract || (c.local ? client.terms.id : null)))
  )
    return 'Договор обслуживания больше не действует.'
  if (
    ['repair', 'replace', 'compensate'].includes(choice) &&
    !(c.kind === 'warranty' && c.diagnosis?.covered)
  )
    return 'Гарантийное основание ещё не подтверждено.'
  if (choice === 'repair' && (!item || item.installed || item.status === 'installed'))
    return 'Клиент должен снять экземпляр для ремонта. Доступного снятого экземпляра нет.'
  if (choice === 'repair' && ['repair', 'scrapped'].includes(item.status))
    return 'Экземпляр уже в ремонте или списан.'
  if (choice === 'replace' && !replacement) return 'Нет допущенной совместимой замены на складе.'
  if (['repair', 'compensate'].includes(choice) && quote == null)
    return 'Нет подтверждённой сметы для этого узла.'
  const cost = choice === 'repair' ? Math.floor(quote / 3) : choice === 'compensate' ? quote : 0
  if (e.available != null && cost > e.available) return 'Недостаточно доступных средств организации.'
  return null
}
function CaseResolutionSummary({ c, decision }) {
  const e = useE(),
    x = caseResolutionContext(e, c)
  return (
    <>
      <Facts
        items={[
          ['Клиент', e.org(c.client)],
          [
            'Результат',
            decision === 'study'
              ? 'Отдельное поручение исследователю'
              : decision === 'repair'
                ? 'Очередь гарантийного ремонта'
                : decision === 'replace'
                  ? 'Передача совместимой запасной детали'
                  : decision === 'compensate'
                    ? 'Компенсация клиенту'
                    : 'Запись обоснования',
          ],
          decision === 'replace'
            ? ['Замена', x.replacement?.serial || 'Нет допущенного экземпляра']
            : null,
          [
            'Расход',
            decision === 'repair'
              ? money(Math.floor((x.quote || 0) / 3))
              : decision === 'compensate'
                ? money(x.quote)
                : 'Без нового расхода на этом шаге',
          ],
        ]}
      />
      {caseResolutionError(e, c, decision) && (
        <Note tone="warn">{caseResolutionError(e, c, decision)}</Note>
      )}
    </>
  )
}
function resolveCaseAction(e, c, v) {
  return e.run('maker-resolve', { case: c.id, decision: v.decision, reason: v.reason })
}
function CaseDossier({ id }) {
  const e = useE(),
    base = list(e.desks.manufacturer.cases).find((c) => c.id === id),
    c = base
  if (!c) return <Empty title="Обращение не найдено">Дело отсутствует в доступной проекции.</Empty>
  const diag = c.diagnosis
  function resolve() {
    e.openForm({
      title: 'Решение по обращению',
      initial: { decision: 'advise', reason: '' },
      fields: [
        {
          key: 'decision',
          label: 'Решение технической службы',
          type: 'select',
          options: opts({
            study: 'Назначить исследование',
            advise: 'Дать рекомендацию',
            decline: 'Отклонить',
            ...(c.kind === 'warranty' && diag?.covered
              ? {
                  repair: 'Гарантийный ремонт',
                  replace: 'Замена',
                  compensate: 'Компенсация',
                }
              : {}),
          }),
        },
        {
          key: 'reason',
          label: 'Обоснование клиенту',
          type: 'textarea',
          maxLength: 220,
        },
      ],
      description:
        'Решение связывается с исследованием, физическим экземпляром или компенсацией. Завершение ремонта и расчёт диагноза здесь не симулируются.',
      summary: (v) => <CaseResolutionSummary c={c} decision={v.decision} />,
      validate: (v) => caseResolutionError(e, c, v.decision),
      onSubmit: (v) => resolveCaseAction(e, c, v),
    })
  }
  return (
    <div className="eng-stack">
      <div className="eng-project-head">
        <div>
          <small>
            {e.org(c.client)} · {c.entry} · {dateLabel(c.date)}
          </small>
          <h3>
            {AXES[c.axis]} · {GOALS[c.objective]}
          </h3>
        </div>
        <Tag status={c.status} />
      </div>
      <p className="eng-case-message">{c.message}</p>
      <Facts
        items={[
          ['Производитель', e.org(c.supplier)],
          [
            'Экземпляр',
            c.instance ? e.items.find((i) => i.id === c.instance)?.serial || c.instance : 'Не указан',
          ],
          ['Разрешённый протокол', c.reference || 'Не передан'],
        ]}
      />
      {c.instance && <B onClick={() => itemOpen(e, c.instance)}>Открыть паспорт экземпляра</B>}
      {diag ? (
        <Card
          title="Диагностика"
          action={
            <Tag tone={diag.covered ? 'good' : 'warn'}>
              {diag.covered ? 'Основание гарантии есть' : 'Гарантия не подтверждена'}
            </Tag>
          }
        >
          {diag.manual && <Note>Выбранное вручную состояние для проверки интерфейса.</Note>}
          <Facts
            items={Object.entries(diag.causes || {}).map(([k, v]) => [
              {
                design: 'Конструктивный дефект',
                manufacturing: 'Брак',
                integration: 'Интеграция',
                cooling: 'Охлаждение',
                operation: 'Эксплуатация',
                wear: 'Износ',
              }[k] || k,
              list(v).join(', ') || 'Не подтверждено',
            ])}
          />
          <p>
            Уверенность:{' '}
            {diag.confidence == null ? 'не рассчитывается в карьере' : diag.confidence + '%'}
          </p>
          {diag.observations?.map((o) => (
            <p key={o.reference}>
              {o.observation}
              {o.value != null
                ? ' · ' + number(o.value) + ' ± ' + number(o.uncertainty) + ' ' + o.unit
                : ''}
            </p>
          ))}
        </Card>
      ) : (
        <Note>
          Причина не установлена. Жалоба клиента сама по себе не подтверждает дефект конструкции или
          гарантию.
        </Note>
      )}
      {c.reason && (
        <Card title="Решение технической службы">
          <p>{c.reason}</p>
          <Tag>
            {{
              study: 'Исследование назначено',
              advise: 'Рекомендация передана',
              decline: 'Обоснованный отказ',
              repair: 'Гарантийный ремонт',
              replace: 'Замена',
              compensate: 'Компенсация',
            }[c.decision] || c.decision}
          </Tag>
          {c.project && <B onClick={() => projectOpen(e, c.project)}>Поручение по обращению</B>}
          {c.compensation_cents != null && <p>{money(c.compensation_cents)}</p>}
        </Card>
      )}
      {e.maker && c.status === 'open' && (
        <div className="eng-inline-actions">
          <B disabled title="Диагноз формируется по доступным техническим наблюдениям">
            Диагностика по наблюдениям
          </B>
          <B primary onClick={resolve}>
            Принять решение
          </B>
        </div>
      )}
      <B
        icon={ArrowUpRight}
        onClick={() => {
          e.close()
          e.navigate('manufacturer', 'clients', c.entry)
        }}
      >
        Клиентская программа
      </B>
    </div>
  )
}
function Advisors() {
  const e = useE(),
    d = e.desks.manufacturer
  const own = e.career.assignments?.find((a) => a.occupant && a.position === 'technical-advisor')

  const rows = list(d.assignments)
    .filter((a) => a.status !== 'cancelled')
    .map((a) => ({
      ...a,
      name: a.name || e.name(a.person),
      client: a.client || a.org,
      channels: a.channels || [],
    }))
    .filter(
      (a, i, all) =>
        all.findIndex((x) =>
          x.id && a.id
            ? x.id === a.id
            : x.person === a.person &&
              x.entry === a.entry &&
              x.product === a.product &&
              x.start === a.start &&
              x.end === a.end,
        ) === i,
    )
  return (
    <div className="eng-main-grid">
      <Card title="Технические консультанты" kicker="ЛЮДИ МЕЖДУ ПРОИЗВОДИТЕЛЕМ И КЛИЕНТОМ">
        {own ? (
          <>
            <Person id={own.occupant?.id} name={own.occupant?.name} role="Технический консультант" />
            <p>
              Назначение связано с договором, заявкой, продуктом и периодом. Пересекающиеся работы и
              право поддержки проверяются до подтверждения.
            </p>
            {e.maker && (
              <B
                primary
                icon={CalendarDays}
                onClick={() => e.g.openPerson(own.occupant?.id, 'contract')}
              >
                Назначения специалиста
              </B>
            )}
          </>
        ) : (
          <Note>
            Назначениями сотрудников производителя управляет их организация. Команда видит согласованные
            периоды поддержки.
          </Note>
        )}
        <div className="eng-advisor-visual">
          <Users size={35} />
          <span>Знания специалиста</span>
          <ArrowRight size={19} />
          <span>Контекст автомобиля</span>
        </div>
        <B onClick={() => e.navigate('manufacturer', 'clients')}>Права клиентских программ</B>
      </Card>
      <Card title="Периоды поддержки">
        {rows.length ? (
          rows.map((a, i) => (
            <article className="eng-assignment" key={a.id || a.name + a.start + i}>
              <small>
                {dateLabel(a.start)} — {dateLabel(a.end)}
              </small>
              <h3>{a.name}</h3>
              <p>
                {e.org(a.client)} · {AXES[a.product] || a.product}
              </p>
              {a.entry && (
                <B onClick={() => e.navigate('manufacturer', 'clients', a.entry)}>
                  {e.entryTitle(a.entry)}
                </B>
              )}
              <Tag>
                {a.start > e.date ? 'Будущее назначение' : a.end <= e.date ? 'Завершено' : 'Действует'}
              </Tag>
              <p>
                {a.channels
                  .map(
                    (x) =>
                      ({
                        distance: 'Дистанция',
                        temperature: 'Температура',
                        feedback: 'Обратная связь',
                        inspection: 'Контроль качества',
                        wear: 'Износ',
                      })[x] || x,
                  )
                  .join(' · ')}
              </p>
              {a.load != null && <Progress value={a.load} label="Загрузка на поддержке" />}
            </article>
          ))
        ) : (
          <Empty icon={CalendarDays} title="Назначений пока нет">
            Согласованные периоды поддержки появятся после назначения консультанта через его контракт.
          </Empty>
        )}
      </Card>
    </div>
  )
}
export default function Engineering() {
  const g = useGame()
  const order = useOrder(g.game.career, g.updateCareer, 'engineering')
  const [dialog, setDialog] = useState(null),
    [selection, setSelection] = useStored('engineering.navigation.selection', ''),
    [query, setQuery] = useStored('engineering.navigation.' + g.route + '.query', '')
  const game = g.game || {},
    world = g.world || g.data?.world || {},
    role = g.role || game.career?.role || 'manager',
    maker = role === 'manufacturer',
    manage = role !== 'owner',
    career = game.career || {},
    date = career.date || '2025-02-01',
    year = Number(date.slice(0, 4))
  const p = game.projections || {}
  const desks = {
    programme: p.programme || {},
    council: p.council || {},
    research: p.research || {},
    development: p.development || {},
    production: p.production || {},
    manufacturer: p.manufacturer || {},
  }
  for (const k in desks) if (desks[k]?.data) desks[k] = desks[k].data
  const person = (id) =>
    game.dossiers?.[id]?.person ||
    list(
      game.personnel?.people || game.personnel?.directory || game.personnel?.roster || game.personnel,
    ).find((x) => x?.id === id) ||
    world.people?.[id]
  const name = (id) =>
    person(id)?.name ||
    desks.council.people?.[id]?.name ||
    desks.research.staff?.[id] ||
    desks.development.staff?.[id] ||
    desks.production.people?.[id] ||
    desks.programme.people?.[id] ||
    id ||
    'Не назначен'
  const org = (id) => world.organizations?.[id]?.name || id || 'Организация'
  const entry = (id) => world.entries?.[id] || list(world.entries).find((x) => x.id === id)
  const entryTitle = (id) =>
    desks.research.entries?.find((x) => x.id === id)?.title ||
    desks.development.entries?.find((x) => x.id === id)?.title ||
    desks.production.entries?.find((x) => x.id === id)?.title ||
    desks.manufacturer.clients?.find((x) => x.entry === id)?.name ||
    [org(entry(id)?.org), entry(id)?.number ? '№' + entry(id).number : ''].filter(Boolean).join(' ') ||
    id
  const close = () => setDialog(null)
  const run = (action, args) =>
    order.send(
      action,
      args,
      true,
      action.startsWith('maker-')
        ? 'manufacturer'
        : action.startsWith('component-')
          ? 'engineering'
          : action.split('-')[0],
    )

  const openForm = (config) => setDialog({ type: 'form', ...config })
  const confirm = (config) => openForm({ fields: [], initial: {}, submit: 'Подтвердить', ...config })
  const projects = ['research', 'design', 'test', 'production'].flatMap((kind) =>
    sourceProjects({ desks, date }, kind),
  )
  const sourceItems = [
    ...list(desks.production.items),
    ...list(desks.manufacturer.inventory)
      .filter((i) => !list(desks.production.items).some((x) => x.id === i.id))
      .map((i) => ({
        ...i,
        slot: i.axis,
        label: AXES[i.axis],
        remaining_m: null,
      })),
  ]
  const items = sourceItems
  let route = g.route || 'engineering'
  if (maker && ['engineering', 'research', 'development', 'production'].includes(route))
    route = 'manufacturer'
  let tab = g.tab || ''
  if (
    route === 'manufacturer' &&
    !maker &&
    !['clients', 'cases', 'advisors', 'warranty', 'history'].includes(tab)
  )
    tab = 'clients'
  if (route === 'manufacturer' && maker && !TABSETS.manufacturer.some((t) => t[0] === tab))
    tab =
      g.route === 'research' || g.route === 'development'
        ? 'research'
        : g.route === 'production'
          ? 'factory'
          : 'catalog'
  if (TABSETS[route] && !TABSETS[route].some((t) => t[0] === tab)) tab = TABSETS[route][0][0]
  const navigate = (r, t, id) => {
    g.navigate?.(r, t, id)
  }
  const ctx = {
    run,
    g,
    available: career.available_cents,
    commercial: p.commercial || {},
    world,
    game,
    career,
    role,
    maker,
    manage,
    date,
    year,
    desks,
    person,
    name,
    org,
    entry,
    entryTitle,
    projects,
    items,

    openForm,
    confirm,
    close,
    setDialog,
    navigate,
    selection,
    setSelection,
    query,
    setQuery,
    route,
    tab,
  }
  const titles = {
    engineering: [
      'ENGINEERING / ПРОГРАММА',
      'Машина начинается с людей',
      'Соберите исследования, чертежи и физические детали в одну техническую программу.',
    ],
    council: [
      'ENGINEERING / ШТАБ',
      'Решения, за которыми стоят люди',
      'Сопоставьте аргументы специалистов, ресурсы и цену выбранного компромисса.',
    ],
    research: [
      'ENGINEERING / ЗНАНИЯ',
      'Сначала — правильный вопрос',
      'Исследования сохраняют знания команды. Чертёж начинается с отдельного решения.',
    ],
    development: [
      'ENGINEERING / РАЗРАБОТКА',
      'От гипотезы к проверке',
      'Управляйте редакциями и испытаниями. Результат проверки определяет следующий шаг.',
    ],
    production: [
      'ENGINEERING / ЦЕХ',
      'Превратить чертёж в деталь',
      'Каждый экземпляр имеет номер, историю контроля и место в сборке.',
    ],
    inventory: [
      'ENGINEERING / СКЛАД',
      'У каждой детали есть история',
      'Готовность определяется конкретным экземпляром, а не наличием чертежа.',
    ],
    manufacturer: [
      maker ? 'MANUFACTURER / ' + org(career.org).toUpperCase() : 'ENGINEERING / ПАРТНЁРЫ',
      maker ? 'Технология. Производство. Доверие.' : 'Работа с производителями',
      maker
        ? 'Продукция, клиентские программы и подтверждённые инженерные решения.'
        : 'Договорные права, техническая поддержка и история каждого запроса.',
    ],
  }
  const heading = titles[route] || titles.engineering
  useEffect(() => {
    if (!g.entity || !['development', 'research', 'production', 'manufacturer'].includes(g.route)) return
    const linked =
      projects.find((p) => p.id === g.entity) ||
      ['research', 'design', 'test', 'production']
        .flatMap((k) => sourceProjects(ctx, k))
        .find((p) => p.id === g.entity)
    if (linked)
      setDialog({
        type: 'project',
        id: linked.id,
        title: 'Техническое дело',
        wide: true,
      })
  }, [g.entity, g.route, g.scope])
  return (
    <EC.Provider value={ctx}>
      <main className={'engineering-module eng-' + route + ' role-' + role}>
        <div className="eng-heading">
          <div>
            <small>{heading[0]}</small>
            <h1>
              <span className="eng-desktop-title">{heading[1]}</span>
              <span className="eng-mobile-title">
                {{
                  engineering: 'Техническая программа',
                  council: 'Решения штаба',
                  research: 'Исследования',
                  development: 'Разработка и испытания',
                  production: 'Производство',
                  inventory: 'Склад компонентов',
                  manufacturer: maker ? 'Продукты и клиенты' : 'Партнёры и поддержка',
                }[route] || heading[1]}
              </span>
            </h1>
            <p>{heading[2]}</p>
          </div>
          <div className="eng-heading-action">
            {!manage ? (
              <Tag tone="muted">
                <LockKeyhole size={13} /> Наблюдение владельца
              </Tag>
            ) : (
              <B
                icon={SlidersHorizontal}
                onClick={() =>
                  ctx.openForm({
                    title: maker ? 'Приоритет производителя' : 'Делегирование штабу',
                    initial: maker
                      ? {
                          allocation: desks.manufacturer.allocation || 'balanced',
                        }
                      : {
                          ...(desks.council.mandate || {
                            mode: 'manual',
                            focus: 'balanced',
                            limit_cents: 0,
                            allow_rent: false,
                          }),
                          ...{},
                          limit: (desks.council.mandate?.limit_cents || 0) / 100,
                        },
                    fields: maker
                      ? [
                          {
                            key: 'allocation',
                            label: 'Распределение программы',
                            type: 'select',
                            options: opts(ALLOCATION),
                          },
                        ]
                      : [
                          {
                            key: 'mode',
                            label: 'Режим управления',
                            type: 'select',
                            options: opts(MODES),
                          },
                          {
                            key: 'limit',
                            label: 'Лимит одного решения, €',
                            type: 'number',
                            min: 0,
                          },
                          {
                            key: 'focus',
                            label: 'Приоритет штаба',
                            type: 'select',
                            options: opts(FOCUS),
                          },
                          {
                            key: 'allow_rent',
                            label: 'Разрешить аренду мощности',
                            type: 'checkbox',
                          },
                        ],
                    description:
                      'Правила применяются к новым решениям. Уже утверждённые работы сохраняются.',
                    validate: (v) =>
                      !maker && Number(v.limit) < 0 ? 'Лимит не может быть отрицательным.' : null,
                    onSubmit: (v) =>
                      maker
                        ? run('maker-priority', { allocation: v.allocation })
                        : run('council-mandate', {
                            mode: v.mode,
                            focus: v.focus,
                            limit_cents: Math.round(Number(v.limit) * 100),
                            allow_rent: !!v.allow_rent,
                          }),
                  })
                }
              >
                {maker ? 'Приоритет программы' : 'Делегирование'}
              </B>
            )}
          </div>
        </div>
        {!manage && (
          <Note>
            Владелец контролирует инвестиции и руководителей. Оперативные поручения утверждает менеджер
            команды.
          </Note>
        )}
        {TABSETS[route] && (
          <Tabs
            items={
              route === 'manufacturer' && !maker
                ? TABSETS.manufacturer.filter(([t]) =>
                    ['clients', 'cases', 'advisors', 'warranty', 'history'].includes(t),
                  )
                : TABSETS[route]
            }
            value={tab}
            onChange={(t) => navigate(route, t)}
          />
        )}
        {route === 'engineering' ? (
          <Programme />
        ) : route === 'council' ? (
          <Council />
        ) : route === 'research' ? (
          <Research />
        ) : route === 'development' ? (
          <Development />
        ) : route === 'production' ? (
          <Production />
        ) : route === 'inventory' ? (
          <Inventory />
        ) : route === 'manufacturer' ? (
          <Manufacturer />
        ) : null}
      </main>
      {dialog && (
        <Modal title={dialog.title} eyebrow={dialog.eyebrow} wide={dialog.wide} onClose={close}>
          {dialog.type === 'form' ? (
            <Form key={dialog.title + dialog.key} {...dialog} onClose={close} />
          ) : dialog.type === 'work' ? (
            <WorkForm {...dialog} onClose={close} />
          ) : dialog.type === 'project' ? (
            <ProjectDossier id={dialog.id} />
          ) : dialog.type === 'item' ? (
            <ItemDossier id={dialog.id} />
          ) : dialog.type === 'case' ? (
            <CaseDossier id={dialog.id} />
          ) : (
            dialog.content
          )}
        </Modal>
      )}
    </EC.Provider>
  )
}
