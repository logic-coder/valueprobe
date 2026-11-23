import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toStock } from '../../src/lib/stockRecord'
import { policyGrowth, policyValue } from '../../src/lib/policy'
import { REASON } from '../../src/lib/reasons'

const read = (symbol) => JSON.parse(readFileSync('public/data/' + symbol.replace(':', '-') + '.json', 'utf8'))

describe('official growth is recomputed from annual series', () => {
  it('walks HSBC past the 2016 trough and publishes a ten-year rate from the annuals', () => {
    const raw = read('HKSE:00005')
    expect(raw.earning_growth_10y).toBeNull()
    const stock = toStock(raw)
    expect(stock.earning_growth_10y).toBeCloseTo((Math.pow(9.9267 / 3.6912, 1 / 8) - 1) * 100, 2)
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
})
