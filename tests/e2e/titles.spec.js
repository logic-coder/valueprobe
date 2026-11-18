import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

const FAIR = '.text-h6.button-font-weight'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(FAIR)).toContainText('10.45', { timeout: 20000 })
})

test('the title names the stock and the tool', async ({ page }) => {
  await expect(page).toHaveTitle(/工商银行 · valueprobe/)
})

test('static pages keep their own title', async ({ page }) => {
  await page.goto('/#/')
  await expect(page).toHaveTitle(/算出股票的内在价值 · valueprobe/)
  await page.goto('/#/watchlist')
  await expect(page).toHaveTitle(/自选股 · valueprobe/)
  await page.goto('/#/compare')
  await expect(page).toHaveTitle(/并排比较 · valueprobe/)
})
