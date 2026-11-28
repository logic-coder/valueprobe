// Build the committed intrinsic-value artifact and data manifest from the
// committed snapshots. Deterministic: the same files and generatedAt produce the
// same bytes, so both scripts/policy-values.mjs (write) and scripts/verify-data.mjs
// (check) call this one function.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { POLICY_VERSION, POLICY_V1, POLICY_V1_HASH, policyValue } from '../../src/lib/policy.js'
import { WARNING_ORDER, REASON_ORDER, REASON, isKnownReason, isKnownWarning } from '../../src/lib/reasons.js'
import { toStock } from '../../src/lib/stockRecord.js'
import { quoteUnitReconciliation } from '../../src/lib/unreconciledUnits.js'
import { LISTING_GROUPS } from '../../src/data/listingGroups.js'

export const DATA_DIR = 'public/data'
export const ARTIFACT_PATH = 'public/data/intrinsic/' + POLICY_VERSION + '.json'
export const MANIFEST_PATH = 'public/data/manifest.json'
export const SNAPSHOT_PATTERN = /^[A-Z]{2,}-.+\.json$/
export const CURRENCY_ORDER = ['CNY', 'USD', 'HKD']
export const CROSS_LISTING_VALUE_GAP_PCT = POLICY_V1.crossListing.valueGapReviewPct
export const CROSS_LISTING_REVIEWS = {
  BYD: { maxAbsGapPct: 55, reviewedAt: '2026-11-27', expiresAt: '2027-02-25' },
}

export function crossListingReview (row, asOf) {
  if (row.valueDiffPct == null || Math.abs(row.valueDiffPct) <= CROSS_LISTING_VALUE_GAP_PCT) {
    return { required: false, allowed: true, reason: null }
  }
  const review = CROSS_LISTING_REVIEWS[row.id]
  const reviewTime = Date.parse(review?.reviewedAt)
  const expiryTime = Date.parse(review?.expiresAt)
  const asOfTime = Date.parse(asOf)
  const withinWindow = Number.isFinite(reviewTime) && Number.isFinite(expiryTime) && Number.isFinite(asOfTime)
    && asOfTime >= reviewTime && asOfTime <= expiryTime
  const withinCap = Number.isFinite(review?.maxAbsGapPct) && Math.abs(row.valueDiffPct) <= review.maxAbsGapPct
  const allowed = Boolean(review) && withinWindow && withinCap
  return {
    required: true,
    allowed,
    reason: allowed ? null : !review ? 'review-missing' : !withinCap ? 'gap-over-review-cap' : 'expired-or-undated',
  }
}

const readJson = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const round2 = (value) => Math.round(value * 100) / 100
const round4 = (value) => Math.round(value * 10_000) / 10_000
const sortedObject = (rows, order) => Object.fromEntries(order.filter((key) => rows[key] != null).map((key) => [key, rows[key]]))

export function policyHash () {
  return sha256(JSON.stringify(POLICY_V1))
}

export function snapshotFiles (root, dataDir = DATA_DIR) {
  return readdirSync(resolve(root, dataDir))
    .filter((name) => SNAPSHOT_PATTERN.test(name))
    .sort()
}

