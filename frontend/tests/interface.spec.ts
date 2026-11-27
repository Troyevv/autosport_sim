import { test, expect, type Page } from '@playwright/test'
import { join } from 'node:path'
const mobile = (page: Page) => page.viewportSize()!.width < 760
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const modal = (page: Page) => page.getByRole('dialog')

async function menu(page: Page) {
  if (mobile(page)) await button(page, 'Ещё').click()
}
async function navigate(page: Page, name: string) {
  await menu(page)
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: new RegExp('^' + name) })
    .click()
}
async function role(page: Page, name: string) {
  await menu(page)
  await button(page, 'Сменить игровую роль').click()
  await modal(page)
    .getByRole('button', { name: new RegExp('^' + name) })
    .click()
}
async function snap(page: Page, id: string) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('main h1')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
  await page
    .locator('main img')
    .evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())))
  if (process.env.EVIDENCE_DIR)
    await page.screenshot({
      path: join(process.env.EVIDENCE_DIR, (mobile(page) ? 'mobile' : 'desktop') + '-' + id + '.png'),
    })
  if (mobile(page)) {
    const end = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      const main = document.querySelector('main')!.firstElementChild!
      const nav = document.querySelector('.mobile-bottom')!.getBoundingClientRect()
      const bounds = main.getBoundingClientRect()
      return bounds.bottom - parseFloat(getComputedStyle(main).paddingBottom) - nav.top
    })
    expect(end).toBeLessThanOrEqual(1)
    await page.evaluate(() => window.scrollTo(0, 0))
  }
}
const browserIssues = new WeakMap<Page, string[]>()
test.afterEach(async ({ page }) => {
  expect(browserIssues.get(page)).toEqual([])
})
test.beforeEach(async ({ page }) => {
  const issues: string[] = []
  browserIssues.set(page, issues)
  page.on('pageerror', (error) => issues.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:4183')
      issues.push(request.url())
  })
  await page.goto('/?demo=1')
  await expect(page.getByRole('heading', { name: 'Штаб команды', exact: true })).toBeVisible()
})

