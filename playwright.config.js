import { defineConfig } from '@playwright/test'
import { PREVIEW_PORT, DEV_PORT } from './scripts/lib/ports.mjs'

// Default: the chromium Playwright ships, in full-chromium headless mode (no
// system browser, no separate headless-shell download). Set PW_CHANNEL=chrome
// to run against a locally installed Chrome instead.
const channel = process.env.PW_CHANNEL || 'chromium'

// PW_BASE=1 adds the static-host gate: a preview server for the build produced
// by scripts/build-base.mjs, served under /valueprobe/ with the direct transport.
// It stays a second server so the plain suite keeps using the dev server only.
const baseMode = process.env.PW_BASE === '1'
// PW_DIST=1 serves the dist a build already produced instead of rebuilding it;
// the pre-upload gate uses it to check the exact artifact that gets deployed.
const distMode = process.env.PW_DIST === '1'

const webServer = []

if (!distMode) {
  webServer.push({
    command: 'npm run dev',
    url: 'http://127.0.0.1:' + DEV_PORT,
    reuseExistingServer: true,
    timeout: 120000,
  })
}

if (baseMode) {
  webServer.push({
    // Build first, then serve: `npm run test:e2e:base` already builds, but a
    // raw PW_BASE=1 run should also work from a clean checkout. PW_DIST reuses
    // the dist/ that npm run build already wrote.
    command: distMode ? 'npm run preview:base' : 'npm run build:base && npm run preview:base',
    url: 'http://127.0.0.1:' + PREVIEW_PORT + '/valueprobe/',
    reuseExistingServer: true,
    timeout: 180000,
  })
}

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: distMode ? [] : ['**/upload-gate.spec.js'],
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:' + DEV_PORT,
    // The suite never touches the network: every /cloud, /em, /sec and /fx call is mocked.
    channel,
    // The suite asserts Chinese copy; the product itself follows the browser language.
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1200 },
    launchOptions: { headless: true },
  },
  webServer,
})
