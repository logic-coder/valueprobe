import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { availableFacts, days, estimateAt, round } from './as-of-valuation.mjs'
import { median } from './owner-earnings.mjs'
import { fundamentalsFromFacts } from '../../src/data/providers/edgar-xbrl.js'
import { V1_POLICY as POLICY_VERSION, V1_POLICY_HASH as POLICY_V1_HASH } from './kernel-v1.mjs'

const read = path => JSON.parse(readFileSync(path))
const roster = read('scripts/research/sectors-2015.json')
const entries = read('scripts/research/holdout-entry.json')
const shareAudit = read('scripts/research/holdout-share-basis.json')
const annualReports = read('scripts/research/holdout-cfo.json')
const start = '2015-12-31'
const end = '2025-12-31'
const periodsMatch = (a, b) => Math.abs(days(b, a) - 3652.5) < 50
const smape = (a, b) => a === 0 && b === 0 ? 0 : 200 * Math.abs(a - b) / (Math.abs(a) + Math.abs(b))

// Match both cash items to the exact dates of the same full fiscal year.
function capitalBurden (facts, annual, ticker) {
  const gaap = facts.facts['us-gaap'] || {}
  const tags = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets',
    'PaymentsToAcquireOtherPropertyPlantAndEquipment', 'PurchaseOfPropertyAndEquipment']
  const years = annual.filter(r => r.eps_without_nri != null).slice(-3).map(r => r.date)
  if (years.length !== 3 || Number(years[2].slice(0, 4)) - Number(years[0].slice(0, 4)) !== 2) return null
  const items = []
  for (const month of years) {
    const records = tag => (gaap[tag]?.units.USD || []).filter(r => r.form === '10-K' &&
      r.end.slice(0, 7) === month && days(r.end, r.start) >= 350 && days(r.end, r.start) <= 380)
      .sort((a, b) => b.filed.localeCompare(a.filed))
    const capexRows = tags.flatMap(records)
    let cfo = records('NetCashProvidedByUsedInOperatingActivities')[0]
    const reported = annualReports[ticker]?.millions[month]
    if (!cfo && reported && capexRows.length) cfo = { ...capexRows[0], val: reported * 1e6 }
    if (!cfo) return null
    const capex = capexRows.find(r => r.start === cfo.start && r.end === cfo.end)
    if (!capex) return null
    const shares = (gaap.WeightedAverageNumberOfDilutedSharesOutstanding?.units.shares || [])
      .filter(r => r.form === '10-K' && r.start === cfo.start && r.end === cfo.end)
      .sort((a, b) => b.filed.localeCompare(a.filed))[0]?.val
    items.push({ end: cfo.end, cfo: cfo.val, capex: Math.abs(capex.val), dilutedShares: shares ?? null })
  }
  const cash = items.reduce((s, r) => s + r.cfo, 0)
  if (!(cash > 0)) return null
  const ratio = items.reduce((s, r) => s + r.capex, 0) / cash
  return { ratio: round(ratio), group: ratio >= 0.5 ? 'high' : 'other', items }
}

