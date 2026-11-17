import { describe, expect, it } from 'vitest'
import { MAX_MAGNITUDE, MIN_RETURN_BASE, bounded, div, mul, product, proportional, round, sum } from '../../src/lib/arith'

describe('bounded arithmetic', () => {
  it('keeps ordinary values', () => {
    expect(mul(2, 3)).toBe(6)
    expect(div(9, 3)).toBe(3)
    expect(sum([1, 2, 3])).toBe(6)
    expect(product([2, 3, 4])).toBe(24)
    expect(round(1.23456789, 4)).toBe(1.2346)
  })

  it('declines overflow instead of returning Infinity', () => {
    expect(mul(MAX_MAGNITUDE, 2)).toBeNull()
    expect(mul(Number.MAX_VALUE, Number.MAX_VALUE)).toBeNull()
    expect(sum([MAX_MAGNITUDE, MAX_MAGNITUDE])).toBeNull()
    expect(bounded(Infinity)).toBeNull()
  })

  it('declines a zero or unusable denominator', () => {
    expect(div(1, 0)).toBeNull()
    expect(div(Infinity, 2)).toBeNull()
    expect(round(NaN)).toBeNull()
  })

  it('divides first in proportional when the product would overflow', () => {
    expect(proportional(1e15, 5e14, 1e15)).toBe(5e14)
    expect(proportional(10, 10, 10)).toBe(10)
    expect(proportional(10, 1, 0)).toBeNull()
  })

  it('exposes the return-base floor', () => {
    expect(MIN_RETURN_BASE).toBeGreaterThan(0)
  })
})
