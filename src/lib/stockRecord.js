// Normalised stock record. One cleaning path for the snapshot provider, the
// browser and the offline official-value build, so a value shown in the UI is
// computed from exactly the fields the committed artifact used.
import { cleanGrowth, windowGrowth } from './assumptions'
import { normalizedEarningsBase, sustainableCashBase } from './dcf'
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
    } else if (recomputed10 != null) {
      // Recompute when the annuals can support the window (HSBC trough walk).
      // If they cannot, keep the stored snapshot rate as a cache.
      stock[growth10] = recomputed10
    }
    if (recomputed5 != null) stock[growth5] = recomputed5
    if (recomputed1 != null) stock[growth1] = recomputed1
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
export function toStock (raw) {
  if (!raw || typeof raw !== 'object') return null
  const stock = { ...raw }
  applyCleanGrowth(stock, raw.financials?.annual)
  const classification = classify(stock, raw.financials?.annual)
  // Banks never take the FCF midpoint: free cash flow is not owner earnings there.
  stock.earnings_base = normalizedEarningsBase(raw, { midpointCash: classification.financial !== true })
  stock.cash_base = sustainableCashBase(raw)
  delete stock.history
  delete stock.financials
  if (classification.financial) stock.financial_institution = true
  stock.classification_basis = classification.basis
  if (classification.industry) stock.industry = classification.industry
  const gaps = dataGaps(raw.financials?.annual)
  if (gaps.length) stock.data_gaps = gaps
  stock._as_of = raw.as_of || stock._as_of || null
  return stock
}
