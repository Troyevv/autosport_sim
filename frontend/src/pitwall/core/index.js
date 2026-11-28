import { useGame } from './context'
export { useGame, Context } from './context'
export const dateLabel = (d) =>
  d
    ? new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Не указано'
export const money = (n, compact = false) =>
  n == null
    ? 'Нет данных'
    : new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'EUR',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: compact ? 1 : n % 100 ? 2 : 0,
      }).format(n / 100)
// Only view preferences and selections live here. The career and all command results come from the API.
export function useStored(key, initial) {
  const g = useGame()
  return [
    g.preferences[key] ?? initial,
    (update) =>
      g.setPreferences((prev) => ({
        ...prev,
        [key]: typeof update === 'function' ? update(prev[key] ?? initial) : update,
      })),
  ]
}
