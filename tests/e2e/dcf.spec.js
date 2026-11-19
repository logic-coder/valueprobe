import { expect, test } from '@playwright/test'
import { mockApi } from './support/api-mock'
import { STOCK } from './support/pages/stock'

const FAIR = STOCK.fairValue

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stock/SHSE:601398/dcf')
  await expect(page.locator(FAIR)).toContainText('11.86', { timeout: 20000 })
})

test('shows the published value by default and only edits this page', async ({ page }) => {
  await expect(page.getByTestId('value-title')).toContainText('ValueProbe 公允价')
  await expect(page.getByTestId('value-context')).toContainText('v1')
  await expect(page.locator(FAIR)).toContainText('11.86')

  await page.locator('.input-section').first().fill('12')
  await expect(page.getByTestId('value-title')).toContainText('试算')
  await expect(page.getByTestId('value-context')).toContainText('不影响公开口径 v1')
  await expect(page.locator(FAIR)).not.toContainText('11.86')

  // Reset returns to the published inputs; the artifact itself is untouched.
  await page.locator('.q-btn:has-text("more_vert")').first().click()
  await page.locator('.q-menu .q-item:has-text("恢复默认值")').click()
  await expect(page.getByTestId('value-title')).toContainText('ValueProbe 公允价')
  await expect(page.locator(FAIR)).toContainText('11.86')
})

test('renders the calculator with the live defaults', async ({ page }) => {
  await expect(page.locator(FAIR)).toContainText('¥ 11.86')
  await expect(page.getByTestId('long-run-pe')).toHaveCount(0)
  await expect(page.locator('.input-section').first()).toHaveValue('8')
  await expect(page.locator('text=多数年份没有盈利')).toBeVisible()
  await expect(page.locator('.dcf__warn')).toBeVisible()
})

test('recalculates when the discount rate changes', async ({ page }) => {
  await page.locator('.input-section').first().fill('10')
  await page.waitForTimeout(400)
  await expect(page.locator(FAIR)).not.toContainText('11.86')
  await page.locator('.q-btn:has(i:has-text("add"))').first().click()
  await page.waitForTimeout(300)
  await expect(page.locator('.input-section').first()).toHaveValue('11')
})

test('switches between eps and free cash flow bases', async ({ page }) => {
  await page.locator('.q-radio').nth(1).click()
  await page.waitForTimeout(400)
  await expect(page.locator(FAIR)).toContainText('116.66')
  await page.locator('.q-radio').nth(0).click()
  await page.waitForTimeout(400)
  await expect(page.locator(FAIR)).toContainText('11.86')
})

test('adds tangible book value to the fair value', async ({ page }) => {
  await page.getByRole('button', { name: '每股折现' }).click()
  await expect(page.getByTestId('long-run-pe')).toContainText('12.60')
  await expect(page.getByTestId('long-run-pe')).toContainText('不是内在价值')
  await page.locator('.q-checkbox').click()
  await page.waitForTimeout(400)
  await expect(page.locator(FAIR)).toContainText('37.54')
})

test('shows the reverse DCF expectation', async ({ page }) => {
  await page.getByRole('button', { name: '每股折现' }).click()
  await expect(page.locator(STOCK.result)).toContainText('价格隐含增速')
  await expect(page.getByTestId('reverse-growth')).toBeVisible()
  await page.locator(STOCK.result + ' .a-popover', { hasText: '价格隐含增速' }).dispatchEvent('mouseenter')
  await expect(page.locator('.a-popover__card', { hasText: '不是用来计算内在价值的采用增速' })).toBeVisible()
})

test('reset restores the defaults from the menu', async ({ page }) => {
  await page.locator('.input-section').first().fill('13')
  await expect(page.locator('.input-section').first()).toHaveValue('13')
  await page.locator('.q-btn:has-text("more_vert")').first().click()
  await page.locator('.q-menu .q-item:has-text("恢复默认值")').click()
  await expect(page.locator('.input-section').first()).not.toHaveValue('13')
})

