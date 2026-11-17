import { registry } from '../data'
import { resolve } from './degrade'
import { manualStock } from './manual'
import { TTL } from './client'
import { track } from './tracking'
import { useDataStateStore } from '../store/dataState'

export async function getStock (symbol, options = {}) {
  const source = useDataStateStore()
  if (source.stateOf(symbol) === 'manual') return manualStock(symbol)
  return resolve(symbol, 'stock', async () => {
    const { value, diagnostics } = await registry.fetchStockRecord(symbol, options)
    track(symbol, diagnostics, { replace: true })
    if (value && value._as_of) source.setMeta(symbol, { asOf: String(value._as_of) })
    return value
  }, TTL.stock)
}

export async function getStockFinancial (symbol, view, params) {
  const source = useDataStateStore()
  if (source.stateOf(symbol) === 'manual') return null
  return resolve(symbol, 'financials', async () => {
    const result = await registry.fetchFinancials(symbol, view, params)
    track(symbol, result.diagnostics)
    return result.value
  }, TTL.financials)
}
