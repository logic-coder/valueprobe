import { describe, expect, it } from 'vitest'
import { officialGrowth, MAX_UNDERWRITTEN_GROWTH, windowsConflict } from '../../src/lib/assumptions'
import { buildDefaults, residualIncomeValue, presentValue } from '../../src/lib/dcf'
import { policyValue } from '../../src/lib/policy'
import { WARNING } from '../../src/lib/reasons'

describe('officialGrowth window rules', () => {
  it('takes the slower of two windows as the point estimate and exposes the faster one for the band only', () => {
    const info = officialGrowth({ growth10: 15, growth5: 14, hasPositiveBase: true })
    expect(info.adopted).toBe(14)
    expect(info.window).toBe('5y')
    expect(info.fasterWindowRate).toBe(15)
    expect(info.usedSlowerWindow).toBe(true)
    expect(info.cap).toBe(MAX_UNDERWRITTEN_GROWTH)
    expect(info.warnings).not.toContain(WARNING.CAPPED_GROWTH)
    expect(info.warnings).not.toContain(WARNING.SHORT_HISTORY)
    expect(info.zeroTerminal).toBe(false)
    expect(info.regimeUncertain).toBe(false)
  })

  it('caps each window at 15% and underwrites the slower capped rate', () => {
    const info = officialGrowth({ growth10: 16.4, growth5: 10.92, hasPositiveBase: true })
    expect(info.adopted).toBe(10.92)
    expect(info.window).toBe('5y')
    expect(info.fasterWindowRate).toBe(15)
    expect(info.warnings).toContain(WARNING.CAPPED_GROWTH)
    expect(info.regimeUncertain).toBe(false)
  })

  it('keeps a five-year-only window under the 15% cap and flags short history without a 10% cap', () => {
    const info = officialGrowth({ growth5: 13.45, hasPositiveBase: true })
    expect(info.adopted).toBe(13.45)
    expect(info.window).toBe('5y')
    expect(info.cap).toBe(MAX_UNDERWRITTEN_GROWTH)
    expect(info.warnings).toEqual([WARNING.SHORT_HISTORY])
    expect(info.zeroTerminal).toBe(false)
  })

  it('starts at 0% and keeps the default terminal when the ten-year window is negative', () => {
    const info = officialGrowth({ growth10: -5, growth5: 12, hasPositiveBase: true })
    expect(info.adopted).toBe(0)
    expect(info.historical5).toBe(12)
    expect(info.window).toBe('10y')
    expect(info.reason).toBe('zeroed')
    expect(info.zeroTerminal).toBe(false)
    expect(info.regimeUncertain).toBe(true)
    expect(info.warnings).toEqual([WARNING.REGIME_UNCERTAIN])
    expect(info.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
    expect(info.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_GROWTH)
  })

  it('starts at 0% for a five-year-only negative history, flags short history, and does not zero the terminal', () => {
    const info = officialGrowth({ growth5: -9.78, hasPositiveBase: true })
    expect(info.adopted).toBe(0)
    expect(info.zeroTerminal).toBe(false)
    expect(info.regimeUncertain).toBe(true)
    expect(info.warnings).toContain(WARNING.SHORT_HISTORY)
    expect(info.warnings).toContain(WARNING.REGIME_UNCERTAIN)
    expect(info.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
  })

  it('floors an Intel-style negative window to 0% and keeps it as the slower window', () => {
    const info = officialGrowth({ growth10: 10.73, growth5: -1.5, hasPositiveBase: true })
    expect(windowsConflict(10.73, -1.5)).toBe(true)
    expect(info.adopted).toBe(0)
    expect(info.window).toBe('5y')
    expect(info.fasterWindowRate).toBe(10.73)
    expect(info.reason).toBe('zeroed')
    expect(info.zeroTerminal).toBe(false)
    expect(info.regimeUncertain).toBe(true)
    expect(info.windowConflict).toBe(true)
    expect(info.warnings).toEqual([WARNING.REGIME_UNCERTAIN])
  })

  it('does not mark a same-sign gap as a regime and keeps the faster window only for the band', () => {
    expect(windowsConflict(13.18, 35.27)).toBe(false)
    const info = officialGrowth({ growth10: 13.18, growth5: 35.27, hasPositiveBase: true })
    expect(info.adopted).toBe(13.18)
    expect(info.window).toBe('10y')
    expect(info.fasterWindowRate).toBe(15)
    expect(info.usedSlowerWindow).toBe(true)
    expect(info.regimeUncertain).toBe(false)
    expect(info.windowConflict).toBe(false)
    expect(info.warnings).toContain(WARNING.CAPPED_GROWTH)
    expect(info.warnings).not.toContain(WARNING.REGIME_UNCERTAIN)
  })

  it('still marks both-negative windows as a regime even when the signs agree', () => {
    const info = officialGrowth({ growth10: -22.37, growth5: -47.59, hasPositiveBase: true })
    expect(windowsConflict(-22.37, -47.59)).toBe(false)
    expect(info.adopted).toBe(0)
    expect(info.regimeUncertain).toBe(true)
    expect(info.warnings).toContain(WARNING.REGIME_UNCERTAIN)
  })

  it('starts at 0% and keeps the default terminal when there is no window but a positive base', () => {
    const info = officialGrowth({ hasPositiveBase: true })
    expect(info.adopted).toBe(0)
    expect(info.window).toBe('none')
    expect(info.reason).toBe('no-window')
    expect(info.zeroTerminal).toBe(false)
    expect(info.warnings).toEqual([WARNING.SHORT_HISTORY, WARNING.NO_WINDOW_ZERO_START])
  })

  it('stays empty when there is no window and no positive base', () => {
    const info = officialGrowth({ hasPositiveBase: false })
    expect(info.adopted).toBeNull()
    expect(info.reason).toBe('missing')
    expect(info.warnings).toEqual([])
  })
})

describe('policyValue and buildDefaults share officialGrowth', () => {
  it('uses a 0% start and the default 4% terminal for negative history', () => {
    const stock = {
      exchange_: 'NYSE', symbol: 'GPC', currency: '$', ttm_eps: 5, earnings_base: 5,
      earning_growth_10y: -22.37, earning_growth_5y: -47.59, price: '$10', _as_of: '2026-11-18',
    }
    const value = policyValue(stock, { rate: 5.07 })
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBe(0)
    expect(value.inputs.terminalGrowthRate).toBe(4)
    expect(value.inputs.growth10).toBe(-22.37)
    expect(value.inputs.growth5).toBe(-47.59)
    expect(value.warnings).toContain(WARNING.REGIME_UNCERTAIN)
    expect(value.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
    expect(value.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_GROWTH)
    expect(value.band.mid).toBe(value.value)
    const seed = buildDefaults(5.07, stock, 0)
    expect(seed.dcfForm.growthRate).toBe(0)
    expect(seed.dcfForm.terminalGrowthRate).toBe(4)
    expect(presentValue(null, 10, 12, 0, 5, 4, 10, false).fairValue).toBeCloseTo(value.value, 2)
  })

  it('seeds a 0% start and a 4% terminal when the only fact is a positive base', () => {
    const stock = { ttm_eps: 1, earnings_base: 1, price: '1' }
    const seed = buildDefaults(4, stock, 1)
    expect(seed.dcfForm.growthRate).toBe(0)
    expect(seed.dcfForm.terminalGrowthRate).toBe(4)
    const value = policyValue({ exchange_: 'NYSE', symbol: 'X', currency: '$', ...stock, _as_of: '2026-11-18' }, { rate: 5.07 })
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBe(0)
    expect(value.inputs.terminalGrowthRate).toBe(4)
    expect(value.warnings).toContain(WARNING.NO_WINDOW_ZERO_START)
    expect(value.inputs.growth).toBe(seed.dcfForm.growthRate)
    expect(value.inputs.terminalGrowthRate).toBe(seed.dcfForm.terminalGrowthRate)
  })

  it('does not invent a 0% start from a cash-only base with no reported EPS', () => {
    const stock = { exchange_: 'NYSE', symbol: 'V', currency: '$', earnings_base: 11.49, cash_base: 11.49, price: '$300', _as_of: '2026-11-18' }
    const value = policyValue(stock, { rate: 5.07 })
    expect(value.status).toBe('refused')
    expect(value.inputs.growth).toBeNull()
    expect(buildDefaults(5.07, stock, 11.49).dcfForm.growthRate).toBeNull()
  })
})

describe('residual income still accepts a zero terminal input', () => {
  it('computes a finite value when official growth and terminal are both zero', () => {
    expect(residualIncomeValue(50, 5, 12, 0, 0, 10).fairValue).toBeGreaterThan(0)
  })
})
