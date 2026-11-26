import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('Рынок, сравнение и переход пилота GT на свободное место Formula', async ({ page }, info) => {
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
  const dialog = page.getByRole('dialog')
  const artist = dialog.locator('image[data-layer="appearance"]').first()
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
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.locator('.staff-offer')).toContainText('Встречные условия')
  await page.getByRole('button', { name: 'Рассмотреть условия' }).click()
  await dialog.getByRole('button', { name: 'Подписать договор' }).click()
  await expect(page.locator('.staff-offer')).toContainText('Подписан')
  await evidence('negotiation')
  await page.getByRole('button', { name: 'Кадровый рынок', exact: true }).click()
  await page.getByLabel('Найти человека').fill(name)
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(dialog.locator('image[data-layer="fitted-fabric"]')).toHaveAttribute('href', oldKit!)
  await expect(dialog).toContainText('ABT Sportsline')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Продолжить' }).click()
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
  await expect(contacts.filter({ hasText: 'Архив' })).toContainText('3 дн. вместе')
  await expect(contacts.filter({ hasText: 'В составе' })).toContainText('0 дн. вместе')
  await dialog.getByRole('heading', { name: 'Совместная работа' }).scrollIntoViewIfNeeded()
  await evidence('relationships')
  await dialog.getByRole('button', { name: 'Сравнение' }).click()
  await dialog.getByRole('heading', { name: 'Сравнение совместного опыта' }).scrollIntoViewIfNeeded()
  await expect(dialog.locator('.staff-duo')).toContainText('Доверие')
  await evidence('compare-work')
  await dialog.getByRole('button', { name: 'Карьера', exact: true }).click()
  await expect(dialog).toContainText('Formula')
  await dialog.getByRole('button', { name: 'Начать курс' }).click()
  await expect(dialog.getByRole('status')).toContainText('Курс')
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
  const dialog = page.getByRole('dialog')
  await expect(page.locator('.staff-card').filter({ hasText: 'Руководитель конструкции шин' })).toHaveCount(1)
  await page.locator('.staff-card').filter({ hasText: 'Технический консультант' }).click()
  await dialog.getByRole('button', { name: 'Карьера', exact: true }).click()
  await dialog.getByRole('button', { name: 'Назначить консультанта' }).click()
  const assignment = dialog
    .locator('p')
    .filter({ hasText: /1 февр.*8 февр/ })
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
  const dialog = page.getByRole('dialog')
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
  await dialog.getByLabel('План тренера').selectOption('Дождь')
  await dialog.getByRole('button', { name: 'Назначить тренера' }).click()
  await expect(dialog.getByRole('button', { name: /Курс идёт до/ })).toBeDisabled()
  await dialog.getByRole('heading', { name: 'Академия', exact: true }).scrollIntoViewIfNeeded()
  await evidence('backing')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Руководство', exact: true }).click()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
  await page.getByRole('button', { name: 'Коллективы', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Подразделение' })
    .selectOption({ label: 'Механики и пит-бригада' })
  await page.getByRole('combobox', { name: 'Сравнить подразделения' }).selectOption({ label: 'Шасси' })
  await expect(page.getByText('Атмосфера в подразделении', { exact: true })).toBeVisible()
  await page.getByRole('heading', { name: 'Профессиональное взаимодействие' }).scrollIntoViewIfNeeded()
  await evidence('crew')
  expect(errors).toEqual([])
})
