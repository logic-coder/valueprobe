import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultView, publishedRow } from '../../src/lib/watchlistView'
import { policyValue } from '../../src/lib/policy'
import { toStock } from '../../src/lib/stockRecord'

describe('watchlist default view', () => {
  it('reproduces the public policy value for a real payload', () => {
    const rates = JSON.parse(readFileSync('public/data/rates.json', 'utf8'))
    const stock = toStock(JSON.parse(readFileSync('public/data/SHSE-601398.json', 'utf8')))
    const view = defaultView(stock, rates.CNY.value)
    const value = policyValue(stock, { rate: rates.CNY.value, generatedAt: '2026-11-23' })
    expect(view.fairValue).toBe(value.value)
    expect(view.mos).toBe(value.marginOfSafety)
    expect(view.fairValue).toBeGreaterThan(0)
  })

  it('keeps a value when the price is missing and only drops the margin', () => {
    const view = defaultView({ exchange_: 'NYSE', symbol: 'X', currency: '$', reporting_currency: 'USD', per_share_currency: 'USD', earnings_base: 1.08, ttm_eps: 1.08, earning_growth_10y: 3, tangible_book: 11.24 })
    expect(view.fairValue).toBeGreaterThan(0)
    expect(view.mos).toBeNull()
  })

  it('degrades when the policy refuses the record', () => {
    expect(defaultView({ price: '¥ 9.00', ttm_eps: 0 })).toEqual({ fairValue: null, mos: null })
    expect(defaultView(null)).toEqual({ fairValue: null, mos: null })
  })
})


it('uses the released estimate and reference quote even if a separate stock fetch differs', () => {
  const stockRow = { name: 'ICBC', currency: '¥', price: 8.85, pe: 8.2, asOf: '2026-09-30' }
  const released = {
    name: '工商银行', price: 9.03, priceDate: null, asOf: '2026-11-19',
    inputs: { currency: 'CNY' }, value: 11.86, marginOfSafety: 23.86, reasons: [],
  }
  expect(publishedRow(stockRow, released, String)).toMatchObject({
    name: '工商银行', currency: '¥', price: 9.03, fairValue: 11.86, mos: 23.86,
    pe: null, quoteNote: 'quote_unknown',
  })
  expect(publishedRow(stockRow, null, String, true)).toMatchObject({
    fairValue: null, mos: null, policyNote: 'official_load_failed',
  })
})
