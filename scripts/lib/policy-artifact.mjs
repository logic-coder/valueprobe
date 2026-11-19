// Build the committed intrinsic-value artifact and data manifest from the
// committed snapshots. Deterministic: the same files and generatedAt produce the
// same bytes, so both scripts/policy-values.mjs (write) and scripts/verify-data.mjs
// (check) call this one function.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { POLICY_VERSION, POLICY_V1, POLICY_V1_HASH, policyValue } from '../../src/lib/policy.js'
import { WARNING_ORDER, REASON_ORDER, isKnownReason, isKnownWarning } from '../../src/lib/reasons.js'
import { toStock } from '../../src/lib/stockRecord.js'
import { LISTING_GROUPS } from '../../src/data/listingGroups.js'

export const DATA_DIR = 'public/data'
export const ARTIFACT_PATH = 'public/data/intrinsic/v1.json'
export const MANIFEST_PATH = 'public/data/manifest.json'
export const SNAPSHOT_PATTERN = /^[A-Z]{2,}-.+\.json$/
export const CURRENCY_ORDER = ['CNY', 'USD', 'HKD']

const readJson = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const round2 = (value) => Math.round(value * 100) / 100
const sortedObject = (rows, order) => Object.fromEntries(order.filter((key) => rows[key] != null).map((key) => [key, rows[key]]))

export function policyHash () {
  return sha256(JSON.stringify(POLICY_V1))
}

export function snapshotFiles (root, dataDir = DATA_DIR) {
  return readdirSync(resolve(root, dataDir))
    .filter((name) => SNAPSHOT_PATTERN.test(name))
    .sort()
}

export function readRates (root) {
  const raw = readJson(root, DATA_DIR + '/rates.json')
  const entry = (row) => (row && Number(row.value) > 0 ? { value: Number(row.value), asOf: String(row.as_of || row.asOf || ''), source: 'snapshot' } : null)
  const usd = entry(raw.USD)
  return {
    asOf: String(raw.as_of || ''),
    // The artifact carries the exact rows the values used, including the HKD proxy
    // so a reader can recompute an H-share value without guessing.
    rates: {
      CNY: entry(raw.CNY),
      USD: usd,
      HKD: usd ? { value: usd.value, asOf: usd.asOf, source: 'usd_proxy', proxy: 'USD' } : null,
    },
  }
}

/** Public look of one entry: numbers rounded once, fixed key order. */
const entryOf = (symbol, value) => ({
  symbol,
  status: value.status,
  value: value.value,
  band: value.band,
  terminalShare: value.terminalShare,
  price: value.price,
  marginOfSafety: value.marginOfSafety,
  reasons: value.reasons,
  warnings: value.warnings,
  inputs: value.inputs,
  asOf: value.asOf,
  ratesAsOf: value.ratesAsOf,
})

const crossListingOf = (groups, entries, rawBySymbol) => {
  const rows = []
  for (const group of groups) {
    const a = entries[group.a]
    const h = entries[group.h]
    const fx = Number(rawBySymbol[group.h]?.fx_to_quote)
    const epsA = a?.inputs?.eps
    const epsH = h?.inputs?.eps
    const growthA = a?.inputs?.growth
    const growthH = h?.inputs?.growth
    const epsFxDiffPct = epsA > 0 && epsH > 0 && fx > 0 ? round2(((epsH / fx) / epsA - 1) * 100) : null
    const growthDiffPp = growthA != null && growthH != null ? round2(growthA - growthH) : null
    const valueHInA = h?.value != null && fx > 0 ? h.value / fx : null
    const diffPct = a?.value != null && valueHInA != null ? round2((a.value / valueHInA - 1) * 100) : null
    const aligned = epsFxDiffPct != null && growthDiffPp != null
      // A-share EPS prefers 扣非 while H files carry diluted EPS; a few percent of
      // basis difference is normal. Larger gaps are a data problem, not a market one.
      && Math.abs(epsFxDiffPct) <= 5 && Math.abs(growthDiffPp) <= 2
    rows.push({
      id: group.id,
      a: group.a,
      h: group.h,
      status: a?.status !== 'ok' || h?.status !== 'ok' ? 'not-valued' : aligned ? 'aligned' : 'input-mismatch',
      valueA: a?.value ?? null,
      valueH: h?.value ?? null,
      fxToA: fx > 0 ? fx : null,
      epsFxDiffPct,
      growthDiffPp,
      valueDiffPct: diffPct,
    })
  }
  return rows
}

