#!/usr/bin/env node
// Contrast spot-check against WCAG AA: builds on demand, starts `vite preview` on its own
// port, renders both themes, samples the muted/faint styles that carry real information —
// on the calculator, the About page and the 404 page — and reports each ratio against its
// painted backdrop. Exit code 1 on a failure.
//
//   node scripts/contrast-audit.mjs          # both themes
//   node scripts/contrast-audit.mjs dark     # one theme
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { CONTRAST_PORT } from './lib/ports.mjs'

const THEMES = process.argv[2] ? [process.argv[2]] : ['light', 'dark']
const PORT = CONTRAST_PORT
const ORIGIN = 'http://127.0.0.1:' + PORT
const PAGES = [
  { path: '/#/', wait: '.home__hero', selectors: ['.home__lead', '.home__note', '.home__kicker', '.home__examples'] },
  { path: '/#/stock/SHSE:601398/dcf', wait: '.text-h6.button-font-weight', selectors: ['.faint', '.muted', '.text-caption', '.panel__title', '.dcf__head-hint', 'thead th', 'tbody td', '.dcf__mos font'] },
  { path: '/#/about', wait: '.about__title', selectors: ['.about p', '.ds-order__hint', '.ds-order__list li'] },
  { path: '/#/compare?s=SHSE:601398,NASDAQ:AAPL', wait: '.cmp__table', selectors: ['.cmp__note', '.cmp__table thead th', '.compare .faint'] },
  { path: '/#/watchlist', wait: '.watchlist .muted', selectors: ['.watchlist .muted'] },
  { path: '/#/stock/BAD', wait: '.notfound__title', selectors: ['.notfound__title', '.notfound p'] },
]

const AA_NORMAL = 4.5
const AA_LARGE = 3

const ratio = (fore, back) => {
  const luminance = (color) => {
    const [r, g, b] = color.map((value) => {
      const channel = value / 255
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [a, b] = [luminance(fore), luminance(back)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

if (!existsSync('dist/index.html')) {
  const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status || 1)
}

const server = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', detached: process.platform !== 'win32', shell: process.platform === 'win32' },
)
const stopServer = () => {
  if (server.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else process.kill(-server.pid, 'SIGTERM')
}

const ready = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(ORIGIN + '/')).ok) return true
    } catch {
      // preview still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

let failures = 0
let browser
try {
  if (!(await ready())) {
    console.error('[contrast] preview did not start on ' + ORIGIN)
    process.exitCode = 1
  } else {
    browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chromium' })
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
      await page.addInitScript((value) => window.localStorage.setItem('fv-theme', value), theme)
      console.log('\n[' + theme + ']')

      for (const target of PAGES) {
        await page.goto(ORIGIN + target.path, { waitUntil: 'domcontentloaded' })
        await page.locator(target.wait).waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
        await page.waitForTimeout(600)

        const readSample = (selector) => page.evaluate((selector) => {
          const element = document.querySelector(selector)
          if (!element) return null
          const parse = (value) => {
            const text = String(value)
            // Chrome reports color-mix() results as color(srgb r g b) with 0-1 floats.
            const srgb = text.match(/color\(srgb ([^)]+)\)/)
            if (srgb) {
              const floats = srgb[1].trim().split(/\s+/).map(Number)
              return floats.length >= 3 ? floats.slice(0, 3).map((n) => Math.round(n * 255)) : null
            }
            const numbers = text.match(/[\d.]+/g)?.map(Number) || []
            return numbers.length >= 3 ? numbers.slice(0, 3) : null
          }
          const style = getComputedStyle(element)
          const fore = parse(style.color)
          if (!fore) return null
          let node = element
          let back = null
          while (node && !back) {
            const raw = getComputedStyle(node).backgroundColor
            if (!raw.includes('rgba(0, 0, 0, 0)')) back = parse(raw)
            node = node.parentElement
          }
          return { fore, back: back || [255, 255, 255], size: parseFloat(style.fontSize), weight: style.fontWeight }
        }, selector)
        const score = (sample) => {
          if (!sample) return { ok: true, value: 0, size: 0 }
          const large = sample.size >= 24 || (sample.size >= 18.66 && Number(sample.weight) >= 700)
          const value = ratio(sample.fore, sample.back)
          return { ok: value >= (large ? AA_LARGE : AA_NORMAL), value, size: sample.size }
        }

        for (const selector of target.selectors) {
          let sample = await readSample(selector)
          if (!sample) continue
          let result = score(sample)
          // A page that is still painting (or a toast covering a cell) can score once by
          // accident; one settled re-read keeps the audit honest without hiding real failures.
          if (!result.ok) {
            await page.waitForTimeout(700)
            sample = await readSample(selector)
            result = score(sample)
          }
          if (!result.ok) failures += 1
          console.log((result.ok ? 'ok   ' : 'FAIL ') + (target.path + ' ' + selector).padEnd(48) + result.value.toFixed(2) + '  ' + result.size + 'px')
        }
      }
      await page.close()
    }
  }
} finally {
  await browser?.close()
  stopServer()
}

console.log(failures ? '\n[contrast] ' + failures + ' sample(s) below AA' : '\n[contrast] all samples pass AA')
// process.exit() can truncate piped stdout; let the loop end naturally.
process.exitCode = failures ? 1 : 0
