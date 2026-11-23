/**
 * Report-only freshness summary of the committed official artifact.
 * Does not fetch upstream, rewrite snapshots, or change publish.json.
 *
 *   npm run check:freshness
 */
import { readFileSync } from 'node:fs'
import { POLICY_VERSION } from '../src/lib/policy.js'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const artifact = read('public/data/intrinsic/' + POLICY_VERSION + '.json')
const publish = read('public/data/publish.json')

const count = (code, field = 'warnings') =>
  Object.values(artifact.entries).filter((entry) => (entry[field] || []).includes(code)).length

const report = {
  generatedAt: artifact.generatedAt,
  publishStatus: publish.status,
  upstreamCheckedAt: publish.upstreamCheckedAt,
  valued: Object.values(artifact.entries).filter((entry) => entry.status === 'ok').length,
  refused: Object.values(artifact.entries).filter((entry) => entry.status === 'refused').length,
  STALE_DATA: count('STALE_DATA'),
  STALE_PRICE: count('STALE_PRICE'),
  QUOTE_DATE_UNKNOWN: count('QUOTE_DATE_UNKNOWN'),
  EARNINGS_DATE_UNKNOWN: count('EARNINGS_DATE_UNKNOWN'),
}

const lines = [
  'Freshness report (committed files only; no upstream fetch, no writes)',
  'generatedAt: ' + report.generatedAt,
  'publish.status: ' + report.publishStatus,
  'upstreamCheckedAt: ' + (report.upstreamCheckedAt ?? 'null'),
  'coverage: ' + report.valued + ' valued / ' + report.refused + ' refused',
  'STALE_DATA: ' + report.STALE_DATA,
  'STALE_PRICE: ' + report.STALE_PRICE,
  'QUOTE_DATE_UNKNOWN: ' + report.QUOTE_DATE_UNKNOWN,
  'EARNINGS_DATE_UNKNOWN: ' + report.EARNINGS_DATE_UNKNOWN,
]

if (report.upstreamCheckedAt == null) {
  lines.push('A first public release still needs a dated upstream check. Do not invent missing EPS or write an undated quote.')
}

console.log(lines.join('\n'))
