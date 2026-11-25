import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { GameAdapter } from '../game'
export type Route =
  | 'overview'
  | 'people'
  | 'garage'
  | 'development'
  | 'race'
  | 'calendar'
  | 'world'
  | 'market'
  | 'finance'
  | 'organization'
  | 'production'
export const GameContext = createContext<GameAdapter | null>(null)
export function useGame() {
  const adapter = useContext(GameContext)
  if (!adapter) throw new Error('Game adapter missing')
  const state = useSyncExternalStore(adapter.subscribe, adapter.snapshot)
  return { state, data: adapter.catalog, send: adapter.dispatch }
}
export const UIContext = createContext<{
  go: (route: Route) => void
  open: (title: string, body: ReactNode) => void
  close: () => void
} | null>(null)
export function useUI() {
  const ui = useContext(UIContext)
  if (!ui) throw new Error('UI context missing')
  return ui
}
