import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BASE_METHOD,
  detectThroughCycle,
  deductNonoperatingEps,
  QUALITY,
  classifyAnnualRow,
  classifyEarningsQuality,
  detectPersistentStep,
  qualityInputsFromRow,
  selectOfficialBase,
  weightedNormalizedBase,
} from '../../src/lib/valuationBase'

const yearRow = (year, eps, extras = {}) => ({
  date: `${year}-12`,
  eps_without_nri: eps,
  ...extras,
})

const stockOf = (rows, extras = {}) => ({
  financials: { annual: rows },
  ...extras,
})

describe('classifyEarningsQuality dual gate', () => {
  it('marks a year clean when both gates miss and denominators are present', () => {
    // GOOGL 2024: 3.71% of NI, 3.30% of OI.
    expect(classifyEarningsQuality({ n: 37.14, ni: 1001.18, oi: 1123.90, searched: true })).toBe(QUALITY.CLEAN)
  })

  it('marks nonoperating when the 10% operating-income gate fires below the 25% NI gate', () => {
    // GOOGL 2025: 18.22% of NI, 18.66% of OI.
    expect(classifyEarningsQuality({ n: 240.80, ni: 1321.70, oi: 1290.39, searched: true })).toBe(QUALITY.NONOPERATING)
  })

  it('marks nonoperating when N is 25% of NI even if OI is large', () => {
    expect(classifyEarningsQuality({ n: 25, ni: 100, oi: 1000, searched: true })).toBe(QUALITY.NONOPERATING)
  })

  it('marks nonoperating when N flips the sign of net income', () => {
    expect(classifyEarningsQuality({ n: 15, ni: 10, oi: 200, searched: true })).toBe(QUALITY.NONOPERATING)
    expect(classifyEarningsQuality({ n: -15, ni: -10, oi: -200, searched: true })).toBe(QUALITY.NONOPERATING)
  })

  it('does not invent a dollar threshold', () => {
    expect(classifyEarningsQuality({ n: 1e12, ni: 1e13, oi: 2e13, searched: true })).toBe(QUALITY.CLEAN)
  })

  it('uses abs(OI) when operating income is negative', () => {
    expect(classifyEarningsQuality({ n: 20, ni: 200, oi: -100, searched: true })).toBe(QUALITY.NONOPERATING)
    expect(classifyEarningsQuality({ n: 5, ni: 200, oi: -100, searched: true })).toBe(QUALITY.CLEAN)
  })

  it('cannot mark clean when N is non-zero and OI is missing, unless a pollution gate already fired', () => {
    expect(classifyEarningsQuality({ n: 5, ni: 100, oi: null, searched: true })).toBe(QUALITY.UNKNOWN)
    expect(classifyEarningsQuality({ n: 5, ni: 100, oi: 0, searched: true })).toBe(QUALITY.UNKNOWN)
    expect(classifyEarningsQuality({ n: 30, ni: 100, oi: null, searched: true })).toBe(QUALITY.NONOPERATING)
  })

  it('can be clean when a search found N = 0, even if operating income is missing', () => {
    expect(classifyEarningsQuality({ n: 0, ni: 100, oi: null, searched: true })).toBe(QUALITY.CLEAN)
    expect(classifyEarningsQuality({ n: 0, ni: 100, oi: 0, searched: true })).toBe(QUALITY.CLEAN)
  })

  it('does not treat a genuine zero-earnings year as nonoperating when N is also zero', () => {
    expect(classifyEarningsQuality({ n: 0, ni: 0, oi: 0, searched: true })).toBe(QUALITY.CLEAN)
    expect(classifyEarningsQuality({ n: 0, ni: 0, oi: 10, searched: true })).toBe(QUALITY.CLEAN)
  })

  it('treats a searched period with no whitelist facts as N = 0, not unknown', () => {
    expect(classifyEarningsQuality({ n: 0, ni: 100, oi: 80, searched: true })).toBe(QUALITY.CLEAN)
  })

  it('returns unknown when the period does not align or N cannot be read', () => {
    expect(classifyEarningsQuality({ n: 0, ni: 100, oi: 80, periodAligned: false })).toBe(QUALITY.UNKNOWN)
    expect(classifyEarningsQuality({ n: null, ni: 100, oi: 80, searched: true })).toBe(QUALITY.UNKNOWN)
    expect(classifyEarningsQuality({ searched: false, n: 0, ni: 100, oi: 80 })).toBe(QUALITY.UNKNOWN)
  })
})

