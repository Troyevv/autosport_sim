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

function Bootstrap() {
  const [attempt, retry] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [adapter] = useState(() => new DemoGameAdapter())
  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    let active = true
    async function start() {
      try {
        const r = await fetch('/api/config', { signal: controller.signal })
        if (!r.ok) throw Error()
        const config = await r.json()
        if (config.mode !== 'demo' || config.career_saves !== false) throw Error()
        if (active) setStatus('ready')
      } catch {
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
  }, [attempt])
  if (status !== 'ready')
    return (
      <main className="boot panel" aria-live="polite">
        <div className="eyebrow">APEX / ЦЕНТР УПРАВЛЕНИЯ</div>
        <h1>{status === 'error' ? 'Нет связи с приложением' : 'Загрузка интерфейса…'}</h1>
        {status === 'error' && (
          <>
            <p>Проверьте запуск локального API на порту 8102.</p>
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
  return (
    <GameContext.Provider value={adapter}>
      <App />
    </GameContext.Provider>
  )
}
createRoot(document.getElementById('root')!).render(<Bootstrap />)
