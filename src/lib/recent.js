// Recently opened symbols, newest first, on this device only. Kept separate from
// the watchlist: recency is implicit, starring is deliberate.
import { readStored, writeStored } from './storage'
const KEY = 'fv-recent'
const MAX = 8

const isEntry = (value) => value && typeof value.symbol === 'string' && /^[A-Z]{2,}:[A-Z0-9.^-]+$/.test(value.symbol)

const read = () => {
  try {
    const parsed = JSON.parse(readStored(KEY, '[]'))
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX) : []
  } catch (error) {
    return []
  }
}

const write = (list) => writeStored(KEY, JSON.stringify(list)) && list

export const readRecent = read

export function addRecent(symbol, name = '') {
  if (!isEntry({ symbol })) return read()
  const entry = { symbol, name: String(name || '').slice(0, 60), at: Date.now() }
  return write([entry, ...read().filter((item) => item.symbol !== symbol)].slice(0, MAX))
}

export function clearRecent() {
  return write([])
}
