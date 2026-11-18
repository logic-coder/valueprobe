import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

const MOS = '.cmp__table tbody tr td:nth-child(4)'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('compares two symbols, best margin of safety first', async ({ page }) => {
  await page.goto('/#/compare?s=SHSE:601398,NASDAQ:AAPL')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(2, { timeout: 20000 })
  const values = await page.locator(MOS).allTextContents()
  const numbers = values.map((text) => parseFloat(text))
  expect(numbers.every((value) => Number.isFinite(value))).toBe(true)
  expect(numbers[0]).toBeGreaterThanOrEqual(numbers[1])
  await expect(page.locator('.cmp__best')).toHaveCount(1)
})

test('adds a symbol from the input and drops one from its row', async ({ page }) => {
  await page.goto('/#/compare?s=SHSE:601398')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(1, { timeout: 20000 })
  await page.locator('.cmp__add input').fill('hkse:0700')
  await page.locator('.cmp__add input').press('Enter')
  await expect(page).toHaveURL(/s=SHSE:601398,HKSE:00700/)
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(2)
  await expect(page.locator('.cmp__table tbody')).toContainText('HKSE:00700')
  await page.locator('.cmp__table tbody tr').first().locator('.wl__remove').click()
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(1)
})

test('offers a retry when the quotes fail', async ({ page }) => {
  page.apiMock.fail = true
  await page.goto('/#/compare?s=NASDAQ:AAPL')
  await expect(page.locator('.cmp__failed')).toBeVisible({ timeout: 20000 })
  page.apiMock.fail = false
  await page.locator('.cmp__failed button').click()
  await expect(page.locator('.cmp__failed')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.cmp__table tbody tr')).toContainText('$')
})

test('reaches the page from the header icon', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.locator('.home__hero')).toBeVisible()
  await page.locator('.compare-link').click()
  await expect(page).toHaveURL(/#\/compare$/)
  await expect(page.locator('.compare .muted')).toContainText('还没有比较的标的')
})

test('queues a stock from its header and restores the queue', async ({ page }) => {
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('11.99', { timeout: 20000 })
  await page.locator('.compare-button').click()
  await expect(page.locator('.compare-button')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.compare-link')).toHaveAttribute('href', /SHSE:601398/)
  await page.locator('.compare-link').click()
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(1, { timeout: 20000 })
  // A bare /compare picks the queue back up.
  await page.goto('/#/compare')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(1, { timeout: 20000 })
})

test('shows an empty state without symbols', async ({ page }) => {
  await page.goto('/#/compare')
  await expect(page.locator('.compare .muted')).toContainText('还没有比较的标的')
  await expect(page.locator('.ticker')).toHaveCount(0)
})

test('accepts a bare code in the add field', async ({ page }) => {
  await page.goto('/#/compare?s=SHSE:601398')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(1, { timeout: 20000 })
  await expect(page.locator('.cmp__add input')).toHaveAttribute('list', 'symbol-suggestions')
  await page.locator('.cmp__add input').fill('0700')
  await page.locator('.cmp__add input').press('Enter')
  await expect(page).toHaveURL(/s=SHSE:601398,HKSE:00700/)
  await expect(page.locator('.cmp__table tbody')).toContainText('HKSE:00700')
})

test('explains a bad or duplicate add', async ({ page }) => {
  await page.goto('/#/compare?s=SHSE:601398')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(1, { timeout: 20000 })
  await page.locator('.cmp__add input').fill('FOO:BAR')
  await page.locator('.cmp__add input').press('Enter')
  await expect(page.locator('.q-notification').last()).toContainText('没认出')
  await page.locator('.cmp__add input').fill('SHSE:601398')
  await page.locator('.cmp__add input').press('Enter')
  await expect(page.locator('.q-notification').last()).toContainText('已经在比较里')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(1)
})

test('copies the comparison link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#/compare?s=SHSE:601398,NASDAQ:AAPL')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(2, { timeout: 20000 })
  await page.locator('.wl__tool', { hasText: '复制比较链接' }).click()
  await expect(page.locator('.q-notification')).toContainText('链接已复制')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('compare?s=SHSE:601398,NASDAQ:AAPL')
})

test('links from a watchlist of two', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('fv-watchlist', JSON.stringify(['SHSE:601398', 'NASDAQ:AAPL'])))
  await page.goto('/#/watchlist')
  await page.locator('.wl__tool', { hasText: '并排比较' }).click()
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(2, { timeout: 20000 })
})
