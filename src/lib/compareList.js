// A second local list next to the watchlist: the symbols queued for /compare.
// Display-only; the kernel never sees it.
import { parseSymbol } from '../config/markets'
import { MAX_COMPARE } from './compare'
import { readStored, writeStored } from './storage'

const KEY = 'fv-compare'

const read = () => {
  try {
    const parsed = JSON.parse(readStored(KEY, '[]'))
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.includes(':')).slice(0, MAX_COMPARE) : []
  } catch (error) {
    return []
  }
}

const write = (list) => writeStored(KEY, JSON.stringify(list)) && list

export const readCompare = read
export const isComparing = (symbol) => read().includes(symbol)

export function addCompare (value) {
  const parsed = parseSymbol(value)
  if (!parsed.ok) return read()
  return write([...new Set([parsed.symbol, ...read()])].slice(0, MAX_COMPARE))
}

export function removeCompare (symbol) {
  return write(read().filter((item) => item !== symbol))
}

export function toggleCompare (value) {
  const parsed = parseSymbol(value)
  if (!parsed.ok) return read()
  return read().includes(parsed.symbol) ? removeCompare(parsed.symbol) : addCompare(parsed.symbol)
}
