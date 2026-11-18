import { defineStore } from 'pinia'
import { api } from '../api'

const VIEW_ID = 1983

// Mirrors the Vuex module "stockPage/dcf" of the original app, parameterised by symbol.
export const useDcfStore = defineStore('dcf', {
  state: () => ({
    symbol: '',
    financials: { loading: false, data: null },
    view: { loading: false, data: null },
    indicator: { loading: false, indicator: null, source: 'live' },
    chartData: {},
  }),
  getters: {
    loading: (state) => state.financials.loading || state.view.loading,
  },
  actions: {
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
    async loadIndicator () {
      this.indicator.loading = true
      try {
        const { value, source } = await api.getLatestIndicator(37)
        this.indicator.indicator = value
        this.indicator.source = source
      } catch (error) {
        this.indicator.indicator = null
        this.indicator.source = 'bundled'
      } finally {
        this.indicator.loading = false
      }
    },
    async loadIndicatorData (symbol, indicator, params) {
      const requested = symbol
      const stale = () => requested && this.symbol && this.symbol !== requested
      this.indicator.dataLoading = true
      try {
        const data = await api.getIndicatorData(symbol, indicator, params)
        if (stale()) return
        this.indicator.data = data
        this.chartData[indicator] = data
      } catch (error) {
        if (stale()) return
        this.indicator.data = []
      } finally {
        if (!stale()) this.indicator.dataLoading = false
      }
    },
  },
})
