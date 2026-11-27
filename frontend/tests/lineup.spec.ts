import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('Менеджер согласует иерархию с обоими пилотами и открывает условия резервного договора', async ({
  page,
}, info) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const res = await page.request.post('/api/careers', {
    data: { name: 'Алекс', org: 'team-mclaren-formula-1-team', role: 'manager', series: 'f1', seed: 42 },
  })
  expect(res.ok()).toBeTruthy()
  const c = await res.json()
  await page.goto('/?career=' + c.id + '#people')
  await page.getByRole('button', { name: 'Состав пилотов', exact: true }).click()
  const drivers = page.locator('.lineup-driver')
  await expect(drivers).toHaveCount(2)
  await expect(drivers.first()).toContainText('Равноправный пилот')
  await drivers.first().getByText('Пересмотреть иерархию').click()
  await drivers.first().getByLabel('Предлагаемый статус').selectOption('first')
  await drivers.first().getByRole('button', { name: 'Обсудить условия' }).click()
  await expect(page.locator('.lineup-event').first()).toContainText('Запрашивает компенсацию')
  const message = await page.locator('.lineup-event').first().innerText()
  const amount = message.match(/компенсацию ([\d,.]+) €/)![1].replaceAll(',', '')
  await drivers.first().getByLabel('Предел компенсации').fill(amount)
  await drivers.first().getByRole('button', { name: 'Обсудить условия' }).click()
  await expect(drivers.first().locator('.lineup-heading b')).toHaveText('Первый пилот')
  await expect(drivers.nth(1).locator('.lineup-heading b')).toHaveText('Второй пилот')
  await drivers.first().getByText('Пересмотреть иерархию').click()
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
  if (process.env.LINEUP_EVIDENCE) {
    await page.locator('.lineup-desk').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: join(process.env.LINEUP_EVIDENCE, info.project.name + '-lineup.png') })
  }
  await page.getByRole('button', { name: 'Подобрать пилота' }).click()
  if (await page.locator('.staff-filter-trigger[aria-expanded=false]').isVisible()) await page.locator('.staff-filter-trigger').click()
  await page.getByLabel('Свободные агенты').check()
  await page.locator('.staff-card').first().click()
  const dialog = page.locator('.staff-dossier')
  await dialog.getByRole('button', { name: 'Договор', exact: true }).click()
  await dialog.getByLabel('Должность и место').selectOption(c.org + ':f1:reserve')
  const start = await dialog.getByLabel('Начало', { exact: true }).inputValue()
  await dialog.getByLabel('Совмещать резерв и испытания').check()
  await dialog.getByLabel('Разрешить выступления').check()
  await dialog.getByLabel('Оклад в месяц').fill('20000')
  await dialog.getByRole('button', { name: 'Отправить предложение' }).click()
  await expect(page.locator('.staff-offer')).toContainText('Резервный пилот')
  const response = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  expect((await response).ok()).toBe(true)
  await expect(page.locator('.staff-offer')).toContainText('Подписан')
  await expect(page.locator('.staff-offer')).toContainText('Назначение с ' + start)
  await page.getByRole('button', { name: 'Состав пилотов', exact: true }).click()
  await page.getByRole('button', { name: 'Назначить симулятор' }).first().click()
  await expect(page.getByText(/Симулятор запланирован до/)).toBeVisible()
  expect(errors).toEqual([])
})

test('Регистрация замены проверяет кандидата, затем допуск возвращает основной состав', async ({
  page,
}, info) => {
  const { execFileSync } = await import('node:child_process')
  const { resolve } = await import('node:path')
  const fixture = (...args: string[]) =>
    execFileSync('uv', ['run', '--locked', 'python', '-m', 'tests.lineup_fixture', ...args], {
      cwd: resolve('..'),
      env: { ...process.env, AUTOSPORT_DATA_DIR: resolve('test-results/careers') },
      encoding: 'utf8',
    }).trim()
  const cid = fixture()
  await page.goto('/?career=' + cid + '#people')
  const open = () => page.getByRole('button', { name: 'Состав пилотов', exact: true }).click()
  await open()
  await expect(page.locator('.lineup-driver').first()).toContainText('Заболевание')
  const choice = page.getByLabel('Кандидат на замену')
  await choice.selectOption({ index: 1 })
  await expect(page.getByRole('button', { name: 'Подтвердить замену' })).toBeDisabled()
  await expect(page.locator('.lineup-row')).toContainText('Конфликт календаря')
  await choice.selectOption('agent-season25-1')
  await expect(page.locator('.lineup-row')).toContainText('Допуск подтверждён')
  if (process.env.LINEUP_EVIDENCE) {
    await page.locator('.lineup-secondary').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: join(process.env.LINEUP_EVIDENCE, info.project.name + '-replacement.png') })
  }
  await page.getByRole('button', { name: 'Подтвердить замену' }).click()
  await expect(page.locator('.lineup-event').first()).toContainText('Замена на этап')
  fixture(cid)
  await page.reload()
  await open()
  await expect(page.locator('.lineup-event').first()).toContainText('Получен подтверждённый допуск')
  await expect(page.locator('.lineup-driver').first()).toContainText('Допущен')
})
