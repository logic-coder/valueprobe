import { describe, expect, it } from 'vitest'
import { buildDefaults, calGr2fv, calculateReverse, impliedGrowth, marginOfSafety, presentValue, round2 } from '../../src/lib/dcf'

// Reference numbers are produced by the original page engine for the live 601398
// payload (eps 1.08, fcf 6.64, tbv 11.24, price 8.85, indicator 5.14, growth 5, terminal 4).
const DEFAULT_ARGS = [11.24, 10, 12, 5, 1.08, 4, 10, false]

describe('calGr2fv', () => {
  it('reproduces the original fair value / growth / terminal split', () => {
    const result = calGr2fv(...DEFAULT_ARGS)
    expect(result.fairValue).toBe(11.56)
    expect(result.growthValue).toBe(7.7)
    expect(result.terminalValue).toBe(3.85)
  })

  it('adds tangible book value only when the checkbox is set', () => {
    expect(calGr2fv(...DEFAULT_ARGS).fairValue).toBe(11.56)
    expect(calGr2fv(11.24, 10, 12, 5, 1.08, 4, 10, true).fairValue).toBe(22.8)
  })

  it('uses the annuity shortcut when growth equals the discount rate', () => {
    const result = calGr2fv(0, 5, 10, 10, 1, 0, 1, false)
    // m === 1 -> c = years, terminal factor g = 1 / 1.1
    expect(result.growthValue).toBe(5)
    expect(result.terminalValue).toBe(round2(1 * Math.pow(1, 5) * (1 / 1.1) / (1 - 1 / 1.1) * (1 - Math.pow(1 / 1.1, 1))))
  })

  it('handles zero fast-growth years without NaN', () => {
    const result = calGr2fv(0, 0, 12, 5, 2, 4, 10, false)
    expect(Number.isFinite(result.fairValue)).toBe(true)
    expect(result.growthValue).toBe(0)
  })
})

describe('presentValue', () => {
  it('fades a high historical rate instead of holding it above the discount rate', () => {
    // Tencent: EPS 25.9021, 10y CAGR 21.05%, discount 10%, terminal 4% for 10 years.
    // The constant-rate annuity prices that at 957.27. A straight-line fade does not.
    expect(presentValue(0, 10, 10, 21.05, 25.9021, 4, 10, false).fairValue).toBe(540.11)
    expect(presentValue(0, 10, 10, 40.71, 17.95, 4, 10, false).fairValue).toBe(704.17)
  })

  it('leaves a low growth rate close to the constant annuity', () => {
    expect(presentValue(11.24, 10, 12, 3, 1.08, 4, 10, false).fairValue).toBe(10.49)
  })

  it('solves the starting growth that the fading path needs to match a price', () => {
    expect(impliedGrowth(11.24, 10, 12, 1.08, 8.85, 4, 8.85, 10, false)).toBe('-1.99')
  })
})

describe('calculateReverse', () => {
  it('solves the growth rate that justifies the market price', () => {
    expect(calculateReverse(11.24, 10, 12, 1.08, 8.85, 4, 8.85, 10, false)).toBe('0.71')
  })

  it('returns null instead of an astronomical rate when the base is not positive', () => {
    expect(calculateReverse(0, 10, 10, 0, 8.85, 4, 8.85, 10, false)).toBeNull()
    expect(calculateReverse(0, 10, 12, -1, 8.85, 4, null, 10, false)).toBeNull()
  })

  it('returns a larger rate for a larger price', () => {
    const low = parseFloat(calculateReverse(11.24, 10, 12, 1.08, 11.56, 4, 11.56, 10, false))
    const high = parseFloat(calculateReverse(11.24, 10, 12, 1.08, 30, 4, 30, 10, false))
    expect(high).toBeGreaterThan(low)
  })
})

describe('marginOfSafety', () => {
  it('is the discount of price to fair value', () => {
    expect(marginOfSafety(8.85, 11.56)).toBe('23.44')
  })

  it('is n/a above 100 percent or when undefined', () => {
    expect(marginOfSafety(-1, 11.56)).toBe('n/a')
    expect(marginOfSafety(0, 11.56)).toBe('100.00')
    expect(marginOfSafety(8.85, 0)).toBe('-Infinity')
  })
})

describe('buildDefaults', () => {
  it('derives the discount rate from the ceiling of the indicator plus six', () => {
    const { dcfForm } = buildDefaults(5.14, { ttm_eps: 1.08, ttm_eps_nri: 1.08, earning_growth_10y: 3, cashflow_growth_10y: -4.8, tangible_book: 11.24, price: '¥8.85' }, 6.64)
    expect(dcfForm.discountRate).toBe(12)
    expect(dcfForm.growthRate).toBe(3)
    expect(dcfForm.freecashflowGrowthRate).toBe(-4.8)
    expect(dcfForm.years).toBe(10)
    expect(dcfForm.terminalGrowthRate).toBe(4)
    expect(dcfForm.yearsOfTerminalGrowth).toBe(10)
  })

  it('keeps a high reported growth rate and uses eight percent without an indicator', () => {
    const { dcfForm } = buildDefaults(null, { ttm_eps: 1, earning_growth_10y: 44, cashflow_growth_10y: 30, price: '1' }, 1)
    expect(dcfForm.discountRate).toBe(8)
    expect(dcfForm.growthRate).toBe(44)
    expect(dcfForm.freecashflowGrowthRate).toBe(30)
  })

  it('uses the placeholder only when history is missing', () => {
    const { dcfForm } = buildDefaults(4, { ttm_eps: 1, price: '1' }, 1)
    expect(dcfForm.growthRate).toBe(5)
    expect(dcfForm.freecashflowGrowthRate).toBe(5)
  })
})
