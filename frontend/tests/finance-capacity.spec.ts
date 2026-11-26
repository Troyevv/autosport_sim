import { expect, test } from '@playwright/test'

test('Аренда мощности и источник многосерийного соглашения', async ({ page }) => {
  async function openCareer(org: string, series: string, section: string) {
    const result = await page.request.post('/api/careers', {
      data: { org, series, name: 'Алекс', role: 'owner', seed: 53 },
    })
    expect(result.status()).toBe(201)
    const { id } = await result.json()
    await page.goto('/?career=' + id + '#' + section)
  }

  await openCareer('team-mclaren-formula-1-team', 'f1', 'facilities')
  await page.getByRole('button', { name: 'Мощности', exact: true }).click()
  const research = page.locator('.capacity-card').filter({ hasText: 'Исследования' })
  const initial = await research.locator('dd').allTextContents()
  await research.getByRole('button').click()
  const center = page.locator('.rights-row').filter({ hasText: 'Исследовательский центр' }).filter({hasText: 'Независимый оператор'})
  await center.getByRole('button', { name: 'Забронировать' }).click()
  await page.getByLabel('Единиц мощности').fill('2')
  await page.getByLabel('Дней').fill('7')
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: 'Мощности', exact: true }).click()
  await expect(research.locator('dd')).toHaveText([initial[0], String(Number(initial[1]) + 2), (Number(initial[2].replace(',', '.')) + 8).toLocaleString('ru-RU', {maximumFractionDigits: 2}), initial[3]])

  await openCareer('team-dams-lucas-oil', 'f2', 'commercial')
  await page.getByRole('button', { name: 'Договоры', exact: true }).click()
  await expect(page.locator('.commercial-row')).toHaveCount(8)
  await page.locator('.commercial-row').filter({ hasText: 'OMP Racing' }).click()
  await expect(page.getByRole('link', { name: 'Источник партнёрства сезона 2025' })).toHaveAttribute(
    'href',
    /^https:\/\/damslucasoil\.com\//,
  )
})
