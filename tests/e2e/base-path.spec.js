import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

// The audited GitHub-Pages shape: the *built* bundle served by a static host
// from the project sub-path, with the direct transport baked in by
// scripts/build-base.mjs. Two regressions this file locks out:
//   - a hard-coded same-origin "/_api" (the static host has no /_api);
//   - an asset/route URL that ignores the project base and escapes /valueprobe/.
const ORIGIN = 'http://127.0.0.1:4173'
const BASE = ORIGIN + '/valueprobe/'

test.use({ baseURL: BASE })

test('the built app renders under /valueprobe/ without same-origin /_api calls', async ({ page, baseURL }) => {
  // `npx playwright test` does not start the preview server; the dedicated
  // command does (PW_BASE=1 adds it as a second webServer).
  if (process.env.PW_BASE !== '1') {
    const reachable = await fetch(baseURL, { signal: AbortSignal.timeout(5000) }).then((response) => response.ok).catch(() => false)
    test.skip(!reachable, 'no preview server on :4173 — run `PW_BASE=1 npx playwright test tests/e2e/base-path.spec.js`')
  }

  const requests = []
  page.on('request', (request) => requests.push(request.url()))
  await mockApi(page)
  // rehearse:pages builds this twice. VITE_SNAPSHOT=off publishes with no
  // provider at all, so that round cannot produce a fair value.
  const snapshotOff = process.env.REHEARSAL_SNAPSHOT === 'off'

  await page.goto('/valueprobe/#/stock/SHSE:601398/dcf')
  if (snapshotOff) {
    const banner = page.locator('.data-banner--error')
    await expect(banner).toBeVisible({ timeout: 20000 })
    await expect(banner).toContainText('所有数据源都失败')
    await expect(banner).not.toContainText('季度快照')
  } else {
    await expect(page.locator('.text-h6.button-font-weight')).toContainText('13.49', { timeout: 20000 })
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/base-path.png' })

  // The document itself was served from the project base and the router keeps
  // the hash route under it.
  const pageUrl = new URL(page.url())
  expect(pageUrl.origin).toBe(ORIGIN)
  expect(pageUrl.pathname).toBe('/valueprobe/')
  expect(pageUrl.hash).toBe('#/stock/SHSE:601398/dcf')

  const pathOf = (url) => new URL(url).pathname
  const local = requests.filter((url) => url.startsWith(ORIGIN + '/'))
  expect(local.length).toBeGreaterThan(0)
  // Every same-origin request (document, chunk, stylesheet, font, icon) sits
  // under the base path; nothing leaks to the site root.
  expect(local.filter((url) => !pathOf(url).startsWith('/valueprobe/'))).toEqual([])
  // The bundle really booted: a hashed chunk came from the base path.
  expect(local.some((url) => /^\/valueprobe\/assets\/.+\.js$/.test(pathOf(url)))).toBe(true)

  // The P1: no request may hit the static host's root for the API.
  expect(requests.filter((url) => url.startsWith(ORIGIN + '/_api/'))).toEqual([])
  expect(requests.some((url) => url.includes('eastmoney.com') || url.includes('sec.gov'))).toBe(false)
  const stockFile = requests.some((url) => url.includes('/valueprobe/data/SHSE-601398.json'))
  if (snapshotOff) expect(stockFile).toBe(false)
  else expect(stockFile).toBe(true)
})

test('the shell still opens with the network off', async ({ page, context, baseURL }) => {
  if (process.env.PW_BASE !== '1') test.skip(true, 'needs the preview build')
  let reachable = false
  for (let attempt = 0; attempt < 20 && !reachable; attempt++) {
    reachable = await fetch(baseURL, { signal: AbortSignal.timeout(5000) }).then((response) => response.ok).catch(() => false)
    if (!reachable) await page.waitForTimeout(500)
  }
  test.skip(!reachable, 'no preview server on :4173')

  await page.goto('/valueprobe/')
  await expect(page.locator('.home__hero')).toBeVisible({ timeout: 20000 })
  // Wait for the worker to control the page, then let it cache the assets it served.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page.locator('.home__hero')).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(1500)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.home__hero')).toBeVisible({ timeout: 20000 })
  await context.setOffline(false)
})
