import { expect, test } from '@playwright/test'

test('a stale chunk error reloads once, then the marker is cleared for later deploys', async ({ page }) => {
  const documents = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents.push(request.url())
  })

  await page.goto('/#/')
  await expect(page.locator('.home__hero')).toBeVisible()
  expect(documents).toHaveLength(1)

  await page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError')))
  await expect.poll(() => documents.length).toBe(2)
  await expect(page.locator('.home__hero')).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('_r')).toBe(false)

  await page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError')))
  await expect.poll(() => documents.length).toBe(3)
  await expect(page.locator('.home__hero')).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('_r')).toBe(false)
})
