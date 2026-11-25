// Second quote feed for the snapshot refresh. The primary feed (East Money)
// rate-limits a caller by closing the connection and leaves the quote timestamp
// unset for some listings, which is how a snapshot ends up with a price and no
// trading date. This feed is used only when the primary one cannot return a
// dated quote; the record then carries `quote_source` so the switch is visible.
//
// The row is an unadjusted daily candle: [date, open, close, high, low, volume].
// Only the date and the close are read. Nothing here writes today's date.

const TENCENT_SUFFIX = { NASDAQ: 'OQ', NYSE: 'N' }

/** The feed's own symbol form, or null for a market whose suffix is unverified. */
export function tencentKlineSymbol (market, code) {
  if (market === 'SHSE') return 'sh' + code
  if (market === 'SZSE') return 'sz' + code
  if (market === 'HKSE') return 'hk' + code
  return TENCENT_SUFFIX[market] ? 'us' + code + '.' + TENCENT_SUFFIX[market] : null
}

/** Shape the feed's response like the primary quote, or throw the reason it cannot be used. */
export function tencentKlineQuote (body, market, code) {
  const symbol = tencentKlineSymbol(market, code)
  if (!symbol) throw new Error('market not on the fallback quote feed')
  // The response is keyed by the symbol that was asked for, so a missing key means
  // the listing is not on this feed rather than a different security's price.
  const listed = body?.data?.[symbol]
  const row = Array.isArray(listed?.day) ? listed.day.at(-1) : null
  if (!Array.isArray(row)) throw new Error('empty fallback quote')
  const [date, , rawClose] = row.map(String)
  const close = Math.round(Number(rawClose) * 100) / 100
  if (!(close > 0)) throw new Error('empty fallback quote')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('quote date missing')
  const us = market in TENCENT_SUFFIX
  const currency = market === 'HKSE' ? 'HK$' : us ? '$' : '¥'
  return {
    price: currency + close,
    currency,
    company: listed.qt?.[symbol]?.[1] || '',
    marketCap: NaN,
    asOf: date,
    source: 'tencent-kline',
  }
}
