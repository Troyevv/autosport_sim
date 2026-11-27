import {UniformEditor} from '../UniformEditor'
import { OrganizationPalette } from '../BrandPalette'
import React, { useState } from 'react'
import { useGame, useStored, money, dateLabel } from '../core'
import { Button, Badge, Icon, Panel, Tabs } from '../ui'
import { RaceCar, PersonPortrait } from '../visuals'
import { OrganizationMark, getIdentity, identityVars, roleNames } from './identity'
import { DataChart } from './charts'
import { EntityStatistics } from './StatisticsCenter'
import { AdvisorBrief, OperationalAnalytics } from './Advisory'
import { financeModel, peopleModel, staff, currentSeats, positionName } from './advisory-model'
import './workspaces.css'

const array = (v) => (Array.isArray(v) ? v : Object.values(v || {}))
const short = (d) =>
  d ? new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'
function SectionLabel({ index, children, action }) {
  return (
    <header className="workspace-section-label">
      <span>
        <i>{index}</i>
        {children}
      </span>
      {action}
    </header>
  )
}
function StaffSignature({ person, caption }) {
  const g = useGame()
  return person ? (
    <button className="staff-signature" onClick={() => g.openPerson(person.id)}>
      <PersonPortrait person={person} />
      <span>
        <strong>{person.name}</strong>
        <small>{caption || positionName(g, person.position)}</small>
      </span>
      <Icon name="ArrowUpRight" size={16} />
    </button>
  ) : (
    <p className="source-note">Ответственный не назначен. Назначение доступно в кадровом разделе.</p>
  )
}
function HomeHeader({ kicker, title, description }) {
  const g = useGame(),
    org = g.world.organizations[g.game.career.org],
    identity = getIdentity(org)
  return (
    <header className="role-page-heading">
      <div>
        <div className="role-kicker">
          <OrganizationMark size={30} />
          <span>{identity.signature}</span>
          <Badge>{roleNames[g.role]}</Badge>
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <Button variant="ghost" onClick={() => g.navigate('saves')}>
        <Icon name="FolderOpen" size={17} />
        Сменить карьеру
      </Button>
    </header>
  )
}
function Upcoming({ events, compact = false }) {
  const g = useGame()
  return (
    <section className={'upcoming-events ' + (compact ? 'compact-events' : '')}>
      <SectionLabel
        index="СЕЗОН"
        action={
          <button className="link-button" onClick={() => g.navigate('calendar')}>
            Календарь <Icon name="ArrowRight" size={14} />
          </button>
        }
      >
        Ближайшие события
      </SectionLabel>
      {events.slice(0, 3).map((e) => (
        <button className="event-line" key={e.id} onClick={() => g.navigate('calendar', 'list', e.id)}>
          <time>
            <b>{e.start.slice(8)}</b>
            {new Date(e.start).toLocaleDateString('ru-RU', { month: 'short' })}
          </time>
          <span>
            <strong>{e.name}</strong>
            <small>
              {e.circuit} · {g.world.championships[e.series]?.name}
            </small>
          </span>
          <Icon name="ArrowUpRight" size={17} />
        </button>
      ))}
      {!events.length && <p>В текущем календаре нет будущих событий выбранной программы.</p>}
    </section>
  )
}
function ManagerHome() {
  const g = useGame(),
    c = g.game.career,
    org = g.world.organizations[c.org],
    identity = getIdentity(org),
    people = peopleModel(g),
    finance = financeModel(g),
    entries = Object.values(g.world.entries).filter(
      (e) => e.org === c.org && e.championship === c.series,
    ),
    entry = entries.find((e) => e.id === g.selectedEntry) || entries[0],
    car = g.world.cars[entry?.car],
    allEvents = g.world.events
      .filter((e) => e.start >= c.date && e.series === c.series && (!e.org || e.org === c.org))
      .sort((a, b) => a.start.localeCompare(b.start)),
    next = allEvents.find((e) => e.kind === 'testing' || e.kind === 'round') || allEvents[0],
    days = next ? Math.ceil((new Date(next.start) - new Date(c.date)) / 864e5) : null,
    drivers = people.own.filter(
      (p) =>
        p.position === 'driver' && entries.some((e) => (c.crews[e.id] || e.crew || []).includes(p.id)),
    ),
    proposals = g.game.projections.council?.proposals || [],
    unresolved = proposals.filter((p) => ['open', 'deferred'].includes(p.status)),
    chief = staff(g, ['chief-engineer'])
  return (
    <div className="role-home manager-home">
      <HomeHeader title="Команда ждёт вашего решения." description={identity.tone} />
      <div className="manager-stage">
        <section className="car-workspace">
          <header>
            <div>
              <span className="eyebrow">
                Гоночная программа · {c.series.toUpperCase()} / {c.date.slice(0, 4)}
              </span>
              <h2>{car?.name || 'Ваша команда'}</h2>
            </div>
            <button className="identity-link" onClick={() => g.openOrganization(org.id)}>
              {org.base} <Icon name="ArrowUpRight" size={15} />
            </button>
          </header>
          {entry && <RaceCar entryId={entry.id} studio={false} />}
          <div className="car-selector" aria-label="Автомобиль команды">
            {entries.map((e) => (
              <button
                key={e.id}
                aria-pressed={e.id === entry?.id}
                onClick={() => g.setSelectedEntry(e.id)}
              >
                № {e.number}
                <span>
                  {(c.crews[e.id] || e.crew || [])
                    .map((id) => g.game.personnel.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .join(' / ')}
                </span>
              </button>
            ))}
          </div>
          <footer>
            <div>
              <small>Следующий спортивный рубеж</small>
              <strong>{next?.name || 'Планирование сезона'}</strong>
              <span>
                {next ? `${short(next.start)} · ${days} дн. до начала` : c.series.toUpperCase()}
              </span>
            </div>
            <Button onClick={() => g.navigate('garage', 'overview', entry?.id)}>
              Проверить машину <Icon name="ArrowRight" />
            </Button>
          </footer>
        </section>
        <aside className="readiness-board">
          <div className="board-label">
            УТРЕННИЙ БРИФИНГ <span>{short(c.date)}</span>
          </div>
          <h2>{unresolved.length ? `${unresolved.length} вопросов к штабу` : 'Решения согласованы'}</h2>
          <p>
            {unresolved.length
              ? 'Есть технические предложения. Специалисты ждут приоритета и ресурсов.'
              : 'Новых технических предложений нет. Проверьте исполнение согласованных работ.'}
          </p>
          <StaffSignature person={chief} caption="Главный инженер · техническая повестка" />
          <div className="readiness-facts">
            <button onClick={() => g.navigate('staff')}>
              <span>Штатные места</span>
              <b>
                {people.seats.length - people.vacant.length} / {people.seats.length}
              </b>
              <small>
                {people.vacant.length
                  ? `${people.vacant.length} вакансий требуют внимания`
                  : 'Индивидуальные позиции укомплектованы'}
              </small>
            </button>
            <button onClick={() => g.navigate('budget')}>
              <span>Бюджет разработки</span>
              <b>{money(c.account.development_budget_cents, true)}</b>
              <small>Выделено владельцем · не остаток денег</small>
            </button>
            <button onClick={() => g.navigate('production', 'needs')}>
              <span>Физические компоненты</span>
              <b>
                Проверить запас <Icon name="ArrowUpRight" size={17} />
              </b>
              <small>Экземпляры, очередь и контроль качества</small>
            </button>
          </div>
          <Button
            variant="secondary"
            onClick={() => g.navigate('council', 'agenda', unresolved[0]?.id || '')}
          >
            Открыть повестку <Icon name="ArrowRight" size={16} />
          </Button>
        </aside>
      </div>
      <div className="home-operational-strip">
        <div>
          <span>Деньги организации</span>
          <b>{money(finance.available, true)}</b>
          <small>Доступны с учётом резервов</small>
        </div>
        <div>
          <span>Ваша ответственность</span>
          <b>Спортивная программа</b>
          <small>В рамках мандата и сезонной сметы</small>
        </div>
        <button onClick={() => g.navigate('leadership')}>
          <span>Связь с владельцем</span>
          <b>
            Цели и полномочия <Icon name="ArrowUpRight" size={16} />
          </b>
          <small>Обсудить приоритеты и ресурсы</small>
        </button>
      </div>
      <SectionLabel index="01">Сначала обсудить с командой</SectionLabel>
      <AdvisorBrief route="council" />
      <div className="manager-bottom">
        <section className="driver-lineup">
          <SectionLabel
            index="02"
            action={
              <button className="link-button" onClick={() => g.navigate('drivers')}>
                Состав команды <Icon name="ArrowRight" size={14} />
              </button>
            }
          >
            Ваши пилоты
          </SectionLabel>
          <div>
            {drivers.slice(0, 4).map((p) => (
              <button className="driver-feature" key={p.id} onClick={() => g.openPerson(p.id)}>
                <PersonPortrait person={p} />
                <span>
                  <small>{p.nationality || p.country}</small>
                  <strong>{p.name}</strong>
                  <em>
                    Досье, договор и подготовка <Icon name="ArrowUpRight" size={14} />
                  </em>
                </span>
              </button>
            ))}
          </div>
        </section>
        <Upcoming events={allEvents} />
      </div>
    </div>
  )
}
function OwnerHome() {
  const g = useGame(),
    c = g.game.career,
    org = g.world.organizations[c.org],
    finance = financeModel(g),
    cap = g.game.projections.capital || {},
    m = c.mandate || {},
    manager = currentSeats(g).find((s) => s.occupant?.id === m.manager)?.occupant,
    programs = cap.programs || [],
    valuation = cap.valuation || {}
  const capitalRows = [
    { label: 'Деньги', value: (valuation.cash_cents || 0) / 100 },
    { label: 'Активы', value: (valuation.assets_cents || 0) / 100 },
    { label: 'Договорная стоимость', value: (valuation.contract_value_cents || 0) / 100 },
    { label: 'Долг', value: -(valuation.debt_cents || 0) / 100 },
  ]
  return (
    <div className="role-home owner-home">
      <HomeHeader
        title="Вы задаёте направление."
        description="Капитал, люди и программы. Повседневные решения — ответственность назначенных руководителей."
      />
      <section className="owner-capital-banner">
        <div>
          <span className="eyebrow">Портфель владельца</span>
          <h2>{org.name}</h2>
          <p>
            {org.base} · {programs.length}{' '}
            {programs.length === 1 ? 'действующая программа' : 'действующих программ'}
          </p>
          <button className="link-button" onClick={() => g.openOrganization(org.id)}>
            Профиль организации <Icon name="ArrowUpRight" size={15} />
          </button>
        </div>
        <div className="capital-headline">
          <span>Оценка организации</span>
          <strong>{money(valuation.value_cents, true)}</strong>
          <small>Расчётная стоимость из текущей финансовой модели</small>
        </div>
        <div>
          <span>Доступный капитал владельца</span>
          <b>{money(cap.owner_cents, true)}</b>
          <small>Отдельно от счёта организации</small>
        </div>
      </section>
      <div className="owner-command">
        <section className="manager-letter">
          <header>
            <OrganizationMark size={46} />
            <span>
              ДОКЛАД РУКОВОДИТЕЛЯ
              <br />
              <small>{dateLabel(c.date)}</small>
            </span>
            <Badge>Внутренний документ</Badge>
          </header>
          <div className="letter-body">
            <div>
              <span className="eyebrow">Программа {c.series.toUpperCase()}</span>
              <h2>
                Приоритет понятен.
                <br />
                Нужны рамки решений.
              </h2>
              <p>
                Действующая цель:{' '}
                <strong>
                  {{
                    performance: 'спортивная результативность',
                    profit: 'финансовый результат',
                    development: 'развитие организации',
                    survival: 'устойчивость',
                  }[m.goal] ||
                    m.goal ||
                    'не назначена'}
                </strong>
                . Лимит самостоятельного решения — <strong>{money(m.limit_cents, true)}</strong>.
                Последний зафиксированный ответ руководителя: «
                {m.response || 'Ответ ещё не зафиксирован'}».
              </p>
              <p>
                Оперативную работу ведёт менеджер. Ваше решение определяет бюджет, горизонт целей и
                степень самостоятельности.
              </p>
              <StaffSignature person={manager} caption="Руководитель гоночной программы" />
            </div>
            {manager && (
              <div className="letter-portrait">
                <PersonPortrait person={manager} />
              </div>
            )}
          </div>
          <footer>
            <Button onClick={() => g.navigate('leadership', 'mandate')}>
              Обсудить мандат <Icon name="ArrowRight" />
            </Button>
            <Button variant="ghost" onClick={() => g.navigate('budget', 'plan')}>
              Открыть сезонную смету
            </Button>
          </footer>
          <small className="document-provenance">
            Сводка действующего мандата. Новая реплика NPC не сгенерирована.
          </small>
        </section>
        <aside className="owner-strategy-rail">
          <SectionLabel index="РЕШЕНИЯ">Ваша повестка</SectionLabel>
          {[
            [
              'Landmark',
              'Капитал и устойчивость',
              money(finance.available, true) + ' доступно организации',
              'capital',
              'ownership',
            ],
            [
              'UserRoundCheck',
              'Назначения руководителей',
              'Полномочия, цели и оценка работы',
              'leadership',
              'mandate',
            ],
            [
              'GraduationCap',
              'Долгая дистанция',
              'Академия и путь молодых пилотов',
              'academy',
              'overview',
            ],
          ].map(([icon, title, desc, r, t]) => (
            <button key={r} onClick={() => g.navigate(r, t)}>
              <Icon name={icon} size={23} />
              <span>
                <b>{title}</b>
                <small>{desc}</small>
              </span>
              <Icon name="ArrowUpRight" size={16} />
            </button>
          ))}
          <div className="owner-principle">
            <Icon name="UsersRound" size={24} />
            <p>
              Влиять через людей.
              <br />
              <strong>Согласовать цель → выделить ресурсы → оценить результат.</strong>
            </p>
          </div>
        </aside>
      </div>
      <SectionLabel
        index="01"
        action={
          <button className="link-button" onClick={() => g.navigate('capital', 'programs')}>
            Программы и допуск <Icon name="ArrowRight" size={14} />
          </button>
        }
      >
        Портфель гоночных программ
      </SectionLabel>
      <div className="portfolio-programs">
        {programs.map((p) => {
          const e = Object.values(g.world.entries).find(
            (e) => e.org === p.org && e.championship === p.series,
          )
          return (
            <article key={p.id}>
              <div>
                <Badge tone="good">{p.status === 'admitted' ? 'Допуск подтверждён' : p.status}</Badge>
                <h3>{g.world.championships[p.series]?.name || p.series}</h3>
                <p>{g.world.organizations[p.org]?.name}</p>
                <small>В портфеле с {short(p.since)}</small>
              </div>
              {e && <RaceCar entryId={e.id} studio={false} />}
              <div>
                <span>Ответственный руководитель</span>
                <StaffSignature person={manager} />
                <Button variant="ghost" onClick={() => g.navigate('briefings', 'engineering')}>
                  Доклад о программе <Icon name="ArrowRight" size={15} />
                </Button>
              </div>
            </article>
          )
        })}
      </div>
      <div className="owner-analytics">
        <DataChart
          type="bar"
          title="Из чего складывается оценка"
          description="Компоненты стоимости организации на текущую дату"
          unit="EUR"
          source="capital.valuation · срез карьеры"
          rows={capitalRows}
          series={[{ key: 'value', label: 'Стоимость', color: 'var(--org-accent)' }]}
          formatValue={(v) => money(v * 100, true)}
          onSelect={() => g.navigate('capital', 'assets')}
          note="Оценка модели не гарантирует цену продажи. Доходность и рыночная динамика ещё не наблюдались."
        />
        <AdvisorBrief route="capital" />
      </div>
    </div>
  )
}
function ManufacturerHome() {
  const g = useGame(),
    c = g.game.career,
    org = g.world.organizations[c.org],
    d = g.game.projections.manufacturer || {},
    [series, setSeries] = useStored('home.product.series', c.series),
    catalog = array(d.catalog),
    programs = [...new Set(catalog.map((p) => p.series))],
    products = catalog.filter((p) => p.series === series),
    unique = [...new Map(products.map((p) => [p.editions?.[0]?.id || p.entry, p])).values()],
    clients = array(d.clients),
    clientOrgs = [...new Set(clients.map((x) => x.org))],
    specialist = staff(g, ['chief-engineer', 'transmission', 'engine']),
    finance = financeModel(g),
    p0 = unique[0] || catalog[0],
    edition = p0?.editions?.at(-1),
    values = edition?.values || {}
  return (
    <div className="role-home manufacturer-home">
      <HomeHeader title="Клиенты рассчитывают на вашу технику." description={getIdentity(org).tone} />
      <div className="manufacturer-intro">
        <section className="product-ledger">
          <header>
            <div>
              <OrganizationMark size={64} wordmark />
              <span className="eyebrow">
                {(org.lines || [])
                  .map(
                    (x) =>
                      ({
                        engine: 'Силовые установки',
                        transmission: 'Трансмиссии',
                        tyre: 'Шины',
                        chassis: 'Шасси',
                      })[x] || x,
                  )
                  .join(' / ')}
              </span>
            </div>
            <Badge>Техническое предприятие</Badge>
          </header>
          <div className="product-ledger-title">
            <div>
              <span>Действующее поколение / {c.date.slice(0, 4)}</span>
              <h2>{p0?.title || 'Продуктовая программа'}</h2>
              <p>
                {g.world.championships[p0?.series]?.name} ·{' '}
                {{ engine: 'силовая установка', transmission: 'трансмиссия', tyre: 'шина' }[p0?.axis] ||
                  p0?.axis}
              </p>
            </div>
            <strong>
              {edition ? 'R' + edition.version : '—'}
              <small>редакция</small>
            </strong>
          </div>
          <div className="product-measures">
            {[
              ['mass_kg', 'Масса', 'кг'],
              [
                values.shift_ms != null ? 'shift_ms' : 'power_kw',
                values.shift_ms != null ? 'Переключение' : 'Мощность',
                values.shift_ms != null ? 'мс' : 'кВт',
              ],
              ['design_life_km', 'Проектный ресурс', 'км'],
            ]
              .filter(([k]) => values[k] != null)
              .map(([k, n, u]) => (
                <div key={k}>
                  <span>{n}</span>
                  <b>
                    {Number(values[k]).toLocaleString('ru-RU')} <small>{u}</small>
                  </b>
                </div>
              ))}
          </div>
          <div className="product-ledger-footer">
            <p>
              Паспортные значения собственной продукции. Ресурс по проекту ещё не доказывает надёжность в
              гонках.
            </p>
            <Button onClick={() => g.navigate('manufacturer', 'catalog', edition?.id)}>
              Паспорт продукта <Icon name="ArrowRight" />
            </Button>
          </div>
          <StaffSignature person={specialist} />
        </section>
        <aside className="factory-status">
          <span className="eyebrow">Промышленный контур</span>
          <h2>
            От спецификации
            <br />к поставке.
          </h2>
          {[
            ['FlaskConical', 'Исследования и поколения', 'manufacturer', 'research'],
            ['Factory', 'Цех и контроль качества', 'manufacturer', 'factory'],
            ['PackageCheck', 'Экземпляры и готовность', 'inventory', ''],
            ['Handshake', 'Соглашения с клиентами', 'commercial', 'supplies'],
          ].map(([i, n, r, t], index) => (
            <button key={n} onClick={() => g.navigate(r, t)}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <Icon name={i} size={21} />
              <b>{n}</b>
              <Icon name="ArrowRight" size={16} />
            </button>
          ))}
          <small>
            Цепочка показывает связанные разделы. Исследование не является обязательным условием каждой
            разработки.
          </small>
        </aside>
      </div>
      <div className="manufacturer-metrics">
        <button onClick={() => g.navigate('manufacturer', 'clients')}>
          <span>Организации-клиенты</span>
          <b>{clientOrgs.length}</b>
          <small>По действующей проекции поставок</small>
        </button>
        <button onClick={() => g.navigate('manufacturer', 'cases')}>
          <span>Клиентские обращения</span>
          <b>{array(d.cases).length}</b>
          <small>Техническая поддержка и решения</small>
        </button>
        <button onClick={() => g.navigate('inventory')}>
          <span>На собственном складе</span>
          <b>{array(d.inventory).filter((i) => i.status === 'stock').length}</b>
          <small>Учтённых физических экземпляров</small>
        </button>
        <button onClick={() => g.navigate('finance')}>
          <span>Доступные средства</span>
          <b>{money(finance.available, true)}</b>
          <small>С учётом резервов</small>
        </button>
      </div>
      <SectionLabel index="01">Продукты работают в разных чемпионатах</SectionLabel>
      <Tabs
        value={series}
        onChange={setSeries}
        items={programs.map((p) => ({
          id: p,
          label: g.world.championships[p]?.short_name || p.toUpperCase(),
        }))}
      />
      <div className="product-program-list">
        {unique.map((p) => {
          const e = g.world.entries[p.entry],
            v = p.editions?.at(-1)
          return (
            <article key={p.entry + p.axis}>
              <div className="product-program-copy">
                <Badge>Редакция {v?.version}</Badge>
                <h3>{p.title}</h3>
                <p>
                  {{
                    engine: 'Силовая установка',
                    transmission: 'Трансмиссия',
                    tyre: 'Шины',
                    chassis: 'Шасси',
                  }[p.axis] || p.axis}
                </p>
                <button
                  className="link-button"
                  onClick={() => g.navigate('manufacturer', 'catalog', v?.id)}
                >
                  Открыть техническую программу <Icon name="ArrowRight" size={15} />
                </button>
              </div>
              <div className="client-application">
                {e && <RaceCar entryId={e.id} studio={false} />}
                <small>Применение: {g.world.organizations[e?.org]?.name} · автомобиль клиента</small>
              </div>
              <div className="product-program-proof">
                <strong>Проверяемые данные</strong>
                <p>
                  {v?.calculations?.length || 0} расчётных режима · {p.editions?.length || 0} редакций
                </p>
                <small>
                  Натурные измерения и отказы появляются только после подтверждённых событий.
                </small>
                <Button variant="ghost" onClick={() => g.navigate('manufacturer', 'clients', e?.org)}>
                  Клиентская программа
                </Button>
              </div>
            </article>
          )
        })}
      </div>
      <SectionLabel index="02">Работа технической службы</SectionLabel>
      <AdvisorBrief route="manufacturer" />
      <OperationalAnalytics route="manufacturer" analyticsOnly />
    </div>
  )
}
export default function RoleHome() {
  const g = useGame()
  return g.role === 'owner' ? (
    <OwnerHome />
  ) : g.role === 'manufacturer' ? (
    <ManufacturerHome />
  ) : (
    <ManagerHome />
  )
}

export function BriefingRoom() {
  const g = useGame(),
    chosen = g.tab || { owner: 'capital', manufacturer: 'manufacturer', manager: 'council' }[g.role],
    sections =
      g.role === 'owner'
        ? [
            ['capital', 'Стратегия'],
            ['finance', 'Финансы'],
            ['leadership', 'Руководство'],
            ['academy', 'Академия'],
            ['engineering', 'Технический доклад'],
          ]
        : g.role === 'manufacturer'
          ? [
              ['manufacturer', 'Продукция и клиенты'],
              ['finance', 'Финансы'],
              ['production', 'Производство'],
              ['staff', 'Экспертиза'],
            ]
          : [
              ['council', 'Инженерный штаб'],
              ['finance', 'Финансы'],
              ['production', 'Производство'],
              ['drivers', 'Пилоты'],
              ['staff', 'Персонал'],
            ]
  return (
    <div className="briefing-room">
      <HomeHeader
        title={g.role === 'owner' ? 'Совет организации.' : 'На связи с вашей командой.'}
        description="Сначала — ситуация и ответственное лицо. Затем основания, варианты и детали."
      />
      <Tabs value={chosen} onChange={g.setTab} items={sections.map(([id, label]) => ({ id, label }))} />
      <OperationalAnalytics route={chosen} defaultExpanded />
    </div>
  )
}

export function OrganizationProfile() {
  const g = useGame(),
    id = g.entity || g.game.career.org,
    org = g.world.organizations[id]
  if (!org)
    return (
      <Panel title="Организация не найдена">
        <Button onClick={() => g.navigate('world')}>Вернуться в паддок</Button>
      </Panel>
    )
  const own = id === g.game.career.org,
    i = getIdentity(org),
    entries = Object.values(g.world.entries).filter((e) => e.org === id),
    tab = g.tab || 'overview',
    people = own
      ? currentSeats(g).filter((a) => a.occupant)
      : g.game.personnel.filter((p) => p.org === id).map((p) => ({ position: p.position, occupant: p })),
    events = g.world.events
      .filter((e) => e.org === id && e.start >= g.game.career.date)
      .sort((a, b) => a.start.localeCompare(b.start))
  return (
    <div className="org-profile" style={identityVars(org)}>
      <header className="org-profile-hero">
        <OrganizationMark orgId={id} size={100} />
        <div>
          <span className="eyebrow">
            {org.kind === 'team' ? 'Гоночная организация' : 'Производитель компонентов'} · {org.country}
          </span>
          <h1>{org.name}</h1>
          <p>{i.headline}</p>
          <small>
            {org.base} · {(org.programs || []).map((p) => p.toUpperCase()).join(' / ')}
          </small>
        </div>
        <Badge tone={own ? 'accent' : 'neutral'}>{own ? 'Ваша организация' : 'Публичный профиль'}</Badge>
        {own && <OrganizationPalette org={org}/>}
      </header>
      <Tabs
        value={tab}
        onChange={g.setTab}
        items={[
          { id: 'overview', label: 'Организация' },
          { id: 'people', label: 'Люди' },
          { id: 'programs', label: 'Программы и техника' },
          { id: 'history', label: 'История' },
          ...(own && g.game.career.can_edit_uniform?[{id:'uniform',label:'Экипировка'}]:[]),
        ]}
      />
      {own && g.game.career.can_edit_uniform && tab==='uniform' && <UniformEditor key={org.id} org={org}/>}
      {tab === 'overview' && (
        <div className="org-profile-layout">
          <section>
            <h2>{i.tone}</h2>
            <p>
              В игровом мире представлены {(org.programs || []).length} направлений соревнований
              {org.lines?.length
                ? ' и специализация: ' +
                  org.lines
                    .map(
                      (x) =>
                        ({ engine: 'двигатели', transmission: 'трансмиссии', tyre: 'шины' })[x] || x,
                    )
                    .join(', ')
                : ''}
              . Организация связана с {entries.length} гоночными заявками.
            </p>
            {entries[0] && <RaceCar entryId={entries[0].id} />}
            <small className="source-note">
              Сведения стартового каталога 2025. Исторические титулы не выводятся без подтверждённого
              источника.
            </small>
          </section>
          <aside>
            <dl className="detail-list">
              <div>
                <dt>База</dt>
                <dd>{org.base}</dd>
              </div>
              <div>
                <dt>Страна регистрации</dt>
                <dd>
                  {g.world.countries[org.country]?.name || g.world.countries[org.country] || org.country}
                </dd>
              </div>
              <div>
                <dt>Доступ к данным</dt>
                <dd>{own ? 'Рабочие проекции вашей роли' : 'Публичные сведения'}</dd>
              </div>
            </dl>
            {own && (
              <Button onClick={() => g.navigate('facilities', 'organization')}>
                База и инфраструктура
              </Button>
            )}
            <Upcoming events={events} />
          </aside>
        </div>
      )}
      {tab === 'people' && (
        <section className="organization-people">
          {people.slice(0, 36).map((a) => (
            <StaffSignature key={a.occupant.id} person={{ ...a.occupant, position: a.position }} />
          ))}
          {!people.length && (
            <p>
              В публичном кадровом справочнике нет назначений для этого профиля. Конфиденциальные
              сведения организации не раскрываются.
            </p>
          )}
        </section>
      )}
      {tab === 'programs' && (
        <div className="portfolio-programs">
          {(org.programs || []).map((series) => {
            const es = entries.filter((e) => e.championship === series)
            return (
              <article key={series}>
                <div>
                  <h2>{g.world.championships[series]?.name || series}</h2>
                  <p>{es.length} заявок</p>
                  <Button variant="ghost" onClick={() => g.navigate('world', 'entries', id)}>
                    Открыть участников
                  </Button>
                </div>
                {es[0] && <RaceCar entryId={es[0].id} studio={false} />}
                <div>
                  {[...new Set(es.map((e) => g.world.cars[e.car]?.name))].map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}
      {tab === 'history' && (
        <div className="organization-history">
          <EntityStatistics type={org.kind === 'team' ? 'teams' : 'manufacturers'} id={id} />
        </div>
      )}
    </div>
  )
}
