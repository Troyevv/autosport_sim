import React, { useEffect, useMemo, useState } from 'react'
import { api, post, assetUrl, explain } from '../career/api'
import { Dialog } from '../ui/components'
import { Context, dateLabel } from './core'
import { Wizard, Page } from './Wizard'
import { Button, Icon } from './ui'
import { RaceCar } from './visuals'
import { OrganizationMark, identityVars, roleNames } from './v2/identity'
import { careerUrl } from '../career/Library'
export function PublicMenu({ world, saves, media }) {
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'menu'),
    [catalog, setCatalog] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState(null),
    [query, filter] = useState(''),
    [attempt, retry] = useState(0)
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || 'menu')
      setError('')
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    const ac = new AbortController()
    api('garage', { signal: ac.signal })
      .then(setCatalog)
      .catch((e) => {
        if (!ac.signal.aborted) setError(explain(e))
      })
    return () => ac.abort()
  }, [attempt])
  const images = useMemo(
    () =>
      media.map((m) => (m.kind === 'logo' ? { ...m, local_url: assetUrl(media, m.kind, m.entity) } : m)),
    [media],
  )
  const people = useMemo(
    () => Object.entries(world.names).map(([id, name]) => ({ id, name, face: world.faces[id] })),
    [world],
  )
  const latest = saves[0],
    org = world.organizations[latest?.org] || world.organizations['team-scuderia-ferrari'],
    entry = Object.values(world.entries).find(
      (e) => e.org === org.id && (!latest || latest.series === e.championship),
    )
  const navigate = (r) => {
      location.hash = r
    },
    load = (id) => location.assign(careerUrl(id))
  const ctx = {
    world,
    data: { catalog, media: images },
    game: {
      career: {
        org: org.id,
        series: latest?.series || 'f1',
        assignments: [],
        garage_configurations: {},
        liveries: {},
      },
      personnel: people,
      garageCatalog: catalog,
    },
    navigate,
    openDialog: setDialog,
    createCareer: async (payload) => load((await api('careers', post(payload))).id),
  }
  async function upload(e) {
    const input = e.currentTarget,
      f = input.files?.[0]
    if (!f) return
    setBusy(true)
    setError('')
    try {
      load((await api('careers/import', { method: 'POST', body: f })).id)
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(false)
      input.value = ''
    }
  }
  return (
    <Context.Provider value={ctx}>
      <div className="pitwall" style={identityVars(org)}>
        {error && (
          <div role="alert" className="form-error">
            {error}{' '}
            {!catalog && (
              <Button
                onClick={() => {
                  setError('')
                  retry((x) => x + 1)
                }}
              >
                Повторить
              </Button>
            )}
          </div>
        )}
        {route === 'new-career' ? (
          <Wizard />
        ) : route === 'saves' ? (
          <Page>
            <span className="eyebrow">Продолжить историю</span>
            <h1>Ваши карьеры</h1>
            <div className="toolbar">
              <input
                aria-label="Поиск сохранения"
                placeholder="Имя или организация"
                value={query}
                onChange={(e) => filter(e.target.value)}
              />
              <label className="button secondary">
                Импортировать сохранение
                <input type="file" accept=".json,.autosport" disabled={busy} onChange={upload} />
              </label>
            </div>
            <div className="save-grid">
              {saves
                .filter((s) =>
                  (s.name + ' ' + world.organizations[s.org]?.name)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((s) => (
                  <article
                    key={s.id}
                    className="save-card"
                    style={identityVars(world.organizations[s.org])}
                  >
                    <div className="save-details">
                      <OrganizationMark orgId={s.org} />
                      <span className="eyebrow">{roleNames[s.role]}</span>
                      <h2>{world.organizations[s.org]?.name || s.org}</h2>
                      <p>
                        {s.name} · {dateLabel(s.date)}
                      </p>
                      <Button onClick={() => load(s.id)}>
                        Загрузить <Icon name="ArrowRight" />
                      </Button>{' '}
                      <a className="button ghost" href={'/api/careers/' + s.id + '/export'} download>
                        Экспорт
                      </a>
                    </div>
                  </article>
                ))}
            </div>
            {!saves.length && <p>Пока нет сохранённых карьер.</p>}
            <Button onClick={() => navigate('new-career')}>Новая карьера</Button>
          </Page>
        ) : (
          <div className="title-screen">
            <header>
              <b>
                AUTOSPORT <i>SIM</i>
              </b>
            </header>
            <div className="title-organization">
              <OrganizationMark size={70} />
              <span>
                {org.name}
                <small>
                  {org.base} / {world.origin.season}
                </small>
              </span>
            </div>
            {entry && catalog && (
              <div className="title-car">
                <RaceCar entryId={entry.id} studio={false} />
              </div>
            )}
            <div className="title-copy">
              <span className="eyebrow">Мир автоспорта / Сезон {world.origin.season}</span>
              <h1>
                Всё решается
                <br />
                до старта.
              </h1>
              <p>
                Один игровой мир. Одиннадцать чемпионатов.
                <br />
                Ваша история — по обе стороны пит-лейна.
              </p>
              <nav>
                {latest && (
                  <button className="menu-continue" onClick={() => load(latest.id)}>
                    <span>
                      <small>ТЕКУЩАЯ КАРЬЕРА</small>
                      <strong>Продолжить</strong>
                    </span>
                    <Icon name="ArrowRight" />
                  </button>
                )}
                {[
                  ['Plus', 'Новая карьера', () => navigate('new-career')],
                  ['FolderOpen', 'Загрузить сохранение', () => navigate('saves')],
                  ['Images', 'Портреты и форма', () => location.assign('/portraits.html')],
                  ['MonitorPlay', 'Деморежим', () => location.assign('?demo=1')],
                ].map(([i, label, fn]) => (
                  <button key={i} onClick={fn}>
                    <Icon name={i} />
                    {label}
                    <Icon name="ChevronRight" size={14} />
                  </button>
                ))}
              </nav>
            </div>
            <footer>
              <span>AUTOSPORT SIM</span>
              <span>PIT WALL / 02</span>
            </footer>
          </div>
        )}
        {dialog && (
          <Dialog title={dialog.title} onClose={() => setDialog(null)}>
            {dialog.description}
          </Dialog>
        )}
      </div>
    </Context.Provider>
  )
}
