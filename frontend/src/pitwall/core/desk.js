import { useEffect, useRef, useState } from 'react'
import { api, explain } from '../../career/api'

const technical = ['council', 'development', 'production', 'research', 'programme']
function sources(c, route, tab) {
  const topic =
    route === 'briefings'
      ? tab || { owner: 'capital', manager: 'council', manufacturer: 'manufacturer' }[c.role]
      : route
  if (route === 'overview')
    return c.role === 'owner'
      ? ['capital', 'garage', 'finance']
      : c.role === 'manager'
        ? ['garage', 'finance', 'council', 'development']
        : ['manufacturer', 'finance', 'production', 'development']
  if (route === 'world') return ['garage']
  if (route === 'inbox') return ['council']
  if (route === 'contracts') return ['dossiers']
  if (route === 'funding') return ['funding']
  if (route === 'agreements') return ['commercial', 'capital', 'facilities', 'dossiers', 'funding']
  if (['statistics', 'organization'].includes(route))
    return ['statistics', 'garage', 'commercial', 'manufacturer']
  if (topic === 'facilities') return ['facilities', 'production', 'manufacturer']
  if (topic === 'capital') return ['capital', 'finance']
  if (['finance', 'budget', 'cap'].includes(topic))
    return ['finance', 'budget', 'commercial', 'accounts']
  if (['production', 'inventory'].includes(topic)) return ['production', 'manufacturer', 'facilities']
  if ([...technical, 'engineering', 'inventory', 'manufacturer'].includes(topic))
    return [...technical, 'manufacturer', 'garage', 'components', 'facilities']
  if (['staff', 'drivers', 'people', 'academy', 'leadership', 'preparation'].includes(topic))
    return ['production']
  return []
}
async function parallel(items, fn) {
  const result = {}
  let next = 0
  async function run() {
    while (next < items.length) {
      const item = items[next++]
      result[item] = await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, run))
  return result
}
export function useDesk(c, route, tab) {
  const paths = sources(c, route, tab).join(','),
    key = [c.id, c.revision, paths].join('/'),
    [result, set] = useState({}),
    [attempt, retry] = useState(0)
  const cache = useRef({ revision: '', entries: new Map() })
  useEffect(() => {
    const revision = c.id + '/' + c.revision
    if (cache.current.revision !== revision) cache.current = { revision, entries: new Map() }
    const entries = cache.current.entries
    const controller = new globalThis.AbortController(),
      signal = controller.signal,
      req = async (path) => {
        if (entries.has(path)) return entries.get(path)
        const data = await api('careers/' + encodeURIComponent(c.id) + '/' + path, { signal })
        if (!signal.aborted) entries.set(path, data)
        return data
      }
    async function load() {
      const names = paths.split(',').filter(Boolean),
        base = names.filter((x) => !['dossiers', 'components', 'statistics'].includes(x))
      const missing = base.filter((name) => !entries.has(name))
      if (missing.length) {
        const query = new globalThis.URLSearchParams(missing.map((name) => ['topics', name]))
        const snapshot = await req('pit-wall?' + query)
        if (snapshot.revision !== c.revision)
          throw Error('Сохранение изменилось. Обновите страницу, чтобы получить актуальные данные.')
        for (const [name, value] of Object.entries(snapshot.projections)) entries.set(name, value)
      }
      const projections = Object.fromEntries(base.map((name) => [name, entries.get(name)]))
      const components = names.includes('components')
        ? await parallel(
            [...new Set(c.assignments.filter((s) => s.org === c.org && s.entry).map((s) => s.entry))],
            (id) => req('components/' + encodeURIComponent(id)),
          )
        : {}
      const dossiers = names.includes('dossiers')
        ? await parallel(
            [
              ...new Set(
                c.assignments.filter((s) => s.org === c.org && s.occupant).map((s) => s.occupant.id),
              ),
            ],
            (id) => req('personnel/' + encodeURIComponent(id)),
          )
        : {}
      const financeContexts = projections.accounts || {}
      if (names.includes('statistics')) {
        const items = [],
          seen = new Set()
        let after = null
        do {
          const query = new globalThis.URLSearchParams({ limit: '200' })
          if (after) query.set('after', after)
          const page = await req('statistics?' + query)
          items.push(...page.items)
          after = page.after ? JSON.stringify(page.after) : null
          if (after && seen.has(after)) throw Error('Сервер повторил страницу истории.')
          seen.add(after)
        } while (after)
        projections.statistics = { items }
      }
      const funding = projections.funding || []
      if (!signal.aborted)
        set({
          key,
          game: {
            projections,
            components,
            dossiers,
            financeContexts,
            funding,
            garageCatalog: projections.garage,
          },
        })
    }
    load().catch((e) => {
      if (!signal.aborted) set({ key, error: explain(e) })
    })
    return () => controller.abort()
  }, [key, attempt, c, paths])
  return {
    ...(result.key === key ? result : {}),
    retry: () => {
      set({})
      retry((n) => n + 1)
    },
  }
}
