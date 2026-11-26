import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('Два поколения делят очередь, решения и регламент сохраняются', async ({ page }, info) => {
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Программа сезона',
      org: 'team-mclaren-formula-1-team',
      role: 'manager',
      series: 'f1',
      seed: 50,
    },
  })
  expect(created.ok()).toBeTruthy()
  const c = await created.json(),
    button = (name: string) => page.getByRole('button', { name, exact: true })
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.PROGRAMME_EVIDENCE)
      await page.screenshot({
        path: join(process.env.PROGRAMME_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  await page.goto('/?career=' + c.id + '#engineering')
  await expect(page.getByRole('heading', { name: 'Пакет обновлений' })).toBeVisible()
  await capture('programme')
  await page.getByRole('button', { name: /Следующее поколение/ }).click()
  await button('Рассмотреть').first().click()
  await button('Подтвердить решение').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await button('Календарь работ').click()
  await expect(page.getByText('0 / 72 ч', { exact: false })).toBeVisible()
  await capture('calendar')
  await button('Изменить приоритет').click()
  await page.getByLabel('Распределение работ').selectOption('stop-current')
  await button('Подтвердить решение').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await button('Ресурсы').click()
  await expect(page.getByRole('heading', { name: 'Общие мощности' })).toBeVisible()
  await capture('resources')
  await button('Регламент').click()
  await expect(page.getByRole('heading', { name: 'Бюллетень симуляции' })).toBeVisible()
  await capture('rules')
  await page.reload()
  await expect(page.getByText('Развитие приостановлено').first()).toBeVisible()
  await button('Решения').click()
  await expect(page.getByText('Остановка развития текущей машины')).toBeVisible()
})
