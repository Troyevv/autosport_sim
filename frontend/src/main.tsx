import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DemoGameAdapter } from './demo/DemoGameAdapter'
import { GameContext } from './ui/context'
import { App } from './App'
import './base.css'
import './management.css'
import './people.css'
import './race.css'
import './app.css'

import { PublicMenu as Library } from './pitwall/publicMenu'
import { Workspace } from './career/Workspace'
import { api, explain, type World, type Save, type Career, type Asset } from './career/api'
import './career/career.css'
import './pitwall/styles.css'
import './pitwall/menu.css'
import './pitwall/v2/theme.css'
import './pitwall/integration.css'
import './pitwall/ergonomics.css'

function Bootstrap() {
  const [boot, setBoot] = useState<{
    world: World
    saves: Save[]
    career: Career | null
    media: Asset[]
  } | null>(null)
  const [message, setMessage] = useState('')
  const params = new URLSearchParams(location.search)
  const demo = params.get('demo') === '1',
    cid = params.get('career')

  const [attempt, retry] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    let active = true
    async function start() {
      try {
        const r = await fetch('/api/config', { signal: controller.signal })
        if (!r.ok) throw Error()
        const config = await r.json()
        if (config.mode !== 'career' || config.career_saves !== true) throw Error()
        if (!demo) {
          const opts = { signal: controller.signal }
          const [world, saves, career, media] = await Promise.all([
            api<World>(cid ? 'world?career=' + encodeURIComponent(cid) : 'world', opts),
            cid ? Promise.resolve([]) : api<Save[]>('careers', opts),
            cid ? api<Career>('careers/' + encodeURIComponent(cid), opts) : null,
            api<Asset[]>('media', opts),
          ])
          if (active) setBoot({ world, saves, career, media })
        }
        if (active) setStatus('ready')
      } catch (err) {
        if (active) setMessage(explain(err))
        if (active) setStatus('error')
      } finally {
        clearTimeout(timeout)
      }
    }
    void start()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt, demo, cid])
  if (status !== 'ready')
    return (
      <main className="boot panel" aria-live="polite">
        <div className="eyebrow">AUTOSPORT SIM / PIT WALL</div>
        <h1>{status === 'error' ? 'Нет связи с приложением' : 'Загрузка интерфейса…'}</h1>
        {status === 'error' && (
          <>
            <p>{message}</p>
            <a className="btn" href="./">
              К списку карьер
            </a>
            <button
              className="btn btn-primary"
              onClick={() => {
                setStatus('loading')
                retry(attempt + 1)
              }}
            >
              Повторить
            </button>
          </>
        )}
      </main>
    )
  if (!demo && boot)
    return boot.career ? (
      <Workspace world={boot.world} c={boot.career} media={boot.media} />
    ) : (
      <Library world={boot.world} saves={boot.saves} media={boot.media} />
    )
  return <Demo />
}
function Demo() {
  const [adapter] = useState(() => new DemoGameAdapter())
  return (
    <GameContext.Provider value={adapter}>
      <App />
    </GameContext.Provider>
  )
}
createRoot(document.getElementById('root')!).render(<Bootstrap />)
