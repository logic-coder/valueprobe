import { availableFacts, estimateAt, round, days } from './as-of-valuation.mjs'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { POLICY_VERSION, POLICY_V1_HASH } from '../../src/lib/policy.js'
import { createHash } from 'node:crypto'
import { median, discountPath } from './owner-earnings.mjs'

const cache = process.env.VALUEPROBE_FACTS_DIR || 'tmp-historical-facts'
const cohort = JSON.parse(readFileSync('scripts/research/dia-2015.json'))
const [header, ...lines] = readFileSync('scripts/research/dia-october.csv', 'utf8').trim().split(/\r?\n/)
const periods = lines.map(line => Object.fromEntries(line.split(',').map((cell, i) => [header.split(',')[i], cell])))
const nasdaq = new Set(['AAPL', 'CSCO', 'INTC', 'MSFT'])
// Exchanges and issuers are anchored at entry. Comparing the parent's price
// after distributions of a new company would drop part of the initial claim.
const breakFrom = { DD: '2017-09', DIS: '2019-03', UTX: '2020-04',
  PFE: '2020-11', MRK: '2021-06', IBM: '2021-11', MMM: '2024-04' }
const split = { NKE: ['2015-12-24', 2], AAPL: ['2020-08-31', 4], WMT: ['2024-02-26', 3] }
const financial = new Set(['AXP', 'GS', 'JPM', 'TRV', 'UNH'])
function observation (ticker, original, period) {
  const date = period.date
  const splitInfo = split[ticker]
  const splitFromStart = splitInfo && date >= splitInfo[0] ? splitInfo[1] : 1
  const price = Number(period[ticker]) || null
  const row = { date, price, splitFromStart }
  if (breakFrom[ticker] && date >= breakFrom[ticker]) return { ...row, reason: 'issuerOrClaimChanged' }
  if (!price) return { ...row, reason: 'noArchivedPrice' }
  const facts = availableFacts(original, date)
  const symbol = (nasdaq.has(ticker) ? 'NASDAQ:' : 'NYSE:') + ticker
  return estimateAt({ symbol, facts, row, splitInfo, yieldRate: period.dgs10, entryYield: periods[0].dgs10, excludeFinancial: financial.has(ticker) })
}

const companies = Object.entries(cohort).map(([ticker, cik]) => {
  const bytes = readFileSync(join(cache, cik + '.json'))
  const original = JSON.parse(bytes)
  if (Number(original.cik) !== cik) throw Error('Unexpected CIK for ' + ticker)
  const rows = periods.map(period => observation(ticker, original, period))
  return { ticker, cik, factsSha256: createHash('sha256').update(bytes).digest('hex'), path: discountPath(rows), rows }
})
const summary = { cohort: companies.length, valued: 0, zero: 0, candidate: 0, paths: {}, discountsOnCandidateSample: { v1: 0, zero: 0, normalizedOnly: 0, candidate: 0 }, epsCount: 0, cashCount: 0 }
const crossings = { withinFiveYears: 0, afterFiveYears: 0, priceLed: 0, lowerEstimateLed: 0,
  noCrossAtEntryRate: 0, observedAgain: 0, laterDiscount: 0 }
const epsErrors = { v1: [], zero: [], candidate: [] }
const cashErrors = { v1EarningsAsCash: [], candidate: [] }
const error = (a, b) => a === 0 && b === 0 ? 0 : 200 * Math.abs(a - b) / (Math.abs(a) + Math.abs(b))
for (const { rows, path } of companies) {
  const first = rows[0]
  const last = rows.at(-1)
  for (const [key, prop] of [['valued', 'value'], ['zero', 'zero'], ['candidate', 'candidate']]) if (first[prop] > 0) summary[key]++
  summary.paths[path.status] = (summary.paths[path.status] || 0) + 1
  if (path.status === 'observedCrossing') {
    crossings[path.year <= 5 ? 'withinFiveYears' : 'afterFiveYears']++
    crossings[path.driver === 'price' ? 'priceLed' : 'lowerEstimateLed']++
    if (path.crossedAtEntryRate === false) crossings.noCrossAtEntryRate++
    const later = rows.slice(path.year + 1).filter(r => r.price > 0 && r.value > 0)
    if (later.length) crossings.observedAgain++
    if (later.some(r => r.price < r.value)) crossings.laterDiscount++
  }
  if (first.candidate > 0) {
    for (const [key, prop] of [['v1', 'value'], ['zero', 'zero'], ['normalizedOnly', 'normalizedOnly'], ['candidate', 'candidate']]) {
      if (first[prop] > first.price) summary.discountsOnCandidateSample[key]++
    }
  }
  if (!first.candidate || !Number.isFinite(last.eps)) continue
  if (first.epsPeriod === last.epsPeriod && Math.abs(days(last.epsDate, first.epsDate) - 3652.5) < 50) {
    summary.epsCount++
    const actual = last.eps * last.splitFromStart
    for (const [key, prop] of [['v1', 'v1Eps10'], ['zero', 'eps'], ['candidate', 'candidateEps10']]) epsErrors[key].push(error(first[prop], actual))
  }
  if (Number.isFinite(last.fcf) && Math.abs(days(last.annualDate + '-01', first.annualDate + '-01') - 3652.5) < 50) {
    summary.cashCount++
    const actual = last.fcf * last.splitFromStart
    cashErrors.v1EarningsAsCash.push(error(first.v1Eps10, actual))
    cashErrors.candidate.push(error(first.distributable10, actual))
  }
}
summary.epsSmape = Object.fromEntries(Object.entries(epsErrors).map(([key, values]) => [key, round(median(values))]))
summary.cashProxySmape = Object.fromEntries(Object.entries(cashErrors).map(([key, values]) => [key, round(median(values))]))
const differences = cashErrors.candidate.map((err, i) => round(cashErrors.v1EarningsAsCash[i] - err))
const leaveOneOut = differences.length < 2 ? [] : differences.map((_, excluded) =>
  median(cashErrors.v1EarningsAsCash.filter((_, i) => i !== excluded)) -
  median(cashErrors.candidate.filter((_, i) => i !== excluded)))
summary.cashComparison = { candidateCloser: differences.filter(d => d > 0).length,
  v1Closer: differences.filter(d => d < 0).length, tied: differences.filter(d => d === 0).length,
  leaveOneOutMedianAdvantage: leaveOneOut.length ? [round(Math.min(...leaveOneOut)), round(Math.max(...leaveOneOut))] : null }
summary.crossings = crossings
const report = { policy: POLICY_VERSION, policyHash: POLICY_V1_HASH, researchVersion: 1, summary, companies }
mkdirSync('public/research', { recursive: true })
const output = 'public/research/dia-2015.json'
const serialized = JSON.stringify(report, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== serialized) throw Error('Historical inputs or results differ from the published replay')
} else {
  writeFileSync(output, serialized)
}
console.log(JSON.stringify(summary, null, 2))
