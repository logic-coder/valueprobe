import { describe, expect, it } from 'vitest'
import { FirstValue, MIN_ANNUALIZATION_DAYS, QualityStatus, Reason, ReturnMethod, measure, measurePriceSeries, xirr } from '../../src/lib/measure'

const DAY = 86_400_000

// Exactly one 365.25-day year per step, so every annualised answer below is hand-computable.
const YEAR = 365.25 * DAY
const t = (n) => 1_700_000_000_000 + n * YEAR
const year = (first, last) => [{ date: t(0), value: first }, { date: t(1), value: last }]
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

// Contract: values are closes, so a flow dated the first observation is already
// inside value[0]; FirstValue.BEFORE says the caller's value[0] predates it.
describe('first-day valuation basis', () => {
  it('does not count a funded first close twice', () => {
    // 200 capital, 220 a year later: 10% whether or not the 100 of it was a day-0 flow.
    const flows = [{ date: t(0), inflow: 100 }]
    const result = measure(year(200, 220), flows)
    expect(result.returns.valueReturn).toBeCloseTo(0.1)
    expect(result.returns.twr).toBeCloseTo(0.1)
    expect(result.returns.irr).toBeCloseTo(0.1)
    expect(result.quality.reasons).not.toContain(Reason.UNKNOWN_FLOW)
    expect(measure(year(200, 220), flows, { firstValue: FirstValue.AFTER }).returns.irr).toBeCloseTo(0.1)
  })

  it('adds a pre-flow first close to the opening balance', () => {
    // 100 held, 100 contributed on day 0: 200 capital, 220 a year later, 10%.
    const result = measure(year(100, 220), [{ date: t(0), inflow: 100 }], { firstValue: FirstValue.BEFORE })
    expect(result.returns.valueReturn).toBeCloseTo(0.1)
    expect(result.returns.twr).toBeCloseTo(0.1)
    expect(result.returns.irr).toBeCloseTo(0.1)
    // Read as post-flow, the same numbers are 100 out and 220 back: 120%.
    const post = measure(year(100, 220), [{ date: t(0), inflow: 100 }])
    expect(post.returns.irr).toBeCloseTo(1.2)
  })

  it('nets a pre-flow withdrawal into the opening balance', () => {
    // 200 held, 100 withdrawn on day 0: 100 capital, 110 a year later, 10%.
    const result = measure(year(200, 110), [{ date: t(0), outflow: 100 }], { firstValue: FirstValue.BEFORE })
    expect(result.returns.valueReturn).toBeCloseTo(0.1)
    expect(result.returns.twr).toBeCloseTo(0.1)
    expect(result.returns.irr).toBeCloseTo(0.1)
  })

  it('declines a pre-flow opening that a day-0 withdrawal empties', () => {
    const result = measure(year(100, 50), [{ date: t(0), outflow: 100 }], { firstValue: FirstValue.BEFORE })
    expect(result.quality.reasons).toContain(Reason.NON_POSITIVE_START)
  })
})

describe('same-day and terminal flows', () => {
  it('aggregates several trades dated the same day', () => {
    // 40 + 60 at t1 is one 100 contribution: (220 - 100 - 100) / 200 = 10%.
    const split = measure(year(100, 220), [{ date: t(1), inflow: 40 }, { date: t(1), inflow: 60 }])
    expect(split.returns.twr).toBeCloseTo(0.1)
    expect(split.returns.irr).toBeCloseTo(measure(year(100, 220), [{ date: t(1), inflow: 100 }]).returns.irr)
    expect(split.returns.irr).toBeCloseTo(0.2)
  })

  it('nets a same-day contribution against a withdrawal', () => {
    // +100 in and -50 out on t1: (170 + 50 - 100 - 100) / 200 = 10%.
    const result = measure(year(100, 170), [{ date: t(1), inflow: 100 }, { date: t(1), outflow: 50 }])
    expect(result.returns.twr).toBeCloseTo(0.1)
    expect(result.returns.irr).toBeCloseTo(0.2)
  })

  it('gives a terminal contribution no holding period', () => {
    // The 100 arrives at the close: 10% TWR dilutes to 5%, money-weighted stays 10%.
    const result = measure(year(100, 210), [{ date: t(1), inflow: 100 }])
    expect(result.returns.twr).toBeCloseTo(0.05)
    expect(result.returns.irr).toBeCloseTo(0.1)
  })

  it('keeps a terminal withdrawal out of the return', () => {
    // (110 + 10 - 100) / 100 = 20%, and +10 at the close is money handed back.
    const result = measure(year(100, 110), [{ date: t(1), outflow: 10 }])
    expect(result.returns.twr).toBeCloseTo(0.2)
    expect(result.returns.irr).toBeCloseTo(0.2)
  })
})

