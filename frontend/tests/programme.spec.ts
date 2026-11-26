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
  await button('Концепция').click()
  await page.getByText('Документация стартовой машины · 9').click()
  await expect(page.getByText(/Силовая установка · Mercedes · монтажная документация/)).toBeVisible()
  await expect(page.getByText(/Днище · McLaren.*конструкторская документация/)).toBeVisible()
  await button('Программа').click()
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
  await expect(page.getByText(/Пакет частично внедрён. Установлено 2 из 4/)).toBeVisible()
  const part = page.locator('.programme-parts article').first()
  await part.locator('summary').click()
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
