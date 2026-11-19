import { defineStore } from 'pinia'
import { entryOf, getPolicyArtifact } from '../api/policy'

// Module-level so every mount shares one fetch; the store state stays serialisable.
let inFlight = null

export const usePolicyStore = defineStore('policy', {
  state: () => ({ artifact: null, loading: false, error: null }),
  getters: {
    entryOf: (state) => (symbol) => entryOf(state.artifact, symbol),
    meta: (state) => (state.artifact
      ? {
          policyVersion: state.artifact.policyVersion || null,
          generatedAt: state.artifact.generatedAt || null,
          rates: state.artifact.rates || null,
          coverage: state.artifact.coverage || null,
        }
      : null),
  },
  actions: {
    /** Idempotent: concurrent callers wait on the same request, success is cached. */
    async load () {
      if (this.artifact) return this.artifact
      if (inFlight) return inFlight
      this.loading = true
      this.error = null
      inFlight = getPolicyArtifact()
        .then((artifact) => {
          this.artifact = artifact
          if (!artifact) this.error = 'unavailable'
          return artifact
        })
        .catch((error) => {
          this.artifact = null
          this.error = error || 'unavailable'
          return null
        })
        .finally(() => {
          this.loading = false
          inFlight = null
        })
      return inFlight
    },
  },
})
