import { defineStore } from 'pinia'
import { fx, symbolOf } from '../lib/fx'
import { readStored, writeStored } from '../lib/storage'

const KEY = 'fv-display-currency'
const KNOWN = ['CNY', 'USD', 'HKD']

/** Codes for the currency symbols the payloads use. */
export const CODE_BY_SYMBOL = { '¥': 'CNY', '￥': 'CNY', '$': 'USD', 'HK$': 'HKD', '€': 'EUR', '£': 'GBP' }
export const codeOf = (currency) => CODE_BY_SYMBOL[currency] || (/^[A-Z]{3}$/.test(currency || '') ? currency : null)

// A stored code from an older build (or a hand-edited value) must not leave the
// select on a label-less option or spend FX calls on a currency we cannot show.
const knownCurrency = (value) => (KNOWN.includes(value) ? value : '')

// Display currency: '' keeps every figure in the stock's own currency. Anything
// else converts for reading only; the inputs stay native (DEVIATIONS D6).
export const useDisplayStore = defineStore('display', {
  state: () => ({ currency: knownCurrency(readStored(KEY, '')), rates: {}, loading: false, asOf: 0 }),
  getters: {
    converted: (state) => Boolean(state.currency),
    symbol: (state) => symbolOf(state.currency || 'CNY'),
    rateBetween: (state) => (fromCode) => {
      if (!fromCode || fromCode === state.currency) return 1
      return state.rates[fromCode] || null
    },
  },
  actions: {
    async setCurrency (code) {
      this.currency = code || ''
      writeStored(KEY, this.currency)
      if (this.currency) await this.loadRates()
    },
    async loadRates () {
      if (!this.currency) return
      this.loading = true
      try {
        for (const from of KNOWN) {
          if (from === this.currency) { this.rates[from] = 1; continue }
          const result = await fx.convert(1, from, this.currency)
          if (result.ok) {
            this.rates[from] = result.rate
            this.asOf = Math.max(this.asOf, result.asOf)
          }
        }
      } finally {
        this.loading = false
      }
    },
    reset () {
      this.currency = ''
      this.rates = {}
      writeStored(KEY, '')
    },
  },
})
