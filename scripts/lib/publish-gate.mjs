import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { POLICY_VERSION } from '../../src/lib/policy.js'
import { useQuote } from './snapshot-transport.mjs'

export const PUBLISH_PATH = 'public/data/publish.json'

/** SHA-256 of the exact bytes the release writes. */
export function releaseDigest (artifact, manifest) {
  const body = JSON.stringify(artifact, null, 2) + '\n' + JSON.stringify(manifest, null, 2) + '\n'
  return createHash('sha256').update(body).digest('hex')
}

export async function previousRelease (liveDir) {
  const read = (path) => readFile(resolve(liveDir, path), 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  // The live artifact is the previous release; fall back one version for the first run after a bump.
  const previous = 'v' + Math.max(1, Number(POLICY_VERSION.slice(1)) - 1)
  return { artifact: await read('intrinsic/' + POLICY_VERSION + '.json') || await read('intrinsic/' + previous + '.json'), publish: await read('publish.json') }
}

function valuedByMarket (artifact) {
  const byMarket = {}
  for (const [symbol, entry] of Object.entries(artifact?.entries || {})) {
    const market = symbol.split(':')[0]
    byMarket[market] ??= { declared: 0, valued: 0 }
    byMarket[market].declared++
    if (entry.status === 'ok') byMarket[market].valued++
  }
  return byMarket
}

/**
 * Decide whether a staging run may replace the published batch.
 * Failures that kept the previous record are disclosed and allowed; a whole
 * required chain, a targeted request, or a large coverage loss is not.
 */
export function assessPublish ({ mode, scope, outcomes, previous, current, rates }) {
  const blocked = []
  const partial = []
  const quoteRequired = mode !== 'fundamentals'
  const fundamentalsRequired = mode !== 'quotes'
  const active = outcomes.length

  if (rates?.requested) {
    for (const code of [...(rates.failed || []), ...(rates.kept || [])]) partial.push('rate kept from existing: ' + code)
    if (!rates.live?.length && !rates.kept?.length) blocked.push('no currency yield')
  }

  if (active && quoteRequired && outcomes.every((row) => row.quote.startsWith('failed'))) {
    blocked.push('every quote request failed')
  }
  if (active && fundamentalsRequired && outcomes.every((row) => row.fundamental.startsWith('failed'))) {
    blocked.push('every fundamentals request failed')
  }
  for (const row of outcomes) {
    if (scope === 'targeted' && quoteRequired && row.quote.startsWith('failed')) blocked.push('requested quote failed: ' + row.symbol)
    if (scope === 'targeted' && fundamentalsRequired && row.fundamental.startsWith('failed')) blocked.push('requested fundamentals failed: ' + row.symbol)
    if (row.quote === 'failed-kept') partial.push('kept quote: ' + row.symbol)
    if (row.fundamental === 'failed-kept') partial.push('kept fundamentals: ' + row.symbol)
  }

  if (previous?.coverage && current?.coverage) {
    const before = previous.coverage
    const now = current.coverage
    if (before.valued > 0 && now.valued < Math.ceil(before.valued * 0.9)) {
      blocked.push('valued count fell from ' + before.valued + ' to ' + now.valued + ' (over 10%)')
    }
    const extraRefused = now.refused - before.refused
    const allowed = Math.max(5, Math.ceil((previous.universe?.declared || 0) * 0.02))
    if (extraRefused > allowed) blocked.push('refused count rose by ' + extraRefused + ' (allowed ' + allowed + ')')
    const oldMarkets = valuedByMarket(previous)
    const newMarkets = valuedByMarket(current)
    for (const [market, stats] of Object.entries(oldMarkets)) {
      if (stats.valued > 0 && (newMarkets[market]?.valued || 0) === 0) blocked.push('market lost every value: ' + market)
    }
  }

  const unchanged = active > 0 && outcomes.every((row) =>
    (!quoteRequired || row.quote === 'unchanged' || row.quote === 'skipped') &&
    (!fundamentalsRequired || row.fundamental === 'verified-unchanged' || row.fundamental === 'skipped'))
  const status = blocked.length ? 'blocked' : partial.length ? 'partial' : unchanged ? 'verified-unchanged' : 'ok'
  return { status, blocked, partial }
}

export function classifyOutcome ({ mode, quote, prev, patch, fundamentals, fundamentalError }) {
  const quoteResult = mode === 'fundamentals' ? 'skipped'
    : !quote ? (prev ? 'failed-kept' : 'failed-missing')
      : prev ? (useQuote(prev, quote) === prev ? 'unchanged' : 'updated') : 'updated'
  const fundamentalResult = mode === 'quotes' ? 'skipped'
    : fundamentalError ? (prev ? 'failed-kept' : 'failed-missing')
      : !fundamentals ? 'failed-missing'
        : patch?.eps_as_of && (!prev?.eps_as_of || patch.eps_as_of > prev.eps_as_of) ? 'new-period' : 'verified-unchanged'
  return { quote: quoteResult, fundamental: fundamentalResult }
}

export function publishStatus (assessment) {
  return assessment.blocked.length ? 'blocked' : assessment.partial.length ? 'partial' : assessment.status
}

export function latestPeriod (artifact) {
  let latest = null
  for (const entry of Object.values(artifact?.entries || {})) {
    const date = entry.earningsDate
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || '') && (!latest || date > latest)) latest = date
  }
  return latest
}

export function publishState ({ status, blocked = [], partial = [], mode, scope, rates, generatedAt, upstreamCheckedAt, artifact, manifest, previousBatch }) {
  return {
    schema: 1,
    status,
    blocked,
    partial,
    mode,
    scope,
    rates: rates && { requested: Boolean(rates.requested), live: rates.live || [], kept: rates.kept || [], failed: rates.failed || [] },
    generatedAt,
    upstreamCheckedAt,
    latestPeriod: latestPeriod(artifact),
    batch: releaseDigest(artifact, manifest),
    previousBatch: previousBatch || null,
  }
}

export function isPublishReady (state, artifact, manifest) {
  if (!state || state.schema !== 1 || state.status === 'blocked' || (state.blocked || []).length) return false
  if (!['ok', 'partial', 'verified-unchanged', 'rebuilt'].includes(state.status)) return false
  if (state.batch !== releaseDigest(artifact, manifest)) return false
  if (state.generatedAt !== artifact.generatedAt) return false
  // A local rebuild does not touch upstream: its check time is inherited or unknown.
  if (state.status === 'rebuilt') return state.upstreamCheckedAt === null || Number.isFinite(Date.parse(state.upstreamCheckedAt))
  return Date.parse(state.upstreamCheckedAt) >= Date.parse(state.generatedAt)
}
