import { expect, test } from '@playwright/test'
import { join } from 'node:path'
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
  const path = '/api/careers/' + c.id + '/production'
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const dialog = page.getByRole('dialog')
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.PRODUCTION_EVIDENCE)
      await page.screenshot({
        path: join(process.env.PRODUCTION_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  const advance = async () => {
    const updated = page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'GET')
    await button('Продолжить').click()
    return (await (await updated).json()) as Desk
  }
  await page.goto('/?career=' + c.id + '#production')
  await expect(button('Новый заказ')).toBeVisible()
  await button('Новый заказ').click()
  const choices = dialog.getByLabel('Спецификация')
  const id = await choices
    .locator('option')
    .evaluateAll(
      (options) => (options as HTMLOptionElement[]).find((o) => o.value.endsWith('/rear-wing/2'))!.value,
    )
  await choices.selectOption(id)
  await dialog.getByLabel('Количество').fill('25')
  await expect(button('Утвердить заказ')).toBeDisabled()
  await dialog.getByLabel('Количество').fill('2')
  await dialog.getByLabel('Срочное изготовление').check()
  await capture('order')
  await button('Утвердить заказ').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Срочная партия')).toBeVisible()
  await advance()
  await expect(page.getByText(/Требуется свободная мощность/)).toBeVisible()
  for (const site of ['Производственный комплекс', 'Центр контроля качества']) {
    await button('Арендовать · ' + site).click()
    await button('Подтвердить аренду').click()
    await expect(dialog).toHaveCount(0)
  }
  await button('Изменить приоритет').click()
  await dialog.getByLabel('Новый приоритет').selectOption('high')
  await button('Подтвердить решение').click()
  await expect(page.getByText('Высокий приоритет')).toBeVisible()
  await capture('queue')
  let d = await advance()
  for (let n = 0; n < 6 && !d.items.some((i) => i.batch); n++) d = await advance()
  expect(d.items.filter((i) => i.batch)).toHaveLength(2)
  await button('Контроль качества').click()
  await expect(page.locator('.workshop-row')).toHaveCount(2)
  await page.locator('.workshop-row').first().scrollIntoViewIfNeeded()
  await capture('quality')
  for (let n = 0; n < 6 && !d.items.some((i) => i.batch && i.status === 'stock'); n++) d = await advance()
  const unit = d.items.find((i) => i.batch && i.status === 'stock')!
  expect(unit).toBeDefined()
  await button('Склад').click()
  const search = page.getByLabel('Поиск по реестру')
  await search.fill('несуществующий')
  await expect(page.getByText('По выбранным условиям деталей нет.')).toBeVisible()
  await search.fill(unit.serial)
  await page.locator('.workshop-row').click()
  await expect(dialog).toContainText('Допущен по протоколу')
  await expect(dialog.getByText(/Первый пилот|Второй пилот|Равноправный пилот/)).toBeVisible()
  await capture('serial')
  await button('Установить на машину').click()
  await button('Подтвердить операцию').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.workshop-row')).toContainText('Установлен')
  await button('Потребность').click()
  await expect(page.getByRole('heading', { name: 'Заявки механиков и инженеров' })).toBeVisible()
  await button('Журнал').click()
  await expect(page.getByText(/Изготовлен · Заднее антикрыло/).first()).toBeVisible()
  await page.reload()
  await button('Склад').click()
  await page.getByLabel('Поиск по реестру').fill(unit.serial)
  await expect(page.locator('.workshop-row')).toContainText('Установлен')
})
