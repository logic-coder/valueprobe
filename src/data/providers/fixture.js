// Bundled snapshots: deterministic and offline. Serves every operation so
// `VITE_API_MODE=fixture` and the E2E suite never touch the network.
import { Coverage } from '../coverage'
import stockFixture from '../bundled/stock_icbc.json'
import usStockFixture from '../bundled/stock_aapl.json'
import financialFixture from '../bundled/fin_1983.json'
import indicatorFixture from '../bundled/indicator_data.json'

const clone = (value) => JSON.parse(JSON.stringify(value))

export const fixture = {
  id: 'fixture',
  label: '内置快照',
  priority: 1000,
  capabilities: { stock: true, quote: true, profile: true, history: true, financials: true },
  coverage: Coverage.global(),
  rateLimit: { requestsPerMinute: 600, burst: 50 },

  async fetchStock (symbol) {
    const stock = clone(symbol.endsWith('AAPL') ? usStockFixture : stockFixture)
    stock._provider = 'fixture'
    return stock
  },

  async fetchQuote (symbol) {
    const stock = await this.fetchStock(symbol)
    return { price: stock.price, currency: stock.currency, timestamp: Date.now(), provider: 'fixture' }
  },

  async fetchProfile (symbol) {
    return this.fetchStock(symbol)
  },

  async fetchHistory (symbol, indicator) {
    const series = indicatorFixture[indicator] || indicatorFixture.revenue_per_share
    return clone(series.data)
  },

  async fetchFinancials () {
    return clone(financialFixture)
  },
}
