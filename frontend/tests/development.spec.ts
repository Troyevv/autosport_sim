import { expect, test } from '@playwright/test'
import { advanceDesk, leaseFacility } from './engineeringDesk'
import { join } from 'node:path'

test('КБ · новая редакция, сравнительные испытания и отзыв', async ({ page }, info) => {
  test.setTimeout(180000)
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
  const rent = (label: string) => leaseFacility(page,label)
  const advance = () => advanceDesk(page,'development')
  await rent('Конструкторское бюро')
  await button('Поручить разработку').click()
  await dialog.getByRole('combobox', { name: 'Направление', exact: true }).selectOption('engine')
  await expect(dialog.getByText('Чертёж принадлежит утверждённому поставщику.')).toBeVisible()
  await expect(button('Утвердить поручение')).toBeDisabled()
  await dialog.getByRole('combobox', { name: 'Направление', exact: true }).selectOption('rear-wing')
  await dialog.getByRole('combobox', { name: 'Приоритет', exact: true }).selectOption('high')
  await capture('brief')
  await button('Утвердить поручение').click()
  await expect(dialog).toHaveCount(0)
  for (let step = 0; step < 8; step++) {
    const d = await advance()
    if (d.projects.some((p: { worked: number }) => p.worked > 0)) break
  }
  const card = page.locator('.eng-work-row').first()
  await expect(card).toContainText('В работе')
  if (info.project.name === 'mobile') await card.scrollIntoViewIfNeeded()
  await capture('queue')
  for (let day = 0; day < 9; day++) {
    const d = await advance()
    if (d.projects.some((p: { finished: string | null }) => p.finished)) break
  }
  await button('Редакции и протоколы').click()
  await card.click()
  await dialog.getByText('Прогноз специалистов и риски', { exact: true }).click()
  await expect(dialog).toContainText('Площадь прижима')
  await page.keyboard.press('Escape')
  await rent('Аэродинамическая труба')
  await card.click()
  await dialog.getByRole('button',{name:'Назначить испытание'}).click()
  await dialog.getByLabel('Метод проверки').selectOption('tunnel')
  await expect(dialog).toContainText('Расход ATR')
  await button('Утвердить поручение').click()
  await expect(dialog).toHaveCount(0)
  await button('Испытания').click()
  await card.click()
  await expect(dialog).toContainText('Аэродинамическая труба')
  await page.keyboard.press('Escape')
  await advance()
  await button('Редакции и протоколы').click()
  const completedTest = page.locator('.eng-work-row').filter({ hasText: '1 / 1 сеанс' })
  await completedTest.click()
  const measurements = page.locator('.measurement')
  await expect(measurements).toContainText('Разница Б − А')
  await measurements.scrollIntoViewIfNeeded()
  await capture('comparison')
  await dialog.getByRole('button',{name:'Отозвать',exact:true}).click()
  await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click()
  await page.getByRole('button',{name:'Вернуться к работе'}).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await button('Редакции и протоколы').click()
  await expect(
    page.locator('.eng-work-row').filter({ hasText: 'Заднее антикрыло' }).first(),
  ).toContainText('Редакция отозвана')
})
