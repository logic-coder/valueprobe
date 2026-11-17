// Quarterly snapshot: one JSON per symbol committed under public/data/ and served
// by the static host itself. Fits a Pages deployment that must not depend on a
// live source: it carries its own as_of date, so the UI can say how old it is.
import axios from 'axios'
import { parseSymbol } from '../../config/markets'
import { Coverage } from '../coverage'
import { notSupported } from '../errors'

const http = axios.create({ timeout: 15_000 })
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
    return data
  },

  async fetchStock (symbol) {
    const { market, code } = parseSymbol(symbol)
    const data = await this.load(symbol)
    const stock = { ...data }
    delete stock.history
    delete stock.financials
    stock.exchange_ = market
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
