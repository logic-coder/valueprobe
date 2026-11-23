import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

// The route is /stock/:symbol/dcf over a market whitelist.
test('renders a US ticker from the route', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/NASDAQ:AAPL/dcf')
  await expect(page.locator('.stock-head h1')).toHaveText('Apple Inc.', { timeout: 20000 })
  await expect(page.locator('.stock-head')).toContainText('NASDAQ')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('$')
})

test('falls back to the not-found page for an unknown market', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/XXXX:FOO/dcf')
  await expect(page.locator('text=找不到这个代码')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('text=支持的交易所')).toContainText('NASDAQ')
  await expect(page.locator('.nf__try a')).toHaveCount(4)
  await page.locator('.nf__try a', { hasText: '苹果' }).click()
  await expect(page).toHaveURL(/#\/stock\/NASDAQ:AAPL\/dcf$/)
  await expect(page.locator('.stock-head h1')).toHaveText('Apple Inc.', { timeout: 20000 })
})

test('falls back to the not-found page for an unrelated path', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/nope/whatever')
  await expect(page.locator('text=找不到这个代码')).toBeVisible({ timeout: 15000 })
})

test('the header lookup navigates to a typed ticker', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('10.76', { timeout: 20000 })
  await page.locator('.symbol-search input').fill('nasdaq:aapl')
  await page.locator('.symbol-search input').press('Enter')
  await expect(page).toHaveURL(/#\/stock\/NASDAQ:AAPL\/dcf$/)
  await expect(page.locator('.stock-head h1')).toHaveText('Apple Inc.', { timeout: 20000 })
  // The old symbol's figures must not survive the swap.
  await expect(page.locator('.dcf')).toContainText('$ 179.75')
  await expect(page.locator('.dcf')).toContainText('$ 351.91')
  await expect(page.locator('.dcf')).not.toContainText('¥ 1.08')
})

test('the header lookup guesses the market of a bare code', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/NASDAQ:AAPL/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('$', { timeout: 20000 })
  await page.locator('.symbol-search input').fill('601398')
  await page.locator('.symbol-search input').press('Enter')
  await expect(page).toHaveURL(/#\/stock\/SHSE:601398\/dcf$/)
  await page.locator('.symbol-search input').fill('0700')
  await page.locator('.symbol-search input').press('Enter')
  await expect(page).toHaveURL(/#\/stock\/HKSE:00700\/dcf$/)
})

test('the slash key jumps to the lookup', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.locator('.home__hero')).toBeVisible()
  await page.keyboard.press('/')
  await expect(page.locator('.symbol-search input')).toBeFocused()
  await page.locator('.symbol-search input').fill('a/')
  await expect(page.locator('.symbol-search input')).toHaveValue('a/')
})

test('the header lookup reports a bad symbol', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('10.76', { timeout: 20000 })
  await page.locator('.symbol-search input').fill('not a code!')
  await page.locator('.symbol-search input').press('Enter')
  await expect(page.locator('text=格式：交易所')).toBeVisible()
  await expect(page).toHaveURL(/#\/stock\/SHSE:601398\/dcf$/)
})

test.describe('touch search', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('tapping a matching company opens it without keyboard confirmation', async ({ page }) => {
    const input = page.getByRole('combobox', { name: '查询股票' })
    await page.goto('/#/')
    await input.fill('腾讯')
    await page.getByRole('option', { name: /腾讯控股.*00700/ }).tap()
    await expect(page).toHaveURL(/#\/stock\/HKSE:00700\/dcf$/)
    await expect(input).toHaveValue('')
  })
})

test('exact ticker wins and a shared name needs an explicit listing', async ({ page }) => {
  await page.goto('/#/')
  const input = page.getByRole('combobox', { name: '查询股票' })
  await input.fill('V')
  await expect(page.locator('#stock-search-results [role=option]').first()).toContainText('V · NYSE')
  await input.press('Enter')
  await expect(page).toHaveURL(/#\/stock\/NYSE:V\/dcf$/)
  await input.fill('IBM')
  await input.press('Enter')
  await expect(page).toHaveURL(/#\/stock\/NYSE:IBM\/dcf$/)
  await input.fill('工商银行')
  await expect(page.locator('#stock-search-results [role=option]')).toHaveCount(2)
  await input.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: '请选择要打开的证券' })).toBeVisible()
  await input.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'stock-search-result-0')
  await input.press('Escape')
  await expect(input).toHaveValue('工商银行')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(page).toHaveURL(/#\/stock\/HKSE:01398\/dcf$/)
})

test('an IME confirmation keeps search open and normalizes full-width ticker input', async ({ page }) => {
  await page.goto('/#/')
  const input = page.getByRole('combobox', { name: '查询股票' })
  await input.fill('ＮＡＳＤＡＱ：ＡＡＰＬ')
  await expect(page.getByRole('option', { name: /苹果.*AAPL/ })).toBeVisible()
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await expect(page).toHaveURL(/#\/$/)
  await input.press('Enter')
  await expect(page).toHaveURL(/#\/stock\/NASDAQ:AAPL\/dcf$/)
  await input.fill('Apple')
  await expect(page.getByRole('option', { name: /苹果.*AAPL/ })).toBeVisible()
  await input.press('Enter')
  await expect(input).toHaveValue('')
})
