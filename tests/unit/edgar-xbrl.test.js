import { describe, expect, it } from 'vitest'
import { financialsFromFacts, profileFromFacts, quoteSplitFactor, rescaleFiledEps } from '../../src/data/providers/edgar-xbrl'

const year = (fy, val, extra = {}) => ({
  fy,
  fp: 'FY',
  form: '10-K',
  val,
  filed: (fy + 1) + '-02-01',
  start: (fy - 1) + '-12-31',
  end: fy + '-12-31',
  ...extra,
})

function facts (map) {
  const usGaap = {}
  for (const [concept, rows] of Object.entries(map)) {
    const [unit, entries] = rows
    usGaap[concept] = { units: { [unit]: entries } }
  }
  return { 'us-gaap': usGaap, entityName: 'Example Inc.' }
}

describe('EDGAR per-share facts', () => {
  it('prefers a full year over a later stub tagged as FY', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2023, 5),
        year(2024, 6),
        year(2024, 1.5, { start: '2024-10-01', filed: '2025-11-01' }),
        year(2025, 7),
      ]],
    }))
    expect(table.annual.map((row) => row.eps_without_nri)).toEqual([5, 6, 7])
  })

  it('puts free cash flow on the post-split share count', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [year(2023, 4), year(2024, 4.2), year(2025, 4.5)]],
      Revenues: ['USD', [year(2023, 100e9), year(2024, 104e9), year(2025, 110e9)]],
      NetCashProvidedByUsedInOperatingActivities: ['USD', [year(2023, 20e9), year(2024, 21e9), year(2025, 22e9)]],
      PaymentsToAcquirePropertyPlantAndEquipment: ['USD', [year(2023, 4e9), year(2024, 4e9), year(2025, 4e9)]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [
        year(2023, 5e9),
        year(2024, 20e9),
        year(2025, 19.5e9),
      ]],
    }))
    const first = table.annual[0]
    const last = table.annual.at(-1)
    expect(first.free_cash_flow_per_share).toBeCloseTo(16e9 / 20e9, 2)
    expect(last.free_cash_flow_per_share).toBeCloseTo(18e9 / 19.5e9, 2)
    expect(first.revenue_per_share).toBeCloseTo(5, 1)
  })

  it('repairs a share count that was reported in millions', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [year(2023, 10), year(2024, 11), year(2025, 12)]],
      Revenues: ['USD', [year(2023, 23e9), year(2024, 25e9), year(2025, 26e9)]],
      NetCashProvidedByUsedInOperatingActivities: ['USD', [year(2023, 8e9), year(2024, 9e9), year(2025, 9e9)]],
      PaymentsToAcquirePropertyPlantAndEquipment: ['USD', [year(2023, 2e9), year(2024, 2e9), year(2025, 2e9)]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [
        year(2023, 730e6),
        year(2024, 720),
        year(2025, 710),
      ]],
    }))
    expect(table.annual.at(-1).revenue_per_share).toBeGreaterThan(20)
    expect(table.annual.at(-1).revenue_per_share).toBeLessThan(50)
    expect(table.annual.at(-1).free_cash_flow_per_share).toBeLessThan(20)
  })

  it('drops a one-year earnings hole', () => {
    const stock = profileFromFacts('NASDAQ:EX', facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2017, 2.4),
        year(2018, 2.5),
        year(2019, 2.6),
        year(2020, 2.8),
        year(2021, 2.9),
        year(2022, 3),
        year(2023, 3.2),
        year(2024, 0.7),
        year(2025, 3.6),
      ]],
    }))
    expect(stock.ttm_eps).toBe(3.6)
    expect(stock.earning_growth_10y).toBeGreaterThan(0)
    expect(stock.earning_growth_10y).toBeLessThan(15)
  })

  it('keeps the later of two full-year filings for the same period', () => {
    const original = year(2024, 6)
    const restated = year(2024, 6.5, { filed: '2026-02-01' })
    const forward = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [year(2023, 5), original, restated]],
    }))
    const reverse = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [year(2023, 5), restated, original]],
    }))
    expect(forward.annual.at(-1).eps_without_nri).toBe(6.5)
    expect(reverse.annual.at(-1).eps_without_nri).toBe(6.5)
  })

  it('leaves ten-year growth empty when only a one-year window exists', () => {
    const stock = profileFromFacts('NASDAQ:EX', facts({
      EarningsPerShareDiluted: ['USD/shares', [year(2024, 5), year(2025, 6)]],
      NetCashProvidedByUsedInOperatingActivities: ['USD', [year(2024, 10e9), year(2025, 12e9)]],
      PaymentsToAcquirePropertyPlantAndEquipment: ['USD', [year(2024, 2e9), year(2025, 2e9)]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [year(2024, 1e9), year(2025, 1e9)]],
    }))
    expect(stock.free_cash_flow_per_share).toBe(10)
    expect(stock.earning_growth_10y).toBeNull()
    expect(stock.cashflow_growth_10y).toBeNull()
  })

  it('does not report growth from older positives when the latest year is a loss', () => {
    const stock = profileFromFacts('NASDAQ:EX', facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2015, 1), year(2016, 1.2), year(2017, 1.4), year(2018, 1.6), year(2019, 1.8),
        year(2020, 2), year(2021, 2.2), year(2022, 2.4), year(2023, 2.6), year(2024, -1),
      ]],
    }))
    expect(stock.ttm_eps).toBe(-1)
    expect(stock.earning_growth_10y).toBeNull()
  })

  it('ignores a free-cash-flow series that stopped years ago', () => {
    const stock = profileFromFacts('NASDAQ:EX', facts({
      EarningsPerShareDiluted: ['USD/shares', [year(2024, 5), year(2025, 6)]],
      NetCashProvidedByUsedInOperatingActivities: ['USD', [year(2016, 10e9), year(2017, 11e9)]],
      PaymentsToAcquirePropertyPlantAndEquipment: ['USD', [year(2016, 2e9), year(2017, 2e9)]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [year(2016, 1e9), year(2025, 1e9)]],
    }))
    expect(stock.free_cash_flow_per_share).toBeNull()
    expect(stock.cashflow_growth_10y).toBeNull()
  })

  it('reads a split that happened after the latest filing from the quote', () => {
    expect(quoteSplitFactor(157.53, 117e9, 37e6)).toBe(20)
    expect(quoteSplitFactor(350, 5.2e12, 15e9)).toBe(1)
    expect(quoteSplitFactor(300, 1.5e12, 25e9)).toBeCloseTo(0.2)
  })

  it('reads comparative columns by period end, not the filing year', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2026, 6.08, { end: '2024-09-28', start: '2023-10-01' }),
        year(2026, 7.46, { end: '2025-09-27', start: '2024-09-29' }),
        year(2026, 8.98, { end: '2026-09-26', start: '2025-09-28' }),
      ]],
    }))
    expect(table.annual.map((row) => row.eps_without_nri)).toEqual([6.08, 7.46, 8.98])
  })

  it('does not divide a fifty percent earnings drop as if it were a split', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2021, 4),
        year(2022, 2),
        year(2023, 2.1),
        year(2024, 2.2),
      ]],
    }))
    expect(table.annual.map((row) => row.eps_without_nri)).toEqual([4, 2, 2.1, 2.2])
  })

  it('rescales EPS last filed before a later split, and leaves restated comparatives alone', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [year(2023, 4), year(2024, 1.05), year(2025, 1.1)]],
      Revenues: ['USD', [year(2023, 100e9), year(2024, 104e9), year(2025, 110e9)]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [year(2023, 5e9), year(2024, 20e9), year(2025, 20e9)]],
    }))
    // 2023 was filed in 2024, before the 2024 10-K that records the 4-for-1.
    expect(table.annual.map((row) => row.eps_without_nri)).toEqual([1, 1.05, 1.1])
  })

  it('does not divide a year already restated in the split-year 10-K', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2023, 1, { filed: '2025-02-01' }),
        year(2024, 1.05),
        year(2025, 1.1),
      ]],
      Revenues: ['USD', [year(2023, 100e9), year(2024, 104e9), year(2025, 110e9)]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [year(2023, 5e9), year(2024, 20e9), year(2025, 20e9)]],
    }))
    expect(table.annual.map((row) => row.eps_without_nri)).toEqual([1, 1.05, 1.1])
  })

  it('restates Apple-like 2017 EPS across a 2020 4-for-1 and gets a mid-teens ten-year growth', () => {
    const eps = [
      year(2017, 9.21, { filed: '2018-11-05' }),
      year(2018, 2.98, { filed: '2020-10-30' }),
      year(2019, 2.97, { filed: '2020-10-30' }),
      year(2020, 3.28, { filed: '2020-10-30' }),
      year(2021, 5.61),
      year(2022, 6.11),
      year(2023, 6.13),
      year(2024, 6.08),
      year(2025, 7.46),
      year(2026, 8.98),
    ]
    const shares = [
      year(2017, 5.2e9), year(2018, 5.0e9), year(2019, 4.75e9),
      year(2020, 17.5e9, { filed: '2020-10-30' }),
      year(2021, 16.9e9), year(2022, 16.3e9), year(2023, 15.8e9),
      year(2024, 15.4e9), year(2025, 15.2e9), year(2026, 15.0e9),
    ]
    const revenue = [
      year(2017, 229e9), year(2018, 266e9), year(2019, 260e9), year(2020, 275e9),
      year(2021, 366e9), year(2022, 394e9), year(2023, 383e9), year(2024, 391e9),
      year(2025, 416e9), year(2026, 488e9),
    ]
    const stock = profileFromFacts('NASDAQ:AAPL', facts({
      EarningsPerShareDiluted: ['USD/shares', eps],
      Revenues: ['USD', revenue],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', shares],
    }))
    expect(stock.ttm_eps).toBe(8.98)
    expect(stock.earning_growth_10y).toBeGreaterThan(15)
    expect(stock.earning_growth_10y).toBeLessThan(18)
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', eps],
      Revenues: ['USD', revenue],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', shares],
    }))
    expect(table.annual[0].eps_without_nri).toBeCloseTo(2.3025, 3)
    expect(table.annual[1].eps_without_nri).toBe(2.98)
  })

  it('compounds two later splits only onto years filed before each 10-K', () => {
    // NVDA-like: 4-for-1 in 2021, 10-for-1 in 2024.
    const eps = [
      year(2017, 2.57, { filed: '2018-03-01' }),
      year(2020, 1.13, { filed: '2022-03-18' }),
      year(2021, 1.73, { filed: '2022-03-18' }),
      year(2022, 3.85, { filed: '2023-02-24' }),
      year(2024, 1.19, { filed: '2025-02-26' }),
      year(2025, 2.94, { filed: '2026-02-26' }),
      year(2026, 4.9, { filed: '2026-02-26' }),
    ]
    const shares = [
      year(2017, 2.4e9),
      year(2020, 2.5e9),
      year(2021, 10e9, { filed: '2022-03-18' }),
      year(2022, 10e9, { filed: '2023-02-24' }),
      year(2024, 100e9, { filed: '2025-02-26' }),
      year(2025, 100e9),
      year(2026, 100e9),
    ]
    const revenue = [
      year(2017, 10e9), year(2020, 17e9), year(2021, 27e9), year(2022, 27e9),
      year(2024, 130e9), year(2025, 130e9), year(2026, 200e9),
    ]
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', eps],
      Revenues: ['USD', revenue],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', shares],
    }))
    const byYear = Object.fromEntries(table.annual.map((row) => [row.date.slice(0, 4), row.eps_without_nri]))
    expect(byYear['2017']).toBeCloseTo(2.57 / 40, 3)
    expect(byYear['2020']).toBeCloseTo(1.13 / 10, 3) // restated in the 2021 10-K, only the later 10-for-1 applies
    expect(byYear['2021']).toBeCloseTo(1.73 / 10, 3)
    expect(byYear['2022']).toBeCloseTo(3.85 / 10, 3)
    expect(byYear['2024']).toBe(1.19)
    expect(byYear['2026']).toBe(4.9)
  })
  it('restates Alphabet-like EPS from a later 10-K when share counts start after the split', () => {
    const eps = [
      year(2016, 27.85, { filed: '2019-02-05' }),
      year(2017, 18, { filed: '2019-02-05' }),
      year(2018, 43.7, { filed: '2019-02-05' }),
      year(2019, 49.16, { filed: '2022-02-02' }),
      year(2020, 58.61, { filed: '2022-02-02' }),
      year(2020, 2.93, { fy: 2022, filed: '2023-02-03' }),
      year(2020, 2.93, { fy: 2023, filed: '2024-01-31' }),
      year(2021, 112.2, { filed: '2022-02-02' }),
      year(2021, 5.61, { fy: 2022, filed: '2023-02-03' }),
      year(2021, 5.61, { fy: 2023, filed: '2024-01-31' }),
      year(2022, 4.56, { filed: '2023-02-03' }),
      year(2023, 5.8),
      year(2024, 8.04),
      year(2025, 10.81),
    ]
    const shares = [
      year(2022, 13.16e9, { filed: '2023-02-03' }),
      year(2023, 12.72e9),
      year(2024, 12.45e9),
      year(2025, 12.23e9),
    ]
    const payload = facts({
      EarningsPerShareDiluted: ['USD/shares', eps],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', shares],
    })
    const table = financialsFromFacts(payload)
    const byYear = Object.fromEntries(table.annual.map((row) => [row.date.slice(0, 4), row.eps_without_nri]))
    expect(byYear['2016']).toBeCloseTo(27.85 / 20, 3)
    expect(byYear['2019']).toBeCloseTo(49.16 / 20, 3)
    expect(byYear['2020']).toBe(2.93)
    expect(byYear['2021']).toBe(5.61)
    expect(byYear['2025']).toBe(10.81)
    const stock = profileFromFacts('NASDAQ:GOOGL', payload)
    expect(stock.earning_growth_10y).toBeGreaterThan(20)
    expect(stock.earning_growth_10y).toBeLessThan(30)
  })

  it('still reports ten-year growth after restatement leaves a small early base', () => {
    const stock = profileFromFacts('NASDAQ:AMZN', facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2016, 0.245), year(2017, 0.3075), year(2018, 1.007), year(2019, 1.1505),
        year(2020, 2.09), year(2021, 3.24), year(2022, -0.27), year(2023, 2.9),
        year(2024, 5.53), year(2025, 7.17),
      ]],
    }))
    expect(stock.earning_growth_10y).not.toBeNull()
    expect(stock.earning_growth_10y).toBeGreaterThan(20)
  })

  it('does not treat an ordinary same-year restatement as a split', () => {
    const table = financialsFromFacts(facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2020, 6, { filed: '2021-02-01' }),
        year(2020, 6.5, { fy: 2021, filed: '2022-02-01' }),
        year(2021, 7),
        year(2022, 7.4),
      ]],
    }))
    expect(table.annual.map((row) => row.eps_without_nri)).toEqual([6.5, 7, 7.4])
  })
  it('does not apply a restated share count as a second earlier split', () => {
    const payload = facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2019, 23.01, { filed: '2022-02-04' }),
        year(2020, 41.83, { filed: '2022-02-04' }),
        year(2020, 2.09, { fy: 2022, filed: '2023-02-03' }),
        year(2021, 3.24, { fy: 2022, filed: '2023-02-03' }),
        year(2022, -0.27, { filed: '2023-02-03' }),
        year(2023, 2.9),
        year(2024, 5.53),
        year(2025, 7.17),
      ]],
      Revenues: ['USD', [
        year(2019, 280e9), year(2020, 386e9), year(2021, 470e9), year(2022, 514e9),
        year(2023, 575e9), year(2024, 638e9), year(2025, 717e9),
      ]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [
        year(2019, 504e6, { filed: '2022-02-04' }),
        year(2020, 506e6, { filed: '2022-02-04' }),
        year(2020, 10198e6, { fy: 2022, filed: '2023-02-03' }),
        year(2021, 515e6, { filed: '2022-02-04' }),
        year(2021, 10296e6, { fy: 2022, filed: '2023-02-03' }),
        year(2022, 10189e6, { filed: '2023-02-03' }),
        year(2023, 10492e6),
        year(2024, 10721e6),
        year(2025, 10827e6),
      ]],
    })
    const table = financialsFromFacts(payload)
    const byYear = Object.fromEntries(table.annual.map((row) => [row.date.slice(0, 4), row.eps_without_nri]))
    expect(byYear['2019']).toBeCloseTo(23.01 / 20, 3)
    expect(byYear['2020']).toBe(2.09)
    expect(byYear['2021']).toBe(3.24)
    expect(byYear['2025']).toBe(7.17)
  })
})
