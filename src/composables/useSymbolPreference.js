import { readStored, writeStored } from '../lib/storage'

// Per-symbol UI preference (chart indicator, range) kept through the storage wrapper,
// so blocked storage degrades to memory instead of crashing the page.
export function useSymbolPreference (prefix, fallback) {
  const stored = (symbol) => readStored(prefix + symbol, fallback) || fallback
  const remember = (symbol, value) => writeStored(prefix + symbol, String(value))
  return { stored, remember }
}
