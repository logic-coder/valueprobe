import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

// The landing page presents one result preview and opens the calculator on demand.
test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  // Wait for the router to boot: a hash change fired before the initial navigation
  // settles gets overwritten back to "/".
  await expect(page.locator('.home__hero')).toBeVisible()
})

test('explains the tool and still renders the default example', async ({ page }) => {
  await expect(page.locator('.home__title')).toContainText('内在价值')
  await expect(page.locator('.home__lead')).toContainText('公司名或代码')
  const preview = page.getByTestId('home-valuation-preview')
  await expect(preview).toContainText('工商银行')
  await expect(preview).toContainText('SHSE:601398')
  await expect(page.locator('.site-footer')).toContainText('不构成投资建议')
  await expect(page.locator('.home__hero')).not.toContainText('内核')
  await expect(page.locator('.site-footer')).not.toContainText('内核')
  await expect(preview).toContainText('11.86', { timeout: 20000 })
  await expect(page.getByTestId('dcf')).toHaveCount(0)
  await expect(page.locator('.ticker')).toHaveCount(0)
  await expect(page.locator('.home__recent')).toHaveCount(0)
  await preview.getByRole('link', { name: '打开估值' }).click()
  await expect(page.getByTestId('dcf-fair-value')).toContainText('11.86')
})

test('lists a recently viewed symbol and clears it', async ({ page }) => {
  await page.goto('/#/stock/NYSE:KO/dcf')
  await expect(page).toHaveURL(/#\/stock\/NYSE:KO\/dcf$/)
  await expect(page.locator('.ticker__code')).toContainText('NYSE', { timeout: 20000 })
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('46.78', { timeout: 20000 })
  await page.goto('/#/')
  const recent = page.locator('.home__recent')
  await expect(recent).toContainText('接着看')
  await expect(recent.locator('.home__chip').first()).toHaveAttribute('href', '#/stock/NYSE:KO/dcf')
  await recent.locator('.home__chip').first().click()
  await expect(page).toHaveURL(/#\/stock\/NYSE:KO\/dcf$/)
  await page.goto('/#/')
  await page.locator('button.home__clear').click()
  await expect(page.locator('.home__recent')).toHaveCount(0)
})

test('puts a starred stock ahead of the recents', async ({ page }) => {
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.star-button')).toBeVisible({ timeout: 20000 })
  await page.locator('.star-button').click()
  await page.goto('/#/')
  const card = page.locator('.home__recent')
  await expect(card.locator('.home__chip').first()).toHaveAttribute('href', '#/stock/SHSE:601398/dcf')
  await expect(card.locator('.home__chip').first().locator('.home__star')).toHaveCount(1)
  await expect(card.locator('.home__clear', { hasText: '全部自选' })).toHaveAttribute('href', '#/watchlist')
})

test('opens an example from the hero', async ({ page }) => {
  const links = page.locator('.home__examples a')
  await expect(links).toHaveCount(3)
  const symbol = await links.first().getAttribute('data-symbol')
  await links.first().click()
  await expect(page).toHaveURL(new RegExp('#/stock/' + symbol + '/dcf$'))
  await expect(page.locator('.text-h6.button-font-weight')).toHaveText(/(?:HK|US)?\$ ?[\d.,]+|¥ ?[\d.,]+/, { timeout: 20000 })
  await expect(page.locator('.stock-head h1')).toBeVisible()
})

test('focuses stock search and opens valuation methodology', async ({ page }) => {
  await page.locator('.home__chip--primary').click()
  await expect(page.locator('.symbol-search input')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.locator('.home__method').click()
  await expect(page).toHaveURL(/#\/method$/)
})
