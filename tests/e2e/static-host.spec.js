import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

// Runs only from scripts/rehearse-pages.mjs, which builds both variants and tells
// this file which one is being served. Two things must hold either way: the app
// works without any same-origin API, and an unreachable primary source degrades
// through the remaining providers instead of a blank page.
const ORIGIN = 'http://127.0.0.1:4173'
const BASE = ORIGIN + '/valueprobe/'
const snapshot = process.env.REHEARSAL_SNAPSHOT || 'on'

test.use({ baseURL: BASE })

test('the build degrades through its sources with the snapshot ' + snapshot, async ({ page }) => {
  test.skip(!process.env.REHEARSAL_SNAPSHOT, 'run through npm run rehearse:pages')
  await mockApi(page)

  await page.goto('/valueprobe/#/about')
  const providers = page.locator('.ds-order__list li')
  await expect(providers).toHaveCount(snapshot === 'off' ? 0 : 1)
  if (snapshot === 'off') await expect(page.locator('.ds-order__list')).not.toContainText('季度快照')
  else await expect(page.locator('.ds-order__list')).toContainText('季度快照')

  await page.goto('/valueprobe/#/stock/SHSE:601398/dcf')
  const banner = page.locator('.data-banner')
  await expect(banner).toBeVisible({ timeout: 30000 })
  if (snapshot === 'off') {
    await expect(banner).toContainText('所有数据源都失败')
    await expect(banner).not.toContainText('季度快照')
  } else {
    await expect(page.locator('.text-h6.button-font-weight')).toContainText('¥')
    await expect(banner).toContainText('季度快照')
    await expect(banner).toContainText('数据截至')
  }
})
