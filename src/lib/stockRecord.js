// Normalised stock record. One cleaning path for the snapshot provider, the
// browser and the offline official-value build, so a value shown in the UI is
// computed from exactly the fields the committed artifact used.
import { cleanGrowth } from './assumptions'
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

/**
 * The stored 10y CAGR can span a share split (GOOGL: pre-split 27.85 against
 * post-split 10.81). When the annual series shows such a level shift, the stored
 * rate is replaced by the rate over the clean suffix only, or by missing when
 * that suffix is too short. A series without a shift keeps the stored rate.
 */
export function applyCleanGrowth (stock, annual) {
  if (!Array.isArray(annual) || !annual.length) return stock
  const window = {}
  const fields = [['eps', 'eps_without_nri', 'earning_growth_10y']]
  // A bank's operating cash flow is not a shareholder cash flow; its growth stays out.
  if (stock.cashflow_basis !== 'ocf') fields.push(['fcf', 'free_cash_flow_per_share', 'cashflow_growth_10y'])
  // Revenue per share is restated across splits in the same rows.
  const revenue = yearSeries(annual, 'revenue_per_share').values
  for (const [key, rowField, growthField] of fields) {
    const stored = stock[growthField]
    if (stored === null || stored === undefined || stored === '') continue
    const { firstYear, values } = yearSeries(annual, rowField)
    const clean = cleanGrowth(values, revenue)
    if (!clean?.shifted) continue
    if (clean.rate == null) {
      stock[growthField] = null
      stock.growth_refused = { ...(stock.growth_refused || {}), [key]: 'short' }
      continue
    }
    stock[growthField] = clean.rate
    window[key] = { from: firstYear + clean.start, to: firstYear + clean.end }
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
  delete stock.history
  delete stock.financials
  const classification = classify(stock, raw.financials?.annual)
  if (classification.financial) stock.financial_institution = true
  stock.classification_basis = classification.basis
  if (classification.industry) stock.industry = classification.industry
  const gaps = dataGaps(raw.financials?.annual)
  if (gaps.length) stock.data_gaps = gaps
  stock._as_of = raw.as_of || stock._as_of || null
  return stock
}
