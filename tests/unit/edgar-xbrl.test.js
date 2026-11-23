import { describe, expect, it } from 'vitest'
import { financialsFromFacts, fundamentalsFromFacts, growthWindow, profileFromFacts, quoteSplitFactor, scalePerShare } from '../../src/data/providers/edgar-xbrl'
import interimEps from '../fixtures/edgar-interim-eps.json'

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
  it.each(interimEps)('uses comparable interim facts for $symbol', ({ symbol, points, expected }) => {
    const { fields, financials } = fundamentalsFromFacts(symbol, facts({
      EarningsPerShareDiluted: ['USD/shares', points],
    }))
    expect(fields).toMatchObject({ ttm_eps: expected, eps_as_of: '2026-09-30', eps_period: 'TTM' })
    expect(financials.annual.at(-1).eps_without_nri).toBe(points[1].val)
  })

  it('falls back to the annual figure if the comparative was restated', () => {
    const { symbol, points } = interimEps[0]
    const mixedBasis = points.map((point, index) => index === 3 ? { ...point, val: point.val / 10 } : point)
    const { fields } = fundamentalsFromFacts(symbol, facts({ EarningsPerShareDiluted: ['USD/shares', mixedBasis] }))
    expect(fields).toMatchObject({ ttm_eps: 7.28, eps_as_of: '2025-12-31', eps_period: 'FY' })
  })

  it('requires the bridge to cover the same fiscal interval', () => {
    const { symbol, points } = interimEps[2]
    const differentPeriod = points.map((point, index) => index === 4 ? { ...point, start: '2026-06-01' } : point)
    const { fields } = fundamentalsFromFacts(symbol, facts({ EarningsPerShareDiluted: ['USD/shares', differentPeriod] }))
    expect(fields).toMatchObject({ ttm_eps: 17.95, eps_as_of: '2026-06-30', eps_period: 'FY' })
  })

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

  it('drops a one-year earnings hole that looks like a missed 5-for-1', () => {
    const hole = facts({
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
      Revenues: ['USD', [
        year(2017, 24e9), year(2018, 25e9), year(2019, 26e9), year(2020, 28e9),
        year(2021, 29e9), year(2022, 30e9), year(2023, 32e9), year(2024, 33e9),
        year(2025, 36e9),
      ]],
    })
    const table = financialsFromFacts(hole)
    const byYear = Object.fromEntries(table.annual.map((row) => [row.date.slice(0, 4), row.eps_without_nri]))
    expect(byYear['2023']).toBe(3.2)
    expect(byYear['2024']).toBeNull()
    expect(byYear['2025']).toBe(3.6)
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


describe('US GAAP capital spending', () => {
  const filing = (fy, val, extra = {}) => year(fy, val, { accn: `annual-${fy}`, ...extra })
  const operating = ['USD', [filing(2024, 12143e6), filing(2025, 10044e6)]]
  const shares = ['shares', [filing(2024, 569e6), filing(2025, 546e6)]]
  const oilAndGas = ['USD', [filing(2024, 5353e6), filing(2025, 6115e6)]]
  const other = ['USD', [filing(2024, 1019e6), filing(2025, 479e6)]]

  function history (capitalSpending) {
    return financialsFromFacts(facts({
      NetCashProvidedByUsedInOperatingActivities: operating,
      WeightedAverageNumberOfDilutedSharesOutstanding: shares,
      ...capitalSpending,
    })).annual.map((row) => row.free_cash_flow_per_share)
  }

  it('deducts both disclosed components and prefers a reported total when present', () => {
    const components = {
      PaymentsToAcquireOilAndGasPropertyAndEquipment: oilAndGas,
      PaymentsToAcquireOtherPropertyPlantAndEquipment: other,
      PaymentsToAcquireOilAndGasProperty: ['USD', [filing(2025, 269e6)]],
    }
    expect(history(components)).toEqual([10.1424, 6.3187])
    expect(history({
      ...components,
      PaymentsToAcquirePropertyPlantAndEquipment: ['USD', [filing(2025, -6000e6)]],
    })).toEqual([10.1424, 7.4066])
  })

  it('leaves cash flow missing if a component cannot be matched to the same filing and period', () => {
    expect(history({
      PaymentsToAcquireOilAndGasPropertyAndEquipment: ['USD', [
        filing(2024, 5353e6, { accn: 'other-filing' }),
        filing(2025, 6115e6, { start: '2025-01-01' }),
      ]],
      PaymentsToAcquireOtherPropertyPlantAndEquipment: other,
    })).toEqual([null, null])
  })

  it('keeps the existing capex alias for issuers without evidence of separate oil and gas spending', () => {
    expect(history({ PaymentsToAcquireOtherPropertyPlantAndEquipment: other })).toEqual([19.5501, 17.5183])
  })
})

describe('US growth windows', () => {
  const points = (values, start = 2016) => values.map((val, index) => ({ fy: start + index, val }))

  it('computes 5-year and 1-year earnings growth on the same contract as A/H', () => {
    // 2016..2026: 1, 1.1, ... wait use a known series
    const series = points([1, 1.1, 1.2, 1.3, 1.5, 1.8, 2.0, 2.2, 2.5, 3.0, 3.6], 2016)
    expect(growthWindow(series, 1)).toBeCloseTo((3.6 / 3.0 - 1) * 100, 2)
    const five = growthWindow(series, 5)
    expect(five).toBeCloseTo((Math.pow(3.6 / 1.8, 1 / 5) - 1) * 100, 2)
    const ten = growthWindow(series, 10)
    expect(ten).toBeCloseTo((Math.pow(3.6 / 1, 1 / 10) - 1) * 100, 2)
  })

  it('leaves a window empty when the last year is a loss, and does not invent 5%', () => {
    const series = points([1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, -1], 2015)
    expect(growthWindow(series, 10)).toBeNull()
    expect(growthWindow(series, 5)).toBeNull()
    expect(growthWindow(series, 1)).toBeNull()
  })

  it('walks a 5-year base forward past a trough instead of dropping the window', () => {
    // 2020 is a trough relative to the median; 2021 is a usable base with span 5.
    const series = [
      { fy: 2020, val: 0.05 },
      { fy: 2021, val: 1.0 },
      { fy: 2022, val: 1.1 },
      { fy: 2023, val: 1.2 },
      { fy: 2024, val: 1.3 },
      { fy: 2025, val: 1.5 },
      { fy: 2026, val: 1.8 },
    ]
    expect(growthWindow(series, 5)).toBeCloseTo((Math.pow(1.8 / 1.0, 1 / 5) - 1) * 100, 2)
  })

  it('does not call a 1-year rate across a missing prior year', () => {
    expect(growthWindow([{ fy: 2024, val: 2 }, { fy: 2026, val: 3 }], 1)).toBeNull()
  })

  it('writes 5-year and 1-year fields onto a US profile', () => {
    const stock = profileFromFacts('NASDAQ:EX', facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2016, 1), year(2017, 1.1), year(2018, 1.2), year(2019, 1.3),
        year(2020, 1.5), year(2021, 1.8), year(2022, 2.0), year(2023, 2.2),
        year(2024, 2.5), year(2025, 3.0), year(2026, 3.6),
      ]],
      NetCashProvidedByUsedInOperatingActivities: ['USD', [
        year(2016, 10e9), year(2017, 11e9), year(2018, 12e9), year(2019, 13e9),
        year(2020, 15e9), year(2021, 18e9), year(2022, 20e9), year(2023, 22e9),
        year(2024, 25e9), year(2025, 30e9), year(2026, 36e9),
      ]],
      PaymentsToAcquirePropertyPlantAndEquipment: ['USD', [
        year(2016, 2e9), year(2017, 2e9), year(2018, 2e9), year(2019, 2e9),
        year(2020, 2e9), year(2021, 2e9), year(2022, 2e9), year(2023, 2e9),
        year(2024, 2e9), year(2025, 2e9), year(2026, 2e9),
      ]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [
        year(2016, 1e9), year(2017, 1e9), year(2018, 1e9), year(2019, 1e9),
        year(2020, 1e9), year(2021, 1e9), year(2022, 1e9), year(2023, 1e9),
        year(2024, 1e9), year(2025, 1e9), year(2026, 1e9),
      ]],
    }))
    expect(stock.earning_growth_1y).toBeCloseTo(20, 2)
    expect(stock.earning_growth_5y).toBeCloseTo((Math.pow(3.6 / 1.8, 1 / 5) - 1) * 100, 2)
    expect(stock.cashflow_growth_1y).toBeCloseTo((34 / 28 - 1) * 100, 2)
    expect(stock.cashflow_growth_5y).not.toBeNull()
  })
})

