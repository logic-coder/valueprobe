import { describe, expect, it } from 'vitest'
import { MAX_UNDERWRITTEN_GROWTH, adoptGrowth, cleanGrowth, windowGrowth } from '../../src/lib/assumptions'

// GOOGL 2016-2025 as filed: the 2020 20-for-1 split is not restated in the older years.
const GOOGL_EPS = [27.85, 18, 43.7, 49.16, 2.93, 5.61, 4.56, 5.8, 8.04, 10.81]

describe('cleanGrowth', () => {
  it('measures only the years after a split instead of a negative cross-split CAGR', () => {
    const clean = cleanGrowth(GOOGL_EPS)
    expect(clean.shifted).toBe(true)
    expect(clean.start).toBe(4)
    expect(clean.end).toBe(9)
    expect(clean.rate).toBe(29.83)
    expect(clean.rate).toBeGreaterThan(0)
  })

  it('underwrites at most fifteen percent while keeping the clean history for the note', () => {
    const adopted = adoptGrowth(cleanGrowth(GOOGL_EPS).rate)
    expect(adopted.adopted).toBeGreaterThanOrEqual(0)
    expect(adopted.adopted).toBeLessThanOrEqual(MAX_UNDERWRITTEN_GROWTH)
    expect(adopted.adopted).toBe(15)
    expect(adopted.historical).toBe(29.83)
    expect(adopted.reason).toBe('capped')
  })

  it('refuses a clean window shorter than four years', () => {
    const clean = cleanGrowth([20, 22, 24, 26, 28, 30, 32, 3.4, 3.6, 3.9])
    expect(clean.shifted).toBe(true)
    expect(clean.rate).toBeNull()
    expect(adoptGrowth(clean.rate)).toEqual({ historical: null, adopted: null, reason: 'missing' })
  })

  it('does not call a recovered slump, a loss, or a latest-year drop a level shift', () => {
    expect(cleanGrowth([10, 3, 8, 11, 12]).shifted).toBe(false)
    expect(cleanGrowth([1, 1.2, -0.5, -0.2, 0.3]).shifted).toBe(false)
    expect(cleanGrowth([4, 5, 6, 7, 8, 2]).shifted).toBe(false)
  })

  it('keeps a negative rate from a clean history', () => {
    expect(cleanGrowth([10, 9, 8, 7, 6]).rate).toBeLessThan(0)
    expect(cleanGrowth([10, 9, 8, 7, 6]).shifted).toBe(false)
    expect(cleanGrowth([10, 9, 8, 7, 6], [50, 48, 46, 44, 42]).shifted).toBe(false)
    expect(adoptGrowth(-12).adopted).toBe(-12)
  })
})

// AAPL FY2017-FY2026 as stored: FY2017 EPS is pre-split, revenue per share is restated.
const AAPL_EPS = [9.21, 2.98, 2.97, 3.28, 5.61, 6.11, 6.13, 6.08, 7.46, 8.98]
const AAPL_REVENUE = [10.9124, 13.2795, 13.9911, 15.6613, 21.691, 24.1536, 24.2393, 25.3785, 27.7354, 32.5288]

describe('cleanGrowth after a split whose new base grows back through the old line', () => {
  it('treats the Apple shape as a break and does not underwrite a negative ten-year rate', () => {
    const clean = cleanGrowth(AAPL_EPS, AAPL_REVENUE)
    expect(clean.shifted).toBe(true)
    expect(clean.start).toBe(1)
    expect(clean.rate).toBe(14.78)
    expect(adoptGrowth(clean.rate).adopted).toBe(14.78)
  })

  it('treats the Apple shape as a break without a second series too', () => {
    expect(cleanGrowth(AAPL_EPS).shifted).toBe(true)
    expect(cleanGrowth(AAPL_EPS).rate).toBe(14.78)
  })

  it('does not call a cliff a split when revenue fell with it', () => {
    // Pfizer 2020-2025: revenue per share fell by a third as earnings fell.
    const clean = cleanGrowth([1.63, 3.85, 5.47, null, 1.41, 1.36], [7.4, 14.24, 17.65, 10.43, 11.16, 10.95])
    expect(clean.shifted).toBe(false)
  })

  it('does not call a margin squeeze that reverts a split even with revenue flat', () => {
    expect(cleanGrowth([10, 3, 3.5, 8, 11, 12], [50, 50, 51, 52, 53, 54]).shifted).toBe(false)
  })

  it('keeps a split confirmed by revenue when a later year is a loss', () => {
    // AMZN 2016-2025: 20-for-1 in 2022 is not restated in the older EPS, 2022 is a real loss.
    const clean = cleanGrowth(
      [4.9, 6.15, 20.14, 23.01, 2.09, 3.24, -0.27, 2.9, 5.53, 7.17],
      [14.05, 18.04, 23.29, 27.83, 37.86, 45.63, 50.44, 54.78, 59.51, 66.22],
    )
    expect(clean.shifted).toBe(true)
    expect(clean.start).toBe(4)
    expect(clean.rate).toBe(27.96)
  })

  it('refuses the window when the newest split leaves fewer than four clean years', () => {
    // NVDA: the last cliff (3.85 to 1.19) is a 10-for-1 the older years do not carry.
    const clean = cleanGrowth(
      [null, 2.57, 4.82, 6.63, 1.13, 1.73, 3.85, null, 1.19, 2.94, 4.9],
      [0.21, 0.27, 0.38, null, 0.44, 0.66, 1.06, 1.08, 2.44, 5.26, 8.81],
    )
    expect(clean.shifted).toBe(true)
    expect(clean.start).toBe(8)
    expect(clean.rate).toBeNull()
  })
})


