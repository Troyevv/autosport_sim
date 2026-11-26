import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('КБ · новая редакция, сравнительные испытания и отзыв', async ({ page }, info) => {
  test.setTimeout(100000)
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Инженерный отдел',
      role: 'manager',
      org: 'team-mclaren-formula-1-team',
      series: 'f1',
      seed: 47,
    },
  })
  expect(created.ok()).toBe(true)
  const c = await created.json()
  await page.goto('/?career=' + c.id + '#development')
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const dialog = page.getByRole('dialog')
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.DEVELOPMENT_EVIDENCE)
      await page.screenshot({
        path: join(process.env.DEVELOPMENT_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  const rent = async (label: string) => {
    await button('Арендовать · ' + label).click()
    await button('Подтвердить аренду').click()
    await expect(dialog).toHaveCount(0)
  }
  const advance = async () => {
    const refresh = page.waitForResponse(
      (r) => r.url().endsWith('/development') && r.request().method() === 'GET',
    )
    await button('Продолжить').click()
    return (await refresh).json()
  }
  await rent('Конструкторское бюро')
  await button('Поручить разработку').click()
  await dialog.getByRole('combobox', { name: 'Узел', exact: true }).selectOption('engine')
  await expect(dialog.getByText('Чертёж принадлежит утверждённому поставщику.')).toBeVisible()
  await expect(button('Утвердить поручение')).toBeDisabled()
  await dialog.getByRole('combobox', { name: 'Узел', exact: true }).selectOption('rear-wing')
  await dialog.getByRole('combobox', { name: 'Приоритет', exact: true }).selectOption('high')
  await capture('brief')
  await button('Утвердить поручение').click()
  await expect(dialog).toHaveCount(0)
  await advance()
  const card = page.locator('.development-card').first()
  await expect(card).toContainText('В работе')
  if (info.project.name === 'mobile') await card.scrollIntoViewIfNeeded()
  await capture('queue')
  for (let day = 0; day < 9; day++) {
    const d = await advance()
    if (d.projects.some((p: { finished: string | null }) => p.finished)) break
  }
  await button('Архив решений').click()
  await card.getByText('Прогноз специалистов и риски', { exact: true }).click()
  await expect(card).toContainText('Площадь прижима')
  await rent('Аэродинамическая труба')
  await button('Испытать редакцию').click()
  await dialog.getByLabel('Метод проверки').selectOption('tunnel')
  await expect(dialog).toContainText('Расход ATR')
  await button('Утвердить поручение').click()
  await expect(dialog).toHaveCount(0)
  await button('Испытания').click()
  await expect(card).toContainText('Аэродинамическая труба')
  await advance()
  await button('Архив решений').click()
  const measurements = page.locator('.measurement')
  await expect(measurements).toContainText('Разница Б − А')
  await measurements.scrollIntoViewIfNeeded()
  await capture('comparison')
  await button('Отозвать редакцию').click()
  await button('Подтвердить решение').click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await button('Архив решений').click()
  await expect(
    page.locator('.development-card').filter({ hasText: 'Заднее антикрыло' }).first(),
  ).toContainText('Отозвана')
})
