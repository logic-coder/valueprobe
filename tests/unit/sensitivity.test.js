import { describe, expect, it } from 'vitest'
import { presentValue } from '../../src/lib/dcf'
import { SENS_STEPS, buildSensitivityGrid, marginBucket } from '../../src/lib/sensitivity'

const base = { tbv: 0, years: 10, base: 1, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10, addToFairValue: false }

describe('sensitivity grid', () => {
  it('is five by five and centred on the current assumptions', () => {
    const grid = buildSensitivityGrid({ ...base, discountRate: 12, growthRate: 5 })
    expect(grid.discounts).toHaveLength(2 * SENS_STEPS + 1)
    expect(grid.growths).toHaveLength(2 * SENS_STEPS + 1)
    expect(grid.center).toEqual({ discountRate: 12, growthRate: 5 })
  })

  it('matches the kernel at the centre cell', () => {
    const grid = buildSensitivityGrid({ ...base, discountRate: 12, growthRate: 5 })
    const row = grid.discounts.indexOf(12)
    const column = grid.growths.indexOf(5)
    expect(grid.rows[row][column]).toBe(presentValue(0, 10, 12, 5, 1, 4, 10, false).fairValue)
  })

  it('clamps the axes to the accepted bounds', () => {
    const low = buildSensitivityGrid({ ...base, discountRate: 1, growthRate: -18 })
    expect(low.discounts[0]).toBe(0)
    expect(low.growths[0]).toBe(-20)
    const high = buildSensitivityGrid({ ...base, discountRate: 49, growthRate: 59 })
    expect(high.discounts.at(-1)).toBe(50)
    expect(high.growths.at(-1)).toBe(60)
  })

  it('centres on the exact inputs instead of rounding them', () => {
    const grid = buildSensitivityGrid({ ...base, discountRate: 10.6, growthRate: 21.05 })
    expect(grid.center).toEqual({ discountRate: 10.6, growthRate: 21.05 })
    expect(grid.discounts).toContain(10.6)
    expect(grid.growths).toContain(21.05)
    expect(grid.growths).toHaveLength(5)
    const row = grid.discounts.indexOf(grid.center.discountRate)
    const column = grid.growths.indexOf(grid.center.growthRate)
    expect(grid.rows[row][column]).toBe(presentValue(0, 10, 10.6, 21.05, 1, 4, 10, false).fairValue)
  })

  it('keeps a growth column for a rate above the range', () => {
    const grid = buildSensitivityGrid({ ...base, discountRate: 12, growthRate: 164 })
    expect(grid.growths).toEqual([164])
    expect(grid.center.growthRate).toBe(164)
    expect(grid.rows.every((cells) => cells.length === 1)).toBe(true)
  })

  it('drops non-finite cells instead of leaking Infinity', () => {
    const grid = buildSensitivityGrid({ ...base, discountRate: 0, growthRate: 5 })
    expect(grid.rows[0].every((value) => value === null || Number.isFinite(value))).toBe(true)
  })
})

describe('margin bucket', () => {
  it('tints by distance to the price', () => {
    expect(marginBucket(100, 50)).toBe('good')
    expect(marginBucket(100, 90)).toBe('ok')
    expect(marginBucket(100, 110)).toBe('thin')
    expect(marginBucket(100, 200)).toBe('bad')
    expect(marginBucket(null, 100)).toBe('na')
    expect(marginBucket(100, 0)).toBe('na')
  })
})
