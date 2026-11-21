// Data gate: the committed snapshots, rates, catalog, intrinsic artifact and
// manifest must describe the same facts. Runs on every push (npm run verify).
//   npm run verify:data
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { POLICY_V1, POLICY_V1_HASH, policyValue } from '../src/lib/policy.js'
import { isKnownReason, isKnownWarning } from '../src/lib/reasons.js'
import { toStock } from '../src/lib/stockRecord.js'
import { ARTIFACT_PATH, MANIFEST_PATH, buildArtifacts, policyHash, readRates, snapshotFiles } from './lib/policy-artifact.mjs'
import { PUBLISH_PATH, isPublishReady, latestPeriod, matchesPublishHistory } from './lib/publish-gate.mjs'

// Verify from the repository root even when npm runs the script from a workspace.
const root = process.cwd()
const failures = []
const warnings = []
const ok = (name, detail = '') => console.log('ok   ' + name + (detail ? ' — ' + detail : ''))
const fail = (name, detail = '') => { console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name) }
const warn = (name, detail = '') => { console.log('warn ' + name + (detail ? ' — ' + detail : '')); warnings.push(name) }
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))

const hash = policyHash()
if (hash === POLICY_V1_HASH) ok('policy hash pinned', hash.slice(0, 12) + '…')
else fail('policy hash pinned', 'POLICY_V1 changed without a version bump and hash update')

const artifact = readJson(ARTIFACT_PATH)
const manifest = readJson(MANIFEST_PATH)
const { artifact: rebuilt, manifest: rebuiltManifest, problems } = buildArtifacts({ root, generatedAt: artifact.generatedAt })
for (const problem of problems) fail('artifact build', problem)
const same = JSON.stringify(rebuilt) === JSON.stringify(artifact) && JSON.stringify(rebuiltManifest) === JSON.stringify(manifest)
same ? ok('artifact reproducible', ARTIFACT_PATH) : fail('artifact reproducible', 'committed artifact is stale: run npm run intrinsic')

// Freshness is disclosed, not enforced: the product's policy is to keep publishing
// and label stale data (STALE_DATA / STALE_PRICE warnings on the value). Making age
// a hard gate would also make this script depend on today's clock and fail unrelated
// pushes weeks after a refresh. Structure and reproducibility stay hard failures.
const generation = Date.parse(artifact.generatedAt)
const ageDays = (Date.now() - generation) / 86_400_000
ageDays <= POLICY_V1.staleness.fundamentalsDays
  ? ok('artifact fresh', artifact.generatedAt + ' (' + Math.floor(ageDays) + 'd)')
  : warn('artifact age', artifact.generatedAt + ' is older than ' + POLICY_V1.staleness.fundamentalsDays + ' days; refresh snapshots and artifacts before announcing values')

// The release records which upstream batch produced it. A stale digest means the
// artifact was edited without a refresh; a blocked status means the refresh was short.
let publish = null
try { publish = readJson(PUBLISH_PATH) } catch { fail('publish state', 'missing ' + PUBLISH_PATH) }
if (publish) {
  isPublishReady(publish, artifact, manifest)
    ? ok('publish state', publish.status + ' batch ' + String(publish.batch).slice(0, 12) + '… mode ' + publish.mode)
    : fail('publish state', publish.status + ' batch ' + String(publish.batch).slice(0, 12) + '…')
  if (publish.partial?.length) warn('publish partial', publish.partial.length + ' kept/limited item(s)')
  if (publish.latestPeriod !== latestPeriod(artifact)) fail('publish latest period', publish.latestPeriod + ' vs ' + latestPeriod(artifact))
  if (publish.status === 'rebuilt') {
    publish.upstreamCheckedAt === null
      ? warn('publish upstream check', 'unknown for local rebuild')
      : ok('publish upstream check', 'inherited ' + publish.upstreamCheckedAt)
  } else if (!(Date.parse(publish.upstreamCheckedAt) >= Date.parse(artifact.generatedAt))) {
    fail('publish checked date', publish.upstreamCheckedAt)
  }
}

if (publish && process.argv.includes('--check-lineage')) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const stateAt = ref => JSON.parse(git('show', ref + ':' + PUBLISH_PATH))
  const head = git('rev-parse', '--verify', (process.env.PUBLISH_HISTORY_HEAD || 'HEAD') + '^{commit}')
  const paths = git('log', '--first-parent', '--format=%H', head, '--', PUBLISH_PATH).split('\n').filter(Boolean)
  const history = []
  for (const ref of paths) {
    let state
    try { state = stateAt(ref) } catch { continue } // A rollback may delete the old sidecar.
    if (ref === head && JSON.stringify(state) === JSON.stringify(publish)) continue
    history.push(state)
  }
  if (matchesPublishHistory(publish, history)) ok('publish lineage', publish.previousBatch ?? 'initial batch')
  else fail('publish lineage', 'previous batch does not match Git history')
}

// Rate rows must accompany the date they were captured; age is disclosed only.
for (const code of ['CNY', 'USD', 'HKD']) {
  const row = artifact.rates?.[code]
  if (!row) { fail('rate ' + code, 'missing'); continue }
  const age = (generation - Date.parse(row.asOf)) / 86_400_000
  if (!Number.isFinite(age)) warn('rate ' + code, 'unreadable asOf ' + row.asOf)
  else if (age > POLICY_V1.staleness.ratesDays) warn('rate ' + code, 'asOf ' + row.asOf + ' is ' + Math.floor(age) + ' days old')
  else ok('rate ' + code, row.value + '% ' + row.asOf + (row.proxy ? ' proxy ' + row.proxy : ''))
}

