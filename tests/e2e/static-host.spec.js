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
  await expect(page.locator('.about')).toContainText('数据来源')
  await expect(page.locator('.about')).not.toContainText(/CORS|User-Agent|\.env/)

  await page.goto('/valueprobe/#/stock/SHSE:601398/dcf')
  const banner = page.locator('.data-banner')
  await expect(banner).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('dcf-fair-value')).toContainText('10.68')
  if (snapshot === 'off') {
    await expect(banner).toContainText('暂时无法获取估值数据')
    await expect(banner).not.toContainText('季度快照')
  } else {
    await expect(page.locator('.text-h6.button-font-weight')).toContainText('¥')
    await expect(banner).toContainText('季度快照')
    await expect(banner).toContainText('采集日')
  }
})
