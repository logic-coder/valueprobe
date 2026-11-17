import { describe, expect, it } from 'vitest'
import { applyScenario } from '../../src/lib/scenarios'

const base = { discountRate: 12, growthRate: 5, terminalGrowthRate: 4 }

describe('scenario presets', () => {
  it('returns the base untouched for the base key', () => {
    expect(applyScenario(base, 'base')).toEqual(base)
  })

  it('trades growth up for a lower rate in the bull case', () => {
    expect(applyScenario(base, 'bull')).toEqual({ discountRate: 11, growthRate: 7, terminalGrowthRate: 5 })
  })

  it('trades growth down for a higher rate in the bear case', () => {
    expect(applyScenario(base, 'bear')).toEqual({ discountRate: 13, growthRate: 3, terminalGrowthRate: 3 })
  })

  it('clamps the discount rate into the accepted range', () => {
    expect(applyScenario({ ...base, discountRate: 50 }, 'bear').discountRate).toBe(50)
    expect(applyScenario({ ...base, discountRate: 0 }, 'bull').discountRate).toBe(0)
  })

  it('survives missing numbers', () => {
    expect(applyScenario({}, 'bull')).toEqual({ discountRate: 0, growthRate: 2, terminalGrowthRate: 1 })
  })
})
