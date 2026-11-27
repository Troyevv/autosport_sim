import React, { useEffect, useMemo, useState } from 'react'
import {Calendar, Championships, Messages} from './World'
import { Shell } from './Shell'
import { Context } from './core'
import { useDesk } from './core/desk'
import { navigate } from './core/route'
import RoleHome, { BriefingRoom, OrganizationProfile } from './v2/RoleHome'
import Contracts from './v2/Contracts'
import StatisticsCenter from './v2/StatisticsCenter'
import { OperationalAnalytics } from './v2/Advisory'
import { SUPPORTED_ROUTES } from './v2/advisory-model'
import { getIdentity, identityVars } from './v2/identity'
import { Dialog } from '../ui/components'
import { assetUrl } from '../career/api'
import { usePersonnel } from '../career/staff/model'

export function CareerView({ world, c, media, route, tab, entity, onAdvance, onSave, busy, children }) {
  const desk = useDesk(c, route, tab)
  const directory = usePersonnel('careers/' + c.id + '/personnel', c.revision)
  const [preferences, setPreferences] = useState({}),
    [selectedEntry, setSelectedEntry] = useState(''),
    [dialog, openDialog] = useState(null)
  const images = useMemo(
    () =>
      media.map((m) => (m.kind === 'logo' ? { ...m, local_url: assetUrl(media, m.kind, m.entity) } : m)),
    [media],
  )
  useEffect(() => {
    openDialog(null)
    document.querySelector('.main-scroll')?.scrollTo(0, 0)
  }, [route, tab, entity])
  const game = useMemo(
    () => ({
      ...desk.game,
      career: c,
      personnel: directory.data || [],
      projections: desk.game?.projections || {},
    }),
    [c, desk.game, directory.data],
  )
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
    selectedEntry,
    setSelectedEntry,
    navigate,
    setTab: (t) => navigate(route, t, entity),
    openDialog,
    closeDialog: () => openDialog(null),
    openPerson: (id) => navigate('person', 'profile', id),
    openOrganization: (id) => navigate('organization', 'overview', id),
    canGoBack: history.length > 1,
    goBack: () => history.back(),
    notify: (message) => openDialog({ title: 'Сообщение', description: message }),
  }
  let content
  const analytics = SUPPORTED_ROUTES.includes(route)
  const projection =
    route === 'overview' ||
    route === 'briefings' ||
    ['organization','world','inbox'].includes(route) ||
    route === 'statistics' ||
    route === 'agreements' ||
    analytics
  const status = desk.error || directory.error
  const waiting = projection && (!desk.game || !directory.data)
  if (analytics && waiting)
    content = (
      <>
        {status && (
          <p role="alert">
            {status}{' '}
            <button
              onClick={() => {
                desk.retry()
                directory.retry()
              }}
            >
              Повторить загрузку аналитики
            </button>
          </p>
        )}
        <div key="native" className="native-screen">
          {children}
        </div>
      </>
    )
  else if (waiting && status)
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
  else if (route === 'calendar') content = <Calendar/>
  else if (route === 'world') content = <Championships/>
  else if (route === 'inbox') content = <Messages/>
  else
    content = (
      <>
        {analytics && (
          <OperationalAnalytics route={route} compactBrief defaultExpanded={tab === 'forecast'} />
        )}
        <div key="native" className="native-screen">
          {children}
        </div>
      </>
    )
  return (
    <Context.Provider value={ctx}>
      <div className={'pitwall identity-' + getIdentity(org).key} style={identityVars(org)}>
        <Shell {...{ onAdvance, onSave, busy }}>{content}</Shell>
        {dialog && (
          <Dialog title={dialog.title} onClose={() => openDialog(null)}>
            {dialog.content || dialog.description}
          </Dialog>
        )}
      </div>
    </Context.Provider>
  )
}
