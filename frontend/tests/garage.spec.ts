import { expectCarFits } from './carBounds'
import { test, expect, type Locator } from '@playwright/test'
import { join } from 'node:path'
import type { Catalog } from '../src/garage/model'

async function pixelSignature(canvas: Locator) {
  return canvas.evaluate(async (el: HTMLCanvasElement) => {
    const pixels = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data
    const digest = await crypto.subtle.digest('SHA-256', pixels.buffer)
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    return [el.width, el.height, hash].join(':')
  })
}

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
  await page.goto('/?career=' + career.id + '#garage')
  const showroom = page.locator('.garage-hero .car-stand')
  const components = page.locator('.components-car .car-stand')
  const paintStudio = page.locator('.livery-stage .car-stand')
  const view = paintStudio.locator('.garage-body')
  const body = (stage: Locator) => pixelSignature(stage.locator('.garage-body'))
  const floor = (stage: Locator) => pixelSignature(stage.locator('.garage-floor'))
  const evidence = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.GARAGE_EVIDENCE)
      await page.screenshot({
        path: join(process.env.GARAGE_EVIDENCE, (mobile ? 'mobile-' : 'desktop-') + name + '.png'),
      })
  }
  const tab = (name: string) => page.locator('.department-workspace').getByRole('tab', { name: new RegExp('^' + name) }).first().click()
  const action = (name: string) => page.getByRole('button', { name, exact: true }).click()
  const save = async () => {
    await action('Сохранить ливрею')
    const sent = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST')
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click()
    expect((await sent).ok()).toBeTruthy()
    await expect(page.getByText('Не сохранено', { exact: true })).toHaveCount(0)
  }
  await expect(showroom).toHaveAttribute('data-state', 'ready')
  const initial = await body(showroom)
  const initialFloor = await floor(showroom)
  await evidence('factory')
  await tab('Компоненты')
  await expect(components).toHaveAttribute('data-state', 'ready')
  const originalWing = await body(components)
  await page.getByLabel('Антикрыло в предпросмотре').selectOption({ label: 'Низкий профиль · пример' })
  await expect.poll(() => body(components)).not.toBe(originalWing)
  await page.getByLabel('Антикрыло в предпросмотре').selectOption('standard')
  await expect.poll(() => body(components)).toBe(originalWing)
  await tab('Ливрея')
  await expect(paintStudio).toHaveAttribute('data-state', 'ready')
  const originalPaint = await body(paintStudio)
  const originalReflection = await floor(paintStudio)
  await page.getByLabel('Основной цвет').fill('#ed2459')
  await page.getByRole('combobox', { name: 'Рисунок', exact: true }).selectOption('weave')
  await page.getByLabel('Бортовой номер').fill('047')
  await expect.poll(() => body(paintStudio)).not.toBe(originalPaint)
  await expect.poll(() => floor(paintStudio)).not.toBe(originalReflection)
  await evidence('paint')
  await page.locator('.livery-controls').getByRole('tab', { name: /Размещения/ }).click()
  await action('Добавить знак')
  const form = page.getByRole('dialog')
  await form.getByLabel('Партнёр').selectOption('axis')
  await form.getByLabel('Зона').selectOption(catalog.sponsors.axis.zones[0])
  await form.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByLabel('Масштаб').fill('0.60')
  await page.getByLabel('Поворот', { exact: true }).fill('-24')
  await action('Показать зоны размещения')
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
  expect(Number(await page.getByLabel('По горизонтали').inputValue())).toBeGreaterThan(0.5)
  await action('Ниже')
  await action('Удалить')
  await action('Отменить изменение')
  await save()
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
  await tab('Ливрея')
  await expect(page.getByLabel('Основной цвет')).toHaveValue('#ed2459')
  await expect(page.getByLabel('Бортовой номер')).toHaveValue('047')
  await page.getByRole('combobox', { name: 'Автомобиль', exact: true }).selectOption('f1-81')
  await expect(page.getByLabel('Бортовой номер')).toHaveValue('81')
  for (const series of ['f2', 'f3', 'dtm', 'wec']) {
    await page.getByRole('combobox', { name: 'Чемпионат гаража', exact: true }).selectOption(series)
    await expect(page.locator('.car-stand')).toHaveAttribute('data-state', 'ready')
    await expectCarFits(page.locator('.studio-stage').first())
    const entries = page.getByRole('combobox', { name: 'Автомобиль' })
    await expect(entries.locator('option')).toHaveCount(
      Object.keys(catalog.entries).filter((id) => id.startsWith(series + '-')).length,
    )
    const last = await entries.locator('option').last().getAttribute('value')
    await entries.selectOption(last!)
    await expect(page.getByLabel('Основной цвет')).toBeDisabled()
  }
  await page.getByRole('combobox', { name: 'Чемпионат гаража', exact: true }).selectOption('f1')
  await expect(page.getByLabel('Бортовой номер')).toHaveValue('047')
  await page.getByLabel('Готовая палитра').selectOption({ label: 'Серебро и кобальт' })
  await page.getByRole('combobox', { name: 'Рисунок', exact: true }).selectOption('heritage')
  await evidence('second-paint')
  await action('Исходная')
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click()
  await save()
  await tab('Автомобиль')
  await expect.poll(() => body(showroom)).toBe(initial)
  await expect.poll(() => floor(showroom)).toBe(initialFloor)
  await tab('Ливрея')
  await page.locator('.livery-controls').getByRole('tab', { name: /Размещения/ }).click()
  if (mobile) await page.getByLabel('Поворот', { exact: true }).scrollIntoViewIfNeeded()
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
  const snapshot = () => pixelSignature(body)
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
