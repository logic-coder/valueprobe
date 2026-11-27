// Normalised stock record. One cleaning path for the snapshot provider, the
// browser and the offline official-value build, so a value shown in the UI is
// computed from exactly the fields the committed artifact used.
import { cleanGrowth, windowGrowth } from './assumptions'
import { latestFiscalValue } from './dcf'
import { BASE_METHOD, selectOfficialBase } from './valuationBase'
import { quoteUnitUnreconciled } from './unreconciledUnits'
import { classify, dataGaps } from './financialInstitution'

/** One slot per fiscal year, oldest first, null where the year is missing. */
export function yearSeries (annual, field) {
  const byYear = new Map()
  for (const row of annual) {
    const year = Number(String(row?.date || '').slice(0, 4))
    if (Number.isInteger(year) && year > 0) byYear.set(year, row[field])
  }
  if (!byYear.size) return { firstYear: null, values: [] }
  const years = [...byYear.keys()]
  const firstYear = Math.min(...years)
  const values = []
  for (let year = firstYear; year <= Math.max(...years); year++) values.push(byYear.get(year) ?? null)
  return { firstYear, values }
}

function pointsFromSeries (firstYear, values, fromIndex = 0) {
  const points = []
  for (let index = fromIndex; index < values.length; index++) {
    const value = values[index]
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) points.push({ fy: firstYear + index, val: parsed })
  }
  return points
}

/**
 * Official growth is recomputed from the committed annual series after any
 * cleanGrowth suffix. Stored snapshot CAGRs stay a cache; a stale or trough-
 * voided g10 is not used when the annuals can support a window. A true split
 * that leaves too short a suffix still refuses the official rate.
 */
export function applyCleanGrowth (stock, annual) {
  if (!Array.isArray(annual) || !annual.length) return stock
  const window = {}
  const fields = [['eps', 'eps_without_nri', 'earning_growth_10y', 'earning_growth_5y', 'earning_growth_1y']]
  // A bank's operating cash flow is not a shareholder cash flow; its growth stays out.
  if (stock.cashflow_basis !== 'ocf') fields.push(['fcf', 'free_cash_flow_per_share', 'cashflow_growth_10y', 'cashflow_growth_5y', 'cashflow_growth_1y'])
  // Revenue per share is restated across splits in the same rows.
  const revenue = yearSeries(annual, 'revenue_per_share').values
  for (const [key, rowField, growth10, growth5, growth1] of fields) {
    const { firstYear, values } = yearSeries(annual, rowField)
    if (!values.length) continue
    const clean = cleanGrowth(values, revenue)
    let from = 0
    if (clean?.shifted) {
      from = clean.start
      if (clean.rate == null) {
        stock[growth10] = null
        stock[growth5] = null
        stock[growth1] = null
        stock.growth_refused = { ...(stock.growth_refused || {}), [key]: 'short' }
        continue
      }
      window[key] = { from: firstYear + clean.start, to: firstYear + clean.end }
    }
    const points = pointsFromSeries(firstYear, values, from)
    const recomputed10 = windowGrowth(points, 10)
    const recomputed5 = windowGrowth(points, 5)
    const recomputed1 = windowGrowth(points, 1)
    if (clean?.shifted) {
      // A post-split suffix may be 4–6 years: too short to label as ten years,
      // but clean.rate is the suffix CAGR official growth should use.
      stock[growth10] = recomputed10 ?? clean.rate
    } else {
      // Use the recomputed window, or leave it empty. Do not fall back to a
      // stale snapshot cache when the annuals cannot support the window.
      stock[growth10] = recomputed10
    }
    stock[growth5] = recomputed5
    stock[growth1] = recomputed1
  }
  if (Object.keys(window).length) stock.growth_window = window
  return stock
}

/**
 * Raw committed snapshot -> the stock shape every consumer reads.
 * Never mutates the raw record; drops the bulky series the UI does not need and
 * records the two facts a reviewer cannot recompute: the as_of date and whether
 * the accounting looks like a deposit-taker, insurer or broker.
 * @param {object} raw parsed public/data/<MARKET>-<CODE>.json
 * @returns {object|null}
 */
