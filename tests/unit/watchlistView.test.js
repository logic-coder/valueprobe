import { describe, expect, it } from 'vitest'
import { defaultView } from '../../src/lib/watchlistView'
import fixture from '../../src/data/bundled/stock_icbc.json'

describe('watchlist default view', () => {
  it('reproduces the public policy value for a real payload', () => {
    const view = defaultView(fixture, 6) // 6 + 6 is the page's 12% seed in the specs
    expect(view.fairValue).toBe(13.49)
    expect(view.mos).toBeCloseTo(34.4, 1)
  })

  it('keeps a value when the price is missing and only drops the margin', () => {
    const view = defaultView({ ttm_eps: 1.08, earning_growth_10y: 3, tangible_book: 11.24 })
    expect(view.fairValue).toBeGreaterThan(0)
    expect(view.mos).toBeNull()
  })

  it('degrades when the policy refuses the record', () => {
    expect(defaultView({ price: '¥ 9.00', ttm_eps: 0 })).toEqual({ fairValue: null, mos: null })
    expect(defaultView(null)).toEqual({ fairValue: null, mos: null })
  })
})
