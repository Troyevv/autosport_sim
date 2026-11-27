import { expectCarFits } from './carBounds'
import { expect, test } from '@playwright/test'

test('Ширина рабочего места, масштаб подписей и диалог инженерного штаба', async ({ page }, info) => {
  const response = await page.request.post('/api/careers', {
    data: {
      name: 'Инженерный штаб',
      role: 'manager',
      org: 'team-scuderia-ferrari',
      series: 'f1',
      seed: 52,
    },
  })
  expect(response.ok()).toBe(true)
  const { id } = await response.json()
  await page.goto('/?career=' + id + '#engineering')
  const main = page.locator('.main-inner')
  const delegation = main.getByRole('button', { name: 'Делегирование', exact: true })
  await expect(delegation).toBeVisible({ timeout: 45000 })
  const viewports =
    info.project.name === 'mobile'
      ? [[390, 844]]
      : [
          [1366, 768],
          [1920, 1080],
          [2560, 1440],
          [3840, 2160],
        ]
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height })
    const metrics = await main.evaluate((el) => {
      const elements = Array.from(
        el.querySelectorAll('button, span, small, p, h1, h2, h3, td, th'),
      ).filter(
        (node) =>
          node.getBoundingClientRect().width > 0 &&
          node.children.length === 0 &&
          node.textContent?.trim(),
      )
      return {
        minSize: Math.min(...elements.map((node) => parseFloat(getComputedStyle(node).fontSize))),
        width: el.getBoundingClientRect().width,
        scroll: document.documentElement.scrollWidth,
        usable: document.querySelector('.main-scroll')!.getBoundingClientRect().width,
      }
    })
    expect(metrics.minSize).toBeGreaterThanOrEqual(12)
    expect(metrics.width).toBeLessThanOrEqual(metrics.usable + 2)
    expect(metrics.width).toBeGreaterThanOrEqual(Math.min(metrics.usable, 1360) - 2)
    if (width === 3840) expect(metrics.width).toBeLessThan(metrics.usable * 0.85)
    await expectCarFits(main.locator('.eng-car-stage .studio-stage').first())
    expect(metrics.scroll).toBe(width)
    await delegation.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Открыть навигацию' }).click()
    await page.getByRole('button', { name: /Параметры/ }).click()
    await expect(page.getByRole('dialog', { name: 'Параметры интерфейса' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
  }
  await page.goto('/?career=' + id + '#drivers')
  const seat = page.locator('.p-race-seat .p-person-main').first()
  await expect(seat).toBeVisible({ timeout: 45000 })
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height })
    const photo = (await seat.locator('.p-photo').boundingBox())!
    const identity = (await seat.locator('.p-card-identity').boundingBox())!
    expect(photo.height).toBeGreaterThan(100)
    expect(identity.width).toBeGreaterThan(100)
    if (width >= 2560) {
      expect(identity.x).toBeGreaterThanOrEqual(photo.x + photo.width - 1)
      expect(identity.y).toBeLessThan(photo.y + photo.height / 2)
    } else if (width < 600) {
      expect(identity.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1)
    }
  }
})
