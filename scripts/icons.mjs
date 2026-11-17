#!/usr/bin/env node
// Render the favicon SVG into the PNG sizes a manifest wants. Run after changing it:
//   node scripts/icons.mjs
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chromium' })
const page = await browser.newPage({ viewport: { width: 512, height: 512 } })

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent('<body style="margin:0;background:transparent">' + svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ') + '</body>')
  await page.screenshot({ path: new URL('../public/icon-' + size + '.png', import.meta.url).pathname.replace(/^\//, ''), omitBackground: true })
  console.log('wrote public/icon-' + size + '.png')
}
await browser.close()
