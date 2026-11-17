import { isUS, parseSymbol } from '../config/markets'
import { blankManual, readManual } from '../lib/manual'

/** Manual-mode stock shape built from the user's own numbers. */
export function manualStock (symbol) {
  const { market, code } = parseSymbol(symbol)
  const record = readManual(symbol) || blankManual(symbol)
  return {
    symbol: code,
    exchange_: market,
    company: record.company || code,
    currency: record.currency || (isUS(market) ? '$' : '¥'),
    price: record.price || '',
    ttm_eps: record.eps || '',
    ttm_eps_nri: record.eps || '',
    free_cash_flow_per_share: record.freecashflow || '',
    tangible_book: record.tangibleBook || '',
    earning_growth_10y: record.growthRate || '',
    cashflow_growth_10y: record.freecashflowGrowthRate || '',
    predictability: 1,
    _manual: true,
  }
}
