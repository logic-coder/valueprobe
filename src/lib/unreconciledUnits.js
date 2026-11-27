import { cashflowCurrency, reportingCurrency } from './riskFree.js'

const codeOf = currency => /^[A-Z]{3}$/.test(currency || '') ? currency : null

/**
 * The published value is per quoted security. Stored EPS/book/FCF are only
 * executable in that unit when their own currency matches the quote, or an
 * explicit finite conversion is present. Reporting currency is checked
 * separately because the discount-rate basis must also be known.
 */
export function quoteUnitReconciliation (record) {
  const quote = cashflowCurrency(record)
  const reporting = reportingCurrency(record)
  const perShare = codeOf(record?.per_share_currency)
  const fx = Number(record?.per_share_fx_to_quote)
  const missing = [!quote && 'quote currency', !reporting && 'reporting currency', !perShare && 'per-share currency'].filter(Boolean)
  if (record?.unit_unreconciled === true) {
    return { ok: false, metadataComplete: !missing.length, reason: 'source unit conflict' }
  }
  if (missing.length) return { ok: false, metadataComplete: false, reason: 'missing ' + missing.join(', ') }
  if (perShare !== quote && !(fx > 0 && Number.isFinite(fx))) {
    return { ok: false, metadataComplete: true, reason: perShare + ' per-share figures versus ' + quote + ' quote without FX' }
  }
  return { ok: true, metadataComplete: true, reason: null }
}

export function quoteUnitUnreconciled (record) {
  return !quoteUnitReconciliation(record).ok
}
