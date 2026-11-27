import { test, expect } from '@playwright/test'

test('Условия действующего договора Mercedes совпадают с коммерческой книгой', async ({ page }) => {
  const response = await page.request.post('/api/careers', {
    data: {
      org: 'team-mercedes-amg-petronas-f1-team',
      role: 'manager',
      series: 'f1',
      seed: 52,
      name: 'Проверка поставки',
    },
  })
  expect(response.ok()).toBe(true)
  const { id } = await response.json()
  const ledger = await (await page.request.get('/api/careers/' + id + '/commercial')).json()
  const deal = ledger.supplies.find(
    (r: { product: string; entries: string[] }) => r.product === 'engine' && r.entries.includes('f1-12'),
  )
  expect(deal).toMatchObject({ start: '2025-02-01', end: '2026-01-01', testing: true, development: true })
  await page.goto('/?career=' + id + '#manufacturer?tab=clients&entity=f1-12')
  const row = page
    .locator('.eng-client-list button')
    .filter({ hasText: '№12' })
    .filter({ hasText: 'Силовая установка' })
  await row.click()
  const terms = page
    .locator('.eng-card')
    .filter({ has: page.getByRole('heading', { name: 'Действующий договор', exact: true }) })
  for (const day of [deal.start, deal.end]) {
    const label = new Date(day + 'T12:00:00Z').toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    await expect(terms).toContainText(label)
  }
  await expect(terms).toContainText('Предусмотрены договором')
  await expect(terms).toContainText('Предусмотрена договором')
  await expect(page.locator('.eng-clients-layout')).not.toContainText('f1-12')
  for (const right of [false, null]) {
    await page.route('**/pit-wall?**', async (route) => {
      const original = await route.fetch()
      const payload = await original.json()
      for (const c of payload.projections.manufacturer?.clients || []) {
        c.terms.testing = right
        c.terms.development = right
      }
      await route.fulfill({ json: payload })
    })
    await page.reload()
    await row.click()
    await expect(terms).toContainText(right === false ? 'Не включены' : 'Сведения не указаны')
    await page.unroute('**/pit-wall?**')
  }
})
