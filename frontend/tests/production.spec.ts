import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { advanceDesk } from './engineeringDesk'
import type { Desk } from '../src/career/production/model'

test('Цех, приёмка, склад и назначение на машину', async ({ page }, info) => {
  test.setTimeout(100000)
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Начальник цеха',
      role: 'manager',
      org: 'team-mclaren-formula-1-team',
      series: 'f1',
      seed: 48,
    },
  })
  expect(created.ok()).toBeTruthy()
  const c = await created.json()
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const dialog = page.getByRole('dialog')
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.PRODUCTION_EVIDENCE)
      await page.screenshot({
        path: join(process.env.PRODUCTION_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  const advance = (): Promise<Desk> => advanceDesk(page, 'production')
  await page.goto('/?career=' + c.id + '#production')
  await expect(button('Новый заказ')).toBeVisible()
  await button('Новый заказ').click()
  await dialog.getByRole('combobox', { name: 'Направление' }).selectOption('rear-wing')
  const choices = dialog.getByRole('combobox', { name: 'Исходная редакция' })
  const id = await choices
    .locator('option')
    .evaluateAll(
      (options) => (options as HTMLOptionElement[]).find((o) => o.value.endsWith('/rear-wing/2'))!.value,
    )
  await choices.selectOption(id)
  await dialog.getByLabel('Количество').fill('25')
  await expect(button('Утвердить поручение')).toBeDisabled()
  await dialog.getByLabel('Количество').fill('2')
  await dialog.getByLabel('Срочное изготовление').check()
  await capture('order')
  await button('Утвердить поручение').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Срочная партия')).toBeVisible()
  await page.locator('.eng-work-row').filter({ hasText: 'Срочная партия' }).click()
  await dialog.getByRole('button', { name: 'Приоритет', exact: true }).click()
  await dialog.getByLabel('Новый приоритет').selectOption('high')
  await button('Подтвердить').click()
  await expect(page.getByText('Высокий приоритет')).toBeVisible()
  await capture('queue')
  let d = await advance()
  for (let n = 0; n < 6 && !d.items.some((i) => i.batch); n++) d = await advance()
  expect(d.items.filter((i) => i.batch)).toHaveLength(2)
  await button('Контроль качества').click()
  await expect(page.locator('.eng-inventory-row')).toHaveCount(2)
  await page.locator('.eng-inventory-row').first().scrollIntoViewIfNeeded()
  await capture('quality')
  for (let n = 0; n < 6 && !d.items.some((i) => i.batch && i.status === 'stock'); n++) d = await advance()
  const unit = d.items.find((i) => i.batch && i.status === 'stock')!
  expect(unit).toBeDefined()
  await button('Экземпляры').click()
  const search = page.getByPlaceholder('Найти серийный номер или компонент')
  await search.fill('несуществующий')
  await expect(page.getByText('В этой выборке нет экземпляров')).toBeVisible()
  await search.fill(unit.serial)
  await page.locator('.eng-inventory-row').click()
  await dialog.getByText('История установок и контроля', { exact: true }).click()
  await expect(dialog).toContainText('Допущен по протоколу')
  await expect(dialog.getByText(/Первый пилот|Второй пилот|Равноправный пилот/).first()).toBeVisible()
  await capture('serial')
  await button('Установить на автомобиль').click()
  await button('Подтвердить').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.eng-inventory-row')).toContainText('Установлено')
  await button('Потребность').click()
  await expect(page.getByRole('heading', { name: 'Потребность в физических экземплярах' })).toBeVisible()
  await button('История').click()
  await expect(page.locator('.eng-history article').filter({ hasText: unit.serial }).filter({ hasText: 'Изготовлен' }).first()).toBeVisible()
  await page.reload()
  await button('Экземпляры').click()
  await page.getByPlaceholder('Найти серийный номер или компонент').fill(unit.serial)
  await expect(page.locator('.eng-inventory-row')).toContainText('Установлено')
})
