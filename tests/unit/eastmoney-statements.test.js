import { describe, expect, it } from 'vitest'
import { fromAshareReports, fromHkReports, trailingTwelve, windowGrowth, convertReportingCurrency } from '../../src/data/providers/eastmoney-statements'

const row = (date, type, extra) => ({ REPORT_DATE: date, REPORT_TYPE: type, ...extra })

describe('A-share statements', () => {
  const recent = [
    row('2026-09-30', '三季报', { EPSKCJB: 0.78, EPSXS: 0.78, BPS: 11.2 }),
    row('2025-09-30', '三季报', { EPSKCJB: 0.75, EPSXS: 0.75, BPS: 10.5 }),
    row('2025-12-31', '年报', { EPSKCJB: 1, EPSXS: 1, BPS: 10.8, PARENTNETPROFIT: 100, EPSJB: 1, FCFF_BACK: 50, PER_TOI: 2.2, PER_EBIT: 1.4, MGJYXJJE: 3 }),
  ]
  const annual = [
    row('2016-12-31', '年报', { EPSKCJB: 1, EPSXS: 1, EPSJB: 1, BPS: 8, PARENTNETPROFIT: 100, FCFF_BACK: 40, PER_TOI: 1.5, PER_EBIT: 1 }),
    row('2021-12-31', '年报', { EPSKCJB: 1.5, EPSXS: 1.5, EPSJB: 1.5, BPS: 9, PARENTNETPROFIT: 150, FCFF_BACK: 60, PER_TOI: 1.8, PER_EBIT: 1.2 }),
    row('2025-12-31', '年报', { EPSKCJB: 1, EPSXS: 1, EPSJB: 1, BPS: 10.8, PARENTNETPROFIT: 100, FCFF_BACK: 50, PER_TOI: 2.2, PER_EBIT: 1.4, MGJYXJJE: 3 }),
  ]

  it('rebuilds trailing earnings from the year-to-date stub', () => {
    const read = (item) => item?.EPSKCJB
    expect(trailingTwelve(recent, read)).toBeCloseTo(1.03)
  })

  it('turns firm free cash flow into a per-share figure and keeps the annual table', () => {
    const parsed = fromAshareReports(recent, annual)
    expect(parsed.fields.ttm_eps_nri).toBeCloseTo(1.03)
    expect(parsed.fields.free_cash_flow_per_share).toBeCloseTo(0.5)
    expect(parsed.fields.cashflow_basis).toBe('fcff')
    expect(parsed.fields.tangible_book).toBeCloseTo(11.2)
    expect(parsed.financials.annual).toHaveLength(3)
    expect(parsed.financials.annual[2].free_cash_flow_per_share).toBe(0.5)
    expect(parsed.financials.annual[2].revenue_per_share).toBe(2.2)
    expect(parsed.financials.ttm[0].eps_without_nri).toBeCloseTo(1.03)
    expect(parsed.fields.earning_growth_10y).toBeTypeOf('number')
  })
})

describe('Hong Kong statements', () => {
  it('uses the published trailing EPS and operating cash flow after capital spending', () => {
    const parsed = fromHkReports([
      row('2025-12-31', '年报', {
        BASIC_EPS: 20, DILUTED_EPS: 19, EPS_TTM: 21, BPS: 100, HOLDER_PROFIT: 200,
        NETCASH_OPERATE: 80, NETCASH_INVEST: -30, PER_OI: 40, OPERATE_PROFIT: 50, DPS_HKD: 1.5,
      }),
      row('2016-12-31', '年报', {
        BASIC_EPS: 10, DILUTED_EPS: 10, EPS_TTM: 10, BPS: 50, HOLDER_PROFIT: 100,
        NETCASH_OPERATE: 40, NETCASH_INVEST: -10, PER_OI: 20, OPERATE_PROFIT: 25, DPS_HKD: 0.5,
      }),
    ])
    expect(parsed.fields.ttm_eps).toBe(21)
    expect(parsed.fields.cashflow_basis).toBe('fcf')
    // 2025: shares = 200/20 = 10, fcf = (80-30)/10 = 5
    expect(parsed.financials.annual.at(-1).free_cash_flow_per_share).toBe(5)
    expect(parsed.financials.annual.at(-1).dividends_per_share).toBe(1.5)
    expect(parsed.financials.annual.at(-1).operating_income_per_share).toBe(5)
  })
})

describe('growth windows and cash-flow basis', () => {
  it('keeps a long window when the ten-year anchor is negative', () => {
    const rate = windowGrowth([
      { fy: 2015, val: -1 },
      { fy: 2016, val: 1 },
      { fy: 2020, val: 10 },
      { fy: 2025, val: 12 },
    ], 10)
    expect(rate).toBe(31.8)
  })

  it('does not seed free cash flow from operating cash flow', () => {
    const parsed = fromAshareReports([], [
      row('2024-12-31', '年报', { EPSJB: 1, EPSXS: 1, BPS: 8, MGJYXJJE: 20, PER_TOI: 3 }),
      row('2025-12-31', '年报', { EPSJB: 1.1, EPSXS: 1.1, BPS: 9, MGJYXJJE: 22, PER_TOI: 3.2 }),
    ])
    expect(parsed.fields.cashflow_basis).toBe('ocf')
    expect(parsed.fields.free_cash_flow_per_share).toBeNull()
    expect(parsed.fields.cashflow_growth_10y).toBeNull()
    expect(parsed.financials.annual.at(-1).free_cash_flow_per_share).toBe(22)
  })

  it('converts Hong Kong per-share figures into the quote currency and leaves dividends', () => {
    const parsed = fromHkReports([
      row('2025-12-31', '年报', {
        BASIC_EPS: 10, DILUTED_EPS: 10, EPS_TTM: 10, BPS: 40, HOLDER_PROFIT: 100,
        NETCASH_OPERATE: 30, NETCASH_INVEST: -10, PER_OI: 20, DPS_HKD: 1.5,
      }),
      row('2024-12-31', '年报', {
        BASIC_EPS: 8, DILUTED_EPS: 8, EPS_TTM: 8, BPS: 36, HOLDER_PROFIT: 80,
        NETCASH_OPERATE: 24, NETCASH_INVEST: -8, PER_OI: 16, DPS_HKD: 1.2,
      }),
    ])
    const converted = convertReportingCurrency(parsed, 1.1)
    expect(converted.fields.ttm_eps).toBeCloseTo(11)
    expect(converted.fields.tangible_book).toBeCloseTo(44)
    expect(converted.financials.annual.at(-1).dividends_per_share).toBe(1.5)
  })
})
