import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('Исследования · от гипотезы до архива и передачи опыта', async ({ page }, info) => {
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Исследовательский центр',
      role: 'manager',
      org: 'team-mclaren-formula-1-team',
      series: 'f1',
      seed: 46,
    },
  })
  expect(created.ok()).toBeTruthy()
  const career = await created.json()
  await page.route('**/research', (r) => r.abort(), { times: 1 })
  await page.goto('/?career=' + career.id + '#research')
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await button('Повторить загрузку').click()
  await expect(page.getByRole('heading', { name: 'Очередь свободна' })).toBeVisible()
  await button('Поручить исследование').click()
  await button('Отмена').click()
  await expect(button('Поручить исследование')).toBeFocused()
  await button('Арендовать слот').click()
  await button('Подтвердить аренду').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const axis of ['floor', 'cooling']) {
    await button('Поручить исследование').click()
    await page.getByRole('combobox', { name: 'Направление', exact: true }).selectOption(axis)
    if (axis === 'cooling') await page.getByLabel('Источник информации').selectOption('f1-1')
    await button('Утвердить расходы').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await button('Изменить приоритет').last().click()
  await page.getByRole('combobox', { name: 'Приоритет', exact: true }).selectOption('high')
  await button('Сохранить приоритет').click()
  await expect(page.locator('.research-card').first()).toContainText('Высокий приоритет')
  const progress = async () => {
    const wait = page.waitForResponse((r) => r.url().endsWith('/research') && r.request().method() === 'GET')
    await button('Продолжить').click()
    await wait
  }
  await progress()
  await expect(page.locator('.research-card').first()).toContainText('В работе')
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.RESEARCH_EVIDENCE)
      await page.screenshot({
        path: join(process.env.RESEARCH_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  if (info.project.name === 'mobile')
    await page
      .locator('.research-layout')
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 72))
  else await page.evaluate(() => window.scrollTo(0, 0))
  await capture('queue')
  await progress()
  await progress()
  await button('Техническая память').click()
  await expect(page.locator('.research-card').first()).toContainText('Заявочный лист')
  await page.getByLabel('Оценить применимость к').selectOption({ index: 1 })
  await expect(page.locator('.research-card').first()).toContainText('новая концепция')
  if (info.project.name === 'mobile')
    await page
      .locator('.research-card')
      .first()
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 72))
  await capture('memory')
  await button('Передать опыт').first().click()
  await button('Провести разбор').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await button('Техническая память').click()
  await page.getByText('Материалы и личный вклад').first().click()
  await expect(page.locator('.research-card').first()).toContainText('передача дел')
  await page.getByRole('combobox', { name: 'Направление', exact: true }).selectOption('tyre')
  await expect(page.getByText('По заданным условиям заключений нет.')).toBeVisible()
})