describe('NVIDIA fiscal-year EPS holes', () => {
  it('keeps the restated FY2023 downturn instead of treating it as a tagging error', () => {
    // NVIDIA fiscal years end in late January. Companyfacts label the year by
    // period end (FY2023 ended 2023-01-29). The FY2025 10-K restates FY2023
    // onto the post-10-for-1 basis at 0.17; FY2022 was last filed pre-split
    // at 3.85. Operating income also fell in FY2023, so this is a real year.
    const jan = (fy, val, extra = {}) => year(fy, val, {
      start: (fy - 1) + '-01-31',
      end: fy + '-01-29',
      ...extra,
    })
    const payload = facts({
      EarningsPerShareDiluted: ['USD/shares', [
        jan(2017, 2.57, { filed: '2018-03-01' }),
        jan(2018, 4.82, { filed: '2019-02-21' }),
        jan(2019, 6.63, { filed: '2020-02-20' }),
        jan(2020, 1.13, { filed: '2022-03-18' }),
        jan(2021, 1.73, { filed: '2022-03-18' }),
        jan(2022, 3.85, { filed: '2024-02-21' }),
        jan(2023, 1.74, { filed: '2024-02-21' }),
        jan(2023, 0.17, { fy: 2025, filed: '2025-02-26' }),
        jan(2024, 1.19, { filed: '2025-02-26' }),
        jan(2025, 2.94, { filed: '2026-02-26' }),
        jan(2026, 4.9, { filed: '2026-02-26' }),
      ]],
      Revenues: ['USD', [
        jan(2017, 6.9e9), jan(2018, 9.7e9), jan(2019, 11.7e9), jan(2020, 10.9e9),
        jan(2021, 16.7e9), jan(2022, 26.9e9), jan(2023, 27.0e9), jan(2024, 60.9e9),
        jan(2025, 130.5e9), jan(2026, 187e9),
      ]],
      OperatingIncomeLoss: ['USD', [
        jan(2017, 1.9e9), jan(2018, 3.2e9), jan(2019, 3.8e9), jan(2020, 2.8e9),
        jan(2021, 4.5e9), jan(2022, 10.0e9), jan(2023, 4.2e9), jan(2024, 33.0e9),
        jan(2025, 81.0e9), jan(2026, 120e9),
      ]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [
        jan(2017, 2.4e9, { filed: '2018-03-01' }),
        jan(2020, 2.5e9, { filed: '2021-02-26' }),
        jan(2021, 10e9, { filed: '2022-03-18' }),
        jan(2022, 10e9, { filed: '2023-02-24' }),
        jan(2023, 10e9, { filed: '2024-02-21' }),
        jan(2024, 10e9, { filed: '2024-02-21' }),
        jan(2025, 100e9, { filed: '2025-02-26' }),
        jan(2026, 100e9),
      ]],
    })
    const table = financialsFromFacts(payload)
    const byYear = Object.fromEntries(table.annual.map((row) => [row.date.slice(0, 4), row.eps_without_nri]))
    expect(byYear['2022']).toBeCloseTo(0.385, 3)
    expect(byYear['2023']).toBe(0.17)
    expect(byYear['2024']).toBe(1.19)
    expect(byYear['2026']).toBe(4.9)
    // 2016 exists in EDGAR (1.08 pre-split) but sits outside the 10-year
    // window once FY2026 is the latest year; the parser should not invent it.
    expect(byYear['2016']).toBeUndefined()
    const stock = profileFromFacts('NASDAQ:NVDA', payload)
    expect(stock.ttm_eps).toBe(4.9)
    expect(stock.earning_growth_1y).not.toBeNull()
    expect(stock.earning_growth_5y).not.toBeNull()
  })
})

