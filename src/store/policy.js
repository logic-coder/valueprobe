import { defineStore } from 'pinia'
import { getPolicyEntry, getPolicySummary } from '../api/policy'

export const usePolicyStore = defineStore('policy', {
  state: () => ({ entries: {}, errors: {} }),
  getters: {
    entryOf: state => symbol => state.entries[symbol]?.entry ?? null,
    metadataOf: state => symbol => state.entries[symbol]?.meta ?? null,
    errorOf: state => symbol => Boolean(state.errors[symbol]),
  },
  actions: {
    async load (symbol) {
      const result = await getPolicyEntry(symbol)
      this.errors[symbol] = !result
      if (!result) {
        delete this.entries[symbol]
        return null
      }
      this.entries[symbol] = result
      return result.entry
    },
    // Whole-universe read. Lists prefer one entry per symbol (load); this stays for
    // callers that really need every row, and the static-host smoke checks it.
    async loadSummary () {
      return getPolicySummary()
    },
  },
})
