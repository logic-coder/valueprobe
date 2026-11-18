// Default discount rate: ceil(local 10-year government yield) + 6.
// The rate must match the cash-flow currency, not the display currency.
const CODE_BY_SYMBOL = { '¥': 'CNY', '￥': 'CNY', '$': 'USD', 'HK$': 'HKD', '€': 'EUR', '£': 'GBP' }
const codeOf = (currency) => CODE_BY_SYMBOL[currency] || (/^[A-Z]{3}$/.test(currency || '') ? currency : null)

export const EQUITY_PREMIUM = 6
export const FALLBACK_DISCOUNT_RATE = 8
export const CNY_YIELD_ID = 'EMM00166466'
export const USD_YIELD_ID = 'EMG00001310'

/** @param {unknown} rate ten-year yield in percent */
export function defaultDiscountRate (rate) {
  const value = Number(rate)
  if (!Number.isFinite(value) || value <= 0) return FALLBACK_DISCOUNT_RATE
  return Math.ceil(value) + EQUITY_PREMIUM
}

/** Reporting currency of the cash flows, never the display currency. */
export function cashflowCurrency (stock) {
  return codeOf(stock?.currency) || null
}

/**
 * Pick a 10-year yield for one cash-flow currency.
 * HKD uses the USD 10-year as a proxy (HKMA 10-year benchmark is empty).
 * A missing local yield stays empty: callers fall back to 8% and say so.
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
  if (!row || !Number.isFinite(value) || value <= 0) return null
  return { value, asOf: row.asOf || row.as_of || null, source: row.source || 'snapshot' }
}

/** Latest non-null 10-year yields from an East Money RPTA_WEB_TREASURYYIELD payload. */
export function parseEastMoneyYields (body) {
  const rows = [...(body?.result?.data || [])].sort((left, right) => String(right.SOLAR_DATE || '').localeCompare(String(left.SOLAR_DATE || '')))
  const pickId = (key) => {
    for (const row of rows) {
      const value = Number(row?.[key])
      if (Number.isFinite(value) && value > 0) {
        return { value, asOf: String(row.SOLAR_DATE || '').slice(0, 10), source: 'live' }
      }
    }
    return null
  }
  return { CNY: pickId(CNY_YIELD_ID), USD: pickId(USD_YIELD_ID) }
}

/** Number `buildDefaults` should receive for this stock, or null when the yield is missing. */
export function yieldForStock (rates, stock) {
  return rateForCurrency(rates, cashflowCurrency(stock) || stock?.currency).value
}
