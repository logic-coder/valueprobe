// Quarterly snapshot: one JSON per symbol committed under public/data/ and served
// by the static host itself. Fits a Pages deployment that must not depend on a
// live source: it carries its own as_of date, so the UI can say how old it is.
import axios from 'axios'
import { parseSymbol } from '../../config/markets'
import { Coverage } from '../coverage'
import { notSupported } from '../errors'
import { cleanGrowth } from '../../lib/assumptions'
import { isFinancialInstitution } from '../../lib/financialInstitution'

const http = axios.create({ timeout: 15_000 })

/** One slot per fiscal year, oldest first, null where the year is missing. */
function yearSeries (annual, field) {
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


/** East Money DPS_HKD is a current figure copied onto every HK history row. */
export function dropCopiedDividends (data) {
  if (!data || data.exchange_ !== 'HKSE') return data
  const wipe = (rows) => {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (row && 'dividends_per_share' in row) row.dividends_per_share = null
    }
  }
  wipe(data.financials?.annual)
  wipe(data.financials?.ttm)
  wipe(data.financials?.quarter)
  const series = data.history?.dividends_per_share
  if (series) {
    const points = Array.isArray(series) ? series : series.data
    if (Array.isArray(points)) {
      const cleared = points.map((point) => (Array.isArray(point) ? [point[0], null] : point))
      if (Array.isArray(series)) data.history.dividends_per_share = cleared
      else data.history.dividends_per_share = { ...series, data: cleared }
    }
  }
  return data
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
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
export const SNAPSHOT_DIR = BASE + '/data/'
export const snapshotPath = (symbol) => {
  const { market, code } = parseSymbol(symbol)
  return SNAPSHOT_DIR + market + '-' + code + '.json'
}

export const snapshot = {
  id: 'snapshot',
  label: '季度快照',
  priority: 15,
  corsSafe: true,
  origin: SNAPSHOT_DIR,
  // In local dev the file is only the spare. A published build has no other source.
  fallback: import.meta.env.DEV,
  capabilities: { stock: true, quote: true, profile: true, history: true, financials: true },
  coverage: Coverage.global(),
  rateLimit: { requestsPerMinute: 60, burst: 10 },
  // Committed quarterly files: a month of slack on top of the quarter.
  maxQuoteAgeMs: 200 * 24 * 3600e3,

  async load (symbol) {
    const { data } = await http.get(snapshotPath(symbol))
    if (!data || typeof data !== 'object' || data.price === undefined || data.price === null) {
      throw notSupported('snapshot', 'no record for ' + symbol)
    }
    return dropCopiedDividends(data)
  },

  async fetchStock (symbol) {
    const { market, code } = parseSymbol(symbol)
    const data = await this.load(symbol)
    const stock = { ...data }
    applyCleanGrowth(stock, data.financials?.annual)
    delete stock.history
    delete stock.financials
    stock.exchange_ = market
    if (isFinancialInstitution(stock, data.financials?.annual)) stock.financial_institution = true
    stock.symbol = stock.symbol || code
    stock._provider = 'snapshot'
    stock._as_of = data.as_of || null
    return stock
  },

  async fetchHistory (symbol, indicator) {
    const data = await this.load(symbol)
    const series = data.history?.[indicator]
    const points = series?.data || series
    if (!Array.isArray(points)) throw notSupported('snapshot', 'indicator ' + indicator)
    return points
  },

  async fetchFinancials (symbol) {
    const data = await this.load(symbol)
    if (!data.financials?.annual) throw notSupported('snapshot', 'financials for ' + symbol)
    return data.financials
  },

  async fetchQuote (symbol) {
    const stock = await this.fetchStock(symbol)
    return {
      price: stock.price,
      currency: stock.currency,
      timestamp: stock.as_of ? Date.parse(stock.as_of) : Date.now(),
      provider: 'snapshot',
      _as_of: stock._as_of || null,
      raw: stock,
    }
  },

  async fetchProfile (symbol) {
    return this.fetchStock(symbol)
  },

  notSupported,
}
