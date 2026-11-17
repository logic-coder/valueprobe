import { describe, expect, it } from 'vitest'
import { MIN_ANNUALIZATION_DAYS, QualityStatus, Reason, ReturnMethod, measure, measurePriceSeries, xirr } from '../../src/lib/measure'

const DAY = 86_400_000
// Observations a month apart: XIRR cannot converge over a couple of days.
const at = (n) => 1_700_000_000_000 + n * 30 * DAY
const points = (...values) => values.map((value, i) => ({ date: at(i), value }))

describe('measure', () => {
  it('needs two observations', () => {
    const result = measure(points(100))
    expect(result.quality.reasons).toContain(Reason.TWO_POINTS_REQUIRED)
    expect(result.returns.twr).toBeNull()
  })

  it('reports no data when the return chain breaks', () => {
    const result = measure(points(100, 60), [{ date: at(1), inflow: -200 }])
    expect(result.quality.reasons).toContain(Reason.NEGATIVE_DENOMINATOR)
    expect(result.returns.twr).toBeNull()
    expect(result.quality.status).toBe(QualityStatus.NO_DATA)
  })

  it('declines a non-positive start', () => {
    expect(measure(points(0, 10)).quality.reasons).toContain(Reason.NON_POSITIVE_START)
  })

  it('reports value return and time-weighted return for a flat position', () => {
    const result = measure(points(100, 110, 121))
    expect(result.returns.valueReturn).toBeCloseTo(0.21)
    expect(result.returns.twr).toBeCloseTo(0.21)
    expect(result.quality.status).toBe(QualityStatus.OK)
  })

  it('neutralises a contribution so TWR ignores it', () => {
    const result = measure(points(100, 220), [{ date: at(1), inflow: 100 }])
    expect(result.returns.valueReturn).toBeCloseTo(1.2)
    // (220 - 100 - 100) / (100 + 100) = 0.1
    expect(result.returns.twr).toBeCloseTo(0.1)
  })

  it('neutralises a distribution', () => {
    const result = measure(points(100, 110), [{ date: at(1), outflow: 10 }])
    expect(result.returns.twr).toBeCloseTo(0.2)
  })

  it('tracks the worst drawdown with its dates', () => {
    const result = measure(points(100, 120, 60, 90, 120))
    expect(result.risk.maxDrawdown).toBeCloseTo(-0.5)
    expect(result.risk.peakDate).toBe(at(1))
    expect(result.risk.troughDate).toBe(at(2))
    expect(result.risk.recoveryDate).toBe(at(4))
    expect(result.risk.durationDays).toBe(90)
  })

  it('annualises only when the window is long enough', () => {
    const short = measure([
      { date: at(0), value: 100 },
      { date: at(0) + 5 * DAY, value: 110 },
    ])
    expect(short.returns.annualizedTwr).toBeNull()
    expect(MIN_ANNUALIZATION_DAYS).toBeGreaterThanOrEqual(30)
  })

  it('flags a price-only series as unable to answer IRR', () => {
    const result = measurePriceSeries(points(100, 110))
    expect(result.quality.method).toBe(ReturnMethod.PRICE)
    expect(result.returns.irr).toBeNull()
    expect(result.quality.warnings).toContain(Reason.PRICE_ONLY)
  })

  it('needs positive returns before volatility exists', () => {
    expect(measure(points(100, 110)).risk.volatility).toBeNull()
    expect(measure(points(100, 110, 121, 133, 146)).risk.volatility).toBeGreaterThan(0)
  })
})

describe('xirr', () => {
  it('solves a one-year 10 percent return', () => {
    const start = 1_700_000_000_000
    const solved = xirr([{ date: start, amount: -100 }, { date: start + 365 * DAY, amount: 110 }])
    expect(solved.irr).toBeCloseTo(0.1, 2)
  })

  it('reports when there is no sign change', () => {
    expect(xirr([{ date: at(0), amount: -100 }, { date: at(30), amount: -50 }]).reason).toBe(Reason.NO_SIGN_CHANGE)
  })

  it('reports a single flow', () => {
    expect(xirr([{ date: at(0), amount: -100 }]).reason).toBe(Reason.TWO_POINTS_REQUIRED)
  })
})
