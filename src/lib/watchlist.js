// Local watchlist: symbols the reader wants back, newest first, on this device only.
import { parseSymbol } from '../config/markets'
import { guessSymbol } from './symbolInput'
import { readStored, writeStored } from './storage'

const KEY = 'fv-watchlist'
const MAX = 40

const isSymbol = (value) => typeof value === 'string' && /^[A-Z]{2,}:[A-Z0-9.^-]+$/.test(value)

const read = () => {
  try {
    const parsed = JSON.parse(readStored(KEY, '[]'))
    return Array.isArray(parsed) ? parsed.filter(isSymbol).slice(0, MAX) : []
  } catch (error) {
    return []
  }
}

const write = (list) => writeStored(KEY, JSON.stringify(list)) && list

export const readWatchlist = read

export function addWatch(symbol) {
  if (!isSymbol(symbol)) return read()
  return write([symbol, ...read().filter((item) => item !== symbol)].slice(0, MAX))
}

export function removeWatch(symbol) {
  return write(read().filter((item) => item !== symbol))
}

export function toggleWatch(symbol) {
  return read().includes(symbol) ? removeWatch(symbol) : addWatch(symbol)
}

export const isWatched = (symbol) => read().includes(symbol)

/** JSON document for moving the list between devices. */
export function exportWatchlist() {
  return JSON.stringify({ version: 1, symbols: read() }, null, 2) + '\n'
}

/** The list as a spreadsheet column, header included. */
export function exportWatchlistCsv() {
  return 'symbol\n' + read().join('\n') + '\n'
}

const csvCell = (cell) => {
  const raw = String(cell || '').trim().replace(/^"|"$/g, '')
  if (!raw) return null
  const parsed = parseSymbol(guessSymbol(raw))
  return parsed.ok ? parsed.symbol : null
}

/** Symbols from the first column of a CSV/TSV paste; header and unknown rows are skipped. */
export function parseWatchCsv(text) {
  const rows = String(text || '').split(/\r?\n/)
  const head = String(rows[0] || '').split(/[,;\t]/)[0]
  const looksLikeHeader = rows.length > 1 && /^(symbol|symbols|code|ticker|代码|股票代码)$/i.test(head.trim().replace(/^"|"$/g, ''))
  if (looksLikeHeader) rows.shift()
  return [...new Set(rows.map((line) => csvCell(line.split(/[,;\t]/)[0])).filter(Boolean))]
}

/** Merge a CSV of symbols into the list. */
export function importWatchCsv(text) {
  return write([...new Set([...parseWatchCsv(text), ...read()])].slice(0, MAX))
}

/** Merge a previously exported document (or a bare array) into the list. */
export function importWatchlist(text) {
  let incoming = []
  try {
    const parsed = JSON.parse(text)
    incoming = Array.isArray(parsed) ? parsed : (parsed?.symbols || [])
  } catch (error) {
    return read()
  }
  const merged = [...new Set([...incoming.filter(isSymbol), ...read()])].slice(0, MAX)
  return write(merged)
}