describe('weightedNormalizedBase', () => {
  const obs = (eps, quality = QUALITY.CLEAN) => ({ eps, quality })

  it('uses recency weights for n >= 3 and does not fall off a 40% cliff', () => {
    const result = weightedNormalizedBase([6.11, 6.13, 6.08, 7.46, 8.98].map((eps) => obs(eps)))
    expect(result.n).toBe(5)
    expect(result.method).toBe(BASE_METHOD.WEIGHTED)
    expect(result.base).toBeCloseTo((6.11 + 12.26 + 18.24 + 29.84 + 44.9) / 15, 8)
  })

  it('downweights nonoperating and unknown years at q = 0.25, without inventing adjusted EPS', () => {
    // GOOGL 2021–2025 with 2021 and 2025 reduced: official default ≈ 7.01.
    const rows = [
      obs(5.61, QUALITY.NONOPERATING),
      obs(4.56),
      obs(5.8),
      obs(8.04),
      obs(10.81, QUALITY.NONOPERATING),
    ]
    const result = weightedNormalizedBase(rows)
    expect(result.base).toBeCloseTo(73.595 / 10.5, 8)
    expect(result.base).toBeCloseTo(7.01, 2)
  })

  it('keeps an all-clean counterfactual and a polluted-latest-only contrast separate', () => {
    const values = [5.61, 4.56, 5.8, 8.04, 10.81]
    const clean = weightedNormalizedBase(values.map((eps) => obs(eps)))
    const only2025 = weightedNormalizedBase([
      obs(5.61), obs(4.56), obs(5.8), obs(8.04), obs(10.81, QUALITY.NONOPERATING),
    ])
    expect(clean.base).toBeCloseTo(7.89, 2)
    expect(only2025.base).toBeCloseTo(6.92, 2)
    expect(clean.base).not.toBeCloseTo(only2025.base, 2)
  })

  it('weights a confirmed-step three-year window; it does not take the three-year median', () => {
    // AAPL 2024–2026: 6.08, 7.46, 8.98 → weighted 7.99, not median 7.46.
    const result = weightedNormalizedBase([6.08, 7.46, 8.98].map((eps) => obs(eps)))
    expect(result.method).toBe(BASE_METHOD.WEIGHTED)
    expect(result.base).toBeCloseTo(7.99, 2)
    expect(result.base).not.toBeCloseTo(7.46, 2)
    expect(result.median).toBeCloseTo(7.46, 8)
  })

  it('uses a two-year median and a single-year value for short histories', () => {
    expect(weightedNormalizedBase([obs(3), obs(5)])).toMatchObject({ base: 4, method: BASE_METHOD.SHORT_HISTORY, n: 2 })
    expect(weightedNormalizedBase([obs(5)])).toMatchObject({ base: 5, method: BASE_METHOD.SHORT_HISTORY, n: 1 })
  })

  it('skips missing observations, keeps explicit zeros, and will not publish without a clean positive year', () => {
    const skipped = weightedNormalizedBase([obs(5.66), obs(6.58), obs(14.4), obs(19.23)])
    expect(skipped.base).toBeCloseTo((5.66 + 13.16 + 43.2 + 76.92) / 10, 8)
    const withZero = weightedNormalizedBase([obs(5), obs(0), obs(5)])
    expect(withZero.base).toBeCloseTo((5 + 0 + 15) / 6, 8)
    expect(weightedNormalizedBase([obs(8, QUALITY.NONOPERATING), obs(9, QUALITY.UNKNOWN)]).base).toBeNull()
    expect(weightedNormalizedBase([obs(-1), obs(-2), obs(-3)]).hasCleanPositive).toBe(false)
  })

  it('falls back to the median when the weighted result is not positive but the median is', () => {
    const result = weightedNormalizedBase([
      obs(10),
      obs(-20, QUALITY.NONOPERATING),
      obs(-20, QUALITY.NONOPERATING),
    ])
    // Weights 1, 0.5, 0.75 → 10 - 10 - 15 = -15; median of 10, -20, -20 is -20, so no fallback.
    expect(result.median).toBe(-20)
    expect(result.base).toBeNull()
    const fallback = weightedNormalizedBase([
      obs(5),
      obs(-100, QUALITY.NONOPERATING),
      obs(6),
    ])
    // Weights 1, 0.5, 3 → 5 - 50 + 18 = -27; median of 5, -100, 6 is 5.
    expect(fallback.method).toBe(BASE_METHOD.MEDIAN_FALLBACK)
    expect(fallback.base).toBe(5)
  })
})