describe('unmatchable flow dates', () => {
  it('reports a flow between observations and drops the chained metrics', () => {
    const result = measure(year(100, 110), [{ date: t(0.5), inflow: 10 }])
    expect(result.quality.reasons).toContain(Reason.UNKNOWN_FLOW)
    expect(result.returns.twr).toBeNull()
    expect(result.returns.irr).toBeNull()
    expect(result.risk.maxDrawdown).toBeNull()
    expect(result.returns.valueReturn).toBeCloseTo(0.1)
    expect(result.quality.status).toBe(QualityStatus.NO_DATA)
  })

  it('reports a flow dated before the first observation', () => {
    const result = measure(year(100, 110), [{ date: t(-1), inflow: 10 }])
    expect(result.quality.reasons).toContain(Reason.UNKNOWN_FLOW)
    expect(result.returns.twr).toBeNull()
  })

  it('ignores a zero flow on an unmatchable date', () => {
    const result = measure(year(100, 110), [{ date: t(0.5), inflow: 0 }])
    expect(result.quality.reasons).not.toContain(Reason.UNKNOWN_FLOW)
    expect(result.returns.twr).toBeCloseTo(0.1)
  })
})

describe('short windows', () => {
  it('reports why annualisation is missing instead of a bare null', () => {
    const short = measure(year(100, 110).map((point, i) => ({ ...point, date: t(0) + i * 10 * DAY })))
    expect(short.quality.reasons).toContain(Reason.ANNUALIZATION_TOO_SHORT)
    expect(short.returns.annualizedValueReturn).toBeNull()
    expect(short.returns.annualizedTwr).toBeNull()
    expect(short.quality.status).not.toBe(QualityStatus.NO_DATA)
  })

  it('annualises once the window reaches the minimum', () => {
    const result = measure(year(100, 110).map((point, i) => ({ ...point, date: t(0) + i * MIN_ANNUALIZATION_DAYS * DAY })))
    expect(result.quality.reasons).not.toContain(Reason.ANNUALIZATION_TOO_SHORT)
    expect(result.returns.annualizedValueReturn).toBeCloseTo(Math.pow(1.1, 365.25 / MIN_ANNUALIZATION_DAYS) - 1)
  })
})

describe('price series without XIRR', () => {
  it('never asks the solver, even when an answer would exist', () => {
    const result = measurePriceSeries([{ date: t(0), price: 100 }, { date: t(1), price: 110 }])
    expect(result.returns.irr).toBeNull()
    expect(result.returns.annualizedIrr).toBeNull()
    expect(result.quality.warnings).toContain(Reason.PRICE_ONLY)
    expect(result.quality.reasons).not.toContain(Reason.NO_CONVERGENCE)
    expect(result.quality.reasons).not.toContain(Reason.NO_SIGN_CHANGE)
    expect(result.quality.status).not.toBe(QualityStatus.NO_DATA)
  })

  it('still reports the short window', () => {
    const result = measurePriceSeries([{ date: t(0), price: 100 }, { date: t(0) + 10 * DAY, price: 110 }])
    expect(result.quality.reasons).toContain(Reason.ANNUALIZATION_TOO_SHORT)
    expect(result.returns.irr).toBeNull()
  })
})
