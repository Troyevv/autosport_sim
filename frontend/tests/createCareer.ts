import { expect, type Page } from '@playwright/test'

export async function submitCareer(page: Page) {
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/careers' && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Начать карьеру' }).click(),
  ])
  expect(created.status()).toBe(201)
}


export async function configureCareer(
  page: Page,
  { role = 'manager', series = 'f1', org = 'team-mclaren-formula-1-team', name = 'Алекс', country = 'RU' } = {},
) {
  const world = await (await page.request.get('/api/world')).json()
  const roles: Record<string, string> = { manager: 'Менеджер команды', owner: 'Владелец организации', manufacturer: 'Производитель' }
  await page.getByRole('button', { name: 'Новая карьера', exact: true }).click()
  const choose = (selector: string, label: string) =>
    page.locator(selector).filter({ has: page.getByRole('heading', { name: label, exact: true }) }).click()
  await choose('.role-card', roles[role])
  await choose('.series-card', world.championships[series].name)
  await choose('.org-card', world.organizations[org].name)
  await page.locator('.wizard-next button').click()
  await page.getByLabel('Ваше имя').fill(name)
  await page.getByLabel('Гражданство').selectOption(country)
}
