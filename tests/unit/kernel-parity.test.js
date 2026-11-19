import { describe, expect, it } from 'vitest'
import { calGr2fv, calculateReverse, marginOfSafety } from '../../src/lib/dcf'

/**
 * Red-line guard: the formula kernel is frozen. Every number below is a
 * locked reference for SHSE:601398. If one of these moves, the kernel drifted
 * -- fix the kernel, not the test.
 */
describe('frozen kernel parity', () => {
  it('case 1: fair value for the shipped defaults', () => {
    expect(calGr2fv(11.24, 10, 12, 5, 1.08, 4, 10, false).fairValue).toBe(11.56)
  })

  it('case 2: fast-growth component of the same inputs', () => {
    expect(calGr2fv(11.24, 10, 12, 5, 1.08, 4, 10, false).growthValue).toBe(7.7)
  })

  it('case 3: terminal component of the same inputs', () => {
    expect(calGr2fv(11.24, 10, 12, 5, 1.08, 4, 10, false).terminalValue).toBe(3.85)
  })

  it('case 4: fair value with tangible book folded in', () => {
    expect(calGr2fv(11.24, 10, 12, 5, 1.08, 4, 10, true).fairValue).toBe(22.8)
  })

  it('case 5: reverse DCF against the market price', () => {
    expect(calculateReverse(11.24, 10, 12, 1.08, 8.85, 4, 8.85, 10, false)).toBe('0.71')
  })

  it('case 6: margin of safety against the market price', () => {
    expect(marginOfSafety(8.85, 11.56)).toBe('23.44')
  })

  it('keeps the infinities instead of smoothing them', () => {
    expect(marginOfSafety(8.85, 0)).toBe('-Infinity')
    expect(Number.isFinite(calGr2fv(0, 10, 0, 5, 1, 4, 10, false).fairValue)).toBe(true)
  })
})
