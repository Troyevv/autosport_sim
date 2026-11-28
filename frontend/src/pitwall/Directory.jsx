import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useGame, useStored } from './core'
import { Icon, Button, Badge, Tabs, PageHeader, ContextMenu } from './ui'
import { PersonPortrait } from './visuals'
import { currentSupplyPrograms } from './clientRights'
import { EntityStatistics } from './v2/StatisticsCenter'
import './directory.css'
import {
  ContractFrame,
  ContractClause,
  ContractComparison,
  ContractImpact,
  ContractTimeline,
  ContractSeal,
  ContractSigningSummary,
  ContractDocument,
  ContractFacts,
} from './v2/Contracts'
import { useOrder } from '../career/finance/useOrder'
import { CountryFlag } from '../career/Country'
import { usePersonnel } from '../career/staff/model'
import { explain } from '../career/api'
const PeopleContext = createContext(null)
const usePeople = () => useContext(PeopleContext)
const rows = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])
const money = (n, compact = false) =>
  n == null || !Number.isFinite(Number(n))
    ? 'Не раскрыто'
    : new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'EUR',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: compact ? 1 : Number(n) % 100 ? 2 : 0,
      }).format(Number(n) / 100)
const date = (d) =>
  d
    ? new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Без срока'
const addDays = (d, n) =>
  new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
const daySpan = (a, b) =>
  Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)
