import records from './geometry.json'

export type Zone = 'flank' | 'upper' | 'nose' | 'sill' | 'shoulder' | 'wing'
export type Decal = { asset: string; zone: Zone; x: number; y: number; scale: number; angle: number }
export type Livery = {
  version: 1
  template: string
  colors: string[]
  pattern: string
  number: string
  decals: Decal[]
}
export type Catalog = {
  version: string
  entries: Record<string, { geometry: string; allowed_assets: string[]; livery: Livery }>
  patterns: Record<string, { name: string; secondary: string; accent: string }>
  sponsors: Record<
    string,
    { name: string; zones: Zone[]; maxScale: number; image?: string; media?: string; text?: string }
  >
}
export type Geometry = {
  family: 'formula' | 'gt' | 'prototype'
  regulations: string[]
  variants: Record<string, Record<string, string>>
  contacts: [number, number, number][]
  wheelFaces?: [number, number, number][]
  length: number
  size: [number, number]
  parts: [string, number, number, number, number, number, number][]
  zones: Record<Zone, [number, number, number, number]>
}
export const geometry = records as unknown as Record<string, Geometry>
export const areaNames = {
  flank: 'Борт',
  upper: 'Верхняя панель',
  nose: 'Носовая часть',
  wing: 'Антикрыло',
  sill: 'Нижняя панель',
  shoulder: 'Передний борт',
}
export type ComponentSelection = { regulation: string; model: string; installed: Record<string, string> }
export const partNames: Record<string, string> = {
  chassis: 'Шасси',
  nose: 'Носовая часть',
  intake: 'Воздухозаборник',
  cockpit: 'Кокпит',
  sidepod: 'Понтоны',
  bodywork: 'Панели кузова',
  'rear-wing': 'Заднее антикрыло',
  'front-wing': 'Переднее антикрыло',
  'front-wheel': 'Переднее колесо',
  'rear-wheel': 'Заднее колесо',
}
export const assetRoot = '/assets/garage/2025-v1/'
export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n))

export function sameLivery(a: Livery, b: Livery) {
  return (
    a.template === b.template &&
    a.version === b.version &&
    a.number === b.number &&
    a.pattern === b.pattern &&
    a.colors.every((color, i) => color === b.colors[i]) &&
    a.decals.length === b.decals.length &&
    a.decals.every((d, i) => {
      const e = b.decals[i]
      return (
        d.asset === e.asset &&
        d.zone === e.zone &&
        d.x === e.x &&
        d.y === e.y &&
        d.angle === e.angle &&
        d.scale === e.scale
      )
    })
  )
}