describe('detectPersistentStep', () => {
  const series = ({ eps, quality = QUALITY.CLEAN, oi, fcf, start = 2021 }) =>
    eps.map((value, index) => ({
      year: start + index,
      eps: value,
      quality: Array.isArray(quality) ? quality[index] : quality,
      operatingIncome: oi[index],
      fcf: fcf[index],
    }))

  it('confirms a two-year step when quality is clean and the operating-income path holds', () => {
    const rows = series({
      eps: [6.11, 6.13, 6.08, 7.46, 8.98],
      oi: [7.32, 7.23, 8.00, 8.87, 10.74],
      fcf: [6.83, 6.30, 7.06, 6.58, 9.24],
    })
    const step = detectPersistentStep(rows)
    expect(step.hit).toBe(true)
    expect(step.oiPath).toBe(true)
    expect(step.cashPath).toBe(true)
  })

  it('does not confirm a step when either of the latest two years is not clean', () => {
    const rows = series({
      eps: [5.61, 4.56, 5.8, 8.04, 10.81],
      quality: [QUALITY.NONOPERATING, QUALITY.CLEAN, QUALITY.CLEAN, QUALITY.CLEAN, QUALITY.NONOPERATING],
      oi: [null, 5.69, 6.63, 9.03, 10.55],
      fcf: [null, 4.56, 5.46, 5.85, 5.99],
    })
    expect(detectPersistentStep(rows)).toMatchObject({ hit: false, reason: 'quality' })
  })

  it('treats missing confirmation data as unconfirmed, not as a pass', () => {
    const rows = series({
      eps: [5, 5, 5, 8, 9],
      oi: [5, 5, 5, null, 9],
      fcf: [5, 5, 5, null, 9],
    })
    expect(detectPersistentStep(rows)).toMatchObject({ hit: false, reason: 'confirmation-missing' })
  })

  it('can confirm on the operating-income path alone and leave the cash path false', () => {
    const rows = series({
      eps: [5, 5, 5, 8, 9],
      oi: [5, 5, 5, 6, 7],
      fcf: [5, 5, 5, null, 4],
    })
    expect(detectPersistentStep(rows)).toMatchObject({ hit: true, oiPath: true, cashPath: false })
  })

  it('requires the latest FCF year itself to clear the prior cash median', () => {
    const rows = series({
      eps: [5, 5, 5, 8, 9],
      oi: [5, 5, 5, 4, 4],
      fcf: [10, 10, 10, 12, 9],
    })
    // Latest two FCF median is 10.5 >= 10, but the latest year 9 is below the prior median.
    expect(detectPersistentStep(rows)).toMatchObject({ hit: false, cashPath: false, oiPath: false })
  })

  it('does not test financial institutions', () => {
    const rows = series({ eps: [1, 2, 3, 8, 9], oi: [1, 2, 3, 8, 9], fcf: [1, 2, 3, 8, 9] })
    expect(detectPersistentStep(rows, { financial: true })).toMatchObject({ hit: false, reason: 'financial' })
  })
})

