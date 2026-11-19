import { describe, expect, it } from 'vitest'
import { buildDefaults, calGr2fv, calculateReverse, impliedGrowth, marginOfSafety, presentValue, round2 } from '../../src/lib/dcf'

// Locked reference numbers for the 601398 payload:
// eps 1.08, fcf 6.64, tbv 11.24, price 8.85, indicator 5.14, growth 5, terminal 4.
const DEFAULT_ARGS = [11.24, 10, 12, 5, 1.08, 4, 10, false]

describe('calGr2fv', () => {
  it('reproduces the frozen fair value / growth / terminal split', () => {
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
    // Tencent: EPS 25.9021, 10y CAGR 21.05%, discount 10%, terminal 4% for 10 years,
    // then capitalized at 4%. The faded path is 574.99 of explicit years plus
    // 317.76 of continuing value.
    expect(presentValue(0, 10, 10, 21.05, 25.9021, 4, 10, false).fairValue).toBe(892.75)
    expect(presentValue(0, 10, 10, 40.71, 17.95, 4, 10, false).fairValue).toBe(1290.55)
  })

  it('values the ICBC defaults with the continuing value', () => {
    // 10.45 of finite annuity plus 3.04 for the years after the second stage.
    expect(presentValue(11.24, 10, 12, 3, 1.08, 4, 10, false)).toEqual({ fairValue: 13.49, growthValue: 7.11, terminalValue: 6.38 })
  })

  it('adds the capitalized year after the second stage when discount exceeds terminal growth', () => {
    const flow = 1.04
    const finite = flow / 1.1
    const continuing = (flow * 1.04) / (0.10 - 0.04) / 1.1
    const result = presentValue(0, 0, 10, 20, 1, 4, 1, false)
    expect(result.terminalValue).toBe(round2(finite + continuing))
    expect(result.fairValue).toBeGreaterThan(round2(finite))
  })

  const finiteAnnuity = (r, g0, gT, base) => {
    let flow = base
    let sum = 0
    for (let t = 1; t <= 10; t++) {
      flow *= 1 + g0 + (gT - g0) * (t - 1) / 9
      sum += flow / Math.pow(1 + r, t)
    }
    for (let k = 1; k <= 10; k++) {
      flow *= 1 + gT
      sum += flow / Math.pow(1 + r, 10 + k)
    }
    return { sum, flow }
  }

  it('is above the finite annuity alone for a positive base', () => {
    const { sum, flow } = finiteAnnuity(0.10, 0.08, 0.04, 2)
    const continuing = (flow * 1.04) / 0.06 / Math.pow(1.1, 20)
    const fair = presentValue(0, 10, 10, 8, 2, 4, 10, false).fairValue
    expect(fair).toBeGreaterThan(round2(sum))
    expect(fair).toBe(round2(sum + continuing))
  })

  it('keeps only the finite annuity when terminal growth meets the discount rate', () => {
    expect(presentValue(0, 10, 10, 8, 2, 10, 10, false).fairValue).toBe(round2(finiteAnnuity(0.10, 0.08, 0.10, 2).sum))
  })

  it('does not explode when terminal growth meets or passes the discount rate', () => {
    const at = presentValue(0, 10, 5, 5, 1, 5, 10, false).fairValue
    const above = presentValue(0, 10, 5, 5, 1, 6, 10, false).fairValue
    expect(Number.isFinite(at)).toBe(true)
    expect(Number.isFinite(above)).toBe(true)
    expect(at).toBeLessThan(25)
    expect(above).toBeLessThan(30)
  })

  it('caps the capitalization growth two points under the discount rate', () => {
    // Terminal 4, discount 5: capitalized at 3%, a multiple of 1.03 / 0.02, not 1.04 / 0.01.
    const result = presentValue(0, 0, 5, 0, 1, 4, 0, false)
    expect(result.terminalValue).toBe(round2(1.03 / 0.02))
  })

  it('grows year one at the entered rate and the last fast year at the terminal rate', () => {
    // Two fast years, no terminal years: year 1 at 20%, year 2 at 4%.
    const expected = 1.2 / 1.1 + (1.2 * 1.04) / (1.1 * 1.1)
    expect(presentValue(0, 2, 10, 20, 1, 4, 0, false).growthValue).toBe(round2(expected))
  })

  it('uses the entered rate, not the terminal rate, for a single fast year', () => {
    expect(presentValue(0, 1, 10, 20, 1, 4, 0, false).growthValue).toBe(round2(1.2 / 1.1))
  })

  it('skips the fast loop for zero fast years and grows the base at the terminal rate', () => {
    const result = presentValue(0, 0, 10, 20, 1, 4, 1, false)
    expect(result.growthValue).toBe(0)
    expect(result.terminalValue).toBe(round2(1.04 / 1.1 + (1.04 * 1.04) / 0.06 / 1.1))
  })

  it('solves the starting growth that the fading path needs to match a price', () => {
    expect(impliedGrowth(11.24, 10, 12, 1.08, 8.85, 4, 8.85, 10, false)).toBe('-7.34')
  })

  it('inverts the fair value the page shows', () => {
    const fair = presentValue(0, 10, 10, 15, 10.81, 4, 10, false).fairValue
    expect(parseFloat(impliedGrowth(0, 10, 10, 10.81, fair, 4, null, 10, false))).toBeCloseTo(15, 1)
  })

  it('reprices to the target at the solved growth', () => {
    const solved = parseFloat(impliedGrowth(0, 10, 10, 25.9021, 600, 4, null, 10, false))
    expect(presentValue(0, 10, 10, solved, 25.9021, 4, 10, false).fairValue).toBeCloseTo(600, 0)
  })

  it('returns null at once when book value alone is above the price', () => {
    const started = Date.now()
    expect(impliedGrowth(50, 10, 12, 1, 20, 4, 20, 10, true)).toBeNull()
    expect(Date.now() - started).toBeLessThan(50)
  })

  it('returns null when even the top of the range cannot reach the price', () => {
    expect(impliedGrowth(0, 10, 12, 0.01, 1e9, 4, null, 10, false)).toBeNull()
  })

  it('returns null when the base or price is not positive', () => {
    expect(impliedGrowth(0, 10, 12, 0, 10, 4, null, 10, false)).toBeNull()
    expect(impliedGrowth(0, 10, 12, 1, 0, 4, null, 10, false)).toBeNull()
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
    expect(marginOfSafety(0, 11.56)).toBe('n/a')
    expect(marginOfSafety(8.85, 0)).toBe('n/a')
    expect(marginOfSafety('', 11.56)).toBe('n/a')
    expect(marginOfSafety(null, 11.56)).toBe('n/a')
    expect(marginOfSafety(Infinity, 11.56)).toBe('n/a')
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

  it('uses eight percent for a Chinese ten-year yield below two', () => {
    const { dcfForm } = buildDefaults(1.5892, { ttm_eps: 1.08, price: '¥8.85' }, 6.64)
    expect(dcfForm.discountRate).toBe(8)
  })

  it('caps a high reported growth rate at fifteen and uses eight percent without an indicator', () => {
    const { dcfForm } = buildDefaults(null, { ttm_eps: 1, earning_growth_10y: 44, cashflow_growth_10y: 30, price: '1' }, 1)
    expect(dcfForm.discountRate).toBe(8)
    expect(dcfForm.growthRate).toBe(15)
    expect(dcfForm.freecashflowGrowthRate).toBe(15)
  })

  it('leaves growth empty when history is missing', () => {
    const { dcfForm } = buildDefaults(4, { ttm_eps: 1, price: '1' }, 1)
    expect(dcfForm.growthRate).toBeNull()
    expect(dcfForm.freecashflowGrowthRate).toBeNull()
  })

  it('leaves missing earnings and free cash flow empty instead of zero', () => {
    const { dcfForm } = buildDefaults(4, { ttm_eps: null, ttm_eps_nri: undefined, price: '1' }, null)
    expect(dcfForm.eps).toBeNull()
    expect(dcfForm.freecashflow).toBeNull()
    expect(buildDefaults(4, { price: '1' }, undefined).dcfForm.freecashflow).toBeNull()
  })

  it('keeps a reported zero', () => {
    const { dcfForm } = buildDefaults(4, { ttm_eps: 0, ttm_eps_nri: null, price: '1' }, 0)
    expect(dcfForm.eps).toBe(0)
    expect(dcfForm.freecashflow).toBe(0)
  })
})
