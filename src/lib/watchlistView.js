// Published rows consume the same release record on both list pages.
import { policyValue, quoteDateStatus } from './policy'
import { toStock } from './stockRecord'
import { symbolOf } from './fx'
import { peerRow } from './peers'
import { REASON } from './reasons'

export function publishedListRow (stock, symbol, entry, translate, unavailable) {
  const row = entry
    ? { symbol, name: entry.name, price: entry.price, asOf: entry.asOf, pe: entry.pe, pb: entry.pb }
    : { ...peerRow(stock, symbol), currency: stock?.currency || '¥', asOf: stock?._as_of ?? null }
  return publishedRow(row, entry, translate, unavailable)
}

/** Comparison and watchlist display the same published pair as the stock page. */
export function publishedRow (row, entry, translate, unavailable = false) {
  if (!entry) return { ...row, fairValue: null, mos: null, policyNote: translate(unavailable ? 'official_load_failed' : 'official_outside') }
  const status = quoteDateStatus(entry.price, entry.priceDate)
  const sameQuote = row.price === entry.price && row.asOf === entry.asOf
  return {
    ...row,
    name: entry.name || row.name,
    currency: symbolOf(entry.inputs.currency) || row.currency,
    price: entry.price,
    priceDate: entry.priceDate,
    quoteNote: status === 'dated' ? '' : translate('quote_' + status),
    pe: sameQuote ? row.pe : null,
    pb: sameQuote ? row.pb : null,
    fairValue: entry.value,
    mos: entry.marginOfSafety,
    trialOnly: entry.reasons.includes(REASON.INDUSTRY_MODEL_PENDING),
    policyNote: entry.reasons.map((reason) => translate('reason_' + reason)).join(' · '),
  }
}

/**
 * Default-assumption intrinsic value and margin of safety for a quote+payload.
 * @param {object} stock stock payload
 * @param {number|null} indicator local ten-year yield in percent, as the calculator takes it
 * @returns {{fairValue: number|null, mos: number|null}}
 */
export function defaultView (stock, indicator = null) {
  if (!stock) return { fairValue: null, mos: null }
  const official = (stock.earnings_base == null && !stock.base_refusal && stock.financials)
    ? toStock(stock)
    : stock
  const value = policyValue(official, { rate: indicator === undefined ? null : indicator })
  if (value.status !== 'ok') return { fairValue: null, mos: null }
  return { fairValue: value.value, mos: value.marginOfSafety }
}
