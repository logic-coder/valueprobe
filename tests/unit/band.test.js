import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enduringBookValue, envelopeScenarios, orderBand, residualIncomeBand, residualIncomeValue, presentValue, valueBand } from '../../src/lib/dcf'
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

  it('keeps the ICBC headline inside a residual envelope around the official path', () => {
    const stock = toStock(read('public/data/SHSE-601398.json'))
    const value = policyValue(stock, { rates: cnyRate, generatedAt: artifact.generatedAt })
    const inputs = value.inputs
    const at = (rate, growth = inputs.growth) => residualIncomeValue(inputs.tangibleBook, inputs.eps, rate, growth, inputs.terminalGrowthRate, inputs.years).fairValue
    expect(value.band.mid).toBe(value.value)
    expect(value.inputs.growth).toBeCloseTo(Math.min(value.inputs.growth10, value.inputs.growth5), 2)
    expect(value.band.low).toBe(at(inputs.discountRate + 2))
    expect(value.band.high).toBeGreaterThanOrEqual(at(inputs.discountRate - 2))
    expect(value.band.low).toBeLessThan(value.value)
    expect(value.band.high).toBeGreaterThan(value.value)
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

describe('scenario envelope around a centered mid', () => {
  const base = {
    tbv: 10, base: 5, discountRate: 12, growthRate: 10, terminalGrowthRate: 4,
    years: 10, yearsOfTerminalGrowth: 10, addToFairValue: false, bandSpread: 2, growthCap: 15,
  }

  it('keeps mid equal to the official point estimate, not the arithmetic middle of an asymmetric envelope', () => {
    const input = { ...base, window: '10y', growth5: -4, regimeUncertain: true }
    const mid = presentValue(input.tbv, input.years, 12, 10, 5, 4, 10, false).fairValue
    const band = valueBand(input)
    expect(band.mid).toBe(mid)
    expect(band.low).toBeLessThan(band.mid)
    expect(band.high).toBeGreaterThan(band.mid)
    const arithmetic = (band.low + band.high) / 2
    expect(band.mid).not.toBeCloseTo(arithmetic, 2)
  })

  it('includes a 0% terminal on the low side when the regime is uncertain, and covers a lower five-year window', () => {
    const input = { ...base, window: '10y', growth5: -4, regimeUncertain: true }
    const scenes = envelopeScenarios(input)
    expect(scenes.low.some((scene) => scene.terminal === 0 && scene.growth === 0)).toBe(true)
    const decline = presentValue(10, 10, 14, 0, 5, 0, 10, false).fairValue
    expect(valueBand(input).low).toBe(decline)
  })

  it('uses official growth minus two points on the low side, not a 0% growth stress, for steady positive history', () => {
    const input = { ...base, growthRate: 15, window: '10y', growth5: 9.87, regimeUncertain: false }
    const scenes = envelopeScenarios(input)
    expect(scenes.low.every((scene) => scene.growth !== 0)).toBe(true)
    expect(scenes.low.some((scene) => scene.growth === 13 && scene.discount === 14 && scene.terminal === 4)).toBe(true)
    const low = presentValue(10, 10, 14, 13, 5, 4, 10, false).fairValue
    const zeroed = presentValue(10, 10, 14, 0, 5, 4, 10, false).fairValue
    expect(valueBand(input).low).toBe(low)
    expect(valueBand(input).low).toBeGreaterThan(zeroed)
  })

  it('still trims official growth by two points on the low side when the official start is at the 15% cap', () => {
    const input = { ...base, growthRate: 15, window: '10y', growth5: 17.4, regimeUncertain: false }
    const scenes = envelopeScenarios(input)
    expect(scenes.high.every((scene) => scene.growth === 15)).toBe(true)
    expect(scenes.low.some((scene) => scene.growth === 13 && scene.discount === 14)).toBe(true)
    const low = presentValue(10, 10, 14, 13, 5, 4, 10, false).fairValue
    expect(valueBand(input).low).toBe(low)
  })

  it('keeps a positive five-year-only history on a ±2-point envelope around the official start, not a jump back to an unused 15% path', () => {
    const input = { ...base, growthRate: 13.45, window: '5y', growth5: 13.45, regimeUncertain: false }
    const mid = presentValue(10, 10, 12, 13.45, 5, 4, 10, false).fairValue
    const band = valueBand(input)
    expect(band.mid).toBe(mid)
    const high = presentValue(10, 10, Math.max(10, 4 + 2), 15, 5, 4, 10, false).fairValue
    expect(band.high).toBe(high)
    const low = presentValue(10, 10, 14, 11.45, 5, 4, 10, false).fairValue
    expect(band.low).toBe(low)
    const same = valueBand({ ...input, window: '10y', growthRate: 13.45, growth5: 13.45 })
    expect(band.high).toBe(same.high)
  })

  it('does not reopen a 15% high when official growth is already well below the cap', () => {
    const input = { ...base, growthRate: 2.99, window: '5y', growth5: 2.99, growth10: 3.85, regimeUncertain: false }
    const scenes = envelopeScenarios(input)
    expect(scenes.high.every((scene) => scene.growth <= 4.99 + 1e-9)).toBe(true)
    expect(scenes.high.some((scene) => scene.growth === 4.99)).toBe(true)
    const invented = presentValue(10, 10, Math.max(10, 4 + 2), 15, 5, 4, 10, false).fairValue
    expect(valueBand(input).high).toBeLessThan(invented)
    expect(valueBand(input).mid).toBe(presentValue(10, 10, 12, 2.99, 5, 4, 10, false).fairValue)
  })

  it('does not invent a 15% high when a five-year-only history has already been zeroed', () => {
    const input = { ...base, growthRate: 0, window: '5y', growth5: -9.78, regimeUncertain: true }
    const scenes = envelopeScenarios(input)
    expect(scenes.high.every((scene) => scene.growth === 0)).toBe(true)
    const high = presentValue(10, 10, Math.max(10, 4 + 2), 0, 5, 4, 10, false).fairValue
    const invented = presentValue(10, 10, Math.max(10, 4 + 2), 15, 5, 4, 10, false).fairValue
    expect(valueBand(input).high).toBe(high)
    expect(valueBand(input).high).toBeLessThan(invented)
  })

  it('does not invent a 15% high for a ten-year negative history', () => {
    const input = { ...base, growthRate: 0, window: '10y', growth5: -47.59, regimeUncertain: true }
    expect(envelopeScenarios(input).high.every((scene) => scene.growth === 0)).toBe(true)
  })
})

