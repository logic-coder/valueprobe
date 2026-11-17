import { describe, expect, it } from 'vitest'
import { RANGE_KEYS, rangeDate } from '../../src/lib/ranges'

describe('chart ranges', () => {
  it('orders the cutoffs from recent to oldest', () => {
    const now = Date.now()
    expect(rangeDate('1m')).toBeLessThan(now)
    expect(rangeDate('1m')).toBeGreaterThan(rangeDate('1y'))
    expect(rangeDate('1y')).toBeGreaterThan(rangeDate('5y'))
    expect(rangeDate('5y')).toBeGreaterThan(rangeDate('all'))
  })

  it('falls back to three years for an unknown key', () => {
    expect(Math.abs(rangeDate('nope') - rangeDate('3y'))).toBeLessThan(2000)
  })

  it('keeps the key list free of duplicates', () => {
    expect(new Set(RANGE_KEYS).size).toBe(RANGE_KEYS.length)
  })
})
