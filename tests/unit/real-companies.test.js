import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanGrowth } from '../../src/lib/assumptions'
import { buildDefaults, marginOfSafety, presentValue } from '../../src/lib/dcf'
import { suggestedModel } from '../../src/lib/valuationModel'

// Real-company regression over the committed snapshots the published site reads.
// Unit fixtures prove the kernel on synthetic shapes; this proves the shipped
// files still carry the facts those shapes stand for. Assertions target stable
// structure (a split is recognized, a real downturn survives, a loss leaves
// growth empty), never a price or a value that `npm run snapshot` will move.

const load = (file) => JSON.parse(readFileSync('public/data/' + file + '.json', 'utf8'))
const annual = (stock) => stock.financials?.annual || []
const field = (stock, key) => annual(stock).map((row) => row[key])

describe('split handling survives in the shipped data', () => {
  const cases = [
    ['NASDAQ-AAPL', 'Apple 4-for-1 in 2020'],
    ['NASDAQ-NVDA', 'NVIDIA 4-for-1 2021 and 10-for-1 2024'],
    ['NASDAQ-INTU', 'Intuit split history'],
  ]
  for (const [file, label] of cases) {
    it(file + ' — ' + label, () => {
      const stock = load(file)
      const eps = field(stock, 'eps_without_nri')
      const revenue = field(stock, 'revenue_per_share')
      expect(eps.length).toBeGreaterThanOrEqual(6)
      // A recognized level shift yields a positive clean window, not a negative
      // CAGR computed across the un-restated split boundary.
      const clean = cleanGrowth(eps, revenue)
      expect(clean).not.toBeNull()
      expect(clean.rate).toBeGreaterThan(0)
      expect(stock.earning_growth_10y).toBeGreaterThan(0)
    })
  }
})

describe('20-F / IFRS company keeps a computable valuation', () => {
  it('NYSE-TSM has per-share facts and a finite fair value', () => {
    const stock = load('NYSE-TSM')
    expect(stock.ttm_eps).toBeGreaterThan(0)
    expect(stock.tangible_book).toBeGreaterThan(0)
    expect(stock.earning_growth_10y).toBeGreaterThan(0)
    expect(suggestedModel(stock)).toBe('owner')
    const d = buildDefaults(4.2, stock, stock.free_cash_flow_per_share)
    const value = presentValue(
      d.dcfResultForm.tbv, d.dcfForm.years, d.dcfForm.discountRate,
      d.dcfForm.growthRate, d.dcfForm.eps, d.dcfForm.terminalGrowthRate,
      d.dcfForm.yearsOfTerminalGrowth, false,
    )
    expect(Number.isFinite(value.fairValue)).toBe(true)
    expect(value.fairValue).toBeGreaterThan(0)
    expect(Number(marginOfSafety(Number(String(stock.price).replace(/[^\d.]/g, '')), value.fairValue))).toBeLessThan(Infinity)
  })
})

describe('Hong Kong dividends are never a repeated constant', () => {
  // The Eastmoney feed repeats one current DPS on every row, which is not a
  // history. The parser deliberately stores null; constant series are a bug.
  const files = ['HKSE-00700', 'HKSE-00941', 'HKSE-01810']
  for (const file of files) {
    it(file + ' has no constant dividend column', () => {
      const values = field(load(file), 'dividends_per_share').filter((v) => v != null)
      if (values.length < 2) return // all-null is the expected shape
      expect(new Set(values).size).toBeGreaterThan(1)
    })
  }
})

describe('a real fiscal-year downturn is preserved', () => {
  it('NASDAQ-NVDA keeps FY2023 EPS at the restated 0.17', () => {
    const row = annual(load('NASDAQ-NVDA')).find((r) => r.date === '2023-12')
    expect(row).toBeDefined()
    expect(row.eps_without_nri).toBeCloseTo(0.17, 4)
    expect(row.operating_income_per_share).toBeGreaterThan(0) // real year, not a tagging hole
  })
})

describe('a latest-year loss leaves growth empty', () => {
  it('NASDAQ-INTC has negative EPS and no adopted growth', () => {
    const stock = load('NASDAQ-INTC')
    expect(stock.ttm_eps).toBeLessThan(0)
    expect(stock.earning_growth_10y).toBeNull()
    expect(stock.earning_growth_5y).toBeNull()
    expect(stock.earning_growth_1y).toBeNull()
  })
})
