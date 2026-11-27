import React, { useEffect, useMemo, useState } from 'react'
import { Calendar, Championships, Messages } from './World'
import { PersonnelDirectory } from './Directory'
import Business from './Business'
import Garage from './Garage'
import Engineering from './Engineering'
import { peopleRoutes, businessRoutes, engineeringRoutes } from './v2/navigation'
import { Shell } from './Shell'
import { Context } from './core'
import { useDesk } from './core/desk'
import { navigate } from './core/route'
import RoleHome, { BriefingRoom, OrganizationProfile } from './v2/RoleHome'
import EventMoment from './v2/EventMoment'
import Contracts from './v2/Contracts'
import StatisticsCenter from './v2/StatisticsCenter'
import { OperationalAnalytics } from './v2/Advisory'
import { SUPPORTED_ROUTES } from './v2/advisory-model'
import { identityVars } from './v2/identity'
import { Dialog } from './Dialog'
import { assetUrl } from '../career/api'
import { usePersonnel } from '../career/staff/model'

export function CareerView({
  world,
  c,
  media,
  route,
  tab,
  entity,
  updateCareer,
  onAdvance,
  onSave,
  busy,
  children,
}) {
  const desk = useDesk(c, route, tab)
  const directory = usePersonnel('careers/' + c.id + '/personnel', c.revision)
  const preferenceKey = 'autosport.pitwall.preferences.' + c.id
  const [preferences, setPreferences] = useState(() => {
      try {
        const stored = JSON.parse(globalThis.localStorage.getItem(preferenceKey) || '{}')
        return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
      } catch {
        return {}
      }
    }),
    [selectedEntry, setSelectedEntry] = useState(''),
    [dialog, openDialog] = useState(null)
  useEffect(() => {
    // Only view settings and shortlists are local. Career writes use the command bus.
    try {
      globalThis.localStorage.setItem(preferenceKey, JSON.stringify(preferences))
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }, [preferenceKey, preferences])
  const images = useMemo(
    () =>
      media.map((m) => (m.kind === 'logo' ? { ...m, local_url: assetUrl(media, m.kind, m.entity) } : m)),
    [media],
  )
  useEffect(() => {
    document.querySelector('.main-scroll')?.scrollTo(0, 0)
  }, [route, tab, entity])
  const game = useMemo(
    () => ({
      ...desk.game,
      career: c,
      personnelById: new Map((directory.data || []).map((p) => [p.id, p])),
      personnel: directory.data || [],
      projections: desk.game?.projections || {},
    }),
    [c, desk.game, directory.data],
  )
  useEffect(() => {
    const dismiss = () => openDialog(null)
    window.addEventListener('hashchange', dismiss)
    return () => window.removeEventListener('hashchange', dismiss)
  }, [])
  useEffect(() => {
    const present = ({ detail: event }) => {
      if (event.id === c.id)
        openDialog({
          title: 'Решение организации',
          content: <EventMoment event={event} kind={event.kind} />,
        })
    }
    window.addEventListener('autosport-career-moment', present)
    return () => window.removeEventListener('autosport-career-moment', present)
  }, [c.id])
  const org = world.organizations[c.org]
  const ctx = {
    world,
    game,
    data: { media: images },
    role: c.role,
    route,
    tab,
    entity,
    scope: c.id,
    preferences,
    setPreferences,
    updateCareer,
    selectedEntry,
    setSelectedEntry,
    navigate,
    setTab: (t) => navigate(route, t, entity),
    openDialog,
    onAdvance,
    openForm: openDialog,
    confirm: (spec) => openDialog({ ...spec, confirm: true }),
    closeDialog: () =>
      openDialog((current) => (current?.content?.type === EventMoment && current !== dialog ? current : null)),
    openPerson: (id, tab = 'profile') => navigate('person', tab, id),
    openOrganization: (id) => navigate('organization', 'overview', id),
    canGoBack: history.length > 1,
    goBack: () => history.back(),
    notify: (message) => openDialog({ title: 'Сообщение', description: message }),
  }
  let content
  const landing =
    !tab ||
    ['overview', 'plans', 'agenda', 'catalog', 'queue', 'organization', 'plan', 'forecast'].includes(tab)
  const analytics = SUPPORTED_ROUTES.includes(route) && landing
  const directoryPage = peopleRoutes.includes(route)
  const garagePage = ['garage', 'livery'].includes(route)
  const businessPage = businessRoutes.includes(route)
  const engineeringPage = engineeringRoutes.includes(route)
  const projection =
    engineeringPage ||
    businessPage ||
    garagePage ||
    directoryPage ||
    route === 'overview' ||
    route === 'briefings' ||
    ['organization', 'world', 'inbox', 'market', 'staff', 'funding', 'contracts'].includes(route) ||
    route === 'statistics' ||
    route === 'agreements' ||
    analytics
  const status = desk.error || directory.error
  const waiting = projection && (!desk.game || !directory.data)
  if (waiting && status)
    content = (
      <section role="alert">
        <h2>Не удалось загрузить раздел</h2>
        <p>{status}</p>
        <button
          className="button"
          onClick={() => {
            desk.retry()
            directory.retry()
          }}
        >
          Повторить
        </button>
      </section>
    )
  else if (waiting) content = <p role="status">Загрузка данных организации…</p>
  else if (route === 'overview') content = <RoleHome />
  else if (route === 'briefings') content = <BriefingRoom />
  else if (route === 'organization') content = <OrganizationProfile />
  else if (route === 'statistics') content = <StatisticsCenter />
  else if (route === 'agreements') content = <Contracts />
  else if (businessPage || engineeringPage) {
    const module = engineeringPage ? <Engineering key={c.id} /> : <Business key={route} />
    content = (
      <div className={'department-workspace ' + (analytics ? 'with-report' : '')}>
        {analytics && (
          <OperationalAnalytics
            route={route}
            compactBrief
            defaultExpanded={tab === 'forecast'}
            analyticsOnly={tab === 'forecast'}
          />
        )}
        {route === 'finance' && tab === 'forecast' ? (
          <details className="source-details">
            <summary>Расписание выплат и исходная финансовая проекция</summary>
            {module}
          </details>
        ) : (
          module
        )}
      </div>
    )
  } else if (garagePage)
    content = (
      <div className="department-workspace season-garage">
        <Garage />
      </div>
    )
  else if (route === 'calendar') content = <Calendar />
  else if (route === 'world') content = <Championships />
  else if (directoryPage)
    content = (
      <div className={'department-workspace ' + (analytics ? 'with-report' : '')}>
        {analytics && (
          <OperationalAnalytics
            route={route}
            compactBrief
            defaultExpanded={tab === 'forecast'}
            analyticsOnly={tab === 'forecast'}
          />
        )}
        <PersonnelDirectory />
      </div>
    )
  else if (route === 'inbox') content = <Messages />
  else
    content = (
      <>
        {analytics && (
          <OperationalAnalytics
            route={route}
            compactBrief
            defaultExpanded={tab === 'forecast'}
            analyticsOnly={tab === 'forecast'}
          />
        )}
        <div key="native" className="native-screen">
          {children}
        </div>
      </>
    )
  return (
    <Context.Provider value={ctx}>
      <div className="pitwall" style={identityVars(org)}>
        <div inert={dialog ? true : undefined}>
          <Shell {...{ onAdvance, onSave, busy }}>{content}</Shell>
        </div>
        {dialog && (
          <Dialog
            key={dialog.title}
            spec={dialog}
            close={() => openDialog((current) => (current === dialog ? null : current))}
          />
        )}
      </div>
    </Context.Provider>
  )
}
