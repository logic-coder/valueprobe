import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'

const PAGES = [
  { path: '/#/', wait: '.home__hero' },
  { path: '/#/stock/SHSE:601398/dcf', wait: '[data-testid="dcf-fair-value"]' },
  { path: '/#/watchlist', wait: '.watchlist' },
  { path: '/#/compare?s=SHSE:601398,NASDAQ:AAPL', wait: '.cmp__table, .compare .muted' },
  { path: '/#/about', wait: '.about__title' },
  { path: '/#/stock/BAD', wait: '.notfound__title' },
]

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('no serious axe violations on the stock page in dark', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('fv-theme', 'dark'))
  await page.goto('/#/stock/SHSE:601398/dcf')
  await page.locator('[data-testid="dcf-fair-value"]').waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = result.violations.filter((item) => ['serious', 'critical'].includes(item.impact))
  expect(bad.map((item) => item.id + ' ' + (item.nodes[0]?.target || []).join(' '))).toEqual([])
})

test('no serious axe violations on the 404 page in dark', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('fv-theme', 'dark'))
  await page.goto('/#/stock/BAD')
  await page.locator('.notfound__title').waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = result.violations.filter((item) => ['serious', 'critical'].includes(item.impact))
  expect(bad.map((item) => item.id + ' ' + (item.nodes[0]?.target || []).join(' '))).toEqual([])
})

for (const target of PAGES) {
  test('no serious axe violations on ' + target.path, async ({ page }) => {
    await page.goto(target.path)
    await page.locator(target.wait).first().waitFor({ timeout: 20000 })
    await page.waitForTimeout(800)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const bad = result.violations.filter((item) => ['serious', 'critical'].includes(item.impact))
    expect(bad.map((item) => item.id + ' ' + (item.nodes[0]?.target || []).join(' '))).toEqual([])
  })
}