test('shows field help in a popover', async ({ page }) => {
  // dispatch rather than hover: the popover opens on mouseenter, and a real
  // pointer move races the layout under parallel workers.
  const growthHelp = page.locator('.dcf .a-popover', { hasText: '快速成长阶段' }).first()
  await growthHelp.dispatchEvent('mouseenter')
  await expect(page.locator('.a-popover__card').first()).toBeVisible()
  await expect(page.locator('.a-popover__card').first()).toContainText('快速成长阶段')
})

test('the result labels open their help', async ({ page }) => {
  for (const [label, text] of [['内在价值', '不是目标价'], ['安全边际', '负值表示']]) {
    await page.locator(STOCK.result + ' .a-popover', { hasText: label }).dispatchEvent('mouseenter')
    await expect(page.locator('.a-popover__card', { hasText: text })).toBeVisible()
    await page.keyboard.press('Escape')
  }
})

test('the header price is the working price', async ({ page }) => {
  const header = page.getByRole('button', { name: /^参考报价/ })
  await expect(page.getByTestId('value-title')).toContainText('ValueProbe 公允价')
  const marginBefore = await page.locator(STOCK.margin).innerText()
  await header.click()
  await page.getByRole('spinbutton', { name: /参考报价/ }).fill('7')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^参考报价 ¥ ?7\.00/ })).toBeVisible()
  await expect(page.getByTestId('price-echo')).toContainText('¥ 7.00')
  await expect(page.getByTestId('value-title')).toContainText('试算')
  await expect(page.locator(STOCK.margin)).not.toHaveText(marginBefore)
  await page.getByRole('button', { name: /^参考报价 ¥ ?7\.00/ }).click()
  await page.getByRole('spinbutton', { name: /参考报价/ }).fill('')
  await page.keyboard.press('Enter')
  await expect(page.locator(STOCK.margin)).toContainText('n/a')
  await expect(page.locator(FAIR)).toContainText('11.86')
})

test('switches the interface language', async ({ page }) => {
  await page.locator('.header-actions a', { hasText: 'EN' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('h3:has-text("Intrinsic value")')).toBeVisible()
  // Banner copy, panel titles and the About page are translated too.
  await expect(page.locator('.dcf__head-hint')).toHaveText('every field recalculates live')
  await expect(page.locator('.dcf__form')).toContainText('Edit the price in the header')
  await page.goto('/#/about')
  await expect(page.locator('.about__title')).toHaveText('About ValueProbe')
  await expect(page.locator('.about')).not.toContainText(/CORS|User-Agent|\.env/)
  await expect(page.locator('.ds-order__hint').first()).toHaveText('quotes; CN and HK statements (needs a gateway)')
  await page.goto('/#/stock/BAD')
  await expect(page.locator('.notfound__title')).toHaveText('No such symbol')
  await page.goto('/#/stock/SHSE:601398/dcf')
  await page.locator('.header-actions a', { hasText: '中文' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('h3:has-text("内在价值")')).toBeVisible()
})

test('keeps the card rows in a fixed order', async ({ page }) => {
  const order = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.dcf__strip > div, .dcf__form > div')]
    return rows.map((row) => row.innerText.replace(/\s+/g, ' ').trim().slice(0, 24))
  })
  // The two growth windows share one row, so only their container is a direct child.
  const expected = ['内在价值', '安全边际', '股价', '基于每股收益', '折现率', '每股有形账面价值', '快速成长阶段', '盈利年份']
  const indexes = expected.map((label) => order.findIndex((row) => row.startsWith(label)))
  expect(indexes.every((index) => index >= 0)).toBe(true)
  expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)
  await expect(page.locator('.dcf__form')).toContainText('第二阶段')
})


test('keeps the console clean', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.reload()
  await expect(page.locator(FAIR)).toContainText('11.86', { timeout: 20000 })
  await page.waitForTimeout(1200)
  expect(errors).toEqual([])
})

test('shows a sensitivity matrix around the current assumptions', async ({ page }) => {
  await expect(page.locator('.sens__grid')).toBeVisible()
  await expect(page.locator('.sens__grid tbody td')).toHaveCount(25)
  const center = page.locator('.sens__grid td.is-center')
  await expect(center).toHaveCount(1)
  await expect(center).toHaveText(await page.locator(FAIR).innerText())
  // A bank's return fades to the discount rate, so this window stays in one band.
  // Owner earnings still spreads far enough to tint a cell.
  await page.getByRole('button', { name: '每股折现' }).click()
  await expect(page.locator('.sens__grid td.cell--good, .sens__grid td.cell--bad').first()).toBeVisible()
})

