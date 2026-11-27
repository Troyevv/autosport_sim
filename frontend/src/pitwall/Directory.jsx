import { seatName } from '../career/staff/model'
import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useGame, useStored, money, dateLabel as date } from './core'
import { Icon, Button, PageHeader, Tabs, Badge, ContextMenu } from './ui'
import { PersonPortrait } from './visuals'
import './directory.css'
const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const byName = (a, b) => a.name.localeCompare(b.name, 'ru')
const peopleContext = React.createContext(null)
const usePeople = () => React.useContext(peopleContext)
function Field({ label, hint, children, wide = false }) {
  return (
    <label className={'p-field' + (wide ? ' p-wide' : '')}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
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

function PersonCard({ person, featured = false, number, subtitle }) {
  const { g, state, toggleShortlist, positionName, orgName, c } = usePeople()
  const p = person,
    isShortlisted = state.shortlist.includes(p.id)
  return (
    <article className={'p-person-card' + (featured ? ' featured' : '')}>
      <button
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
            {p.country && <span>{p.country.toUpperCase()}</span>}
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
      <button type="button" className="p-row-person" onClick={() => g.openPerson(p.id, 'profile')}>
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
function Directory({ source, market = false, presetPosition = '' }) {
  const { g, world, state, orgName, positionName, seriesName, toggleShortlist } = usePeople()
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 700)
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
      <details
        className="p-filter-disclosure"
        open={filtersOpen}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>Фильтры</summary>
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
              <input
                type="checkbox"
                checked={free}
                onChange={(e) => change(setFree)(e.target.checked)}
              />
              Свободные агенты
            </label>
          )}
        </div>
      </details>
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
              <button className="p-row-person" onClick={() => g.openPerson(p.id, 'profile')}>
                <span className="p-mini-photo">
                  <PersonPortrait person={p} role={p.position} />
                </span>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.country?.toUpperCase()} · {p.age} лет · {orgName(p.org)}
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
          { id: 'scouting', label: 'Скаутинг' },
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
            <Empty
              title="Новый талант начинается с наблюдения"
              text="Откройте досье пилота и поручите скауту оценку потенциала. Существующие отчёты доступны в разделе «Карьера»."
              action={<Button onClick={() => g.navigate('market', 'directory')}>Выбрать пилота</Button>}
            />
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

function Collectives() {
  const { g, c } = usePeople()
  return (
    <div className="p-team-layout">
      {c.collectives.map((group) => (
        <Section key={group.id} title={group.name} eyebrow="Подразделение">
          <dl className="p-facts">
            {Object.entries({
              Человек: group.size,
              Квалификация: group.qualification,
              Нагрузка: group.workload + '%',
              Усталость: group.fatigue + '%',
              'Резерв, чел.-дн./день': group.capacity / 100,
              'ФОТ / месяц': money(group.payroll_cents),
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <Button variant="secondary" onClick={() => g.navigate('people', 'groups', group.id)}>
            Работа и взаимодействие
          </Button>
        </Section>
      ))}
    </div>
  )
}
const fundingSources = {
  family: 'Семья',
  sponsor: 'Личный спонсор',
  academy: 'Академия',
  manufacturer: 'Производитель',
  national: 'Национальная программа',
}

function Funding() {
  const p = usePeople(),
    { g, funds, c } = p
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
            <Button onClick={() => g.navigate('market')}>Новый договор поддержки</Button>
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
    { g, c } = p,
    person = p.people.find((x) => x.id === f.person),
    currentOrg = dossier?.current?.org || person?.org
  const canEnd =
    f.status === 'active' &&
    f.end > c.date &&
    (f.source === 'academy'
      ? f.payer === c.org && g.role === 'owner'
      : (f.payer === c.org && g.role === 'manufacturer') ||
        (currentOrg === c.org && g.role === 'manager' && (f.portable || f.team === c.org)))
  const end = () => g.openPerson(f.person, 'backing')
  return (
    <article className="p-funding-card">
      <header>
        <span className="p-kicker">{fundingSources[f.source] || 'Договор поддержки'}</span>
        <Badge tone={f.status === 'active' && f.end > c.date ? 'positive' : 'neutral'}>
          {f.status === 'active' && f.end > c.date ? 'Действует' : 'Завершён'}
        </Badge>
      </header>
      {person && (
        <PersonRow
          p={person}
          secondary={g.world.organizations[f.payer]?.name || fundingSources[f.source]}
        />
      )}
      <div className="p-funding-amount">
        {money(f.monthly_cents)}
        <small>/ месяц</small>
      </div>
      <div className="p-funding-direction">
        <span>{g.world.organizations[f.payer]?.name || fundingSources[f.source]}</span>
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
          Рассмотреть прекращение поддержки
        </Button>
      )}
    </article>
  )
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
function PeopleNavigation() {
  const g = useGame(),
    route = g.route,
    navigationRef = useRef(null)
  useEffect(() => {
    const nav = navigationRef.current,
      active = nav?.querySelector('[aria-current=page]')
    if (nav && active)
      nav.scrollLeft = Math.max(
        0,
        active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2,
      )
  }, [route])
  return (
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
  )
}
function StaffContracts({ children }) {
  const p = usePeople(),
    { g, c, own, seats } = p
  const tab = g.tab || 'active'
  const offers = c.offers,
    future = offers.filter((o) => o.status === 'signed' && o.start > c.date),
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
            count: future.length,
          },
        ]}
        value={tab}
        onChange={(v) => g.navigate('contracts', v)}
      />
      {tab === 'negotiations' ? (
        offers.length ? (
          children
        ) : (
          <Empty
            title="Переговорная комната свободна"
            text="Предложите конкретное место, оклад и даты из досье кандидата. Ответ появится отдельным этапом."
            icon="MessagesSquare"
            action={<Button onClick={() => g.navigate('market')}>Открыть рынок</Button>}
          />
        )
      ) : tab === 'future' ? (
        future.length > 0 ? (
          future.map((o) => (
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

function TeamOverview() {
  const { g, own, seats, c, orgName, positionName } = usePeople()
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
  const cutoff = new Date(c.date + 'T12:00:00Z')
  cutoff.setUTCDate(cutoff.getUTCDate() + 180)
  const deadline = cutoff.toISOString().slice(0, 10)
  const expiry = own.filter((p) => p.end && p.end >= c.date && p.end <= deadline)
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
          <Button
            aria-label="Открыть кадровый рынок"
            onClick={() => g.navigate('market')}
            icon={<Icon name="Search" />}
          >
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
                number={
                  g.world.entries[seats.find((seat) => seat.occupant?.id === p.id && seat.entry)?.entry]
                    ?.number
                }
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
              <b>{c.preparations.filter((x) => x.status === 'scheduled').length} программ подготовки</b>
              <small>Время, нагрузка и работа штаба</small>
            </span>
            <Icon name="ChevronRight" />
          </button>
          <div className="p-payroll">
            <small>Оклад команды / месяц</small>
            <strong>{money(c.account?.payroll_cents, true)}</strong>
            <span>Свободные средства · {money(c.available_cents, true)}</span>
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
          <h3>{c.collectives.reduce((a, x) => a + x.size, 0)} специалистов за кулисами</h3>
          <p>Инженеры, производство и бригады — численность, загрузка, усталость и общий опыт.</p>
        </div>
        <Button variant="secondary" onClick={() => g.navigate('staff', 'collectives')}>
          Открыть коллективы
        </Button>
      </div>
    </>
  )
}

export function PersonnelDirectory({ children, overview = false }) {
  const g = useGame(),
    c = g.game.career,
    people = g.game.personnel,
    [shortlist, setShortlist] = useStored('personnel.shortlist', []),
    own = people.filter((p) => p.org === c.org)
  const context = {
    g,
    c,
    world: g.world,
    own,
    seats: c.assignments.filter((a) => a.org === c.org),
    seatName: (id) => seatName(id, c, g.world),
    funds: g.game.funding || [],
    people,
    state: { shortlist },
    name: (id) => people.find((p) => p.id === id)?.name || g.world.names[id],
    orgName: (id) => g.world.organizations[id]?.name || 'Свободный агент',
    positionName: (id) => g.world.positions[id]?.name || 'Должность не раскрыта',
    seriesName: (id) => g.world.championships[id]?.name || id,
    toggleShortlist: (id) =>
      setShortlist((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id])),
  }
  return (
    <peopleContext.Provider value={context}>
      <section className="people-module">
        {!overview && <PeopleNavigation />}
        {overview ? (
          <TeamOverview />
        ) : g.route === 'contracts' ? (
          <StaffContracts>{children}</StaffContracts>
        ) : g.route === 'funding' ? (
          <Funding />
        ) : g.route === 'market' ? (
          <Market />
        ) : (
          <Staff />
        )}
      </section>
    </peopleContext.Provider>
  )
}

function Facts({ items }) {
  return (
    <dl className="p-facts">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