describe('selectOfficialBase official path', () => {
  it('selects AAPL’s three-year weighted step base near 7.99, not 6.13, 8.98 or 7.46', () => {
    const raw = stockOf([
      yearRow(2022, 6.11, { operating_income_per_share: 7.3158, free_cash_flow_per_share: 6.8262, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 100, operating_income: 100 }),
      yearRow(2023, 6.13, { operating_income_per_share: 7.2285, free_cash_flow_per_share: 6.2978, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 100, operating_income: 100 }),
      yearRow(2024, 6.08, { operating_income_per_share: 7.9968, free_cash_flow_per_share: 7.0617, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 100, operating_income: 100 }),
      yearRow(2025, 7.46, { operating_income_per_share: 8.8672, free_cash_flow_per_share: 6.5824, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 100, operating_income: 100 }),
      yearRow(2026, 8.98, { operating_income_per_share: 10.7378, free_cash_flow_per_share: 9.2427, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 100, operating_income: 100 }),
    ], { ttm_eps: 8.98, eps_period: 'FY', eps_as_of: '2026-09-26' })
    const result = selectOfficialBase(raw)
    expect(result.method).toBe(BASE_METHOD.PERSISTENT_STEP)
    expect(result.earningsBase).toBeCloseTo(7.99, 2)
    expect(result.earningsBase).not.toBeCloseTo(6.13, 2)
    expect(result.earningsBase).not.toBeCloseTo(8.98, 2)
    expect(result.earningsBase).not.toBeCloseTo(7.46, 2)
    expect(result.warnings).toContain('PERSISTENT_STEP_BASE')
    expect(result.step.cashPath).toBe(true)
    expect(result.cashBase).toBeCloseTo(7.0617, 4)
    expect(result.refusal).toBeNull()
  })

  it('keeps reported EPS, downweights polluted years, and does not confirm a step or use TTM 19.15', () => {
    const raw = stockOf([
      yearRow(2021, 5.61, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 123.80, net_income: 760.33, operating_income: 787.14 }),
      yearRow(2022, 4.56, { operating_income_per_share: 5.6875, free_cash_flow_per_share: 4.5604, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: -34.55, net_income: 599.72, operating_income: 748.42 }),
      yearRow(2023, 5.8, { operating_income_per_share: 6.6258, free_cash_flow_per_share: 5.4626, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 3.92, net_income: 737.95, operating_income: 842.93 }),
      yearRow(2024, 8.04, { operating_income_per_share: 9.0295, free_cash_flow_per_share: 5.8459, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 37.14, net_income: 1001.18, operating_income: 1123.90 }),
      yearRow(2025, 10.81, { operating_income_per_share: 10.551, free_cash_flow_per_share: 5.9907, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 240.80, net_income: 1321.70, operating_income: 1290.39 }),
    ], {
      ttm_eps: 19.15,
      eps_period: 'TTM',
      eps_as_of: '2026-09-30',
      ttm_nonoperating_gain: 1295.84,
      ttm_net_income: 2356.94,
      ttm_operating_income: 1569.76,
      ttm_quality_as_of: '2026-09-30',
      ttm_quality_facts_searched: true,
    })
    const result = selectOfficialBase(raw)
    expect(result.observations.map((row) => row.quality)).toEqual([
      QUALITY.NONOPERATING, QUALITY.CLEAN, QUALITY.CLEAN, QUALITY.CLEAN, QUALITY.NONOPERATING,
    ])
    expect(result.observations.at(-1).eps).toBeCloseTo(10.81, 4)
    expect(result.observations.at(-1).eps).not.toBeCloseTo(10.81 * (1 - 240.80 / 1321.70), 4)
    expect(result.step.hit).toBe(false)
    expect(result.step.reason).toBe('quality')
    expect(result.method).toBe(BASE_METHOD.WEIGHTED)
    expect(result.earningsBase).toBeCloseTo(7.009, 3)
    expect(result.earningsBase).not.toBeCloseTo(7.9624, 2)
    expect(result.earningsBase).not.toBeCloseTo(9.05, 2)
    expect(result.earningsBase).not.toBeCloseTo(19.15, 2)
    expect(result.ttmQuality).toBe(QUALITY.NONOPERATING)
    expect(result.warnings).toContain('TTM_NONOPERATING')
    expect(result.warnings).toContain('BASE_QUALITY_REDUCED')
    expect(result.warnings).not.toContain('PERSISTENT_STEP_BASE')
    expect(result.warnings).not.toContain('THROUGH_CYCLE_BASE')
  })

  it('has no company-name or symbol branch', () => {
    const text = readFileSync('src/lib/valuationBase.js', 'utf8')
    expect(text).not.toMatch(/AAPL|GOOGL|NVDA|600519|00700/)
  })

  it('refuses when no clean complete fiscal year can form a positive base, without using TTM', () => {
    const raw = stockOf([
      yearRow(2023, 4, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 50, net_income: 40, operating_income: 30 }),
      yearRow(2024, 5, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 50, net_income: 40, operating_income: 30 }),
      yearRow(2025, 6, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 50, net_income: 40, operating_income: 30 }),
    ], { ttm_eps: 12 })
    const result = selectOfficialBase(raw)
    expect(result.refusal).toBe('BASE_QUALITY_INSUFFICIENT')
    expect(result.earningsBase).toBeNull()
    expect(result.earningsBase).not.toBe(12)
  })

  it('bounds an unknown latest year with same-period cash instead of refusing', () => {
    const raw = stockOf([
      yearRow(2023, 4, { quality_facts_searched: false, free_cash_flow_per_share: 5 }),
      yearRow(2024, 5, { quality_facts_searched: false, free_cash_flow_per_share: 6 }),
      yearRow(2025, 8, { quality_facts_searched: false, free_cash_flow_per_share: 7 }),
    ])
    const result = selectOfficialBase(raw)
    expect(result.refusal).toBeNull()
    expect(result.method).toBe(BASE_METHOD.CASH_CONFIRMED_FALLBACK)
    expect(result.earningsBase).toBe(6)
    expect(result.cashBase).toBe(6)
    expect(result.warnings).toContain('BASE_CASH_CONFIRMED')
  })

  it('keeps the refusal for a confirmed non-operating latest year even with positive cash', () => {
    const raw = stockOf([
      yearRow(2023, 4, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 50, net_income: 40, operating_income: 30, free_cash_flow_per_share: 5 }),
      yearRow(2024, 5, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 50, net_income: 40, operating_income: 30, free_cash_flow_per_share: 6 }),
      yearRow(2025, 6, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 50, net_income: 40, operating_income: 30, free_cash_flow_per_share: 7 }),
    ])
    expect(selectOfficialBase(raw).refusal).toBe('BASE_QUALITY_INSUFFICIENT')
  })

  it('does not use cash to bound a financial residual path', () => {
    const raw = stockOf([
      yearRow(2023, 4, { quality_facts_searched: false, free_cash_flow_per_share: 5 }),
      yearRow(2024, 5, { quality_facts_searched: false, free_cash_flow_per_share: 6 }),
      yearRow(2025, 8, { quality_facts_searched: false, free_cash_flow_per_share: 7 }),
    ])
    expect(selectOfficialBase(raw, { financial: true }).refusal).toBe('BASE_QUALITY_INSUFFICIENT')
  })

  it('uses NON_POSITIVE_EPS when known-quality years are explicitly zero or negative', () => {
    const raw = stockOf([
      yearRow(2023, -1, { operating_income_per_share: 2, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: -10, operating_income: 20 }),
      yearRow(2024, 0, { operating_income_per_share: 2, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 0, operating_income: 20 }),
    ])
    expect(selectOfficialBase(raw).refusal).toBe('NON_POSITIVE_EPS')
  })

  it('leaves cash empty when a step is confirmed only on the operating-income path', () => {
    const raw = stockOf([
      yearRow(2021, 5, { operating_income_per_share: 5, free_cash_flow_per_share: 5, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 50, operating_income: 50 }),
      yearRow(2022, 5, { operating_income_per_share: 5, free_cash_flow_per_share: 5, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 50, operating_income: 50 }),
      yearRow(2023, 5, { operating_income_per_share: 5, free_cash_flow_per_share: 5, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 50, operating_income: 50 }),
      yearRow(2024, 8, { operating_income_per_share: 8, free_cash_flow_per_share: null, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 80, operating_income: 80 }),
      yearRow(2025, 9, { operating_income_per_share: 9, free_cash_flow_per_share: 4, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 90, operating_income: 90 }),
    ])
    const result = selectOfficialBase(raw)
    expect(result.step).toMatchObject({ hit: true, oiPath: true, cashPath: false })
    expect(result.cashBase).toBeNull()
  })

  it('does not apply the step rule to financial institutions', () => {
    const raw = stockOf([
      yearRow(2021, 1, { operating_income_per_share: 1, free_cash_flow_per_share: 1, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 10, operating_income: 10 }),
      yearRow(2022, 1.1, { operating_income_per_share: 1.1, free_cash_flow_per_share: 1.1, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 11, operating_income: 11 }),
      yearRow(2023, 1.2, { operating_income_per_share: 1.2, free_cash_flow_per_share: 1.2, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 12, operating_income: 12 }),
      yearRow(2024, 4, { operating_income_per_share: 4, free_cash_flow_per_share: 4, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 40, operating_income: 40 }),
      yearRow(2025, 5, { operating_income_per_share: 5, free_cash_flow_per_share: 5, quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0, net_income: 50, operating_income: 50 }),
    ])
    const result = selectOfficialBase(raw, { financial: true })
    expect(result.step.hit).toBe(false)
    expect(result.method).toBe(BASE_METHOD.WEIGHTED)
  })
})

