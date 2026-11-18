import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('10.26', { timeout: 20000 })
})

test('suggests symbols while typing', async ({ page }) => {
  const input = page.locator('.symbol-search input')
  await expect(input).toHaveAttribute('list', 'symbol-suggestions')
  await expect(page.locator('#symbol-suggestions option')).toHaveCount(4)
  const values = await page.locator('#symbol-suggestions option').evaluateAll((nodes) => nodes.map((node) => node.value).sort())
  expect(values).toEqual(['HKSE:00700', 'HKSE:00941', 'NASDAQ:AAPL', 'SHSE:601398'])
})

test('prints the valuation without the chrome', async ({ page }) => {
  await expect(page.locator('.print-button')).toHaveCount(1)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.site-header')).toBeHidden()
  await expect(page.locator('.site-footer')).toBeHidden()
  await expect(page.locator('.dcf__fair')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
  await expect(page.locator('.site-header')).toBeVisible()
})

test('prints a comparison without the add row', async ({ page }) => {
  await page.goto('/#/compare?s=SHSE:601398,NASDAQ:AAPL')
  await expect(page.locator('.cmp__table tbody tr')).toHaveCount(2, { timeout: 20000 })
  await expect(page.locator('.print-button')).toHaveCount(1)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.cmp__add')).toBeHidden()
  await expect(page.locator('.cmp__table')).toBeVisible()
})

test('leaves the landing page without a print button', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.locator('.home__hero')).toBeVisible()
  await expect(page.locator('.print-button')).toHaveCount(0)
})