test('the matrix follows a changed discount rate', async ({ page }) => {
  await page.locator('.input-section').first().fill('20')
  await page.locator('.input-section').first().blur()
  await page.waitForTimeout(500)
  await expect(page.locator('.sens__grid tbody th').first()).toHaveText('18%')
  await expect(page.locator('.sens__grid tbody th').last()).toHaveText('22%')
})

test('builds the discount rate from its parts', async ({ page }) => {
  await page.locator('.dcf__wacc-btn').click()
  const dialog = page.locator('.q-dialog')
  await expect(dialog).toBeVisible()
  const inputs = dialog.locator('input')
  await inputs.nth(0).fill('5')
  await inputs.nth(1).fill('6')
  await inputs.nth(2).fill('1.2')
  await expect(dialog).toContainText('12%')
  await dialog.locator('button', { hasText: '应用' }).click()
  await expect(page.locator('.input-section').first()).toHaveValue('12')
})

test('scenario presets move the assumptions and restore the base', async ({ page }) => {
  await page.locator('.dcf__scenario-btns button', { hasText: '牛市' }).click()
  await page.waitForTimeout(400)
  await expect(page.locator(FAIR)).not.toContainText('11.86')
  await page.locator('.dcf__scenario-btns button', { hasText: '基准' }).click()
  await page.waitForTimeout(400)
  await expect(page.locator(FAIR)).toContainText('11.86')
  await expect(page.locator('.input-section').first()).toHaveValue('8')
})

test('pins a source for the symbol and releases it again', async ({ page }) => {
  await page.locator('.dcf .q-btn:has-text("more_vert")').first().click()
  await page.locator('.q-menu .q-item', { hasText: '季度快照' }).click()
  const banner = page.locator('.data-banner')
  await expect(banner).toBeVisible({ timeout: 20000 })
  await expect(banner).toContainText('季度快照', { timeout: 20000 })
  await page.locator('.dcf .q-btn:has-text("more_vert")').first().click()
  await page.locator('.q-menu .q-item', { hasText: '自动选择' }).click()
  await expect(page.locator('.data-banner--published')).toContainText('季度快照', { timeout: 20000 })
  await expect(page.locator(FAIR)).toContainText('11.86')
})

test('cross-checks the price against peer multiples', async ({ page }) => {
  const table = page.locator('.mcheck__table')
  await expect(table).toBeVisible()
  await expect(table.locator('tbody tr')).toHaveCount(3)
  const pe = table.locator('tbody tr').first()
  await expect(pe.locator('td').nth(0)).toContainText('×')
  const before = await pe.locator('td').nth(2).innerText()
  await pe.locator('input').fill('20')
  await page.waitForTimeout(400)
  await expect(pe.locator('td').nth(2)).not.toHaveText(before)
  await expect(pe.locator('td').nth(3)).toContainText('%')
})

test('has no share surface and ignores valuation query parameters', async ({ page }) => {
  // Share links were removed with the share/print surfaces (DEVIATIONS D37), so
  // old query strings no longer seed the form; the page opens on its own defaults.
  await page.goto('/#/stock/SHSE:601398/dcf?r=15&g=7&tbv1=1')
  await expect(page.locator('.input-section').first()).toHaveValue('8', { timeout: 20000 })
  await expect(page.locator(FAIR)).toContainText('11.86')
  await expect(page.locator('.dcf__share-btn')).toHaveCount(0)
})

test('does not ask a quote host for peers that have no local file', async ({ page }) => {
  const hits = []
  page.on('request', (request) => {
    if (/\/em\/|push2\.eastmoney/.test(request.url())) hits.push(request.url())
  })
  await page.locator(STOCK.peers).scrollIntoViewIfNeeded()
  await expect(page.locator('.peers__empty')).toContainText('同行报价暂时取不到', { timeout: 20000 })
  expect(hits).toHaveLength(0)
})

