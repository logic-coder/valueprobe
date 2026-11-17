// Side-by-side list ordering. Display only: the kernel and its defaults are only read.
import { parseSymbol } from '../config/markets'
import { guessSymbol } from './symbolInput'

export const MAX_COMPARE = 5

/** Symbols from a comma/space separated query, normalised, deduped, capped. */
export function parseSymbolsQuery (raw) {
  const text = Array.isArray(raw) ? raw.join(',') : String(raw || '')
  const seen = new Set()
  for (const chunk of text.split(/[,\s]+/)) {
    if (!chunk) continue
    const parsed = parseSymbol(guessSymbol(chunk))
    if (parsed.ok) seen.add(parsed.symbol)
    if (seen.size >= MAX_COMPARE) break
  }
  return [...seen]
}

/** Cheapest margin of safety first; rows without a number sink to the bottom. */
export function rankRows (rows) {
  const value = (row) => {
    const parsed = parseFloat(row?.mos)
    return Number.isFinite(parsed) ? parsed : -Infinity
  }
  return [...rows].sort((a, b) => value(b) - value(a))
}
