import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blendOfficialBase, buildDefaults, isSynchronousUpshift, presentValue, symmetricValueGap, UPSHIFT_PRIOR_MULTIPLE } from '../../src/lib/dcf'
import { officialGrowth } from '../../src/lib/assumptions'
import { policyValue } from '../../src/lib/policy'
import { toStock } from '../../src/lib/stockRecord'
import { REASON, WARNING } from '../../src/lib/reasons'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const ratesFile = read('public/data/rates.json')
const rates = {
  CNY: { value: ratesFile.CNY.value, asOf: ratesFile.CNY.as_of, source: 'snapshot' },
  USD: { value: ratesFile.USD.value, asOf: ratesFile.USD.as_of, source: 'snapshot' },
}
const stockOf = (symbol) => toStock(read('public/data/' + symbol.replace(':', '-') + '.json'))
const at = (symbol) => policyValue(stockOf(symbol), { rates, generatedAt: '2026-11-23' })

describe('synchronous upshift is mechanical and two-sided', () => {
  it('uses a 2× earlier-peak threshold', () => {
    expect(UPSHIFT_PRIOR_MULTIPLE).toBe(2)
  })

  it('detects NVIDIA’s latest complete fiscal year and rejects a five-year monotone rule', () => {
    const annual = read('public/data/NASDAQ-NVDA.json').financials.annual
    expect(isSynchronousUpshift(annual)).toBe(true)
    const last5 = annual.slice(-5).map((row) => row.eps_without_nri)
    expect(last5).toEqual([0.385, 0.17, 1.19, 2.94, 4.9])
  })

  it('does not lift Google, Kweichow Moutai, Tencent, Sinopec or Zijin', () => {
    for (const symbol of ['NASDAQ:GOOGL', 'SHSE:600519', 'HKSE:00700', 'SHSE:600028', 'SHSE:601899']) {
      expect(isSynchronousUpshift(read('public/data/' + symbol.replace(':', '-') + '.json').financials.annual), symbol).toBe(false)
    }
  })

  it('does not lift when there is no earlier peak to compare with', () => {
    expect(isSynchronousUpshift([
      { date: '2023-12', eps_without_nri: 1, free_cash_flow_per_share: 1 },
      { date: '2024-12', eps_without_nri: 2, free_cash_flow_per_share: 2 },
      { date: '2025-12', eps_without_nri: 4, free_cash_flow_per_share: 4 },
    ])).toBe(false)
  })
})

describe('blendOfficialBase midpoints 50–200% gaps and refuses above 3×', () => {
  it('keeps earnings as primary below a 50% gap', () => {
    expect(blendOfficialBase(10, 8)).toMatchObject({ action: 'earnings', base: 10 })
    expect(symmetricValueGap(10, 8)).toBeCloseTo(0.25, 8)
  })

  it('midpoints the two bases between 50% and 200%, inclusive', () => {
    expect(blendOfficialBase(24, 12)).toMatchObject({ action: 'midpoint', base: 18, gap: 1 })
    expect(blendOfficialBase(10, 15)).toMatchObject({ action: 'midpoint', base: 12.5 })
    expect(blendOfficialBase(10, 30)).toMatchObject({ action: 'midpoint', base: 20, gap: 2 })
  })

  it('refuses only when the larger side is more than three times the smaller', () => {
    expect(blendOfficialBase(10, 30.1).action).toBe('refuse')
    expect(blendOfficialBase(10, 2).action).toBe('refuse')
  })

  it('does not blend cash into a financial-institution residual path', () => {
    expect(blendOfficialBase(10, 30, { financial: true })).toMatchObject({ action: 'earnings', base: 10, gap: null })
  })
})

