import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  ChevronLeft,
  Download,
  Factory,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  Microscope,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { Dialog, Button, Facts } from '../ui/components'
import { dateLabel } from '../game'
import { roles } from '../ui/labels'
import { Calendar, Overview, People, Finance, Championships, Briefing, type SectionProps } from './Sections'
import { api, assetUrl, ApiError, explain, post } from './api'
import { Budget, CostCap } from './finance/Budget'
import { Facilities } from './finance/Facilities'
import { Capital } from './finance/Capital'
import { Economy } from './finance/Economy'
import { Rights } from './finance/Rights'
import { Commercial } from './finance/Commercial'
import { SeasonGarage } from '../garage/Garage'
import { Development } from './development/Development'
import { Manufacturer } from './manufacturer/Manufacturer'
import { Programme } from './programme/Programme'
import { Council } from './council/Council'
import { Research } from './research/Research'
import { Production } from './production/Production'
import { Brand } from './Library'
const sections = [
  { id: 'overview', name: 'Штаб', icon: LayoutDashboard, view: Overview },
  { id: 'people', name: 'Пилоты и персонал', icon: Users, view: People },
  { id: 'calendar', name: 'Календарь', icon: CalendarDays, view: Calendar },
  { id: 'garage', name: 'Гараж', icon: CarFront, view: SeasonGarage },
  { id: 'world', name: 'Чемпионаты', icon: Trophy, view: Championships },
  { id: 'engineering', name: 'Техническая программа', icon: Gauge, view: Programme },
  { id: 'manufacturer', name: 'Служба производителей', icon: Factory, view: Manufacturer },
  { id: 'council', name: 'Инженерный штаб', icon: Users, view: Council },
  { id: 'development', name: 'Разработка и испытания', icon: Gauge, view: Development },
  { id: 'production', name: 'Производственный центр', icon: Factory, view: Production },
  { id: 'research', name: 'Исследования', icon: Microscope, view: Research },
  { id: 'rights', name: 'Рекламные права', icon: CarFront, view: Rights },
  { id: 'commercial', name: 'Коммерческий отдел', icon: Factory, view: Commercial },
  { id: 'finance', name: 'Финансы', icon: Wallet, view: Finance },
  { id: 'budget', name: 'Бюджетирование', icon: Wallet, view: Budget },
  { id: 'facilities', name: 'Инфраструктура', icon: Factory, view: Facilities },
  { id: 'capital', name: 'Капитал и кредит', icon: Wallet, view: Capital },
  { id: 'economy', name: 'Экономика организации', icon: Factory, view: Economy },
  { id: 'cap', name: 'Cost Cap и ATR', icon: Gauge, view: CostCap },
]
export function Workspace({ world:catalog, c: initial, media }: SectionProps) {
  const [c, update] = useState(initial),
    [route, setRoute] = useState(() => location.hash.slice(1)),
    [dialog, open] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const world={...catalog,organizations:{...catalog.organizations}}
  for(const [id,name] of Object.entries(c.team_names)) world.organizations[id]={...world.organizations[id],name}
  const current = sections.find((s) => s.id === route) || sections[0],
    Screen = current.view,
    org = world.organizations[c.org],
    logo = assetUrl(media, 'logo', c.org)
  const main = useRef<HTMLElement>(null),
    locked = useRef(false),
    retry = useRef<{ command_id: string; revision: number; action: string } | null>(null)
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1))
      open('')
      window.scrollTo(0, 0)
      main.current?.focus({ preventScroll: true })
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  async function command(action: string) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    const saved = retry.current
    const req =
      saved && saved.action === action && saved.revision === c.revision
        ? saved
        : { command_id: crypto.randomUUID(), revision: c.revision, action }
    retry.current = req
    try {
      update(await api<typeof c>('careers/' + c.id + '/commands', post(req)))
      retry.current = null
      open('')
    } catch (err) {
      setError(explain(err))
      if (err instanceof ApiError && err.status === 409) {
        try {
          update(await api<typeof c>('careers/' + c.id))
          retry.current = null
          open('')
        } catch {
          setError('Не удалось обновить карьеру. Проверьте соединение.')
        }
      }
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const nav = (
    <>
      <Brand />
      <div className="team-switch">
        {logo ? (
          <img src={logo} className="career-logo" alt="" />
        ) : (
          <span className="team-monogram">
            <Factory size={19} />
          </span>
        )}
        <span>
          <strong>{org.name}</strong>
          <small>{roles[c.role].name}</small>
        </span>
      </div>
      <nav className="nav" aria-label="Разделы карьеры">
        <div className="nav-group">УПРАВЛЕНИЕ</div>
        {sections.map((s) => (
          <a
            key={s.id}
            href={'#' + s.id}
            className={'nav-link ' + (s.id === current.id ? 'active' : '')}
            aria-current={s.id === current.id ? 'page' : undefined}
            onClick={() => open('')}
          >
            <s.icon size={18} />
            {s.name}
          </a>
        ))}
      </nav>
      <div className="nav-fill" />
      <div className="sidebar-footer">
        <span className="user-avatar">{c.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>{c.name}</strong>
          <small>Сезон {world.origin.season}</small>
        </div>
      </div>
    </>
  )
  return (
    <div className="app-shell career-shell">
      <a
        href="#content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault()
          main.current?.focus()
        }}
      >
        К содержимому
      </a>
      <aside className="sidebar">{nav}</aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-breadcrumb">
              {world.championships[c.series].name} / {current.name}
            </span>
            <span className="season-chip">{world.origin.season}</span>
            <strong className="desktop-hide">APEX</strong>
          </div>
          <div className="topbar-right">
            <button className="icon-btn" aria-label="Сохранение карьеры" onClick={() => open('save')}>
              <FolderOpen size={18} />
            </button>
            <div className="top-date">
              <strong>{dateLabel(c.date)}</strong>
              <span>Игровая дата</span>
            </div>
            <Button
              primary
              disabled={busy || (!c.pending.length && !c.next_date)}
              onClick={() => (c.pending.length ? open('briefing') : command('advance'))}
            >
              {c.pending.length ? 'Брифинг' : 'Продолжить'} <ArrowRight size={14} />
            </Button>
          </div>
        </header>
        <main id="content" tabIndex={-1} ref={main}>
          {error && (
            <p className="career-error" role="alert">
              {error}
            </p>
          )}
          <Screen world={world} c={c} media={media} updateCareer={update} />
        </main>
      </div>
      <nav className="mobile-bottom" aria-label="Быстрая навигация">
        {sections.slice(0, 3).map((s) => (
          <a key={s.id} href={'#' + s.id} className={current.id === s.id ? 'active' : ''}>
            <s.icon size={18} />
            <span>{s.id === 'people' ? 'Состав' : s.name}</span>
          </a>
        ))}
        <button onClick={() => open('menu')}>
          <Factory size={18} />
          Ещё
        </button>
      </nav>
      {dialog && (
        <Dialog
          title={
            { menu: 'Разделы', save: 'Сохранение карьеры', briefing: 'Обязательный брифинг' }[dialog] ||
            'Карьера'
          }
          onClose={() => open('')}
        >
          {dialog === 'menu' ? (
            nav
          ) : dialog === 'briefing' ? (
            <Briefing world={world} c={c} busy={busy} onConfirm={() => command(c.briefing_action)} />
          ) : (
            <>
              <Facts
                items={[
                  ['Игрок', c.name],
                  ['Организация', org.name],
                  ['Сохранено', dateLabel(c.date, true)],
                  ['Ревизия', c.revision],
                ]}
              />
              <div className="form-actions">
                <a className="btn" href="./">
                  <ChevronLeft size={15} />К списку карьер
                </a>
                <a className="btn btn-primary" href={'/api/careers/' + c.id + '/export'} download>
                  <Download size={15} />
                  Экспорт сохранения
                </a>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  )
}
