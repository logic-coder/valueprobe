// Default required return: max(10%, ceil(local 10-year government yield) + 6).
// A zero or negative yield is still a real observation and is not replaced by
// the fallback; the 10% floor still applies. Only a missing or non-finite
// yield falls back. Official policy keys the rate to the enterprise reporting
// currency; quote-currency cash flows stay in the listing currency.
const CODE_BY_SYMBOL = { '¥': 'CNY', '￥': 'CNY', '$': 'USD', 'HK$': 'HKD', '€': 'EUR', '£': 'GBP' }
const A_SHARE_MARKETS = new Set(['SHSE', 'SZSE'])
const US_MARKETS = new Set(['NYSE', 'NASDAQ', 'AMEX', 'NYSEARCA', 'BATS'])

/** Listing venues treated as US-listed for quality-search evidence. */
export function isUsListedMarket (market) {
  return US_MARKETS.has(market)
}
const codeOf = (currency) => CODE_BY_SYMBOL[currency] || (/^[A-Z]{3}$/.test(currency || '') ? currency : null)

export const EQUITY_PREMIUM = 6
export const FALLBACK_DISCOUNT_RATE = 10
export const REQUIRED_RETURN_FLOOR = 10
export const CNY_YIELD_ID = 'EMM00166466'
export const USD_YIELD_ID = 'EMG00001310'

/** @param {unknown} rate ten-year yield in percent; zero and negatives are valid */
export function defaultDiscountRate (rate) {
  if (rate === null || rate === undefined || rate === '') return FALLBACK_DISCOUNT_RATE
  const value = Number(rate)
  if (!Number.isFinite(value)) return FALLBACK_DISCOUNT_RATE
  return Math.max(REQUIRED_RETURN_FLOOR, Math.ceil(value) + EQUITY_PREMIUM)
}

/** Currency of the per-share figures and the published listing value. */
export function cashflowCurrency (stock) {
  return codeOf(stock?.currency) || null
}

/**
 * Enterprise reporting currency used for the official required return.
 * The same market-wide rule applies to every name: an explicit ISO
 * `reporting_currency` on the snapshot wins; A-share markets default to CNY
 * and US markets to USD; otherwise the quote currency is used. The East Money
 * Hong Kong `report_currency` flag is ignored, because that feed labels yuan
 * figures as HKD. There is no per-ticker or A/H-pair override.
 */
export function reportingCurrency (stock) {
  const explicit = codeOf(stock?.reporting_currency)
  if (explicit) return explicit
  const market = stock?.exchange_
  if (A_SHARE_MARKETS.has(market)) return 'CNY'
  if (US_MARKETS.has(market)) return 'USD'
  return cashflowCurrency(stock)
}

/** Why reportingCurrency() chose its code. Disclosure only. */
export function reportingCurrencySource (stock) {
  if (codeOf(stock?.reporting_currency)) return 'snapshot'
  const market = stock?.exchange_
  if (A_SHARE_MARKETS.has(market) || US_MARKETS.has(market)) return 'market'
  return 'quote-fallback'
}

/**
 * Pick a 10-year yield for one cash-flow currency.
 * HKD uses the USD 10-year as a proxy (HKMA 10-year benchmark is empty).
 * A missing local yield stays empty: callers fall back to 10% and say so.
 * USD is never substituted for CNY.
 */
export function rateForCurrency (rates, currency) {
  const code = codeOf(currency) || (/^[A-Z]{3}$/.test(currency || '') ? currency : null)
  if (!code) return { value: null, asOf: null, source: 'fallback', currency: null, proxy: null }
  if (code === 'HKD') {
    const usd = pick(rates?.USD)
    if (usd) return { ...usd, currency: 'HKD', source: usd.source === 'fallback' ? 'fallback' : 'usd_proxy', proxy: 'USD' }
    return { value: null, asOf: null, source: 'fallback', currency: 'HKD', proxy: 'USD' }
  }
  const row = pick(rates?.[code])
  if (row) return { ...row, currency: code, proxy: null }
  return { value: null, asOf: null, source: 'fallback', currency: code, proxy: null }
}

function pick (row) {
  const value = Number(row?.value)
  if (!row || row.value == null || !Number.isFinite(value)) return null
  return { value, asOf: row.asOf || row.as_of || null, source: row.source || 'snapshot' }
}

/** Latest non-null 10-year yields from an East Money RPTA_WEB_TREASURYYIELD payload. */
export function parseEastMoneyYields (body) {
  const rows = [...(body?.result?.data || [])].sort((left, right) => String(right.SOLAR_DATE || '').localeCompare(String(left.SOLAR_DATE || '')))
  const pickId = (key) => {
    for (const row of rows) {
      const raw = row?.[key]
      if (raw === null || raw === undefined || raw === '') continue
      const value = Number(raw)
      if (Number.isFinite(value)) {
        return { value, asOf: String(row.SOLAR_DATE || '').slice(0, 10), source: 'live' }
      }
    }
    return null
  }
  return { CNY: pickId(CNY_YIELD_ID), USD: pickId(USD_YIELD_ID) }
}

/** Number `buildDefaults` should receive for this stock, or null when the yield is missing. */
export function yieldForStock (rates, stock) {
  return rateForCurrency(rates, reportingCurrency(stock) || cashflowCurrency(stock) || stock?.currency).value
}
