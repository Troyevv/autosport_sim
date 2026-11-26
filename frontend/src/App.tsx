import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Menu,
  Settings as SettingsIcon,
  ChevronsUpDown,
  Search as SearchIcon,
  Bell,
  Play,
} from 'lucide-react'
import { Dialog, Button } from './ui/components'
import { useGame, useUI, UIContext, type Route } from './ui/context'
import { routes, resolve } from './ui/navigation'
import { Roles, Inbox, Search, Settings } from './ui/ShellActions'
import { roles } from './ui/labels'
import { dateLabel } from './game'
import { Overview } from './screens/Overview'
import { People } from './screens/People'
import { Garage } from './screens/Garage'
import { Development, Finance } from './screens/Engineering'
import { Calendar, World } from './screens/World'
import { Organization, Production } from './screens/Business'
import { Race } from './screens/Race'

function Navigation({ route }: { route: Route }) {
  const { state } = useGame(),
    { go, open } = useUI()
  return (
    <>
      <div className="brand">
        <div className="brand-stripes">
          <i />
          <i />
          <i />
        </div>
        <div>
          <div className="brand-word">APEX</div>
          <small>MOTORSPORT MANAGER</small>
        </div>
      </div>
      <button
        className="team-switch"
        aria-label="Сменить игровую роль"
        onClick={() => open('Рабочее место', <Roles />)}
      >
        <span className="team-monogram">V</span>
        <span>
          <strong>{roles[state.role].org}</strong>
          <small>{roles[state.role].name}</small>
        </span>
        <ChevronsUpDown aria-hidden="true" size={15} />
      </button>
      <nav className="nav" aria-label="Основная навигация">
        {routes
          .filter((r) => !r.role || r.role === state.role)
          .map((r) => (
            <Fragment key={r.id}>
              {r.group && <div className="nav-group">{r.group.toUpperCase()}</div>}
              <button
                className={'nav-link ' + (route === r.id ? 'active' : '')}
                aria-current={route === r.id ? 'page' : undefined}
                onClick={() => go(r.id)}
              >
                <r.icon aria-hidden="true" size={18} />
                {r.name}
                {r.id === 'race' && <span className="nav-live" />}
              </button>
            </Fragment>
          ))}
      </nav>
      <div className="nav-fill" />
      <div className="sidebar-footer">
        <span className="user-avatar">АА</span>
        <div>
          <strong>Александр</strong>
          <small>Демо · сезон 2028</small>
        </div>
        <button className="icon-btn" aria-label="Настройки" onClick={() => open('Настройки', <Settings />)}>
          <SettingsIcon aria-hidden="true" size={17} />
        </button>
      </div>
    </>
  )
}