describe('named companies follow the stacked official rules', () => {
  it('values NVIDIA on a confirmed three-year weighted step, not the single latest year or trailing earnings', () => {
    const stock = stockOf('NASDAQ:NVDA')
    const value = at('NASDAQ:NVDA')
    expect(stock.persistent_step).toBe(true)
    expect(stock.earnings_base).toBeCloseTo(3.6283, 4)
    expect(stock.cash_base).toBeCloseTo(2.4534, 4)
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBe(15)
    expect(value.inputs.eps).toBeCloseTo(3.6283, 4)
    expect(value.inputs.epsLatest).toBeCloseTo(7.91, 2)
    expect(value.value).toBeCloseTo(83.71, 2)
    expect(value.warnings).toContain(WARNING.PERSISTENT_STEP_BASE)
    expect(value.warnings).not.toContain(WARNING.LATEST_FY_BASE)
    expect(value.warnings).not.toContain(WARNING.CASH_MIDPOINT)
    expect(value.reasons).not.toContain(REASON.CASH_UNRECONCILED)
    expect(value.band.mid).toBe(value.value)
    const seed = buildDefaults(4.92, stock, stock.cash_base)
    expect(seed.dcfForm.growthRate).toBe(15)
    expect(seed.dcfForm.eps).toBeCloseTo(3.6283, 4)
  })

  it('values Google on a deducted three-year weighted step above the old 7.009 base, and still ignores TTM 19.15', () => {
    const stock = stockOf('NASDAQ:GOOGL')
    const value = at('NASDAQ:GOOGL')
    expect(stock.persistent_step).toBe(true)
    expect(stock.through_cycle).toBe(false)
    expect(stock.earnings_base).toBeCloseTo(7.9624, 4)
    expect(value.status).toBe('ok')
    expect(value.inputs.baseUpshift).toBe(false)
    expect(value.inputs.eps).toBeCloseTo(7.9624, 4)
    expect(value.inputs.eps).toBeGreaterThan(7.009)
    expect(value.inputs.epsLatest).toBeCloseTo(19.15, 2)
    expect(value.value).toBeCloseTo(183.69, 2)
    expect(value.warnings).toContain(WARNING.TTM_NONOPERATING)
    expect(value.warnings).toContain(WARNING.PERSISTENT_STEP_BASE)
    expect(value.warnings).not.toContain(WARNING.BASE_QUALITY_REDUCED)
    expect(value.warnings).not.toContain(WARNING.LATEST_FY_BASE)
    expect(value.warnings).not.toContain(WARNING.CASH_MIDPOINT)
    expect(value.inputs.eps).not.toBeCloseTo(19.15, 2)
    expect(value.inputs.eps).not.toBeCloseTo(9.05, 2)
  })

  it('values Apple on the three-year weighted step near 7.99, not 6.13, 8.98 or 7.46', () => {
    const stock = stockOf('NASDAQ:AAPL')
    const value = at('NASDAQ:AAPL')
    expect(stock.persistent_step).toBe(true)
    expect(stock.earnings_base).toBeCloseTo(7.99, 2)
    expect(value.status).toBe('ok')
    expect(value.inputs.eps).toBeCloseTo(7.99, 2)
    expect(value.value).toBeCloseTo(150.47, 2)
    expect(value.warnings).toContain(WARNING.PERSISTENT_STEP_BASE)
  })

  it('slows Moutai to the five-year window and does not midpoint a modest cash gap', () => {
    const value = at('SHSE:600519')
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBeCloseTo(11.89, 2)
    expect(value.inputs.growth10).toBeCloseTo(14.86, 2)
    expect(Math.abs(value.cash.gapPct)).toBeLessThan(50)
    expect(value.warnings).not.toContain(WARNING.CASH_MIDPOINT)
    expect(value.value).toBeCloseTo(1572.64, 2)
    expect(value.band.mid).toBe(value.value)
    expect(value.band.high).toBeGreaterThan(value.value)
  })

  it('publishes Tencent as the midpoint of two disagreeing valuations at the slower window', () => {
    const value = at('HKSE:00700')
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBeCloseTo(7.89, 2)
    expect(value.inputs.baseUpshift).toBe(false)
    expect(value.warnings).toContain(WARNING.CASH_MIDPOINT)
    expect(value.value).toBeCloseTo(314.46, 2)
    expect(value.band.mid).toBe(value.value)
    expect(value.band.low).toBeLessThanOrEqual(Math.min(value.cash.value, value.value))
    expect(value.band.high).toBeGreaterThanOrEqual(Math.max(value.cash.value, value.value))
    const earn = presentValue(value.inputs.tangibleBook, 10, value.inputs.discountRate, 7.89, 23.5509, 4, 10, false).fairValue
    const cash = presentValue(value.inputs.tangibleBook, 10, value.inputs.discountRate, 7.89, 12.6052, 4, 10, false).fairValue
    expect(value.value).toBeCloseTo((earn + cash) / 2, 2)
    expect(value.band.low).toBeLessThan(Math.min(earn, cash))
    expect(value.band.high).toBeGreaterThan(Math.max(earn, cash))
    const seed = buildDefaults(4.92, stockOf('HKSE:00700'), 12.6052)
    expect(seed.dcfForm.growthRate).toBeCloseTo(7.89, 2)
    expect(seed.dcfForm.eps).toBeCloseTo((23.5509 + 12.6052) / 2, 4)
  })

  it('still refuses Visa without inventing EPS, and does not use Meituan’s negative TTM as the base', () => {
    const visa = at('NYSE:V')
    expect(visa.status).toBe('refused')
    expect(visa.reasons).toEqual(expect.arrayContaining([REASON.NO_EPS, REASON.NO_GROWTH]))
    expect(officialGrowth({ hasPositiveBase: false }).adopted).toBeNull()
    const meituan = at('HKSE:03690')
    const stock = stockOf('HKSE:03690')
    // Latest year and TTM are negative, but earlier complete years are clean and
    // the weighted official base stays slightly positive. TTM is not a fallback.
    expect(stock.earnings_base).toBeGreaterThan(0)
    expect(stock.earnings_base).toBeLessThan(1)
    expect(meituan.inputs.epsLatest).toBeLessThan(0)
    expect(meituan.inputs.eps).not.toBeCloseTo(meituan.inputs.epsLatest, 2)
    expect(meituan.status).toBe('ok')
    expect(meituan.reasons).not.toContain(REASON.NON_POSITIVE_EPS)
  })
})
