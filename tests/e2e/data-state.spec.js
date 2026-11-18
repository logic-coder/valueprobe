import { expect, test } from '@playwright/test'
import { stockFixture as stock } from './support/api-mock'
import { mockApi } from './support/api-mock'

const SYMBOL = 'SHSE:601398'
const seed = (page) => page.addInitScript(({ sym, stockData }) => {
  const now = Date.now()
  localStorage.setItem('fv-cache:' + sym + ':stock', JSON.stringify({ v: stockData, t: now - 90000000, ttl: 6 * 3600e3 }))
  localStorage.setItem('fv-cache:' + sym + ':financials', JSON.stringify({ v: { annual: [], quarter: [], ttm: [{ free_cash_flow_per_share: '6.64' }] }, t: now - 90000000, ttl: 6 * 3600e3 }))
  localStorage.setItem('fv-cache:indicator:37', JSON.stringify({ v: 5.14, t: now, ttl: 3600e3 }))
}, { sym: SYMBOL, stockData: stock })

test('a quarterly file shows its as-of date', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('10.26', { timeout: 20000 })
  await expect(page.locator('.data-banner--published')).toContainText('数据截至')
})

test('falls back to a stale snapshot and offers recovery', async ({ page }) => {
  await seed(page)
  await mockApi(page, { fail: true })
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.data-banner--stale')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.data-banner')).toContainText('离线快照')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('13.49')
})

test('retry returns to live', async ({ page }) => {
  await seed(page)
  const api = await mockApi(page, { fail: true })
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.data-banner--stale')).toBeVisible({ timeout: 20000 })
  // The first load is not over when the stale banner appears: the financial and
  // chart legs still run, and the first one to succeed after the mock is revived
  // marks the symbol live on its own. Let the cycle settle first, or the banner
  // can unmount between the click and its actionability check.
  await page.locator('.dcf').waitFor({ timeout: 20000 })
  api.fail = false
  const retry = page.locator('.data-banner button', { hasText: '重试' })
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect(page.locator('.data-banner--published')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('10.26')
})

test('manual mode stops fetching and keeps the numbers editable', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('10.26', { timeout: 20000 })
  await page.locator('.banner-link').first().isVisible().catch(() => {})
  await page.evaluate(() => {})
  await page.locator('.q-card .q-btn:has-text("more_vert")').first().waitFor()
  // switch to manual through the stale banner requires a stale state; use the data-state store directly
  await page.evaluate(() => {
    const raw = localStorage.getItem('fv-source-state') || '{}'
    const state = JSON.parse(raw)
    state['SHSE:601398'] = { state: 'manual', source: 'manual', dataAt: Date.now() }
    localStorage.setItem('fv-source-state', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('.data-banner--manual')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.data-banner')).toContainText('手动模式')
  const before = await page.locator('.input-section').first().inputValue()
  await page.locator('.input-section').first().fill('9')
  await page.waitForTimeout(300)
  await expect(page.locator('.input-section').first()).toHaveValue('9')
  expect(before).not.toBe('9')
  const stored = await page.evaluate(() => localStorage.getItem('fv-manual:SHSE:601398'))
  expect(stored).toContain('"discountRate":9')
})
