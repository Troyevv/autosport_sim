import { configureCareer, submitCareer } from './createCareer'
import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

async function screen(page: Page, route: string) {
  await page.goto(page.url().split('#')[0] + '#' + route)
  await page.locator('.main-inner :is(h1,h2,h3):visible').first().waitFor({ timeout: 45000 })
}
const file = (page: Page) => page.locator('.people-module')
const tab = (page: Page, name: string) => file(page).getByRole('tab', { name, exact: true }).click()
const cards = async (page: Page) => {
  await page.getByRole('button', { name: 'Карточки', exact: true }).click()
  return page.locator('.p-person-card')
}

test('Рынок, сравнение и переход пилота GT на свободное место Formula', async ({ page }, info) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const world = await (await page.request.get('/api/world')).json()
  const org = 'team-mclaren-formula-1-team'
  const c = await (
    await page.request.post('/api/careers', {
      data: { name: 'Алекс', org, role: 'manager', series: 'f1', seed: 42 },
    })
  ).json()
  const pid = world.entries['dtm-1'].crew[0],
    name = world.names[pid]
  const incumbent = world.names[world.entries['f1-4'].crew[0]]
  const dialog = file(page)
  const portrait = dialog.locator('.p-dossier-photo .career-portrait')
  const artist = portrait.locator('image[data-layer="appearance"]')
  const originalEmployer = world.entries['dtm-1'].org
  async function uniformSignature(employer: string) {
    const fitted = portrait.locator('image[data-layer="fitted-fabric"][href^="data:image/"]')
    await expect(portrait).toHaveAttribute('data-employer', employer)
    const image = await fitted.getAttribute('href')
    return createHash('sha256').update(image!).digest('hex')
  }
  async function advance() {
    const resume = page.getByRole('button', { name: 'Вернуться к работе' })
    if (await resume.isVisible()) await resume.click()
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith('/commands') &&
        r.request().method() === 'POST' &&
        r.request().postDataJSON().action === 'advance',
    )
    await page.getByRole('button', { name: 'Продолжить' }).click()
    expect((await response).ok()).toBe(true)
  }
  async function evidence(view: string) {
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toEqual(
      page.viewportSize()!.width,
    )
    if (process.env.STAFF_EVIDENCE)
      await page.screenshot({
        path: join(process.env.STAFF_EVIDENCE, info.project.name + '-' + view + '.png'),
      })
  }
  await page.goto('/?career=' + c.id + '#drivers')
  await page.getByRole('button', { name: 'Открыть досье ' + incumbent }).click({ timeout: 45000 })
  await tab(page, 'Договор')
  const mark = dialog.locator('.contract-paper-header .organization-mark.has-logo').first()
  const logo = mark.locator('img')
  await expect(logo).toBeVisible()
  expect(
    await logo.evaluate(async (node: HTMLImageElement) => {
      await node.decode()
      const image = node.getBoundingClientRect()
      const backing = node.parentElement!.getBoundingClientRect()
      return (
        node.naturalWidth > 0 &&
        image.left >= backing.left &&
        image.right <= backing.right &&
        image.top >= backing.top &&
        image.bottom <= backing.bottom
      )
    }),
  ).toBe(true)

  await dialog.getByRole('button', { name: 'Расторгнуть договор', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Расторгнуть и выплатить компенсацию' })
    .click()
  await expect(dialog).toContainText('Открыт к предложениям')
  await screen(page, 'market')
  await page.getByLabel('Профессия').selectOption('driver')
  await page.getByRole('combobox', { name: 'Чемпионат', exact: true }).selectOption('dtm')
  await cards(page)
  await page.locator('.p-person-card').first().waitFor()
  await expect(page.locator('.p-person-card image[data-layer="appearance"]')).toHaveCount(18)
  await evidence('market')
  await page.getByLabel('Поиск людей').fill('zzzzzzzz')
  await expect(page.getByText('По этим условиям никого нет')).toBeVisible()
  await cards(page)
  await page.getByLabel('Поиск людей').fill(name)
  await page.getByRole('button', { name: 'Открыть досье ' + name }).click()
  await expect(artist).toHaveAttribute('href', new RegExp(world.faces[pid]))
  const before = await artist.getAttribute('href')
  const oldKit = await uniformSignature(originalEmployer)
  await tab(page, 'Взаимодействие')
  const initialDays = parseInt(
    await dialog
      .locator('.p-relations article')
      .filter({ hasText: 'Работа с инженером' })
      .getByText(/дней вместе/)
      .innerText(),
  )
  await tab(page, 'Профиль')
  await evidence('dossier')
  const rainSkill = dialog.locator('.p-skill-list > div').filter({ hasText: 'Дождь' }).locator('strong')
  const dry = await rainSkill.innerText()
  await dialog.getByLabel('Мокрая трасса').check()
  await expect(rainSkill).not.toHaveText(dry)
  await dialog.getByLabel('Мокрая трасса').uncheck()
  await expect(rainSkill).toHaveText(dry)
  await tab(page, 'Сравнение')
  await expect(dialog.locator('.p-compare-table').first()).toContainText('Выносливость')
  await evidence('compare')
  await tab(page, 'Договор')
  await dialog
    .locator('.contract-contracts-intro')
    .getByRole('button', { name: 'Предложить контракт' })
    .click()
  const offer = page.getByRole('dialog')
  const wage = offer.getByLabel('Оклад в месяц')
  const asking = Number(await wage.inputValue())
  await wage.fill(String(Math.floor(asking * 0.8)))
  await offer.getByRole('button', { name: 'Передать предложение' }).scrollIntoViewIfNeeded()
  await evidence('terms')
  await offer.getByRole('button', { name: 'Передать предложение' }).click()
  await expect(
    page.locator('.p-offer-card').first().getByText('Переговоры / На рассмотрении', { exact: true }),
  ).toBeVisible()
  await advance()
  await expect(
    page.locator('.p-offer-card').first().getByText('Переговоры / Встречные условия', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Проверить встречные условия' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Подписать договор' }).click()
  await expect(
    page.locator('.p-offer-card').first().getByText('Переговоры / Подписан', { exact: true }),
  ).toBeVisible()
  await evidence('negotiation')
  await screen(page, 'market')
  await cards(page)
  await page.getByLabel('Поиск людей').fill(name)
  await page.getByRole('button', { name: 'Открыть досье ' + name }).click()
  expect(await uniformSignature(originalEmployer)).toBe(oldKit)
  await expect(dialog).toContainText('ABT Sportsline')
  await page.keyboard.press('Escape')
  await advance()
  await screen(page, 'market')
  await page
    .getByRole('combobox', { name: 'Чемпионат', exact: true })
    .selectOption({ label: 'Все чемпионаты' })
  await cards(page)
  await page.getByLabel('Поиск людей').fill(name)
  await page.getByRole('button', { name: 'Открыть досье ' + name }).click()
  await expect(artist).toHaveAttribute('href', before!)
  expect(await uniformSignature(org)).not.toBe(oldKit)
  await expect(dialog).toContainText('McLaren Formula 1 Team')
  await tab(page, 'Взаимодействие')
  await expect(dialog.getByText('Архив', { exact: true }).first()).toBeVisible()
  const contacts = dialog.locator('.p-relations article').filter({ hasText: 'Работа с инженером' })
  await expect(contacts).toHaveCount(2)
  await expect(contacts.filter({ hasText: 'Архив' })).toContainText(initialDays + 3 + ' дней вместе')
  await expect(contacts.filter({ hasText: 'В составе' })).toContainText('0 дней вместе')
  await dialog.getByRole('heading', { name: 'Совместная работа' }).scrollIntoViewIfNeeded()
  await evidence('relationships')
  await tab(page, 'Сравнение')
  await dialog.getByRole('heading', { name: 'Совместный опыт' }).scrollIntoViewIfNeeded()
  await expect(
    dialog.locator('.p-compare-work').filter({ has: page.getByRole('heading', { name, exact: true }) }),
  ).toContainText('Доверие')
  await evidence('compare-work')
  await tab(page, 'Карьера')
  await expect(dialog).toContainText('Formula')
  await expect(dialog.getByRole('heading', { name: 'Профессиональная динамика' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.p-dossier-hero')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Открыть досье ' + name })).toBeFocused()
  expect(errors).toEqual([])
})

