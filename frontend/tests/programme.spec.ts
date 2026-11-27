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
  await expect(page.locator('.eng-package-goal').first()).toBeVisible({timeout:30000})
  await capture('programme')
  await button('Концепция').click()
  const documents = page.locator('.eng-document-list article')
  await expect(documents).toHaveCount(9)
  await expect(documents.filter({hasText:'Силовая установка'})).toContainText('Документация поставщика · Mercedes')
  await expect(documents.filter({hasText:'Днище'})).toContainText('Доступен чертёж · McLaren')
  await button('Программа').click()
  await page.getByRole('button', { name: /следующее поколение/i }).click()
  await button('Открыть повестку').click()
  await button('Утвердить вариант').click()
  await page.getByRole('dialog').getByRole('button', {name:'Подтвердить', exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/?career=' + c.id + '#engineering?tab=calendar')
  await page.getByRole('button', { name: /следующее поколение/i }).click()
  await expect(page.locator('.eng-timeline-row').getByText('0 / 72 ч', {exact:true})).toBeVisible()
  await capture('calendar')
  await page.getByRole('button', {name:/Изменить приоритет/}).click()
  await page.getByLabel('Распределение работ').selectOption('stop-current')
  await page.getByRole('dialog').getByRole('button', {name:'Подтвердить', exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await button('Ресурсы').click()
  await expect(page.getByRole('heading', { name: 'Мощности и занятость' })).toBeVisible()
  await capture('resources')
  await button('Регламент').click()
  await expect(page.getByText('Бюллетень симуляции', {exact:true})).toBeVisible()
  await capture('rules')
  await page.reload()
  await expect(page.getByRole('button', {name:/Изменить приоритет · Приостановить текущее поколение/})).toBeVisible()
  await button('Решения').click()
  await expect(page.getByText('Остановка развития текущей машины')).toBeVisible()
})

test('Установленные днища обеих машин учтены отдельно от свободного склада', async ({ page }, info) => {
  const created = await page.request.post('/api/careers', {
    data: { name: 'Внедрение', org: 'team-mclaren-formula-1-team', role: 'manager', series: 'f1', seed: 42 },
  })
  expect(created.ok()).toBeTruthy()
  let c = await created.json()
  const url = '/api/careers/' + c.id
  const command = async (action: string, payload: Record<string, unknown> = {}) => {
    const response = await page.request.post(url + '/commands', {
      data: { action, revision: c.revision, command_id: 'coverage-' + c.revision, ...payload },
    })
    await expect(response).toBeOK()
    c = await response.json()
  }
  const desk = await (await page.request.get(url + '/programme')).json()
  const base = desk.plans[0].packages[0].baselines.floor
  await command('finance-lease', {
    finance: { facility: 'shared:design', start: c.date, days: 5, units: 1, mode: 'lease' },
  })
  await command('development-test', {
    development: { entry: 'f1-4', baseline: base, candidate: base, priority: 'normal', method: 'calculation' },
  })
  await command(c.pending.length ? c.briefing_action : 'advance')
  await page.goto('/?career=' + c.id + '#engineering')
  await page.getByText('Зависимости и риск пакета', {exact:true}).first().click()
  await expect(page.getByText(/Пакет частично внедрён. Установлено 2 из 4/)).toBeVisible()
  const part = page.getByRole('region', {name:'Днище',exact:true}).first()
  await expect(part.getByText('№4 · Установлен', { exact: true })).toBeVisible()
  await expect(part.getByText('№81 · Установлен', { exact: true })).toBeVisible()
  await expect(part.getByText('Выделено со склада для пакета · 0')).toBeVisible()
  await expect(part.getByRole('button', { name: /Установить/ })).toHaveCount(0)
  await part.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
  if (process.env.PROGRAMME_EVIDENCE) {
    await page.screenshot({ path: join(process.env.PROGRAMME_EVIDENCE, info.project.name + '-deployment.png') })
  }
})
