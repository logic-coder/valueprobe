import { defineStore } from 'pinia'
import { readStored, writeStored } from '../lib/storage'

const KEY = 'fv-source-state'

const load = () => {
  try {
    const parsed = JSON.parse(readStored(KEY, '{}'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, meta]) => meta && typeof meta === 'object'))
  } catch (error) {
    return {}
  }
}

// Data-state machine: live (no banner) / stale (offline snapshot) / manual.
export const useDataStateStore = defineStore('dataState', {
  state: () => ({ bySymbol: load() }),
  getters: {
    stateOf: (state) => (symbol) => state.bySymbol[symbol]?.state || 'live',
    metaOf: (state) => (symbol) => state.bySymbol[symbol] || {},
  },
  actions: {
    persist () {
      writeStored(KEY, JSON.stringify(this.bySymbol))
    },
    setMode (symbol, mode, patch = {}) {
      this.bySymbol[symbol] = { ...(this.bySymbol[symbol] || {}), state: mode, ...patch }
      this.persist()
    },
    markLive (symbol, source, dataAt) {
      this.setMode(symbol, 'live', { source, dataAt })
    },
    /** Provider metadata for the current symbol (which source answered, fallbacks). */
    setMeta (symbol, meta) {
      this.bySymbol[symbol] = { ...(this.bySymbol[symbol] || {}), ...meta }
      this.persist()
    },
    markManual (symbol) {
      this.setMode(symbol, 'manual', { source: 'manual', dataAt: Date.now() })
    },
    markStale (symbol, source, dataAt) {
      this.setMode(symbol, 'stale', { source, dataAt })
    },
    reset (symbol) {
      this.setMode(symbol, 'live', { source: null, dataAt: null })
    },
  },
})
