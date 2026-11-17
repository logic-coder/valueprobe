// Manual-entry snapshots: one editable record per symbol, kept in localStorage.
import { readStored, writeStored } from './storage'
const PREFIX = 'fv-manual:'

export function blankManual (symbol) {
  return {
    symbol,
    price: '', currency: '$', company: '',
    eps: '', freecashflow: '', tangibleBook: '',
    growthRate: '', freecashflowGrowthRate: '', discountRate: '',
    terminalGrowthRate: '', years: '', yearsOfTerminalGrowth: '',
    savedAt: null,
  }
}

export function readManual (symbol) {
  try {
    const raw = readStored(PREFIX + symbol)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    return null
  }
}

export function writeManual (symbol, record) {
  writeStored(PREFIX + symbol, JSON.stringify({ ...record, savedAt: Date.now() }))
}
