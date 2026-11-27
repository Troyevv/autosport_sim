import { test, expect } from '@playwright/test'
import { contrast, identityVars } from '../src/pitwall/v2/brand'
import type { Organization } from '../src/career/api'
import { configureCareer, submitCareer } from './createCareer'

test('Все фирменные палитры, включая будущие организации, обеспечивают контраст на графите и бумаге', async ({
  request,
}) => {
  const world = await (await request.get('/api/world')).json()
  const organizations = Object.values(world.organizations) as Organization[]
  const samples = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#777777']
  const all = [
    ...organizations,
    ...samples.flatMap((primary) =>
      samples.map((secondary) => ({ brand_palette: { primary, secondary } })),
    ),
  ]
  for (const org of all) {
    const t = identityVars(org)
    expect(t).toEqual(
      identityVars({
        id: 'future-user-organization',
        name: 'Новая организация',
        kind: 'supplier',
        brand_palette: org.brand_palette,
      }),
    )
    expect(contrast(t['--org-accent'], '#454548')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--org-accent'], t['--org-on-accent'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--org-primary'], '#38383b')).toBeGreaterThanOrEqual(3)
    expect(contrast(t['--org-ink'], t['--org-surface'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--org-paper-ink'], t['--org-paper'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--org-paper-rule'], t['--org-paper'])).toBeGreaterThanOrEqual(3)
  }
})

test('Выбранные игроком цвета проходят через создание, профиль, документы и повторную загрузку', async ({
  page,
}) => {
  await page.goto('/')
  await configureCareer(page, { role: 'owner' })
  await page.getByText('Фирменные цвета организации', { exact: true }).click()
  await page.getByLabel('Основной цвет организации', { exact: true }).fill('#341277')
  await page.getByLabel('Дополнительный цвет организации', { exact: true }).fill('#baff00')
  await submitCareer(page)
  const shell = page.locator('.game-shell')
  const token = (key: string) =>
    shell.evaluate((el, k) => getComputedStyle(el).getPropertyValue(k).trim(), key)
  await expect.poll(() => token('--org-brand-primary')).toBe('#341277')
  const warning = await token('--status-warning'),
    success = await token('--status-success'),
    error = await token('--status-error')
  const cid = new URL(page.url()).searchParams.get('career')
  await page.goto('/?career=' + cid + '#organization')
  await page.getByRole('button', { name: 'Изменить фирменные цвета' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Основной цвет организации').fill('#faf9f6')
  await form.getByLabel('Дополнительный цвет организации').fill('#03050b')
  await form.getByLabel('Задать отдельный акцент').check()
  await form.getByLabel('Акцентный цвет организации').fill('#0045ff')
  await form.getByRole('button', { name: 'Сохранить палитру' }).click()
  await expect(form).toHaveCount(0)
  await expect.poll(() => token('--org-brand-primary')).toBe('#faf9f6')
  expect([
    await token('--status-warning'),
    await token('--status-success'),
    await token('--status-error'),
  ]).toEqual([warning, success, error])
  const accent = await token('--org-accent')
  await page.goto('/?career=' + cid + '#agreements')
  await page.locator('.agreement-entry').first().click()
  const paper = page.locator('.contract-paper').first()
  await expect(paper).toBeVisible()
  await expect
    .poll(() =>
      paper.evaluate((el) => getComputedStyle(el).getPropertyValue('--org-brand-secondary').trim()),
    )
    .toBe('#03050b')
  await page.reload()
  await expect.poll(() => token('--org-accent')).toBe(accent)
  const career = await (await page.request.get('/api/careers/' + cid)).json()
  expect(career.brand_palette).toEqual({ primary: '#faf9f6', secondary: '#03050b', accent: '#0045ff' })
})
