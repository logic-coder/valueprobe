import { describe, expect, it } from 'vitest'
import { defaultView } from '../../src/lib/watchlistView'
import fixture from '../../src/data/bundled/stock_icbc.json'

describe('watchlist default view', () => {
  it('reproduces the stock page defaults for a real payload', () => {
    const view = defaultView(fixture, 6) // 6 + 6 is the page's 12% seed in the specs
    expect(view.fairValue).toBe(13.49)
    expect(view.mos).toBe('34.40')
  })

  it('degrades when the price is missing', () => {
    expect(defaultView({ ttm_eps: 1 })).toEqual({ fairValue: null, mos: null })
    expect(defaultView(null)).toEqual({ fairValue: null, mos: null })
  })

  it('degrades when the fair value cannot be computed', () => {
    expect(defaultView({ price: '¥ 9.00', ttm_eps: 0 })).toEqual({ fairValue: null, mos: null })
  })
})
