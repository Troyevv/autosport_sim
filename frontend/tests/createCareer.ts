import { expect, type Page } from '@playwright/test'

export async function submitCareer(page: Page) {
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/careers' && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Создать карьеру' }).click(),
  ])
  expect(created.status()).toBe(201)
}

