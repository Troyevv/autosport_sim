import { expect, type Page } from '@playwright/test'

function command(page: Page, action: string) {
  return page.waitForResponse((response) => {
    const request = response.request()
    return (
      request.method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/commands') &&
      request.postDataJSON()?.action === action
    )
  })
}

export async function leaseFacility(page: Page, facility: string) {
  const returnUrl = page.url()
  await page.goto(returnUrl.split('#')[0] + '#facilities?tab=rent')
  await page.getByLabel('Организация или объект').fill('Независимый оператор')
  const asset = page.locator('.facility-row').filter({
    has: page.getByRole('heading', { name: facility, exact: true }),
  })
  await asset.getByRole('button', { name: 'Арендовать' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Проверить итог' }).click()
  const booked = command(page, 'finance-lease')
  await dialog.getByRole('button', { name: 'Подтвердить резервирование' }).click()
  const response = await booked
  expect(response.status(), response.ok() ? undefined : await response.text()).toBe(200)
  await expect(dialog.getByText('Мощности зарезервированы', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Вернуться к организации' }).click()
  await page.goto(returnUrl)
}

export async function advanceDesk(page: Page, topic: string) {
  const advanced = command(page, 'advance')
  const revision = advanced.then(async (response) => {
    expect(response.status(), response.ok() ? undefined : await response.text()).toBe(200)
    return (await response.json()).revision as number
  })
  const snapshot = page.waitForResponse(async (response) => {
    const url = new URL(response.url())
    if (
      !response.ok() ||
      !url.pathname.endsWith('/pit-wall') ||
      !url.searchParams.getAll('topics').includes(topic)
    )
      return false
    return (await response.json()).revision === (await revision)
  })
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  const desk = (await (await snapshot).json()).projections[topic]
  await expect(page.locator('.engineering-module')).toBeVisible()
  return desk
}