describe('through-cycle diagnostic and non-operating helper', () => {
  it('exposes a quantified deduction helper that the official base does not use', () => {
    expect(deductNonoperatingEps(10.81, { n: 240.80, ni: 1321.70 })).toMatchObject({ deducted: true, complete: true })
    expect(deductNonoperatingEps(10.81, { n: 240.80, ni: 1321.70 }).eps).toBeCloseTo(10.81 * (1 - 240.80 / 1321.70), 6)
    expect(deductNonoperatingEps(5, { n: 50, ni: null })).toEqual({ eps: 5, deducted: false, complete: false })
  })

  it('triggers a through-cycle mean for a boom-and-bust series and not for a compounding series', () => {
    const cyclical = [0.01, 0.65, 1.39, 1.61, 0.66, 1.85, 3.57, 3.06, 3.41, 3.02].map((eps, i) => ({ year: 2016 + i, eps, quality: QUALITY.CLEAN }))
    const growth = [1.39, 0.90, 2.19, 2.46, 2.93, 5.61, 4.56, 5.80, 8.04, 10.81].map((eps, i) => ({ year: 2016 + i, eps, quality: QUALITY.CLEAN }))
    const stepUp = [0.064, 0.12, 0.166, 0.113, 0.173, 0.385, 0.17, 1.19, 2.94, 4.90].map((eps, i) => ({ year: 2016 + i, eps, quality: QUALITY.CLEAN }))
    const cycle = detectThroughCycle(cyclical)
    const stable = detectThroughCycle(growth)
    const platform = detectThroughCycle(stepUp)
    expect(cycle.hit).toBe(true)
    expect(cycle.mean).toBeCloseTo(1.923, 2)
    expect(cycle.logResidual).toBeGreaterThan(0.50)
    expect(stable.hit).toBe(false)
    expect(platform.hit).toBe(false)
    expect(detectThroughCycle(cyclical, { financial: true }).hit).toBe(false)
    expect(detectThroughCycle(cyclical.slice(-7)).hit).toBe(false)
    const oneLoss = [2, 2.2, 2.5, -0.3, 2.8, 3.1, 3.4, 3.7, 4.0, 4.4].map((eps, i) => ({ year: 2016 + i, eps, quality: QUALITY.CLEAN }))
    expect(detectThroughCycle(oneLoss).hit).toBe(false)
  })

  it('keeps a confirmed late step as the official base when the through-cycle diagnostic also hits', () => {
    const series = { 2016: 0.02, 2017: 0.8, 2018: 0.9, 2019: 0.7, 2020: 0.85, 2021: 0.8, 2022: 0.9, 2023: 0.85, 2024: 3.4, 2025: 3.2 }
    const rows = Object.entries(series).map(([year, eps]) => yearRow(Number(year), eps, {
      operating_income_per_share: eps, free_cash_flow_per_share: eps, quality_facts_searched: true,
      equity_securities_fv_ni_gain_loss: 0, net_income: eps * 10, operating_income: eps * 10,
    }))
    const result = selectOfficialBase(stockOf(rows))
    expect(result.throughCycle.hit).toBe(true)
    expect(result.step.hit).toBe(true)
    expect(result.method).toBe(BASE_METHOD.PERSISTENT_STEP)
    expect(result.warnings).toContain('PERSISTENT_STEP_BASE')
    expect(result.warnings).not.toContain('THROUGH_CYCLE_BASE')
    expect(result.earningsBase).not.toBeCloseTo(result.throughCycle.mean, 4)
    const stepped = [0.85, 3.4, 3.2]
    const weighted = (1 * stepped[0] + 2 * stepped[1] + 3 * stepped[2]) / 6
    expect(result.earningsBase).toBeCloseTo(weighted, 4)
  })
})


