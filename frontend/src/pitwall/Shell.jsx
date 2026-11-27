import React, { useState, useRef, useEffect } from 'react'
import { useGame, useStored, dateLabel } from './core'
import { Icon, Button } from './ui'
import { OrganizationMark, getIdentity, identityVars, roleNames } from './v2/identity'
import { roleNavigation, activeNavigation } from './v2/navigation'
export function Shell({ children, onSave, onAdvance, busy }) {
  const c = useGame(),
    { role, route, tab, game, world, navigate, openDialog } = c
  const drawerRef = useRef(null),
    searchRef = useRef(null),
    [small, setSmall] = useState(() => matchMedia('(max-width:900px)').matches),
    [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState('')
  const [compact, setCompact] = useStored('preferences.compact', false),
    [reduceMotion, setMotion] = useStored('preferences.motion', false)
  const org = world.organizations[game.career.org],
    identity = getIdentity(org),
    orgTitle = game.career.team_names?.[org.id] || org.name,
    relevant = roleNavigation(role),
    active = activeNavigation(relevant, route, tab)
  const activeChild = active?.children.find(([r, , t]) => r === route && (!t || t === tab))
  useEffect(() => {
    const m = matchMedia('(max-width:900px)'),
      h = (e) => setSmall(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  useEffect(() => {
    setDrawer(false)
    setSearch(false)
  }, [route, tab])
  useEffect(() => {
    if (!drawer && !search) return
    const before = document.activeElement,
      node = search ? searchRef.current : drawerRef.current
    node?.querySelector(search ? 'input' : '.mobile-close')?.focus()
    return () => before?.focus?.()
  }, [drawer, search])
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch((v) => !v)
      }
      if (e.key === 'Escape') {
        setSearch(false)
        setDrawer(false)
      }
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [])
  function trapKeys(e) {
    if (e.key !== 'Tab') return
    const a = Array.from(
      e.currentTarget.querySelectorAll('button:not([disabled]),input,select,[tabindex="0"]'),
    ).filter((n) => n.getClientRects().length)
    if (e.shiftKey && document.activeElement === a[0]) {
      e.preventDefault()
      a.at(-1)?.focus()
    } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
      e.preventDefault()
      a[0]?.focus()
    }
  }
  const routeHref = (page, tab) => '#' + page + (tab ? '?' + new URLSearchParams({ tab }) : '')
  const closeMenus = () => {
    setDrawer(false)
    setSearch(false)
  }
  function nav(r, t = '', e = '') {
    navigate(r, t, e)
    setDrawer(false)
    setSearch(false)
  }
  const q = query.toLowerCase().trim(),
    links = relevant
      .flatMap((g) => [[g.destination || g.id, g.label, g.defaultTab], ...g.children])
      .filter(([, label]) => !q || label.toLowerCase().includes(q))
      .filter((x, i, a) => a.findIndex((y) => y[0] === x[0] && y[2] === x[2]) === i)
      .slice(0, 8),
    people = q ? game.personnel.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6) : [],
    organizations = q
      ? Object.values(world.organizations)
          .filter((o) => o.name.toLowerCase().includes(q))
          .slice(0, 5)
      : []
  const dock =
    role === 'owner'
      ? [
          ['Landmark', 'overview', 'Портфель'],
          ['MessagesSquare', 'briefings', 'Доклады'],
          ['Wallet', 'finance', 'Финансы'],
          ['UserRoundCheck', 'leadership', 'Мандат'],
        ]
      : role === 'manufacturer'
        ? [
            ['Factory', 'overview', 'Компания'],
            ['Layers', 'manufacturer', 'Продукты'],
            ['Headset', 'manufacturer', 'Клиенты', 'clients'],
            ['MessagesSquare', 'briefings', 'Совет'],
          ]
        : [
            ['RadioTower', 'overview', 'Штаб'],
            ['MessagesSquare', 'briefings', 'Доклады'],
            ['CarFront', 'garage', 'Машины'],
            ['CalendarDays', 'calendar', 'Календарь'],
          ]
  return (
    <div
      className={
        'game-shell role-' +
        role +
        ' ' +
        (compact ? 'compact ' : '') +
        (reduceMotion ? 'reduce-motion' : '')
      }
      style={identityVars(org)}
    >
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content').focus()
        }}
      >
        Перейти к содержимому
      </a>
      <aside
        ref={drawerRef}
        role={small && drawer ? 'dialog' : undefined}
        aria-modal={small && drawer ? true : undefined}
        aria-label={small ? 'Главная навигация' : undefined}
        onKeyDown={small && drawer ? trapKeys : undefined}
        className={'sidebar ' + (drawer ? 'open' : '')}
        inert={search || (small && !drawer) ? true : undefined}
      >
        <div className="sidebar-brand-row">
          <button className="brand" onClick={() => nav('menu')} aria-label="Главное меню">
            <strong>
              AUTOSPORT<span>SIM</span>
            </strong>
            <small>PIT WALL / 02</small>
          </button>
          <button
            className="icon-button mobile-close"
            aria-label="Закрыть навигацию"
            onClick={() => setDrawer(false)}
          >
            ×
          </button>
        </div>
        <button className="team-identity" onClick={() => c.openOrganization(org.id)}>
          <OrganizationMark size={45} />
          <span>
            <strong>{identity.wordmark}</strong>
            <small>{roleNames[role]}</small>
            <em>{org.base}</em>
          </span>
          <Icon name="ArrowUpRight" size={13} />
        </button>
        <nav className="primary-nav" aria-label="Главная навигация">
          <div className="nav-caption">
            {role === 'owner'
              ? 'СОВЕТ ОРГАНИЗАЦИИ'
              : role === 'manufacturer'
                ? 'ПРОМЫШЛЕННАЯ ПРОГРАММА'
                : 'ГОНОЧНАЯ ПРОГРАММА'}{' '}
            <b>{game.career.date.slice(0, 4)}</b>
          </div>
          {relevant.map((g, i) => (
            <div key={g.id}>
              <a
                className={'nav-item ' + (active?.id === g.id ? 'active' : '')}
                href={routeHref(g.destination || g.id, g.defaultTab)}
                onClick={closeMenus}
              >
                <Icon name={g.icon} size={18} />
                <span>{g.label}</span>
                {g.children.length > 0 && <Icon name="ChevronRight" size={12} />}
              </a>
              {active?.id === g.id && g.children.length > 0 && (
                <div className="subnav">
                  {g.children.map(([id, label, t]) => (
                    <a
                      key={id + (t || '')}
                      className={
                        route === id && (!t || tab === t || (!tab && t === 'catalog')) ? 'active' : ''
                      }
                      href={routeHref(id, t)}
                      onClick={closeMenus}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              )}
              {i === 1 && <div className="nav-divider" />}
            </div>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <button onClick={() => nav('saves')}>
            <Icon name="FolderOpen" size={15} />
            Сохранённые карьеры
          </button>
          <button
            onClick={() =>
              openDialog({
                title: 'Параметры интерфейса',
                content: (
                  <div className="stack">
                    <Button
                      onClick={() => {
                        setCompact(!compact)
                        c.closeDialog()
                      }}
                    >
                      Плотность: {compact ? 'компактная' : 'обычная'}
                    </Button>
                    <Button
                      onClick={() => {
                        setMotion(!reduceMotion)
                        c.closeDialog()
                      }}
                    >
                      Анимации: {reduceMotion ? 'сокращены' : 'включены'}
                    </Button>
                  </div>
                ),
              })
            }
          >
            <Icon name="Settings2" size={15} />
            Параметры <span>02</span>
          </button>
        </footer>
      </aside>
      {drawer && (
        <button className="nav-scrim" aria-label="Закрыть навигацию" onClick={() => setDrawer(false)} />
      )}
      <div className="workspace" inert={drawer || search ? true : undefined}>
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu"
              aria-label="Открыть навигацию"
              onClick={() => setDrawer(true)}
            >
              <Icon name="Menu" size={23} />
            </button>
            <button
              className="icon-button navigation-back"
              aria-label="Назад к предыдущему экрану"
              disabled={!c.canGoBack}
              onClick={c.goBack}
            >
              <Icon name="ArrowLeft" size={19} />
            </button>
            <div className="breadcrumb">
              <span>
                {role === 'owner'
                  ? 'СОВЕТ'
                  : role === 'manufacturer'
                    ? 'ПРЕДПРИЯТИЕ'
                    : game.career.series.toUpperCase()}
              </span>
              <Icon name="ChevronRight" size={12} />
              <strong>
                {activeChild?.[1] ||
                  active?.label ||
                  {
                    organization: 'Профиль организации',
                    person: 'Досье',
                    scenarios: 'Сценарии',
                    statistics: 'История мира',
                    agreements: 'Договорная комната',
                    funding: 'Финансирование пилотов',
                    academy: 'Академия',
                  }[route] ||
                  'PIT WALL'}
              </strong>
            </div>
          </div>
          <button className="global-search" aria-label="Поиск в паддоке" onClick={() => setSearch(true)}>
            <Icon name="Search" size={18} />
            <span>Поиск</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="icon-button save-action" aria-label="Сохранение карьеры" onClick={onSave}>
            <Icon name="Save" size={18} />
          </button>
          <div className="topbar-date">
            <strong>{dateLabel(game.career.date).replace(' 2025 г.', '')}</strong>
            <span>Сезон / {game.career.date.slice(0, 4)}</span>
          </div>
          <button
            className="continue-button"
            aria-label={game.career.pending.length ? 'Брифинг' : 'Продолжить'}
            disabled={busy || (!game.career.pending.length && !game.career.next_date)}
            onClick={onAdvance}
          >
            <span>{game.career.pending.length ? 'Брифинг' : 'Продолжить'}</span>
            <Icon name="ChevronRight" size={22} />
          </button>
        </header>
        <main
          className="main-scroll"
          id="main-content"
          tabIndex={-1}
          key={route + role + game.career.org}
        >
          <div className="main-inner">{children}</div>
          <footer className="content-footer">
            <span>
              {orgTitle} · {roleNames[role]}
            </span>
            <button onClick={onSave}>Сохранение карьеры</button>
          </footer>
        </main>
        <nav className="mobile-dock" aria-label="Мобильная навигация">
          {dock.map(([icon, r, label, t], i) => (
            <button
              key={r + i}
              className={r === route && (!t || tab === t) ? 'active' : ''}
              onClick={() => nav(r, t || '')}
            >
              <Icon name={icon} size={21} />
              {label}
            </button>
          ))}
          <button onClick={() => setDrawer(true)}>
            <Icon name="Menu" size={21} />
            Ещё
          </button>
        </nav>
      </div>
      {search && (
        <div
          className="search-overlay"
          onClick={(e) => e.target === e.currentTarget && setSearch(false)}
        >
          <section
            ref={searchRef}
            onKeyDown={trapKeys}
            role="dialog"
            aria-modal="true"
            aria-label="Поиск в паддоке"
            className="search-dialog"
          >
            <div className="search-input">
              <Icon name="Search" />
              <input
                autoFocus
                placeholder="Человек, команда или раздел…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="icon-button"
                aria-label="Закрыть поиск"
                onClick={() => setSearch(false)}
              >
                ×
              </button>
            </div>
            <div className="search-results">
              {links.length > 0 && <h3>Разделы вашей роли</h3>}
              {links.map(([r, l, t]) => (
                <button key={r + t} onClick={() => nav(r, t || '')}>
                  <Icon name="Command" size={18} />
                  {l}
                  <Icon name="ArrowRight" size={16} />
                </button>
              ))}
              {people.length > 0 && <h3>Люди</h3>}
              {people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    c.openPerson(p.id)
                    setSearch(false)
                  }}
                >
                  <Icon name="Users" size={18} />
                  {p.name}
                  <Icon name="ArrowRight" size={16} />
                </button>
              ))}
              {organizations.length > 0 && <h3>Организации</h3>}
              {organizations.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    c.openOrganization(o.id)
                    setSearch(false)
                  }}
                >
                  <OrganizationMark orgId={o.id} size={25} />
                  {o.name}
                </button>
              ))}
              {q && !links.length && !people.length && !organizations.length && (
                <p>Совпадений нет. Попробуйте другое название.</p>
              )}
              <button className="search-world" onClick={() => nav('statistics')}>
                Открыть статистический центр мира <Icon name="ArrowRight" size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
