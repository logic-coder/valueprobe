import { mode } from '../data'
import { DataError } from '../data/errors'
import { getStock, getStockFinancial } from './stock'
import { getIndicatorData, getLatestIndicator, getView } from './indicator'
import { createUserDcfTemplate, deleteUserDcfTemplate, getUserDcfTemplate, updateUserDcfTemplate } from './templates'

// "live" is the default (proxied through the Vite server); "fixture" keeps the
// bundled demo snapshot for offline demos and deterministic tests.
export { mode }

/** Surface the pages and stores use; each concern lives in its own module. */
export const api = {
  getStock,
  getStockFinancial,
  getView,
  getLatestIndicator,
  getIndicatorData,
  getUserDcfTemplate,
  createUserDcfTemplate,
  updateUserDcfTemplate,
  deleteUserDcfTemplate,
}

export { DataError }
