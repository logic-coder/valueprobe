import { fundamentalsFromFacts } from '../../src/data/providers/edgar-xbrl.js'
import { toStock } from '../../src/lib/stockRecord.js'
import { policyValue } from '../../src/lib/policy.js'
import { presentValue } from '../../src/lib/dcf.js'
import { median, shareholderValue } from './owner-earnings.mjs'

export const round = x => Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null
export const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000

export function availableFacts (raw, date) {
  const facts = {}
  for (const [ns, concepts] of Object.entries(raw.facts)) {
    facts[ns] = {}
    for (const [name, concept] of Object.entries(concepts)) {
      const units = {}
      for (const [unit, values] of Object.entries(concept.units)) {
        units[unit] = values.filter(v => v.filed && v.filed < date && v.end <= date)
      }
      facts[ns][name] = { units }
    }
  }
  return { entityName: raw.entityName, facts }
}

// Net income available to common shareholders divided by opening common
// book equity. Missing dates stay missing; tangible book is not substituted.
function historicalRoe (facts, years) {
  const gaap = facts.facts['us-gaap'] || {}
  const ni = gaap.NetIncomeLossAvailableToCommonStockholdersBasic?.units.USD || []
  const net = gaap.NetIncomeLoss?.units.USD || []
  const equity = gaap.StockholdersEquity?.units.USD || []
  const preferred = gaap.PreferredStockValue?.units.USD || []
  const latest = rows => rows.sort((a, b) => b.filed.localeCompare(a.filed))[0]
  const returns = []
  for (const year of years) {
    const eligible = rows => rows.filter(v => v.form === '10-K' && v.end.startsWith(year) &&
      days(v.end, v.start) >= 350 && days(v.end, v.start) <= 380)
    const income = latest(eligible(ni)) || latest(eligible(net))
    if (!income) return null
    const opening = rows => latest(rows.filter(v => days(income.start, v.end) === 1 && !v.start))
    const book = opening(equity)?.val
    const pref = opening(preferred)?.val || 0
    if (!(book - pref > 0 && income.val > 0)) return null
    returns.push(income.val / (book - pref))
  }
  return median(returns)
}

export function estimateAt ({ symbol, facts, row, splitInfo, yieldRate, entryYield, excludeFinancial }) {
  const { fields, financials } = fundamentalsFromFacts(symbol, facts)
  const { date, price, splitFromStart } = row
  const stock = toStock({ ...fields, financials, price, as_of: date, quote_as_of: date })
  const annual = financials.annual.filter(r => r.eps_without_nri != null)
  const last = annual.at(-1)
  if (!last || !stock.eps_as_of || days(date, stock.eps_as_of) > 540) return { ...row, reason: 'missingRecentEarnings' }
  if (splitFromStart !== 1 && last.date < splitInfo[0].slice(0, 7)) return { ...row, reason: 'ambiguousShareBasis' }
  const v1 = policyValue(stock, { rate: Number(yieldRate), generatedAt: date })
  const p = v1.inputs
  Object.assign(row, { model: p.model, eps: p.eps, epsDate: stock.eps_as_of, epsPeriod: stock.eps_period,
    growth: p.growth, discount: p.discountRate, value: v1.value, zero: p.eps > 0 ? round(p.eps / (p.discountRate / 100)) : null,
    annualDate: last.date, fcf: last.free_cash_flow_per_share })
  if (!v1.value) return { ...row, reason: v1.reasons.join(',') }
  row.valueAtEntryRate = policyValue(stock, { rate: Number(entryYield), generatedAt: date }).value
  if (p.model !== 'owner' || excludeFinancial) return { ...row, candidateReason: 'financial' }
  let eps10 = p.eps
  for (let i = 0; i < p.years; i++) eps10 *= 1 + (p.growth + (p.terminalGrowthRate - p.growth) * i / (p.years - 1)) / 100
  row.v1Eps10 = round(eps10)
  const recent = annual.slice(-3)
  const years = recent.map(r => r.date.slice(0, 4))
  if (years.length !== 3 || Number(years[2]) - Number(years[0]) !== 2) return { ...row, candidateReason: 'shortHistory' }
  row.normalEps = median(recent.map(r => r.eps_without_nri))
  if (row.normalEps > 0) row.normalizedOnly = presentValue(0, p.years, p.discountRate, p.growth, row.normalEps,
    p.terminalGrowthRate, p.yearsOfTerminalGrowth, false).fairValue
  const roe = historicalRoe(facts, years)
  row.roe = round(roe)
  const candidate = shareholderValue(row.normalEps, roe, p)
  if (!candidate) return { ...row, candidateReason: 'unavailableOrUnfunded' }
  return { ...row, candidate: round(candidate.value), candidateEps10: round(candidate.eps), distributable10: round(candidate.distributable) }
}
