import {
  LayoutDashboard,
  Users,
  CarFront,
  DraftingCompass,
  RadioTower,
  CalendarDays,
  Trophy,
  Handshake,
  Wallet,
  Building2,
  Factory,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../game'
import type { Route } from './context'
export const routes: { id: Route; name: string; icon: LucideIcon; group?: string; role?: Role }[] = [
  { id: 'overview', name: 'Штаб команды', icon: LayoutDashboard, group: 'Управление' },
  { id: 'people', name: 'Пилоты и персонал', icon: Users },
  { id: 'garage', name: 'Гараж', icon: CarFront },
  { id: 'development', name: 'Разработка', icon: DraftingCompass },
  { id: 'race', name: 'Гоночный центр', icon: RadioTower },
  { id: 'calendar', name: 'Календарь', icon: CalendarDays, group: 'Мир автоспорта' },
  { id: 'world', name: 'Чемпионаты', icon: Trophy },
  { id: 'market', name: 'Рынок и поставщики', icon: Handshake },
  { id: 'finance', name: 'Финансы', icon: Wallet, group: 'Бизнес' },
  { id: 'organization', name: 'Организация', icon: Building2, role: 'owner' },
  { id: 'production', name: 'Производство', icon: Factory, role: 'manufacturer' },
]
export function home(role: Role): Route {
  return role === 'owner' ? 'organization' : role === 'manufacturer' ? 'production' : 'overview'
}
export function resolve(id: string, role: Role): Route {
  const route = routes.find((r) => r.id === id && (!r.role || r.role === role))
  return !route || route.id === 'overview' ? home(role) : route.id
}
