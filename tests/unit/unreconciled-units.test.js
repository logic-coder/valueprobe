import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { policyValue } from '../../src/lib/policy'
import { toStock } from '../../src/lib/stockRecord'
import { REASON } from '../../src/lib/reasons'
import { quoteUnitReconciliation, quoteUnitUnreconciled } from '../../src/lib/unreconciledUnits'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const ratesFile = readJson('public/data/rates.json')
const rateRows = {
  CNY: { value: ratesFile.CNY.value, asOf: ratesFile.CNY.as_of, source: 'snapshot' },
  USD: { value: ratesFile.USD.value, asOf: ratesFile.USD.as_of, source: 'snapshot' },
}
const load = (symbol) => readJson('public/data/' + symbol.replace(':', '-') + '.json')
const valueOf = (raw) => policyValue(toStock(raw), { rates: rateRows, generatedAt: '2026-11-26' })

describe('quote units are reconciled from metadata, not symbol names', () => {
  it('refuses local-currency ADR figures without an explicit conversion', () => {
    for (const symbol of ['NASDAQ:TCOM', 'NYSE:AMX', 'NYSE:BCH', 'NYSE:IX', 'NYSE:PKX', 'NYSE:SBS', 'NYSE:WF']) {
      const raw = load(symbol)
      expect(quoteUnitReconciliation(raw), symbol).toMatchObject({ ok: false, metadataComplete: true })
      const stock = toStock(raw)
      expect(stock.base_refusal).toBe(REASON.UNIT_UNRECONCILED)
      const value = policyValue(stock, { rates: rateRows, generatedAt: '2026-11-26' })
      expect(value, symbol).toMatchObject({ status: 'refused', value: null, marginOfSafety: null })
      expect(value.reasons, symbol).toContain(REASON.UNIT_UNRECONCILED)
    }
  })

  it('does not let renaming a symbol bypass the same unit evidence', () => {
    const raw = { ...load('NYSE:SBS'), symbol: 'FAKE' }
    expect(quoteUnitUnreconciled(raw)).toBe(true)
    const value = valueOf(raw)
    expect(value.reasons).toContain(REASON.UNIT_UNRECONCILED)
    expect(value.status).toBe('refused')
    expect(value.value).toBeNull()
  })

  it('fails closed when currency metadata is missing or ambiguous', () => {
    expect(quoteUnitReconciliation({ currency: '$', exchange_: 'NASDAQ', symbol: 'FAKE' }))
      .toMatchObject({ ok: false, metadataComplete: false })
    expect(quoteUnitReconciliation({ currency: '$', reporting_currency: 'BRL', per_share_currency: 'USD', unit_unreconciled: true }))
      .toMatchObject({ ok: false })
  })

  it('withholds executable inputs for unit refusals without disabling other manual trials', () => {
    const artifact = readJson('public/data/intrinsic/v3.json')
    const unitRefused = artifact.entries['NYSE:SBS']
    expect(unitRefused.reasons).toContain(REASON.UNIT_UNRECONCILED)
    expect(unitRefused.inputs).not.toHaveProperty('eps')
    expect(unitRefused.inputs).not.toHaveProperty('growth')
    expect(unitRefused.inputs).not.toHaveProperty('tangibleBook')

    const cashRefused = artifact.entries['NASDAQ:CART']
    expect(cashRefused.reasons).toContain('CASH_UNRECONCILED')
    expect(cashRefused.inputs.eps).toBeGreaterThan(0)
  })

  it('leaves a reconciled ordinary listing and a checked ADR scale alone', () => {
    const tsm = valueOf(load('NYSE:TSM'))
    expect(quoteUnitUnreconciled(load('NYSE:TSM'))).toBe(false)
    expect(tsm.status).toBe('ok')
    expect(tsm.value).toBe(133.27)
    expect(tsm.reasons).not.toContain(REASON.UNIT_UNRECONCILED)
    const aapl = valueOf(load('NASDAQ:AAPL'))
    expect(aapl.status).toBe('ok')
    expect(aapl.value).toBe(150.47)
    expect(aapl.reasons).not.toContain(REASON.UNIT_UNRECONCILED)
  })
})
