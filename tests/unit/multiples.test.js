import { describe, expect, it } from 'vitest'
import { MULTIPLES, currentMultiple, impliedPrice } from '../../src/lib/multiples'

describe('multiple cross-check', () => {
  it('implies a price from a base and a target multiple', () => {
    expect(impliedPrice(1.08, 12)).toBe(12.96)
    expect(impliedPrice(11.24, 1.2)).toBeCloseTo(13.49, 2)
  })

  it('computes the multiple the market currently pays', () => {
    expect(currentMultiple(1.08, 9.05)).toBe(8.38)
  })

  it('returns null rather than dividing by zero', () => {
    expect(currentMultiple(0, 9.05)).toBeNull()
    expect(currentMultiple(1.08, 0)).toBeNull()
    expect(impliedPrice(0, 12)).toBeNull()
    expect(impliedPrice(1, -1)).toBeNull()
  })

  it('names the three bases the page can supply', () => {
    expect(MULTIPLES.map((item) => item.baseField)).toEqual(['eps', 'freecashflow', 'tbv'])
  })
})
