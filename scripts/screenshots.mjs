
import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chromium' })
// Pages seed Chinese: the docs are written in Chinese and headless defaults to en-US.
const open = async (viewport) => {
  const page = await b.newPage({ viewport })
  await page.addInitScript(() => window.localStorage.setItem('fv-locale', 'zh-hans'))
  return page
}
const ready = async (p) => p.waitForFunction(() => {
  const el = document.querySelector('.dcf__fair .text-h6')
  return el && /[0-9]/.test(el.textContent || '')
}, null, { timeout: 30000 })
const hp = await open({ width: 1440, height: 1200 })
await hp.addInitScript(() => {
  window.localStorage.setItem('fv-recent', JSON.stringify([
    { symbol: 'NASDAQ:AAPL', name: '苹果', at: Date.now() },
    { symbol: 'NYSE:KO', name: '可口可乐', at: Date.now() },
  ]))
  window.localStorage.setItem('fv-watchlist', JSON.stringify(['SHSE:601398']))
})
await hp.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await hp.locator('.home__hero').waitFor()
await hp.waitForTimeout(400)
await ready(hp)
await hp.waitForTimeout(700)
await hp.screenshot({ path: 'docs/home.png' })
// Social preview: 1200x630 is the Open Graph size everyone crops to anyway.
await hp.setViewportSize({ width: 1200, height: 630 })
await hp.evaluate(() => window.scrollTo(0, 0))
await hp.waitForTimeout(400)
await hp.screenshot({ path: 'public/og.png' })
await hp.close()

const p = await open({ width: 1440, height: 1100 })
// The rate-provenance line only shows when the live rate is unavailable.
await p.route('**/latest_indicator/**', (route) => route.fulfill({ status: 503, body: '{}' }))
await p.goto('http://127.0.0.1:5173/#/stock/SHSE:601398/dcf', { waitUntil: 'domcontentloaded' })
await ready(p)
await p.waitForTimeout(700)
await p.locator('.dcf__rate-note').first().waitFor({ timeout: 15000 })
await p.screenshot({ path: 'docs/light.png' })
const noteBox = await p.locator('.dcf__rate-note').first().boundingBox()
if (noteBox) {
  await p.screenshot({
    path: 'docs/rate-note.png',
    clip: { x: 80, y: noteBox.y - 96, width: 920, height: 168 },
  })
}
// The print view is what the print button produces: same page, print media.
await p.setViewportSize({ width: 1000, height: 1000 })
await p.evaluate(() => window.scrollTo(0, 0))
await p.emulateMedia({ media: 'print' })
await p.waitForTimeout(500)
await p.screenshot({ path: 'docs/print.png', clip: { x: 0, y: 0, width: 1000, height: 940 } })
await p.emulateMedia({ media: 'screen' })
await p.setViewportSize({ width: 1440, height: 1100 })
await p.goto('http://127.0.0.1:5173/#/about', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1200)
await p.screenshot({ path: 'docs/about.png', fullPage: true })
await p.goto('http://127.0.0.1:5173/#/stock/SHSE:601398/dcf', { waitUntil: 'domcontentloaded' })
await ready(p)
await p.waitForTimeout(500)
await p.locator('.theme-button').click()
await p.waitForTimeout(700)
await p.locator('.dcf__wacc-btn').click()
await p.locator('.q-dialog .q-card').waitFor()
await p.waitForTimeout(700)
await p.locator('.q-dialog .q-card').screenshot({ path: 'docs/wacc.png', animations: 'disabled' })
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
await p.locator('.sens').scrollIntoViewIfNeeded()
await p.waitForTimeout(300)
const sensBox = await p.locator('.sens').boundingBox()
if (sensBox) {
  await p.screenshot({ path: 'docs/sensitivity.png', clip: { x: sensBox.x, y: sensBox.y, width: sensBox.width, height: Math.min(sensBox.height, 340) } })
}
await p.locator('.mcheck').scrollIntoViewIfNeeded()
await p.waitForTimeout(300)
const mcheckBox = await p.locator('.mcheck').boundingBox()
if (mcheckBox) {
  await p.screenshot({ path: 'docs/multiples.png', clip: { x: mcheckBox.x, y: mcheckBox.y, width: mcheckBox.width, height: Math.min(mcheckBox.height, 220) } })
}
await p.locator('.peers').scrollIntoViewIfNeeded()
await p.waitForTimeout(400)
const peerBox = await p.locator('.peers').boundingBox()
if (peerBox) {
  await p.screenshot({ path: 'docs/peers.png', clip: { x: peerBox.x, y: peerBox.y, width: peerBox.width, height: Math.min(peerBox.height, 320) } })
}
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(200)
await p.screenshot({ path: 'docs/dark.png' })
const m = await open({ width: 400, height: 900 })
await m.goto('http://127.0.0.1:5173/#/stock/SHSE:601398/dcf', { waitUntil: 'domcontentloaded' })
await ready(m)
await m.waitForTimeout(700)
await m.screenshot({ path: 'docs/mobile.png' })