/**
 * @param {{root?: string, generatedAt?: string}} options
 * @returns {{artifact: object, manifest: object, problems: string[]}}
 */
export function buildArtifacts ({ root = process.cwd(), generatedAt = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = []
  const hash = policyHash()
  if (hash !== POLICY_V1_HASH) problems.push('POLICY_V1 changed without bumping POLICY_VERSION: update POLICY_V1_HASH and the version together')

  const files = snapshotFiles(root)
  const rawBySymbol = {}
  const entries = {}
  const counts = { valued: 0, refused: 0, reasons: {}, warnings: {}, models: {}, currencies: {} }
  for (const name of files) {
    const raw = readJson(root, DATA_DIR + '/' + name)
    const stock = toStock(raw)
    if (!stock) {
      problems.push('unreadable snapshot ' + name)
      continue
    }
    const symbol = stock.exchange_ + ':' + stock.symbol
    rawBySymbol[symbol] = raw
    const value = policyValue(stock, { rates: readRates(root).rates, generatedAt })
    entries[symbol] = entryOf(symbol, value)
    if (value.status === 'ok') counts.valued++
    else counts.refused++
    for (const code of value.reasons) {
      if (!isKnownReason(code)) problems.push('unknown reason ' + code + ' on ' + symbol)
      counts.reasons[code] = (counts.reasons[code] || 0) + 1
    }
    for (const code of value.warnings) {
      if (!isKnownWarning(code)) problems.push('unknown warning ' + code + ' on ' + symbol)
      counts.warnings[code] = (counts.warnings[code] || 0) + 1
    }
    counts.models[value.inputs.model] = (counts.models[value.inputs.model] || 0) + 1
    const currency = value.inputs.currency || 'unknown'
    counts.currencies[currency] = (counts.currencies[currency] || 0) + 1
  }

  const sortedEntries = Object.fromEntries(Object.keys(entries).sort().map((symbol) => [symbol, entries[symbol]]))
  const declared = readJson(root, 'scripts/watchlist.json')
  const snapshotSymbols = Object.keys(sortedEntries).sort()
  const missing = declared.filter((symbol) => !sortedEntries[symbol])
  const extra = snapshotSymbols.filter((symbol) => !declared.includes(symbol))
  if (missing.length) problems.push('declared symbols without a snapshot: ' + missing.join(', '))
  if (extra.length) problems.push('snapshots outside the declared universe: ' + extra.join(', '))

  const rates = readRates(root)
  const artifact = {
    schema: 1,
    policyVersion: POLICY_VERSION,
    policyHash: hash,
    generatedAt,
    rates: { asOf: rates.asOf, ...rates.rates },
    universe: { declared: declared.length, snapshots: files.length, missing },
    coverage: {
      valued: counts.valued,
      refused: counts.refused,
      reasons: sortedObject(counts.reasons, REASON_ORDER),
      warnings: sortedObject(counts.warnings, WARNING_ORDER),
      models: Object.fromEntries(Object.entries(counts.models).sort()),
      currencies: Object.fromEntries(CURRENCY_ORDER.filter((code) => counts.currencies[code] != null).map((code) => [code, counts.currencies[code]])),
    },
    crossListing: crossListingOf(LISTING_GROUPS, sortedEntries, rawBySymbol),
    entries: sortedEntries,
  }

  const manifestFiles = ['catalog.json', 'rates.json'].map((name) => {
    const path = DATA_DIR + '/' + name
    const body = readFileSync(resolve(root, path))
    return { name, bytes: body.length, sha256: sha256(body) }
  })
  for (const name of files) {
    const path = DATA_DIR + '/' + name
    const body = readFileSync(resolve(root, path))
    manifestFiles.push({ name, bytes: body.length, sha256: sha256(body) })
  }
  manifestFiles.sort((left, right) => left.name.localeCompare(right.name))

  const manifest = {
    schema: 1,
    policyVersion: POLICY_VERSION,
    policyHash: hash,
    generatedAt,
    dataAsOf: rates.asOf,
    universe: artifact.universe,
    counts: { snapshots: files.length, valued: counts.valued, refused: counts.refused },
    rates: artifact.rates,
    files: manifestFiles,
  }

  return { artifact, manifest, problems }
}

export { round2, sha256, statSync }