describe('IFRS 20-F book value and free cash flow', () => {
  const year20 = (fy, val, extra = {}) => ({
    fy,
    fp: 'FY',
    form: '20-F',
    val,
    filed: (fy + 1) + '-04-17',
    start: fy + '-01-01',
    end: fy + '-12-31',
    ...extra,
  })
  const instant = (fy, val, extra = {}) => year20(fy, val, { start: undefined, ...extra })

  function ifrsFacts (map) {
    const ifrs = {}
    for (const [concept, rows] of Object.entries(map)) {
      const [unit, entries] = rows
      ifrs[concept] = { units: { [unit]: entries } }
    }
    return { 'ifrs-full': ifrs, entityName: 'Taiwan Semiconductor Manufacturing Company Limited' }
  }

  it('reads parent equity and operating cash flow minus capex from a 20-F', () => {
    const payload = ifrsFacts({
      DilutedEarningsLossPerShare: ['USD/shares', [
        year20(2022, 1.25), year20(2023, 1.07), year20(2024, 1.36),
      ]],
      Revenue: ['USD', [
        year20(2022, 75e9), year20(2023, 70e9), year20(2024, 90e9),
      ]],
      ProfitLossFromOperatingActivities: ['USD', [
        year20(2022, 35e9), year20(2023, 30e9), year20(2024, 40e9),
      ]],
      EquityAttributableToOwnersOfParent: ['USD', [
        instant(2022, 94e9), instant(2023, 112e9), instant(2024, 125e9),
      ]],
      Equity: ['USD', [
        instant(2022, 99e9), instant(2023, 118e9), instant(2024, 130e9),
      ]],
      NoncontrollingInterests: ['USD', [
        instant(2022, 5e9), instant(2023, 6e9), instant(2024, 5e9),
      ]],
      IntangibleAssetsAndGoodwill: ['USD', [
        instant(2022, 0.8e9), instant(2023, 0.7e9), instant(2024, 1e9),
      ]],
      CashFlowsFromUsedInOperatingActivities: ['USD', [
        year20(2022, 52e9), year20(2023, 40e9), year20(2024, 50e9),
      ]],
      PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities: ['USD', [
        year20(2022, 35e9), year20(2023, 31e9), year20(2024, 29e9),
      ]],
      AdjustedWeightedAverageShares: ['shares', [
        year20(2022, 25e9), year20(2023, 25e9), year20(2024, 25e9),
      ]],
    })
    const pack = fundamentalsFromFacts('NYSE:TSM', payload)
    const byYear = Object.fromEntries(pack.financials.annual.map((row) => [row.date.slice(0, 4), row]))
    // Parent equity minus intangibles, not consolidated equity that includes NCI.
    expect(byYear['2024'].book_value_per_share).toBeCloseTo((125e9 - 1e9) / 25e9, 3)
    expect(byYear['2024'].book_value_per_share).not.toBeCloseTo((130e9 - 1e9) / 25e9, 3)
    expect(byYear['2024'].free_cash_flow_per_share).toBeCloseTo((50e9 - 29e9) / 25e9, 3)
    expect(byYear['2024'].revenue_per_share).toBeCloseTo(90e9 / 25e9, 3)
    expect(byYear['2024'].operating_income_per_share).toBeCloseTo(40e9 / 25e9, 3)
    expect(pack.fields.tangible_book).toBeCloseTo((125e9 - 1e9) / 25e9, 3)
    expect(pack.fields.free_cash_flow_per_share).toBeCloseTo((50e9 - 29e9) / 25e9, 3)
    const adr = scalePerShare(pack, 0.2)
    expect(adr.fields.tangible_book).toBeCloseTo(((125e9 - 1e9) / 25e9) / 0.2, 3)
    expect(adr.fields.free_cash_flow_per_share).toBeCloseTo(((50e9 - 29e9) / 25e9) / 0.2, 3)
    expect(adr.fields.ttm_eps).toBeCloseTo(1.36 / 0.2, 3)
  })

  it('does not let an IFRS alias override a US 10-K equity series', () => {
    const payload = {
      'us-gaap': {
        EarningsPerShareDiluted: { units: { 'USD/shares': [year(2023, 4), year(2024, 5), year(2025, 6)] } },
        StockholdersEquity: { units: { USD: [year(2023, 80e9), year(2024, 90e9), year(2025, 100e9)] } },
        WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [year(2023, 10e9), year(2024, 10e9), year(2025, 10e9)] } },
      },
      'ifrs-full': {
        EquityAttributableToOwnersOfParent: { units: { USD: [year(2023, 8e9), year(2024, 9e9), year(2025, 10e9)] } },
        Equity: { units: { USD: [year(2023, 200e9), year(2024, 220e9), year(2025, 250e9)] } },
      },
      entityName: 'Example Inc.',
    }
    const table = financialsFromFacts(payload)
    expect(table.annual.at(-1).book_value_per_share).toBeCloseTo(10, 3)
  })
})


