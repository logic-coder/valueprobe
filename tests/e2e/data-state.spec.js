import { expect, test } from '@playwright/test'
import { stockFixture as stock } from './support/api-mock'
import { mockApi } from './support/api-mock'

const SYMBOL = 'SHSE:601398'
const seed = (page) => page.addInitScript(({ sym, stockData }) => {
  const now = Date.now()
  localStorage.setItem('fv-cache:' + sym + ':stock', JSON.stringify({ v: stockData, t: now - 90000000, ttl: 6 * 3600e3 }))
  localStorage.setItem('fv-cache:' + sym + ':financials', JSON.stringify({ v: { annual: [], quarter: [], ttm: [{ free_cash_flow_per_share: '6.64' }] }, t: now - 90000000, ttl: 6 * 3600e3 }))
  localStorage.setItem('fv-cache:rates:10y', JSON.stringify({ v: { USD: { value: 5.1, asOf: '2026-11-17', source: 'live' }, CNY: { value: 1.5892, asOf: '2026-11-18', source: 'live' } }, t: now, ttl: 3600e3 }))
}, { sym: SYMBOL, stockData: stock })

test('a quarterly file shows its as-of date', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('11.86', { timeout: 20000 })
  await expect(page.locator('.data-banner--published')).toContainText('采集日')
})

test('falls back to a stale snapshot and offers recovery', async ({ page }) => {
  await seed(page)
  await mockApi(page, { fail: true })
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.data-banner--stale')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.data-banner')).toContainText('离线快照')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('11.86')
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
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('11.86')
})

test('manual mode stops fetching and keeps the numbers editable', async ({ page }) => {
  // Seed the manual state before the app boots. Writing it after a live load and
  // reloading raced the in-flight request, which could mark the symbol live again
  // and flip the banner between those two steps.
  await page.addInitScript(() => {
    localStorage.setItem('fv-source-state', JSON.stringify({
      'SHSE:601398': { state: 'manual', source: 'manual', dataAt: Date.now() },
    }))
  })
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.data-banner--manual')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.data-banner')).toContainText('手动估值模式')
  const before = await page.locator('.input-section').first().inputValue()
  await page.locator('.input-section').first().fill('9')
  await page.waitForTimeout(300)
  await expect(page.locator('.input-section').first()).toHaveValue('9')
  expect(before).not.toBe('9')
  const stored = await page.evaluate(() => localStorage.getItem('fv-manual:SHSE:601398'))
  expect(stored).toContain('"discountRate":9')
})