function latestPerShare (annual, field) {
  if (!Array.isArray(annual)) return null
  for (let i = annual.length - 1; i >= 0; i--) {
    const raw = annual[i]?.[field]
    if (raw === null || raw === undefined || raw === '') continue
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return Number(parsed.toFixed(4))
  }
  return null
}

const CURRENCY_CODE = { '¥': 'CNY', '￥': 'CNY', '$': 'USD', 'HK$': 'HKD', '€': 'EUR', '£': 'GBP' }
const currencyCode = value => CURRENCY_CODE[value] || (/^[A-Z]{3}$/.test(value || '') ? value : null)

export function toStock (raw) {
  if (!raw || typeof raw !== 'object') return null
  const stock = { ...raw }
  const domestic = ['SHSE', 'SZSE', 'HKSE'].includes(raw.exchange_)
  const quoteCurrency = currencyCode(raw.currency) || currencyCode(String(raw.price || '').trim().match(/^[^\d.-]+/)?.[0])
  stock.currency = raw.currency || quoteCurrency
  stock.reporting_currency = raw.reporting_currency || (raw.exchange_ === 'SHSE' || raw.exchange_ === 'SZSE'
    ? 'CNY' : raw.exchange_ === 'HKSE' ? raw.report_currency : null)
  stock.per_share_currency = raw.per_share_currency || (domestic ? quoteCurrency : null)
  if (raw.exchange_ === 'HKSE' && stock.per_share_currency === quoteCurrency) stock.per_share_fx_to_quote = 1
  stock.unit_unreconciled = raw.unit_unreconciled === true
  applyCleanGrowth(stock, raw.financials?.annual)
  const classification = classify(stock, raw.financials?.annual)
  const annual = raw.financials?.annual
  const da = latestPerShare(annual, 'depreciation_amortization_per_share')
  const sbc = latestPerShare(annual, 'share_based_comp_per_share')
  // Official sides come from valuationBase: recency-weighted fiscal-year
  // earnings, a persistent step when it is confirmed, and same-period cash.
  // Through-cycle remains a diagnostic flag only. TTM is classified for
  // display and never becomes the official base.
  const official = selectOfficialBase(raw, { financial: classification.financial === true })
  stock.eps_normalized = official.epsNormalized
  stock.latest_fy_eps = latestFiscalValue(annual, 'eps_without_nri')
  stock.latest_fy_fcf = latestFiscalValue(annual, 'free_cash_flow_per_share')
  stock.cash_median = official.cashBase
  stock.base_upshift = false
  stock.base_method = official.method
  stock.cash_bounded_fallback = official.method === BASE_METHOD.CASH_CONFIRMED_FALLBACK
  stock.base_as_of = official.baseAsOf
  stock.cash_as_of = official.cashAsOf
  stock.ttm_as_of = official.ttmAsOf
  stock.cash_lag_days = official.cashLagDays
  stock.ttm_eps_quality = official.ttmQuality
  stock.ttm_nonoperating_gain = official.ttmNonoperatingGain
  stock.ttm_quality_as_of = official.ttmQualityAsOf
  stock.capex_per_share = official.capexPerShare
  stock.ocf_per_share = official.ocfPerShare
  stock.capex_to_ocf = official.capexToOcf
  stock.capex_to_revenue = official.capexToRevenue
  stock.maintenance_capex_method = official.maintenanceCapexMethod
  stock.base_warnings = official.warnings
  stock.base_refusal = official.refusal
  if (quoteUnitUnreconciled(stock)) stock.base_refusal = 'UNIT_UNRECONCILED'
  stock.persistent_step = official.step?.hit === true
  stock.through_cycle = official.throughCycle?.hit === true
  stock.payout_ratio = official.payoutRatio
  stock.earnings_base = official.earningsBase
  stock.cash_base = official.cashBase
  stock.da_per_share = da
  stock.maintenance_capex_proxy = da
  stock.sbc_per_share = sbc
  if (da == null) stock.owner_base_gap = true
  delete stock.history
  delete stock.financials
  if (classification.financial) stock.financial_institution = true
  stock.classification_basis = classification.basis
  if (classification.industry) stock.industry = classification.industry
  if (classification.life) stock.life_insurer = true
  const gaps = dataGaps(raw.financials?.annual)
  if (gaps.length) stock.data_gaps = gaps
  stock._as_of = raw.as_of || stock._as_of || null
  return stock
}
