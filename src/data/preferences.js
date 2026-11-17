// User data-source preference, persisted locally: a global order plus a
// per-symbol pin ("always use eastmoney for this code").
import { readStored, writeStored } from '../lib/storage'
const KEY = 'fv-data-sources'

// Ids from a removed feed are dropped so a saved pin cannot point at nothing.
const RETIRED = new Set(['cloud', 'api', 'upstreamApi'])
const normalize = (id) => (RETIRED.has(id) ? null : id)

const read = () => {
  try {
    const parsed = JSON.parse(readStored(KEY, '{}'))
    return {
      order: Array.isArray(parsed.order) ? parsed.order.map(normalize).filter(Boolean) : [],
      pinned: Object.fromEntries(Object.entries(parsed.pinned || {}).map(([symbol, id]) => [symbol, normalize(id)]).filter(([, id]) => id)),
    }
  } catch (error) {
    return { order: [], pinned: {} }
  }
}

const write = (value) => { writeStored(KEY, JSON.stringify(value)) }

export const readPreferences = () => read()

export function setOrder (order) {
  const value = read()
  value.order = order.map(normalize).filter(Boolean)
  write(value)
}

export function pinProvider (symbol, providerId) {
  const value = read()
  const id = normalize(providerId)
  if (providerId && id) value.pinned[symbol] = id
  else delete value.pinned[symbol]
  write(value)
}

export const pinnedProvider = (symbol) => read().pinned[symbol] || null

export function resetPreferences () {
  write({ order: [], pinned: {} })
}
