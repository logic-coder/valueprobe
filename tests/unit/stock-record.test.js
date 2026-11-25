import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toStock } from '../../src/lib/stockRecord'
import { officialGrowth } from '../../src/lib/assumptions'
import { policyGrowth, policyValue } from '../../src/lib/policy'
import { REASON } from '../../src/lib/reasons'

const read = (symbol) => JSON.parse(readFileSync('public/data/' + symbol.replace(':', '-') + '.json', 'utf8'))

describe('official growth is recomputed from annual series', () => {
  it('walks HSBC past the 2016 trough and publishes a ten-year rate from the annuals', () => {
    const raw = read('HKSE:00005')
    // Vendor 10y (13.16) may be present on the raw snapshot; official growth is still
    // recomputed from the annuals, walking past the 2016 0.57 trough to 2017.
    expect(raw.earning_growth_10y).toBe(13.16)
    const stock = toStock(raw)
    expect(stock.earning_growth_10y).toBeCloseTo((Math.pow(9.9014 / 3.6818, 1 / 8) - 1) * 100, 2)
    expect(policyGrowth(stock.earning_growth_10y).adopted).toBe(stock.earning_growth_10y)
    const value = policyValue(stock, { rate: 5.07 })
    expect(value.reasons).not.toContain(REASON.NO_GROWTH)
    expect(value.inputs.growth).toBe(stock.earning_growth_10y)
  })

  it('does not null Roper after a one-off earnings spike while revenue per share stays up', () => {
    const raw = read('NASDAQ:ROP')
    expect(raw.earning_growth_10y).toBe(9.2)
    const stock = toStock(raw)
    expect(stock.growth_refused?.eps).toBeUndefined()
    expect(stock.earning_growth_10y).toBeGreaterThan(0)
    const value = policyValue(stock, { rate: 5.07 })
    expect(value.reasons).not.toContain(REASON.NO_GROWTH)
    expect(value.inputs.growth).toBe(policyGrowth(stock.earning_growth_10y).adopted)
  })

  it('walks CR Beer and Li Ning forward from 2016, not back to 2010 or 2006', () => {
    const beer = toStock(read('HKSE:00291'))
    expect(beer.earning_growth_10y).toBeCloseTo((Math.pow(1.2241 / 0.2589, 1 / 9) - 1) * 100, 2)
    expect(beer.earning_growth_10y).not.toBe(-4.29)
    const lining = toStock(read('HKSE:02331'))
    expect(lining.earning_growth_10y).toBeCloseTo((Math.pow(1.3362 / 0.3407, 1 / 9) - 1) * 100, 2)
    expect(lining.earning_growth_10y).not.toBe(7.6)
    expect(policyGrowth(beer.earning_growth_10y).adopted).toBe(15)
    expect(policyGrowth(lining.earning_growth_10y).adopted).toBe(15)
    const official = officialGrowth({ growth10: lining.earning_growth_10y, growth5: lining.earning_growth_5y, hasPositiveBase: true })
    expect(official.adopted).toBeCloseTo(10.92, 2)
    expect(official.window).toBe('5y')
    expect(official.highGrowth).toBe(15)
    expect(lining.earning_growth_5y).toBeCloseTo(10.92, 2)
    const value = policyValue(lining, { rate: 5.07 })
    expect(value.inputs.growth).toBeCloseTo(10.92, 2)
  })
})