test('Производитель шин, поддержка клиента и нейтральная форма', async ({ page }) => {
  test.setTimeout(150000)
  const org = 'supplier-goodyear'
  const c = await (
    await page.request.post('/api/careers', {
      data: { org, role: 'manufacturer', series: 'wec', seed: 19, name: 'Марина' },
    })
  ).json()
  const url = '/?career=' + c.id + '#staff'
  await page.goto(url)
  const dialog = file(page)
  const people = (await (await page.request.get('/api/careers/' + c.id + '/personnel')).json()) as {
    id: string
    org: string
    position: string
    name: string
  }[]
  const own = people.filter((p) => p.org === org)
  expect(own.filter((p) => p.position === 'tyres')).toHaveLength(1)
  await expect(file(page)).toContainText('Руководитель конструкции шин')
  await screen(
    page,
    'person?tab=contract&entity=' + own.find((p) => p.position === 'technical-advisor')!.id,
  )
  await expect(dialog.locator('.p-advisor-assignment').first()).toContainText(/февр/)
  await dialog.getByRole('button', { name: 'Новое назначение' }).click()
  await page.getByRole('dialog').getByRole('radio').first().click()
  await page.getByRole('dialog').getByLabel('Начало поддержки').fill(c.date)
  await page.getByRole('dialog').getByLabel('Окончание (исключая)').fill('2025-02-03')
  await page.getByRole('dialog').getByRole('button', { name: 'Назначить консультанта' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('занят')
  await page.keyboard.press('Escape')
  await screen(page, 'market')
  await page.getByLabel('Свободные агенты').check()
  await page.getByLabel('Профессия').selectOption('analyst')
  await cards(page)
  await page.locator('.p-person-main').first().click()
  await expect(dialog).toContainText('Свободный агент')
  const portrait = dialog.locator('.p-dossier-photo .career-portrait')
  await expect(portrait).toHaveAttribute('data-category', 'neutral')
  await expect(portrait.locator('[data-layer=organization-badge],[data-layer=sponsor]')).toHaveCount(0)
  const face = portrait.locator('image[data-layer="appearance"]')
  await expect(face).toHaveCount(1)
  const urlFace = await face.getAttribute('href')
  // An uninstalled head is represented by the existing silhouette renderer.
  await page.route('**/api/media', async (route) => {
    const original = await route.fetch()
    const assets = (await original.json()) as { entity: string }[]
    await route.fulfill({ json: assets.filter((a) => !urlFace?.includes('/' + a.entity + '?')) })
  })
  await page.reload()
  await screen(page, 'market')
  await page.getByLabel('Свободные агенты').check()
  await page.getByLabel('Профессия').selectOption('analyst')
  await cards(page)
  await page.locator('.p-person-main').first().click()
  await expect(dialog.getByRole('img', { name: /исходный портрет недоступен/ })).toBeVisible()
  await expect(dialog.locator('image[data-layer="appearance"]')).toHaveCount(0)
})

test('Мандат владельца, наблюдение скаута и договор воспитанника в сторонней команде', async ({
  page,
}, info) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const world = await (await page.request.get('/api/world')).json()
  const c = await (
    await page.request.post('/api/careers', {
      data: { org: 'team-mclaren-formula-1-team', role: 'owner', series: 'f1', seed: 29, name: 'Ольга' },
    })
  ).json()
  const name = world.names['driver-051']
  const org = world.entries['f2-7'].org
  async function evidence(view: string) {
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      page.viewportSize()!.width,
    )
    if (process.env.STAFF_EVIDENCE)
      await page.screenshot({
        path: join(process.env.STAFF_EVIDENCE, info.project.name + '-' + view + '.png'),
      })
  }
  await page.goto('/?career=' + c.id + '#people')
  await screen(page, 'leadership')
  await page.getByRole('button', { name: 'Изменить мандат' }).click()
  await page.getByRole('combobox', { name: 'Цель', exact: true }).selectOption('technical')
  await page.getByRole('combobox', { name: 'Приоритет', exact: true }).selectOption('required')
  await page.getByLabel('Лимит месячного оклада, €').fill('55000')
  await page.getByRole('button', { name: 'Передать мандат' }).click()
  await expect(page.getByText('Просит пересмотреть приоритет', { exact: true })).toBeVisible()
  await expect(page.locator('.p-mandate')).toBeVisible()
  await evidence('mandate')
  await screen(page, 'academy')
  await page.getByRole('heading', { name: 'Талант требует системы' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: /Тренер академии/ }).first()).toBeVisible()
  await evidence('academy')
  await screen(page, 'market')
  await page.getByLabel('Профессия').selectOption('driver')
  await page.getByRole('combobox', { name: 'Чемпионат', exact: true }).selectOption('f2')
  await page.getByLabel('Порядок').selectOption('cost')
  await cards(page)
  await page.locator('.p-person-card').first().scrollIntoViewIfNeeded()
  await expect(page.locator('.p-person-card image[data-layer="appearance"]')).toHaveCount(18)
  await evidence('market-funded')
  await cards(page)
  await page.getByLabel('Поиск людей').fill(name)
  await page.getByRole('button', { name: 'Открыть досье ' + name }).click()
  const dialog = file(page)
  await tab(page, 'Карьера')
  await dialog.getByRole('button', { name: 'Поручить наблюдение' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Передать поручение' }).click()
  await expect(dialog.getByRole('button', { name: /Следующее наблюдение/ })).toBeDisabled()
  await expect(dialog.locator('.p-scout-estimate strong')).toHaveText(/^\d+–\d+$/)
  await dialog.locator('.p-scout-estimate').scrollIntoViewIfNeeded()
  await evidence('scouting')
  await tab(page, 'Поддержка')
  await dialog.getByRole('button', { name: 'Принять в академию' }).click()
  await page.getByRole('dialog').getByLabel('Команда — получатель взносов').selectOption(org)
  await page.getByRole('dialog').getByLabel('До даты').fill('2025-05-01')
  await page.getByRole('dialog').getByRole('button', { name: 'Проверить перед подписью' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Подписать соглашение' }).click()
  await dialog.getByRole('button', { name: 'Использовать опцион' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Продлить договор' }).click()
  await expect(dialog).toContainText('Использован')
  await dialog.getByRole('heading', { name: 'Академические права', exact: true }).scrollIntoViewIfNeeded()
  await evidence('backing')
  await page.keyboard.press('Escape')
  await screen(page, 'preparation')
  await page
    .locator('.p-prep-options article')
    .filter({ hasText: 'Практика воспитанников' })
    .getByRole('button', { name: 'Утвердить программу' })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: 'Утвердить время и бюджет' }).click()
  await expect(page.locator('.p-prep-schedule')).toContainText('Запланировано')
  await evidence('preparation')
  const prepared = page.waitForResponse(
    (r) => r.url().endsWith('/commands') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Продолжить' }).click()
  expect((await prepared).ok()).toBe(true)
  await expect(page.locator('.p-prep-schedule')).toContainText('Завершено')
  const training = await (await page.request.get('/api/careers/' + c.id)).json()
  const participant = training.preparations[0].names[0]
  await screen(page, 'market')
  await page
    .getByRole('combobox', { name: 'Чемпионат', exact: true })
    .selectOption({ label: 'Все чемпионаты' })
  await page.getByLabel('Поиск людей').fill(participant)
  await cards(page)
  await page.locator('.p-person-main').first().click()
  await tab(page, 'Карьера')
  await expect(dialog.locator('.p-work-events')).toContainText('Повороты')
  await dialog.locator('.p-work-events').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await evidence('development')
  await page.keyboard.press('Escape')
  await screen(page, 'leadership')
  await screen(page, 'academy')
  await expect(page.locator('.p-scholarship-list .p-row-person').filter({ hasText: name })).toBeVisible()
  await screen(page, 'staff?tab=collectives')
  await page
    .locator('.p-collective-layout nav')
    .getByRole('button', { name: /Механики и пит-бригада/ })
    .click()
  await page.getByLabel('Сравнить с').selectOption({ label: 'Шасси' })
  await expect(page.locator('.p-collective-comparison')).toContainText('Атмосфера')
  await evidence('crew')
  expect(errors).toEqual([])
})

test('Национальность, флаги и публичный профиль домашнего этапа', async ({ page }, info) => {
  test.setTimeout(150000)
  async function shot(key: string) {
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toEqual(
      page.viewportSize()!.width,
    )
    if (process.env.STAFF_EVIDENCE)
      await page.screenshot({
        path: join(process.env.STAFF_EVIDENCE, info.project.name + '-' + key + '.png'),
      })
  }
  const world = await (await page.request.get('/api/world')).json()
  await page.goto('/')
  await configureCareer(page, { country: 'AR', name: 'Николь' })
  await shot('country')
  await submitCareer(page)
  await expect(page.getByRole('heading', { name: 'Команда ждёт вашего решения.' })).toBeVisible()
  const id = new URL(page.url()).searchParams.get('career')!
  const rows = await (await page.request.get('/api/careers/' + id + '/personnel')).json()
  type Candidate = { id: string; country: string; position: string; programs: string[]; name: string }
  const pilot = rows.find(
    (p: Candidate) =>
      p.position === 'driver' &&
      p.programs.includes('f1') &&
      world.events.some(
        (e: { series: string; country: string; kind: string }) =>
          e.kind === 'round' && e.series === 'f1' && e.country === p.country,
      ),
  ) as Candidate
  await page.goto('/?career=' + id + '#market')
  await page.getByRole('button', { name: 'Карточки', exact: true }).click({ timeout: 45000 })
  await page.getByLabel('Поиск людей').fill('Николь')
  await expect(
    page.locator('.p-person-card').getByRole('img', { name: 'Аргентина', exact: true }),
  ).toBeVisible()
  await page.reload()
  await screen(page, 'market')
  await page.getByLabel('Поиск людей').fill('')
  await page.getByRole('combobox', { name: 'Национальность', exact: true }).selectOption(pilot.country)
  await page.getByRole('combobox', { name: 'Профессия', exact: true }).selectOption('driver')
  await cards(page)
  const visibleCards = page.locator('.p-person-card')
  await visibleCards.first().waitFor()
  await expect(
    visibleCards.locator('.country-flag[aria-label="' + world.countries[pilot.country] + '"]'),
  ).toHaveCount(await visibleCards.count())
  await page.getByLabel('Поиск людей').fill(pilot.name)
  await visibleCards.first().locator('.p-person-main').click()
  const dialog = file(page)
  await expect(
    dialog.getByRole('img', { name: world.countries[pilot.country], exact: true }),
  ).toBeVisible()
  await tab(page, 'Публичный профиль')
  await expect(dialog.getByText('Профессиональная репутация', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Медийная популярность', { exact: true })).toBeVisible()
  await dialog
    .getByRole('heading', { name: 'Региональная аудитория' })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await shot('public-profile')
  await expect(dialog.getByText(/Домашний этап/i)).toBeVisible()
  await dialog
    .getByRole('heading', { name: 'Внимание на этапе' })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await shot('home-round')
  const schedule = dialog.getByRole('combobox', { name: 'Этап' })
  const away = await schedule
    .locator('option')
    .evaluateAll(
      (options) => (options as HTMLOptionElement[]).find((o) => !o.text.includes('домашний'))?.value,
    )
  await schedule.selectOption(away!)
  await expect(dialog.getByText(/Выездной этап/i)).toBeVisible()
})
