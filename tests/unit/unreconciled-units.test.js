import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { policyValue } from '../../src/lib/policy'
import { toStock } from '../../src/lib/stockRecord'
import { REASON } from '../../src/lib/reasons'
import { quoteUnitUnreconciled, UNRECONCILED_QUOTE_UNITS } from '../../src/lib/unreconciledUnits'
import { verifiedQuoteFactor } from '../../scripts/lib/verified-earnings.mjs'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const ratesFile = readJson('public/data/rates.json')
const rateRows = {
  CNY: { value: ratesFile.CNY.value, asOf: ratesFile.CNY.as_of, source: 'snapshot' },
  USD: { value: ratesFile.USD.value, asOf: ratesFile.USD.as_of, source: 'snapshot' },
}
const load = (symbol) => readJson('public/data/' + symbol.replace(':', '-') + '.json')
const valueOf = (raw) => policyValue(toStock(raw), { rates: rateRows, generatedAt: '2026-11-26' })

describe('confirmed quote-unit mismatches refuse a default price', () => {
  it('lists only the three checked names and does not invent an ADR scale for them', () => {
    expect([...UNRECONCILED_QUOTE_UNITS]).toEqual(['NYSE:PKX', 'NYSE:WF', 'NYSE:BCH'])
    for (const symbol of UNRECONCILED_QUOTE_UNITS) {
      expect(verifiedQuoteFactor(symbol)).toBeNull()
    }
  })

  it('refuses PKX, WF and BCH with UNIT_UNRECONCILED and no published value', () => {
    for (const symbol of UNRECONCILED_QUOTE_UNITS) {
      const raw = load(symbol)
      expect(quoteUnitUnreconciled(raw)).toBe(true)
      const stock = toStock(raw)
      expect(stock.base_refusal).toBe(REASON.UNIT_UNRECONCILED)
      const value = policyValue(stock, { rates: rateRows, generatedAt: '2026-11-26' })
      expect(value, symbol).toMatchObject({ status: 'refused', value: null, marginOfSafety: null })
      expect(value.reasons, symbol).toEqual([REASON.UNIT_UNRECONCILED])
    }
  })

  it('does not apply the refusal to an unchecked symbol with the same figures', () => {
    const raw = { ...load('NYSE:PKX'), symbol: 'FAKE' }
    expect(quoteUnitUnreconciled(raw)).toBe(false)
    const value = valueOf(raw)
    expect(value.reasons).not.toContain(REASON.UNIT_UNRECONCILED)
    expect(value.status).toBe('ok')
    expect(value.value).toBeGreaterThan(1000)
  })

  it('leaves already-mapped TSM and a 1:1 ordinary listing alone', () => {
    const tsm = valueOf(load('NYSE:TSM'))
    expect(quoteUnitUnreconciled(load('NYSE:TSM'))).toBe(false)
    expect(tsm.status).toBe('ok')
    expect(tsm.value).toBe(113.23)
    expect(tsm.reasons).not.toContain(REASON.UNIT_UNRECONCILED)
    const aapl = valueOf(load('NASDAQ:AAPL'))
    expect(aapl.status).toBe('ok')
    expect(aapl.value).toBe(150.47)
    expect(aapl.reasons).not.toContain(REASON.UNIT_UNRECONCILED)
  })
})
