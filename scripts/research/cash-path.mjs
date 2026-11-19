import { readFileSync, writeFileSync } from 'node:fs'
import { growthWindow } from '../../src/data/providers/edgar-xbrl.js'
import { policyValue, POLICY_VERSION, POLICY_V1_HASH } from '../../src/lib/policy.js'
import { toStock } from '../../src/lib/stockRecord.js'
import { presentValue } from '../../src/lib/dcf.js'
import { median, shareholderValue } from './owner-earnings.mjs'
import { round } from './as-of-valuation.mjs'

const study = JSON.parse(readFileSync('scripts/research/cash-path-inputs.json', 'utf8'))
const rules = ['v1', 'normalizedEarnings', 'candidate', 'flatCash']
const cash = r => (r.ocf - r.capex) / r.shares
const smape = (p, a) => a === 0 && p === 0 ? 0 : 200 * Math.abs(p - a) / (Math.abs(p) + Math.abs(a))

function project (c) {
  if (!(c.entryFilingDate < study.asOf)) throw Error('Late entry filing for ' + c.ticker)
  const series = c.epsFrom1995.map((val, i) => ({ fy: 1995 + i, val })).filter(r => r.val != null)
  const revenues = new Map((c.revenueChecks || []).map(v => [v.fy, v.revenue / v.shares]))
  const annual = series.map(r => ({ date: r.fy + '-12', eps_without_nri: r.val, revenue_per_share: revenues.get(r.fy) }))
  const stock = toStock({ symbol: c.ticker, exchange_: c.ticker === 'INTC' ? 'NASDAQ' : 'NYSE', currency: '$',
    financials: { annual }, ttm_eps: series.at(-1).val, eps_period: 'FY', as_of: study.asOf,
    earning_growth_10y: growthWindow(series, 10) })
  const policy = policyValue(stock, { rate: study.yieldPct, generatedAt: study.asOf })
  if (!policy.value || policy.inputs.model !== 'owner') throw Error('Unexpected policy inputs for ' + c.ticker)
  const p = policy.inputs
  const r = p.discountRate / 100
  const base = c.baseYears
  if (base.length !== 3 || !base.every((row, i) => row.fy === 2003 + i && row.openingEquity > 0 &&
    row.income > 0 && row.shares > 0 && Number.isFinite(row.ocf) && row.capex >= 0)) throw Error('Incomplete base for ' + c.ticker)
  const roe = median(base.map(v => v.income / v.openingEquity))
  const normal = median(series.slice(-3).map(v => v.val))
  const flatCash = median(base.map(cash))
  const candidate = shareholderValue(normal, roe, p)
  const actual = new Map(c.observations.map(v => [v.fy, v]))
  if (actual.size !== c.observations.length || c.observations.some(v =>
    v.fy < 2006 || v.fy > 2015 || !Number.isFinite(v.ocf) || !(v.capex >= 0 && v.shares > 0))) throw Error('Bad observations for ' + c.ticker)
  const rows = []
  let earnings = p.eps
  for (let year = 1; year <= p.years; year++) {
    const growth = p.growth + (p.terminalGrowthRate - p.growth) * (year - 1) / (p.years - 1)
    earnings *= 1 + growth / 100
    const fy = 2005 + year
    const v = actual.get(fy)
    const observed = v && (!c.breakFrom || fy < c.breakFrom) ? cash(v) : null
    const values = { v1: earnings, normalizedEarnings: earnings * normal / p.eps,
      candidate: candidate?.path[year - 1].distributable ?? null, flatCash }
    const afterAcquisitions = observed != null && Number.isFinite(v.netAcquisitionCash)
      ? observed - v.netAcquisitionCash / v.shares : null
    rows.push({ fy, observed, afterAcquisitions, values, factor: (1 + r) ** -year,
      signedError: Object.fromEntries(rules.map(k => [k, observed != null && values[k] != null ? round(values[k] - observed) : null])) })
  }
  // Confirm the release engine's explicit-stage PV on the same inputs.
  const v1PV = rows.reduce((s, x) => s + x.values.v1 * x.factor, 0)
  const published = presentValue(0, p.years, p.discountRate, p.growth, p.eps, p.terminalGrowthRate, p.yearsOfTerminalGrowth, false)
  if (Math.abs(v1PV - published.growthValue) > 0.00501) throw Error('v1 PV mismatch for ' + c.ticker)
  const paired = rows.length === 10 && rows.every(v => v.observed != null && rules.every(k => Number.isFinite(v.values[k])))
  let cumulative = null
  if (paired) {
    const observed = rows.reduce((s, x) => s + x.observed * x.factor, 0)
    const predicted = Object.fromEntries(rules.map(k => [k, rows.reduce((s, x) => s + x.values[k] * x.factor, 0)]))
    const afterAcquisitions = rows.every(x => x.afterAcquisitions != null)
      ? rows.reduce((s, x) => s + x.afterAcquisitions * x.factor, 0) : null
    cumulative = { observed, predicted, afterAcquisitions }
  }
  return { ticker: c.ticker, forecastStatus: candidate ? 'ok' : 'candidateNotFunded',
    outcomeStatus: c.breakFrom ? 'shareDistribution' : rows.every(v => v.observed != null) ? 'complete' : 'missingData',
    discount: p.discountRate, growth: p.growth, initialRoe: roe, normalizedEPS: normal, initialCash: flatCash,
    rows, cumulative }
}

const companies = study.companies.map(project)
const complete = companies.filter(c => c.cumulative)
function score (pairs) {
  const summary = {}
  for (const k of rules) {
    const errors = pairs.map(({ observed, predicted }) => smape(predicted[k], observed))
    summary[k] = { medianSmape: round(median(errors)),
      below: pairs.filter(x => x.predicted[k] < x.observed).length,
      above: pairs.filter(x => x.predicted[k] > x.observed).length,
      closerThanV1: pairs.filter(x => smape(x.predicted[k], x.observed) < smape(x.predicted.v1, x.observed)).length }
  }
  return summary
}
const periods = Array.from({ length: 10 }, (_, i) => ({
  fy: 2006 + i, n: complete.length, scores: score(complete.map(c => ({ observed: c.rows[i].observed, predicted: c.rows[i].values })))
}))
const totals = complete.map(c => c.cumulative)
const acquisitionSample = complete.filter(c => c.cumulative.afterAcquisitions != null)
const acquisitionSensitivity = { tickers: acquisitionSample.map(c => c.ticker),
  before: score(acquisitionSample.map(c => c.cumulative)),
  after: score(acquisitionSample.map(({ cumulative: c }) => ({ observed: c.afterAcquisitions, predicted: c.predicted }))) }
const leaveOneOut = complete.map((c, i) => ({ excluded: c.ticker, scores: score(totals.filter((_, j) => i !== j)) }))
const result = { asOf: study.asOf, policy: POLICY_VERSION, policyHash: POLICY_V1_HASH,
  sample: companies.length, paired: complete.length, periods, cumulative: score(totals), leaveOneOut, acquisitionSensitivity, companies }
const path = 'public/research/cash-path-2006-2015.json'
const output = JSON.stringify(result, (_, v) => typeof v === 'number' ? round(v) : v, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw Error('Cash paths differ from the published research')
} else writeFileSync(path, output)
console.log(JSON.stringify({ sample: result.sample, paired: result.paired, cumulative: result.cumulative }, null, 2))
