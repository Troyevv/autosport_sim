import { expect, test } from '@playwright/test'
import { advanceDesk, leaseFacility } from './engineeringDesk'
import { join } from 'node:path'

test('Исследования · от гипотезы до архива и передачи опыта', async ({ page }, info) => {
  test.setTimeout(150000)
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
  await page.route('**/pit-wall?*topics=research*', (r) => r.abort(), { times: 1 })
  await page.goto('/?career=' + career.id + '#research')
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await button('Повторить').click()
  await expect(page.getByRole('heading', { name: 'Центр готов к новой гипотезе' })).toBeVisible()
  await button('Новое исследование').click()
  await button('Отмена').click()
  await expect(button('Новое исследование')).toBeFocused()
  await leaseFacility(page, 'Исследовательский центр')
  for (const axis of ['floor', 'cooling']) {
    await button('Новое исследование').click()
    await page.getByRole('combobox', { name: 'Направление', exact: true }).selectOption(axis)
    if (axis === 'cooling') await page.getByLabel('Источник информации').selectOption('f1-1')
    await button('Утвердить поручение').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  const cooling = page.locator('.eng-work-row').filter({hasText:'RB21'})
  await expect(page.locator('.eng-work-row')).toHaveCount(2)
  await cooling.click()
  await page.getByRole('dialog').getByRole('button',{name:'Приоритет',exact:true}).click()
  await page.getByLabel('Новый приоритет').selectOption('high')
  await page.getByRole('dialog').getByRole('button',{name:'Подтвердить',exact:true}).click()
  await expect(cooling).toContainText('Высокий приоритет')
  const progress = async () => (await advanceDesk(page,'research')).reports.length as number
  await progress()
  await expect(cooling).toContainText('В работе')
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.RESEARCH_EVIDENCE)
      await page.screenshot({
        path: join(process.env.RESEARCH_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  if (info.project.name === 'mobile')
    await page
      .locator('.eng-work-list')
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 72))
  else await page.evaluate(() => window.scrollTo(0, 0))
  await capture('queue')
  let reports = await progress()
  for (let day = 0; !reports && day < 4; day++) reports = await progress()
  expect(reports).toBeGreaterThan(0)
  await expect(cooling).toHaveCount(0)
  await button('Техническая память').click()
  await expect(page.locator('.eng-memory-grid .eng-card').first()).toContainText('Заявочный лист')
  await page.getByLabel('Оценить применимость к').selectOption({ index: 1 })
  await expect(page.locator('.eng-memory-grid .eng-card').first()).toContainText('новая концепция')
  if (info.project.name === 'mobile')
    await page
      .locator('.eng-memory-grid .eng-card')
      .first()
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 72))
  await capture('memory')
  await button('Передать знания').first().click()
  await page.getByRole('dialog').getByRole('button',{name:'Подтвердить',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await button('Техническая память').click()
  await page.getByText('Материалы и личный вклад').first().click()
  await expect(page.locator('.eng-memory-grid .eng-card').first()).toContainText('передача дел')
  await page.getByLabel('Направление знаний').selectOption('tyre')
  await expect(page.getByText('По заданным условиям заключений нет.')).toBeVisible()
})
