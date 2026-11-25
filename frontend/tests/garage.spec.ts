import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import type { Catalog } from '../src/garage/model'

test('Гараж · две заявки, детали, декали и сохранение', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const mobile = page.viewportSize()!.width === 390
  const response = await page.request.post('/api/careers', {
    data: { name: 'Студия', role: 'manager', org: 'team-mclaren-formula-1-team', series: 'f1', seed: 47 },
  })
  expect(response.ok()).toBeTruthy()
  const career = await response.json(),
    catalog: Catalog = await (await page.request.get('/api/garage')).json()
  await page.goto('/?career=' + career.id)
  if (mobile) await page.getByRole('button', { name: 'Ещё' }).click()
  await page.getByRole('link', { name: 'Гараж', exact: true }).filter({ visible: true }).click()
  const view = page.locator('.studio-stage .garage-body')
  const picture = () => view.evaluate((el) => (el as HTMLCanvasElement).toDataURL())
  const evidence = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.GARAGE_EVIDENCE)
      await page.screenshot({
        path: join(process.env.GARAGE_EVIDENCE, (mobile ? 'mobile-' : 'desktop-') + name + '.png'),
      })
  }
  const tab = (name: string) => page.getByRole('button', { name, exact: true }).click()
  await expect(page.locator('.studio-stage .car-stand')).toHaveAttribute('data-state', 'ready')
  const initial = await picture()
  const floor = () =>
    page.locator('.studio-stage .garage-floor').evaluate((el) => (el as HTMLCanvasElement).toDataURL())
  const initialFloor = await floor()
  await evidence('factory')
  await tab('Компоненты')
  await page.getByLabel('Антикрыло в предпросмотре').selectOption({ label: 'Низкий профиль · пример' })
  await expect.poll(picture).not.toBe(initial)
  await page.getByLabel('Антикрыло в предпросмотре').selectOption('standard')
  await expect.poll(picture).toBe(initial)
  await tab('Ливрея')
  await page.getByLabel('Основной цвет').fill('#ed2459')
  await page.getByLabel('Рисунок').selectOption('weave')
  await page.getByLabel('Гоночный номер').fill('047')
  await expect.poll(picture).not.toBe(initial)
  await expect.poll(floor).not.toBe(initialFloor)
  await evidence('paint')
  await tab('Спонсоры')
  await tab('Добавить знак')
  await page.getByRole('combobox', { name: 'Знак', exact: true }).selectOption('axis')
  await page.getByLabel('Размер, %').fill('60')
  await page.getByLabel('Поворот, °').fill('-24')
  await view.scrollIntoViewIfNeeded()
  const zone = await page.locator('.decal-region').boundingBox()
  const x = zone!.x + zone!.width * 0.71,
    y = zone!.y + zone!.height * 0.62
  if (mobile) await page.touchscreen.tap(x, y)
  else {
    await page.mouse.move(x - 4, y - 2)
    await page.mouse.down()
    await page.mouse.move(x, y, { steps: 3 })
    await page.mouse.up()
  }
  expect(Number(await page.getByLabel('По горизонтали, %').inputValue())).toBeGreaterThan(50)
  await tab('На слой ниже')
  await tab('Удалить')
  await tab('Отменить')
  await tab('Сохранить в карьере')
  await expect(page.getByRole('status').filter({ hasText: 'Ливрея сохранена в карьере' })).toBeVisible()
  const saved = await (await page.request.get('/api/careers/' + career.id)).json()
  const paint = saved.liveries['f1-4']
  expect(paint.decals).toHaveLength(catalog.entries['f1-4'].livery.decals.length + 1)
  expect(
    paint.decals.some(
      (d: { angle: number; scale: number; x: number }) => d.angle === -24 && d.scale === 0.6 && d.x > 0.5,
    ),
  ).toBeTruthy()
  expect(paint.number).toBe('047')
  await page.reload()
  await expect(page.locator('.studio-status')).toContainText('Карьерная ливрея')
  await tab('Ливрея')
  await expect(page.getByLabel('Основной цвет')).toHaveValue('#ed2459')
  await expect(page.getByLabel('Гоночный номер')).toHaveValue('047')
  await page.getByRole('combobox', { name: 'Заявка', exact: true }).selectOption('f1-81')
  await expect(page.getByLabel('Гоночный номер')).toHaveValue('81')
  for (const series of ['f2', 'f3', 'dtm', 'wec']) {
    await page.getByRole('combobox', { name: 'Чемпионат', exact: true }).selectOption(series)
    await expect(page.locator('.car-stand')).toHaveAttribute('data-state', 'ready')
    await tab('Стартовая сетка')
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.grid-cars button')).toHaveCount(
      Object.keys(catalog.entries).filter((id) => id.startsWith(series + '-')).length,
    )
    await dialog.locator('.grid-cars button').last().click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.studio-status')).toContainText('Стартовая ливрея')
  }
  await page.getByRole('combobox', { name: 'Чемпионат', exact: true }).selectOption('f1')
  await expect(page.getByLabel('Гоночный номер')).toHaveValue('047')
  await page.getByLabel('Палитра').selectOption({ label: 'Серебро и кобальт' })
  await page.getByLabel('Рисунок').selectOption('heritage')
  await evidence('second-paint')
  await tab('Исходная')
  // The mobile editor crops the room differently, moving its projected lamps.
  await tab('Обзор')
  await expect.poll(picture).toBe(initial)
  await expect.poll(floor).toBe(initialFloor)
  await tab('Сохранить в карьере')
  await expect(page.getByRole('status').filter({ hasText: 'Ливрея сохранена в карьере' })).toBeVisible()
  await tab('Спонсоры')
  if (mobile) await page.getByLabel('Поворот, °').scrollIntoViewIfNeeded()
  await evidence('decals')
  expect(errors).toEqual([])
})

test('Гараж · резервный профиль и повторная загрузка после отказа графики', async ({ page }) => {
  const response = await page.request.post('/api/careers', {
    data: { name: 'Пит-бокс', role: 'owner', org: 'team-mclaren-formula-1-team', series: 'f1', seed: 3 },
  })
  const career = await response.json()
  const url = '/?career=' + career.id + '#garage'
  const body = page.locator('.studio-stage .garage-body')
  const snapshot = () => body.evaluate((el) => (el as HTMLCanvasElement).toDataURL())
  const ready = () =>
    expect(page.locator('.studio-stage .car-stand')).toHaveAttribute('data-state', 'ready')
  await page.goto(url)
  await ready()
  const factory = await snapshot()
  const atlas = '**/garage/2025-v1/mcl39.webp',
    fallback = '**/garage/2025-v1/mcl39-base.webp'
  await page.route(atlas, (route) => route.abort())
  await page.reload()
  await ready()
  expect(await snapshot()).toBe(factory)
  await page.route(fallback, (route) => route.abort())
  await page.reload()
  const retry = page.getByRole('button', { name: /Модель недоступна/ })
  await expect(retry).toBeVisible()
  await page.unroute(fallback)
  await retry.click()
  await ready()
  expect(await snapshot()).toBe(factory)
})
