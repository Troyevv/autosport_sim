export type Series = 'formula' | 'gt' | 'endurance'
export type Role = 'manager' | 'owner' | 'manufacturer'
export interface Person {
  id: string
  name: string
  latin: string
  number?: number
  country: string
  age: number
  rating: number
  role: string
  kind: string
  series?: string
  team: string
  salary: number
  until: number
  morale: number
  points?: number
  position?: number
  potential?: number
  image?: string
  traits: [string, string, string][]
  skills: [string, number][]
  bio: string
  history: string[][]
}
export interface ProjectSpec {
  id: string
  name: string
  category: string
  description: string
  gain: string
  engineers: number
  days: number
  progress: number
  cost: number
}
interface Championship {
  title: string
  short: string
  round: string
  next: string
  date: string
  country: string
  track: string
  laps: string
  teams: readonly (readonly [name: string, points: number, wins: number, color: string])[]
  drivers: readonly (readonly [name: string, team: string, points: number, wins: number])[]
  events: readonly (readonly [
    round: string,
    date: string,
    title: string,
    track: string,
    format: string,
    length: string,
    distance: string,
  ])[]
}
interface Sponsor {
  name: string
  category: string
  sum: number
  zone: string
  expires: string
  color: string
}
interface Car {
  model: string
  team: string
  number: number
  driver: string
  chassis: string
  rating: number
  rank: number
  image: string
  livery: string
  colors: string[][]
  parts: { name: string; model: string; life: number }[]
}
export interface GameCatalog {
  people: readonly Person[]
  candidates: readonly Person[]
  suppliers: readonly {
    id: string
    name: string
    maker: string
    type: string
    tag: string
    cost: number
    power: number
    reliability: number
    efficiency: number
    detail: string
    contract: string
    availability: string
  }[]
  world: Record<Series, Championship>
  cars: Record<Series, Car>
  grid: readonly {
    number: number
    id: string
    name: string
    code: string
    team: string
    color: string
    gap: number
    tyre: string
    life: number
    position: number
    interval: number
  }[]
  raceCars: Record<'kel' | 'web', { personId: string; energy: number; lastLap: string }>
  replay: { lapSeconds: number; startSeconds: number; timeScale: number }
  frames: readonly { lap: number; radio: string }[]
  projects: readonly ProjectSpec[]
  programs: readonly {
    id: Series
    name: string
    series: string
    rank: string
    points: number
    director: string
    color: string
    budget: number
  }[]
  products: readonly {
    id: string
    name: string
    type: string
    sub: string
    power: number
    reliability: number
    efficiency: number
    price: number
    icon: string
  }[]
  orders: readonly { id: string; team: string; product: string; units: number; load: number }[]
  schedule: readonly {
    day: string
    type: string
    title: string
    series: Series
    status: string
    detail: string
  }[]
  sponsors: readonly Sponsor[]
  partner: Sponsor
  messages: readonly {
    id: string
    title: string
    from: string
    body: string
    route: 'development' | 'people' | 'race'
  }[]
  facilities: readonly { id: string; name: string; level: number; cost: number; detail: string }[]
  clients: readonly { team: string; series: string; product: string; until: number }[]
  spending: readonly number[]
  costShares: readonly (readonly [string, number])[]
  shiftLoads: readonly number[]
  reports: {
    developmentBudget: number
    developmentPlan: number
    paceGain: string
    teamRating: number
    annualBudget: number
    annualUsed: number
    forecast: number
    groupValue: number
    groupGrowth: string
    trust: number
    orderBook: number
    deliveryRate: string
  }
}
