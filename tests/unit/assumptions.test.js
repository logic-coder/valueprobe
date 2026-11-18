import { describe, expect, it } from 'vitest'
import { MAX_UNDERWRITTEN_GROWTH, adoptGrowth, cleanGrowth } from '../../src/lib/assumptions'

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