export function App() {
  const { state, data, send } = useGame()
  const [hash, setHash] = useState(() => location.hash.slice(1))
  const route = resolve(hash, state.role)
  const [dialog, setDialog] = useState<{ title: string; body: ReactNode } | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const main = useRef<HTMLElement>(null)
  const open = useCallback((title: string, body: ReactNode) => {
    if (!document.querySelector('dialog[open]')) trigger.current = document.activeElement as HTMLElement
    setDialog({ title, body })
  }, [])
  const close = useCallback(() => {
    setDialog(null)
    requestAnimationFrame(() => {
      const target = trigger.current
      if (target?.isConnected && !target.matches(':disabled') && target.getClientRects().length) target.focus()
      else main.current?.focus()
    })
  }, [])
  const go = useCallback((to: Route) => {
    setDialog(null)
    if (location.hash !== '#' + to) location.hash = to
    setHash(to)
    window.scrollTo(0, 0)
    requestAnimationFrame(() => main.current?.focus({ preventScroll: true }))
  }, [])
  useEffect(() => {
    const onHash = () => {
      setHash(location.hash.slice(1))
      setDialog(null)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (location.hash !== '#' + route) {
      history.replaceState(null, '', '#' + route)
      setHash(route)
    }
  }, [hash, route])
  useEffect(() => {
    document.body.classList.toggle('reduce-motion', !state.motion)
  }, [state.motion])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open('Поиск по игре', <Search />)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open])
  useEffect(() => {
    document.body.classList.toggle('compact', state.compact)
  }, [state.compact])
  const menu = () =>
    open(
      'Меню',
      <div className="mobile-menu">
        <Navigation route={route} />
        <div className="form-actions">
          <Button onClick={() => open('Поиск по игре', <Search />)}>
            <SearchIcon aria-hidden="true" size={16} />
            Поиск
          </Button>
          <Button onClick={() => open('Входящие сообщения', <Inbox />)}>
            <Bell aria-hidden="true" size={16} />
            Входящие
          </Button>
        </div>
      </div>,
    )
  const unread = data.messages.length - state.read.length
  const screens: Record<Route, ReactNode> = {
    overview: <Overview />,
    people: <People />,
    garage: <Garage />,
    development: <Development />,
    race: <Race />,
    calendar: <Calendar />,
    world: <World />,
    market: <People market />,
    finance: <Finance />,
    organization: <Organization />,
    production: <Production />,
  }
  return (
    <UIContext.Provider value={{ open, close, go }}>
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault()
          main.current?.focus()
        }}
      >
        К содержимому
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <Navigation route={route} />
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-btn desktop-hide" aria-label="Открыть меню" onClick={menu}>
                <Menu aria-hidden="true" size={21} />
              </button>
              <b className="desktop-hide mobile-brand">APEX</b>
              <div className="topbar-breadcrumb">
                {data.world[route === 'race' ? 'formula' : state.series].title.toUpperCase()}
                <span>/</span>
                {routes.find((r) => r.id === route)?.name.toUpperCase()}
              </div>
              <span className="season-chip">2028</span>
              <span className="demo-chip">Демо</span>
            </div>
            <div className="topbar-right">
              <button className="top-search desktop-only" onClick={() => open('Поиск по игре', <Search />)}>
                <SearchIcon aria-hidden="true" size={17} />
                Поиск <kbd>Ctrl K</kbd>
              </button>
              <button
                className="icon-btn desktop-only"
                aria-label={'Уведомления: ' + unread}
                onClick={() => open('Входящие сообщения', <Inbox />)}
              >
                <Bell aria-hidden="true" size={18} />
                {unread > 0 && <span className="notification-count">{unread}</span>}
              </button>
              <div className="top-date">
                <strong>{dateLabel(state.date)}</strong>
                <span>Сезон 2028</span>
              </div>
              <Button
                primary
                disabled={route === 'race'}
                title={
                  route === 'race' ? 'Управление показом в гоночном центре' : 'Следующий день демонстрации'
                }
                onClick={() => send({ type: 'advance' })}
              >
                Продолжить <Play aria-hidden="true" size={12} />
              </Button>
            </div>
          </header>
          <main id="content" ref={main} tabIndex={-1} key={route}>
            {screens[route]}
          </main>
        </div>
        <nav className="mobile-bottom" aria-label="Быстрая навигация">
          {(['overview', 'people', 'garage', 'race'] as const).map((id, i) => {
            const item = routes.find((r) => r.id === id)!
            return (
              <button
                key={id}
                className={route === resolve(id, state.role) ? 'active' : ''}
                onClick={() => go(id)}
              >
                <item.icon aria-hidden="true" />
                <span>{['Штаб', 'Команда', 'Гараж', 'Гонка'][i]}</span>
              </button>
            )
          })}
          <button onClick={menu}>
            <Menu aria-hidden="true" />
            <span>Ещё</span>
          </button>
        </nav>
      </div>
      {dialog && (
        <Dialog title={dialog.title} onClose={close}>
          {dialog.body}
        </Dialog>
      )}
    </UIContext.Provider>
  )
}