const overlaps = (a, b, x, y) => a < y && x < b
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const percent = (v) => (v == null ? '—' : Math.round(v))
const mergeRows = (base, local) => [
  ...new Map([...rows(base), ...rows(local)].map((x) => [x.id, x])).values(),
]
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'ru')
const statusText = {
  sent: 'На рассмотрении',
  countered: 'Встречные условия',
  agreed: 'Готов к подписанию',
  accepted: 'Подписан',
  rejected: 'Закрыто',
  expired: 'Срок истёк',
  withdrawn: 'Отозвано',
  active: 'Действует',
  ended: 'Завершён',
  scheduled: 'Запланировано',
  completed: 'Завершено',
  cancelled: 'Отменено',
  'awaiting-result': 'Ожидается результат',
}
const goals = {
  performance: 'Спортивный результат',
  development: 'Развитие молодых',
  economy: 'Финансовая устойчивость',
  technical: 'Техническое развитие',
}
const horizons = {
  race: 'На ближайшую гонку',
  intermediate: 'Промежуточный',
  season: 'На сезон',
  long: 'Долгосрочный',
}
const sporting = {
  equal: 'Равноправный пилот',
  first: 'Первый пилот',
  second: 'Второй пилот',
}
const dutyNames = {
  race: 'Основной пилот',
  reserve: 'Резерв',
  test: 'Испытания',
  academy: 'Академия',
  relief: 'Временная замена',
}
const fundingSources = {
  family: 'Семья',
  sponsor: 'Личный спонсор',
  academy: 'Академия',
  manufacturer: 'Производитель',
  national: 'Национальная программа',
}
const relationNames = {
  hierarchy: 'Доверие к менеджеру',
  feedback: 'Работа с инженером',
  strategy: 'Работа со стратегом',
  teammates: 'Напарники',
  technical: 'Техническое согласование',
  workshop: 'Работа с бригадой',
  handover: 'Передача между отделами',
}
const outcomeNames = {
  'confirmed-feedback': 'Обратная связь принята',
  'unclear-feedback': 'Потребовалось уточнение',
  'sound-advice': 'Рекомендация подтвердилась',
  'missed-warning': 'Предупреждение упущено',
  cooperation: 'Согласованные действия',
  conflict: 'Конфликт',
  'successful-work': 'Работа принята',
  rework: 'Доработка',
  'verified-analysis': 'Анализ подтверждён',
  'incomplete-analysis': 'Недостаточно данных',
  'accepted-handover': 'Работа передана',
  'incomplete-handover': 'Запрошено уточнение',
}
const mediaNames = {
  charisma: 'Харизма',
  diplomacy: 'Дипломатичность',
  candor: 'Прямолинейность',
  temper: 'Вспыльчивость',
  privacy: 'Закрытость',
  provocation: 'Провокативность',
  self_criticism: 'Самокритичность',
  arrogance: 'Высокомерие',
  loyalty: 'Лояльность',
}
const peopleTabs = [
  { id: 'people', label: 'Команда' },
  { id: 'drivers', label: 'Пилоты' },
  { id: 'staff', label: 'Персонал' },
  { id: 'market', label: 'Рынок' },
  { id: 'contracts', label: 'Контракты' },
  { id: 'academy', label: 'Академия' },
  { id: 'funding', label: 'Поддержка' },
  { id: 'preparation', label: 'Подготовка' },
  { id: 'leadership', label: 'Руководство' },
]
const fileTabs = [
  { id: 'profile', label: 'Профиль' },
  { id: 'career', label: 'Карьера' },
  { id: 'statistics', label: 'История и статистика' },
  { id: 'public', label: 'Публичный профиль' },
  { id: 'work', label: 'Взаимодействие' },
  { id: 'compare', label: 'Сравнение' },
  { id: 'contract', label: 'Договор' },
  { id: 'support', label: 'Поддержка' },
]
function Field({ label, hint, children, wide = false }) {
  return (
    <label className={'p-field' + (wide ? ' p-wide' : '')}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
function Facts({ items, className = '' }) {
  return (
    <dl className={'p-facts ' + className}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? 'Нет сведений'}</dd>
        </div>
      ))}
    </dl>
  )
}
function Meter({ value, label, tone = '' }) {
  return (
    <div
      className={'p-meter ' + tone}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={num(value) ?? undefined}
    >
      <i style={{ width: Math.max(0, Math.min(100, num(value) || 0)) + '%' }} />
    </div>
  )
}
function Section({ title, eyebrow, sub, action, children, className = '' }) {
  return (
    <section className={'p-section ' + className}>
      <header>
        <div>
          {eyebrow && <span className="p-kicker">{eyebrow}</span>}
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
function Empty({ title, text, icon = 'Flag', action }) {
  return (
    <div className="p-empty">
      <Icon name={icon} size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}
function Status({ value, children }) {
  return (
    <Badge
      tone={
        ['active', 'accepted', 'agreed', 'completed'].includes(value)
          ? 'positive'
          : ['sent', 'countered', 'scheduled'].includes(value)
            ? 'warning'
            : 'neutral'
      }
    >
      {children || statusText[value] || value}
    </Badge>
  )
}
function FormError({ error }) {
  const ref = useRef(null)
  useEffect(() => {
    if (error) {
      ref.current?.focus()
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [error])
  return error ? (
    <p ref={ref} tabIndex={-1} role="alert" className="p-form-error">
      <Icon name="TriangleAlert" />
      {error}
    </p>
  ) : null
}
function FormActions({ submit, busy, disabled = false, onCancel }) {
  return (
    <div className="p-form-actions">
      <Button variant="secondary" onClick={onCancel}>
        Отмена
      </Button>
      <Button type="submit" disabled={busy || disabled}>
        {busy ? 'Проверяем условия…' : submit}
      </Button>
    </div>
  )
}
function checkDateRange(start, end, earliest) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || ''))
    return 'Укажите обе календарные даты.'
  if (start < earliest) return 'Начало не может быть раньше ' + date(earliest) + '.'
  if (end <= start) return 'Окончание должно быть позже начала. Последняя дата не включается в договор.'
  return null
}
function SearchField({
  value,
  onChange,
  placeholder = 'Имя, должность, организация',
  label = 'Поиск людей',
}) {
  return (
    <label className="p-search">
      <Icon name="Search" size={18} />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <Icon name="X" size={14} />
        </button>
      )}
    </label>
  )
}
function useDossier(personId, wet = false) {
  const { people, c } = usePeople()
  const detail = usePersonnel(
    personId ? 'careers/' + c.id + '/personnel/' + encodeURIComponent(personId) + '?wet=' + wet : null,
    c.revision,
  )
  return {
    ...detail,
    candidate: people.find((p) => p.id === personId),
    loading: !!personId && !detail.data && !detail.error,
  }
}
export function PersonnelDirectory() {
  const g = useGame(),
    c = g.game.career,
    world = g.world || g.game.world || {}
  const navigationRef = useRef(null)
  const [shortlist, setShortlist] = useStored('personnel.shortlist', [])
  const order = useOrder(c, g.updateCareer, 'staff')
  const dossiers = Object.values(g.game.dossiers || {})
  const contracts = dossiers.flatMap((d) => d.history.filter((x) => x.start > c.date && x.org === c.org))
  const state = {
    shortlist,
    offers: c.offers,
    preparations: c.preparations,
    contracts,
    scouting: dossiers.flatMap((d) => d.reports.map((r) => ({ ...r, person: d.person.id }))),
  }
  const available = c.available_cents
  const people = rows(g.game.personnel?.items || g.game.personnel)
  const name = (id) => people.find((p) => p.id === id)?.name || world.names?.[id] || 'Имя не раскрыто'
  const orgName = (id) => world.organizations?.[id]?.name || (id ? 'Организация' : 'Свободный агент')
  const positionName = (id) => world.positions?.[id]?.name || id || 'Сотрудник'
  const seriesName = (id) =>
    world.championships?.[id]?.short_name || world.championships?.[id]?.name || id || 'Общая программа'
  const seats = c.assignments.filter((s) => s.org === c.org)
  const own = people.filter((p) => p.org === c.org)
  const optionsFor = (_person, dossier) => dossier?.options || []
  const seatName = (id) => {
    const s = seats.find((x) => x.id === id)
    if (!s) return 'Место в штате'
    const e = world.entries?.[s.entry]
    return [
      s.duty ? dutyNames[s.duty] || s.duty : positionName(s.position),
      s.series && seriesName(s.series),
      e && '№ ' + e.number,
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const funds = g.game.funding || []
  const scholarships = c.scholarships
  const events = rows(world.events)
  const clients = currentSupplyPrograms({
    world,
    sourceSupplies: rows(g.game.projections?.commercial?.supplies),
    organization: c.org,
    date: c.date,
  }).map((client) => ({
    ...client,
    label: orgName(client.org) + ' · № ' + client.number + ' · ' + seriesName(client.series),
    productName: world.products?.[client.product]?.name || client.product,
  }))
  const toggleShortlist = (id) =>
    setShortlist((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]))
  const openForm = (title, content, description) =>
    g.openDialog({
      title,
      description,
      contractType:
        content?.type === NegotiationForm
          ? content.props.person?.position === 'driver'
            ? 'driver'
            : content.props.person?.position === 'manager'
              ? 'leadership'
              : 'staff'
          : content?.type === FundingForm
            ? content.props.academy
              ? 'academy'
              : 'funding'
            : content?.type === MandateForm
              ? 'leadership'
              : null,
      content: (
        <PeopleContext.Provider value={ctx}>
          <div
            className="people-module p-dialog-scope"
            style={{
              '--p-team': 'var(--org-accent)',
            }}
          >
            {content}
          </div>
        </PeopleContext.Provider>
      ),
      wide: true,
    })
  const run = (action, args) => order.send(action, args, true)
  async function commit(action, args, setError) {
    try {
      await run(action, args)
      g.closeDialog()
      return true
    } catch (e) {
      setError(explain(e))
      return false
    }
  }
  const ctx = {
    run,
    commit,
    g,
    c,
    world,
    people,
    own,
    seats,
    state,
    funds,
    scholarships,
    clients,
    available,
    name,
    orgName,
    positionName,
    seriesName,
    seatName,
    optionsFor,
    toggleShortlist,
    openForm,
    events,
  }
  const route =
    g.route === 'person' ? 'person' : peopleTabs.some((t) => t.id === g.route) ? g.route : 'people'
  useEffect(() => {
    const nav = navigationRef.current,
      active = nav?.querySelector('[aria-current="page"]')
    if (nav && active)
      nav.scrollLeft = Math.max(
        0,
        active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2,
      )
  }, [route])
  return (
    <PeopleContext.Provider value={ctx}>
      <div
        className="people-module"
        style={{
          '--p-team': 'var(--org-accent)',
        }}
      >
        {route !== 'person' && (
          <nav ref={navigationRef} className="p-subnav" aria-label="Люди и карьера">
            {peopleTabs
              .filter((t) => g.role !== 'manufacturer' || !['drivers', 'academy'].includes(t.id))
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={route === t.id ? 'active' : ''}
                  aria-current={route === t.id ? 'page' : undefined}
                  onClick={() => g.navigate(t.id)}
                >
                  {t.label}
                </button>
              ))}
          </nav>
        )}
        {route === 'people' ? (
          g.tab === 'groups' ? (
            <Collectives />
          ) : (
            <TeamOverview />
          )
        ) : route === 'drivers' ? (
          <Drivers />
        ) : route === 'staff' ? (
          <Staff />
        ) : route === 'market' ? (
          <Market />
        ) : route === 'contracts' ? (
          <Contracts />
        ) : route === 'academy' ? (
          <Academy />
        ) : route === 'funding' ? (
          <Funding />
        ) : route === 'preparation' ? (
          <Preparation />
        ) : route === 'leadership' ? (
          <Leadership />
        ) : (
          <Dossier key={g.entityId || g.entity} personId={g.entityId || g.entity} />
        )}
      </div>
    </PeopleContext.Provider>
  )
}
function PersonCard({ person, featured = false, number, subtitle }) {
  const { g, state, toggleShortlist, positionName, orgName, c } = usePeople()
  const p = person,
    isShortlisted = state.shortlist.includes(p.id)
  return (
    <article className={'p-person-card' + (featured ? ' featured' : '')}>
      <button
        data-dossier-for={p.id}
        className="p-person-main"
        type="button"
        onClick={() => g.openPerson(p.id, 'profile')}
        aria-label={'Открыть досье ' + p.name}
      >
        <div className="p-photo">
          <span className="p-photo-pattern" />
          {number && <span className="p-entry-number">{number}</span>}
          <PersonPortrait person={p} role={p.position} />
          {p.rating != null && (
            <span className="p-rating">
              <b>{Math.round(p.rating)}</b>
              <small>рейтинг</small>
            </span>
          )}
        </div>
        <div className="p-card-identity">
          <span className="p-kicker">{subtitle || positionName(p.position)}</span>
          <h3>{p.name}</h3>
          <p>
            {p.country && <span><CountryFlag id={p.country} countries={g.world.countries} /> {p.country.toUpperCase()}</span>}
            {p.age != null && <span>{p.age} лет</span>}
            <span>{p.org === c.org ? 'В составе' : orgName(p.org)}</span>
          </p>
        </div>
      </button>
      <div className="p-person-footer">
        <span>{p.tag || (p.end ? 'Контракт до ' + date(p.end) : 'Профиль в паддоке')}</span>
        <button
          type="button"
          className={'p-icon-button' + (isShortlisted ? ' selected' : '')}
          aria-label={(isShortlisted ? 'Убрать из избранного ' : 'В избранное ') + p.name}
          aria-pressed={isShortlisted}
          onClick={() => toggleShortlist(p.id)}
        >
          <Icon name="Bookmark" size={17} />
        </button>
        <ContextMenu
          label={'Действия · ' + p.name}
          items={[
            {
              label: 'Открыть досье',
              onClick: () => g.openPerson(p.id, 'profile'),
            },
            {
              label: 'Договор и условия',
              onClick: () => g.openPerson(p.id, 'contract'),
            },
            { label: 'Сравнить', onClick: () => g.openPerson(p.id, 'compare') },
            {
              label: isShortlisted ? 'Убрать из избранного' : 'В избранное',
              onClick: () => toggleShortlist(p.id),
            },
          ]}
        />
      </div>
    </article>
  )
}
function PersonRow({ p, secondary, action }) {
  const { g, positionName, orgName } = usePeople()
  return (
    <div className="p-person-row">
      <button type="button" className="p-row-person" data-dossier-for={p.id} onClick={() => g.openPerson(p.id, 'profile')}>
        <span className="p-mini-photo">
          <PersonPortrait person={p} role={p.position} />
        </span>
        <span>
          <b>{p.name}</b>
          <small>{secondary || positionName(p.position) + ' · ' + orgName(p.org)}</small>
        </span>
      </button>
      {p.rating != null && (
        <span className="p-row-rating">
          {Math.round(p.rating)}
          <small>OVR</small>
        </span>
      )}
      {action || (
        <button
          type="button"
          className="p-icon-button"
          aria-label={'Досье ' + p.name}
          onClick={() => g.openPerson(p.id, 'profile')}
        >
          <Icon name="ArrowUpRight" size={17} />
        </button>
      )}
    </div>
  )
}
function TeamOverview() {
  const { g, own, seats, c, state, orgName, positionName, available } = usePeople()
  const drivers = own.filter((p) => p.position === 'driver')
  const heroes =
    g.role === 'manufacturer'
      ? own
          .filter((p) =>
            ['chief-engineer', 'transmissions', 'engines', 'tyres', 'chief-analyst'].includes(
              p.position,
            ),
          )
          .slice(0, 2)
      : drivers.slice(0, 2)
  const leaders = own.filter((p) => p.position !== 'driver' && !heroes.some((h) => h.id === p.id))
  const expiry = own.filter((p) => p.end && p.end < addDays(c.date, 180))
  const openOffers = c.offers.filter((o) => ['sent', 'countered', 'agreed'].includes(o.status))
  return (
    <>
      <PageHeader
        eyebrow={orgName(c.org) + ' / Люди'}
        title={g.role === 'manufacturer' ? 'Люди создают преимущество' : 'Команда начинается с людей'}
        description={
          g.role === 'owner'
            ? 'Руководители, талант и ответственность за будущее организации.'
            : 'Пилоты, решения штаба и общая работа за каждым результатом.'
        }
        actions={
          <Button onClick={() => g.navigate('market')} icon={<Icon name="Search" />}>
            Кадровый рынок
          </Button>
        }
      />
      <div className="p-team-layout">
        <Section
          title={g.role === 'manufacturer' ? 'Техническое руководство' : 'На стартовой решётке'}
          eyebrow="Главные действующие лица"
          action={
            <Button
              variant="ghost"
              onClick={() => g.navigate(g.role === 'manufacturer' ? 'staff' : 'drivers')}
            >
              Весь состав <Icon name="ArrowUpRight" />
            </Button>
          }
        >
          <div className="p-featured-grid">
            {heroes.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                featured
                number={Object.values(g.world.entries || {}).find((e) => e.crew?.includes(p.id))?.number}
              />
            ))}
          </div>
          {!heroes.length && (
            <Empty
              title="Основные места открыты"
              text="Найдите кандидатов на доступные места в кадровом рынке."
              action={<Button onClick={() => g.navigate('market')}>Найти кандидатов</Button>}
            />
          )}
        </Section>
        <aside className="p-command-brief">
          <span className="p-kicker">Повестка кадрового штаба</span>
          <h2>Люди и решения</h2>
          <div className="p-brief-score">
            <strong>
              {seats.filter((s) => s.occupant).length}
              <span>/{seats.length}</span>
            </strong>
            <small>Мест в индивидуальном штате</small>
          </div>
          <button className="p-brief-task" onClick={() => g.navigate('contracts', 'negotiations')}>
            <Icon name="MessagesSquare" />
            <span>
              <b>
                {openOffers.length
                  ? openOffers.length + ' переговоров требуют внимания'
                  : 'Переговоры под контролем'}
              </b>
              <small>Условия, ответы и будущие переходы</small>
            </span>
            <Icon name="ChevronRight" />
          </button>
          <button className="p-brief-task" onClick={() => g.navigate('contracts')}>
            <Icon name="CalendarClock" />
            <span>
              <b>
                {expiry.length
                  ? expiry.length + ' договоров заканчиваются в ближайшие полгода'
                  : 'Планируйте следующий состав'}
              </b>
              <small>Сроки и обязательства в одном месте</small>
            </span>
            <Icon name="ChevronRight" />
          </button>
          <button className="p-brief-task" onClick={() => g.navigate('preparation')}>
            <Icon name="Activity" />
            <span>
              <b>
                {state.preparations.filter((x) => x.status === 'scheduled').length +
                  c.preparations.filter((x) => x.status === 'scheduled').length}{' '}
                программ подготовки
              </b>
              <small>Время, нагрузка и работа штаба</small>
            </span>
            <Icon name="ChevronRight" />
          </button>
          <div className="p-payroll">
            <small>Оклад команды / месяц</small>
            <strong>{money(c.account?.payroll_cents, true)}</strong>
            <span>Свободные средства · {money(available, true)}</span>
          </div>
        </aside>
      </div>
      <Section
        title="Лица команды"
        sub="Каждая должность имеет собственные навыки, историю и условия."
        action={
          <Button variant="ghost" onClick={() => g.navigate('staff')}>
            Персонал <Icon name="ArrowUpRight" />
          </Button>
        }
      >
        <div className="p-leaders-grid">
          {leaders.slice(0, 8).map((p) => (
            <PersonRow key={p.id} p={p} secondary={positionName(p.position)} />
          ))}
        </div>
      </Section>
      <div className="p-bottom-band">
        <Icon name="Users" size={30} />
        <div>
          <span className="p-kicker">Работа подразделений</span>
          <h3>{rows(c.collectives).reduce((a, x) => a + x.size, 0)} специалистов за кулисами</h3>
          <p>Инженеры, производство и бригады — численность, загрузка, усталость и общий опыт.</p>
        </div>
        <Button variant="secondary" onClick={() => g.navigate('staff', 'collectives')}>
          Открыть коллективы
        </Button>
      </div>
    </>
  )
}
function Directory({ source, market = false, presetPosition = '' }) {
  const { g, world, state, orgName, positionName, seriesName, toggleShortlist } = usePeople()
  const [directory, setDirectory] = useStored(
    'people.directory.' + g.route + '.' + (g.tab || (market ? 'directory' : 'individual')),
    {
      query: '',
      position: presetPosition,
      series: '',
      country: '',
      free: false,
      sort: 'rating',
      page: 0,
      mode: 'list',
    },
  )
  const { query, position, series, country, free, sort, page, mode } = directory
  const assign = (key) => (value) =>
    setDirectory((previous) => ({
      ...previous,
      [key]: typeof value === 'function' ? value(previous[key]) : value,
    }))
  const setQuery = assign('query'),
    setPosition = assign('position'),
    setSeries = assign('series'),
    setCountry = assign('country'),
    setFree = assign('free'),
    setSort = assign('sort'),
    setPage = assign('page'),
    setMode = assign('mode')
  const filtered = useMemo(
    () =>
      source
        .filter(
          (p) =>
            (!position || p.position === position) &&
            (!series || (p.programs || []).includes(series)) &&
            (!country || p.country === country) &&
            (!free || !p.org) &&
            [p.name, positionName(p.position), orgName(p.org)]
              .join(' ')
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === 'name'
            ? byName(a, b)
            : sort === 'fit'
              ? (b.fit || 0) - (a.fit || 0) || byName(a, b)
              : sort === 'cost'
                ? (a.financial?.net_cents == null ? Infinity : -a.financial.net_cents) -
                    (b.financial?.net_cents == null ? Infinity : -b.financial.net_cents) || byName(a, b)
                : (b.rating || 0) - (a.rating || 0) || byName(a, b),
        ),
    [source, query, position, series, country, free, sort],
  )
  const max = Math.max(0, Math.ceil(filtered.length / 18) - 1),
    current = Math.min(page, max),
    shown = filtered.slice(current * 18, current * 18 + 18)
  const change = (fn) => (v) => {
    fn(v)
    setPage(0)
  }
  const disclosedSalary = (p) =>
    g.game.dossiers?.[p.id]?.current?.salary_cents ?? p.financial?.wage_cents
  return (
    <>
      <div className="p-directory-toolbar">
        <SearchField value={query} onChange={change(setQuery)} />
        <div className="p-display-mode" aria-label="Вид списка">
          <button
            type="button"
            aria-label="Список"
            aria-pressed={mode === 'list'}
            onClick={() => setMode('list')}
          >
            <Icon name="List" />
          </button>
          <button
            type="button"
            aria-label="Карточки"
            aria-pressed={mode === 'cards'}
            onClick={() => setMode('cards')}
          >
            <Icon name="LayoutGrid" />
          </button>
        </div>
      </div>
      <div className="p-filters">
        <Field label="Профессия">
          <select value={position} onChange={(e) => change(setPosition)(e.target.value)}>
            <option value="">Все профессии</option>
            {Object.entries(world.positions || {})
              .filter(([id]) => source.some((p) => p.position === id))
              .map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Чемпионат">
          <select value={series} onChange={(e) => change(setSeries)(e.target.value)}>
            <option value="">Все чемпионаты</option>
            {Object.keys(world.championships || {})
              .filter((id) => source.some((p) => p.programs?.includes(id)))
              .map((id) => (
                <option key={id} value={id}>
                  {seriesName(id)}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Национальность">
          <select value={country} onChange={(e) => change(setCountry)(e.target.value)}>
            <option value="">Все страны</option>
            {[...new Set(source.map((p) => p.country))]
              .filter(Boolean)
              .sort()
              .map((id) => (
                <option key={id} value={id}>
                  {world.countries?.[id] || id}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Порядок">
          <select value={sort} onChange={(e) => change(setSort)(e.target.value)}>
            <option value="rating">По рейтингу</option>
            <option value="name">По имени</option>
            {market && (
              <>
                <option value="fit">По соответствию команде</option>
                <option value="cost">По чистому эффекту</option>
              </>
            )}
          </select>
        </Field>
        {market && (
          <label className="p-check">
            <input type="checkbox" checked={free} onChange={(e) => change(setFree)(e.target.checked)} />
            Свободные агенты
          </label>
        )}
      </div>
      <div className="p-results-caption">
        <span>
          <b>{filtered.length}</b> человек
          {filtered.length !== source.length && ' из ' + source.length}
        </span>
        <span>Рейтинг 0–100 · закрытые условия не заменены нулём</span>
      </div>
      {mode === 'cards' ? (
        <div className="p-directory-cards">
          {shown.map((p) => (
            <PersonCard key={p.id} person={p} />
          ))}
        </div>
      ) : (
        <div className="p-roster-table">
          <div className="p-roster-header">
            <span>Сотрудник / организация</span>
            <span>Рейтинг</span>
            <span>Профессия</span>
            <span>Условия</span>
            <span>Решение</span>
          </div>
          {shown.map((p) => (
            <article className="p-roster-line" key={p.id}>
              <button className="p-row-person" data-dossier-for={p.id} onClick={() => g.openPerson(p.id, 'profile')}>
                <span className="p-mini-photo">
                  <PersonPortrait person={p} role={p.position} />
                </span>
                <span>
                  <b>{p.name}</b>
                  <small>
                    <CountryFlag id={p.country} countries={world.countries} /> {p.country?.toUpperCase()} · {p.age} лет · {orgName(p.org)}
                  </small>
                </span>
              </button>
              <span className="p-roster-score">
                <b>{p.rating != null ? Math.round(p.rating) : '—'}</b>
                <Meter value={p.rating} label={'Рейтинг ' + p.name} />
              </span>
              <span className="p-roster-job">
                {positionName(p.position)}
                <small>{(p.programs || []).slice(0, 2).map(seriesName).join(' · ')}</small>
              </span>
              <span className="p-roster-terms">
                <b>{money(disclosedSalary(p))}</b>
                <small>
                  {disclosedSalary(p) != null
                    ? 'оклад / месяц'
                    : p.end
                      ? 'до ' + date(p.end)
                      : 'Условия в досье'}
                </small>
              </span>
              <div className="p-row-actions">
                <button
                  className={'p-icon-button' + (state.shortlist.includes(p.id) ? ' selected' : '')}
                  aria-label={
                    (state.shortlist.includes(p.id) ? 'Убрать из избранного ' : 'В избранное ') + p.name
                  }
                  aria-pressed={state.shortlist.includes(p.id)}
                  onClick={() => toggleShortlist(p.id)}
                >
                  <Icon name="Bookmark" size={17} />
                </button>
                <Button variant="secondary" onClick={() => g.openPerson(p.id, 'contract')}>
                  Условия
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!filtered.length && (
        <Empty
          title="По этим условиям никого нет"
          text="Попробуйте другое имя, профессию или чемпионат."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('')
                setPosition('')
                setSeries('')
                setCountry('')
                setFree(false)
              }}
            >
              Сбросить фильтры
            </Button>
          }
        />
      )}
      {filtered.length > 18 && (
        <div className="p-pagination">
          <Button variant="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <Icon name="ChevronLeft" />
            Назад
          </Button>
          <span>
            {current * 18 + 1}–{Math.min((current + 1) * 18, filtered.length)} из {filtered.length}
          </span>
          <Button variant="secondary" disabled={current === max} onClick={() => setPage(current + 1)}>
            Далее
            <Icon name="ChevronRight" />
          </Button>
        </div>
      )}
    </>
  )
}
function Staff() {
  const { g, own, c, orgName } = usePeople()
  const tab = g.tab || 'individual'
  return (
    <>
      <PageHeader
        eyebrow={orgName(c.org) + ' / Персонал'}
        title="Штаб и подразделения"
        description="Личная ответственность руководителей и общая работа коллективов."
      />
      <Tabs
        items={[
          { id: 'individual', label: 'Индивидуальный штат' },
          { id: 'collectives', label: 'Коллективы' },
        ]}
        value={tab}
        onChange={(v) => g.navigate('staff', v)}
      />
      {tab === 'collectives' ? (
        <Collectives heading={false} />
      ) : (
        <Directory source={own.filter((p) => p.position !== 'driver')} />
      )}
    </>
  )
}
function Market() {
  const { g, people, state, own, name } = usePeople(),
    tab = g.tab || 'directory'
  return (
    <>
      <PageHeader
        eyebrow="Кадровый рынок / Единый мир"
        title="Найдите своё преимущество"
        description="Профессия, навыки и совместимость с командой. Все чемпионаты — в одном каталоге."
        actions={
          <Button variant="secondary" onClick={() => g.navigate('contracts', 'negotiations')}>
            <Icon name="MessagesSquare" />
            Переговоры
          </Button>
        }
      />
      <Tabs
        items={[
          { id: 'directory', label: 'Все кандидаты', count: people.length },
          {
            id: 'shortlist',
            label: 'Избранное',
            count: state.shortlist.length,
          },
          { id: 'scouting', label: 'Скаутинг', count: state.scouting.length },
        ]}
        value={tab}
        onChange={(v) => g.navigate('market', v)}
      />
      {tab === 'scouting' ? (
        <div className="p-scout-layout">
          <Section
            title="Наблюдения и поручения"
            sub="Скаут уточняет диапазон потенциала. Ожидание не превращается в точное число."
          >
            {state.scouting.length ? (
              state.scouting.map((s) => (
                <article className="p-timeline-row" key={s.id}>
                  <span className="p-timeline-dot" />
                  <div>
                    <span className="p-kicker">{date(s.date)} · Наблюдение</span>
                    <button className="p-text-button" onClick={() => g.openPerson(s.person, 'career')}>
                      {name(s.person)}
                    </button>
                    <p>
                      {name(s.scout)} · {s.focus}
                    </p>
                    <Status value={s.status}>Поручение записано</Status>
                    <small>Следующий запрос не ранее {date(s.next)}</small>
                  </div>
                </article>
              ))
            ) : (
              <Empty
                title="Новый талант начинается с наблюдения"
                text="Откройте досье пилота и поручите скауту оценку потенциала. Существующие отчёты доступны в разделе «Карьера»."
                action={
                  <Button onClick={() => g.navigate('market', 'directory')}>Выбрать пилота</Button>
                }
              />
            )}
          </Section>
          <Section title="Скаутская служба">
            {own
              .filter((p) => p.position === 'scout')
              .map((p) => (
                <PersonRow key={p.id} p={p} />
              ))}
            {!own.some((p) => p.position === 'scout') && (
              <p className="p-muted">Для новых наблюдений нужен действующий скаут.</p>
            )}
          </Section>
        </div>
      ) : (
        <Directory
          key={tab}
          market
          source={tab === 'shortlist' ? people.filter((p) => state.shortlist.includes(p.id)) : people}
        />
      )}
    </>
  )
}
function Drivers() {
  const p = usePeople(),
    { g, c, own, seats, world, state, openForm, update, notify } = p
  if (g.role === 'manufacturer')
    return (
      <>
        <PageHeader
          eyebrow="Клиентские программы"
          title="Пилоты клиентов"
          description="Производитель поддерживает пилотов и команды, но не управляет их гоночным составом."
        />
        <Directory
          market
          source={p.people.filter(
            (x) => x.position === 'driver' && p.clients.some((k) => k.org === x.org),
          )}
        />
      </>
    )
  const data = g.game.projections?.lineup || g.game.lineup || {},
    drivers = rows(data.drivers)
  const driversBySeat = new Map(drivers.map((d) => [d.seat, d]))
  const raceSeats = seats.filter((s) => s.position === 'driver' && s.entry),
    supporting = seats.filter((s) => s.position === 'driver' && !s.entry)
  return (
    <>
      <PageHeader
        eyebrow={p.orgName(c.org) + ' / Пилоты'}
        title="Состав на сезон"
        description="Экипажи, спортивный статус и доступность. Будущие договоры вступают в указанный день."
        actions={<Button onClick={() => g.navigate('market')}>Подобрать пилота</Button>}
      />
      <div className="p-race-grid">
        {raceSeats.map((s) => {
          const d = driversBySeat.get(s.id),
            person = own.find((x) => x.id === s.occupant?.id) || s.occupant,
            e = world.entries?.[s.entry]
          return (
            <section className="p-race-seat" key={s.id}>
              <header>
                <span className="p-kicker">{p.seriesName(s.series)}</span>
                <strong>№ {e?.number}</strong>
              </header>
              {person ? (
                <>
                  <PersonCard
                    person={person}
                    featured
                    number={e?.number}
                    subtitle={dutyNames[s.duty] || 'Основной пилот'}
                  />
                  <Facts
                    items={[
                      [
                        'Спортивный статус',
                        sporting[d?.promised || g.game.dossiers?.[person.id]?.current?.driver_status] ||
                          'См. договор',
                      ],
                      [
                        'Доступность',
                        d?.absence
                          ? ({injury:'Травма',illness:'Заболевание',suspension:'Дисквалификация'}[d.absence.reason] || 'Временная недоступность') +
                            ' · до ' +
                            date(d.absence.expected_return)
                          : 'Допущен',
                      ],
                      ['Фактические условия', d?.actual?.message || 'Нет подтверждённых различий'],
                      ['Претензии', d?.grievances ?? 0],
                    ]}
                  />
                  {g.role === 'manager' && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        openForm('Обсудить спортивный статус', <HierarchyForm seat={s} driver={d} />)
                      }
                    >
                      Обсудить иерархию
                    </Button>
                  )}
                </>
              ) : (
                <Empty
                  title="Место вакантно"
                  text="Назначение выполняется через предложение и договор."
                  action={<Button onClick={() => g.navigate('market')}>Найти пилота</Button>}
                />
              )}
            </section>
          )
        })}
      </div>
      <div className="p-two-columns">
        <Section title="Резерв и испытания" sub="Отдельные договоры и программы работы.">
          {supporting.map((s) =>
            s.occupant ? (
              <PersonRow
                key={s.id}
                p={own.find((x) => x.id === s.occupant.id) || s.occupant}
                secondary={dutyNames[s.duty] || p.seatName(s.id)}
                action={
                  driversBySeat.get(s.id)?.simulator ? (
                    <span role="status">Симулятор запланирован до {date(driversBySeat.get(s.id).simulator.end)}</span>
                  ) : g.role === 'manager' && c.preparation_options?.some((x) => x.id === 'simulator') ? (
                    <Button
                      variant="secondary"
                      disabled={!!driversBySeat.get(s.id)?.absence}
                      onClick={() =>
                        openForm(
                          'Подготовка на симуляторе',
                          <PreparationForm kind="simulator" participant={s.occupant.id} />,
                        )
                      }
                    >
                      Симулятор
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="p-vacancy" key={s.id}>
                <Icon name="UserRoundPlus" />
                <span>
                  {p.seatName(s.id)}
                  <small>Открытое место</small>
                </span>
                <Button variant="secondary" onClick={() => g.navigate('market')}>
                  Кандидаты
                </Button>
              </div>
            ),
          )}
          {!supporting.length && (
            <p className="p-muted">В этой программе нет отдельных мест резерва и испытаний.</p>
          )}
        </Section>
        <Section title="Замены на этап" sub="Подтверждённая недоступность и регистрационное окно.">
          {rows(data.windows).length ? (
            rows(data.windows).map((w) => (
              <article className="p-registration" key={w.reference}>
                <h3>{w.name}</h3>
                <p>
                  {p.name(w.principal)} · регистрация до {date(w.deadline)}
                </p>
                {w.cover ? (
                  <p>
                    Замена · {p.name(w.cover.person)} · {date(w.cover.start)}–{date(w.cover.end)}
                  </p>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={g.role !== 'manager'}
                    onClick={() => openForm('Заявить временную замену', <ReplacementForm window={w} />)}
                  >
                    Выбрать замену
                  </Button>
                )}
              </article>
            ))
          ) : (
            <Empty
              title="Заявок на замену нет"
              text="Кандидаты появляются после подтверждения отсутствия пилота и открытия регистрации на этап."
              icon="ClipboardCheck"
            />
          )}
        </Section>
      </div>
      <Section title="История договорённостей">
        {rows(data.history).length ? (
          rows(data.history).map((r) => (
              <article className="p-history-line" key={r.id}>
                <time>{date(r.date)}</time>
                <div>
                  <b>{p.name(r.person)}</b>
                  <p>{r.message}</p>
                  {r.evidence && <small>{r.evidence}</small>}
                </div>
              </article>
            ))
        ) : (
          <p className="p-muted">Подтверждённые изменения условий будут записаны здесь.</p>
        )}
      </Section>
    </>
  )
}
function HierarchyForm({ seat, driver }) {
  const { g, commit, name, available } = usePeople()
  const [error, setError] = useState('')
  function submit(e) {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.currentTarget))
    if (v.status === (driver?.promised || 'equal'))
      return setError('Выберите новый статус. Текущие условия уже действуют.')
    if (Number(v.compensation) * 100 > available)
      return setError('Предел компенсации превышает свободные средства.')
    commit(
      'driver-review',
      { seat: seat.id, status: v.status, compensation_cents: Math.round(Number(v.compensation) * 100) },
      setError,
    )
  }
  return (
    <form className="p-form" onSubmit={submit}>
      <p>
        Изменение для {name(seat.occupant.id)} вступит в силу после согласия затронутых пилотов.
        Компенсация задаётся на человека.
      </p>
      <Field label="Предлагаемый статус">
        <select name="status" defaultValue={driver?.promised || 'equal'}>
          {Object.entries(sporting).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Предел компенсации, €">
        <input name="compensation" type="number" required min="0" step="0.01" defaultValue="0" />
      </Field>
      <FormError error={error} />
      <FormActions submit="Передать предложение" onCancel={g.closeDialog} />
    </form>
  )
}
function ReplacementForm({ window: w }) {
  const { g, commit, name } = usePeople()
  const [selected, setSelected] = useState(''),
    [error, setError] = useState('')
  const candidate = w.candidates.find((x) => x.person === selected)
  function submit(e) {
    e.preventDefault()
    if (!candidate || candidate.reason)
      return setError(candidate?.reason || 'Выберите допущенного кандидата.')
    commit('driver-nominate', { seat: w.seat, round: w.round, person: selected }, setError)
  }
  return (
    <form className="p-form" onSubmit={submit}>
      <p>
        {w.name} · основной пилот {name(w.principal)} · регистрация до {date(w.deadline)}
      </p>
      <Field label="Кандидат">
        <select required name="person" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Выберите пилота</option>
          {w.candidates.map((x) => (
            <option key={x.person} value={x.person}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      {candidate && (
        <div className="p-callout">
          <b>{candidate.reason || 'Допуск подтверждён'}</b>
          <span>Выплата · {money(candidate.fee)}</span>
        </div>
      )}
      <FormError error={error} />
      <FormActions submit="Подтвердить замену" disabled={!candidate || !!candidate.reason} onCancel={g.closeDialog} />
    </form>
  )
}
function Collectives({ heading = true }) {
  const { c, g } = usePeople(),
    groups = rows(c.collectives)
  const [selected, select] = useState(groups[0]?.id || ''),
    [comparison, compare] = useState('')
  const group = groups.find((x) => x.id === selected) || groups[0],
    other = groups.find((x) => x.id === comparison && x.id !== selected)
  const metrics = {
    qualification: 'Квалификация',
    precision: 'Точность',
    speed: 'Скорость работ',
    pressure: 'Работа под давлением',
    cohesion: 'Слаженность',
    motivation: 'Мотивация',
    atmosphere: 'Атмосфера',
  }
  return (
    <>
      {heading && (
        <PageHeader
          eyebrow="Организация / Коллективы"
          title="Работа, которую делают вместе"
          description="Численность и мощность подразделения не заменяют квалификацию, усталость и совместный опыт."
        />
      )}
      {group ? (
        <div className="p-collective-layout">
          <nav className="p-department-list" aria-label="Подразделения">
            {groups.map((x) => (
              <button
                key={x.id}
                className={group.id === x.id ? 'active' : ''}
                onClick={() => select(x.id)}
              >
                <Icon name={/механ|пит/i.test(x.name) ? 'Wrench' : 'Layers3'} />
                <span>
                  <b>{x.name}</b>
                  <small>
                    {x.size} специалистов · загрузка {x.workload}%
                  </small>
                </span>
                <Icon name="ChevronRight" />
              </button>
            ))}
          </nav>
          <div>
            <div className="p-department-hero">
              <span className="p-kicker">Подразделение</span>
              <h2>{group.name}</h2>
              <div className="p-department-stats">
                <span>
                  <b>{group.size}</b>
                  <small>сотрудников</small>
                </span>
                <span>
                  <b>{group.workload}%</b>
                  <small>загрузка</small>
                </span>
                <span>
                  <b>{group.fatigue}</b>
                  <small>усталость</small>
                </span>
                <span>
                  <b>{money(group.payroll_cents, true)}</b>
                  <small>оклад / месяц</small>
                </span>
              </div>
              <Meter
                value={group.workload}
                label="Загрузка подразделения"
                tone={group.workload > 85 ? 'warning' : ''}
              />
            </div>
            <Section
              title="Профессиональный профиль"
              action={
                <Field label="Сравнить с">
                  <select value={comparison} onChange={(e) => compare(e.target.value)}>
                    <option value="">Без сравнения</option>
                    {groups
                      .filter((x) => x.id !== group.id)
                      .map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </Field>
              }
            >
              <div className="p-collective-comparison">
                {Object.entries(metrics).map(([key, label]) => (
                  <div key={key}>
                    <strong>{group[key]}</strong>
                    <span>
                      {label}
                      <Meter value={group[key]} label={label} />
                    </span>
                    {other && <strong>{other[key]}</strong>}
                  </div>
                ))}
              </div>
              <Facts
                items={[
                  ['Совместная работа', group.team_days + ' дней'],
                  ['Резерв мощности', (group.capacity / 100).toLocaleString('ru-RU') + ' чел.-дн./день'],
                  ...(other
                    ? [
                        ['Сравнение', other.name],
                        ['Численность сравниваемого', other.size],
                      ]
                    : []),
                ]}
              />
            </Section>
            <DevelopmentHistory data={group.development} />
            <Relationships rows={group.relationships} />
          </div>
        </div>
      ) : (
        <Empty
          title="Индивидуальный штат"
          text="В текущей организации коллективы не выделены отдельными подразделениями."
          action={<Button onClick={() => g.navigate('staff')}>Открыть персонал</Button>}
        />
      )}
    </>
  )
}
function Contracts() {
  const p = usePeople(),
    { g, state, c, own, seats } = p
  const tab = g.tab || 'active'
  const offers = c.offers,
    active = seats.filter((s) => s.occupant)
  return (
    <>
      <PageHeader
        eyebrow="Договоры / Люди"
        title="Состав сегодня. Решения на завтра."
        description="Оклад, полномочия, дата перехода и обязательства. Подписание и начало работы — разные события."
        actions={<Button onClick={() => g.navigate('market')}>Новое предложение</Button>}
      />
      <div className="contract-contracts-intro">
        <Icon name="MessagesSquare" size={30} />
        <div>
          <h3>Разговор начинается с человека</h3>
          <p>
            Сравните ожидания кандидата с условиями организации. После ответа проверьте выкуп, бонус и
            дату вступления, затем принимайте решение.
          </p>
        </div>
        <Button variant="secondary" onClick={() => g.navigate('agreements')}>
          Все соглашения
          <Icon name="ArrowUpRight" size={16} />
        </Button>
      </div>
      <Tabs
        items={[
          { id: 'active', label: 'Действующие договоры', count: active.length },
          {
            id: 'negotiations',
            label: 'Переговоры',
            count: offers.filter((x) => ['sent', 'countered', 'agreed'].includes(x.status)).length,
          },
          {
            id: 'future',
            label: 'Будущие назначения',
            count: state.contracts.filter((x) => x.start > c.date).length,
          },
        ]}
        value={tab}
        onChange={(v) => g.navigate('contracts', v)}
      />
      {tab === 'negotiations' ? (
        offers.length ? (
          <div className="p-offer-list">
            {offers
              .slice()
              .reverse()
              .map((o) => (
                <OfferCard key={o.id} offer={o} />
              ))}
          </div>
        ) : (
          <Empty
            title="Переговорная комната свободна"
            text="Предложите конкретное место, оклад и даты из досье кандидата. Ответ появится отдельным этапом."
            icon="MessagesSquare"
            action={<Button onClick={() => g.navigate('market')}>Открыть рынок</Button>}
          />
        )
      ) : tab === 'future' ? (
        state.contracts.some((x) => x.start > c.date) ? (
          state.contracts
            .filter((x) => x.start > c.date)
            .map((o) => (
              <article className="p-future-contract" key={o.id}>
                <Icon name="CalendarCheck" size={28} />
                <div>
                  <span className="p-kicker">Вступает {date(o.start)}</span>
                  <h3>{p.name(o.person)}</h3>
                  <p>
                    {p.seatName(o.seat)} · до {date(o.end)}
                  </p>
                  <p>{money(o.salary_cents)} / месяц</p>
                </div>
                <Button variant="secondary" onClick={() => g.openPerson(o.person, 'contract')}>
                  Досье
                </Button>
              </article>
            ))
        ) : (
          <Empty
            title="Будущие переходы не подписаны"
            text="Текущее место останется за сотрудником до даты перехода. После подписания договор будет показан здесь."
            icon="CalendarClock"
          />
        )
      ) : (
        <div className="p-contract-ledger">
          {active.map((s) => {
            const d = g.game.dossiers?.[s.occupant.id],
              contract = d?.current,
              candidate = own.find((x) => x.id === s.occupant.id) || s.occupant
            return (
              <article key={s.id}>
                <PersonRow p={candidate} secondary={p.seatName(s.id)} />
                <div className="p-contract-details">
                  <span>
                    <small>Месячный оклад</small>
                    <b>{money(contract?.salary_cents ?? candidate.financial?.wage_cents)}</b>
                  </span>
                  <span>
                    <small>До</small>
                    <b>{date(contract?.end || candidate.end)}</b>
                  </span>
                  <span>
                    <small>Компенсация</small>
                    <b>{money(contract?.buyout_cents)}</b>
                  </span>
                  <Button variant="secondary" onClick={() => g.openPerson(s.occupant.id, 'contract')}>
                    Условия и продление
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
function OfferCard({ offer: o }) {
  const p = usePeople(),
    { g, c, run } = p
  const candidate = p.people.find((x) => x.id === o.person),
    current = g.game.dossiers?.[o.person]?.current
  const type =
    candidate?.position === 'driver'
      ? 'driver'
      : candidate?.position === 'manager'
        ? 'leadership'
        : 'staff'
  function sign() {
    if (o.start < c.date || o.end <= c.date)
      return g.notify('Срок предложения прошёл. Обсудите новые даты назначения.', 'warning')
    if (o.buyout_cents == null)
      return g.notify('Сначала нужен расчёт выкупа в условиях предложения.', 'warning')
    g.confirm({
      title: 'Подписать договор с ' + p.name(o.person),
      contractType: type,
      wide: true,
      content: (
        <ContractSigningSummary
          type={type}
          person={candidate}
          amount={(o.bonus_cents || 0) + (o.buyout_cents || 0)}
          start={o.start}
          end={o.end}
          rows={[
            ['Место', p.seatName(o.seat)],
            ['Оклад / месяц', money(o.salary_cents)],
            ['Бонус', money(o.bonus_cents)],
            ['Выкуп', money(o.buyout_cents)],
            [
              'После подписания доступно',
              money(p.available - (o.bonus_cents || 0) - (o.buyout_cents || 0)),
            ],
          ]}
          note="Бонус и выкуп будут списаны сразу. Состав и оклад изменятся в дату вступления договора."
        />
      ),
      confirmLabel: 'Подписать договор',
      onConfirm: () => run('offer-accept', { offer: o.id }),
    })
  }
  return (
    <article className="p-offer-card contract-offer-case">
      <ContractFrame
        type={type}
        title={candidate?.name || p.name(o.person)}
        eyebrow={'Переговоры / ' + (statusText[o.status] || o.status)}
        person={candidate}
        subtitle={p.seatName(o.seat)}
        aside={
          <>
            <ContractImpact
              now={(o.bonus_cents || 0) + (o.buyout_cents || 0)}
              recurring={o.salary_cents}
              after={
                o.status === 'accepted'
                  ? p.available
                  : p.available - (o.bonus_cents || 0) - (o.buyout_cents || 0)
              }
              note={
                o.buyout_cents == null
                  ? 'Выкуп пока не раскрыт. Подписание заблокировано до расчёта.'
                  : 'Разовые суммы списываются при подписи; зарплата — после начала работы.'
              }
            />
            <p className="contract-source-badge">Переговоры о трудовом договоре</p>
          </>
        }
      >
        <ContractClause number={1} title="Позиция сторон">
          <div className="p-negotiation-progress">
            {['Предложение', 'Ответ', 'Подписание', 'Начало'].map((s, i) => (
              <span
                className={
                  i <= (o.status === 'accepted' ? 2 : ['countered', 'agreed'].includes(o.status) ? 1 : 0)
                    ? 'reached'
                    : ''
                }
                key={s}
              >
                <i>{i + 1}</i>
                {s}
              </span>
            ))}
          </div>
          <p className="p-offer-message">{o.message || 'Кандидат рассматривает предложение.'}</p>
          <ContractComparison
            currentLabel={o.initial_salary_cents != null ? 'Первый раунд' : 'Текущий договор'}
            proposedLabel={o.status === 'countered' ? 'Ответ кандидата' : 'Предложение'}
            rows={[
              [
                'Оклад / месяц',
                money(o.initial_salary_cents ?? current?.salary_cents),
                money(o.salary_cents),
              ],
              [
                'Назначение',
                current ? p.seatName(current.seat) : 'Нет раскрытого договора',
                p.seatName(o.seat),
              ],
              [
                'Период',
                current ? date(current.start) + ' — ' + date(current.end) : 'Не раскрыт',
                date(o.start) + ' — ' + date(o.end),
              ],
            ]}
          />
        </ContractClause>
        <ContractClause number={2} title="Ход переговоров">
          <ContractTimeline
            events={o.history || []}
            initialDate={o.date || c.date}
            initialText="Предложение отправлено"
          />
        </ContractClause>
      </ContractFrame>
      {o.status === 'accepted' && (
        <ContractSeal date={o.start} future label="Добро пожаловать в организацию" />
      )}
      <div className="p-inline-actions">
        {o.status === 'sent' && (
          <Button onClick={g.onAdvance}>
            Перейти к следующему событию <Icon name="ArrowRight" />
          </Button>
        )}
        {['agreed', 'countered'].includes(o.status) && (
          <Button onClick={sign}>
            {o.status === 'countered' ? 'Проверить встречные условия' : 'Перейти к подписи'}
          </Button>
        )}
        {['sent', 'agreed', 'countered'].includes(o.status) && (
          <Button
            variant="secondary"
            onClick={() =>
              g.confirm({
                title: 'Отозвать предложение?',
                description:
                  'Подписание не состоится. Текущий договор сотрудника продолжит действовать.',
                confirmLabel: 'Отозвать предложение',
                onConfirm: () => run('offer-withdraw', { offer: o.id }),
              })
            }
          >
            Отозвать
          </Button>
        )}
        <Button variant="ghost" onClick={() => g.openPerson(o.person, 'contract')}>
          Открыть досье
        </Button>
      </div>
    </article>
  )
}
function NegotiationForm({ person, dossier, previousOffer }) {
  const p = usePeople(),
    { g, c, state, update, optionsFor, seats, seatName, available, notify } = p
  const options = optionsFor(person, dossier),
    first =
      options.find((x) => x.id === previousOffer?.seat) ||
      options.find((x) => x.id === dossier?.current?.seat) ||
      options.find((x) => !seats.find((s) => s.id === x.id)?.occupant) ||
      options[0]
  const earliest = (option) => [option?.available, addDays(c.date, 3)].filter(Boolean).sort().at(-1)
  const initialStart = [previousOffer?.start, earliest(first)].filter(Boolean).sort().at(-1)
  const seasonEnd = (day) => String(Number(day.slice(0, 4)) + 1) + '-01-01'
  const [seat, setSeat] = useState(first?.id || ''),
    [salary, setSalary] = useState(
      previousOffer?.salary_cents != null
        ? String(previousOffer.salary_cents / 100)
        : first?.ask_cents == null
          ? ''
          : String(first.ask_cents / 100),
    ),
    [bonus, setBonus] = useState(String((previousOffer?.bonus_cents || 0) / 100)),
    [start, setStart] = useState(initialStart),
    [end, setEnd] = useState(previousOffer?.end || seasonEnd(initialStart)),
    [quote, setQuote] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const supporting = !!seats.find((x) => x.id === seat)?.duty,
    driver = person.position === 'driver',
    selected = options.find((x) => x.id === seat),
    current = dossier?.current
  async function submit(e) {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.currentTarget))
    const problem = checkDateRange(v.start, v.end, addDays(c.date, 2))
    if (problem) return setError(problem)
    const salaryCents = Math.round(Number(v.salary) * 100),
      bonusCents = Math.round(Number(v.bonus) * 100)
    if (!salaryCents || salaryCents < 1 || !Number.isFinite(salaryCents) || bonusCents < 0)
      return setError('Проверьте месячный оклад и бонус.')
    if (
      state.offers.some(
        (x) =>
          x.person === person.id &&
          x.id !== previousOffer?.id &&
          ['sent', 'countered', 'agreed'].includes(x.status),
      )
    )
      return setError('С этим кандидатом уже открыты переговоры.')
    if (
      state.contracts.some(
        (x) => x.person === person.id && x.start > c.date && overlaps(v.start, v.end, x.start, x.end),
      )
    )
      return setError('На этот период уже подписан будущий договор сотрудника.')
    setError('')
    setBusy(true)
    const args = {
      person: person.id,
      seat: v.seat,
      start: v.start,
      end: v.end,
      salary_cents: salaryCents,
      bonus_cents: bonusCents,
      driver_status: driver && !supporting ? v.driver_status : undefined,
      combined_duties: v.combined === 'on',
      outside_starts: v.outside === 'on',
      remit: v.remit || 'standard',
    }
    let calculation
    try {
      const params = new URLSearchParams(
        Object.entries({
          seat: args.seat,
          start: args.start,
          end: args.end,
          salary_cents: salaryCents,
          ...(args.driver_status ? { driver_status: args.driver_status } : {}),
          combined_duties: args.combined_duties,
          outside_starts: args.outside_starts,
          remit: args.remit,
        }).map(([k, val]) => [k, String(val)]),
      )
      const r = await fetch('/api/careers/' + c.id + '/personnel/' + person.id + '/quote?' + params)
      if (!r.ok) throw Error('Расчёт исходной игры недоступен')
      calculation = await r.json()
    } catch (e) {
      setBusy(false)
      setError(explain(e))
      return
    }
    setQuote(calculation)
    setBusy(false)
    if (calculation.reason) return setError(calculation.reason)
    if ((calculation.buyout_cents || 0) + bonusCents > available)
      return setError('Выкуп и бонус превышают свободные средства организации.')
    if (await p.commit('offer-send', args, setError)) g.navigate('contracts', 'negotiations')
  }
  if (!first)
    return (
      <Empty
        title="Эта должность вне ваших полномочий"
        text={
          g.role === 'owner'
            ? 'Владелец назначает менеджера и персонал академии. Оперативный состав находится в зоне менеджера.'
            : 'В вашей организации нет доступного места этой профессии.'
        }
      />
    )
  const buyout = current?.org === c.org || !current ? 0 : (quote?.buyout_cents ?? current.buyout_cents)
  const now = Math.round(Number(bonus || 0) * 100) + (buyout || 0),
    type = driver ? 'driver' : person.position === 'manager' ? 'leadership' : 'staff'
  return (
    <form className="p-form p-employment-form" onSubmit={submit}>
      <ContractFrame
        type={type}
        title={
          driver
            ? 'Предложите место в следующей главе.'
            : person.position === 'manager'
              ? 'Доверьте организацию руководителю.'
              : 'Пригласите специалиста в команду.'
        }
        eyebrow={previousOffer ? 'Встречное предложение' : 'Проект договора'}
        person={person}
        subtitle={p.positionName(person.position) + ' · ' + p.orgName(person.org)}
        aside={
          <>
            <ContractImpact
              now={now}
              recurring={Math.round(Number(salary || 0) * 100)}
              after={available - now}
              rows={[
                ['Раскрытое ожидание', money(selected?.ask_cents)],
                ['Выкуп', buyout == null ? 'Требует расчёта' : money(buyout)],
                ['Ответ после', date(addDays(c.date, 1))],
              ]}
              note="Оклад обсуждается отдельно от поддержки пилота. Текущая работа продолжается до начала нового договора."
            />
            <p className="contract-source-badge">Решение о переходе ещё не принято</p>
          </>
        }
      >
        <ContractClause number={1} title={driver ? 'Место в составе' : 'Область ответственности'}>
          <div className="p-form-grid">
            <Field label="Должность и место" wide>
              <select
                name="seat"
                value={seat}
                onChange={(e) => {
                  setSeat(e.target.value)
                  const o = options.find((x) => x.id === e.target.value)
                  setSalary(o?.ask_cents == null ? '' : String(o.ask_cents / 100))
                  const day = earliest(o)
                  setStart(day)
                  if (end <= day) setEnd(seasonEnd(day))
                }}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {seatName(o.id)} · {seats.find((s) => s.id === o.id)?.occupant?.name || 'Вакантно'}
                  </option>
                ))}
              </select>
            </Field>
            {driver && !supporting && (
              <Field label="Спортивный статус" wide>
                <select
                  name="driver_status"
                  defaultValue={previousOffer?.driver_status || current?.driver_status || 'equal'}
                >
                  {Object.entries(sporting).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!driver && (
              <Field label="Профессиональные полномочия" wide>
                <select name="remit" defaultValue={previousOffer?.remit || 'standard'}>
                  <option value="standard">В рамках должности</option>
                  <option value="independent">Самостоятельное руководство</option>
                  <option value="supervised">Под контролем руководителя</option>
                </select>
              </Field>
            )}
            {driver && supporting && (
              <label className="p-check p-wide">
                <input type="checkbox" name="combined" defaultChecked={previousOffer?.combined_duties} />
                Совмещать резерв и испытания
              </label>
            )}
            {driver && (
              <label className="p-check p-wide">
                <input type="checkbox" name="outside" defaultChecked={previousOffer?.outside_starts} />
                Выступать в другой серии в свободные даты
              </label>
            )}
          </div>
        </ContractClause>
        <ContractClause number={2} title="Срок и вознаграждение">
          <div className="p-form-grid">
            <Field label="Начало работы" hint="До этой даты действует текущий состав.">
              <input
                required
                type="date"
                name="start"
                value={start}
                min={addDays(c.date, 2)}
                onInput={(e) => setStart(e.currentTarget.value)}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Окончание (исключая)">
              <input
                required
                type="date"
                name="end"
                value={end}
                onInput={(e) => setEnd(e.currentTarget.value)}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
            <Field label="Оклад в месяц, €">
              <input
                required
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                name="salary"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
            </Field>
            <Field label="Бонус за подписание, €">
              <input
                required
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                name="bonus"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </Field>
          </div>
        </ContractClause>
        <ContractClause number={3} title="Что меняется для кандидата">
          <ContractComparison
            rows={[
              ['Организация', p.orgName(current?.org || person.org), p.orgName(c.org)],
              [
                'Оклад / месяц',
                money(current?.salary_cents),
                money(Math.round(Number(salary || 0) * 100)),
              ],
              ['Начало работы', date(current?.start), date(start)],
              ['Конец договора', date(current?.end), date(end)],
            ]}
          />
        </ContractClause>
      </ContractFrame>
      <FormError error={error} />
      <FormActions
        submit={previousOffer ? 'Передать встречное предложение' : 'Передать предложение'}
        busy={busy}
        onCancel={g.closeDialog}
      />
    </form>
  )
}
function Academy() {
  const p = usePeople(),
    { c, g, scholarships, own, openForm, world } = p
  const academies = rows(c.academies),
    [selected, select] = useState(academies[0]?.id || '')
  const a = academies.find((x) => x.id === selected) || academies[0]
  return (
    <>
      <PageHeader
        eyebrow="Будущее организации / Академия"
        title="Талант требует системы"
        description="Финансирование места, программа развития и приоритет переговоров сохраняются отдельно от трудового договора."
        actions={
          g.role === 'owner' && a ? (
            <Button onClick={() => openForm('Принять пилота в академию', <FundingForm academy={a} />)}>
              Новый воспитанник
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => g.navigate('market')}>
              Молодые пилоты
            </Button>
          )
        }
      />
      {a ? (
        <>
          {academies.length > 1 && (
            <Tabs
              items={academies.map((x) => ({ id: x.id, label: x.name }))}
              value={a.id}
              onChange={select}
            />
          )}
          <div className="p-academy-hero">
            <span className="p-kicker">Программа развития</span>
            <h2>{a.name}</h2>
            <div className="p-academy-metrics">
              <span>
                <small>Бюджет программы</small>
                <strong>{money(a.budget_cents, true)}</strong>
              </span>
              <span>
                <small>Зарезервировано</small>
                <strong>
                  {money(
                    scholarships
                      .filter((s) => s.academy === a.id && s.end > c.date)
                      .reduce((sum, s) => sum + (s.reserved_cents || 0), 0),
                    true,
                  )}
                </strong>
              </span>
              <span>
                <small>Выплачено за места</small>
                <strong>{money(a.spent_cents, true)}</strong>
              </span>
              <span>
                <small>Действующих договоров</small>
                <strong>
                  {scholarships.filter((s) => s.academy === a.id && s.end > c.date).length}
                </strong>
              </span>
            </div>
          </div>
          <div className="p-academy-layout">
            <Section
              title="Воспитанники"
              sub="Откройте досье, чтобы увидеть подтверждённую историю, поддержку и условия опциона."
            >
              <div className="p-scholarship-list">
                {scholarships
                  .filter((s) => s.academy === a.id)
                  .map((s) => (
                    <ScholarshipCard key={s.id} scholarship={s} />
                  ))}
              </div>
              {!scholarships.some((s) => s.academy === a.id) && (
                <Empty
                  title="Первый договор — начало программы"
                  text="Выберите пилота, проверьте бюджет и срок поддержки. Академический договор не назначает его автоматически на гоночное место."
                  action={
                    g.role === 'owner' && (
                      <Button
                        onClick={() =>
                          openForm('Принять пилота в академию', <FundingForm academy={a} />)
                        }
                      >
                        Выбрать воспитанника
                      </Button>
                    )
                  }
                />
              )}
            </Section>
            <Section title="Команда академии">
              {p.seats
                .filter((s) => s.academy === a.id)
                .map((s) =>
                  s.occupant ? (
                    <PersonRow key={s.id} p={own.find((x) => x.id === s.occupant.id) || s.occupant} />
                  ) : (
                    <div className="p-vacancy" key={s.id}>
                      <Icon name="UserRoundPlus" />
                      <span>
                        {p.positionName(s.position)}
                        <small>Вакансия</small>
                      </span>
                      <Button variant="secondary" onClick={() => g.navigate('market')}>
                        Найти
                      </Button>
                    </div>
                  ),
                )}
              <div className="p-callout">
                <Icon name="GraduationCap" />
                <p>
                  Руководитель отвечает за доступный лимит финансирования. Тренеры и аналитики работают с
                  фактическими событиями и наблюдениями.
                </p>
              </div>
              <Button variant="secondary" onClick={() => g.navigate('preparation')}>
                Программа подготовки
                <Icon name="ArrowUpRight" />
              </Button>
            </Section>
          </div>
        </>
      ) : (
        <Empty
          title={
            g.role === 'manufacturer'
              ? 'Поддержка идёт через клиентов'
              : 'Собственная академия не заявлена'
          }
          text={
            g.role === 'manufacturer'
              ? 'Производитель финансирует пилотов по договорам клиентских команд.'
              : 'Доступные академические договоры конкретного пилота показаны в его досье. Создание новой программы не представлено командой этого экрана.'
          }
          action={
            <Button onClick={() => g.navigate(g.role === 'manufacturer' ? 'funding' : 'market')}>
              {g.role === 'manufacturer' ? 'Поддержка пилотов' : 'Кадровый рынок'}
            </Button>
          }
        />
      )}
    </>
  )
}
function ScholarshipCard({ scholarship: s }) {
  const p = usePeople(),
    { g, c, state, scholarships, funds, update, notify } = p
  const person = p.people.find((x) => x.id === s.person),
    academy = c.academies?.find((x) => x.id === s.academy),
    own = (s.org || academy?.org) === c.org,
    active = s.start <= c.date && s.end > c.date
  function right() {
    g.confirm({
      title: own ? 'Использовать опцион академии?' : 'Запросить окно переговоров?',
      description: p.name(s.person) + ' · ' + p.orgName(s.org),
      confirmLabel: own ? 'Продлить договор' : 'Передать запрос',
      onConfirm: () => p.run('academy-right', { agreement: s.id }),
    })
  }
  return (
    <article className="p-scholarship">
      {person ? (
        <PersonRow p={person} secondary={s.name || academy?.name || 'Академическая программа'} />
      ) : (
        <h3>{p.name(s.person)}</h3>
      )}
      <Facts
        items={[
          ['Срок', date(s.start) + ' — ' + date(s.end)],
          [
            'Опцион',
            s.exercised ? 'Использован' : s.option ? '+' + s.option_days + ' дней' : 'Без опциона',
          ],
          ['Переговоры', s.priority ? 'Приоритет академии' : 'Открытые'],
          ['Резерв', money(s.reserved_cents)],
        ]}
      />
      {s.priority_until && <p className="p-muted">Окно академии до {date(s.priority_until)}</p>}
      <div className="p-inline-actions">
        <Button variant="secondary" onClick={() => g.openPerson(s.person, 'career')}>
          Развитие и история
        </Button>
        {active &&
          ((own && ['owner', 'manager'].includes(g.role) && s.option && !s.exercised) ||
            (!own && g.role === 'manager' && s.priority && !s.priority_until)) && (
            <Button onClick={right}>{own ? 'Использовать опцион' : 'Запросить окно переговоров'}</Button>
          )}
      </div>
    </article>
  )
}
function Funding() {
  const p = usePeople(),
    { g, funds, c, openForm } = p
  const tab = g.tab || 'active',
    display = funds.filter((f) => tab === 'all' || (f.status === 'active' && f.end > c.date))
  const total = funds
    .filter((f) => f.status === 'active' && f.end > c.date)
    .reduce((n, f) => n + (f.monthly_cents || 0), 0)
  return (
    <>
      <PageHeader
        eyebrow="Пилоты / Договоры поддержки"
        title="Возможность выйти на старт"
        description="Кто оплачивает место, куда идут деньги и что происходит при переходе пилота."
        actions={
          g.role === 'manufacturer' ? (
            <Button onClick={() => openForm('Поддержать пилота клиента', <FundingForm />)}>
              Новый договор поддержки
            </Button>
          ) : g.role === 'owner' && c.academies?.length ? (
            <Button onClick={() => g.navigate('academy')}>Академические программы</Button>
          ) : undefined
        }
      />
      <div className="p-funding-intro">
        <div>
          <span className="p-kicker">Доступные вашей роли договоры</span>
          <strong>
            {money(total, true)}
            <small>/ месяц</small>
          </strong>
        </div>
        <p>
          Взнос перечисляется команде за дни действующего места. Оклад выплачивается пилоту по отдельному
          трудовому договору. Перенос, гарантия и компенсация определяются договором.
        </p>
      </div>
      <Tabs
        items={[
          { id: 'active', label: 'Действующие' },
          { id: 'all', label: 'Все доступные договоры' },
        ]}
        value={tab}
        onChange={(v) => g.navigate('funding', v)}
      />
      <div className="p-funding-grid">
        {display.map((f) => (
          <FundingCard key={f.id} fund={f} />
        ))}
      </div>
      {!display.length && (
        <Empty
          title="Нет доступных договоров в этой выборке"
          text="Поддержка конкретного пилота может быть раскрыта в его досье. Чужие закрытые финансовые условия не показываются в общем реестре."
          icon="Handshake"
          action={
            <Button variant="secondary" onClick={() => g.navigate('market')}>
              Открыть каталог пилотов
            </Button>
          }
        />
      )}
    </>
  )
}
function FundingCard({ fund: f, dossier }) {
  const p = usePeople(),
    { g, c, state, update, spend, notify } = p,
    person = p.people.find((x) => x.id === f.person),
    currentOrg = dossier?.current?.org || person?.org
  const canEnd =
    f.status === 'active' &&
    f.end > c.date &&
    (f.source === 'academy'
      ? f.payer === c.org && g.role === 'owner'
      : (f.payer === c.org && g.role === 'manufacturer') ||
        (currentOrg === c.org && g.role === 'manager' && (f.portable || f.team === c.org)))
  function end() {
    if (f.exit_cents == null)
      return g.notify('Расчёт компенсации пока не раскрыт. Завершение недоступно без суммы.', 'warning')
    g.confirm({
      title: 'Прекратить поддержку ' + p.name(f.person) + '?',
      description:
        'Компенсация при прекращении: ' +
        money(f.exit_cents) +
        '. Дальнейшие взносы по этому договору прекратятся.',
      confirmLabel: 'Прекратить поддержку',
      danger: true,
      onConfirm: () => p.run('funding-end', { agreement: f.id }),
    })
  }
  return (
    <article className="p-funding-card">
      <header>
        <span className="p-kicker">{fundingSources[f.source] || 'Договор поддержки'}</span>
        <Status value={f.end <= c.date ? 'ended' : f.status} />
      </header>
      {person && <PersonRow p={person} secondary={p.orgName(f.payer)} />}
      <div className="p-funding-amount">
        {money(f.monthly_cents)}
        <small>/ месяц</small>
      </div>
      <div className="p-funding-direction">
        <span>
          {p.orgName(f.payer) === 'Организация' ? fundingSources[f.source] : p.orgName(f.payer)}
        </span>
        <Icon name="ArrowRight" />
        <span>{f.portable ? 'Действующая команда' : p.orgName(f.team)}</span>
      </div>
      <Facts
        items={[
          ['Период', date(f.start) + ' — ' + date(f.end)],
          ['Гарантия места', f.guarantee ? 'Гарантировано' : 'Оплата за участие'],
          ['При переходе', f.portable ? 'Поддержка следует за пилотом' : 'Только исходная команда'],
          ['Компенсация прекращения', f.exit_cents == null ? 'Требуется расчёт' : money(f.exit_cents)],
          f.paid_cents != null && ['Выплачено', money(f.paid_cents)],
          f.arrears && ['Просрочено', money(Object.values(f.arrears).reduce((n, a) => n + a, 0))],
          f.minimum_starts > 0 && [
            'Условие продолжения',
            f.minimum_starts + ' стартов за 90 дней' + (f.best_place ? ' · топ-' + f.best_place : ''),
          ],
        ]}
      />
      {f.reason && <p className="p-muted">{f.reason}</p>}
      {canEnd && (
        <Button variant="secondary" onClick={end}>
          Прекратить поддержку
        </Button>
      )}
    </article>
  )
}
function FundingForm({ academy, person: initialPerson }) {
  const p = usePeople(),
    { g, c, people, clients, scholarships, funds, update, notify, available, own, world } = p
  const [query, setQuery] = useState(initialPerson?.name || ''),
    [selected, setSelected] = useState(initialPerson?.id || ''),
    [monthly, setMonthly] = useState('1000'),
    [end, setEnd] = useState(String(Number(c.date.slice(0, 4))) + '-12-31'),
    [error, setError] = useState(''),
    [review, setReview] = useState(false),
    [completed, setCompleted] = useState(null)
  const candidate = people.find((x) => x.id === selected) || initialPerson,
    candidates = people
      .filter(
        (x) =>
          x.position === 'driver' &&
          [x.name, p.orgName(x.org)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      )
      .slice(0, 12),
    recipientOrgs = [
      ...new Set((academy ? Object.values(world.entries || {}) : clients).map((x) => x.org)),
    ]
  const [recipient, setRecipient] = useState(
    academy
      ? ''
      : recipientOrgs.includes(initialPerson?.org)
        ? initialPerson.org
        : recipientOrgs[0] || '',
  )
  const candidateDossier = useDossier(selected || initialPerson?.id || '')
  const dossierReady = candidateDossier.data || g.game.dossiers?.[candidate?.id]
  const obligation = Math.ceil(
    (Math.max(0, Number(monthly) * 100) * Math.max(0, daySpan(c.date, end))) / 28,
  )
  function submit(e) {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.currentTarget)),
      amount = Math.round(Number(v.monthly) * 100),
      until = v.end
    if (!candidate || candidate.position !== 'driver')
      return setError('Выберите пилота из результатов поиска.')
    if (!(amount > 0) || until <= c.date) return setError('Проверьте сумму и срок финансирования.')
    if (!dossierReady)
      return setError(
        'Подождите загрузки публичного досье: нужно проверить действующие договоры пилота.',
      )
    if (!review) {
      setError('')
      setReview(true)
      return
    }
    p.commit(
      academy ? 'academy-enroll' : 'manufacturer-backing',
      {
        person: candidate.id,
        monthly_cents: amount,
        end: until,
        ...(v.recipient ? { recipient: v.recipient } : {}),
        ...(academy
          ? { academy: academy.id, option: v.option === 'on', priority: v.priority === 'on' }
          : { portable: v.portable === 'on', guarantee: v.guarantee === 'on' }),
      },
      setError,
    )
  }
  return (
    <form
      className="p-form p-employment-form"
      onSubmit={submit}
      onChange={() => review && setReview(false)}
    >
      <ContractFrame
        type={academy ? 'academy' : 'funding'}
        title={academy ? 'Инвестиция в путь молодого пилота.' : 'Помогите таланту получить возможность.'}
        person={candidate}
        eyebrow={academy ? academy.name : 'Программа производителя'}
        aside={
          <ContractImpact
            recurring={Math.round(Number(monthly) * 100)}
            rows={[
              ['Резерв на срок', academy ? money(obligation) : 'Не резервируется этим договором'],
              ['Начало', date(c.date)],
              ['Окончание', date(end)],
            ]}
            note={
              academy
                ? 'Лимит зависит от бюджета академии и навыка её директора. Опцион и приоритет не заменяют трудовой договор.'
                : 'Получатель — действующая команда клиента. Гарантия проверяется по раскрытому трудовому договору.'
            }
          />
        }
      >
        <ContractClause number={1} title={academy ? 'Воспитанник' : 'Пилот и команда получателя'}>
          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v)
              if (v !== candidate?.name) setSelected('')
            }}
            label="Найти пилота для поддержки"
            placeholder="Имя пилота или команда"
          />
          <div className="p-candidate-picker">
            {candidates.map((x) => (
              <button
                type="button"
                key={x.id}
                className={selected === x.id ? 'selected' : ''}
                aria-pressed={selected === x.id}
                onClick={() => {
                  setSelected(x.id)
                  setQuery(x.name)
                  if (!academy && recipientOrgs.includes(x.org)) setRecipient(x.org)
                }}
              >
                <span className="p-mini-photo">
                  <PersonPortrait person={x} role="driver" />
                </span>
                <span>
                  <b>{x.name}</b>
                  <small>
                    {x.age} лет · {p.orgName(x.org)}
                  </small>
                </span>
                <strong>{x.rating}</strong>
              </button>
            ))}
          </div>
        </ContractClause>
        <ContractClause
          number={2}
          title={academy ? 'Обязательства академии и её права' : 'Финансирование и условия выхода'}
        >
          <div className="p-form-grid">
            <Field label="Команда — получатель взносов" wide>
              <select name="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                {academy && <option value="">Действующая команда воспитанника</option>}
                {recipientOrgs.map((id) => (
                  <option key={id} value={id}>
                    {p.orgName(id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Взнос в месяц, €">
              <input
                type="number"
                name="monthly"
                min="1"
                max="100000000"
                required
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
            </Field>
            <Field label="До даты (исключая)">
              <input
                type="date"
                name="end"
                required
                value={end}
                onInput={(e) => setEnd(e.currentTarget.value)}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
            {academy ? (
              <>
                <label className="p-check">
                  <input name="priority" type="checkbox" defaultChecked />
                  Приоритет переговоров
                </label>
                <label className="p-check">
                  <input name="option" type="checkbox" defaultChecked />
                  Опцион академии +90 дней
                </label>
              </>
            ) : (
              <>
                <label className="p-check">
                  <input name="guarantee" type="checkbox" />
                  Гарантия места
                </label>
                <label className="p-check">
                  <input name="portable" type="checkbox" defaultChecked />
                  Перенос при трансфере
                </label>
              </>
            )}
          </div>
        </ContractClause>
        <div className="p-contract-preview">
          <Facts
            items={[
              ['Месячный взнос', money(Math.round(Number(monthly) * 100))],
              ...(academy ? [['Резерв на срок договора', money(obligation)]] : []),
              ['Получатель', 'Гоночная команда'],
              ['Оклад пилота', 'Отдельный трудовой договор'],
            ]}
          />
          <p>
            {academy
              ? 'Опцион и приоритет сохраняют права академии на обсуждение будущего воспитанника. Назначение на гоночное место оформляется отдельным трудовым договором; резерв рассчитывается на весь срок поддержки.'
              : 'Договор поддержки не назначает пилота на гоночное место. При гарантии места компенсация прекращения равна одному месячному взносу. Без гарантии компенсация не начисляется.'}
          </p>
        </div>
      </ContractFrame>
      {review && (
        <ContractSigningSummary
          type={academy ? 'academy' : 'funding'}
          person={candidate}
          start={c.date}
          end={end}
          rows={[
            ['Взнос / месяц', money(Math.round(Number(monthly) * 100))],
            ...(academy ? [['Зарезервировано', money(obligation)]] : []),
          ]}
          note="Условия проверены. Подтвердите создание обязательства; изменение поля вернёт вас к проверке."
        />
      )}
      <FormError error={error || candidateDossier.error} />
      {candidateDossier.error && (
        <Button variant="secondary" onClick={candidateDossier.retry}>Повторить загрузку досье</Button>
      )}
      <FormActions
        disabled={Boolean(candidate && !dossierReady)}
        submit={
          candidateDossier.loading
            ? 'Загружаем договоры пилота…'
            : review ? 'Подписать соглашение' : 'Проверить перед подписью'
        }
        onCancel={g.closeDialog}
      />
    </form>
  )
}
function Preparation() {
  const p = usePeople(),
    { g, c, state, openForm } = p
  const options = rows(c.preparation_options),
    jobs = c.preparations
  return (
    <>
      <PageHeader
        eyebrow="Подготовка / Работа штаба"
        title="Готовность создаётся заранее"
        description="Утвердите время и ресурсы. Усталость, календарь и занятость ограничивают доступность программы."
      />
      <div className="p-prep-options">
        {options.map((o) => {
          const occupied = jobs.some((r) => r.kind === o.id && r.status === 'scheduled')
          return (
            <article key={o.id}>
              <Icon
                name={
                  {
                    simulator: 'Gamepad2',
                    fitness: 'Activity',
                    'pit-drill': 'Timer',
                    academy: 'GraduationCap',
                    debrief: 'MessagesSquare',
                    'bench-test': 'Gauge',
                  }[o.id] || 'Calendar'
                }
                size={28}
              />
              <span className="p-kicker">{o.facility}</span>
              <h2>{o.name}</h2>
              <div className="p-prep-price">
                <strong>{money(o.cost)}</strong>
                <span>
                  {o.days} дн. · нагрузка +{o.load}
                </span>
              </div>
              <Button
                variant={occupied ? 'secondary' : 'primary'}
                disabled={occupied}
                onClick={() => openForm(o.name, <PreparationForm kind={o.id} />)}
              >
                {occupied ? 'Слот занят' : 'Утвердить программу'}
              </Button>
            </article>
          )
        })}
      </div>
      <Section
        title="Расписание и результаты"
        sub="Рост навыков появляется только из подтверждённого результата."
      >
        {jobs.length ? (
          <div className="p-prep-schedule">
            {jobs
              .slice()
              .reverse()
              .map((r) => (
                <article key={r.id}>
                  <div className="p-date-block">
                    <b>{new Date(r.start + 'T12:00:00Z').getUTCDate()}</b>
                    <small>
                      {new Date(r.start + 'T12:00:00Z').toLocaleDateString('ru-RU', { month: 'short' })}
                    </small>
                  </div>
                  <div>
                    <h3>{options.find((o) => o.id === r.kind)?.name || r.kind}</h3>
                    <p>
                      {date(r.start)} — {date(r.end)}
                    </p>
                    <small>{rows(r.names).join(' · ') || 'Участники определяются штабом'}</small>
                  </div>
                  <Status value={r.status} />
                </article>
              ))}
          </div>
        ) : (
          <Empty
            title="Рабочее окно открыто"
            text="Выберите программу выше. На первом шаге видны цена, срок, нагрузка и участники."
            icon="CalendarDays"
          />
        )}
      </Section>
    </>
  )
}
function PreparationForm({ kind, participant }) {
  const p = usePeople(),
    { g, c, own, state, update, spend, notify } = p,
    option = c.preparation_options.find((x) => x.id === kind)
  const [chosen, choose] = useState(participant || ''),
    [error, setError] = useState('')
  if (!option)
    return (
      <Empty
        title="Программа недоступна"
        text="Этот вид подготовки не входит в полномочия текущей роли."
      />
    )
  const end = addDays(c.date, option.days),
    selected = own.find((x) => x.id === chosen),
    selectedData = selected && g.game.dossiers?.[selected.id],
    jobs = c.preparations
  function submit(e) {
    e.preventDefault()
    p.commit('prepare-program', { kind, ...(chosen ? { participant: chosen } : {}) }, setError)
  }
  return (
    <form className="p-form" onSubmit={submit}>
      <div className="p-callout">
        <Icon name="CalendarDays" size={30} />
        <div>
          <b>{option.facility}</b>
          <p>
            {date(c.date)} — {date(end)}
          </p>
        </div>
      </div>
      {kind === 'simulator' && (
        <Field label="Участник">
          <select value={chosen} onChange={(e) => choose(e.target.value)}>
            <option value="">Штаб выберет доступных пилотов</option>
            {own
              .filter((x) => x.position === 'driver')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Facts
        items={[
          ['Длительность', option.days + ' дней'],
          ['Стоимость', money(option.cost)],
          ['Нагрузка участника', '+' + option.load],
          ['Свободные средства', money(p.available)],
          ['Результат', 'Подтверждённый протокол после выполнения'],
        ]}
      />
      <p className="p-muted">
        Резервирование не повышает навыки само по себе. Результат работы и профессиональный опыт остаются
        отдельными фактами.
      </p>
      <FormError error={error} />
      <FormActions submit="Утвердить время и бюджет" onCancel={g.closeDialog} />
    </form>
  )
}
function Leadership() {
  const p = usePeople(),
    { g, c, state, people, openForm } = p,
    mandate = c.mandate,
    manager = people.find((x) => x.id === mandate?.manager),
    owner = people.find((x) => x.id === mandate?.owner)
  return (
    <>
      <PageHeader
        eyebrow="Организация / Руководство"
        title={g.role === 'owner' ? 'Направление задаёте вы' : 'Цели, ответственность и доверие'}
        description="Мандат связывает решения команды с ожиданиями владельца. Оперативное управление остаётся у менеджера."
        actions={
          g.role === 'owner' && mandate?.manager ? (
            <Button onClick={() => openForm('Мандат менеджера', <MandateForm />)}>
              Изменить мандат
            </Button>
          ) : undefined
        }
      />
      {mandate ? (
        <div className="p-leadership-layout">
          <div className="p-manager-feature">
            {manager ? (
              <PersonCard person={manager} featured subtitle="Менеджер организации" />
            ) : (
              <Empty
                title="Должность менеджера вакантна"
                text="Сначала заключите трудовой договор на место менеджера."
                action={<Button onClick={() => g.navigate('market')}>Найти менеджера</Button>}
              />
            )}
            {owner && <PersonRow p={owner} secondary="Владелец организации" />}
          </div>
          <div className="p-mandate">
            <span className="p-kicker">Действующий мандат</span>
            <h2>{goals[mandate.goal] || mandate.goal}</h2>
            <div className="p-mandate-top">
              <Badge tone="warning">
                {mandate.priority === 'required' ? 'Обязательная цель' : 'Желательная цель'}
              </Badge>
              <span>{horizons[mandate.horizon]}</span>
            </div>
            <p className="p-manager-response">
              «{mandate.response || 'Позиция менеджера будет сформулирована после обсуждения.'}»
            </p>
            <Facts
              items={[
                ['Лимит месячного оклада', money(mandate.limit_cents)],
                ['Автономия', mandate.autonomy + ' /100'],
                ['Доверие', mandate.trust + ' /100'],
                ['Удовлетворённость', mandate.satisfaction + ' /100'],
              ]}
            />
            <Meter value={mandate.autonomy} label="Автономия менеджера" />
            <p className="p-muted">
              Владелец задаёт цель и границы. Менеджер выбирает состав, рабочие приоритеты и исполнение в
              пределах мандата.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-callout">
          <Icon name="Factory" size={32} />
          <div>
            <h3>Управление производителем</h3>
            <p>
              Техническое руководство, клиентская служба и коммерческий отдел подчинены вашей
              организации. Мандат владельца гоночной команды к этой роли не применяется.
            </p>
            <Button variant="secondary" onClick={() => g.navigate('staff')}>
              Руководители направлений
            </Button>
          </div>
        </div>
      )}
      <Section title="История управленческих решений">
        {rows(mandate?.history).length ? (
          rows(mandate.history)
            .slice()
            .reverse()
            .map((h, i) => (
              <article className="p-history-line" key={h.date + i}>
                <time>{date(h.date)}</time>
                <div>
                  <b>{goals[h.goal] || h.goal}</b>
                  <p>{h.response}</p>
                  {h.autonomy != null && (
                    <small>
                      Автономия {h.autonomy} · {horizons[h.horizon]}
                    </small>
                  )}
                </div>
              </article>
            ))
        ) : (
          <p className="p-muted">
            Новые изменения мандата будут записаны здесь вместе с датой и позицией менеджера.
          </p>
        )}
      </Section>
      {c.academies?.length > 0 && (
        <div className="p-bottom-band">
          <Icon name="GraduationCap" size={30} />
          <div>
            <h3>Долгосрочное развитие людей</h3>
            <p>{c.academies.map((a) => a.name).join(' · ')}</p>
          </div>
          <Button variant="secondary" onClick={() => g.navigate('academy')}>
            Академия
          </Button>
        </div>
      )}
    </>
  )
}
function MandateForm() {
  const p = usePeople(),
    { g, c, state, update, notify } = p,
    m = c.mandate
  const [error, setError] = useState('')
  function submit(e) {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.currentTarget)),
      patch = {
        goal: v.goal,
        priority: v.priority,
        horizon: v.horizon,
        autonomy: Number(v.autonomy),
        limit_cents: Math.round(Number(v.limit) * 100),
      }
    if (patch.limit_cents > p.available)
      return setError('Лимит превышает свободные средства организации.')
    if (Object.entries(patch).every(([k, val]) => m[k] === val))
      return setError('Этот мандат уже действует.')
    p.commit('manager-mandate', patch, setError)
  }
  return (
    <form className="p-form p-employment-form" onSubmit={submit}>
      <ContractFrame
        type="leadership"
        title="Цель. Ресурсы. Доверие."
        person={p.people.find((x) => x.id === m.manager)}
        eyebrow="Решение собственника"
        aside={
          <ContractImpact
            title="Действующий мандат"
            rows={[
              ['Цель', goals[m.goal]],
              ['Автономия', m.autonomy + ' / 100'],
              ['Лимит оклада', money(m.limit_cents)],
              ['Доверие', m.trust + ' / 100'],
            ]}
            note="Собственник меняет рамки, менеджер выбирает оперативные действия. Доверие не пересчитывается интерфейсом."
          />
        }
      >
        <ContractClause number={1} title="Новый мандат">
          <p className="contract-note">
            {p.name(m.manager)} получит новые приоритеты. Доверие и удовлетворённость сохраняют последнее
            подтверждённое значение до ответа.
          </p>
          <div className="p-form-grid">
            <Field label="Цель" wide>
              <select name="goal" defaultValue={m.goal}>
                {Object.entries(goals).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Горизонт">
              <select name="horizon" defaultValue={m.horizon}>
                {Object.entries(horizons).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Приоритет">
              <select name="priority" defaultValue={m.priority}>
                <option value="required">Обязательно</option>
                <option value="desired">Желательно</option>
              </select>
            </Field>
            <Field label="Лимит месячного оклада, €">
              <input
                name="limit"
                required
                type="number"
                min="0"
                step="0.01"
                defaultValue={m.limit_cents / 100}
              />
            </Field>
            <Field label="Автономия, 0–100">
              <input
                name="autonomy"
                type="number"
                min="0"
                max="100"
                required
                defaultValue={m.autonomy}
              />
            </Field>
          </div>
        </ContractClause>
      </ContractFrame>
      <FormError error={error} />
      <FormActions submit="Передать мандат" onCancel={g.closeDialog} />
    </form>
  )
}
function Dossier({ personId }) {
  const p = usePeople(),
    { g, state, own, toggleShortlist, openForm, c } = p
  const [wet, setWet] = useState(false)
  const result = useDossier(personId, wet),
    data = result.data,
    person = {
      ...result.candidate,
      ...data?.person,
      rating: data?.profile?.rating ?? result.candidate?.rating,
      org: data?.current?.org ?? result.candidate?.org,
      age: data?.age ?? result.candidate?.age,
    }
  const alias = {
      overview: 'profile',
      media: 'public',
      teamwork: 'work',
      terms: 'contract',
      backing: 'support',
    },
    tab = alias[g.tab] || g.tab || 'profile'
  const fallback = person.org === c.org ? 'people' : 'market'
  useEffect(() => {
    function closeDossier(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]')) return
      g.leaveDossier(fallback)
    }
    document.addEventListener('keydown', closeDossier)
    return () => document.removeEventListener('keydown', closeDossier)
  }, [g.leaveDossier, fallback])
  if (!person.id)
    return (
      <Empty
        title="Человек не найден в доступном каталоге"
        text="Вернитесь в кадровый рынок и выберите сотрудника по имени."
        action={<Button onClick={() => g.navigate('market')}>Открыть рынок</Button>}
      />
    )
  return (
    <>
      <div className="p-file-breadcrumb">
        <button type="button" onClick={() => g.leaveDossier(fallback)}>
          <Icon name="ArrowLeft" size={16} />
          {g.hasDossierSource ? 'К списку' : person.org === c.org ? 'Команда и люди' : 'Кадровый рынок'}
        </button>
        <span>{p.positionName(person.position)} / Досье</span>
      </div>
      <header className="p-dossier-hero">
        <div className="p-dossier-photo">
          <PersonPortrait person={person} role={person.position} />
          {person.rating != null && (
            <span className="p-dossier-rating">
              <b>{Math.round(person.rating)}</b>
              <small>рейтинг</small>
            </span>
          )}
        </div>
        <div className="p-dossier-title">
          <span className="p-kicker">
            {p.positionName(person.position)} · <CountryFlag id={person.country} countries={p.world.countries} /> {person.country?.toUpperCase()}
          </span>
          <h1>{person.name}</h1>
          <button className="p-org-link" onClick={() => person.org && g.openOrganization(person.org)}>
            {p.orgName(person.org)}
            {person.org && <Icon name="ArrowUpRight" size={16} />}
          </button>
          <div className="p-person-facts">
            <span>{person.age} лет</span>
            <span>
              {person.specialization || result.candidate?.specialty || 'Профильный специалист'}
            </span>
            {person.experience != null && <span>{person.experience} лет опыта</span>}
          </div>
        </div>
        <div className="p-file-actions">
          {p.optionsFor(person, data).length > 0 ? (
            <Button
              onClick={() =>
                openForm(
                  'Предложение · ' + person.name,
                  <NegotiationForm person={person} dossier={data} />,
                )
              }
            >
              {data?.current?.org === c.org ? 'Обсудить договор' : 'Предложить контракт'}
            </Button>
          ) : (
            <span className="p-contract-authority">
              {g.role === 'owner' && person.position === 'driver'
                ? 'Трудовой договор — полномочие менеджера'
                : g.role === 'manufacturer' && person.position === 'driver'
                  ? 'Состав назначает клиентская команда'
                  : 'Нет должности в ваших полномочиях'}
            </span>
          )}
          <Button
            variant="secondary"
            aria-pressed={state.shortlist.includes(person.id)}
            onClick={() => toggleShortlist(person.id)}
          >
            <Icon name="Bookmark" />
            {state.shortlist.includes(person.id) ? 'В избранном' : 'Избранное'}
          </Button>
        </div>
        <aside className="p-dossier-condition">
          <span>
            <small>Мораль</small>
            <b>{percent(person.morale)}</b>
            <Meter value={person.morale} label="Мораль" />
          </span>
          <span>
            <small>Усталость</small>
            <b>{percent(person.fatigue)}</b>
            <Meter value={person.fatigue} label="Усталость" tone="warning" />
          </span>
          <span>
            <small>Потенциал</small>
            <b>{potential(data)}</b>
          </span>
        </aside>
      </header>
      <Tabs
        items={fileTabs.filter((x) => x.id !== 'support' || person.position === 'driver')}
        value={tab}
        onChange={(v) => g.navigate('person', v, personId)}
      />
      {result.loading && (
        <p className="p-loading" role="status">
          Загружаем подробное досье…
        </p>
      )}
      {result.error && (
        <div className="p-callout">
          <p>{result.error}</p>
          <Button variant="secondary" onClick={result.retry}>
            Повторить загрузку
          </Button>
        </div>
      )}
      {tab === 'profile' ? (
        <Profile person={person} data={data} wet={wet} setWet={setWet} />
      ) : tab === 'career' ? (
        <CareerFile person={person} data={data} />
      ) : tab === 'statistics' ? (
        <EntityStatistics type={person.position === 'driver' ? 'drivers' : 'staff'} id={person.id} />
      ) : tab === 'public' ? (
        <PublicProfile person={person} data={data} />
      ) : tab === 'work' ? (
        <WorkProfile person={person} data={data} />
      ) : tab === 'compare' ? (
        <Comparison person={person} data={data} />
      ) : tab === 'contract' ? (
        <PersonContract person={person} data={data} />
      ) : (
        <PersonSupport person={person} data={data} />
      )}
    </>
  )
}
function potential(data) {
  return data?.person?.potential != null
    ? String(data.person.potential)
    : data?.reports?.length
      ? data.reports.at(-1).low + '–' + data.reports.at(-1).high
      : 'Неизвестен'
}
function Profile({ person, data, wet, setWet }) {
  const { world } = usePeople()
  const skills = world.positions?.[person.position]?.skills || Object.keys(person.skills || {}),
    traits = rows(data?.profile?.traits)
  return (
    <div className="p-profile-layout">
      <Section
        title="Профессиональный профиль"
        eyebrow="Навыки / 0–100"
        sub="База и эффективное значение различаются. Состояние, освоенность и активные трейты меняют результат."
        action={
          person.position === 'driver' && (
            <label className="p-check">
              <input type="checkbox" checked={wet} onChange={(e) => setWet(e.target.checked)} />
              Мокрая трасса
            </label>
          )
        }
      >
        <div className="p-skill-list">
          {skills.map((k) => (
            <div key={k}>
              <span>
                <b>{k}</b>
                <small>
                  {data?.profile?.weights?.[k] != null
                    ? 'Вес ×' + data.profile.weights[k]
                    : 'Профиль должности'}
                </small>
              </span>
              <div className="p-skill-bar">
                <Meter value={data?.profile?.values?.[k] ?? person.skills?.[k]} label={k} />
                <span>
                  {person.skills?.[k] ?? '—'}
                  <Icon name="ArrowRight" size={13} />
                  <strong>{data?.profile?.values?.[k] ?? '—'}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
        {!skills.length && (
          <p className="p-muted">
            Подробный профиль появится после загрузки досье. Рейтинг каталога не заменяет отдельные
            навыки.
          </p>
        )}
        <Facts
          items={[
            ['Поправка состояния', data?.profile?.readiness],
            ['Освоенность дисциплины', data?.profile?.familiarity],
            ['Специализация', person.specialization],
          ]}
        />
      </Section>
      <div>
        <Section title="Особенности человека" eyebrow="Трейты и условия">
          <div className="p-traits">
            {traits.map((t) => (
              <article key={t.id} className={t.active ? 'active' : ''}>
                <Icon name={t.delta > 0 ? 'TrendingUp' : t.delta < 0 ? 'TrendingDown' : 'Sparkles'} />
                <div>
                  <strong>{t.name}</strong>
                  <small>
                    {t.active ? 'Действует' : 'Вне условий'} · {t.condition}
                  </small>
                  <p>
                    {t.skill} · {t.delta > 0 ? '+' : ''}
                    {t.delta}
                    {t.end && ' · до ' + date(t.end)}
                  </p>
                </div>
              </article>
            ))}
          </div>
          {!traits.length && (
            <p className="p-muted">В доступном профиле нет раскрытых активных особенностей.</p>
          )}
        </Section>
        {person.management && (
          <Section title="Управленческий стиль">
            <h3>{goals[person.management.style]}</h3>
            <Facts
              items={[
                ['Финансовая дисциплина', person.management.discipline],
                ['Предпочтение молодых', person.management.youth],
                ['Профильные специалисты', person.management.specialists],
                ['Амбиции', person.ambition],
              ]}
            />
          </Section>
        )}
        <div className="p-profile-summary">
          <span className="p-kicker">Человек, не одно число</span>
          <p>
            Общий рейтинг помогает ориентироваться. Решение о найме опирается на конкретные навыки,
            личный опыт, условия и совместимость с работой команды.
          </p>
        </div>
      </div>
    </div>
  )
}
function CareerFile({ person, data }) {
  const p = usePeople(),
    { g, c, openForm } = p
  const history = rows(data?.history)
  const nextObservation = rows(data?.reports).at(-1)?.next
  return (
    <>
      <div className="p-career-summary">
        <span>
          <b>{person.experience ?? '—'}</b>
          <small>лет опыта</small>
        </span>
        <span>
          <b>{potential(data)}</b>
          <small>оценка потенциала</small>
        </span>
        <span>
          <b>{person.reputation ?? '—'}</b>
          <small>репутация</small>
        </span>
        <span>
          <b>{person.professionalism ?? '—'}</b>
          <small>профессионализм</small>
        </span>
      </div>
      <div className="p-two-columns">
        <Section title="Карьера и назначения">
          <div className="p-career-timeline">
            {history
              .slice()
              .sort((a, b) => b.start.localeCompare(a.start))
              .map((r, i) => (
                <article key={r.id || r.seat + r.start + i}>
                  <span className="p-timeline-dot" />
                  <div>
                    <small>
                      {r.start > c.date
                        ? 'Предстоит'
                        : r.end && r.end <= c.date
                          ? 'Завершено'
                          : 'Действует'}{' '}
                      · {date(r.start)} — {date(r.end)}
                    </small>
                    <button className="p-text-button" onClick={() => g.openOrganization(r.org)}>
                      {p.orgName(r.org)}
                    </button>
                    <p>
                      {p.positionName(r.position || person.position)} · {p.seriesName(r.series)}
                    </p>
                    {r.entry && <p>Заявка № {p.world.entries?.[r.entry]?.number}</p>}
                    {r.salary_cents != null && <small>{money(r.salary_cents)} / месяц</small>}
                    {r.transfer_on && <small>Переход {date(r.transfer_on)}</small>}
                    {r.agreed_end && r.agreed_end !== r.end && (
                      <small>Первоначальный срок {date(r.agreed_end)}</small>
                    )}
                  </div>
                </article>
              ))}
          </div>
          {!history.length && <p className="p-muted">В раскрытой истории пока нет назначений.</p>}
          {rows(data?.lineup_history).map((r) => (
            <p className="p-muted" key={r.id}>
              {date(r.date)} · {r.message}
            </p>
          ))}
        </Section>
        <Section title="Развитие и наблюдения">
          <Facts
            items={[
              ['Дата рождения', person.birth_date ? date(person.birth_date) : null],
              [
                'Амбиции / лояльность',
                person.ambition != null ? person.ambition + ' / ' + person.loyalty : null,
              ],
              ['Адаптивность', person.adaptability],
              ['Реакция', person.reaction],
            ]}
          />
          {Object.entries(person.adaptation || {}).map(([k, v]) => (
            <div className="p-adaptation" key={k}>
              <span>
                {k}
                <small>{person.discipline_days?.[k] ?? 0} дней опыта</small>
              </span>
              <strong>{v}/100</strong>
              <Meter value={v} label={k} />
            </div>
          ))}
          {person.position === 'driver' && (
            <>
              <div className="p-scout-estimate">
                <Icon name="Binoculars" size={26} />
                <span>
                  <small>Оценка потенциала</small>
                  <strong>{potential(data)}</strong>
                </span>
              </div>
              {rows(data?.reports).map((r, i) => (
                <p className="p-muted" key={r.date + i}>
                  {date(r.date)} · {p.name(r.scout)} · диапазон {r.low}–{r.high}; новое наблюдение с{' '}
                  {date(r.next)}
                </p>
              ))}
              <Button
                variant="secondary"
                disabled={!data?.scout_available || nextObservation > c.date}
                onClick={() =>
                  openForm(
                    'Наблюдение · ' + person.name,
                    <ScoutingForm person={person} dossier={data} />,
                  )
                }
              >
                {nextObservation > c.date ? 'Следующее наблюдение · ' + date(nextObservation) : 'Поручить наблюдение'}
              </Button>
            </>
          )}
          {person.credentials && (
            <Facts
              items={[
                [
                  'Лицензии',
                  person.credentials.licences
                    ?.map((l) =>
                      l === 'super' ? 'Суперлицензия' : l === 'international' ? 'Международная' : l,
                    )
                    .join(', '),
                ],
                ['Баллы суперлицензии', person.credentials.points],
              ]}
            />
          )}
        </Section>
      </div>
      <DevelopmentHistory data={data?.development} />
      <Section title="Подтверждённые спортивные результаты">
        {rows(data?.results).length || rows(data?.classifications).length ? (
          <>
            {rows(data?.results).map((r) => (
              <article className="p-result-line" key={r.session_id}>
                <time>{date(r.day)}</time>
                <b>{p.seriesName(r.series)}</b>
                <span>№ {p.world.entries?.[r.entry]?.number}</span>
                <strong>{r.place ? 'P' + r.place : 'Без классификации'}</strong>
              </article>
            ))}
            {rows(data?.classifications).map((r) => (
              <p key={r.season}>
                {r.season} · место {r.place} · {r.certified_points} баллов суперлицензии
              </p>
            ))}
          </>
        ) : (
          <p className="p-muted">
            В этой карьере пока нет подтверждённых результатов заездов. Предстоящие этапы не выдаются за
            состоявшиеся.
          </p>
        )}
      </Section>
      {person.position === 'technical-advisor' && <AdvisorAssignments person={person} data={data} />}
    </>
  )
}
function ScoutingForm({ person, dossier }) {
  const p = usePeople(),
    { g, c, own, state, update, notify } = p
  const [error, setError] = useState('')
  function submit(e) {
    e.preventDefault()
    p.commit('scout-driver', { person: person.id }, setError)
  }
  return (
    <form className="p-form" onSubmit={submit}>
      <p>
        Поручите наблюдение за {person.name}. Новый отчёт должен уточнить диапазон потенциала; точное
        значение не появится до получения фактического результата.
      </p>
      <p>Доступный скаут назначается кадровой службой.</p>
      <Facts
        items={[
          ['Текущая оценка', potential(dossier)],
          ['Повторное наблюдение', 'Не ранее чем через 7 дней'],
          ['Результат', 'Новый диапазон по отчёту'],
        ]}
      />
      <FormError error={error} />
      <FormActions submit="Передать поручение" onCancel={g.closeDialog} />
    </form>
  )
}
function DevelopmentHistory({ data }) {
  const [limit, setLimit] = useState(6),
    history = rows(data?.history)
  return (
    <Section title="Профессиональная динамика" eyebrow="Подтверждённая работа">
      <div className="p-experience-chips">
        {Object.entries(data?.experience || {})
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => (
            <span key={k}>
              {k}
              <b>{v} опыта</b>
            </span>
          ))}
      </div>
      {history.length ? (
        <div className="p-work-events">
          {history.slice(0, limit).map((r, i) => (
            <article key={r.fact?.event_id || i}>
              <time>{date(r.fact?.date)}</time>
              <div>
                <h3>{r.label}</h3>
                <p>
                  {r.discipline}
                  {r.fact?.context?.series && ' · ' + r.fact.context.series.toUpperCase()}
                  {r.fact?.context?.wet && ' · мокрая трасса'}
                </p>
                {Object.entries(r.changes || {}).map(([k, v]) => (
                  <span key={k}>
                    {k} <b>{v.before === v.after ? v.after : v.before + ' → ' + v.after}</b>
                    {v.xp > 0 && ' · +' + v.xp + ' опыта'}
                  </span>
                ))}
              </div>
            </article>
          ))}
          {history.length > limit && (
            <Button variant="secondary" onClick={() => setLimit(limit + 12)}>
              Показать ещё
            </Button>
          )}
        </div>
      ) : (
        <p className="p-muted">
          В доступной истории пока нет подтверждённых профессиональных событий. Подготовка и план
          развития не заменяют выполненную работу.
        </p>
      )}
      {data?.migration && (
        <details className="p-disclosure">
          <summary>Перенос истории из сохранения</summary>
          <p>
            {date(data.migration.date)} · завершённых программ {data.migration.completed}.
          </p>
          {data.migration.cancelled && (
            <p>Закрыт незавершённый индивидуальный план «{data.migration.cancelled.skill}».</p>
          )}
        </details>
      )}
    </Section>
  )
}
function PublicProfile({ person, data }) {
  const { world } = usePeople()
  const context = rows(data?.calendar_context),
    [eventId, select] = useState(''),
    event = context.find((x) => x.event === eventId) || context.find((x) => x.home) || context[0]
  return (
    <>
      <div className="p-public-metrics">
        {[
          ['Профессиональная репутация', person.reputation],
          ['Авторитет среди коллег', person.authority],
          ['Медийная популярность', person.popularity],
        ].map(([k, v]) => (
          <article key={k}>
            <strong>{v ?? '—'}</strong>
            <h3>{k}</h3>
            <Meter value={v} label={k} />
          </article>
        ))}
      </div>
      <div className="p-two-columns">
        <Section title="Характер в публичном пространстве">
          <div className="p-trait-bars">
            {Object.entries({ ...person.media_traits, loyalty: person.loyalty })
              .filter(([, v]) => v != null)
              .map(([k, v]) => (
                <div key={k}>
                  <span>
                    {mediaNames[k] || k}
                    <b>{v}</b>
                  </span>
                  <Meter value={v} label={mediaNames[k] || k} />
                </div>
              ))}
          </div>
          <p className="p-muted">
            Это характеристики вымышленного персонажа игрового мира. Популярность не заменяет
            профессиональную квалификацию.
          </p>
        </Section>
        <Section title="Региональная аудитория">
          {Object.entries(person.regional_popularity || {})
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <div className="p-region-row" key={k}>
                <span>{k.toUpperCase()}</span>
                <b>{world.countries?.[k] || k}</b>
                <Meter value={v} label={'Популярность · ' + (world.countries?.[k] || k)} />
                <strong>{v}</strong>
              </div>
            ))}
        </Section>
      </div>
      {person.position === 'driver' && (
        <Section
          title="Внимание на этапе"
          sub="Контекст аудитории, характер и давление по действующему назначению."
          action={
            event && (
              <Field label="Этап">
                <select value={event.event} onChange={(e) => select(e.target.value)}>
                  {context.map((x) => (
                    <option key={x.event} value={x.event}>
                      {date(x.date)} · {x.name}
                      {x.home ? ' · домашний' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )
          }
        >
          {event ? (
            <>
              <h3>
                {event.name} · {event.home ? 'Домашний этап' : 'Выездной этап'}
              </h3>
              <Facts
                items={[
                  ['Ожидаемое внимание', event.attention],
                  ['Психологическое давление', event.pressure],
                  ['Мотивация', event.motivation],
                  ['Открытость', event.openness],
                  ['Риск конфликта', event.conflict],
                  ['Готовность признать ошибку', event.accountability],
                  ['Влияние позиции', event.influence],
                ]}
              />
            </>
          ) : (
            <p className="p-muted">В календаре нет будущих этапов по текущему назначению.</p>
          )}
        </Section>
      )}
    </>
  )
}
function WorkProfile({ person, data }) {
  return (
    <>
      {person.preferences && (
        <Section
          title="Предпочтения машины"
          sub="Предпочтение показывает стиль работы, а не универсально лучший вариант."
        >
          <div className="p-preferences">
            {Object.entries(person.preferences).map(([k, v]) => (
              <article key={k}>
                <span>
                  {k}
                  <b>{v}/100</b>
                </span>
                <Meter value={v} label={k} />
                <div>
                  <small>{k === 'Баланс' ? 'Недостаточная поворачиваемость' : 'Плавный'}</small>
                  <small>{k === 'Баланс' ? 'Избыточная поворачиваемость' : 'Острый'}</small>
                </div>
              </article>
            ))}
          </div>
        </Section>
      )}
      <Relationships rows={data?.relationships} />
    </>
  )
}
function Relationships({ rows: list }) {
  const { g, people } = usePeople()
  return (
    <Section
      title="Совместная работа"
      sub="Доверие связано с конкретными людьми, выполненной работой и совместными назначениями."
    >
      <div className="p-relations">
        {rows(list)
          .slice()
          .sort((a, b) => Number(b.active) - Number(a.active) || b.days - a.days)
          .map((r) => (
            <article key={r.kind + r.peer}>
              <header>
                <span className="p-kicker">{relationNames[r.kind] || r.kind}</span>
                <Badge tone={r.active ? 'positive' : 'neutral'}>
                  {r.active ? 'В составе' : 'Архив'}
                </Badge>
              </header>
              <button
                className="p-text-button"
                onClick={() =>
                  people.some((x) => x.id === r.peer)
                    ? g.openPerson(r.peer, 'work')
                    : g.navigate('staff', 'collectives')
                }
              >
                {r.name}
              </button>
              <p>
                {r.days} дней вместе ·{' '}
                {r.trust == null ? 'Внешний коллектив' : 'Доверие ' + r.trust + '/100'}
              </p>
              {r.trust != null && <Meter value={r.trust} label={'Доверие · ' + r.name} />}
              {(r.spells?.length || r.events?.length) > 0 && (
                <details className="p-disclosure">
                  <summary>История работы</summary>
                  {rows(r.spells).map((s, i) => (
                    <p key={s.start + i}>
                      {date(s.start)} — {date(s.end)}
                    </p>
                  ))}
                  {rows(r.events).map((e, i) => (
                    <p key={e.date + i}>
                      {date(e.date)} · {outcomeNames[e.outcome] || e.outcome}
                    </p>
                  ))}
                </details>
              )}
            </article>
          ))}
      </div>
      {!rows(list).length && (
        <Empty
          title="Совместный опыт ещё не сформирован"
          text="Рабочие связи появятся из общих назначений и подтверждённых событий. Отсутствие связи не означает нулевое доверие."
          icon="Users"
        />
      )}
    </Section>
  )
}
function Comparison({ person, data }) {
  const p = usePeople(),
    peers = p.people.filter((x) => x.position === person.position && x.id !== person.id),
    [query, setQuery] = useState(''),
    [selected, select] = useState(peers.find((x) => x.org === p.c.org)?.id || peers[0]?.id || '')
  const other = useDossier(selected),
    peer = other.candidate,
    right = other.data,
    skills = p.world.positions?.[person.position]?.skills || Object.keys(person.skills || {})
  return (
    <>
      <div className="p-compare-selector">
        <SearchField value={query} onChange={setQuery} label="Найти человека для сравнения" />
        <Field label="Сравнить с">
          <select value={selected} onChange={(e) => select(e.target.value)}>
            {peers
              .filter((x) =>
                (x.name + ' ' + p.orgName(x.org))
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .slice(0, 150)
              .map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name} · {p.orgName(x.org)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {peer ? (
        <>
          <div className="p-compare-head">
            <PersonCard person={person} />
            <span>VS</span>
            <PersonCard
              person={{
                ...peer,
                ...right?.person,
                org: peer.org,
                rating: right?.profile?.rating ?? peer.rating,
              }}
            />
          </div>
          <Section
            title="Навыки в одинаковых условиях"
            sub="Эффективные значения из досье. Нераскрытый показатель остаётся неизвестным."
          >
            <div className="p-compare-table">
              {skills.map((k) => (
                <div key={k}>
                  <b>{data?.profile?.values?.[k] ?? '—'}</b>
                  <span>
                    <small>{k}</small>
                    <div className="p-compare-bars">
                      <Meter value={data?.profile?.values?.[k]} label={person.name + ' · ' + k} />
                      <Meter
                        value={right?.profile?.values?.[k]}
                        label={peer.name + ' · ' + k}
                        tone="alternate"
                      />
                    </div>
                  </span>
                  <b>{right?.profile?.values?.[k] ?? '—'}</b>
                </div>
              ))}
              <div>
                <b>{data?.profile?.rating ?? person.rating}</b>
                <strong>Общий рейтинг</strong>
                <b>{right?.profile?.rating ?? peer.rating}</b>
              </div>
            </div>
          </Section>
          <div className="p-two-columns">
            <Section title="Состояние и личный профиль">
              <div className="p-compare-table">
                {[
                  ['reputation', 'Репутация'],
                  ['authority', 'Авторитет'],
                  ['popularity', 'Популярность'],
                  ['loyalty', 'Лояльность'],
                  ['morale', 'Мораль'],
                  ['fatigue', 'Усталость'],
                  ['reaction', 'Реакция'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <b>{person[k] ?? '—'}</b>
                    <span>{label}</span>
                    <b>{right?.person?.[k] ?? '—'}</b>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Совместный опыт">
              {[data, right].map((d, i) => {
                const r = rows(d?.relationships).sort((a, b) => b.days - a.days)[0]
                return (
                  <div key={i} className="p-compare-work">
                    <h3>{i ? peer.name : person.name}</h3>
                    {r ? (
                      <>
                        <p>
                          {relationNames[r.kind]} · {r.name}
                        </p>
                        <b>{r.days} дней вместе</b>
                        <small>{r.trust == null ? 'Доверие неизвестно' : 'Доверие ' + r.trust}</small>
                      </>
                    ) : (
                      <p className="p-muted">Нет раскрытой рабочей связи.</p>
                    )}
                  </div>
                )
              })}
            </Section>
          </div>
          <details className="p-disclosure">
            <summary>Подробно: опыт, предпочтения и публичный характер</summary>
            <div className="p-compare-table">
              {[
                ...new Set([
                  ...Object.keys(data?.development?.experience || {}),
                  ...Object.keys(right?.development?.experience || {}),
                ]),
              ].map((k) => (
                <div key={k}>
                  <b>{data?.development?.experience?.[k] ?? '—'}</b>
                  <span>{k} · опыт</span>
                  <b>{right?.development?.experience?.[k] ?? '—'}</b>
                </div>
              ))}
              {Object.keys(person.preferences || {}).map((k) => (
                <div key={k}>
                  <b>{person.preferences[k]}</b>
                  <span>{k}</span>
                  <b>{right?.person?.preferences?.[k] ?? '—'}</b>
                </div>
              ))}
              {Object.keys(mediaNames).map((k) => (
                <div key={k}>
                  <b>{person.media_traits?.[k] ?? '—'}</b>
                  <span>{mediaNames[k]}</span>
                  <b>{right?.person?.media_traits?.[k] ?? '—'}</b>
                </div>
              ))}
            </div>
          </details>
        </>
      ) : (
        <Empty
          title="Нет второго кандидата этой профессии"
          text="Для корректного сравнения нужен человек той же специализации."
        />
      )}
    </>
  )
}
function PersonContract({ person, data }) {
  const p = usePeople(),
    { g, c, state, update, openForm, spend, notify } = p
  const current = data?.current,
    managed = current?.org === c.org && data?.options.some((o) => o.id === current.seat)
  const future = rows(data?.history).filter((x) => x.start > c.date)
  function release() {
    if (current.buyout_cents == null)
      return g.notify('Компенсация не раскрыта — сначала требуется расчёт.', 'warning')
    if (rows(data?.support).some((x) => x.end > c.date))
      return g.notify('Назначение консультантом препятствует расторжению.', 'warning')
    if (future.length) return g.notify('У сотрудника уже подписано будущее назначение.', 'warning')
    g.confirm({
      title: 'Расторгнуть договор с ' + person.name + '?',
      description: 'Место будет освобождено сегодня. Компенсация: ' + money(current.buyout_cents) + '.',
      confirmLabel: 'Расторгнуть и выплатить компенсацию',
      danger: true,
      onConfirm: () => p.run('staff-release', { seat: current.seat }),
    })
  }
  const contractType =
    person.position === 'driver' ? 'driver' : person.position === 'manager' ? 'leadership' : 'staff'
  return (
    <>
      {current ? (
        <ContractDocument
          record={{
            id: current.id || current.seat,
            type: contractType,
            title: person.name,
            person,
            data: { ...current, position: person.position },
            status: 'active',
          }}
        />
      ) : (
        <ContractFrame type={contractType} title="Открыт к предложениям" person={person}>
          <p className="contract-note">
            В доступном досье нет действующего договора. Обсудите конкретное место, сроки и
            вознаграждение.
          </p>
        </ContractFrame>
      )}
      <div className="contract-contracts-intro">
        <Icon name="MessagesSquare" size={29} />
        <div>
          <h3>{managed ? 'Следующая глава в нашей команде' : 'Новое назначение'}</h3>
          <p>
            Согласуйте условия до подписания. Будущее назначение не меняет состав раньше даты вступления.
          </p>
        </div>
        <Button
          disabled={!data?.options.length}
          title={!data?.options.length ? 'Нет должности в ваших полномочиях' : undefined}
          onClick={() =>
            openForm('Предложение · ' + person.name, <NegotiationForm person={person} dossier={data} />)
          }
        >
          {managed ? 'Обсудить продление' : 'Предложить контракт'}
        </Button>
        {managed && (
          <Button variant="secondary" onClick={release}>
            Расторгнуть договор
          </Button>
        )}
      </div>
      {future.map((f) => (
        <article className="p-future-contract" key={f.id}>
          <Icon name="CalendarCheck" />
          <div>
            <h3>Подписано на будущее</h3>
            <p>
              {p.seatName(f.seat)} · {date(f.start)} — {date(f.end)}
            </p>
            <strong>{money(f.salary_cents)} / месяц</strong>
          </div>
        </article>
      ))}
      {state.offers
        .filter((x) => x.person === person.id)
        .map((o) => (
          <OfferCard key={o.id} offer={o} />
        ))}
      {data?.person?.position === 'technical-advisor' && (
        <AdvisorAssignments person={person} data={data} />
      )}
    </>
  )
}
function PersonSupport({ person, data }) {
  const p = usePeople(),
    { g, c, openForm } = p
  const funds = rows(data?.financing),
    scholarships = rows(data?.scholarships)
  return (
    <>
      <div className="p-support-intro">
        <Icon name="Handshake" size={32} />
        <div>
          <h2>Поддержка открывает место. Договор определяет работу.</h2>
          <p>Спонсорские взносы и академический договор не заменяют трудовой контракт пилота.</p>
        </div>
      </div>
      <div className="p-funding-grid">
        {funds.map((f) => (
          <FundingCard key={f.id} fund={f} dossier={data} />
        ))}
      </div>
      {!funds.length && (
        <p className="p-muted">В доступном досье договоры поддержки не раскрыты или отсутствуют.</p>
      )}
      {scholarships.length > 0 && (
        <Section title="Академические права">
          {scholarships.map((s) => (
            <ScholarshipCard key={s.id} scholarship={s} />
          ))}
        </Section>
      )}
      <div className="p-inline-actions">
        {g.role === 'owner' && c.academies?.length > 0 && !scholarships.some((s) => s.end > c.date) && (
          <Button
            onClick={() =>
              openForm(
                'Принять в академию · ' + person.name,
                <FundingForm academy={c.academies[0]} person={person} />,
              )
            }
          >
            Принять в академию
          </Button>
        )}
        {g.role === 'manufacturer' && (
          <Button
            onClick={() => openForm('Поддержка · ' + person.name, <FundingForm person={person} />)}
          >
            Поддержать пилота клиента
          </Button>
        )}
      </div>
    </>
  )
}
function AdvisorAssignments({ person, data }) {
  const p = usePeople(),
    { g, state, update, openForm, c, notify } = p
  const assignments = rows(data?.support),
    managed = g.role === 'manufacturer' && data?.current?.org === c.org
  return (
    <Section
      title="Назначения технического консультанта"
      sub="Клиент, конкретная заявка, продукт и непересекающийся период."
      action={
        managed && (
          <Button
            onClick={() =>
              openForm(
                'Назначить консультанта · ' + person.name,
                <AdvisorForm person={person} data={data} />,
              )
            }
          >
            Новое назначение
          </Button>
        )
      }
    >
      {assignments.map((r, i) => (
        <article className="p-advisor-assignment" key={r.id || i}>
          <Icon name="Headset" />
          <div>
            <h3>{p.orgName(r.client || r.org)}</h3>
            <p>
              {date(r.start)} — {date(r.end)}
              {r.entry && ' · №' + p.world.entries?.[r.entry]?.number}
            </p>
            {r.product && <small>{p.world.products?.[r.product]?.name || r.product}</small>}
          </div>
          <Status
            value={
              r.status === 'cancelled'
                ? 'cancelled'
                : r.end <= c.date
                  ? 'ended'
                  : r.start > c.date
                    ? 'scheduled'
                    : 'active'
            }
          />
        </article>
      ))}
      {!assignments.length && <p className="p-muted">Назначений по поддержке клиентов пока нет.</p>}
    </Section>
  )
}
function AdvisorForm({ person, data }) {
  const p = usePeople(),
    { g, c, clients, state, update, notify } = p
  const [query, setQuery] = useState(''),
    [series, setSeries] = useState(''),
    [selected, select] = useState(''),
    [error, setError] = useState('')
  const advisorClients = clients.filter((client) => client.terms.support === true)
  const choice = advisorClients.find((x) => x.entry + ':' + x.product === selected),
    allAssignments = rows(data?.support),
    busyUntil = allAssignments
      .filter((x) => x.end > c.date)
      .map((x) => x.end)
      .sort()
      .at(-1),
    choices = advisorClients.filter(
      (x) =>
        (!series || x.series === series) &&
        (x.label + ' ' + x.productName).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
  function submit(e) {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.currentTarget)),
      problem = checkDateRange(v.start, v.end, c.date)
    if (!choice) return setError('Выберите конкретную заявку и продукт клиента.')
    if (problem) return setError(problem)
    p.commit(
      'advisor-assign',
      {
        seat: data.current.seat,
        entry: choice.entry,
        product: choice.product,
        start: v.start,
        end: v.end,
      },
      setError,
    )
  }
  return (
    <form className="p-form" onSubmit={submit}>
      <div className="p-callout">
        <Icon name="CalendarClock" />
        <div>
          <b>{person.name}</b>
          <p>
            {busyUntil ? 'Есть занятость до ' + date(busyUntil) : 'Нет действующих назначений клиентам'}
          </p>
        </div>
      </div>
      <div className="p-advisor-filters">
        <SearchField
          value={query}
          onChange={setQuery}
          label="Найти клиентскую заявку"
          placeholder="Команда, номер, продукт"
        />
        <Field label="Чемпионат">
          <select value={series} onChange={(e) => setSeries(e.target.value)}>
            <option value="">Все чемпионаты</option>
            {[...new Set(advisorClients.map((x) => x.series))].map((id) => (
              <option key={id} value={id}>
                {p.seriesName(id)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="p-client-picker" role="radiogroup" aria-label="Клиентская заявка">
        {choices.map((x) => (
          <button
            key={x.entry + x.product}
            type="button"
            role="radio"
            aria-checked={selected === x.entry + ':' + x.product}
            className={selected === x.entry + ':' + x.product ? 'selected' : ''}
            onClick={() => select(x.entry + ':' + x.product)}
          >
            <span className="p-client-number">{x.number}</span>
            <span>
              <b>{p.orgName(x.org)}</b>
              <small>
                {p.seriesName(x.series)} · {x.productName}
              </small>
            </span>
            <Icon name={selected === x.entry + ':' + x.product ? 'CircleCheck' : 'Circle'} />
          </button>
        ))}
      </div>
      {!choices.length && <p>Нет заявок с действующим правом технической поддержки по этим условиям.</p>}
      {choice && (
        <p className="p-selected-client">
          Выбрано: {choice.label} · {choice.productName}
          {choice.terms?.end && ' · договор до ' + date(choice.terms.end)}
        </p>
      )}
      <div className="p-form-grid">
        <Field label="Начало поддержки">
          <input type="date" name="start" required min={c.date} defaultValue={busyUntil || c.date} />
        </Field>
        <Field label="Окончание (исключая)">
          <input type="date" name="end" required defaultValue={addDays(busyUntil || c.date, 7)} />
        </Field>
      </div>
      <p className="p-muted">
        Консультант передаёт разрешённые данные и рекомендации. Решения по машине и пилотам остаются у
        клиентской команды.
      </p>
      <FormError error={error} />
      <FormActions submit="Назначить консультанта" onCancel={g.closeDialog} />
    </form>
  )
}
