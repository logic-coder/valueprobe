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
  it('equals book when the return on equity is the discount rate', () => {
    expect(residualIncomeValue(100, 12, 12, 4, 4, 10).fairValue).toBe(100)
  })

  it('fades CMB return toward the discount rate instead of keeping it forever', () => {
    const faded = residualIncomeValue(46.87, 5.84, 10, 9.44, 4, 10)
    expect(faded.fairValue).toBe(51.9)
    expect(faded.fairValue).toBeLessThan(66.09)
  })

  it('refuses a value without positive book, earnings, or discount rate', () => {
    expect(residualIncomeValue(46.87, 0, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(46.87, -1, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(0, 5.84, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(-3, 5.84, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(46.87, 5.84, 0, 4, 4)).toBeNull()
  })

  it('feeds the sensitivity centre cell', () => {
    const grid = buildSensitivityGrid({ discountRate: 10, growthRate: 9.44, tbv: 46.87, years: 10, base: 5.84, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10, residualIncome: true })
    expect(grid.rows[2][2]).toBe(51.9)
  })
})

describe('financial institution detector', () => {
  it('flags mainland ocf files and names that say bank', () => {
    for (const name of ['SHSE-600036', 'SHSE-601398', 'SHSE-601318', 'SHSE-600030', 'SZSE-000001', 'HKSE-01398', 'NYSE-BAC']) {
      expect(load(name).financial_institution, name).toBe(true)
    }
  })

  it('flags HK insurers and HSBC by name', () => {
    for (const name of ['HKSE-00005', 'HKSE-01299', 'HKSE-02318', 'HKSE-02601', 'HKSE-02628']) {
      expect(load(name).financial_institution, name).toBe(true)
    }
  })

  it('flags US filers with book but no operating income and no cash flow or revenue', () => {
    for (const name of ['NYSE-JPM', 'NYSE-MS', 'NYSE-GS']) {
      expect(load(name).financial_institution, name).toBe(true)
    }
  })

  it('leaves Hong Kong non-financials and ordinary companies alone', () => {
    for (const name of ['HKSE-00700', 'HKSE-03690', 'HKSE-00941', 'HKSE-00388', 'NASDAQ-AAPL', 'NASDAQ-MSFT', 'NASDAQ-NVDA', 'NASDAQ-GOOGL', 'NYSE-KO', 'NYSE-CVX', 'NYSE-LLY', 'NYSE-TSM', 'SHSE-600519']) {
      expect(load(name).financial_institution, name).toBeUndefined()
    }
  })

  it('reads annual rows passed apart from a payload that dropped them', () => {
    const { financials, ...jpm } = load('NYSE-JPM')
    delete jpm.financial_institution
    expect(isFinancialInstitution(jpm)).toBe(false)
    expect(isFinancialInstitution(jpm, financials.annual)).toBe(true)
  })
})

describe('watchlist and compare share the page model', () => {
  it('prices CMB and ICBC on residual income at 10%', () => {
    expect(defaultView(load('SHSE-600036'), 4)).toEqual({ fairValue: 51.9, mos: '16.92' })
    expect(defaultView(load('SHSE-601398'), 4)).toEqual({ fairValue: 10.95, mos: '17.26' })
  })

  it('prices JPM on residual income, not the 520.84 owner-earnings annuity', () => {
    expect(defaultView(load('NYSE-JPM'), 4).fairValue).toBe(153.11)
  })

  it('keeps a Tencent-shaped payload (invest, not flagged) on presentValue', () => {
    const tencent = load('HKSE-00700')
    expect(tencent.cashflow_basis).toBe('invest')
    expect(tencent.financial_institution).toBeUndefined()
    const expected = presentValue(tencent.tangible_book, 10, 10, Math.min(tencent.earning_growth_10y ?? 5, 15), tencent.ttm_eps_nri, 4, 10, false).fairValue
    expect(defaultView(tencent, 4).fairValue).toBe(expected)
  })
})
