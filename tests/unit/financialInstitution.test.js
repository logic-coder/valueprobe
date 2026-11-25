import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { residualIncomeValue } from '../../src/lib/dcf'
import { classify, dataGaps, isFinancialInstitution } from '../../src/lib/financialInstitution'
import { buildSensitivityGrid } from '../../src/lib/sensitivity'
import { defaultView } from '../../src/lib/watchlistView'

const read = (dir, name) => {
  const stock = JSON.parse(fs.readFileSync(path.resolve(dir, name + '.json'), 'utf8'))
  stock.exchange_ = name.split('-')[0]
  const found = classify(stock)
  if (found.financial) stock.financial_institution = true
  stock.classification_basis = found.basis
  if (found.industry) stock.industry = found.industry
  stock.data_gaps = dataGaps(stock.financials?.annual)
  return stock
}

// Price-derived fair values stay on committed fixtures so a quarterly
// snapshot refresh cannot break CI. Classification only checks flags.
const loadFixture = (name) => read('tests/fixtures', name)
const loadSnapshot = (name) => read('public/data', name)

describe('residual income', () => {
  it('equals book when the return on equity is the discount rate', () => {
    expect(residualIncomeValue(100, 12, 12, 4, 4, 10).fairValue).toBe(100)
  })

  it('fades CMB return toward the discount rate instead of keeping it forever', () => {
    const faded = residualIncomeValue(46.87, 5.84, 10, 9.44, 4, 10)
    expect(faded.fairValue).toBe(51.9)
    expect(faded.fairValue).toBeLessThan(66.09)
  })

  it('refuses a value without positive book or earnings but keeps a zero rate', () => {
    expect(residualIncomeValue(46.87, 0, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(46.87, -1, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(0, 5.84, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(-3, 5.84, 10, 4, 4)).toBeNull()
    expect(residualIncomeValue(46.87, 5.84, 0, 4, 4).fairValue).toBeGreaterThan(46.87)
  })

  it('feeds the sensitivity centre cell', () => {
    const grid = buildSensitivityGrid({ discountRate: 10, growthRate: 9.44, tbv: 46.87, years: 10, base: 5.84, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10, residualIncome: true })
    expect(grid.rows[2][2]).toBe(51.9)
  })
})

describe('financial institution detector', () => {
  it('flags mainland ocf files and names that say bank', () => {
    for (const name of ['SHSE-600036', 'SHSE-601398', 'SHSE-601318', 'SHSE-600030', 'SZSE-000001', 'HKSE-01398', 'NYSE-BAC']) {
      expect(loadSnapshot(name).financial_institution, name).toBe(true)
    }
    expect(loadSnapshot('NYSE-BAC').classification_basis).toBe('columns')
  })

  it('flags HK insurers and HSBC by name', () => {
    for (const name of ['HKSE-00005', 'HKSE-01299', 'HKSE-02318', 'HKSE-02601', 'HKSE-02628']) {
      expect(loadSnapshot(name).financial_institution, name).toBe(true)
    }
  })

  it('routes US financials on citable SIC and filing evidence, not missing columns', () => {
    for (const name of ['NYSE-JPM', 'NYSE-MS', 'NYSE-GS', 'NASDAQ-PFG', 'NYSE-APO', 'NYSE-CB', 'NYSE-EG',
      'NYSE-PNC', 'NYSE-PRU', 'NYSE-SYF', 'NYSE-TFC', 'NYSE-USB', 'NYSE-WFC',
      'NYSE-PGR', 'NYSE-TRV', 'NYSE-MET', 'NYSE-AFL', 'NYSE-HIG', 'NYSE-AIG', 'NYSE-ALL', 'NASDAQ-CINF', 'NASDAQ-ACGL', 'NYSE-AIZ']) {
      const stock = loadSnapshot(name)
      expect(stock.financial_institution, name).toBe(true)
      expect(stock.classification_basis, name).toBe('industry')
    }
  })

  it('keeps REITs and refiners on the owner model through industry evidence', () => {
    for (const [name, industry] of [['NYSE-O', 'reit'], ['NYSE-WELL', 'reit'], ['NYSE-PSX', 'refining']]) {
      const stock = loadSnapshot(name)
      expect(stock.financial_institution, name).toBeUndefined()
      expect(stock.industry, name).toBe(industry)
      expect(stock.classification_basis, name).toBe('industry')
      expect(stock.data_gaps, name).toHaveLength(2)
    }
  })

  it('separates missing provider columns from the business classification', () => {
    expect(dataGaps(loadSnapshot('NYSE-O').financials.annual)).toEqual(['operating_income_per_share', 'free_cash_flow_per_share'])
    expect(dataGaps(loadSnapshot('NYSE-CVX').financials.annual)).toEqual(['operating_income_per_share'])
    expect(classify(loadSnapshot('NYSE-O')).basis).toBe('industry')
    expect(classify(loadSnapshot('NYSE-CVX')).basis).toBe('none')
    const unlisted = { exchange_: 'NYSE', symbol: 'X', company: 'Acme', financials: { annual: [{ book_value_per_share: 10 }] } }
    expect(classify(unlisted).basis).toBe('columns')
    expect(isFinancialInstitution(unlisted)).toBe(true)
  })

  it('leaves Hong Kong non-financials and ordinary companies alone', () => {
    for (const name of ['HKSE-00700', 'HKSE-03690', 'HKSE-00941', 'HKSE-00388', 'NASDAQ-AAPL', 'NASDAQ-MSFT', 'NASDAQ-NVDA', 'NASDAQ-GOOGL', 'NYSE-KO', 'NYSE-CVX', 'NYSE-LLY', 'NYSE-TSM', 'NYSE-O', 'NYSE-WELL', 'NYSE-PSX', 'SHSE-600519']) {
      expect(loadSnapshot(name).financial_institution, name).toBeUndefined()
    }
  })

  it('does not route insurance brokers or Loews as underwriting insurers', () => {
    for (const name of ['NYSE-MRSH', 'NYSE-AON', 'NASDAQ-WTW', 'NYSE-L']) {
      const stock = loadSnapshot(name)
      expect(stock.financial_institution, name).toBeUndefined()
      expect(stock.industry, name).not.toBe('insurance')
    }
    const loews = loadSnapshot('NYSE-L')
    expect(loews.classification_basis).toBe('industry')
    expect(loews.industry).toBe('holding-company')
  })

  it('flags life insurers for book-quality disclosure', () => {
    for (const name of ['NYSE-MET', 'NYSE-AFL', 'NYSE-PRU']) {
      expect(classify(loadSnapshot(name)).life, name).toBe(true)
    }
    expect(classify(loadSnapshot('NYSE-PGR')).life).toBeUndefined()
  })

  it('reads annual rows passed apart from a payload that dropped them', () => {
    const annual = [{ book_value_per_share: 10 }]
    const bare = { exchange_: 'NYSE', symbol: 'X', company: 'Acme', financials: {} }
    expect(isFinancialInstitution(bare)).toBe(false)
    expect(isFinancialInstitution(bare, annual)).toBe(true)
  })
})

describe('watchlist and compare share the page model', () => {
  it('prices CMB and ICBC on residual income at 10%', () => {
    // Margin is a number under the public policy (the UI appends the percent sign).
    expect(defaultView(loadFixture('SHSE-600036'), 4)).toEqual({ fairValue: 50.51, mos: 14.63 })
    expect(defaultView(loadFixture('SHSE-601398'), 4)).toEqual({ fairValue: 10.68, mos: 15.17 })
  })

  it('prices JPM on residual income, not the 520.84 owner-earnings annuity', () => {
    expect(defaultView(loadFixture('NYSE-JPM'), 4).fairValue).toBe(142.73)
  })

  it('keeps a Tencent-shaped payload (invest, not flagged) on the owner model', () => {
    const tencent = loadSnapshot('HKSE-00700')
    expect(tencent.cashflow_basis).toBe('invest')
    expect(tencent.financial_institution).toBeUndefined()
    const view = defaultView(tencent, 4)
    expect(view.fairValue).toBeGreaterThan(0)
    expect(view.fairValue).not.toBe(residualIncomeValue(tencent.tangible_book, tencent.ttm_eps_nri, 10, Math.min(tencent.earning_growth_10y ?? 5, 15), 4, 10)?.fairValue)
  })
})
