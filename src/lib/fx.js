// Foreign-exchange conversion for the display layer. Rates come from public ECB
// daily references (Frankfurter, then open.er-api as a mirror), are cached for a
// day, and every failure is explicit: callers get { ok:false, reason } instead of
// a silent 1:1.
import axios from 'axios'
import { readStored, removeStored, writeStored } from './storage'

export const RATE_TTL_MS = 12 * 3600e3

// Both mirrors send Access-Control-Allow-Origin: *, so they are called directly
// off-proxy and through a local rewrite under the dev server.
const SOURCES = [
  { id: 'frankfurter', origin: 'https://api.frankfurter.dev', proxyPath: '/fx', path: (base) => '/v1/latest?from=' + base, parse: (data) => data?.rates },
  { id: 'erapi', origin: 'https://open.er-api.com', proxyPath: '/fxer', path: (base) => '/v6/latest/' + base, parse: (data) => (data?.result === 'success' ? data.rates : null) },
]

const endpoint = (source, base) => {
  const url = source.origin + source.path(base)
  return import.meta.env.DEV ? source.proxyPath + source.path(base) : url
}

const STORE_KEY = 'fv-fx-rates'

const readCached = (base) => {
  try {
    const all = JSON.parse(readStored(STORE_KEY, '{}'))
    return all[base] || null
  } catch (error) {
    return null
  }
}

const writeCached = (base, entry) => {
  try {
    const all = JSON.parse(readStored(STORE_KEY, '{}'))
    all[base] = entry
    writeStored(STORE_KEY, JSON.stringify(all))
  } catch (error) { /* quota */ }
}

export function createFx ({ http = axios, now = Date.now, stored = true } = {}) {
  const cache = new Map()

  async function ratesFor (base) {
    const currency = String(base || '').toUpperCase()
    if (!currency) return { ok: false, reason: 'no-base' }
    const hit = cache.get(currency) || (stored ? readCached(currency) : null)
    if (hit && now() - hit.at < RATE_TTL_MS) return { ok: true, rates: hit.rates, asOf: hit.at, provider: hit.provider }

    for (const source of SOURCES) {
      try {
        const { data } = await http.get(endpoint(source, currency), { timeout: 12_000 })
        const rates = source.parse(data)
        if (!rates || typeof rates !== 'object') continue
        const entry = { at: now(), rates, provider: source.id }
        cache.set(currency, entry)
        if (stored) writeCached(currency, entry)
        return { ok: true, rates, asOf: entry.at, provider: entry.provider }
      } catch (error) { /* next mirror */ }
    }

    // Expired but present beats nothing: say it is stale.
    if (hit) return { ok: true, rates: hit.rates, asOf: hit.at, provider: hit.provider, stale: true }
    return { ok: false, reason: 'unavailable' }
  }

  /**
   * Convert `amount` from one currency to another.
   * @returns {{ok:true, value:number, rate:number, asOf:number, provider:string} | {ok:false, reason:string}}
   */
  async function convert (amount, from, to) {
    const source = String(from || '').toUpperCase()
    const target = String(to || '').toUpperCase()
    const value = Number(amount)
    if (!Number.isFinite(value)) return { ok: false, reason: 'no-amount' }
    if (!source || !target) return { ok: false, reason: 'no-currency' }
    if (source === target) return { ok: true, value, rate: 1, asOf: now(), provider: 'identity' }

    const rates = await ratesFor(source)
    if (!rates.ok) return { ok: false, reason: rates.reason }
    const rate = Number(rates.rates[target])
    if (!Number.isFinite(rate) || rate <= 0) return { ok: false, reason: 'no-pair' }
    return { ok: true, value: value * rate, rate, asOf: rates.asOf, provider: rates.provider }
  }

  return { convert, ratesFor, clear: () => { cache.clear(); removeStored(STORE_KEY) } }
}

export const fx = createFx()

/** Symbols used when rendering a converted figure. */
export const CURRENCY_SYMBOL = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', GBP: '£' }

export const symbolOf = (currencyCode) => CURRENCY_SYMBOL[currencyCode] || currencyCode
