import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'
import { STOCK } from './support/pages/stock'

const FAIR = STOCK.fairValue
const VIEWPORTS = [
  { width: 1440, height: 900, fair: 48, mos: 24, quote: 26 },
  { width: 900, height: 900, fair: 42, mos: 24, quote: 22 },
  { width: 390, height: 844, fair: 36, mos: 22, quote: 22 },
]

async function overflowX (locator) {
  return locator.evaluate((element) => element.scrollWidth - element.clientWidth)
}

function typography (locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      fontSize: parseFloat(style.fontSize),
      fontWeight: String(style.fontWeight),
      lineHeight: style.lineHeight,
      lineHeightPx: parseFloat(style.lineHeight),
    }
  })
}

async function shotDir () {
  const dir = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'vp-typography')
  await mkdir(dir, { recursive: true })
  return dir
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(FAIR)).toContainText('10.68', { timeout: 20000 })
})

test('keeps the default price as the typographic anchor at each viewport', async ({ page }) => {
  const out = await shotDir()

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await expect(page.locator(FAIR)).toContainText('10.68')
    await expect(page.locator(FAIR)).not.toHaveClass(/text-h6/)

    const fair = await typography(page.locator(FAIR))
    expect(fair.fontSize).toBe(viewport.fair)
    expect(fair.fontWeight).toBe('700')
    expect(fair.lineHeightPx).toBeCloseTo(viewport.fair * 1.05, 1)

    const mos = await typography(page.getByTestId('dcf-margin-of-safety'))
    expect(mos.fontSize).toBe(viewport.mos)
    expect(mos.fontWeight).toBe('700')

    const eps = await typography(page.locator('.dcf__value--eps .edit-value'))
    expect(eps.fontSize).toBe(28)
    expect(eps.fontWeight).toBe('650')
    const epsText = await typography(page.locator('.dcf__value--eps .edit-value__text'))
    expect(epsText.fontSize).toBe(28)
    const code = page.locator('.dcf__value--eps .edit-value__code')
    await expect(code).toBeVisible()
    const codeStyle = await typography(code)
    expect(codeStyle.fontSize).toBeCloseTo(12.88, 1)
    expect(codeStyle.fontSize).toBeLessThan(eps.fontSize * 0.6)
    const icon = await typography(page.locator('.dcf__value--eps .edit-value__icon'))
    expect(icon.fontSize).toBeCloseTo(14, 1)
    expect(icon.fontSize).toBeLessThan(eps.fontSize * 0.6)

    const discount = await typography(page.getByTestId('field-discount'))
    expect(discount.fontSize).toBe(18)
    expect(discount.fontWeight).toBe('600')
    const growth = await typography(page.getByTestId('field-growth'))
    expect(growth.fontSize).toBe(18)
    expect(growth.fontWeight).toBe('600')

    const quote = page.locator('.ticker__quote')
    const quoteStyle = await typography(quote)
    expect(quoteStyle.fontSize).toBe(viewport.quote)
    expect(quoteStyle.fontSize).toBeLessThan(28)
    const quoteIcon = quote.locator('.edit-value__icon')
    await expect(quoteIcon).toBeVisible()
    const quoteIconStyle = await typography(quoteIcon)
    expect(quoteIconStyle.fontSize).toBeCloseTo(viewport.quote * 0.5, 1)
    expect(quoteIconStyle.fontSize).toBeLessThan(quoteStyle.fontSize)
    const quoteCode = quote.locator('.edit-value__code')
    if (await quoteCode.count()) {
      const quoteCodeStyle = await typography(quoteCode)
      expect(quoteCodeStyle.fontSize).toBeCloseTo(viewport.quote * 0.46, 1)
      expect(quoteCodeStyle.fontSize).toBeLessThan(quoteStyle.fontSize)
    }

    const maxNumeric = await page.evaluate(() => {
      let max = 0
      for (const element of document.querySelectorAll('body *')) {
        if (!/\d/.test(element.textContent || '')) continue
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
        const size = parseFloat(style.fontSize)
        if (size > max) max = size
      }
      return max
    })
    expect(fair.fontSize).toBe(maxNumeric)
    expect(fair.fontSize).toBeGreaterThan(eps.fontSize)
    expect(fair.fontSize).toBeGreaterThan(mos.fontSize)

    const strip = page.getByTestId('dcf-result')
    expect(await overflowX(strip)).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('dcf-fair-range')).toContainText('区间')
    const fairBox = await page.locator(FAIR).boundingBox()
    const rangeBox = await page.getByTestId('dcf-fair-range').boundingBox()
    const mosBox = await page.getByTestId('dcf-margin-of-safety').boundingBox()
    const titleBox = await page.getByTestId('value-title').boundingBox()
    const contextBox = await page.getByTestId('value-context').boundingBox()
    const basisBox = await page.getByTestId('value-basis-line').boundingBox()
    expect(fairBox).toBeTruthy()
    expect(rangeBox).toBeTruthy()
    expect(mosBox).toBeTruthy()
    expect(mosBox.y).toBeGreaterThan(fairBox.y + fairBox.height - 2)
    if (viewport.width >= 900) {
      expect(contextBox.x).toBeGreaterThan(titleBox.x + titleBox.width - 2)
      expect(contextBox.y).toBeLessThan(titleBox.y + titleBox.height)
      expect(contextBox.y + contextBox.height).toBeGreaterThan(titleBox.y)
      expect(rangeBox.x).toBeGreaterThan(fairBox.x + fairBox.width - 2)
      expect(basisBox.x).toBeGreaterThan(fairBox.x + fairBox.width - 2)
      expect(Math.abs((basisBox.y + basisBox.height) - (fairBox.y + fairBox.height))).toBeLessThan(10)
    } else {
      expect(rangeBox.y).toBeGreaterThan(fairBox.y + fairBox.height - 4)
    }

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(out, `default-${viewport.width}.png`) })

    await page.getByTestId('field-discount').fill('12')
    await expect(page.getByTestId('dcf-trial-value')).toBeVisible()
    const trial = await typography(page.getByTestId('dcf-trial-value'))
    const fairAfter = await typography(page.locator(FAIR))
    expect(fairAfter.fontSize).toBe(viewport.fair)
    expect(fairAfter.fontWeight).toBe('700')
    expect(trial.fontSize).toBe(fairAfter.fontSize)
    expect(trial.fontWeight).toBe('700')
    expect(trial.lineHeightPx).toBeCloseTo(fairAfter.lineHeightPx, 1)

    await expect(page.getByTestId('dcf-trial').locator('.dcf__range')).toHaveCount(0)
    await expect(page.getByTestId('dcf-fair-range')).toBeVisible()
    const fairAfterBox = await page.locator(FAIR).boundingBox()
    const trialBox = await page.getByTestId('dcf-trial-value').boundingBox()
    const rangeAfter = await page.getByTestId('dcf-fair-range').boundingBox()
    const mosAfter = await page.getByTestId('dcf-margin-of-safety').boundingBox()
    expect(rangeAfter.y).toBeGreaterThan(fairAfterBox.y + fairAfterBox.height - 4)
    expect(mosAfter.y).toBeGreaterThan(rangeAfter.y + rangeAfter.height - 2)
    if (viewport.width >= 900) {
      expect(Math.abs(trialBox.y - fairAfterBox.y)).toBeLessThan(4)
      expect(Math.abs((trialBox.y + trialBox.height) - (fairAfterBox.y + fairAfterBox.height))).toBeLessThan(4)
    }
    expect(await overflowX(strip)).toBeLessThanOrEqual(1)

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(out, `trial-${viewport.width}.png`) })

    await page.getByTestId('restore-default-assumptions').click()
    await expect(page.getByTestId('dcf-trial-value')).toHaveCount(0)
  }
})

test('keeps advanced steppers at 16px and field hints at 12-13px', async ({ page }) => {
  await page.getByTestId('advanced-assumptions').locator('summary').click()
  const small = page.locator('.dcf .stepper--sm .input-section').first()
  await expect(small).toBeVisible()
  const style = await typography(small)
  expect(style.fontSize).toBe(16)

  const hint = await typography(page.locator('.dcf__field-hint').first())
  expect(hint.fontSize).toBeGreaterThanOrEqual(12)
  expect(hint.fontSize).toBeLessThanOrEqual(13)
  const context = await typography(page.getByTestId('value-context'))
  expect(context.fontSize).toBe(12)
  expect(context.lineHeightPx).toBe(18)
})