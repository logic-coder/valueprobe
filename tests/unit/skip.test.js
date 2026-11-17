import { describe, expect, it } from 'vitest'
import { FetchDiagnostics, SkipReason } from '../../src/data/skip'

describe('fetch diagnostics', () => {
  it('records skips, errors and the winning source', () => {
    const diagnostics = new FetchDiagnostics()
    diagnostics.recordSkip('edgar', SkipReason.MARKET_NOT_COVERED)
    diagnostics.recordError('eastmoney', 'timeout')
    diagnostics.recordSuccess('eastmoney')
    expect(diagnostics.hasSuccess).toBe(true)
    expect(diagnostics.usedFallback).toBe(true)
    expect(diagnostics.summary()).toContain('eastmoney: SUCCESS')
  })

  it('does not flag a first-try success as a fallback', () => {
    const diagnostics = new FetchDiagnostics()
    diagnostics.recordSuccess('eastmoney')
    expect(diagnostics.usedFallback).toBe(false)
  })

  it('localises skip reasons for the UI', () => {
    const diagnostics = new FetchDiagnostics()
    diagnostics.recordSkip('edgar', SkipReason.MARKET_NOT_COVERED)
    expect(diagnostics.skips[0].label).toBe('不覆盖该市场')
    expect(diagnostics.errors).toEqual([])
  })
})
