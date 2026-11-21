import { afterEach, describe, expect, it, vi } from 'vitest'
import * as edgar from '../../src/data/providers/edgar-xbrl'
import * as stockRecord from '../../src/lib/stockRecord'
import { estimateAt } from '../../scripts/research/as-of-valuation.mjs'
import {
  V1_POLICY, V1_POLICY_HASH, classifyV1, policyValueV1,
  presentValueV1, residualIncomeValueV1,
} from '../../scripts/research/kernel-v1.mjs'

afterEach(() => vi.restoreAllMocks())

// The historical studies are public numbers. Their kernel is frozen: CI runs
// these vectors without the 400 MB SEC fact cache, and a full replay with the
// cache must reproduce the committed output byte for byte.
describe('frozen v1 research kernel', () => {
  it('keeps the historical version and hash', () => {
    expect(V1_POLICY).toBe('v1')
    expect(V1_POLICY_HASH).toBe('a39917f214d2e1e60b91480cd1b9398c4a027d6214dc9847239d9bc1cb6721d9')
  })

  it('keeps the owner model numbers the published replay used', () => {
    const result = presentValueV1(0, 10, 10, 4, 2.5, 4, 10, false)
    expect(result).toEqual({ fairValue: 43.33, growthValue: 18.6, terminalValue: 24.73 })
  })

  it('keeps the old terminal gap at the discount rate', () => {
    // v1 only added the continuing value when terminal growth was below the
    // discount rate. Reproducing that gap is the point of the frozen kernel.
    expect(presentValueV1(0, 10, 10, 4, 2.5, 10, 10, false).fairValue).toBe(39.37)
  })

  it('keeps the continuation-only cap used in the v1 release', () => {
    expect(presentValueV1(0, 10, 10, 7, 1.08, 9.99, 10, false).fairValue).toBe(69.92)
  })

  it('keeps the residual income path', () => {
    expect(residualIncomeValueV1(50, 5, 9, 4, 4, 10)).toEqual({ fairValue: 52.03, roe: 10, growth: 4 })
  })

  it('keeps the old routing without the industry evidence table', () => {
    expect(classifyV1({ exchange_: 'NYSE', symbol: 'GS', company: 'Goldman Sachs Group Inc.' }, [{ book_value_per_share: 100 }])).toBe(true)
    expect(classifyV1({ exchange_: 'NYSE', company: 'Acme' }, [{ book_value_per_share: 10 }])).toBe(true)
    expect(classifyV1({ exchange_: 'SHSE', cashflow_basis: 'ocf' }, [])).toBe(true)
    expect(classifyV1({ exchange_: 'NYSE', company: 'Acme' }, [])).toBe(false)
  })

  it('labels its output v1 and routes a bank to residual income', () => {
    const result = policyValueV1({
      exchange_: 'NYSE', symbol: 'GS', company: 'Goldman Sachs Group Inc.', price: '$100',
      ttm_eps_nri: 10, tangible_book: 80, earning_growth_10y: 5, financial_institution: true,
    }, { rate: 3 })
    expect(result.status).toBe('ok')
    expect(result.inputs.model).toBe('residual')
  })

  it('keeps current classifier output out of the historical replay', () => {
    const fields = {
      exchange_: 'NYSE', symbol: 'JPM', company: 'JPMorgan Chase & Co.',
      ttm_eps_nri: 5, tangible_book: 50, earning_growth_10y: 5, eps_as_of: '2015-07-31',
    }
    const annual = [{ date: '2014-12', eps_without_nri: 5, operating_income_per_share: 8, book_value_per_share: 50 }]
    const facts = vi.spyOn(edgar, 'fundamentalsFromFacts')
      .mockReturnValueOnce({ fields, financials: { annual } })
      .mockReturnValueOnce({ fields: { ...fields, financial_institution: true }, financials: { annual } })
    vi.spyOn(stockRecord, 'toStock').mockImplementation(raw => ({ ...raw, financial_institution: true }))
    const replay = () => estimateAt({
      symbol: 'NYSE:JPM', facts: {}, row: { date: '2015-10-30', price: 50, splitFromStart: 1 },
      yieldRate: 3, entryYield: 3,
    })
    expect(replay().model).toBe('owner')
    expect(replay().model).toBe('residual')
    expect(facts).toHaveBeenCalledTimes(2)
  })
})
