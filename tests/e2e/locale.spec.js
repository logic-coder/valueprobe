import { expect, test } from '@playwright/test'

test.use({ locale: 'en-US' })

test('a first visit follows the browser language', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.locator('.home__hero')).toBeVisible()
  await expect(page).toHaveTitle(/Explore a stock's intrinsic value · valueprobe/)
  await expect(page.locator('.symbol-search input')).toHaveAttribute('aria-label', /search/i)
  await expect(page.locator('.home__title')).not.toContainText('内在价值')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('a junk stored value falls back instead of leaking keys', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('fv-locale', 'fr')
    window.localStorage.setItem('fv-theme', 'blue')
  })
  await page.goto('/#/')
  await expect(page.locator('.home__title')).toContainText('Explore a stock')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
})

test('an explicit switch still wins over the browser language', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('fv-locale', 'zh-hans'))
  await page.goto('/#/')
  await expect(page).toHaveTitle(/查看股票的内在价值/)
  await expect(page.locator('.home__title')).toContainText('内在价值')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-hans')
})

test('switches languages from the mobile display menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Display settings' }).click()
  await page.getByRole('button', { name: '简体中文' }).click()
  await expect(page).toHaveTitle(/查看股票的内在价值/)
})
