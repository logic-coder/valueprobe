import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enduringBookValue, orderBand, residualIncomeBand, residualIncomeValue, valueBand } from '../../src/lib/dcf'
import { POLICY_VERSION, policyValue } from '../../src/lib/policy'
import { toStock } from '../../src/lib/stockRecord'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const artifact = read('public/data/intrinsic/' + POLICY_VERSION + '.json')
const rates = read('public/data/rates.json')
const cnyRate = { CNY: { value: rates.CNY.value, asOf: rates.CNY.as_of, source: 'snapshot' } }
const clear = { tbv: 100, base: 10, growthRate: 4, terminalGrowthRate: 4, years: 10 }

describe('residual band uses one model and the discount rate only', () => {
  it('keeps the base case as mid and rejects the enduring-book fourth model', () => {
    const input = { tbv: 46.87, base: 5.84, discountRate: 10, growthRate: 9.44, terminalGrowthRate: 4, years: 10 }
    const band = valueBand({ ...input, residual: true })
    expect(band.mid).toBe(residualIncomeValue(input.tbv, input.base, 10, 9.44, 4, 10).fairValue)
    expect(band.low).toBeLessThan(band.mid)
    expect(band.high).toBeGreaterThan(band.mid)
    expect(band.high).not.toBe(enduringBookValue(input.tbv, input.base, 10, 9.44, 4))
  })

  it('orders the band whether the return is above, at, or below the discount rate', () => {
    const above = residualIncomeBand({ ...clear, base: 12, discountRate: 10 })
    const equal = residualIncomeBand({ ...clear, base: 10, discountRate: 10 })
    const below = residualIncomeBand({ ...clear, base: 8, discountRate: 10 })
    expect(above.mid).toBeGreaterThan(100)
    expect(equal.mid).toBe(100)
    expect(below.mid).toBeLessThan(100)
    for (const band of [above, equal, below]) {
      expect(band.low).toBeLessThan(band.mid)
      expect(band.high).toBeGreaterThan(band.mid)
    }
  })

  it('leaves a missing endpoint when the eased rate has no value and keeps no fake width', () => {
    const oneSided = residualIncomeBand({ ...clear, base: 12, discountRate: 1 })
    expect(oneSided.mid).toBeGreaterThan(0)
    expect(oneSided.high).toBeNull()
    expect(residualIncomeBand({ ...clear, discountRate: 10, bandSpread: 0 })).toEqual({ low: null, mid: 100, high: null })
  })

  it('collapses equal endpoints instead of widening them', () => {
    expect(orderBand(10, 10, 10)).toEqual({ low: null, mid: 10, high: null })
    expect(orderBand(11, 10, 9)).toEqual({ low: 9, mid: 10, high: 11 })
  })
})

describe('policy publishes the residual band without moving the headline', () => {
  it('keeps mid equal to the published value', () => {
    const stock = toStock(read('public/data/SHSE-601398.json'))
    const value = policyValue(stock, { rates: cnyRate, generatedAt: artifact.generatedAt })
    expect(value.band.mid).toBe(value.value)
    expect(value.value).toBe(artifact.entries['SHSE:601398'].value)
  })

  it('places the published endpoints two points either side of the base rate', () => {
    const stock = toStock(read('public/data/SHSE-601398.json'))
    const value = policyValue(stock, { rates: cnyRate, generatedAt: artifact.generatedAt })
    const inputs = value.inputs
    const at = (rate) => residualIncomeValue(inputs.tangibleBook, inputs.eps, rate, inputs.growth, inputs.terminalGrowthRate, inputs.years).fairValue
    expect(value.band.low).toBe(at(inputs.discountRate + 2))
    expect(value.band.high).toBe(at(inputs.discountRate - 2))
  })

  it('gives no residual entry a high equal to its value', () => {
    for (const entry of Object.values(artifact.entries)) {
      if (entry.inputs.model !== 'residual' || entry.status !== 'ok') continue
      const inputs = entry.inputs
      const band = residualIncomeBand({ tbv: inputs.tangibleBook, base: inputs.eps, discountRate: inputs.discountRate, growthRate: inputs.growth, terminalGrowthRate: inputs.terminalGrowthRate, years: inputs.years, bandSpread: 2 })
      expect(band.mid, entry.symbol).toBe(entry.value)
      if (band.high !== null) expect(band.high, entry.symbol).toBeGreaterThan(entry.value)
      if (band.high === null) expect(entry.value).toBe(band.mid)
    }
  })
})
