// SEC EDGAR XBRL filings: fundamentals only. SEC sends no CORS header and wants a
// contact User-Agent, so this source always needs the gateway on a static host.
import { fetchFinancialsFromEdgar, fetchHistoryFromEdgar, fetchStockFromEdgar } from './edgar-xbrl'
import { Coverage } from '../coverage'

export const edgar = {
  id: 'edgar',
  label: 'SEC EDGAR 财报',
  priority: 60,
  corsSafe: false,
  origin: 'https://www.sec.gov',
  proxyPath: '/sec',
  capabilities: { stock: false, quote: false, profile: true, history: true, financials: true },
  coverage: Coverage.of(['NYSE', 'NASDAQ', 'AMEX']),
  rateLimit: { requestsPerMinute: 10, burst: 2 },

  async fetchProfile (symbol) {
    const profile = await fetchStockFromEdgar(symbol)
    profile._provider = 'edgar'
    return profile
  },

  fetchFinancials (symbol) {
    return fetchFinancialsFromEdgar(symbol)
  },

  fetchHistory (symbol, indicator) {
    return fetchHistoryFromEdgar(symbol, indicator)
  },
}
