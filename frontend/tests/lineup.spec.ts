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
  await page
    .getByRole('navigation', { name: 'Люди и карьера' })
    .getByRole('button', { name: 'Пилоты', exact: true })
    .click()
  const drivers = page.locator('.p-race-seat')
  await expect(drivers).toHaveCount(2)
  await expect(drivers.first()).toContainText('Равноправный пилот')
  await drivers.first().getByRole('button', { name: 'Обсудить иерархию' }).click()
  await page.getByRole('dialog').getByLabel('Предлагаемый статус').selectOption('first')
  await page.getByRole('dialog').getByRole('button', { name: 'Передать предложение' }).click()
  await expect(page.locator('.p-history-line').first()).toContainText('Запрашивает компенсацию')
  const message = await page.locator('.p-history-line').first().innerText()
  const amount = message.match(/компенсацию ([\d,.]+) €/)![1].replaceAll(',', '')
  await drivers.first().getByRole('button', { name: 'Обсудить иерархию' }).click()
  await page.getByRole('dialog').getByLabel('Предлагаемый статус').selectOption('first')
  await page.getByRole('dialog').getByLabel('Предел компенсации').fill(amount)
  await page.getByRole('dialog').getByRole('button', { name: 'Передать предложение' }).click()
  await expect(drivers.first().getByText('Первый пилот', { exact: true })).toHaveText('Первый пилот')
  await expect(drivers.nth(1).getByText('Второй пилот', { exact: true })).toHaveText('Второй пилот')
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
  if (process.env.LINEUP_EVIDENCE) {
    await page.locator('.p-race-grid').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: join(process.env.LINEUP_EVIDENCE, info.project.name + '-lineup.png') })
  }
  await page.getByRole('button', { name: 'Подобрать пилота' }).click()
  await page.getByLabel('Профессия').selectOption('driver')
  await page.getByLabel('Свободные агенты').check()
  await page.locator('.p-row-person').first().click()
  await page.getByRole('tab', { name: 'Договор', exact: true }).click()
  await page
    .locator('.contract-contracts-intro')
    .getByRole('button', { name: 'Предложить контракт' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Должность и место').selectOption(c.org + ':f1:reserve')
  const start = await dialog.locator('[name=start]').inputValue()
  await dialog.getByLabel('Совмещать резерв и испытания').check()
  await dialog.getByLabel('Выступать в другой серии').check()
  await dialog.getByLabel('Оклад в месяц').fill('20000')
  await dialog.getByRole('button', { name: 'Передать предложение' }).click()
  await expect(page.locator('.p-offer-card').first()).toContainText('Резерв')
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/commands') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Продолжить' }).click()
  expect((await response).ok()).toBe(true)
  const signed = (await (await page.request.get('/api/careers/' + c.id)).json()).offers.at(-1)
  expect(signed.status).toBe('accepted')
  expect(signed.seat).toBe(c.org + ':f1:reserve')
  expect(signed.start).toBe(start)
  await page.goto('/?career=' + c.id + '#people')
  await page
    .getByRole('navigation', { name: 'Люди и карьера' })
    .getByRole('button', { name: 'Пилоты', exact: true })
    .click()
  await page.getByRole('button', { name: 'Симулятор', exact: true }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Утвердить время и бюджет' }).click()
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
  const open = () =>
    page
      .getByRole('navigation', { name: 'Люди и карьера' })
      .getByRole('button', { name: 'Пилоты', exact: true })
      .click()
  await open()
  await expect(page.locator('.p-race-seat').first()).toContainText('Заболевание')
  await page.getByRole('button', { name: 'Выбрать замену' }).first().click()
  const choice = page.getByRole('dialog').getByRole('combobox', { name: 'Кандидат' })
  await choice.selectOption({ index: 1 })
  await expect(page.getByRole('button', { name: 'Подтвердить замену' })).toBeDisabled()
  await expect(page.locator('.p-callout')).toContainText('Конфликт календаря')
  await choice.selectOption('agent-season25-1')
  await expect(page.locator('.p-callout')).toContainText('Допуск подтверждён')
  if (process.env.LINEUP_EVIDENCE) {
    await page.getByRole('dialog').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({
      path: join(process.env.LINEUP_EVIDENCE, info.project.name + '-replacement.png'),
    })
  }
  await page.getByRole('button', { name: 'Подтвердить замену' }).click()
  await expect(page.locator('.p-history-line').first()).toContainText('Замена на этап')
  fixture(cid)
  await page.reload()
  await open()
  await expect(page.locator('.p-history-line').first()).toContainText('Получен подтверждённый допуск')
  await expect(page.locator('.p-race-seat').first()).toContainText('Допущен')
})
