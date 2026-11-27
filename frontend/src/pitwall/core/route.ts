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
  location.hash = page + (query.size ? '?' + query : '')
}

export function initialTab<T extends string>(
  items: readonly (readonly [T, string])[],
  fallback: T,
  preferred = readRoute().tab,
): T {
  return items.find(([id]) => id === preferred)?.[0] ?? fallback
}
