import { expect, test } from '@playwright/test'

test('Аренда мощности и источник многосерийного соглашения', async ({ page }) => {
  async function openCareer(org: string, series: string, section: string) {
    const result = await page.request.post('/api/careers', {
      data: { org, series, name: 'Алекс', role: 'owner', seed: 53 },
    })
    expect(result.status()).toBe(201)
    const { id } = await result.json()
    await page.goto('/?career=' + id + '#' + section)
  }

  await openCareer('team-mclaren-formula-1-team', 'f1', 'facilities')
  const tab = (name: string) => page.getByRole('tab', {name,exact:true})
  await tab('Мощности').click()
  const research = page.locator('.capacity-row').filter({hasText:'Исследования'})
  const capacity = async () => {
    const value = await research.innerText()
    const slots = value.match(/(\d+) доступно · (\d+) собственных/)!
    const work = value.match(/([\d.,]+)\s*эффективных/)!
    const queue = value.match(/Подтверждённая очередь · (\d+)/)!
    return [Number(slots[1]), Number(slots[2]), Number(work[1].replace(',', '.')), Number(queue[1])]
  }
  await expect(research).toBeVisible()
  const initial = await capacity()
  await tab('Аренда').click()
  await page.getByLabel('Организация или объект').fill('Независимый оператор')
  const center = page.locator('.facility-row').filter({hasText:'Исследовательский центр'})
  await center.getByRole('button', {name:'Арендовать'}).click()
  await page.getByLabel('Слотов').fill('2')
  await page.getByLabel('Дней').fill('7')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', {name:'Проверить итог'}).click()
  await dialog.getByRole('button', {name:'Подтвердить резервирование'}).click()
  await dialog.getByRole('button', {name:'Вернуться к организации'}).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await tab('Мощности').click()
  await expect.poll(capacity).toEqual([initial[0]+2, initial[1], initial[2]+8, initial[3]])

  await openCareer('team-dams-lucas-oil', 'f2', 'commercial')
  await tab('Контракты').click()
  await expect(page.locator('.contract-row').filter({ hasText: 'OMP Racing' })).toHaveCount(1)
  await page.locator('.contract-row').filter({ hasText: 'OMP Racing' }).click()
  await expect(page.getByRole('link', { name: 'Источник партнёрства сезона 2025' })).toHaveAttribute(
    'href',
    /^https:\/\/damslucasoil\.com\//,
  )
})

test('Корпоративная доля определяет полномочия владельца', async ({ page }) => {
  const response = await page.request.post('/api/careers', {
    data: { role: 'owner', org: 'team-scuderia-ferrari', series: 'f1', name: 'Приёмка', seed: 42 },
  })
  expect(response.status()).toBe(201)
  const career = await response.json()
  await page.goto('/?career=' + career.id + '#capital')
  const shareholders = page.locator('.ownership-panel').filter({ has: page.getByRole('heading', { name: 'Структура капитала' }) })
  await expect(shareholders).toContainText('Ferrari')
  await expect(shareholders).toContainText('100%')
  await expect(shareholders.getByRole('button', { name: 'Внести средства' })).toBeVisible()
  await page.getByRole('tab',{name:'Займы',exact:true}).click()
  await expect(page.getByRole('button', { name: 'Оформить заём' })).toBeDisabled()
})