describe('EPS units and missing companyfacts concepts', () => {
  it('keeps diluted EPS tagged as USD/share', () => {
    const { fields, financials } = fundamentalsFromFacts('NYSE:EX', facts({
      EarningsPerShareDiluted: ['USD/share', [year(2024, 9.73), year(2025, 10.20), year(2026, 12.32)]],
    }))
    expect(fields.ttm_eps).toBe(12.32)
    expect(financials.annual.map((row) => row.eps_without_nri)).toEqual([9.73, 10.20, 12.32])
  })

  it('does not invent EPS from net income and shares when the EPS concept is absent', () => {
    // Visa-like companyfacts: income and cash exist, but dimensioned EPS never arrives.
    const table = financialsFromFacts(facts({
      NetIncomeLoss: ['USD', [year(2024, 19.7e9), year(2025, 20e9), year(2026, 23.5e9)]],
      NetCashProvidedByUsedInOperatingActivities: ['USD', [year(2024, 20e9), year(2025, 21e9), year(2026, 22e9)]],
      PaymentsToAcquirePropertyPlantAndEquipment: ['USD', [year(2024, 1e9), year(2025, 1e9), year(2026, 1e9)]],
      StockholdersEquity: ['USD', [year(2024, 40e9), year(2025, 38e9), year(2026, 38e9)]],
      WeightedAverageNumberOfDilutedSharesOutstanding: ['shares', [year(2024, 2e9), year(2025, 1.95e9), year(2026, 1.9e9)]],
    }))
    expect(table.annual.every((row) => row.eps_without_nri == null)).toBe(true)
    expect(table.annual.some((row) => row.free_cash_flow_per_share != null)).toBe(true)
  })
})
