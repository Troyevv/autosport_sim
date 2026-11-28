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
  await page.getByLabel('Сезон программы').selectOption('2026')
  const refreshed = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().postDataJSON()?.action === 'maker-work')
  await button('Разработка').click()
  await page.getByRole('dialog').getByRole('button', {name:'Утвердить поручение'}).click()
  expect((await refreshed).ok()).toBe(true)
  await expect(page.locator('.eng-work-row').first()).toBeVisible()
  await capture('design')
  await button('Консультанты').click()
  await expect(page.getByLabel('Сотрудник')).toBeVisible()
  await capture('advisors')
  await button('Назначения специалиста').click()
  await button('Новое назначение').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio').first().click()
  await dialog.getByLabel('Начало поддержки').fill('2025-02-15')
  await dialog.getByLabel('Окончание (исключая)').fill('2025-03-01')
  await capture('appointment')
  await button('Назначить консультанта').click()
  await expect(dialog).toHaveCount(0)
  await page.goto('/?career=' + career.id + '#manufacturer?tab=advisors')
  const desk = await (await page.request.get('/api/careers/' + career.id + '/manufacturer')).json()
  const assignment = desk.assignments.find((a: { start: string; end: string }) =>
    a.start === '2025-02-15' && a.end === '2025-03-01')
  expect(assignment.load).toBeGreaterThan(0)
  expect(assignment.load).toBeLessThan(100)
  expect(assignment.channels.length).toBeGreaterThan(0)
  const support = page.locator('.eng-assignment').filter({hasText:/15 фев.*1 мар/}).first()
  await expect(support).toBeVisible()
  await support.locator('summary').click()
  await capture('rights')
  await expect(support.getByRole('progressbar')).toHaveAttribute('aria-valuenow',String(assignment.load))
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
  await page.getByRole('button', {name:'Новое обращение'}).click()
  await page.getByLabel('Вид обращения').selectOption('next')
  await page.getByLabel('Технический приоритет').selectOption('thermal')
  await page.getByLabel('Что требуется от инженеров').fill(message)
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить',exact:true }).click()
  await expect(page.getByText(message, { exact: true })).toBeVisible()
})

test('Штатный инженер и его заместитель видны в досье одной заявки', async ({page}, info) => {
  const created = await page.request.post('/api/careers', {data: {
    name:'Руководитель AIX', role:'manager', org:'team-aix-racing', series:'f2', seed:64,
  }})
  await expect(created).toBeOK()
  const career = await created.json()
  type Post = {position:string; engineering_reserve?:boolean; series?:string; entry?:string; occupant:{id:string; name:string}}
  const posts = career.assignments as Post[]
  const regular = posts.find(p => p.position === 'race-engineer' && p.series === 'f2')!
  const reserve = posts.find(p => p.engineering_reserve)!
  const dossier = (p:Post) => '/?career=' + career.id + '#person?tab=contract&entity=' + p.occupant.id
  await page.goto(dossier(reserve))
  await page.getByLabel('Заявка', {exact:true}).selectOption(regular.entry!)
  const submit = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().postDataJSON()?.action === 'engineer-cover')
  await page.getByRole('button', {name:'Назначить на замену'}).click()
  expect((await submit).ok()).toBe(true)
  await page.goto(dossier(regular))
  const history = page.locator('.p-advisor-assignment').filter({hasText:'Временное замещение'})
  await expect(history).toContainText(reserve.occupant.name)
  await expect(history).toContainText('Штатный инженер · ' + regular.occupant.name)
  await history.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
  if (process.env.MAKER_EVIDENCE)
    await page.screenshot({path:join(process.env.MAKER_EVIDENCE, info.project.name + '-crew-cover.png')})
})
