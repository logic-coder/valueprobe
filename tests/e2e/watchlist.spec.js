import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

const FAIR = '[data-testid="dcf-fair-value"]'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(FAIR)).toContainText('10.68', { timeout: 20000 })
})

test('stars a stock, lists it, keeps it across a reload and removes it', async ({ page }) => {
  const star = page.locator('.star-button')
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.watch-link__count')).toHaveText('1')

  await page.locator('.watch-link').click()
  await expect(page.locator('.wl__table tbody tr')).toHaveCount(1)
  await expect(page.locator('.wl__table tbody tr')).toContainText('SHSE:601398')
  await expect(page.locator('.wl__table tbody tr')).toContainText('¥ 10.68')
  await expect(page.locator('.wl__table tbody tr')).toContainText('13.86%')

  await page.reload()
  await expect(page.locator('.wl__table tbody tr')).toHaveCount(1)

  await page.locator('.wl__remove').click()
  await expect(page.locator('.watchlist .muted')).toContainText('还没有自选股')
  await expect(page.locator('.watch-link__count')).toHaveCount(0)
})

test('shows an empty state that links back', async ({ page }) => {
  await page.goto('/#/watchlist')
  await expect(page.locator('.watchlist .muted')).toContainText('还没有自选股')
  await expect(page.locator('.ticker')).toHaveCount(0)
  await page.locator('.watchlist .muted a').click()
  await expect(page.getByTestId('home-valuation-preview')).toContainText('10.68', { timeout: 20000 })
})

test('exports the list and imports it back', async ({ page }) => {
  await page.locator('.star-button').click()
  await page.locator('.watch-link').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.wl__tool', { hasText: '导出 JSON' }).click(),
  ])
  const json = await readFile(await download.path(), 'utf8')
  expect(JSON.parse(json).symbols).toEqual(['SHSE:601398'])

  await page.locator('.wl__remove').click()
  await expect(page.locator('.watchlist .muted')).toContainText('还没有自选股')
  await page.locator('.wl__tool input[accept*=json]').setInputFiles({ name: 'list.json', mimeType: 'application/json', buffer: Buffer.from(json) })
  await expect(page.locator('.wl__table tbody tr')).toHaveCount(1)
  await expect(page.locator('.q-notification', { hasText: '已导入' })).toContainText('1 支')

  // A file with no usable symbols says so instead of "0 imported".
  await page.locator('.wl__remove').click()
  await page.locator('.wl__tool input[accept*=json]').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('{"symbols":[]}') })
  await expect(page.locator('.q-notification').last()).toContainText('没有可导入的代码')
  await page.locator('.wl__tool input[accept*=json]').setInputFiles({ name: 'list.json', mimeType: 'application/json', buffer: Buffer.from(json) })
  await expect(page.locator('.wl__table tbody tr')).toHaveCount(1)

  // A spreadsheet column is the other realistic way a list arrives.
  await page.locator('.wl__remove').click()
  await page.locator('.wl__csv').setInputFiles({ name: 'list.csv', mimeType: 'text/csv', buffer: Buffer.from('symbol\nSHSE:601398\nhkse:0700\n') })
  await expect(page.locator('.wl__table tbody tr')).toHaveCount(2)
  await expect(page.locator('.wl__table tbody')).toContainText('HKSE:00700')
})

test('distinguishes an unverified quote date from the snapshot date', async ({ page }) => {
  // Every committed quote now carries a trading date, so simulate the legacy
  // snapshot at the release boundary: same price, no quote date.
  await page.route('**/data/valuation/**/HKSE-00700.json', async route => {
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({ response, body: JSON.stringify({ ...body, entry: { ...body.entry, priceDate: null } }) })
  })
  await page.addInitScript(() => window.localStorage.setItem('fv-watchlist', JSON.stringify(['HKSE:00700'])))
  page.apiMock.down.add('eastmoney')
  await page.goto('/#/watchlist')
  await page.reload()
  await expect(page.locator('.wl__table tbody tr')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.wl__asof')).toHaveText('快照报价 · 交易日未核实')
})

test('preserves the published estimate when individual sources fail', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('fv-watchlist', JSON.stringify(['NASDAQ:AAPL'])))
  page.apiMock.fail = true
  await page.goto('/#/watchlist')
  await page.reload() // the init script only runs in a fresh document
  await expect(page.locator('.wl__table tbody tr')).toContainText('150.47')
  await expect(page.locator('.wl__failed')).toHaveCount(0)
})

test('opens a watched stock from the list', async ({ page }) => {
  await page.locator('.star-button').click()
  await page.locator('.watch-link').click()
  await page.locator('.wl__table tbody th a').click()
  await expect(page).toHaveURL(/SHSE:601398/)
  await expect(page.locator(FAIR)).toContainText('10.68', { timeout: 20000 })
})