test('Все 11 разделов и рабочие места', async ({ page }) => {
  await snap(page, 'overview')
  for (const [id, name, heading] of [
    ['people', 'Пилоты и персонал', 'Пилоты и персонал'],
    ['garage', 'Гараж', 'Гараж'],
    ['development', 'Разработка', 'Разработка'],
    ['race', 'Гоночный центр', 'Гоночный центр'],
    ['calendar', 'Календарь', 'Календарь'],
    ['world', 'Чемпионаты', 'Мир автоспорта'],
    ['market', 'Рынок и поставщики', 'Рынок и поставщики'],
    ['finance', 'Финансы', 'Финансы'],
  ]) {
    await navigate(page, name)
    await expect(page.locator('main h1')).toHaveText(heading)
    await snap(page, id)
  }
  await role(page, 'Владелец команды')
  await expect(page.locator('main h1')).toHaveText('Организация')
  await snap(page, 'organization')
  await role(page, 'Производитель')
  await expect(page.locator('main h1')).toHaveText('Производство')
  await snap(page, 'production')
  await navigate(page, 'Гоночный центр')
  await expect(button(page, 'Пит-стоп')).toHaveCount(0)
  await page.goto('/?demo=1#organization')
  await expect(page.locator('main h1')).toHaveText('Производство')
})
test('Поиск, уведомления, фон меню и фокус', async ({ page }) => {
  if (mobile(page)) {
    await menu(page)
    await page.mouse.click(375, 32)
    await expect(modal(page)).toHaveCount(0)
    await expect(page.locator('.top-date')).toContainText('18 мая')
    await expect(button(page, 'Ещё')).toBeFocused()
  } else {
    await button(page, 'Сменить игровую роль').click()
    const target = await button(page, 'Продолжить').boundingBox()
    await page.mouse.click(target!.x + 6, target!.y + 6)
    await expect(modal(page)).toHaveCount(0)
    await expect(page.locator('.top-date')).toContainText('18 мая')
    await expect(button(page, 'Сменить игровую роль')).toBeFocused()
  }
  await page.keyboard.press('Control+k')
  await modal(page).getByRole('searchbox').fill('нет такого имени')
  await expect(modal(page)).toContainText('Ничего не найдено')
  await modal(page).getByRole('searchbox').fill('Келлер')
  await modal(page)
    .getByRole('button', { name: /Адриан Келлер/ })
    .click()
  await expect(modal(page)).toContainText('Гоночный темп')
  await button(page, 'Закрыть').focus()
  await page.keyboard.press('Shift+Tab')
  expect(await modal(page).evaluate((el) => el.contains(document.activeElement))).toBeTruthy()
  await page.keyboard.press('Escape')
  await expect(modal(page)).toHaveCount(0)
  await page.getByRole('button', { name: /Днище B: финальные испытания/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Днище B: финальные испытания/ })).toContainText(
    'Прочитано',
  )
})
test('Досье, сравнение, фильтр и подтверждаемое предложение', async ({ page }) => {
  await navigate(page, 'Пилоты и персонал')
  await page.getByRole('searchbox').fill('неизвестный')
  await expect(page.getByRole('heading', { name: 'Никого не нашли' })).toBeVisible()
  await button(page, 'Сбросить фильтры').click()
  await page.getByRole('checkbox', { name: 'Сравнить: Адриан Келлер' }).check()
  await page.getByRole('checkbox', { name: 'Сравнить: Лукас Вебер' }).check()
  await button(page, 'Сравнить 2/2').click()
  await expect(modal(page).getByRole('row', { name: 'Гоночный темп 92 86' })).toBeVisible()
  await page.keyboard.press('Escape')
  await button(page, 'Персонал').click()
  await page.getByRole('button', { name: 'Елена Морозова', exact: true }).click()
  await expect(modal(page)).toContainText('Аэродинамика')
  await button(page, 'История').click()
  await expect(modal(page)).toContainText('Aurelia Motorsport')
  await page.keyboard.press('Escape')
  await navigate(page, 'Рынок и поставщики')
  await page.getByLabel('Фильтр', { exact: true }).selectOption('gt')
  await button(page, 'Переговоры').click()
  await page.getByRole('spinbutton').fill('0')
  await button(page, 'Проверить предложение').click()
  await expect(modal(page)).toHaveAccessibleName('Контрактное предложение')
  await page.getByRole('spinbutton').fill('2450000')
  await button(page, 'Проверить предложение').click()
  await button(page, 'Отмена').click()
  await expect(button(page, 'Переговоры · 0')).toBeVisible()
  await button(page, 'Переговоры').click()
  await page.getByRole('spinbutton').fill('2450000')
  await button(page, 'Проверить предложение').click()
  await button(page, 'Отправить').click()
  await expect(button(page, 'На рассмотрении')).toBeDisabled()
  await button(page, 'Переговоры · 1').click()
  await expect(modal(page)).toContainText('Эмилия Росси')
  await expect(modal(page)).toContainText(/2\s450\s000/)
  await page.keyboard.press('Escape')
  await button(page, 'Поставщики').click()
  await page.getByRole('searchbox').fill('HELIX')
  await button(page, 'Спецификация').click()
  await button(page, 'Запросить условия').click()
  await button(page, 'Проверить предложение').click()
  await button(page, 'Отправить').click()
  await expect(button(page, 'Переговоры · 2')).toBeVisible()
})
test('Переход к карьерным разработкам, календарь и гараж', async ({ page }) => {
  await navigate(page, 'Разработка')
  await expect(page.getByRole('link',{name:'Открыть карьеры'})).toHaveAttribute('href','/?section=development&role=manager#saves')
  await navigate(page, 'Календарь')
  await button(page, 'Список').click()
  await page.getByLabel('Программа', { exact: true }).selectOption('endurance')
  await page.getByRole('button', { name: /28 мая · 6 часов/ }).click()
  await expect(page.locator('.event-detail')).toContainText('смена экипажей')
  await navigate(page, 'Гараж')
  await button(page, 'Ливрея').click()
  await expect(page.locator('main')).toContainText('доступен в гараже карьеры')
  await button(page, 'Компоненты').click()
  await button(page, 'Проверить компонент').first().click()
  await button(page, 'Отметить проверку').click()
  await expect(button(page, 'Осмотр пройден')).toBeDisabled()
})
test('Программы владельца и заказы производителя', async ({ page }) => {
  await role(page, 'Владелец команды')
  await button(page, 'Распределить бюджет').click()
  await page.getByLabel('VANTA Racing, %').fill('60')
  await expect(button(page, 'Утвердить бюджет')).toBeDisabled()
  await page.getByLabel('VANTA GT, %').fill('30')
  await button(page, 'Утвердить бюджет').click()
  await expect(page.locator('main')).toContainText('60%')
  await button(page, 'Открыть программу').nth(2).click()
  await expect(page.locator('.series-banner')).toContainText('Endurance Cup')
  await button(page, 'Экипажи').click()
  await expect(page.getByRole('table')).toContainText('Ларсен / Беннет / Минами')
  await role(page, 'Производитель')
  await button(page, 'Заказы').click()
  await button(page, 'Рассмотреть заказ').first().click()
  await button(page, 'Принять заказ').click()
  await expect(page.locator('.kpi-grid')).toContainText('84%')
  await button(page, 'Завершить заказ').click()
  await modal(page).getByRole('button', { name: 'Завершить заказ' }).click()
  await expect(button(page, 'Поставлено')).toBeDisabled()
  await expect(page.locator('.kpi-grid')).toContainText('76%')
})
test('Показ гонки, тайминг, стратегия и радио', async ({ page }) => {
  await navigate(page, 'Гоночный центр')
  await expect(page.locator('.race-timing-row')).toHaveCount(20)
  await page.locator('.race-timing-row').nth(7).click()
  await expect(page.locator('.race-map-footer')).toContainText('WEB · P8')
  await button(page, 'От лидера').click()
  await expect(page.locator('.race-table-head')).toContainText('Интервал')
  await button(page, '16×').click()
  await button(page, 'Начать показ').click()
  await expect(page.locator('.race-lap strong')).not.toHaveText('14')
  await button(page, 'Пауза').click()
  await button(page, 'Атака').first().click()
  await expect(page.locator('.race-bottom-grid')).toContainText('Темп — Атака')
  await button(page, 'Пит-стоп').first().click()
  await page.getByLabel('Состав шин').selectOption('Hard')
  await button(page, 'Подтвердить пит-стоп').click()
  await button(page, 'Отменить · Hard').click()
  await button(page, 'Отменить остановку').click()
  await expect(page.locator('.race-bottom-grid')).toContainText('Пит-стоп — отменён')
  await navigate(page, 'Календарь')
  await navigate(page, 'Гоночный центр')
  await expect(button(page, 'Начать показ')).toBeVisible()
})
test('Ошибка подключения, повторная загрузка и сброс', async ({ page }) => {
  await page.route('**/api/config', (route) => route.fulfill({ status: 503, body: 'unavailable' }))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Нет связи с приложением' })).toBeVisible()
  await page.unroute('**/api/config')
  await button(page, 'Повторить').click()
  await button(page, 'Продолжить').click()
  await expect(page.locator('.top-date')).toContainText('19 мая')
  await menu(page)
  await button(page, 'Настройки').click()
  await button(page, 'Сбросить демонстрацию').click()
  await button(page, 'Сбросить').click()
  await expect(page.locator('.top-date')).toContainText('18 мая')
  await button(page, 'Продолжить').click()
  await page.reload()
  await expect(page.locator('.top-date')).toContainText('18 мая')
})

