import { describe, expect, it } from 'vitest'
import { buildTrend, linearRegression } from '../../src/lib/trend'

describe('linearRegression', () => {
  it('fits a perfect line with r = 1', () => {
    const fit = linearRegression([1, 2, 3, 4], [2, 4, 6, 8])
    expect(fit.slope).toBeCloseTo(2, 10)
    expect(fit.r).toBeCloseTo(1, 10)
  })
})

describe('buildTrend', () => {
  it('smooths string metrics from the API fixtures', () => {
    const data = [['2002-12', '1.00'], ['2003-12', '1.10'], ['2004-12', '1.20']]
    const trend = buildTrend(data)
    expect(trend).not.toBeNull()
    expect(Number(trend.r)).toBeGreaterThan(0.9)
    expect(trend.simData).toHaveLength(3)
  })
})
