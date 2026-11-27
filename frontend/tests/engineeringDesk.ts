import { expect, type Page } from '@playwright/test'

export async function leaseFacility(page: Page, facility: string) {
  const returnUrl = page.url()
  await page.goto(returnUrl.split('#')[0] + '#facilities?tab=rent')
  await page.getByLabel('Организация или объект').fill('Независимый оператор')
  const asset = page
    .locator('.facility-row')
    .filter({ has: page.getByRole('heading', { name: facility, exact: true }) })
  await asset.getByRole('button', { name: 'Арендовать' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Проверить итог' }).click()
  await dialog.getByRole('button', { name: 'Подтвердить резервирование' }).click()
  await dialog.getByRole('button', { name: 'Вернуться к организации' }).click()
  await page.goto(returnUrl)
}

export async function advanceDesk(page: Page, topic: string) {
  const snapshot = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.ok() &&
      url.pathname.endsWith('/pit-wall') &&
      url.searchParams.getAll('topics').includes(topic)
    )
  })
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  const desk = (await (await snapshot).json()).projections[topic]
  await expect(page.locator('.engineering-module')).toBeVisible()
  return desk
}
