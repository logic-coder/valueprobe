import { describe, expect, it } from 'vitest'
import { financialsFromFacts, profileFromFacts, quoteSplitFactor } from '../../src/data/providers/edgar-xbrl'

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

  it('restates earnings that drop by a split and stay down', () => {
    const stock = profileFromFacts('NASDAQ:EX', facts({
      EarningsPerShareDiluted: ['USD/shares', [
        year(2021, 100),
        year(2022, 4),
        year(2023, 5),
        year(2024, 6),
      ]],
    }))
    expect(stock.ttm_eps).toBe(6)
    expect(stock.earning_growth_10y).toBeGreaterThan(0)
  })
})
