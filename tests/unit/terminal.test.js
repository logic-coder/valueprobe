import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calGr2fv, impliedGrowth, presentValue } from '../../src/lib/dcf'
import { policyValue, policyDiscountRate } from '../../src/lib/policy'
import { buildSensitivityGrid } from '../../src/lib/sensitivity'
import { toStock } from '../../src/lib/stockRecord'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const base = 1.08
const at = (growth, rate = 10, terminal = 4) => presentValue(0, 10, rate, growth, base, terminal, 10, false)

describe('the continuing value shares the capped domain across the rate boundary', () => {
  it('keeps 9.99, 10 and 10.01 terminal growth on one value', () => {
    const below = at(7, 10, 9.99)
    const equal = at(7, 10, 10)
    const above = at(7, 10, 10.01)
    expect(below.continuation).toBe(true)
    expect(equal.continuation).toBe(true)
    expect(above.continuation).toBe(true)
    expect(below.fairValue).toBe(equal.fairValue)
    expect(above.fairValue).toBe(equal.fairValue)
    expect(equal.fairValue).not.toBe(17.7)
    expect(equal.fairValue).toBeGreaterThan(at(7, 10, 4).fairValue)
  })

  it('states the effective growth instead of silently changing horizon', () => {
    const capped = at(7, 10, 9)
    expect(capped.continuation).toBe(true)
    expect(capped.effectiveTerminalGrowth).toBeCloseTo(8, 10)
    expect(capped.effectiveTerminalGrowth).toBeLessThan(9)
    expect(capped.finiteTerminalValue).toBeGreaterThan(0)
    expect(capped.terminalValue).toBeCloseTo(capped.finiteTerminalValue + capped.continuationValue, 6)
  })

  it('stays finite at a zero rate and with negative growth', () => {
    const zero = at(-2, 0, -2)
    expect(zero.continuation).toBe(true)
    expect(Number.isFinite(zero.fairValue)).toBe(true)
    expect(Number.isFinite(at(-1, 10).fairValue)).toBe(true)
  })

  it('round-trips forward value and implied growth inside the valid domain', () => {
    const price = at(7).fairValue
    expect(impliedGrowth(0, 10, 10, base, price, 4, price, 10, false)).toBe('7.00')
  })

  it('keeps the finite geometric series continuous above the rate', () => {
    const equal = calGr2fv(0, 10, 10, 10, 1, 10, 10, false)
    const above = calGr2fv(0, 10, 10, 10.01, 1, 10, 10, false)
    expect(Number.isFinite(equal.fairValue)).toBe(true)
    expect(Number.isFinite(above.fairValue)).toBe(true)
    expect(above.terminalValue).toBeGreaterThan(0)
    expect(Math.abs(above.fairValue - equal.fairValue)).toBeLessThan(1)
  })

  it('leaves sensitivity cells finite or empty, never NaN', () => {
    const grid = buildSensitivityGrid({ discountRate: 10, growthRate: 9.9, tbv: 0, years: 10, base, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10 })
    for (const row of grid.rows) for (const cell of row) expect(cell === null || Number.isFinite(cell)).toBe(true)
  })
})

describe('the policy discloses a dropped continuing value', () => {
  it('warns and shows a zero terminal share under the rate', () => {
    const stock = toStock(read('public/data/NASDAQ-AAPL.json'))
    const rate = -2.5
    expect(policyDiscountRate(rate)).toBe(4)
    const value = policyValue(stock, { rates: { USD: { value: rate, asOf: null } } })
    expect(value.status).toBe('ok')
    expect(value.warnings).toContain('TERMINAL_CAPPED')
    expect(value.warnings).not.toContain('RATE_FALLBACK')
    expect(value.terminalShare).toBeGreaterThan(0)
    expect(value.terminalShare).toBeLessThan(1)
  })
})
