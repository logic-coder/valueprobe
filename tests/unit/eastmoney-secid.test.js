import { describe, expect, it } from 'vitest'
import { secidFor, quoteTimeFromF124 } from '../../src/data/providers/eastmoney'

describe('eastmoney secid', () => {
  it('uses a dot, which is the only separator the quote host accepts', () => {
    expect(secidFor('NASDAQ', 'MSFT')).toBe('105.MSFT')
    expect(secidFor('SHSE', '601398')).toBe('1.601398')
    expect(secidFor('HKSE', '00700')).toBe('128.00700')
    expect(secidFor('NYSE', 'KO')).toBe('106.KO')
  })
})

describe('eastmoney live quote time', () => {
  it('uses f124 in the exchange calendar and does not invent Date.now()', () => {
    const seconds = Date.UTC(2026, 10, 18, 21, 0, 0) / 1000 // 16:00 America/New_York
    const now = Date.UTC(2026, 10, 19, 0, 0, 0)
    const us = quoteTimeFromF124({ f124: seconds }, 'NASDAQ', now)
    expect(us.asOf).toBe('2026-11-18')
    expect(us.timestamp).toBe(seconds * 1000)
    expect(quoteTimeFromF124({ f124: null }, 'SHSE', now)).toBeNull()
    expect(quoteTimeFromF124({ f124: 0 }, 'SHSE', now)).toBeNull()
    expect(quoteTimeFromF124({}, 'HKSE', now)).toBeNull()
  })
})
