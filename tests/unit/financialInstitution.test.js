import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { presentValue, residualIncomeValue } from '../../src/lib/dcf'
import { isFinancialInstitution } from '../../src/lib/financialInstitution'
import { buildSensitivityGrid } from '../../src/lib/sensitivity'
import { defaultView } from '../../src/lib/watchlistView'

const load = (name) => {
  const stock = JSON.parse(fs.readFileSync(path.resolve('public/data', name + '.json'), 'utf8'))
  stock.exchange_ = name.split('-')[0]
  if (isFinancialInstitution(stock)) stock.financial_institution = true
  return stock
}

describe('residual income', () => {
  it('values CMB on tangible book: book 46.87, eps 5.84, r 10, g 4', () => {
    const result = residualIncomeValue(46.87, 5.84, 10, 9.44, 4)
    expect(result.fairValue).toBe(66.09)
    expect(result.growth).toBe(4)
    expect(result.roe).toBeCloseTo(12.46, 2)
  })

  it('takes the lowest of growth, terminal and ROE − 1pp', () => {
    expect(residualIncomeValue(11.2394, 1.05, 10, 3.15, 4).growth).toBe(3.15)
    expect(residualIncomeValue(100, 5, 10, 9, 8).growth).toBe(4)
  })

  it('refuses a value without positive book or eps, or with r ≤ g', () => {
    expect(residualIncomeValue(46.87, 0, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(46.87, -1, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(0, 5.84, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(-3, 5.84, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(46.87, 5.84, 4, 4, 4)).toBeNull()
  })

  it('feeds the sensitivity centre cell', () => {
    const grid = buildSensitivityGrid({ discountRate: 10, growthRate: 9.44, tbv: 46.87, years: 10, base: 5.84, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10, residualIncome: true })
    expect(grid.rows[2][2]).toBe(66.09)
  })
})

describe('financial institution detector', () => {
  it('flags mainland ocf files and names that say bank', () => {
    for (const name of ['SHSE-600036', 'SHSE-601398', 'SHSE-601318', 'SHSE-600030', 'SZSE-000001', 'HKSE-01398', 'NYSE-BAC']) {
      expect(load(name).financial_institution, name).toBe(true)
    }
  })

  it('leaves wiped-cash-flow HK names and ordinary companies alone', () => {
    for (const name of ['HKSE-00700', 'HKSE-03690', 'HKSE-00941', 'NASDAQ-AAPL', 'NASDAQ-MSFT', 'NASDAQ-NVDA', 'NASDAQ-GOOGL', 'NYSE-KO', 'SHSE-600519', 'NYSE-JPM']) {
      expect(load(name).financial_institution, name).toBeUndefined()
    }
  })
})

describe('watchlist and compare share the page model', () => {
  it('prices CMB and ICBC on residual income at 10%', () => {
    expect(defaultView(load('SHSE-600036'), 4)).toEqual({ fairValue: 66.09, mos: '34.48' })
    expect(defaultView(load('SHSE-601398'), 4)).toEqual({ fairValue: 10.16, mos: '10.63' })
  })

  it('keeps a Tencent-shaped payload (ocf, not flagged) on presentValue', () => {
    const tencent = load('HKSE-00700')
    expect(tencent.cashflow_basis).toBe('ocf')
    const expected = presentValue(tencent.tangible_book, 10, 10, Math.min(tencent.earning_growth_10y ?? 5, 15), tencent.ttm_eps_nri, 4, 10, false).fairValue
    expect(defaultView(tencent, 4).fairValue).toBe(expected)
  })
})
