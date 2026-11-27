import { useEffect, useRef, useState } from 'react'
import { api, explain } from '../../career/api'

const technical = ['council', 'development', 'production', 'research', 'programme']
const financial = ['finance', 'budget', 'capital', 'facilities']
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
  if (route === 'agreements') return ['commercial', 'capital', 'facilities', 'dossiers']
  if (['statistics', 'organization'].includes(route))
    return ['statistics', 'garage', 'commercial', 'manufacturer']
  if ([...financial, 'commercial', 'cap', 'economy'].includes(topic)) return [...financial, 'accounts']
  if ([...technical, 'engineering', 'inventory', 'manufacturer'].includes(topic))
    return [...technical, 'manufacturer', 'garage', 'components', 'facilities']
  if (['staff', 'drivers', 'people', 'academy', 'leadership', 'preparation'].includes(topic))
    return ['production', 'dossiers']
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
  const cache = useRef({revision: '', entries:new Map()})
  useEffect(() => {
    const revision = c.id + '/' + c.revision
    if(cache.current.revision !== revision) cache.current = {revision, entries:new Map()}
    const entries = cache.current.entries
    const controller = new globalThis.AbortController(),
      signal = controller.signal,
      req = async (path) => {
        if(entries.has(path)) return entries.get(path)
        const data = await api('careers/' + encodeURIComponent(c.id) + '/' + path, { signal })
        if(!signal.aborted) entries.set(path,data)
        return data
      }
    async function load() {
      const names = paths.split(',').filter(Boolean),
        base = names.filter((x) => !['dossiers', 'components', 'accounts', 'statistics'].includes(x))
      const projections = await parallel(base, req)
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
      const financeContexts = names.includes('accounts')
        ? await parallel(projections.finance.scopes || [], (s) =>
            req('finance?' + new globalThis.URLSearchParams({ scope: s })),
          )
        : {}
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
      const funding = [
        ...new Map(
          Object.values(dossiers)
            .flatMap((d) => d.financing || [])
            .map((x) => [x.id, x]),
        ).values(),
      ]
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
