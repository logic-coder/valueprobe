#!/usr/bin/env node
// Static-host smoke test: build the /valueprobe/ shape, serve it with vite preview and
// assert the things a Pages deploy would break — asset prefix, snapshot files, the
// SPA fallback and the absence of same-origin /_api references.
//
//   node scripts/pages-smoke.mjs        # build + serve + assert + exit 0/1
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PREVIEW_PORT } from './lib/ports.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'http://127.0.0.1:' + PREVIEW_PORT
const basePath = process.env.VITE_BASE || '/valueprobe/'
const siteUrl = process.env.VITE_SITE_URL || 'https://example.test' + basePath
const BASE = ORIGIN + basePath
const run = (args) => spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: basePath, VITE_SITE_URL: siteUrl, VITE_TRANSPORT: 'direct' },
})

const failures = []
const check = (name, ok, detail = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''))
  if (!ok) failures.push(name)
}
const get = (url, headers) => fetch(url, { redirect: 'manual', headers }).catch((error) => ({ error }))
const getJson = async (url) => {
  const response = await get(url)
  const body = response.text ? await response.text() : ''
  try {
    return { status: response.status, body: JSON.parse(body) }
  } catch {
    return { status: response.status, body: null }
  }
}

const waitFor = async (url, timeoutMs = 30000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const response = await get(url)
    if (response.status) return true
    await new Promise((done) => setTimeout(done, 500))
  }
  return false
}

if (!process.argv.includes('--built')) {
  console.log('[smoke] building dist with VITE_BASE=' + basePath)
  await new Promise((done, fail) => run(['build']).on('close', (code) => (code ? fail(new Error('build failed')) : done())))
}

const server = run(['preview', '--port', String(PREVIEW_PORT), '--strictPort'])
const closed = new Promise(done => server.once('close', done))
const stop = () => { if (!server.killed && server.exitCode === null) server.kill('SIGTERM') }
process.on('exit', stop)

if (!(await waitFor(BASE))) {
  console.error('[smoke] preview server never answered on ' + BASE)
  process.exit(1)
}

const index = await get(BASE)
const html = index.text ? await index.text() : ''
check('index served', index.status === 200, String(index.status))
const asset = html.match(/src="([^"]+\.js)"/)?.[1]
check('assets use the base prefix', asset?.startsWith(basePath + 'assets/'))
check('no same-origin /_api reference', !/src="\/_api|baseURL: ?"\/_api/.test(html))
if (asset?.startsWith(basePath + 'assets/')) {
  const response = await get(ORIGIN + asset)
  check('hashed chunk served', response.status === 200, String(response.status))
  check('chunk is javascript', (response.headers?.get?.('content-type') || '').includes('javascript'))
}
const snapshot = await get(BASE + 'data/SHSE-601398.json')
const snapshotBody = snapshot.text ? await snapshot.text() : ''
check('committed snapshot served', snapshot.status === 200, String(snapshot.status))
check('snapshot carries as_of', /"as_of"/.test(snapshotBody))
const dataManifestEarly = await getJson(BASE + 'data/manifest.json')
const policyVersion = dataManifestEarly.body?.policyVersion
const intrinsic = await getJson(BASE + 'data/intrinsic/' + policyVersion + '.json')
check('intrinsic artifact served', intrinsic.status === 200, String(intrinsic.status))
check('intrinsic artifact is the public policy', Boolean(policyVersion) && intrinsic.body?.policyVersion === policyVersion, String(intrinsic.body?.policyVersion))
const publish = await getJson(BASE + 'data/publish.json')
check('publish state served', publish.status === 200, String(publish.status))
check('publish state is not blocked', publish.body?.status && publish.body.status !== 'blocked', String(publish.body?.status))
check('publish state belongs to this artifact', typeof publish.body?.batch === 'string' && publish.body?.generatedAt === intrinsic.body?.generatedAt)
const size = Object.keys(intrinsic.body?.entries || {}).length
check('intrinsic artifact covers the public universe', size > 0 && size === intrinsic.body?.universe?.declared, String(size))
const delivery = await getJson(BASE + 'data/valuation/meta.json')
const deliveryBase = BASE + 'data/valuation/' + delivery.body?.release + '/'
const detail = await getJson(deliveryBase + 'SHSE-601398.json')
const summaries = await getJson(deliveryBase + 'summary.json')
check('valuation detail and summary share the same release', detail.body?.release === delivery.body?.release &&
  summaries.body?.release === delivery.body?.release && typeof delivery.body?.release === 'string')
check('valuation detail preserves the published value', detail.body?.entry?.value === intrinsic.body?.entries?.['SHSE:601398']?.value)
check('valuation summary covers the public universe', Object.keys(summaries.body?.entries || {}).length === size)
const dataManifest = await getJson(BASE + 'data/manifest.json')
check('data manifest served', dataManifest.status === 200, String(dataManifest.status))
check('manifest hash matches the artifact', Boolean(dataManifest.body?.policyHash) && dataManifest.body.policyHash === intrinsic.body?.policyHash)
for (const name of ['HKSE-00002', 'HKSE-00066']) {
  const listing = await getJson(BASE + 'data/' + name + '.json')
  check(name + ' snapshot served', listing.status === 200, String(listing.status))
  check(name + ' snapshot carries as_of', typeof listing.body?.as_of === 'string')
}
check('favicon served', (await get(BASE + 'favicon.svg')).status === 200)
check('shell carries a noscript hint', /<noscript>/.test(html))
const sw = await get(BASE + 'sw.js')
check('service worker served', sw.status === 200)
check('service worker caches the shell', /valueprobe-shell/.test(sw.text ? await sw.text() : ''))
check('manifest icons served', (await get(BASE + 'icon-192.png')).status === 200)
const deepPath = await get(BASE + 'stock/SHSE:601398/dcf', { Accept: 'text/html' })
const deepHtml = deepPath.text ? await deepPath.text() : ''
check('deep path falls back to the shell', deepPath.status === 200 && deepHtml.includes('<div id="app">'),
  String(deepPath.status ?? deepPath.error?.cause?.code ?? 'request failed'))
check('dist carries the 404 shell for Pages', (await get(BASE + '404.html')).status === 200)
check('manifest served', (await get(BASE + 'manifest.webmanifest')).status === 200)
check('robots served', (await get(BASE + 'robots.txt')).status === 200)
const og = html.match(/property="og:image" content="([^"]+)"/)?.[1] || ''
check('canonical is absolute', html.includes('rel="canonical" href="' + siteUrl + '"'))
check('social image is absolute', og === new URL('og.png', siteUrl).href, og)
check('social preview served', (await get(BASE + 'og.png')).status === 200)

stop()
await closed
if (failures.length) {
  console.error('[smoke] ' + failures.length + ' check(s) failed: ' + failures.join(', '))
  process.exit(1)
}
console.log('[smoke] all static-host checks passed')
