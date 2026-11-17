import { describe, expect, it } from 'vitest'
import { MARKET_CODES, parseSymbol } from '../../src/config/markets'

describe('parseSymbol', () => {
  it('accepts the whitelisted exchanges case-insensitively', () => {
    for (const market of MARKET_CODES) {
      const parsed = parseSymbol(market.toLowerCase() + ':abc1')
      expect(parsed.ok).toBe(true)
      expect(parsed.symbol).toBe(market + ':ABC1')
    }
  })

  it('rejects malformed input', () => {
    expect(parseSymbol('602000').reason).toBe('format')
    expect(parseSymbol('SHSE:').reason).toBe('format')
    expect(parseSymbol('SHSE:60 00').reason).toBe('format')
  })

  it('pads Hong Kong tickers to the five-digit upstream form', () => {
    expect(parseSymbol('HKSE:700').symbol).toBe('HKSE:00700')
    expect(parseSymbol('hkse:0700').symbol).toBe('HKSE:00700')
    expect(parseSymbol('HKSE:00700').symbol).toBe('HKSE:00700')
  })

  it('rejects unknown exchanges', () => {
    expect(parseSymbol('FOO:BAR').reason).toBe('market')
    expect(parseSymbol('NASDAQGS:AAPL').reason).toBe('market')
  })
})
