#!/usr/bin/env node
// Static-host smoke test: build the /valueprobe/ shape, serve it with vite preview and
// assert the things a Pages deploy would break — asset prefix, snapshot files, the
// SPA fallback and the absence of same-origin /_api references.
//
//   node scripts/pages-smoke.mjs        # build + serve + assert + exit 0/1
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'http://127.0.0.1:4173'
const BASE = ORIGIN + '/valueprobe/'
const run = (args) => spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: '/valueprobe/', VITE_SITE_URL: 'https://example.test/valueprobe/', VITE_TRANSPORT: 'direct' },
})

const failures = []
const check = (name, ok, detail = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''))
  if (!ok) failures.push(name)
}
const get = (url) => fetch(url, { redirect: 'manual' }).catch((error) => ({ error }))

const waitFor = async (url, timeoutMs = 30000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const response = await get(url)
    if (response.status) return true
    await new Promise((done) => setTimeout(done, 500))
  }
  return false
}

console.log('[smoke] building dist with VITE_BASE=/valueprobe/ …')
await new Promise((done, fail) => run(['build']).on('close', (code) => (code ? fail(new Error('build failed')) : done())))

const server = run(['preview', '--port', '4173', '--strictPort'])
const stop = () => { server.kill('SIGTERM') }
process.on('exit', stop)

if (!(await waitFor(BASE))) {
  console.error('[smoke] preview server never answered on ' + BASE)
  process.exit(1)
}

const index = await get(BASE)
const html = index.text ? await index.text() : ''
check('index served', index.status === 200, String(index.status))
check('assets use the base prefix', /\/valueprobe\/assets\/[^"']+\.js/.test(html))
check('no same-origin /_api reference', !/src="\/_api|baseURL: ?"\/_api/.test(html))
const asset = html.match(/\/valueprobe\/assets\/[^"']+\.js/)?.[0]
if (asset) {
  const response = await get(ORIGIN + asset)
  check('hashed chunk served', response.status === 200, String(response.status))
  check('chunk is javascript', (response.headers?.get?.('content-type') || '').includes('javascript'))
}
const snapshot = await get(BASE + 'data/SHSE-601398.json')
const snapshotBody = snapshot.text ? await snapshot.text() : ''
check('committed snapshot served', snapshot.status === 200, String(snapshot.status))
check('snapshot carries as_of', /"as_of"/.test(snapshotBody))
check('favicon served', (await get(BASE + 'favicon.svg')).status === 200)
check('shell carries a noscript hint', /<noscript>/.test(html))
const sw = await get(BASE + 'sw.js')
check('service worker served', sw.status === 200)
check('service worker caches the shell', /valueprobe-shell/.test(sw.text ? await sw.text() : ''))
check('manifest icons served', (await get(BASE + 'icon-192.png')).status === 200)
check('deep path falls back to the shell', (await get(BASE + 'stock/SHSE:601398/dcf')).status === 200)
check('dist carries the 404 shell for Pages', (await get(BASE + '404.html')).status === 200)
check('manifest served', (await get(BASE + 'manifest.webmanifest')).status === 200)
check('robots served', (await get(BASE + 'robots.txt')).status === 200)
const og = html.match(/property="og:image" content="([^"]+)"/)?.[1] || ''
check('canonical is absolute', /rel="canonical" href="https:\/\/example\.test\/valueprobe\/"/.test(html))
check('social image is absolute', og === 'https://example.test/valueprobe/og.png', og)
check('social preview served', (await get(BASE + 'og.png')).status === 200)

stop()
if (failures.length) {
  console.error('[smoke] ' + failures.length + ' check(s) failed: ' + failures.join(', '))
  process.exit(1)
}
console.log('[smoke] all static-host checks passed')
