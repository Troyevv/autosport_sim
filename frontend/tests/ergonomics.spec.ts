import { expect, test } from '@playwright/test'

test('Ширина рабочего места, масштаб подписей и диалог инженерного штаба', async ({ page }, info) => {
  const response = await page.request.post('/api/careers', {
    data: { name: 'Инженерный штаб', role: 'manager', org: 'team-scuderia-ferrari', series: 'f1', seed: 52 },
  })
  expect(response.ok()).toBe(true)
  const { id } = await response.json()
  await page.goto('/?career=' + id + '#engineering')
  const main = page.locator('.main-inner')
  const delegation = main.getByRole('button', { name: 'Делегирование', exact: true })
  await expect(delegation).toBeVisible({ timeout: 45000 })
  const viewports = info.project.name === 'mobile' ? [[390, 844]] : [[1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height })
    const metrics = await main.evaluate(el => {
      const elements = Array.from(el.querySelectorAll('button, span, small, p, h1, h2, h3, td, th'))
        .filter(node => node.getBoundingClientRect().width > 0 && node.children.length === 0 && node.textContent?.trim())
      return {
        minSize: Math.min(...elements.map(node => parseFloat(getComputedStyle(node).fontSize))),
        width: el.getBoundingClientRect().width,
        scroll: document.documentElement.scrollWidth,
        usable: document.querySelector('.main-scroll')!.getBoundingClientRect().width,
      }
    })
    expect(metrics.minSize).toBeGreaterThanOrEqual(12)
    expect(Math.abs(metrics.width - metrics.usable)).toBeLessThanOrEqual(2)
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
})
