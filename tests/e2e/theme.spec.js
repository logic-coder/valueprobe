import { expect, test } from '@playwright/test'

test('paints the saved dark theme before the app mounts', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('fv-theme', 'dark'))
  await page.goto('/#/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})

test('toggles the theme and remembers it', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await page.locator('.theme-button').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.locator('.theme-button').click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
})