// Universe: declared, committed files, catalog and artifact entries agree.
const declared = readJson('scripts/watchlist.json')
const files = snapshotFiles(root).map((name) => name.replace(/\.json$/, ''))
const symbols = files.map((name) => name.replace(/^([A-Z]+)-/, '$1:'))
const entries = Object.keys(artifact.entries)
const catalog = readJson('public/data/catalog.json').map((row) => row.symbol)
const setEqual = (left, right) => {
  const names = new Set(right)
  return left.length === right.length && new Set(left).size === names.size && names.size === right.length &&
    left.every(value => names.has(value))
}
setEqual(declared, symbols) ? ok('universe declared = committed', declared.length + ' symbols') : fail('universe declared = committed', 'declared ' + declared.length + ' vs files ' + symbols.length)
setEqual(catalog, symbols) ? ok('catalog matches files') : fail('catalog matches files', 'catalog ' + catalog.length + ' vs files ' + symbols.length)
setEqual(entries, symbols) ? ok('artifact entries match files') : fail('artifact entries match files', 'entries ' + entries.length)
artifact.universe.declared === declared.length && artifact.universe.snapshots === files.length
  ? ok('artifact universe counts')
  : fail('artifact universe counts')

// Manifest hashes must equal the files on disk.
const sha = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')
let hashesOk = true
for (const file of manifest.files) {
  const actual = sha('public/data/' + file.name)
  if (actual !== file.sha256) { hashesOk = false; fail('manifest hash ' + file.name) }
}
hashesOk ? ok('manifest hashes', manifest.files.length + ' files') : null

// Every published value must carry known codes and a rate row.
let codesOk = true
let policyOk = true
for (const [symbol, entry] of Object.entries(artifact.entries)) {
  for (const code of entry.reasons) if (!isKnownReason(code)) { codesOk = false; fail('reason code ' + symbol + ' ' + code) }
  for (const code of entry.warnings) if (!isKnownWarning(code)) { codesOk = false; fail('warning code ' + symbol + ' ' + code) }
  if (!entry.inputs?.rate) { policyOk = false; fail('rate input ' + symbol) }
  if (entry.status === 'ok' && !(entry.value > 0)) { policyOk = false; fail('published value ' + symbol) }
  if (entry.status === 'refused' && entry.value !== null) { policyOk = false; fail('refused value ' + symbol) }
}
codesOk ? ok('reason and warning codes known') : null
policyOk ? ok('entries carry inputs and a rate row') : null

// Snapshot schema: required keys exist even when a value is null.
let schemaOk = true
for (const name of snapshotFiles(root)) {
  const raw = readJson('public/data/' + name)
  for (const key of ['as_of', 'symbol', 'exchange_', 'currency', 'price', 'ttm_eps', 'ttm_eps_nri', 'tangible_book', 'earning_growth_10y']) {
    if (!(key in raw)) { schemaOk = false; fail('snapshot schema ' + name, 'missing ' + key) }
  }
  if (!Array.isArray(raw.financials?.annual)) { schemaOk = false; fail('snapshot schema ' + name, 'annual missing') }
}
schemaOk ? ok('snapshot schema', snapshotFiles(root).length + ' files') : null

// Cross-listing report must cover every curated pair and be honest about mismatches.
const groups = artifact.crossListing.map((row) => row.id)
groups.length === 9 ? ok('cross-listing report', groups.length + ' pairs') : fail('cross-listing report', groups.length + ' pairs')
// Known A-share/H-share input-basis gaps: A files prefer 扣非 EPS while H files carry
// diluted EPS, so a few percent is expected. Any NEW mismatch (or a resolved one that
// this list has not been updated for) fails the gate so a data regression cannot hide
// behind a familiar list.
const KNOWN_CROSS_LISTING_MISMATCHES = ['BOCOM', 'BOC', 'BYD', 'CPIC', 'PING_AN']
const mismatched = artifact.crossListing.filter((row) => row.status === 'input-mismatch').map((row) => row.id).sort()
const expected = [...KNOWN_CROSS_LISTING_MISMATCHES].sort()
const sameMismatches = mismatched.length === expected.length && mismatched.every((id, index) => id === expected[index])
sameMismatches
  ? ok('cross-listing baseline', mismatched.length + ' known input mismatch(es)')
  : fail('cross-listing baseline', 'seen ' + (mismatched.join(', ') || 'none') + ' / expected ' + expected.join(', '))
console.log('     cross-listing input mismatches: ' + (mismatched.length ? mismatched.join(', ') : 'none'))
const notValued = artifact.crossListing.filter((row) => row.status === 'not-valued')
if (notValued.length) console.log('     cross-listing not valued: ' + notValued.map((row) => row.id).join(', '))

// Recompute one entry from the raw file as a last independent check.
let sampleOk = true
for (const symbol of ['SHSE:601398', 'NASDAQ:AAPL', 'NYSE:TSM']) {
  const name = symbol.replace(':', '-') + '.json'
  const raw = readJson('public/data/' + name)
  const stock = toStock(raw)
  const value = policyValue(stock, { rates: readRates(root).rates, generatedAt: artifact.generatedAt })
  const saved = artifact.entries[symbol]
  if (!saved || saved.value !== value.value || JSON.stringify(saved.reasons) !== JSON.stringify(value.reasons)) {
    sampleOk = false
    fail('recompute ' + symbol)
  }
}
sampleOk ? ok('independent recompute', '601398, AAPL, TSM') : null

console.log('')
if (failures.length) {
  console.error('data gate: ' + failures.length + ' check(s) failed')
  process.exit(1)
}
if (warnings.length) console.log('data gate: all structural checks passed; ' + warnings.length + ' freshness warning(s) — refresh when publishing new values')
else console.log('data gate: all checks passed')
