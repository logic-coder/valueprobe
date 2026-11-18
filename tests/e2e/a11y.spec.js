import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

// Keyboard first: the skip link must be the first stop, land on the content, and
// the custom controls must keep a visible focus ring. The result strip is a live
// region so a recalculation is announced instead of silently changing.

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator('.text-h6.button-font-weight')).toContainText('10.26', { timeout: 20000 })
})

test('the skip link comes first and moves focus to the content', async ({ page }) => {
  await page.keyboard.press('Tab')
  await expect(page.locator('.skip-link')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('custom controls show a focus ring', async ({ page }) => {
  await page.keyboard.press('Tab')
  await page.locator('.dcf__share-btn').evaluate((element) => element.focus())
  const outline = await page.locator('.dcf__share-btn').evaluate((element) => getComputedStyle(element).outlineStyle)
  expect(outline).not.toBe('none')
})

test('the result is announced through a debounced live region', async ({ page }) => {
  const live = page.locator('.sr-only[aria-live="polite"]')
  await expect(live).toHaveAttribute('role', 'status')
  await page.locator('.input-section').first().fill('15')
  await expect(live).toContainText('¥ 9.21', { timeout: 3000 })
  // Typing on: the announcement keeps up with the last value, not every keystroke.
  await page.locator('.input-section').first().fill('10')
  await expect(live).toContainText('¥', { timeout: 3000 })
  await expect(live).not.toContainText('9.38')
})
