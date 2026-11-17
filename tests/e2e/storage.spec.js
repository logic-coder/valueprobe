import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

const FAIR = '.text-h6.button-font-weight'

// Block all cookie/storage access, the way a hardened browser does.
test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => {
    const blocked = () => { throw new DOMException('blocked', 'SecurityError') }
    Storage.prototype.getItem = blocked
    Storage.prototype.setItem = blocked
    Storage.prototype.removeItem = blocked
  })
})

test('still boots and keeps the watchlist in memory', async ({ page }) => {
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(FAIR)).toContainText('10.49', { timeout: 20000 })
  await page.locator('.star-button').click()
  await expect(page.locator('.watch-link__count')).toHaveText('1')
  await page.locator('.watch-link').click()
  await expect(page.locator('.wl__table tbody tr')).toHaveCount(1)
})

test('still renders the landing page and toggles the theme', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.locator('.home__hero')).toBeVisible()
  await page.locator('.theme-button').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
