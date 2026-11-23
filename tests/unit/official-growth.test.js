import { describe, expect, it } from 'vitest'
import { officialGrowth, MAX_UNDERWRITTEN_GROWTH, SHORT_HISTORY_GROWTH_CAP } from '../../src/lib/assumptions'
import { buildDefaults, residualIncomeValue, presentValue } from '../../src/lib/dcf'
import { policyValue } from '../../src/lib/policy'
import { WARNING } from '../../src/lib/reasons'

describe('officialGrowth window rules', () => {
  it('uses the five-year window as a 15% confirmation cap, not the short-history 10% cap', () => {
    const info = officialGrowth({ growth10: 15, growth5: 14, hasPositiveBase: true })
    expect(info.adopted).toBe(14)
    expect(info.window).toBe('10y')
    expect(info.cap).toBe(MAX_UNDERWRITTEN_GROWTH)
    expect(info.warnings).not.toContain(WARNING.CAPPED_GROWTH)
    expect(info.warnings).not.toContain(WARNING.SHORT_HISTORY)
    expect(info.zeroTerminal).toBe(false)
  })

  it('does not cut a confirming five-year rate of 14 to 10', () => {
    expect(officialGrowth({ growth10: 15, growth5: 14 }).adopted).not.toBe(SHORT_HISTORY_GROWTH_CAP)
  })

  it('caps only the five-year official window at 10% and flags short history', () => {
    const info = officialGrowth({ growth5: 13.45, hasPositiveBase: true })
    expect(info.adopted).toBe(10)
    expect(info.window).toBe('5y')
    expect(info.cap).toBe(SHORT_HISTORY_GROWTH_CAP)
    expect(info.warnings).toEqual([WARNING.SHORT_HISTORY, WARNING.CAPPED_GROWTH])
    expect(info.zeroTerminal).toBe(false)
  })

  it('zeros a negative ten-year window even when the five-year rate is positive', () => {
    const info = officialGrowth({ growth10: -5, growth5: 12, hasPositiveBase: true })
    expect(info.adopted).toBe(0)
    expect(info.historical5).toBe(12)
    expect(info.window).toBe('10y')
    expect(info.reason).toBe('zeroed')
    expect(info.zeroTerminal).toBe(true)
    expect(info.warnings).toEqual([WARNING.NEGATIVE_HISTORY_ZEROED])
    expect(info.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_GROWTH)
  })

  it('zeros a five-year-only negative history and flags short history', () => {
    const info = officialGrowth({ growth5: -9.78, hasPositiveBase: true })
    expect(info.adopted).toBe(0)
    expect(info.zeroTerminal).toBe(true)
    expect(info.warnings).toContain(WARNING.SHORT_HISTORY)
    expect(info.warnings).toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
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
  it('passes a 0% terminal into the kernel for negative history and does not change the kernel', () => {
    const stock = {
      exchange_: 'NYSE', symbol: 'GPC', currency: '$', ttm_eps: 5, earnings_base: 5,
      earning_growth_10y: -22.37, earning_growth_5y: -47.59, price: '$10', _as_of: '2026-11-18',
    }
    const value = policyValue(stock, { rate: 5.07 })
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBe(0)
    expect(value.inputs.terminalGrowthRate).toBe(0)
    expect(value.inputs.growth10).toBe(-22.37)
    expect(value.inputs.growth5).toBe(-47.59)
    expect(value.warnings).toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
    expect(value.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_GROWTH)
    const seed = buildDefaults(5.07, stock, 0)
    expect(seed.dcfForm.growthRate).toBe(0)
    expect(seed.dcfForm.terminalGrowthRate).toBe(0)
    expect(presentValue(null, 10, 12, 0, 5, 0, 10, false).fairValue).toBeCloseTo(value.value, 2)
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