const ROP_EPS = [6.43, 9.39, 9.05, 16.82, 8.98, 10.82, 42.55, 12.89, 14.35, 14.2]
const ROP_REVENUE = [36.9876, 44.5074, 49.7241, 44.9829, 38.0549, 45.3878, 50.2978, 57.5214, 65.1778, 73.036]

describe('cleanGrowth and a one-off earnings spike', () => {
  it('does not treat a single peak year that returns to the pre-peak level as a split', () => {
    const clean = cleanGrowth(ROP_EPS, ROP_REVENUE)
    expect(clean.shifted).toBe(false)
    expect(clean.rate).not.toBeNull()
    expect(clean.start).toBe(0)
  })

  it('still treats a real split as a break when the new base does not return to the pre-peak level', () => {
    expect(cleanGrowth(GOOGL_EPS).shifted).toBe(true)
    expect(cleanGrowth(AAPL_EPS, AAPL_REVENUE).shifted).toBe(true)
  })
})

describe('windowGrowth trough walk-forward', () => {
  it('walks past a trough at the start of a ten-year window instead of dropping the rate', () => {
    // HSBC-like: 2016 is a trough versus the median; 2017 still covers eight years.
    const series = [
      0.5715, 3.6912, 5.0887, 2.4631, 1.459, 4.6522, 5.9016, 9.5026, 10.4904, 9.9267,
    ].map((val, index) => ({ fy: 2016 + index, val }))
    const rate = windowGrowth(series, 10)
    expect(rate).toBeCloseTo((Math.pow(9.9267 / 3.6912, 1 / 8) - 1) * 100, 2)
    expect(rate).toBeGreaterThan(10)
  })

  it('leaves a ten-year label empty when the remaining span is under seven years', () => {
    const series = [0.05, 1, 1.1, 1.2, 1.3, 1.4].map((val, index) => ({ fy: 2020 + index, val }))
    expect(windowGrowth(series, 10)).toBeNull()
  })

  it('does not walk back to a year before the target when earlier history exists', () => {
    // CR Beer-like: 2010-2025, 2015 is a loss. Start must be 2016, not 2010.
    const values = [2.3637, 1.1928, 1.5652, 0.731, -0.065, -1.8361, 0.2589, 0.4237, 0.3531, 0.4708, 0.7651, 1.6596, 1.5772, 1.8714, 1.7184, 1.2241]
    const series = values.map((val, index) => ({ fy: 2010 + index, val }))
    const rate = windowGrowth(series, 10)
    expect(rate).toBeCloseTo((Math.pow(1.2241 / 0.2589, 1 / 9) - 1) * 100, 2)
    expect(rate).not.toBeCloseTo((Math.pow(1.2241 / 2.3637, 1 / 15) - 1) * 100, 2)
  })

  it('does not use a year before the target when the target year itself is a trough', () => {
    // Li Ning-like: 2006-2025, 2015 is a trough versus the median. Start must be 2016, not 2006.
    const values = [0.3325, 0.5307, 0.8079, 1.0547, 1.2287, 0.4303, -2.0319, -0.3167, -0.5881, 0.0078, 0.3407, 0.2456, 0.3436, 0.7077, 0.7959, 1.8593, 1.8166, 1.4437, 1.3714, 1.3362]
    const series = values.map((val, index) => ({ fy: 2006 + index, val }))
    const rate = windowGrowth(series, 10)
    expect(rate).toBeCloseTo((Math.pow(1.3362 / 0.3407, 1 / 9) - 1) * 100, 2)
    expect(rate).not.toBeCloseTo((Math.pow(1.3362 / 0.3325, 1 / 19) - 1) * 100, 2)
  })
})