function company (ticker, cik) {
  const bytes = readFileSync(join(process.env.VALUEPROBE_FACTS_DIR || 'tmp-historical-facts', cik + '.json'))
  const raw = JSON.parse(bytes)
  if (Number(raw.cik) !== cik) throw Error('Wrong filing entity for ' + ticker)
  const anchor = entries[ticker]
  const price = Math.round(100 * anchor.decValue / anchor.decShares) / 100
  const symbol = (['CTSH', 'ADP', 'BRCM', 'EBAY'].includes(ticker) ? 'NASDAQ:' : 'NYSE:') + ticker
  const facts = availableFacts(raw, start)
  const initial = estimateAt({ facts, symbol, row: { date: start, price, splitFromStart: 1 }, yieldRate: 2.27, entryYield: 2.27, excludeFinancial: false })
  const result = { ticker, cik, fund: anchor.fund, rank: anchor.rank, factsSha256: createHash('sha256').update(bytes).digest('hex'),
    initial, burden: capitalBurden(facts, fundamentalsFromFacts(symbol, facts, { replayV1: true }).financials.annual, ticker) }
  const latest = result.burden?.items.at(-1)
  result.initialCashProxy = initial.fcf ?? (latest?.dilutedShares > 0
    ? round((latest.cfo - latest.capex) / latest.dilutedShares) : null)
  const basis = shareAudit[ticker]
  if (!basis || !(basis.factor > 0)) return { ...result, outcomeStatus: basis?.reason || 'unverifiedShareBasis' }
  const later = fundamentalsFromFacts(symbol, availableFacts(raw, end), { replayV1: true })
  const last = later.financials.annual.filter(r => r.eps_without_nri != null).at(-1)
  const f = later.fields
  const epsOK = Number.isFinite(f.ttm_eps) && initial.epsPeriod === f.eps_period && periodsMatch(initial.epsDate, f.eps_as_of)
  const cashOK = last && Number.isFinite(last.free_cash_flow_per_share) &&
    periodsMatch(initial.annualDate + '-01', last.date + '-01')
  result.outcomeStatus = epsOK && cashOK ? 'aligned' : 'partial'
  result.actual = { eps: epsOK ? round(f.ttm_eps * basis.factor) : null, epsPeriod: f.eps_period,
    epsDate: f.eps_as_of, cash: cashOK ? round(last.free_cash_flow_per_share * basis.factor) : null, cashPeriod: last?.date ?? null }
  if (epsOK && cashOK && initial.eps > 0 && result.initialCashProxy > 0) {
    result.compounder = result.actual.eps >= 2 * initial.eps && result.actual.cash >= 2 * result.initialCashProxy
  }
  if (initial.candidate > 0 && cashOK) {
    result.cashErrors = { v1Signed: round(initial.v1Eps10 - result.actual.cash),
      candidateSigned: round(initial.distributable10 - result.actual.cash),
      v1: round(smape(initial.v1Eps10, result.actual.cash)), zero: round(smape(initial.eps, result.actual.cash)),
      candidate: round(smape(initial.distributable10, result.actual.cash)) }
  }
  if (initial.candidate > 0 && epsOK) result.epsErrors = { v1: round(smape(initial.v1Eps10, result.actual.eps)),
    zero: round(smape(initial.eps, result.actual.eps)), candidate: round(smape(initial.candidateEps10, result.actual.eps)) }
  // Preserve the mechanical match so readers can audit this perimeter exclusion.
  const separation = { HPQ: '2015-11', EBAY: '2015-07' }[ticker]
  if (separation && initial.annualDate < separation) {
    const { actual, cashErrors, epsErrors, compounder, ...entry } = result
    return { ...entry, outcomeStatus: 'lastEntryFYPrecedesSeparation',
      excludedComparison: { actual, cashErrors, epsErrors, compounder } }
  }
  return result
}

const companies = Object.entries(roster).map(([ticker, cik]) => company(ticker, cik))
const summary = { cohort: companies.length, valued: companies.filter(c => c.initial.value > 0).length,
  zero: companies.filter(c => c.initial.zero > 0).length, candidate: companies.filter(c => c.initial.candidate > 0).length }
summary.capitalBurden = Object.fromEntries(['high', 'other', 'unknown'].map(group => {
  const all = companies.filter(c => (c.burden?.group || 'unknown') === group)
  const paired = all.filter(c => c.cashErrors)
  return [group, { n: all.length, paired: paired.length, v1Smape: round(median(paired.map(c => c.cashErrors.v1))),
    zeroSmape: round(median(paired.map(c => c.cashErrors.zero))),
    candidateSmape: round(median(paired.map(c => c.cashErrors.candidate))),
    v1Over: paired.filter(c => c.cashErrors.v1Signed > 0).length,
    candidateOver: paired.filter(c => c.cashErrors.candidateSigned > 0).length }]
}))
for (const key of ['epsErrors', 'cashErrors']) {
  const paired = companies.filter(c => c[key])
  summary[key] = { paired: paired.length, medianSmape: Object.fromEntries(['v1', 'zero', 'candidate'].map(rule =>
    [rule, round(median(paired.map(c => c[key][rule])))])) }
}
const comp = companies.filter(c => c.compounder)
const unadjusted = companies.map(c => c.cashErrors || c.excludedComparison?.cashErrors).filter(Boolean)
summary.ifPreSeparationCashIncluded = { paired: unadjusted.length, medianSmape: Object.fromEntries(
  ['v1', 'zero', 'candidate'].map(rule => [rule, round(median(unadjusted.map(c => c[rule])))])) }
summary.compounders = { classifiable: companies.filter(c => typeof c.compounder === 'boolean').length,
  doubled: comp.map(c => c.ticker), comparable: comp.filter(c => c.initial.candidate > 0).map(c => c.ticker),
  lostDiscount: comp.filter(c => c.initial.value > c.initial.price && c.initial.candidate > 0 &&
    c.initial.candidate <= c.initial.price).map(c => c.ticker) }
const report = { start, end, policy: POLICY_VERSION, policyHash: POLICY_V1_HASH, summary, companies }
const serialized = JSON.stringify(report, null, 2) + '\n'
const path = 'public/research/sector-holdout-2015.json'
// Later SEC filings change factsSha256 but not this replay; rows and summary are gated.
const scrub = value => JSON.parse(JSON.stringify(value), (key, item) => key === 'factsSha256' ? undefined : item)
if (process.argv.includes('--check')) {
  const published = JSON.parse(readFileSync(path, 'utf8'))
  if (JSON.stringify(scrub(published)) !== JSON.stringify(scrub(report))) throw Error('Holdout differs from published observations')
} else writeFileSync(path, serialized)
console.log(JSON.stringify(summary, null, 2))
