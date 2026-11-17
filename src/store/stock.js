import { defineStore } from 'pinia'
import { api } from '../api'
import { parseSymbol } from '../config/markets'

export const useStockStore = defineStore('stock', {
  // `requested` is the newest symbol asked for; a slower earlier request must not
  // overwrite the store after the route moved on.
  state: () => ({ stock: null, loading: false, error: null, notFound: false, requested: '' }),
  getters: {
    symbol: (state) => (state.stock ? `${state.stock.exchange_ || ''}:${state.stock.symbol || ''}` : ''),
  },
  actions: {
    async loadStock (rawSymbol) {
      const parsed = parseSymbol(rawSymbol)
      this.requested = parsed.ok ? parsed.symbol : ''
      this.loading = true
      this.error = null
      this.notFound = false
      try {
        if (!parsed.ok) {
          this.notFound = true
          this.stock = null
          return
        }
        const stock = await api.getStock(parsed.symbol)
        if (this.requested !== parsed.symbol) return
        stock.price = String(stock.price ?? '')
        stock.exchange_ = stock.exchange_ || parsed.market
        stock.symbol = stock.symbol || parsed.code
        this.stock = stock
      } catch (error) {
        if (this.requested === parsed.symbol || !parsed.ok) {
          this.error = error
          if (error?.response?.status === 404) this.notFound = true
          this.stock = null
        }
      } finally {
        this.loading = false
      }
    },
  },
})
