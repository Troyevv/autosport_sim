import type { BrandPalette } from './api'

export const uniformCategories = {
  driver: 'Гоночный комбинезон пилота',
  engineering: 'Поло инженера',
  executive: 'Рубашка руководителя',
  mechanic: 'Рабочий комбинезон механика',
  staff: 'Форма персонала',
  advisor: 'Куртка технического консультанта',
} as const
export type Category = keyof typeof uniformCategories
export type Swatch = keyof BrandPalette
export type Pattern = {
  design: 'panels' | 'chevron' | 'shoulders'
  base: Swatch
  insert: Swatch
  piping: Swatch
  badge: 'left' | 'right' | 'center' | 'none'
}
export const standard: Pattern = {
  design: 'panels',
  base: 'primary',
  insert: 'secondary',
  piping: 'accent',
  badge: 'left',
}
export const neutral: Required<BrandPalette> = {
  primary: '#787b80',
  secondary: '#63666b',
  accent: '#a4a6a8',
}
const engineers = new Set([
  'chief-engineer',
  'aero',
  'chassis',
  'reliability',
  'performance',
  'race-engineer',
  'engines',
  'transmissions',
  'tyres',
  'chief-analyst',
  'analyst',
])
export function categoryFor(position: string): Category {
  if (['manager', 'owner', 'manufacturer'].includes(position)) return 'executive'
  if (position === 'technical-advisor') return 'advisor'
  if (position === 'driver') return 'driver'
  if (position.includes('mechanic')) return 'mechanic'
  return engineers.has(position) ? 'engineering' : 'staff'
}
export const textiles = {
  driver: 'driver',
  mechanic: 'mechanic',
  engineering: 'engineering',
  executive: 'executive',
  advisor: 'advisor',
  staff: 'engineering',
} as const
export type ClothingRight = {
  contract: string
  org: string
  sponsor: string
  person: string | null
  series: string[]
  entries: string[]
  entrant: string | null
  name: string
  image: string | null
  right: { zone: 'suit' | 'uniform'; share: number; offset: number }
  mount: { x: number; scale: number } | null
}
export function clothingFor(
  rights: ClothingRight[],
  org: string | null,
  category: Category,
  person: { id?: string; kit_programs?: string[]; programs?: string[]; active_entries?: string[] },
  entrants: Record<string, { entrant_id?: string }>,
) {
  return rights.filter(
    (r) =>
      org &&
      r.org === org &&
      r.right.zone === (category === 'driver' ? 'suit' : 'uniform') &&
      (!r.person || r.person === person.id) &&
      r.series.some((s) => (person.kit_programs || person.programs)?.includes(s)) &&
      (!r.entries.length || person.active_entries?.some((id) => r.entries.includes(id))) &&
      (!r.entrant || person.active_entries?.some((id) => entrants[id]?.entrant_id === r.entrant)),
  )
}