test('Три дисциплины и боковые изображения машин', async ({ page }) => {
  for (const [series, model] of [
    ['GT', 'GT37'],
    ['Выносливость', 'VP63'],
    ['Формула', 'V28'],
  ]) {
    await button(page, series).click()
    await navigate(page, 'Гараж')
    await expect(page.locator('.garage-scene h2')).toHaveText(model)
    await page.locator('.car-photo img').evaluate((n) => (n as HTMLImageElement).decode())
    await page.locator('.car-photo').click()
    await expect(modal(page).getByRole('img', { name: new RegExp(model) })).toBeVisible()
    await page.keyboard.press('Escape')
    await navigate(page, 'Штаб команды')
  }
})
test('Редактирование плана, объектов и условий поставки', async ({ page }) => {
  await navigate(page, 'Разработка')
  await navigate(page, 'Финансы')
  await button(page, 'Предложения партнёров').click()
  await button(page, 'Подписать контракт').click()
  await expect(page.locator('.kpi-grid')).toContainText('€39,6 млн')
  await expect(button(page, 'HELIX подписан')).toBeDisabled()
  const download = page.waitForEvent('download')
  await button(page, 'Выгрузить отчёт').click()
  expect((await download).suggestedFilename()).toBe('apex-demo-ledger.csv')
  await role(page, 'Владелец команды')
  await button(page, 'Инфраструктура').click()
  await button(page, 'Рассмотреть инвестицию').first().click()
  await button(page, 'Утвердить инвестицию').click()
  await expect(button(page, 'Объект улучшен')).toBeDisabled()
  await button(page, 'Цели и руководители').click()
  await button(page, 'Изменить цель').first().click()
  await page.getByLabel('Цель на сезон').fill('Два подиума')
  await button(page, 'Сохранить цель').click()
  await expect(page.getByRole('table')).toContainText('Два подиума')
  await role(page, 'Производитель')
  await button(page, 'Мощности').click()
  await page.getByLabel('Рабочие смены').selectOption('3')
  await button(page, 'Применить план').click()
  await expect(page.locator('.kpi-grid')).toContainText('64%')
  await button(page, 'Параметры').first().click()
  await page.getByLabel('Цена пакета, млн евро').fill('17.2')
  await button(page, 'Обновить предложение').click()
  await expect(page.locator('.management-product-body').first()).toContainText('€17,2 млн')

})

