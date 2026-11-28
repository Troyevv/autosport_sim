import { createContext, useContext } from 'react'
// Stable context identity across live edits of the provider and dialogue components.
export const Context = createContext(null)
export function useGame() {
  return useContext(Context)
}
