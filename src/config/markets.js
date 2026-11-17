// Market whitelist. Source order is the registry's job (see data/index.js).
export const MARKETS = {
  SHSE: { region: 'CN', label: '上交所' },
  SZSE: { region: 'CN', label: '深交所' },
  HKSE: { region: 'HK', label: '港交所' },
  NYSE: { region: 'US', label: '纽交所' },
  NASDAQ: { region: 'US', label: '纳斯达克' },
  AMEX: { region: 'US', label: '美交所' },
}

export const MARKET_CODES = Object.keys(MARKETS)

/** Default landing symbol (demo seed). */
export const DEFAULT_SYMBOL = 'SHSE:601398'

/**
 * Parse "EXCH:CODE" (case insensitive).
 * @returns {{ok:true, market:string, code:string, symbol:string} | {ok:false, reason:'format'|'market'}}
 */
export function parseSymbol (raw) {
  const text = String(raw || '').trim().toUpperCase()
  if (!text || !text.includes(':')) return { ok: false, reason: 'format' }
  const [market, ...rest] = text.split(':')
  const code = rest.join(':').trim()
  if (!code || !/^[A-Z0-9.^-]+$/.test(code)) return { ok: false, reason: 'format' }
  if (!Object.prototype.hasOwnProperty.call(MARKETS, market)) return { ok: false, reason: 'market' }
  // Hong Kong tickers are quoted upstream with five digits ("00700"); accept "0700" too.
  const normalized = market === 'HKSE' && /^\d+$/.test(code) ? code.padStart(5, '0') : code
  return { ok: true, market, code: normalized, symbol: market + ':' + normalized }
}

export const isUS = (market) => MARKETS[market]?.region === 'US'
