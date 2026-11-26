import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('Производитель поручает работу КБ и назначает консультанта клиенту', async ({ page }, info) => {
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Инженерная служба',
      org: 'supplier-mercedes',
      role: 'manufacturer',
      series: 'f1',
      seed: 51,
    },
  })
  await expect(created).toBeOK()
  const career = await created.json()
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.MAKER_EVIDENCE)
      await page.screenshot({
        path: join(process.env.MAKER_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  await page.goto('/?career=' + career.id + '#manufacturer')
  await expect(page.getByText('Мощность, кВт')).toBeVisible()
  await capture('catalog')
  await button('Исследования и разработки').click()
  await page.getByLabel('Целевой сезон').selectOption('2026')
  await button('Разработка').click()
  await expect(page.getByText('Разработка · В очереди')).toBeVisible()
  await capture('design')
  await button('Консультанты').click()
  await page.getByLabel('Окончание назначения').fill('2025-03-01')
  await button('Назначить консультанта').click()
  await expect(page.getByText('Назначение зарегистрировано.')).toBeVisible()
  await page.reload()
  await button('Консультанты').click()
  await expect(page.getByText(/2025-03-01 · 100%/)).toBeVisible()
})

test('Менеджер передаёт требование о тепловыделении поставщику', async ({ page }) => {
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Инженер клиента',
      org: 'team-mclaren-formula-1-team',
      role: 'manager',
      series: 'f1',
      seed: 51,
    },
  })
  await expect(created).toBeOK()
  await page.goto('/?career=' + (await created.json()).id + '#manufacturer')
  await page.getByRole('button', { name: 'Запросы', exact: true }).click()
  const message = 'Для нового поколения просим снизить требования к охлаждению.'
  await page.getByLabel('Приоритет клиента').selectOption('thermal')
  await page.getByLabel('Сообщение инженерам').fill(message)
  await page.getByRole('button', { name: 'Передать запрос' }).click()
  await expect(page.getByText(message, { exact: true })).toBeVisible()
})
