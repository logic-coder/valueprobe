// Peer list and its cross-check maths. Display-only: peers never touch the kernel.
const PEERS = {
  'SHSE:601398': ['SHSE:601939', 'SHSE:601288', 'SHSE:601988', 'SHSE:600036'],
  'SHSE:600036': ['SHSE:601398', 'SHSE:601939', 'SHSE:601288', 'SHSE:601988'],
  'SHSE:600519': ['SZSE:000858', 'SZSE:000568', 'SHSE:600809', 'SZSE:002304'],
  'SZSE:000858': ['SHSE:600519', 'SZSE:000568', 'SHSE:600809', 'SZSE:002304'],
  'SZSE:000568': ['SHSE:600519', 'SZSE:000858', 'SHSE:600809', 'SZSE:002304'],
  'NASDAQ:AAPL': ['NASDAQ:MSFT', 'NASDAQ:GOOGL', 'NASDAQ:AMZN', 'NASDAQ:META'],
  'NASDAQ:MSFT': ['NASDAQ:AAPL', 'NASDAQ:GOOGL', 'NASDAQ:META', 'NASDAQ:AMZN'],
  'NYSE:KO': ['NYSE:PEP', 'NYSE:CL', 'NYSE:KMB', 'NYSE:MDLZ'],
  'NYSE:PEP': ['NYSE:KO', 'NYSE:CL', 'NYSE:KMB', 'NYSE:MDLZ'],
}

// Upstream prices arrive as strings with the currency glued on ("¥8.85").
const num = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.eE+-]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export const peersFor = (symbol) => PEERS[symbol] || []

export function peerRow(record, symbol) {
  const price = num(record?.price)
  return {
    symbol,
    name: String(record?.company || symbol),
    price,
    pe: price !== null && num(record?.ttm_eps) ? price / num(record.ttm_eps) : null,
    pb: price !== null && num(record?.tangible_book) ? price / num(record.tangible_book) : null,
  }
}

export function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!clean.length) return null
  const middle = Math.floor(clean.length / 2)
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2
}

export function peerSummary(rows, basisValue, fairValue) {
  const medianPe = median(rows.map((row) => row.pe))
  const basis = num(basisValue)
  const implied = medianPe !== null && basis !== null ? medianPe * basis : null
  const fair = num(fairValue)
  const gap = implied !== null && fair !== null ? 1 - implied / fair : null
  return { medianPe, medianPb: median(rows.map((row) => row.pb)), implied, gap }
}