export function readRates (root, dataDir = DATA_DIR) {
  const raw = readJson(root, dataDir + '/rates.json')
  const entry = (row) => {
    if (!row || row.value === null || row.value === undefined || row.value === '') return null
    const value = Number(row.value)
    return Number.isFinite(value) ? { value, asOf: String(row.as_of || row.asOf || ''), source: 'snapshot' } : null
  }
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
const entryOf = (symbol, stock, value) => {
  const unitUnreconciled = value.reasons.includes(REASON.UNIT_UNRECONCILED)
  const inputs = value.status === 'refused' && unitUnreconciled
    ? Object.fromEntries(['model', 'currency', 'reportingCurrency', 'reportingCurrencySource', 'perShareCurrency', 'perShareFxToQuote', 'rate']
      .filter((key) => value.inputs[key] != null).map((key) => [key, value.inputs[key]]))
    : value.inputs
  return {
    symbol,
    name: stock.company || symbol,
    status: value.status,
    value: value.value,
    band: value.band,
    terminalShare: value.terminalShare,
    cash: value.cash,
    price: value.price,
    priceDate: value.priceDate,
    ...(value.comparisonStatus ? { comparisonStatus: value.comparisonStatus } : {}),
    marginOfSafety: value.marginOfSafety,
    reasons: value.reasons,
    warnings: value.warnings,
    inputs,
    asOf: value.asOf,
    earningsDate: value.earningsDate,
    earningsPeriod: value.earningsPeriod,
    earningsSource: value.earningsSource,
    ratesAsOf: value.ratesAsOf,
  }
}

const pctGap = (a, hInA) => a != null && hInA != null && a !== 0
  ? round2((hInA / a - 1) * 100)
  : null

/** Same-period A/H inputs, converted into the A-share quote currency. */
const crossListingOf = (groups, entries, rawBySymbol) => {
  const rows = []
  for (const group of groups) {
    const a = entries[group.a]
    const h = entries[group.h]
    const fx = Number(rawBySymbol[group.h]?.fx_to_quote)
    const inA = (value) => value != null && fx > 0 ? round4(value / fx) : null
    const epsGap = pctGap(a?.inputs?.eps, inA(h?.inputs?.eps))
    const growthGap = a?.inputs?.growth != null && h?.inputs?.growth != null ? round2(a.inputs.growth - h.inputs.growth) : null
    const bookGap = pctGap(a?.inputs?.tangibleBook, inA(h?.inputs?.tangibleBook))
    const rateGap = a?.inputs?.discountRate != null && h?.inputs?.discountRate != null ? round2(a.inputs.discountRate - h.inputs.discountRate) : null
    const valueHInA = h?.value != null && fx > 0 ? round4(h.value / fx) : null
    const valueDiffPct = pctGap(a?.value, valueHInA)
    const reasons = []
    if (!(fx > 0)) reasons.push('FX_MISSING')
    if (a?.earningsPeriod !== h?.earningsPeriod || a?.earningsDate !== h?.earningsDate) reasons.push('PERIOD')
    if (epsGap == null) reasons.push('EPS_MISSING')
    // A-share EPS prefers 扣非 while H files carry diluted EPS; a few percent of
    // basis difference is normal. Larger gaps are a data problem, not a market one.
    else if (Math.abs(epsGap) > 5) reasons.push('EPS_BASIS')
    if (growthGap == null) reasons.push('GROWTH_MISSING')
    else if (Math.abs(growthGap) > 2) reasons.push('GROWTH')
    if (bookGap == null) reasons.push('BOOK_MISSING')
    else if (Math.abs(bookGap) > 5) reasons.push('BOOK_BASIS')
    if (rateGap == null) reasons.push('RATE_MISSING')
    else if (Math.abs(rateGap) >= 1) reasons.push('RATE_CURRENCY')
    if (valueDiffPct != null && Math.abs(valueDiffPct) > CROSS_LISTING_VALUE_GAP_PCT) reasons.push('VALUE_GAP')
    const aligned = epsGap != null && growthGap != null && !reasons.includes('PERIOD') && Math.abs(epsGap) <= 5 && Math.abs(growthGap) <= 2
    rows.push({
      id: group.id,
      a: group.a,
      h: group.h,
      status: a?.status !== 'ok' || h?.status !== 'ok' ? 'not-valued' : aligned && !reasons.includes('VALUE_GAP') ? 'aligned' : 'input-mismatch',
      valueA: a?.value ?? null,
      valueH: h?.value ?? null,
      fxToA: fx > 0 ? fx : null,
      valueHInA,
      epsFxDiffPct: epsGap,
      growthDiffPp: growthGap,
      valueDiffPct,
      bridge: {
        eps: { a: a?.inputs?.eps ?? null, hInA: inA(h?.inputs?.eps), diffPct: epsGap },
        growth: { a: a?.inputs?.growth ?? null, h: h?.inputs?.growth ?? null, diffPp: growthGap },
        book: { a: a?.inputs?.tangibleBook ?? null, hInA: inA(h?.inputs?.tangibleBook), diffPct: bookGap },
        discountRate: { a: a?.inputs?.discountRate ?? null, h: h?.inputs?.discountRate ?? null, diffPp: rateGap },
      },
      reasons,
    })
  }
  return rows
}

/**
 * @param {{root?: string, generatedAt?: string}} options
 * @returns {{artifact: object, manifest: object, problems: string[]}}
 */
export function buildArtifacts ({ root = process.cwd(), dataDir = DATA_DIR, generatedAt = new Date().toISOString().slice(0, 10),
  declared = readJson(root, 'scripts/watchlist.json') } = {}) {
  const problems = []
  const hash = policyHash()
  if (hash !== POLICY_V1_HASH) problems.push('POLICY_V1 changed without bumping POLICY_VERSION: update POLICY_V1_HASH and the version together')

  const files = snapshotFiles(root, dataDir)
  const rates = readRates(root, dataDir)
  const rawBySymbol = {}
  const entries = {}
  const counts = { valued: 0, refused: 0, reasons: {}, warnings: {}, models: {}, currencies: {} }
  for (const name of files) {
    const raw = readJson(root, dataDir + '/' + name)
    const stock = toStock(raw)
    if (!stock) {
      problems.push('unreadable snapshot ' + name)
      continue
    }
    const symbol = stock.exchange_ + ':' + stock.symbol
    rawBySymbol[symbol] = raw
    if (name !== symbol.replace(':', '-') + '.json') problems.push('snapshot identity mismatch: ' + name)
    if (!Array.isArray(raw.financials?.annual)) problems.push('snapshot annual data missing: ' + name)
    const unit = quoteUnitReconciliation(stock)
    if (!unit.metadataComplete) problems.push('snapshot unit metadata incomplete: ' + symbol + ' (' + unit.reason + ')')
    const value = policyValue(stock, { rates: rates.rates, generatedAt })
    if (value.status === 'ok' && !unit.ok) problems.push('published value has unreconciled quote units: ' + symbol + ' (' + unit.reason + ')')
    entries[symbol] = entryOf(symbol, stock, value)
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
  const snapshotSymbols = Object.keys(sortedEntries).sort()
  const missing = declared.filter((symbol) => !sortedEntries[symbol])
  const declaredSet = new Set(declared)
  const extra = snapshotSymbols.filter((symbol) => !declaredSet.has(symbol))
  if (missing.length) problems.push('declared symbols without a snapshot: ' + missing.join(', '))
  if (extra.length) problems.push('snapshots outside the declared universe: ' + extra.join(', '))

  const crossListing = crossListingOf(LISTING_GROUPS, sortedEntries, rawBySymbol)
  for (const row of crossListing) {
    const review = crossListingReview(row, generatedAt)
    if (review.required && !review.allowed) {
      problems.push('cross-listing value gap requires review: ' + row.id + ' (' + row.valueDiffPct + '%; ' + review.reason + ')')
    }
  }

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
    crossListing,
    entries: sortedEntries,
  }

  const manifestFiles = ['catalog.json', 'rates.json'].map((name) => {
    const path = dataDir + '/' + name
    const body = readFileSync(resolve(root, path))
    return { name, bytes: body.length, sha256: sha256(body) }
  })
  const catalog = readJson(root, dataDir + '/catalog.json')
  const catalogSymbols = catalog.map(row => row?.symbol).sort()
  if (JSON.stringify(catalogSymbols) !== JSON.stringify(snapshotSymbols)) problems.push('catalog and valuation entries disagree')
  for (const name of files) {
    const path = dataDir + '/' + name
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