describe('US quality-search evidence vs non-US exception (C)', () => {
  const niRow = (year, eps, extras = {}) => yearRow(year, eps, {
    net_income: eps * 10,
    operating_income: eps * 10,
    ...extras,
  })
  const usStock = (extras = {}) => stockOf([
    niRow(2023, 4, extras),
    niRow(2024, 5, extras),
    niRow(2025, 6, extras),
  ], { exchange_: 'NYSE', symbol: 'EXAM' })
  const qualities = (stock) => selectOfficialBase(stock).observations.map((row) => row.quality)

  it('treats a missing, null, or unsearched US mark as unknown, and a searched zero total as clean', () => {
    expect(qualities(usStock({}))).toEqual([QUALITY.UNKNOWN, QUALITY.UNKNOWN, QUALITY.UNKNOWN])
    expect(qualities(usStock({ quality_facts_searched: null }))).toEqual([QUALITY.UNKNOWN, QUALITY.UNKNOWN, QUALITY.UNKNOWN])
    expect(qualities(usStock({ quality_facts_searched: false }))).toEqual([QUALITY.UNKNOWN, QUALITY.UNKNOWN, QUALITY.UNKNOWN])
    expect(qualities(usStock({ quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0 }))).toEqual([QUALITY.CLEAN, QUALITY.CLEAN, QUALITY.CLEAN])
    expect(selectOfficialBase(usStock({})).refusal).toBe('BASE_QUALITY_INSUFFICIENT')

    const missing = qualityInputsFromRow(niRow(2025, 6), { sourceSearched: null })
    expect(missing).toMatchObject({ searched: false, n: null })
    expect(classifyAnnualRow(niRow(2025, 6), { sourceSearched: null })).toBe(QUALITY.UNKNOWN)
    expect(classifyAnnualRow(niRow(2025, 6, { quality_facts_searched: true, equity_securities_fv_ni_gain_loss: 0 }))).toBe(QUALITY.CLEAN)
  })

  it('keeps a missing non-US quality mark clean so a step can still confirm (policy C)', () => {
    const rows = [
      yearRow(2021, 1, { operating_income_per_share: 1, free_cash_flow_per_share: 1, net_income: 10, operating_income: 10 }),
      yearRow(2022, 1.1, { operating_income_per_share: 1.1, free_cash_flow_per_share: 1.1, net_income: 11, operating_income: 11 }),
      yearRow(2023, 1.2, { operating_income_per_share: 1.2, free_cash_flow_per_share: 1.2, net_income: 12, operating_income: 12 }),
      yearRow(2024, 4, { operating_income_per_share: 4, free_cash_flow_per_share: 4, net_income: 40, operating_income: 40 }),
      yearRow(2025, 5, { operating_income_per_share: 5, free_cash_flow_per_share: 5, net_income: 50, operating_income: 50 }),
    ]
    const result = selectOfficialBase(stockOf(rows, { exchange_: 'HKSE', symbol: '00001' }))
    expect(result.observations.every((row) => row.quality === QUALITY.CLEAN)).toBe(true)
    expect(result.step.hit).toBe(true)
    expect(result.method).toBe(BASE_METHOD.PERSISTENT_STEP)
    expect(result.refusal).toBeNull()
  })
})

