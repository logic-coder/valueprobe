import { parseSymbol } from '../config/markets'

// The header box accepts what people actually type: a bare six-digit A-share code,
// a short Hong Kong number or a US ticker. Only the input boundary guesses — nothing
// downstream sees a partial form.
const A_SHARE = /^\d{6}$/
const HK = /^\d{1,5}$/
const COMMON_NAMES = {
  'NASDAQ:AAPL': ['Apple', '苹果'],
  'NASDAQ:MSFT': ['Microsoft', '微软'],
  'HKSE:00700': ['Tencent', '腾讯'],
  'SHSE:600519': ['Moutai', '茅台'],
}

export function guessSymbol (raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (text.includes(':')) return text
  if (A_SHARE.test(text)) return (text.startsWith('6') ? 'SHSE:' : 'SZSE:') + text
  if (HK.test(text)) return 'HKSE:' + text.padStart(5, '0')
  return 'NASDAQ:' + text
}

export const normalizeSearch = raw => String(raw ?? '').normalize('NFKC').trim().toUpperCase()

export function searchStocks (catalog, raw) {
  const query = normalizeSearch(raw)
  if (!query) return []
  const qualified = query.includes(':') || /^\d+$/.test(query) ? parseSymbol(guessSymbol(query)) : null
  const matches = []
  for (const stock of catalog) {
    const code = stock.symbol.split(':')[1]
    const names = [stock.name, ...(COMMON_NAMES[stock.symbol] ?? [])].map(normalizeSearch)
    let rank
    if (qualified?.symbol === stock.symbol || query === code) rank = 0
    else if (names.includes(query)) rank = 1
    else if (stock.symbol.startsWith(query) || code.startsWith(query) || names.some(name => name.startsWith(query))) rank = 2
    else if (code.includes(query) || names.some(name => name.includes(query))) rank = 3
    else continue
    matches.push({ stock, rank })
  }
  return matches.sort((a, b) => a.rank - b.rank)
}

export function resolveSearch (matches, raw) {
  if (matches.length === 1 || (matches.length > 1 && matches[0].rank < 2 && matches[0].rank < matches[1].rank)) {
    return { symbol: matches[0].stock.symbol }
  }
  if (matches.length) return { ambiguous: true }
  const query = normalizeSearch(raw)
  if (!query) return {}
  const parsed = parseSymbol(guessSymbol(query))
  if (!parsed.ok) return { invalid: true }
  if (query.includes(':') || /^\d+$/.test(query)) return { symbol: parsed.symbol }
  return { missing: true }
}
