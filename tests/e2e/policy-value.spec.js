import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'
import { STOCK } from './support/pages/stock'

const here = dirname(fileURLToPath(import.meta.url))
const readJson = (relative) => JSON.parse(readFileSync(resolve(here, relative), 'utf8'))

// The committed release under test, read from disk: the spec never hard-codes
// the number it expects the screen to show.
const artifact = readJson('../../public/data/intrinsic/v1.json')
const snapshot = readJson('../../public/data/SHSE-601398.json')
const ENTRY = artifact.entries['SHSE:601398']

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('shows the published value with provenance when the snapshot is from another release', async ({ page }) => {
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(STOCK.fairValue)).toContainText('11.99', { timeout: 20000 })

  const policy = page.locator(STOCK.policyValue)
  await expect(policy).toBeVisible({ timeout: 20000 })
  await expect(policy).toHaveAttribute('data-policy-version', artifact.policyVersion)
  await expect(page.getByTestId('policy-artifact-value')).toContainText(ENTRY.value.toFixed(2))

  // The bundled e2e snapshot (2026-09-30) is not the release the committed
  // artifact was built from (2026-11-18): the value is still shown, the
  // provenance is disclosed, and the artifact's own margin is not reused.
  await expect(page.getByTestId('policy-provenance')).toBeVisible()
  await expect(page.getByTestId('policy-margin')).toHaveCount(0)
  await expect(page.getByTestId('policy-not-in-universe')).toHaveCount(0)
})

test('pins the quarterly snapshot and shows the matching published value', async ({ page }) => {
  // Serve the committed snapshot for this symbol, so the screen and the
  // committed artifact share one as_of date (the shared fixture is a different
  // quarter). Routes registered last win over mockApi's generic data handler.
  await page.route('**/data/SHSE-601398.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(snapshot),
  }))
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(STOCK.fairValue)).toBeVisible({ timeout: 20000 })

  // Pin the source from the calculator menu, the way a user forces the file.
  await page.locator('.dcf .q-btn:has-text("more_vert")').first().click()
  await page.locator('.q-menu .q-item', { hasText: '季度快照' }).click()
  await expect(page.locator('.data-banner')).toContainText('季度快照', { timeout: 20000 })

  const policy = page.locator(STOCK.policyValue)
  await expect(policy).toBeVisible({ timeout: 20000 })
  await expect(policy).toHaveAttribute('data-policy-version', artifact.policyVersion)
  await expect(page.getByTestId('policy-title')).toContainText('公开口径 ' + artifact.policyVersion)
  await expect(page.getByTestId('policy-asof')).toContainText(ENTRY.asOf)
  await expect(page.getByTestId('policy-artifact-value')).toContainText(ENTRY.value.toFixed(2))
  await expect(page.getByTestId('policy-band')).toBeVisible()
  await expect(page.getByTestId('policy-margin')).toBeVisible()
  await expect(page.getByTestId('policy-provenance')).toHaveCount(0)
})
