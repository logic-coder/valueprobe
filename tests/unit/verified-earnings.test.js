import { describe, expect, it } from 'vitest'
import { applyVerifiedEarnings, verifiedQuoteFactor } from '../../scripts/lib/verified-earnings.mjs'
import { scaleSnapshotRecord } from '../../src/data/providers/edgar-xbrl.js'

describe('verified depositary ratios', () => {
  it('keeps the existing TSM and BRK.B factors', () => {
    expect(verifiedQuoteFactor('NYSE:TSM')).toBe(0.2)
    expect(verifiedQuoteFactor('NYSE:BRK.B')).toBe(1)
  })

  it('maps checked non-1:1 receipts onto the TSM quote-factor path', () => {
    expect(verifiedQuoteFactor('NYSE:UMC')).toBe(0.2)
    expect(verifiedQuoteFactor('NYSE:PBR')).toBe(0.5)
    expect(verifiedQuoteFactor('NYSE:AMX')).toBe(0.05)
    expect(verifiedQuoteFactor('NYSE:CHT')).toBe(0.1)
    expect(verifiedQuoteFactor('NYSE:CX')).toBeCloseTo(1 / 30, 10)
    expect(verifiedQuoteFactor('NASDAQ:BZ')).toBe(0.5)
    expect(verifiedQuoteFactor('NYSE:VIPS')).toBe(5)
    expect(verifiedQuoteFactor('NYSE:TS')).toBe(0.5)
  })

  it('does not invent a ratio for 1:1 names, non-ADRs, or unchecked tickers', () => {
    expect(verifiedQuoteFactor('NYSE:EQNR')).toBeNull()
    expect(verifiedQuoteFactor('NASDAQ:GRAB')).toBeNull()
    expect(verifiedQuoteFactor('NYSE:SE')).toBeNull()
    expect(verifiedQuoteFactor('NYSE:TEVA')).toBeNull()
    expect(verifiedQuoteFactor('NASDAQ:AAPL')).toBeNull()
  })

  it('does not let a ratio-only row overwrite earnings', () => {
    const record = {
      exchange_: 'NYSE',
      symbol: 'UMC',
      ttm_eps: 0.12,
      ttm_eps_nri: 0.12,
      eps_as_of: '2024-12-31',
      financials: { annual: [{ date: '2024-12', eps_without_nri: 0.12 }] },
    }
    const next = applyVerifiedEarnings(record)
    expect(next).toBe(record)
    expect(next.ttm_eps).toBe(0.12)
  })

  it('still overlays a checked TSM filing EPS', () => {
    const record = {
      exchange_: 'NYSE',
      symbol: 'TSM',
      ttm_eps: 6.8,
      eps_as_of: '2024-12-31',
      financials: { annual: [{ date: '2024-12', eps_without_nri: 6.8 }] },
    }
    const next = applyVerifiedEarnings(record)
    expect(next.ttm_eps).toBe(10.65)
    expect(next.eps_as_of).toBe('2025-12-31')
  })

  it('scales a snapshot up for a multi-share ADS and down for a fraction', () => {
    const umc = scaleSnapshotRecord({ ttm_eps: 0.12, financials: { annual: [{ date: '2024-12', eps_without_nri: 0.12 }] } }, 0.2)
    expect(umc.ttm_eps).toBe(0.6)
    const vips = scaleSnapshotRecord({ ttm_eps: 10.12, financials: { annual: [{ date: '2025-12', eps_without_nri: 10.12 }] } }, 5)
    expect(vips.ttm_eps).toBe(2.024)
  })
})
