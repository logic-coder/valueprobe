import { describe, expect, it } from 'vitest'
import { isStale, validateQuote } from '../../src/data/validate'
import { ErrorCode } from '../../src/data/errors'

const now = () => 1_700_000_000_000
const good = { provider: 'p', price: 12.5, currency: 'USD', timestamp: now() - 1000 }

describe('quote validation', () => {
  it('accepts a sane quote', () => {
    expect(validateQuote(good, { now })).toBeNull()
  })

  it('rejects missing, non-numeric, non-positive and absurd prices', () => {
    expect(validateQuote(null, { now })?.code).toBe(ErrorCode.VALIDATION)
    expect(validateQuote({ ...good, price: 'abc' }, { now })?.message).toContain('numeric')
    expect(validateQuote({ ...good, price: 0 }, { now })?.message).toContain('positive')
    expect(validateQuote({ ...good, price: 1e9 }, { now })?.message).toContain('sanity')
  })

  it('rejects a future timestamp and a stale quote', () => {
    expect(validateQuote({ ...good, timestamp: now() + 2 * 86_400e3 }, { now })?.message).toContain('future')
    expect(validateQuote({ ...good, timestamp: now() - 30 * 86_400e3 }, { now })?.message).toContain('older')
  })

  it('lets a source widen its own age window', () => {
    const quarterly = { ...good, timestamp: now() - 120 * 86_400e3 }
    expect(validateQuote(quarterly, { now })?.message).toContain('older')
    expect(validateQuote(quarterly, { now, maxAgeMs: 200 * 86_400e3 })).toBeNull()
  })

  it('rejects a currency mismatch', () => {
    expect(validateQuote(good, { now, expectedCurrency: 'CNY' })?.message).toContain('currency')
  })

  it('flags staleness separately from validity', () => {
    expect(isStale(now() - 1000, { now })).toBe(false)
    expect(isStale(now() - 30 * 3600e3, { now })).toBe(true)
  })
})
