import { expect, test } from '@playwright/test'
import { mockApi, publishedEntry } from './support/api-mock'

// Guards the documented deviations (docs/DEVIATIONS.md D1-D4). The formula kernel
// itself is covered by tests/unit/kernel-parity.test.js.
const FAIR = '[data-testid="dcf-fair-value"]'
const DISCOUNT = '.input-section'
const ICBC = publishedEntry('SHSE:601398')
const ICBC_VALUE = ICBC.value.toFixed(2)
const ICBC_USD = (ICBC.value * 0.14).toFixed(2)
const ICBC_PRICE = ICBC.price.toFixed(2)
const ICBC_EPS = ICBC.inputs.eps.toFixed(2)

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(FAIR)).toContainText(ICBC_VALUE, { timeout: 20000 })
})

test('D1: a zero discount rate stays a finite sum', async ({ page }) => {
  // The published v2 domain caps the effective terminal rate at −2% at zero discount.
  await page.getByTestId('advanced-assumptions').locator('summary').click()
  await page.getByRole('button', { name: '每股折现' }).click()
  await page.locator(DISCOUNT).first().fill('0')
  await page.locator(DISCOUNT).first().blur()
  await page.getByTestId('field-terminal-growth').fill('0')
  await page.getByTestId('field-terminal-growth').blur()
  await expect(page.locator(FAIR)).toContainText(`¥ ${ICBC_VALUE}`)
  await expect(page.getByTestId('dcf-trial-value')).toContainText('¥')
  await expect(page.getByTestId('dcf-trial-value')).not.toContainText(ICBC_VALUE)
  await expect(page.getByTestId('dcf-trial-value')).not.toContainText('Infinity')
  await expect(page.locator('.dcf__mos')).not.toContainText('Infinity')
})

test('D2: the discount rate is clamped into 0-50', async ({ page }) => {
  await page.locator(DISCOUNT).first().fill('80')
  await page.locator(DISCOUNT).first().blur()
  await expect(page.locator(DISCOUNT).first()).toHaveValue('50')
  await page.locator(DISCOUNT).first().fill('90')
  await page.locator(DISCOUNT).first().blur()
  await expect(page.locator(DISCOUNT).first()).toHaveValue('50')
})

test('D3: the stock page is the calculator, without the old tab strip', async ({ page }) => {
  await expect(page.locator('.ticker-tabs')).toHaveCount(0)
  await expect(page.locator('.dcf')).toBeVisible()
})

test('D5: a fallback source is announced, not silently used', async ({ page }) => {
  page.apiMock.down.add('eastmoney')
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('fv-cache')) localStorage.removeItem(key)
  })
  await page.goto('/#/stock/SHSE:601398/dcf')
  await page.reload()
  await expect(page.locator('.data-banner--published')).toBeVisible({ timeout: 25000 })
  await expect(page.locator('.data-banner')).toContainText('季度快照')
  await expect(page.locator('.stock-head h1')).toHaveText('工商银行')
})

test('a US quote and EDGAR fundamentals meet on one page', async ({ page }) => {
  await page.goto('/#/stock/NASDAQ:AAPL/dcf')
  await expect(page.locator('.stock-head h1')).toHaveText('Apple Inc.', { timeout: 25000 })
  await expect(page.locator('.dcf')).toContainText('$ 150.47')
})

test('D7: an unreachable source set says so instead of leaving a skeleton', async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  page.apiMock.down.add('eastmoney')
  page.apiMock.down.add('snapshot')
  await page.goto('/#/stock/SHSE:601398/dcf')
  await page.reload()
  const banner = page.locator('.data-banner--error')
  await expect(banner).toBeVisible({ timeout: 25000 })
  await expect(banner).toContainText('暂时无法获取估值数据')
  await expect(banner.locator('.banner-link')).toHaveCount(2)
  await page.locator('.header-actions a', { hasText: 'EN' }).click()
  await expect(banner).toContainText('Valuation data is temporarily unavailable')
  await expect(banner).toContainText('retry')
})

test('D6: the display currency converts results and says the inputs stay native', async ({ page }) => {
  await expect(page.locator(FAIR)).toContainText(`¥ ${ICBC_VALUE}`)
  await page.locator('.currency-select').click()
  await page.locator('.q-menu .q-item', { hasText: 'USD' }).click()
  await expect(page.locator(FAIR)).toContainText(`≈ $${ICBC_USD}`)
  await expect(page.locator('.dcf')).toContainText('输入仍为 ¥原币')
  // The editable rows keep the native currency.
  await expect(page.locator('.dcf')).toContainText(`¥ ${ICBC_EPS}`)
})

test('C: the quote editor stays in the native currency while converted values sit beside it', async ({ page }) => {
  await page.locator('.currency-select').click()
  await page.locator('.q-menu .q-item', { hasText: 'USD' }).click()
  const quote = page.getByRole('button', { name: /^参考报价/ })
  await expect(quote).toContainText(`¥ ${ICBC_PRICE}`)
  await expect(quote).toContainText('CNY')
  await expect(quote.locator('.edit-value__converted')).toContainText('≈ $')
  const margin = page.getByTestId('dcf-margin-of-safety')
  const marginBefore = await margin.innerText()
  await expect(page.locator(FAIR)).toContainText(`≈ $${ICBC_USD}`)
  await quote.click()
  const input = page.getByRole('spinbutton', { name: /参考报价/ })
  await expect(input).toHaveValue(String(ICBC.price))
  await input.fill('9')
  await page.keyboard.press('Enter')
  await expect(page.locator(FAIR)).toContainText(`≈ $${ICBC_USD}`)
  await expect(margin).not.toHaveText(marginBefore)
  await expect(quote).toContainText('¥ 9.00')
  await quote.click()
  await input.fill('')
  await page.keyboard.press('Enter')
  await expect(margin).toContainText('n/a')
  await expect(page.locator(FAIR)).toContainText(`≈ $${ICBC_USD}`)
})

test('quarterly snapshots answer as a fallback and carry their date', async ({ page }) => {
  await mockApi(page)
  page.apiMock.down.add('eastmoney')
  page.apiMock.down.add('edgar')
  await page.goto('/#/stock/SHSE:601398/dcf')
  // beforeEach already loaded this URL live and cached it. Drop the cache so the
  // snapshot (not the stale cache) is what answers, then reload into the downs.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('fv-cache')) localStorage.removeItem(key)
  })
  await page.reload()
  const banner = page.locator('.data-banner--published')
  await expect(banner).toBeVisible({ timeout: 25000 })
  await expect(banner).toContainText('季度快照')
  await expect(banner).toContainText('采集日 2026-09-30')
  await expect(page.locator('.stock-head h1')).toHaveText('工商银行')
})
