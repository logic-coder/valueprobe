// Quote sanity gate: a source that answers with junk must not win the race.
import { DataError, ErrorCode } from './errors'

/** Largest plausible single-share price; keeps pasted error payloads out. */
const MAX_PRICE = 1e7

/**
 * @param {{price:number, currency?:string, timestamp?:number}} quote
 * @param {{now?:() => number, maxAgeMs?: number, expectedCurrency?: string}} options
 * @returns {DataError|null}
 */
export function validateQuote (quote, options = {}) {
  const now = options.now || Date.now
  const maxAgeMs = options.maxAgeMs || 7 * 24 * 3600e3
  const fail = (message) => new DataError(ErrorCode.VALIDATION, quote?.provider || 'unknown', message)

  if (!quote || typeof quote !== 'object') return fail('empty quote')
  const price = Number(quote.price)
  if (!Number.isFinite(price)) return fail('price not numeric')
  if (price <= 0) return fail('price not positive')
  if (price > MAX_PRICE) return fail('price above sanity bound')

  if (options.expectedCurrency && quote.currency && quote.currency !== options.expectedCurrency) {
    return fail('currency ' + quote.currency + ' != ' + options.expectedCurrency)
  }

  if (quote.timestamp != null) {
    const stamp = Number(quote.timestamp)
    if (!Number.isFinite(stamp)) return fail('timestamp not numeric')
    if (stamp > now() + 86_400e3) return fail('timestamp in the future')
    if (now() - stamp > maxAgeMs) return fail('quote older than ' + maxAgeMs + 'ms')
  }
  return null
}

/** True when a timestamp is older than the stale window (still usable, flagged). */
export function isStale (timestamp, { now = Date.now, staleAfterMs = 24 * 3600e3 } = {}) {
  return timestamp != null && now() - Number(timestamp) > staleAfterMs
}
