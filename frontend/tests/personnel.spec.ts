import { configureCareer, submitCareer } from './createCareer'
import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('Рынок, сравнение и переход пилота GT на свободное место Formula', async ({ page }, info) => {
  test.setTimeout(90000)
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
  const dialog = page.locator('.staff-dossier')
  const artist = dialog.locator('image[data-layer="appearance"]').first()
  async function advance() {
    const response = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST')
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
  await page.goto('/?career=' + c.id + '#people')
  await page.getByRole('button', { name: new RegExp(incumbent) }).click()
  await dialog.getByRole('button', { name: 'Договор', exact: true }).click()
  await dialog.getByText('Досрочное прекращение договора', {exact:true}).click()
  await dialog.getByRole('button', { name: 'Расторгнуть контракт' }).click()
  await dialog.getByRole('button', { name: 'Подтвердить расторжение' }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByLabel('Профессия').selectOption('driver')
  await page.getByLabel('Чемпионат', { exact: true }).selectOption('dtm')
  await page.locator('.staff-card').first().waitFor()
  await expect(page.locator('.staff-card image[data-layer="appearance"]')).toHaveCount(12)
  await evidence('market')
  await page.getByLabel('Найти человека').fill('zzzzzzzz')
  await expect(page.getByText('По этим условиям сотрудников нет.')).toBeVisible()
  await page.getByLabel('Найти человека').fill(name)
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(artist).toHaveAttribute('href', new RegExp(world.faces[pid]))
  const before = await artist.getAttribute('href')
  const oldKit = await dialog.locator('image[data-layer="fitted-fabric"]').getAttribute('href')
  await dialog.getByRole('button', { name: 'Взаимодействие' }).click()
  const initialDays = parseInt(await dialog.locator('.staff-connection').filter({ hasText: 'Обратная связь с инженером' }).getByText(/дн. вместе/).innerText())
  await dialog.getByRole('button', { name: 'Профиль', exact: true }).click()
  await evidence('dossier')
  const rainSkill = dialog.locator('.staff-skills > div').filter({ hasText: 'Дождь' }).locator('strong')
  const dry = await rainSkill.innerText()
  await dialog.getByLabel('Мокрая трасса').check()
  await expect(rainSkill).not.toHaveText(dry)
  await dialog.getByLabel('Мокрая трасса').uncheck()
  await expect(rainSkill).toHaveText(dry)
  await dialog.getByRole('button', { name: 'Сравнение' }).click()
  await expect(dialog.locator('.staff-compare').first()).toContainText('Выносливость')
  await evidence('compare')
  await dialog.getByRole('button', { name: 'Договор', exact: true }).click()
  const wage = dialog.getByLabel('Оклад в месяц')
  const asking = Number(await wage.inputValue())
  await wage.fill(String(Math.floor(asking * 0.8)))
  await dialog.getByRole('button', { name: 'Отправить предложение' }).scrollIntoViewIfNeeded()
  await evidence('terms')
  await dialog.getByRole('button', { name: 'Отправить предложение' }).click()
  await expect(page.locator('.staff-offer')).toContainText('На рассмотрении')
  await advance()
  await expect(page.locator('.staff-offer')).toContainText('Встречные условия')
  await page.getByRole('button', { name: 'Рассмотреть условия' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Подписать договор' }).click()
  await expect(page.locator('.staff-offer')).toContainText('Подписан')
  await evidence('negotiation')
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByLabel('Найти человека').fill(name)
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(dialog.locator('image[data-layer="fitted-fabric"]')).toHaveAttribute('href', oldKit!)
  await expect(dialog).toContainText('ABT Sportsline')
  await page.keyboard.press('Escape')
  await advance()
  await page.getByRole('button', { name: 'Состав', exact: true }).click()
  await page.getByLabel('Найти человека').fill(name)
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(artist).toHaveAttribute('href', before!)
  await expect(dialog.locator('image[data-layer="fitted-fabric"]')).not.toHaveAttribute('href', oldKit!)
  await expect(dialog).toContainText('McLaren Formula 1 Team')
  await dialog.getByRole('button', { name: 'Взаимодействие' }).click()
  await expect(dialog.getByText('Архив', { exact: true }).first()).toBeVisible()
  const contacts = dialog.locator('.staff-connection').filter({ hasText: 'Обратная связь с инженером' })
  await expect(contacts).toHaveCount(2)
  await expect(contacts.filter({ hasText: 'Архив' })).toContainText((initialDays + 3) + ' дн. вместе')
  await expect(contacts.filter({ hasText: 'В составе' })).toContainText('0 дн. вместе')
  await dialog.getByRole('heading', { name: 'Совместная работа' }).scrollIntoViewIfNeeded()
  await evidence('relationships')
  await dialog.getByRole('button', { name: 'Сравнение' }).click()
  await dialog.getByRole('heading', { name: 'Сравнение совместного опыта' }).scrollIntoViewIfNeeded()
  await expect(dialog.locator('.staff-duo')).toContainText('Доверие')
  await evidence('compare-work')
  await dialog.getByRole('button', { name: 'Карьера', exact: true }).click()
  await expect(dialog).toContainText('Formula')
  await expect(dialog.getByRole('heading', { name: 'Профессиональная динамика' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeFocused()
  expect(errors).toEqual([])
})

test('Производитель шин, поддержка клиента и нейтральная форма', async ({ page }) => {
  const org = 'supplier-goodyear'
  const c = await (
    await page.request.post('/api/careers', {
      data: { org, role: 'manufacturer', series: 'wec', seed: 19, name: 'Марина' },
    })
  ).json()
  const url = '/?career=' + c.id + '#people'
  await page.goto(url)
  const dialog = page.locator('.staff-dossier')
  await expect(page.locator('.staff-card').filter({ hasText: 'Руководитель конструкции шин' })).toHaveCount(1)
  await page.locator('.staff-card').filter({ hasText: 'Технический консультант' }).click()
  await dialog.getByRole('button', { name: 'Карьера', exact: true }).click()
  const assignment = dialog
    .locator('p')
    .filter({ hasText: /1 февр.*—.*февр/ })
    .first()
  await expect(assignment).toBeVisible()
  await dialog.getByRole('button', { name: 'Назначить консультанта' }).click()
  await expect(dialog.getByRole('alert')).toContainText('занят')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByLabel('Свободные агенты').check()
  await page.getByLabel('Профессия').selectOption('analyst')
  await page.locator('.staff-card').first().click()
  await expect(dialog).toContainText('Свободный агент')
  const face = dialog.locator('image[data-layer="appearance"]')
  await expect(face).toHaveCount(1)
  const urlFace = await face.getAttribute('href')
  // An uninstalled head is represented by the existing silhouette renderer.
  await page.route('**/api/media', async (route) => {
    const original = await route.fetch()
    const assets = (await original.json()) as { entity: string }[]
    await route.fulfill({ json: assets.filter((a) => !urlFace?.includes('/' + a.entity + '?')) })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByLabel('Свободные агенты').check()
  await page.getByLabel('Профессия').selectOption('analyst')
  await page.locator('.staff-card').first().click()
  await expect(dialog.getByRole('img', { name: /силуэт/ })).toBeVisible()
  await expect(dialog.locator('image[data-layer="appearance"]')).toHaveCount(0)
})

test('Мандат владельца, наблюдение скаута и договор воспитанника в сторонней команде', async ({
  page,
}, info) => {
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
    if (process.env.STAFF_EVIDENCE)
      await page.screenshot({
        path: join(process.env.STAFF_EVIDENCE, info.project.name + '-' + view + '.png'),
      })
  }
  await page.goto('/?career=' + c.id + '#people')
  await page.getByRole('button', { name: 'Руководство', exact: true }).click()
  await page.getByRole('combobox', { name: 'Цель', exact: true }).selectOption('technical')
  await page.getByRole('combobox', { name: 'Приоритет', exact: true }).selectOption('required')
  await page.getByLabel('Лимит оклада, €').fill('55000')
  await page.getByRole('button', { name: 'Передать мандат' }).click()
  await expect(page.getByText('Просит пересмотреть приоритет', { exact: true })).toBeVisible()
  await page.getByRole('heading', { name: 'Мандат менеджера' }).scrollIntoViewIfNeeded()
  await evidence('mandate')
  await page.locator('.staff-desk').getByRole('button', {name:'Академия',exact:true}).click()
  await page.getByRole('heading', { name: 'Штат академии' }).scrollIntoViewIfNeeded()
  await expect(page.getByText('Тренер академии', { exact: true })).toBeVisible()
  await evidence('academy')
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByLabel('Профессия').selectOption('driver')
  await page.getByLabel('Чемпионат', { exact: true }).selectOption('f2')
  await page.getByLabel('Сортировка рынка').selectOption('net')
  await page.locator('.staff-card').first().scrollIntoViewIfNeeded()
  await expect(page.locator('.staff-card image[data-layer="appearance"]')).toHaveCount(12)
  await evidence('market-funded')
  await page.getByLabel('Найти человека').fill(name)
  await page.getByRole('button', { name: new RegExp(name) }).click()
  const dialog = page.locator('.staff-dossier')
  await dialog.getByRole('button', { name: 'Карьера', exact: true }).click()
  await dialog.getByRole('button', { name: 'Запросить наблюдение' }).click()
  await expect(dialog.getByRole('button', { name: /Следующее наблюдение/ })).toBeDisabled()
  await expect(dialog.locator('.path-block .staff-subhead b')).toHaveText(/^\d+–\d+$/)
  await dialog.getByRole('heading', { name: 'Скаутский отчёт' }).scrollIntoViewIfNeeded()
  await evidence('scouting')
  await dialog.getByRole('button', { name: 'Поддержка', exact: true }).click()
  await dialog.getByLabel('Команда — получатель взносов').selectOption(org)
  await dialog.getByLabel('До даты').fill('2025-05-01')
  await dialog.getByRole('button', { name: 'Заключить договор воспитанника' }).click()
  await dialog.getByRole('button', { name: 'Использовать опцион' }).click()
  await expect(dialog.getByText(/Опцион реализован/)).toBeVisible()
  await dialog.getByRole('heading', { name: 'Академия', exact: true }).scrollIntoViewIfNeeded()
  await evidence('backing')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Подготовка', exact: true }).click()
  await page.getByRole('button', { name: /Утвердить программу · Практика воспитанников/ }).click()
  await expect(page.locator('.prep-desk .staff-timeline')).toContainText('Запланировано')
  await evidence('preparation')
  const prepared = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  expect((await prepared).ok()).toBe(true)
  await expect(page.locator('.prep-desk .staff-timeline')).toContainText('Завершено')
  const training = await (await page.request.get('/api/careers/' + c.id)).json()
  const participant = training.preparations[0].names[0]
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByLabel('Найти человека').fill(participant)
  await page.locator('.staff-card').first().click()
  await dialog.getByRole('button', { name: 'Карьера', exact: true }).click()
  await expect(dialog.locator('.work-events')).toContainText('Повороты')
  await dialog.locator('.work-history').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await evidence('development')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Руководство', exact: true }).click()
  await page.locator('.staff-desk').getByRole('button', {name:'Академия',exact:true}).click()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
  await page.getByRole('button', { name: 'Коллективы', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Подразделение' })
    .selectOption({ label: 'Механики и пит-бригада' })
  await page.getByRole('combobox', { name: 'Сравнить подразделения' }).selectOption({ label: 'Шасси' })
  await expect(page.getByText('Атмосфера в подразделении', { exact: true })).toBeVisible()
  await page.locator('.unit-comparison').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await evidence('crew')
  expect(errors).toEqual([])
})

test('Национальность, флаги и публичный профиль домашнего этапа', async ({ page }, info) => {
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
  await page.goto('/?career=' + id + '#people')
  await page.getByLabel('Найти человека').fill('Николь')
  await expect(page.locator('.staff-card').getByRole('img', { name: 'Аргентина', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByRole('combobox', { name: 'Национальность', exact: true }).selectOption(pilot.country)
  await page.getByRole('combobox', { name: 'Профессия', exact: true }).selectOption('driver')
  const cards = page.locator('.staff-card')
  await cards.first().waitFor()
  await expect(
    cards.locator('.country-flag[aria-label="' + world.countries[pilot.country] + '"]'),
  ).toHaveCount(await cards.count())
  await page.getByLabel('Найти человека').fill(pilot.name)
  await cards.first().click()
  const dialog = page.locator('.staff-dossier')
  await expect(dialog.getByRole('img', { name: world.countries[pilot.country], exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Публичный профиль' }).click()
  await expect(dialog.getByText('Профессиональная репутация', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Медийная популярность', { exact: true })).toBeVisible()
  await dialog
    .getByRole('heading', { name: 'Региональная популярность' })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await shot('public-profile')
  await expect(dialog.getByText(/· Домашний этап/)).toBeVisible()
  await dialog
    .getByRole('heading', { name: 'Внимание на этапе' })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await shot('home-round')
  const schedule = dialog.getByRole('combobox', { name: 'Этап по действующему назначению' })
  const away = await schedule
    .locator('option')
    .evaluateAll(
      (options) => (options as HTMLOptionElement[]).find((o) => !o.text.includes('домашний'))?.value,
    )
  await schedule.selectOption(away!)
  await expect(dialog.getByText(/· Выездной этап/)).toBeVisible()
})