const sum = await open({ width: 1440, height: 900 })
await sum.goto('http://127.0.0.1:5173/#/stock/SHSE:601398/summary', { waitUntil: 'domcontentloaded' })
await sum.locator('.sum__grid').waitFor({ timeout: 30000 }).catch(() => {})
await sum.waitForTimeout(600)
const sumBox = await sum.locator('.panel').first().boundingBox()
if (sumBox) await sum.screenshot({ path: 'docs/summary.png', clip: { x: sumBox.x, y: sumBox.y, width: sumBox.width, height: Math.min(sumBox.height + 20, 420) } })
await sum.close()

const chart = await open({ width: 1440, height: 820 })
await chart.goto('http://127.0.0.1:5173/#/stock/SHSE:601398/chart', { waitUntil: 'domcontentloaded' })
await chart.locator('.chart-indicator').waitFor({ timeout: 30000 }).catch(() => {})
await chart.locator('canvas').waitFor({ timeout: 30000 }).catch(() => {})
await chart.waitForTimeout(900)
await chart.screenshot({ path: 'docs/chart.png' })
await chart.close()

const wl = await open({ width: 1440, height: 700 })
// browser.newPage opens a fresh context, so the seed has to be set here.
await wl.addInitScript(() => window.localStorage.setItem('fv-watchlist', JSON.stringify(['SHSE:601398'])))
await wl.goto('http://127.0.0.1:5173/#/watchlist', { waitUntil: 'domcontentloaded' })
await wl.locator('.watchlist').waitFor()
await wl.locator('.wl__table tbody tr').waitFor({ timeout: 30000 }).catch(() => {})
await wl.waitForTimeout(600)
await wl.screenshot({ path: 'docs/watchlist.png' })
await wl.close()

const cmp = await open({ width: 1440, height: 720 })
await cmp.addInitScript(() => window.localStorage.setItem('fv-watchlist', JSON.stringify(['SHSE:601398', 'NASDAQ:AAPL'])))
await cmp.goto('http://127.0.0.1:5173/#/compare?s=SHSE:601398,NASDAQ:AAPL', { waitUntil: 'domcontentloaded' })
await cmp.locator('.cmp__table tbody tr').first().waitFor({ timeout: 30000 }).catch(() => {})
await cmp.waitForTimeout(600)
await cmp.screenshot({ path: 'docs/compare.png' })
await cmp.close()

const en = await open({ width: 1440, height: 940 })
await en.goto('http://127.0.0.1:5173/#/stock/SHSE:601398/dcf', { waitUntil: 'domcontentloaded' })
await ready(en)
await en.locator('.header-actions a', { hasText: 'EN' }).click()
await en.waitForTimeout(700)
await en.screenshot({ path: 'docs/en.png' })
await en.close()

await b.close()
