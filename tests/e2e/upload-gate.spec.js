import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

// The deploy-only gate: runs in CI after `npm run build`, against the exact
// dist that is about to be uploaded, served under /valueprobe/ by vite preview.
// PW_DIST keeps the full PR suite on the dev server instead.
const BASE = 'http://127.0.0.1:4173/valueprobe/'
const DIST = process.env.UPLOAD_DIST || 'dist'
const STOCK = '/valueprobe/#/stock/SHSE:601398/dcf'

test.use({ baseURL: BASE })

test.beforeEach(async ({ page }) => {
  expect(process.env.PW_DIST, 'run npm run test:e2e:upload against a built dist').toBe('1')
  await mockApi(page)
})

// The expected number comes from the artifact this build emits, so a policy
// change does not need a spec edit.
function published () {
  const meta = JSON.parse(readFileSync(resolve(DIST, 'data/valuation/meta.json'), 'utf8'))
  const detail = JSON.parse(readFileSync(resolve(DIST, 'data/valuation', meta.release, 'SHSE-601398.json'), 'utf8'))
  expect(detail.release).toBe(meta.release)
  return { release: meta.release, value: Number(detail.entry.value) }
}

test('boots from the production sub-path and renders the published value', async ({ page }) => {
  const requests = []
  page.on('request', (request) => requests.push(request.url()))

  await page.goto('/valueprobe/#/')
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: 30000 })

  const expected = published()
  await page.goto(STOCK)
  await expect(page.getByTestId('dcf-fair-value')).toContainText(expected.value.toFixed(2), { timeout: 30000 })

  const pageUrl = new URL(page.url())
  expect(pageUrl.pathname).toBe('/valueprobe/')
  expect(pageUrl.hash).toBe('#/stock/SHSE:601398/dcf')

  const local = requests.filter((url) => url.startsWith(pageUrl.origin + '/'))
  expect(local.length).toBeGreaterThan(0)
  // Every same-origin asset sits under the base; nothing leaks to the site root.
  expect(local.filter((url) => !new URL(url).pathname.startsWith('/valueprobe/'))).toEqual([])
  expect(local.some((url) => /^\/valueprobe\/assets\/.+\.js$/.test(new URL(url).pathname))).toBe(true)
  // The static host has no /_api: the published build must not call one.
  expect(requests.filter((url) => url.startsWith(pageUrl.origin + '/_api/'))).toEqual([])
  // The rendered number was loaded from this build's own artifact.
  expect(local.some((url) => url.includes('/data/valuation/' + expected.release + '/SHSE-601398.json'))).toBe(true)
})

test('header search opens a US ticker', async ({ page }) => {
  await page.goto(STOCK)
  await expect(page.getByTestId('dcf-fair-value')).toContainText('¥', { timeout: 30000 })
  const input = page.getByRole('combobox', { name: '查询股票' })
  await input.fill('NASDAQ:AAPL')
  await input.press('Enter')
  await expect(page).toHaveURL(/#\/stock\/NASDAQ:AAPL\/dcf$/)
  await expect(page.getByRole('heading', { name: /苹果|Apple Inc\./ })).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('AAPL · NASDAQ')).toBeVisible()
  await expect(page.getByTestId('dcf-fair-value')).toContainText('$', { timeout: 30000 })
})

test('industry trials stay out of published margins and highlighting', async ({ page }) => {
  await page.route('**/data/NYSE-PSX.json', route => route.continue())
  await page.addInitScript(() => localStorage.setItem('fv-watchlist', JSON.stringify(['NYSE:PSX'])))
  await page.goto('/valueprobe/#/watchlist')
  const watched = page.locator('.wl__table tbody tr').filter({ hasText: 'NYSE:PSX' })
  await expect(watched).toContainText('仅试算')
  await expect(watched.getByRole('cell', { name: 'n/a', exact: true }).first()).toBeVisible()
  await page.goto('/valueprobe/#/compare?s=NYSE:PSX,SHSE:601398')
  const psx = page.locator('.cmp__table tbody tr').filter({ hasText: 'NYSE:PSX' })
  await expect(psx).toContainText('仅试算')
  await expect(psx.locator('.cmp__best')).toHaveCount(0)
  await expect(psx.getByRole('cell', { name: 'n/a', exact: true }).first()).toBeVisible()
  await psx.getByRole('link').click()
  await expect(page.getByTestId('official-unavailable')).toContainText('仅供试算')
  await expect(page.getByTestId('reverse-growth')).toContainText('开始试算后可查看隐含增速')
  await expect(page.getByTestId('dcf-fair-value')).toContainText('n/a')
  await expect(page.getByTestId('margin-stress')).toHaveCount(0)
  await page.getByRole('button', { name: '开始试算', exact: true }).click()
  await expect(page.getByTestId('dcf-fair-value')).toContainText('$')
  await expect(page.getByTestId('value-title')).toContainText('试算')
})

test('the stock page has no serious axe violations', async ({ page }) => {
  await page.goto(STOCK)
  await expect(page.getByTestId('dcf-fair-value')).toContainText('¥', { timeout: 30000 })
  await page.waitForTimeout(800)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = violations.filter((item) => ['serious', 'critical'].includes(item.impact))
  expect(bad.map((item) => item.id + ' ' + (item.nodes[0]?.target || []).join(' '))).toEqual([])
})
