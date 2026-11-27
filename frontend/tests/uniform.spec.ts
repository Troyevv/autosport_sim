import { expect, test } from '@playwright/test'

test('Лицо и масштаб сохраняются при смене формы, целый комплект виден отдельно', async ({
  page,
}) => {
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Проверка формы',
      org: 'team-mercedes-amg-petronas-f1-team',
      role: 'owner',
      series: 'f1',
      seed: 31,
    },
  })
  expect(created.ok()).toBeTruthy()
  const { id } = await created.json()
  await page.goto('/?career=' + id + '#organization?tab=uniform')
  const category = page.getByLabel('Категория сотрудников')
  const subject = page.getByLabel('Сотрудник для примерки')
  await subject.selectOption({ index: 1 })
  const svg = page.locator('.uniform-preview .career-portrait')
  const face = svg.locator('[data-layer=appearance]')
  const frame = await svg.getAttribute('viewBox')
  const image = await face.getAttribute('href')
  for (const value of [
    'driver',
    'engineering',
    'executive',
    'mechanic',
    'staff',
    'advisor',
  ]) {
    await category.selectOption(value)
    await expect(svg).toHaveAttribute('data-category', value)
    await expect(svg).toHaveAttribute('viewBox', frame!)
    await expect(face).toHaveAttribute('href', image!)
    const emblem = svg.locator('[data-layer=organization-badge]')
    await expect(emblem).toHaveAttribute('href', /\/api\/media\/logo\/team-mercedes-amg-petronas-f1-team/)
    expect(await emblem.evaluate(async node => {
      const image = new Image()
      image.src = node.getAttribute('href')!
      await image.decode()
      return image.naturalWidth > 8 && image.naturalHeight > 8 && node.getAttribute('preserveAspectRatio')?.includes('meet')
    })).toBe(true)
    await expect(face).toHaveAttribute('mask', /^url\(#/)
    await expect(
      svg.locator('mask image[href*="portrait-matte"]').first(),
    ).toBeAttached()
    await expect(svg.locator('[data-layer=forearms]')).toHaveCount(0)
    await expect(svg.locator('[data-layer=fitted-fabric]')).toHaveAttribute(
      'href',
      /^data:/,
    )
  }
  await page.getByRole('button', { name: 'Только форма' }).click()
  await expect(face).toHaveCount(0)
  await expect(svg).toHaveAttribute('data-view', 'garment')
  expect(
    await svg.evaluate((el) => {
      const frame = (el as SVGSVGElement).viewBox.baseVal
      const cloth = (
        el.querySelector('[data-layer="fitted-fabric"]') as SVGGraphicsElement
      ).getBBox()
      return (
        frame.x < cloth.x &&
        frame.y < cloth.y &&
        frame.x + frame.width > cloth.width &&
        frame.y + frame.height > cloth.height
      )
    }),
  ).toBe(true)
  await page.getByRole('button', { name: 'На сотруднике' }).click()
  await expect(face).toHaveAttribute('href', image!)
})
