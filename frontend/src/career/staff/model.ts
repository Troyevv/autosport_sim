import { useEffect, useState } from 'react'
import { api, explain, type Career, type Person, type World } from '../api'

export type Candidate = Pick<Person, 'id' | 'name' | 'origin' | 'face'> & {
  org: string | null
  position: string
  age: number
  country: string
  fit: number
  financial: { wage_cents: number; support_cents: number; net_cents: number } | null
  rating: number
  strength: number
  specialty: string
  programs: string[]
  end: string | null
  tag: string
}
type Contract = {
  person: string
  seat: string
  org: string
  entry: string | null
  series: string | null
  start: string
  end: string | null
  salary_cents: number
  buyout_cents: number
}
export type Dossier = {
  calendar_context: import('./MediaProfile').Audience[]
  relationships: import('./Teamwork').Relationship[]
  reports: import('./pathModel').Report[]
  scout_available: boolean
  scholarships: import('./pathModel').Scholarship[]
  financing: import('./pathModel').Funding[]
  person: Person & {
    position: string
    preferences?: Record<string, number>
    authority: number
    popularity: number
    regional_popularity: Record<string, number>
    media_traits: Record<string, number>
    ambition: number
    loyalty: number
    professionalism: number
    adaptability: number
    reputation: number
    adaptation: Record<string, number>
    discipline_days: Record<string, number>
    courses: number
    training: { end: string; skill: string } | null
  }
  age: number
  history: Contract[]
  current: Contract | null
  options: { id: string; available: string | null; ask_cents: number }[]
  support: { id: string; client: string; start: string; end: string }[]
  profile: {
    values: Record<string, number>
    weights: Record<string, number>
    readiness: number
    familiarity: number
    rating: number
    traits: {
      id: string
      name: string
      kind: string
      delta: number
      skill: string
      condition: string
      active: boolean
      end: string | null
    }[]
  }
}
export type Order = (action: string, args: Record<string, string | number | boolean>) => Promise<boolean>
export type Offer = {
  id: string
  person: string
  seat: string
  start: string
  end: string
  status: string
  message: string
  salary_cents: number
  buyout_cents: number
  bonus_cents: number
  response: string
  deadline: string
}
export const statuses: Record<string, string> = {
  sent: 'На рассмотрении',
  countered: 'Встречные условия',
  accepted: 'Подписан',
  rejected: 'Закрыто',
  expired: 'Истекло',
}
export const daysAfter = (today: string, days: number) => {
  const d = new Date(today + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export const shortDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
export function seatName(id: string, c: Career, w: World) {
  const s = c.assignments.find((a) => a.id === id)
  if (!s) return id
  const entry = s.entry ? w.entries[s.entry] : undefined
  const slot =
    s.position === 'driver' && entry && entry.crew.length > 1
      ? 'место ' + (entry.crew.indexOf(w.assignments[id].person) + 1)
      : null
  return [w.positions[s.position].name, s.series?.toUpperCase(), entry && '№ ' + entry.number, slot]
    .filter(Boolean)
    .join(' · ')
}
export function usePersonnel<T>(path: string | null, revision: number) {
  const [record, setRecord] = useState<{ path: string; data: T }>()
  const [error, setError] = useState(''),
    [attempt, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    if (!path) return
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setRecord({ path, data })
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(explain(e))
      })
    return () => controller.abort()
  }, [path, revision, attempt])
  return { data: record?.path === path ? record.data : undefined, error, retry: () => retry((n) => n + 1) }
}
