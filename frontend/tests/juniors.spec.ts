import { configureCareer, submitCareer } from './createCareer'
import { expect, test } from '@playwright/test'
import { join } from 'node:path'

for (const [series, org] of [
  ['f4-it', 'team-prema-racing'],
  ['f4-gb', 'team-hitech-tgr'],
  ['f4-es', 'team-campos-racing'],
  ['freca', 'team-art-grand-prix'],
]) {
  test('Карьера и гараж · ' + series, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const evidence = async (screen: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
      if (process.env.JUNIOR_EVIDENCE)
        await page.screenshot({
          path: join(process.env.JUNIOR_EVIDENCE, info.project.name + '-' + series + '-' + screen + '.png'),
        })
    }
    await page.goto('/')
    await configureCareer(page, { series, org })
    await submitCareer(page)
    await expect(page.getByRole('heading', { name: 'Команда ждёт вашего решения.' })).toBeVisible()
    const url = page.url().split('#')[0]
    await evidence('hq')
    await page.goto(url + '#garage')
    const car = page.locator('.studio-stage .car-stand')
    await expect(car).toHaveAttribute('data-state', 'ready')
    const picture = () => car.locator('.garage-body').evaluate((el) => (el as HTMLCanvasElement).toDataURL())
    const initial = await picture()
    await page.getByRole('tab', { name: 'Ливрея', exact: true }).click()
    await page.getByLabel('Основной цвет').fill('#0085ae')
    await page.getByLabel('Бортовой номер').fill('052')
    await expect.poll(picture).not.toBe(initial)
    await page.locator('.livery-controls').getByRole('tab', { name: 'Размещения', exact: true }).click()
    await page.getByRole('button', { name: 'Добавить знак', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', {name:'Добавить',exact:true}).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Сохранить ливрею' }).click()
    const saved = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST')
    await page.getByRole('dialog').getByRole('button', {name:'Сохранить', exact:true}).click()
    expect((await saved).ok()).toBe(true)
    await expect(page.locator('.livery-savebar')).toHaveCount(0)
    await page.reload()
    await expect(car).toHaveAttribute('data-state', 'ready')
    await page.getByRole('tab', { name: 'Ливрея', exact: true }).click()
    await expect(page.getByLabel('Бортовой номер')).toHaveValue('052')
    await expect(page.getByLabel('Основной цвет')).toHaveValue('#0085ae')
    await page.evaluate(() => window.scrollTo(0, 0))
    await evidence('garage')
    if (series === 'freca') {
      await page.goto(url + '#world')
      await page.locator('.series-switch button').filter({hasText:'KART-OKJ'}).click()
      await expect(page.getByRole('heading', { name: /OK-Junior/ })).toBeVisible()
      await evidence('kart')
      const entrant = page.locator('.world-entry-list .link-button').first()
      await entrant.click()
      await expect(page.getByRole('main')).toContainText('KART-OKJ')
      await evidence('team')
      await page.goto(url + '#market')
      await page.getByLabel('Профессия').selectOption('driver')
      await page.getByRole('combobox',{name:'Чемпионат',exact:true}).selectOption('kart-okj')
      await page.locator('.p-row-person').first().click()
      await page.getByRole('tab', { name: 'Карьера', exact:true }).click()
      const scout = page.getByRole('button', {name:'Поручить наблюдение'})
      await scout.click()
      await page.getByRole('dialog').getByRole('button', { name: 'Передать поручение' }).click()
      await expect(page.getByRole('button',{name:/Следующее наблюдение/})).toBeDisabled()
      await evidence('scouting')
    }
    expect(errors).toEqual([])
  })
}
