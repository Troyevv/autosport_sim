import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('Гараж · установка по наряду и паспорт после загрузки', async ({ page }, info) => {
  const response = await page.request.post('/api/careers', {
    data: {
      name: 'Инженерный штаб',
      role: 'manager',
      org: 'team-mclaren-formula-1-team',
      series: 'f1',
      seed: 45,
    },
  })
  expect(response.ok()).toBe(true)
  const career = await response.json()
  await page.route('**/components/f1-4', route => route.abort(), { times: 1 })
  await page.goto('/?career=' + career.id + '#garage')
  await page.getByRole('button', { name: 'Компоненты', exact: true }).click()
  await page.getByRole('button', {name:'Повторить загрузку'}).click()
  const select = page.getByLabel('Доступные экземпляры')
  await select.selectOption({ label: 'Низкое сопротивление · v2 · запас' })
  const originalSerial = await page.locator('.component-id').innerText()
  await page.getByRole('button', { name: 'Согласовать установку' }).click()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(page.locator('.component-id')).toHaveText(originalSerial)
  await page.getByRole('button', { name: 'Согласовать установку' }).click()
  await page.getByRole('button', { name: 'Подтвердить установку' }).click()
  await expect(page.locator('.component-desk strong').first()).toHaveText('Низкое сопротивление · v2')
  await page.reload()
  await page.getByRole('button', { name: 'Компоненты', exact: true }).click()
  await expect(page.locator('.component-desk strong').first()).toHaveText('Низкое сопротивление · v2')
  await expect(page.locator('.car-stand')).toHaveAttribute('data-state', 'ready')
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.COMPONENT_EVIDENCE)
      await page.screenshot({
        path: join(process.env.COMPONENT_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  if (info.project.name === 'mobile')
    await page.locator('.component-desk').evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await capture('passport')
  await page.getByText('Оценка направлений развития',{exact:true}).click()
  const concept = page.locator('.panel').filter({has: page.getByRole('heading',{name:'Инженерная концепция',exact:true})})
  await concept.evaluate(el => window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-78))
  await capture('concept')
  await page.getByText('Инженерная группа и бюджет', { exact: true }).click()
  await expect(page.getByText('Главный механик', { exact: true })).toBeVisible()
  await page.getByText(/февраля.*Заднее антикрыло/).click()
  await expect(page.getByText('Снят', { exact: false }).filter({ has: page.locator('code') })).toContainText(
    'f1-4/rear-wing/01',
  )
  await page.getByRole('combobox', { name: 'Заявка', exact: true }).selectOption('f1-81')
  await expect(page.locator('.component-desk strong').first()).toHaveText('Базовая спецификация · v1')
  await page.getByRole('combobox', { name: 'Чемпионат', exact: true }).selectOption('f2')
  await expect(
    page.getByText('Состав сборки и история эксплуатации доступны сотрудникам команды.'),
  ).toBeVisible()
})
