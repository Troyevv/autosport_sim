import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Download } from 'lucide-react'
import { Dialog, Facts } from '../ui/components'
import { dateLabel } from '../game'
import { Calendar, People, Finance, Championships, Briefing, type SectionProps } from './Sections'
import { api, ApiError, explain, post } from './api'
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
import { CareerView } from '../pitwall/CareerView'
import { readRoute } from '../pitwall/core/route'
const sections = {
people: People,
calendar: Calendar,
garage: SeasonGarage,
world: Championships,
engineering: Programme,
manufacturer: Manufacturer,
council: Council,
development: Development,
production: Production,
research: Research,
rights: Rights,
commercial: Commercial,
finance: Finance,
budget: Budget,
facilities: Facilities,
capital: Capital,
economy: Economy,
cap: CostCap
}
export function Workspace({ world:catalog, c: initial, media }: SectionProps) {
  const [c, update] = useState(initial),
    [route, setRoute] = useState(readRoute),
    [dialog, open] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const world={...catalog,organizations:{...catalog.organizations}}
  for(const [id,name] of Object.entries(c.team_names)) world.organizations[id]={...world.organizations[id],name}
  const aliases: Record<string,string> = {person:'people',drivers:'people',staff:'people',market:'people',contracts:'people',academy:'people',funding:'people',preparation:'people',leadership:'people',livery:'garage',inventory:'production'}
  const Screen = sections[(aliases[route.page] || route.page) as keyof typeof sections]
  const org = world.organizations[c.org]
    
  const locked = useRef(false),
    retry = useRef<{ command_id: string; revision: number; action: string } | null>(null)
  useEffect(() => {
    const change = () => {
      setRoute(readRoute())
      open('')
      window.scrollTo(0, 0)
      document.getElementById("main-content")?.focus({ preventScroll: true })
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
  return (
    <>
      {error && <p className="career-error" role="alert">{error}</p>}
      <CareerView c={c} world={world} media={media} route={route.page} tab={route.tab} entity={route.entity} busy={busy} onSave={()=>open('save')} onAdvance={()=>c.pending.length?open('briefing'):command('advance')}>
        {Screen ? <Screen key={[route.page,route.tab,route.entity].join('/')} world={world} c={c} media={media} updateCareer={update} /> : <p>Раздел недоступен для этой карьеры.</p>}
      </CareerView>
      {dialog && (
        <Dialog title={dialog==='briefing'?'Обязательный брифинг':'Сохранение карьеры'} onClose={()=>open('')}>
          {dialog === 'briefing' ? (
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
                <a className="btn" href="./#saves">
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
    </>
  )
}
