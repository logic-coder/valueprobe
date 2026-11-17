import { mode } from '../data'
import { getAny, put } from '../lib/cache'
import { readManual } from '../lib/manual'
import { useDataStateStore } from '../store/dataState'

/**
 * Degradation chain for one resource: manual -> live -> stale cache -> throw.
 * Every live leg goes through the provider registry, which owns ordering,
 * capability filtering, metering and validation.
 */
export async function resolve (symbol, key, fetcher, ttl) {
  const source = useDataStateStore()
  if (source.stateOf(symbol) === 'manual') {
    if (readManual(symbol)) return { fromManual: true }
    return null
  }
  const cacheKey = symbol + ':' + key
  if (mode === 'fixture') return fetcher({ fixture: true })
  try {
    const value = await fetcher({ fixture: false })
    put(cacheKey, value, ttl)
    source.markLive(symbol, 'registry', Date.now())
    return value
  } catch (error) {
    const stale = getAny(cacheKey)
    if (stale) {
      source.markStale(symbol, 'cache', stale.savedAt)
      return stale.value
    }
    throw error
  }
}
