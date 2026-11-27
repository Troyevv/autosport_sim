export function readRoute() {
  const [page, query] = location.hash.slice(1).split('?')
  const search = new URLSearchParams(query)
  return { page: page || 'overview', tab: search.get('tab') || '', entity: search.get('entity') || '' }
}
export function navigate(page: string, tab = '', entity = '') {
  if (['menu', 'saves', 'scenarios'].includes(page)) {
    location.assign('./' + (page === 'menu' ? '' : '#saves'))
    return
  }
  const query = new URLSearchParams()
  if (tab) query.set('tab', tab)
  if (entity) query.set('entity', entity)
  const target = '#' + page + (query.size ? '?' + query : '')
  if (location.hash === target) return
  const previous = location.hash || '#overview'
  location.hash = target
  history.replaceState({ ...history.state, careerPrevious: previous }, '')
}

export function initialTab<T extends string>(
  items: readonly (readonly [T, string])[],
  fallback: T,
  preferred = readRoute().tab,
): T {
  return items.find(([id]) => id === preferred)?.[0] ?? fallback
}