describe('cash used to clear a quality refusal must be same-year and dated', () => {
  it('does not clear with prior-year cash when the latest EPS year has none', () => {
    const raw = stockOf([
      yearRow(2022, 3, { quality_facts_searched: false, free_cash_flow_per_share: 4 }),
      yearRow(2023, 4, { quality_facts_searched: false, free_cash_flow_per_share: 5 }),
      yearRow(2024, 5, { quality_facts_searched: false, free_cash_flow_per_share: 6 }),
      yearRow(2025, 8, { quality_facts_searched: false }),
    ])
    const result = selectOfficialBase(raw)
    expect(result.refusal).toBe('BASE_QUALITY_INSUFFICIENT')
    expect(result.warnings).not.toContain('BASE_CASH_CONFIRMED')
    expect(result.earningsBase).toBeNull()
  })

  it('does not clear when earnings and cash dates are both missing', () => {
    const raw = stockOf([
      { eps_without_nri: 4, quality_facts_searched: false, free_cash_flow_per_share: 5 },
      { eps_without_nri: 5, quality_facts_searched: false, free_cash_flow_per_share: 6 },
      { eps_without_nri: 8, quality_facts_searched: false, free_cash_flow_per_share: 7 },
    ])
    const result = selectOfficialBase(raw)
    expect(result.refusal).toBe('BASE_QUALITY_INSUFFICIENT')
    expect(result.warnings).not.toContain('BASE_CASH_CONFIRMED')
    expect(result.earningsBase).toBeNull()
  })

  it('does not clear when the latest year date cannot be confirmed, even with positive cash', () => {
    const raw = stockOf([
      yearRow(2023, 4, { quality_facts_searched: false, free_cash_flow_per_share: 5 }),
      yearRow(2024, 5, { quality_facts_searched: false, free_cash_flow_per_share: 6 }),
      { date: '2025', eps_without_nri: 8, quality_facts_searched: false, free_cash_flow_per_share: 7 },
    ])
    const result = selectOfficialBase(raw)
    expect(result.refusal).toBe('BASE_QUALITY_INSUFFICIENT')
    expect(result.warnings).not.toContain('BASE_CASH_CONFIRMED')
    expect(result.earningsBase).toBeNull()
  })
})
