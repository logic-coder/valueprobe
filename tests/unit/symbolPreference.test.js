import { beforeEach, describe, expect, it } from 'vitest'
import { useSymbolPreference } from '../../src/composables/useSymbolPreference'

describe('per-symbol preference', () => {
  beforeEach(() => window.localStorage.clear())

  it('falls back per symbol and remembers separately', () => {
    const pref = useSymbolPreference('fv-test:', 'revenue_per_share')
    expect(pref.stored('SHSE:601398')).toBe('revenue_per_share')
    pref.remember('SHSE:601398', 'eps')
    expect(pref.stored('SHSE:601398')).toBe('eps')
    expect(pref.stored('NASDAQ:AAPL')).toBe('revenue_per_share')
  })
})
