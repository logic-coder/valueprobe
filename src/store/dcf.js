import { defineStore } from 'pinia'
import { api } from '../api'

const VIEW_ID = 1983
// One chart request at a time: an older answer must not overwrite a newer one.
let chartRequest = 0

// Per-symbol DCF data store: financials, view and indicator state.
export const useDcfStore = defineStore('dcf', {
  state: () => ({
    symbol: '',
    financials: { loading: false, data: null },
    view: { loading: false, data: null },
    indicator: { loading: false, indicator: null, source: 'live' },
    rates: { loading: false, byCurrency: { USD: null, CNY: null } },
    // The calculator's price, shared with the page header so both edit one number.
    // Empty symbol means no calculator is mounted and the header shows the snapshot quote.
    workingPrice: { symbol: '', value: null },
  }),
  getters: {
    loading: (state) => state.financials.loading || state.view.loading,
  },
  actions: {
    setWorkingPrice (symbol, value) {
      this.workingPrice = { symbol, value }
    },
    releaseWorkingPrice (symbol) {
      if (this.workingPrice.symbol === symbol) this.workingPrice = { symbol: '', value: null }
    },
    async preFetch (symbol) {
      this.symbol = symbol
      await Promise.all([this.loadFinancialData(), this.loadView()])
    },
    async loadFinancialData () {
      const symbol = this.symbol
      // The store keeps one symbol; a late answer for the previous one is dropped.
      const stale = () => this.symbol !== symbol
      const start = new Date()
      start.setFullYear(start.getFullYear() - 3)
      this.financials.loading = true
      try {
        const data = await api.getStockFinancial(symbol, VIEW_ID, {
          type: 'ALL',
          start: start.toISOString().slice(0, 7),
          end: new Date().toISOString().slice(0, 7),
        })
        if (stale()) return
        this.financials.data = data
      } catch (error) {
        if (stale()) return
        this.financials.data = null
      } finally {
        if (!stale()) this.financials.loading = false
      }
    },
    async loadView () {
      this.view.loading = true
      try {
        this.view.data = await api.getView(VIEW_ID)
      } catch (error) {
        this.view.data = null
      } finally {
        this.view.loading = false
      }
    },
    async loadRates () {
      this.rates.loading = true
      try {
        this.rates.byCurrency = await api.getRiskFreeRates()
      } catch (error) {
        this.rates.byCurrency = { USD: null, CNY: null }
      } finally {
        this.rates.loading = false
      }
    },
    async loadIndicatorData (symbol, indicator, params) {
      const request = ++chartRequest
      const stale = () => request !== chartRequest || (symbol && this.symbol && this.symbol !== symbol)
      this.indicator.dataLoading = true
      try {
        const data = await api.getIndicatorData(symbol, indicator, params)
        if (stale()) return false
        this.indicator.data = data
        return true
      } catch (error) {
        if (stale()) return false
        this.indicator.data = []
        return true
      } finally {
        if (request === chartRequest) this.indicator.dataLoading = false
      }
    },
  },
})
