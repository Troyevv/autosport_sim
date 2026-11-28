import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('Штаб связывает обсуждение, исследование и протокол с карьерой', async ({ page }, info) => {
  const created = await page.request.post('/api/careers', {
    data: {
      name: 'Инженерный штаб',
      org: 'team-mclaren-formula-1-team',
      role: 'manager',
      series: 'f1',
      seed: 49,
    },
  })
  expect(created.ok()).toBeTruthy()
  const career = await created.json()
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.COUNCIL_EVIDENCE)
      await page.screenshot({
        path: join(process.env.COUNCIL_EVIDENCE, info.project.name + '-' + name + '.png'),
      })
  }
  await page.goto('/?career=' + career.id + '#council')
  await button('Совещания').click()
  await expect(page.getByRole('heading', {name:'Техническое совещание'})).toBeVisible()
  await button('Повестка').click()
  await expect(page.getByText('Позиции специалистов', { exact: true })).toBeVisible()
  await capture('meeting')
  await page.getByText('Что мы можем сделать', { exact: true }).scrollIntoViewIfNeeded()
  await capture('alternatives')
  await button('Исследовать').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', {name:'Решение',exact:true}).selectOption('investigate')
  await dialog.getByLabel('Обоснование для штаба').fill('Проверить рабочий диапазон до изменения сборки.')
  await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  await button('Исполнение').click()
  await expect(page.getByText('В очереди', { exact: true })).toBeVisible()
  await button('Изменить поручение').click()
  await dialog.getByLabel('Причина вмешательства').fill('Освободить очередь для проверки креплений.')
  await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  await button('Архив').click()
  await page.getByText('Протокол обсуждения', { exact: true }).last().click()
  await expect(page.getByText('Проверить рабочий диапазон до изменения сборки.')).toBeVisible()
  await capture('minutes')
  await button('Делегирование').click()
  await dialog.getByLabel('Режим управления').selectOption('partial')
  await dialog.getByLabel('Лимит одного решения, €').fill('7500')
  await capture('mandate')
  await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await button('Повестка').click()
  await expect(page.getByText('Частичное делегирование', { exact: true })).toBeVisible()
})
