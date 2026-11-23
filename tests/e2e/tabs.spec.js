import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

// The stock page is the valuation calculator. Older tab URLs land on the same screen.
const FAIR = '.text-h6.button-font-weight'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(FAIR)).toContainText('10.76', { timeout: 20000 })
})

test('shows the calculator and no leftover tab strip', async ({ page }) => {
  await expect(page.locator('.ticker-tabs')).toHaveCount(0)
  await expect(page.locator('.dcf')).toBeVisible()
  await expect(page.locator('.stock-head h1')).toHaveText('工商银行')
})

test('an old tab link opens the calculator on its defaults', async ({ page }) => {
  await page.goto('/#/stock/SHSE:601398/summary?r=15')
  await expect(page).toHaveURL(/\/dcf\?r=15/)
  // Query strings are no longer a share channel, so they do not seed the form.
  await expect(page.locator('.input-section').first()).toHaveValue('8', { timeout: 20000 })
  await expect(page.locator(FAIR)).toContainText('10.76')
})
