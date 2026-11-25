import { catalog } from './catalog'
import type { GameAdapter, GameState, Command } from '../game'

const initial = (): GameState => ({
  role: 'manager',
  series: 'formula',
  date: '2028-05-18',
  balanceCents: 3840000000,
  ledger: [
    { id: 'partner', date: '2028-05-15', label: 'NORD · транш партнёра', cents: 240000000 },
    { id: 'aero', date: '2028-05-12', label: 'Испытания в аэротрубе', cents: -48000000 },
    { id: 'travel', date: '2028-05-08', label: 'Логистика · Сакура', cents: -26000000 },
  ],
  projects: catalog.projects.slice(0, 2).map((p) => ({ ...p, installed: false })),
  read: [],
  offers: [],
  shares: { formula: 68, gt: 22, endurance: 10 },
  engineers: { aero: 24, power: 18, reliability: 14 },
  shifts: 2,
  terms: Object.fromEntries(
    catalog.products.map((p) => [p.id, { cents: Math.round(p.price * 100000000), support: 'Стандартная' }]),
  ),
  compact: false,
  mandates: { contracts: true, strategy: true, development: true },
  partnerSigned: false,
  facilities: [],
  completed: [],
  goals: { formula: 'Топ-4', gt: 'Топ-6', endurance: 'Подиум' },
  orders: [],
  load: 76,
  inspected: [],
  specs: [],
  motion: true,
  frame: 0,
  radio: [],
  strategy: Object.fromEntries(
    ['kel', 'web'].map((id) => [id, { pace: 'Баланс', energy: 'Баланс', pit: '' }]),
  ),
})

