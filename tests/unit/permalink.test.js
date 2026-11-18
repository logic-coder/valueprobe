import { describe, expect, it } from 'vitest'
import { decodeState, encodeModel, encodeState, isPresetEmpty } from '../../src/lib/permalink'

const defaults = {
  dcfForm: { eps: 1.08, freecashflow: 2.5, years: 10, discountRate: 12, growthRate: 5, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10 },
  dcfResultForm: { stockPrice: '7.10', tbv: 11.24, addToFairValue: false },
}
const form = { ...defaults.dcfForm }
const result = { ...defaults.dcfResultForm }

describe('permalink', () => {
  it('keeps only the values that moved away from the defaults', () => {
    expect(encodeState(form, result, 'eps', defaults)).toEqual({})
    expect(encodeState({ ...form, discountRate: 15 }, result, 'eps', defaults)).toEqual({ r: 15 })
  })

  it('carries the basis and the tangible book switch', () => {
    expect(encodeState(form, { ...result, addToFairValue: true }, 'freecashflow', defaults)).toEqual({ b: 'fcf', tbv1: '1' })
  })

  it('round-trips a full set of overrides', () => {
    const encoded = encodeState(
      { ...form, years: 8, growthRate: 7.25, freecashflowGrowthRate: 6.5, terminalGrowthRate: 3 },
      { ...result, stockPrice: 6.6, tbv: 10 },
      'freecashflow',
      defaults,
    )
    expect(decodeState(encoded)).toEqual({
      form: { years: 8, growthRate: 7.25, freecashflowGrowthRate: 6.5, terminalGrowthRate: 3 },
      result: { stockPrice: 6.6, tbv: 10 },
      basis: 'freecashflow',
      tbvIn: undefined,
      model: undefined,
    })
  })

  it('drops junk and keeps whole years', () => {
    const preset = decodeState({ r: 'abc', g: '', eps: '2', y: '8.6', tgy: '-3', b: 'eps' })
    expect(preset.form).toEqual({ eps: 2, years: 9, yearsOfTerminalGrowth: 0 })
    expect(preset.basis).toBeUndefined()
  })

  it('takes the first entry when a parameter repeats', () => {
    expect(decodeState({ r: ['14', '20'] }).form).toEqual({ discountRate: 14 })
  })

  it('keeps a model only when it differs from the suggestion', () => {
    expect(encodeModel('residual', 'residual')).toBeUndefined()
    expect(encodeModel('owner', 'residual')).toBe('oe')
    expect(decodeState({ m: 'ri' }).model).toBe('residual')
    expect(decodeState({ m: 'oe' }).model).toBe('owner')
    expect(isPresetEmpty(decodeState({ m: 'oe' }))).toBe(false)
  })

  it('recognises an empty preset', () => {
    expect(isPresetEmpty(decodeState({}))).toBe(true)
    expect(isPresetEmpty(decodeState({ r: 14 }))).toBe(false)
  })
})
