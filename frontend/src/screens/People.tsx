import { useState, type ReactNode } from 'react'
import { ChevronRight, Users, HeartPulse, CalendarClock, Search, ScanSearch, Columns2 } from 'lucide-react'
import { useGame, useUI } from '../ui/context'
import { Header, Button, Panel, Table, Confirm, Facts, Choices, Progress } from '../ui/components'
import { eur, type Person } from '../game'
import { seriesNames } from '../ui/labels'

function Portrait({ person: p }: { person: Person }) {
  return (
    <div className="people-avatar people-avatar-large">
      <span className="people-initials">
        {p.name
          .split(' ')
          .map((n) => n[0])
          .join('')}
      </span>
      {p.image && <img src={p.image} alt={p.name} />}
    </div>
  )
}
function Skill({ label, value }: { label: string; value: number }) {
  return (
    <div className="people-stat">
      <div>
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <Progress value={value} />
    </div>
  )
}
function Traits({ person }: { person: Person }) {
  const { open } = useUI()
  return (
    <div className="people-traits">
      {person.traits.map(([name, type, effect]) => (
        <button
          key={name}
          className={'people-trait people-trait-' + type}
          onClick={() => open(name, <p>{effect}</p>)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

function OfferForm({
  id,
  name,
  price,
  supply = false,
}: {
  id: string
  name: string
  price: number
  supply?: boolean
}) {
  const { send } = useGame(),
    { open } = useUI()
  const [years, setYears] = useState(2),
    [salary, setSalary] = useState(String(price))
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        open(
          'Подтвердить предложение',
          <Confirm
            action="Отправить"
            onConfirm={() =>
              send({
                type: 'offer',
                offer: {
                  id,
                  name,
                  kind: supply ? 'Поставка' : 'Контракт',
                  years,
                  annualEuro: Number(salary),
                },
              })
            }
          >
            <p>
              {name} · {years} сез. · {eur(Number(salary))} в год
            </p>
            <p>Предложение появится в демонстрационном списке переговоров.</p>
          </Confirm>,
        )
      }}
    >
      <div className="eyebrow">{supply ? 'Договор поставки' : 'Условия контракта'}</div>
      <h2>{name}</h2>
      <label className="field">
        Срок договора, сезонов
        <select value={years} onChange={(e) => setYears(+e.target.value)}>
          {[1, 2, 3].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <label className="field">
        {supply ? 'Стоимость пакета, €/год' : 'Зарплата, €/год'}
        <input
          required
          type="number"
          min="1"
          max="999999999"
          step="1"
          readOnly={supply}
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
        />
      </label>
      <button className="btn btn-primary" type="submit">
        Проверить предложение
      </button>
    </form>
  )
}
function OfferButton({
  id,
  name,
  price,
  supply = false,
}: {
  id: string
  name: string
  price: number
  supply?: boolean
}) {
  const { state } = useGame(),
    { open } = useUI()
  if (state.role !== 'manager') return <small className="muted">Переговоры ведёт менеджер</small>
  const exists = state.offers.some((o) => o.id === id)
  return (
    <Button
      primary
      disabled={exists}
      onClick={() =>
        open(
          supply ? 'Предложение поставщика' : 'Контрактное предложение',
          <OfferForm {...{ id, name, price, supply }} />,
        )
      }
    >
      {exists ? 'На рассмотрении' : supply ? 'Запросить условия' : 'Переговоры'}
    </Button>
  )
}
export function Profile({ person: p }: { person: Person }) {
  const [tab, setTab] = useState('profile')
  return (
    <>
      <div className="profile-lead">
        <Portrait person={p} />
        <div>
          <p className="eyebrow">{p.latin}</p>
          <h2>{p.name}</h2>
          <p>
            {p.role} · {p.team}
          </p>
          <small>
            {p.country} · {p.age} лет · Рейтинг {p.rating}
          </small>
        </div>
      </div>
      <Choices
        label="Досье"
        items={[
          ['profile', 'Профиль'],
          ['history', 'История'],
          ['contract', 'Контракт'],
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'profile' ? (
        <>
          <p>{p.bio}</p>
          <div className="people-card-skills">
            {p.skills.map(([label, value]) => (
              <Skill key={label} {...{ label, value }} />
            ))}
          </div>
          {p.traits.map(([name, , effect]) => (
            <div className="modal-callout" key={name}>
              <strong>{name}</strong>
              <p>{effect}</p>
            </div>
          ))}
        </>
      ) : tab === 'history' ? (
        <Table
          label="История карьеры"
          columns={['Сезон', 'Организация', 'Результат']}
          rows={p.history.map(([year, org, result]) => ({ id: year, cells: [year, org, result] }))}
        />
      ) : (
        <>
          <Facts
            items={[
              ['Организация', p.team],
              ['Контракт до', p.until],
              ['Годовая зарплата', eur(p.salary)],
            ]}
          />
          <OfferButton id={p.id} name={p.name} price={p.salary} />
        </>
      )}
    </>
  )
}
function Comparison({ persons: [a, b] }: { persons: Person[] }) {
  const labels = [...new Set([...a.skills, ...b.skills].map(([name]) => name))]
  return (
    <Table
      label="Сравнение профилей"
      columns={['Параметр', a.name, b.name]}
      rows={[
        { id: 'rating', cells: ['Рейтинг', a.rating, b.rating] },
        ...labels.map((l) => ({
          id: l,
          cells: [l, ...[a, b].map((p) => p.skills.find(([k]) => k === l)?.[1] ?? '—')],
        })),
        { id: 'contract', cells: ['Контракт до', a.until, b.until] },
      ]}
    />
  )
}
function Negotiations() {
  const { state } = useGame()
  return state.offers.length ? (
    <Table
      label="Активные переговоры"
      columns={['Сторона', 'Договор', 'Сезонов', '€/год', 'Статус']}
      rows={state.offers.map((o) => ({
        id: o.id,
        cells: [o.name, o.kind, o.years, eur(o.annualEuro), 'На рассмотрении'],
      }))}
    />
  ) : (
    <div className="empty-state">
      <h3>Открытых переговоров пока нет</h3>
      <p>Выберите кандидата или доступного поставщика на рынке.</p>
    </div>
  )
}
function PersonCard({ p, select, profile }: { p: Person; select: ReactNode; profile: () => void }) {
  return (
    <article className="people-person-card panel">
      <div className="people-person-top">
        <div className="people-person-photo">
          <Portrait person={p} />
          {p.number && <span className="people-car-number">{p.number}</span>}
        </div>
        <div className="people-person-info">
          <span className="eyebrow">{p.role}</span>
          <button className="people-name-button" onClick={profile}>
            <h2>{p.name}</h2>
          </button>
          <p>
            {p.country} · {p.age} лет
          </p>
          <div className="people-race-record">
            {p.position && (
              <strong>
                {p.position}
                <small>МЕСТО</small>
              </strong>
            )}
            <strong>
              {p.points ?? p.morale}
              <small>{p.points === undefined ? 'МОРАЛЬ' : 'ОЧКОВ'}</small>
            </strong>
          </div>
        </div>
        <span className="people-rating">
          {p.rating}
          <small>РЕЙТИНГ</small>
        </span>
      </div>
      <div className="people-person-content">
        <Traits person={p} />
        <div className="people-card-skills">
          {p.skills.slice(0, 4).map(([label, value]) => (
            <Skill key={label} {...{ label, value }} />
          ))}
        </div>
        <div className="people-card-contract">
          <span>
            Контракт <strong>до {p.until}</strong>
          </span>
          <span>{eur(p.salary)}/год</span>
        </div>
        {p.until === 2028 && (
          <div className="contract-warning">
            Контракт заканчивается в этом сезоне <OfferButton id={p.id} name={p.name} price={p.salary} />
          </div>
        )}
      </div>
      <footer className="people-card-footer">
        {select}
        <button className="people-profile-link" onClick={profile}>
          Открыть досье <ChevronRight aria-hidden="true" size={15} />
        </button>
      </footer>
    </article>
  )
}
function Suppliers({ query }: { query: string }) {
  const { data } = useGame(),
    { open } = useUI(),
    [type, setType] = useState('all')
  const cards = data.suppliers.filter(
    (s) =>
      (type === 'all' || s.type === type) &&
      (s.name + ' ' + s.maker).toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <Choices
        label="Изделия"
        segmented
        items={[
          ['all', 'Все изделия'],
          ['engine', 'Двигатели'],
          ['gearbox', 'Коробки'],
        ]}
        active={type}
        onChange={setType}
      />
      <div className="card-grid">
        {cards.map((s) => (
          <Panel key={s.id} title={s.name} action={<span className="chip">{s.tag}</span>}>
            <div className="panel-body">
              <div className="eyebrow">{s.maker}</div>
              <p>{s.detail}</p>
              <Facts
                items={[
                  ['Мощность', s.power],
                  ['Надёжность', s.reliability],
                  ['Стоимость', eur(s.cost)],
                ]}
              />
              <Button
                onClick={() =>
                  open(
                    s.name,
                    <>
                      <p>{s.detail}</p>
                      <Facts
                        items={[
                          ['Производитель', s.maker],
                          ['Договор', s.contract],
                          ['Доступность', s.availability],
                          ['Эффективность', s.efficiency],
                        ]}
                      />
                      {!s.id.startsWith('vanta-') && (
                        <OfferButton id={s.id} name={s.name} price={s.cost} supply />
                      )}
                    </>,
                  )
                }
              >
                Спецификация
              </Button>
            </div>
          </Panel>
        ))}
      </div>
      {!cards.length && <div className="empty-state">Поставщики не найдены</div>}
    </>
  )
}
export function People({ market = false }: { market?: boolean }) {
  const { state, data } = useGame(),
    { go, open } = useUI()
  const [tab, setTab] = useState('drivers'),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [sort, setSort] = useState('rating'),
    [ids, setIds] = useState<string[]>([])
  const source = market ? data.candidates : data.people
  const matches = source
    .filter(
      (p) =>
        p.kind === tab &&
        (filter === 'all' || (market ? p.series === filter : p.until === 2028)) &&
        [p.name, p.team, p.country, p.role].join(' ').toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'age'
        ? a.age - b.age
        : sort === 'salary'
          ? a.salary - b.salary
          : sort === 'name'
            ? a.name.localeCompare(b.name, 'ru')
            : b.rating - a.rating,
    )
  const select = (p: Person) => (
    <label>
      <input
        type="checkbox"
        aria-label={'Сравнить: ' + p.name}
        checked={ids.includes(p.id)}
        disabled={!ids.includes(p.id) && ids.length === 2}
        onChange={(e) => setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))}
      />{' '}
      {market ? null : 'Сравнить'}
    </label>
  )
  const profile = (p: Person) => open(p.name, <Profile person={p} />)
  const compare = (
    <Button
      disabled={ids.length !== 2}
      onClick={() =>
        open('Сравнение профилей', <Comparison persons={source.filter((p) => ids.includes(p.id))} />)
      }
    >
      <Columns2 aria-hidden="true" size={16} />
      Сравнить {ids.length}/2
    </Button>
  )
  return (
    <section className={market ? 'market-screen' : 'people-screen'}>
      <Header
        section={market ? 'Мотоспорт / Рынок' : 'VANTA Racing / Команда'}
        title={market ? 'Рынок и поставщики' : 'Пилоты и персонал'}
        sub={
          market
            ? 'Найдите людей и технологии, которые изменят вашу команду.'
            : 'Пилоты, инженеры и характеры за результатом.'
        }
      >
        {market ? (
          <Button onClick={() => open('Активные переговоры', <Negotiations />)}>
            Переговоры · {state.offers.length}
          </Button>
        ) : (
          <Button onClick={() => go('market')}>
            <ScanSearch aria-hidden="true" size={16} />
            Открыть рынок
          </Button>
        )}
      </Header>
      {!market && (
        <div className="people-summary">
          {[
            [Users, 'Основной состав', '2 пилота · 3 руководителя'],
            [HeartPulse, 'Атмосфера в команде', 'Стабильная · 88/100'],
            [CalendarClock, 'Контракты до конца сезона', 'Вебер, Бергер'],
          ].map(([I, title, note]) => {
            const Icon = I as typeof Users
            return (
              <div key={String(title)}>
                <span className="people-summary-icon">
                  <Icon aria-hidden="true" size={18} />
                </span>
                <span>
                  {String(title)}
                  <strong>{String(note)}</strong>
                </span>
              </div>
            )
          })}
        </div>
      )}
      <Choices
        label="Категория"
        items={[
          ['drivers', 'Пилоты'],
          ['staff', 'Персонал'],
          market ? ['suppliers', 'Поставщики'] : ['academy', 'Академия'],
        ]}
        active={tab}
        onChange={(v) => {
          setTab(v)
          setIds([])
          setFilter('all')
          setQuery('')
        }}
      />
      <div className="people-toolbar">
        <label className="people-search">
          <Search aria-hidden="true" size={16} />
          <input
            type="search"
            aria-label="Поиск по списку"
            placeholder={market ? 'Имя, команда или поставщик' : 'Имя, должность, страна'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {tab !== 'suppliers' && (
          <>
            <select aria-label="Фильтр" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{market ? 'Все дисциплины' : 'Все контракты'}</option>
              {market ? (
                Object.entries(seriesNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))
              ) : (
                <option value="ending">Истекают в 2028</option>
              )}
            </select>
            <select aria-label="Сортировка" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="rating">По рейтингу</option>
              <option value="age">По возрасту</option>
              <option value="name">По имени</option>
              {market && <option value="salary">По зарплате</option>}
            </select>
            {compare}
          </>
        )}
      </div>
      {tab === 'suppliers' ? (
        <Suppliers query={query} />
      ) : !matches.length ? (
        <div className="empty-state panel">
          <h3>Никого не нашли</h3>
          <Button
            onClick={() => {
              setFilter('all')
              setQuery('')
            }}
          >
            Сбросить фильтры
          </Button>
        </div>
      ) : market ? (
        <section className="market-table panel" aria-label="Кандидаты">
          <div className="market-table-header">
            {['Кандидат', 'Рейтинг', 'Зарплата / год', 'Контракт', 'Действия'].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          {matches.map((p) => (
            <article className="market-candidate" key={p.id}>
              <div className="market-candidate-identity">
                <div className="market-check-label">{select(p)}</div>
                <Portrait person={p} />
                <div>
                  <button onClick={() => profile(p)}>{p.name}</button>
                  <p>
                    {p.age} лет · {p.country}
                  </p>
                  <span>
                    {p.team} <em>{p.role}</em>
                  </span>
                </div>
              </div>
              <div className="market-cell-rating">
                <span className="market-mobile-label">Рейтинг</span>
                <strong>{p.rating}</strong>
              </div>
              <div className="market-cell-salary">
                <span className="market-mobile-label">Зарплата</span>
                <strong>{eur(p.salary)}</strong>
                <small>за сезон</small>
              </div>
              <div className="market-cell-contract">
                <span className="market-mobile-label">Контракт</span>
                <strong>до {p.until}</strong>
                <small>Открыт к переговорам</small>
              </div>
              <div className="market-cell-action">
                <OfferButton id={p.id} name={p.name} price={p.salary} />
              </div>
              <div className="market-candidate-traits">
                <Traits person={p} />
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="people-cards">
          {matches.map((p) => (
            <PersonCard key={p.id} p={p} select={select(p)} profile={() => profile(p)} />
          ))}
        </div>
      )}
    </section>
  )
}