// Each instance is an isolated, in-memory tour of the interface.
export class DemoGameAdapter implements GameAdapter {
  readonly catalog = catalog
  private state = initial()
  private listeners = new Set<() => void>()
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  dispatch = (c: Command) => {
    const s = this.state
    let update: Partial<GameState>
    switch (c.type) {
      case 'reset':
        update = initial()
        break
      case 'role':
        update = { role: c.role }
        break
      case 'series':
        update = { series: c.series }
        break
      case 'motion':
        update = { motion: c.enabled }
        break
      case 'read':
        update = { read: [...new Set([...s.read, c.id])] }
        break
      case 'advance': {
        const date = new Date(s.date + 'T00:00:00Z')
        date.setUTCDate(date.getUTCDate() + 1)
        update = {
          date: date.toISOString().slice(0, 10),
          projects: s.projects.map((p) => ({
            ...p,
            days: Math.max(p.days - 1, 0),
            progress: p.days <= 1 ? 100 : p.progress + Math.ceil((100 - p.progress) / p.days),
          })),
        }
        break
      }
      case 'offer': {
        if (
          s.role !== 'manager' ||
          s.offers.some((o) => o.id === c.offer.id) ||
          !Number.isInteger(c.offer.years) ||
          c.offer.years < 1 ||
          c.offer.years > 3 ||
          !Number.isSafeInteger(c.offer.annualEuro) ||
          c.offer.annualEuro < 1
        )
          return
        update = { offers: [...s.offers, { ...c.offer }] }
        break
      }
      case 'project': {
        const p = catalog.projects.find((p) => p.id === c.id)
        if (
          !p ||
          s.role !== 'manager' ||
          s.projects.some((item) => item.id === p.id) ||
          s.balanceCents < p.cost
        )
          return
        update = {
          projects: [...s.projects, { ...p, installed: false }],
          balanceCents: s.balanceCents - p.cost,
          ledger: [{ id: p.id, date: s.date, label: p.name, cents: -p.cost }, ...s.ledger],
        }
        break
      }
      case 'engineers': {
        const values = Object.values(c.values)
        if (
          s.role !== 'manager' ||
          values.some((x) => !Number.isInteger(x) || x < 0 || x > 40) ||
          values.reduce((a, b) => a + b, 0) > 60
        )
          return
        update = { engineers: { ...c.values } }
        break
      }
      case 'mandates':
        if (s.role !== 'owner') return
        update = { mandates: { ...c.values } }
        break
      case 'shifts': {
        const base = catalog.shiftLoads
        if (s.role !== 'manufacturer' || ![1, 2, 3].includes(c.value)) return
        const load = s.load - base[s.shifts] + base[c.value]
        if (load > 100) return
        update = { shifts: c.value, load }
        break
      }
      case 'terms':
        if (
          s.role !== 'manufacturer' ||
          !s.terms[c.id] ||
          !Number.isSafeInteger(c.cents) ||
          c.cents < 100000000 ||
          c.cents > 3000000000
        )
          return
        update = { terms: { ...s.terms, [c.id]: { cents: c.cents, support: c.support } } }
        break
      case 'compact':
        update = { compact: c.enabled }
        break
      case 'partner':
        if (s.partnerSigned || s.role === 'manufacturer') return
        update = {
          partnerSigned: true,
          balanceCents: s.balanceCents + 120000000,
          ledger: [
            { id: 'helix-advance', date: s.date, label: 'HELIX · аванс партнёра', cents: 120000000 },
            ...s.ledger,
          ],
        }
        break
      case 'facility': {
        const f = catalog.facilities.find((f) => f.id === c.id)
        if (!f || s.role !== 'owner' || s.facilities.includes(f.id) || s.balanceCents < f.cost) return
        update = {
          facilities: [...s.facilities, f.id],
          balanceCents: s.balanceCents - f.cost,
          ledger: [{ id: f.id, date: s.date, label: f.name, cents: -f.cost }, ...s.ledger],
        }
        break
      }
      case 'goal':
        if (s.role !== 'owner' || !c.value.trim()) return
        update = { goals: { ...s.goals, [c.series]: c.value.trim() } }
        break
      case 'finishOrder': {
        const order = catalog.orders.find((o) => o.id === c.id)
        if (!order || s.role !== 'manufacturer' || !s.orders.includes(c.id) || s.completed.includes(c.id))
          return
        update = { completed: [...s.completed, c.id], load: s.load - order.load }
        break
      }
      case 'install':
        if (s.role !== 'manager') return
        update = {
          projects: s.projects.map((p) => (p.id === c.id && p.days === 0 ? { ...p, installed: true } : p)),
        }
        break
      case 'allocate': {
        const values = Object.values(c.shares)
        if (
          s.role !== 'owner' ||
          values.some((x) => !Number.isInteger(x) || x < 0 || x > 100) ||
          values.reduce((a, b) => a + b, 0) !== 100
        )
          return
        update = { shares: { ...c.shares } }
        break
      }
      case 'order': {
        const order = catalog.orders.find((o) => o.id === c.id)
        if (!order || s.role !== 'manufacturer' || s.orders.includes(c.id) || s.load + order.load > 100)
          return
        update = { orders: [...s.orders, c.id], load: s.load + order.load }
        break
      }
      case 'spec':
        if (
          s.role !== 'manufacturer' ||
          !catalog.products.some((p) => p.id === c.id) ||
          s.specs.includes(c.id)
        )
          return
        update = { specs: [...s.specs, c.id] }
        break
      case 'inspect':
        if (
          s.role !== 'manager' ||
          !catalog.cars[s.series].parts.some((x) => s.series + ':' + x.model === c.id)
        )
          return
        update = { inspected: [...new Set([...s.inspected, c.id])] }
        break
      case 'nextFrame':
        update = { frame: (s.frame + 1) % catalog.frames.length }
        break
      case 'strategy': {
        const current = s.strategy[c.id]
        if (!current || s.role !== 'manager') return
        const driver = catalog.grid.find((d) => d.id === c.id)
        const label = { pace: 'Темп', energy: 'Энергия', pit: 'Пит-стоп' }[c.field]
        update = {
          strategy: { ...s.strategy, [c.id]: { ...current, [c.field]: c.value } },
          radio: [
            {
              lap: catalog.frames[s.frame].lap,
              text: driver?.name + ' · ' + label + ' — ' + (c.value || 'отменён'),
            },
            ...s.radio,
          ].slice(0, 12),
        }
        break
      }
    }
    this.state = { ...s, ...update }
    this.listeners.forEach((listener) => listener())
  }
}
