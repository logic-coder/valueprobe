import { mode } from '../data'
import { DataError } from '../data/errors'
import { getStock, getStockFinancial } from './stock'
import { getIndicatorData, getView } from './indicator'
import { getRiskFreeRates } from './rates'

// "live" is the default (proxied through the Vite server); "fixture" keeps the
// bundled demo snapshot for offline demos and deterministic tests.
export { mode }

/** Surface the pages and stores use; each concern lives in its own module. */
export const api = {
  getStock,
  getStockFinancial,
  getView,
  getRiskFreeRates,
  getIndicatorData,
}

export { DataError }