test('Все машины следуют таймингу на каждой скорости и на границе повтора', async ({ page }) => {
  await navigate(page, 'Гоночный центр')
  const start = new Date('2028-05-21T14:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(+start + 1024))
  const control = (name: string) => button(page, name).dispatchEvent('click')

  // Sample the rendered SVG against the distances implied by the visible timing rows.
  async function checkPositions(seconds: number) {
    const errors = await page.evaluate((seconds) => {
      const track = document.querySelector<SVGPathElement>('.race-course')!
      const length = track.getTotalLength()
      return [...document.querySelectorAll('.race-timing-row')].map((row) => {
        const name = row.querySelector('.race-timing-driver')!.textContent
        const car = document.querySelector<SVGGElement>(`.circuit-map [aria-label^="На карте: ${name},"]`)!
        const gap = Number(row.querySelector('.race-gap')!.textContent) || 0
        const progress = ((seconds - gap) / 89.6 % 1 + 1) % 1
        const expected = track.getPointAtLength(progress * length)
        const actual = car.transform.baseVal.getItem(0).matrix
        return Math.hypot(actual.e - expected.x, actual.f - expected.y)
      })
    }, seconds)
    expect(errors).toHaveLength(20)
    expect(Math.max(...errors)).toBeLessThan(0.2)
  }
  await checkPositions(0)
  await control('Начать показ')
  await page.clock.runFor(160)
  await checkPositions(1.28)
  await control('4×')
  await page.clock.runFor(320)
  await checkPositions(11.52)
  await control('Пауза')
  await page.clock.runFor(480)
  await checkPositions(11.52)
  await control('16×')
  await control('Начать показ')
  // Step past a lap boundary and then the end of the four-lap loop.
  await page.clock.runFor(624)
  await expect(page.locator('.race-lap strong')).toHaveText('15')
  await checkPositions(91.392)
  await page.clock.runFor(2096)
  await expect(page.locator('.race-lap strong')).toHaveText('14')
  await checkPositions(359.68)

  const sizes = await page.locator('.race-timing').evaluate((panel) => {
    const head = panel.querySelector('.race-table-head')!
    const columns = [...head.children].map((cell) => cell.getBoundingClientRect())
    return [...panel.querySelectorAll('.race-timing-row')].every((row) => {
      const bounds = row.getBoundingClientRect()
      return Math.abs(bounds.height - 34) < 0.1 && bounds.width === head.getBoundingClientRect().width &&
        [...row.children].every((cell, i) => {
          const rect = cell.getBoundingClientRect()
          return Math.abs(columns[i].left - rect.left) < 1 && Math.abs(columns[i].right - rect.right) < 1 &&
            cell.scrollWidth <= cell.clientWidth + 1 && rect.height < bounds.height
        })
    })
  })
  expect(sizes).toBe(true)
})
