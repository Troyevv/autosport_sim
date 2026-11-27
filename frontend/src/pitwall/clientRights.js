// Commercial contracts determine current client access. The opening-world
// supplier list is not a fallback when an agreement expires or is terminated.
// Canonical API product/series identifiers and all disclosed terms are retained.
export function currentSupplyPrograms({ world, sourceSupplies = [], organization, date, role = 'manufacturer' }) {
  const agreements = sourceSupplies;
  const active = agreements.slice()
    .filter(s => (role === 'manufacturer' ? s.sponsor === organization : s.org === organization) && s.status === 'signed' && s.start <= date && s.end > date)
    .sort((a, b) => a.start.localeCompare(b.start));
  const clients = new Map();
  for (const terms of active) {
    for (const entry of Object.values(world.entries || {})) {
      if (entry.org !== terms.org || entry.championship !== terms.series) continue;
      if (Array.isArray(terms.entries) && !terms.entries.includes(entry.id)) continue;
      clients.set(entry.id + ':' + terms.product, { entry: entry.id, org: entry.org, series: entry.championship, product: terms.product, number: entry.number, terms });
    }
  }
  return [...clients.values()];
}
