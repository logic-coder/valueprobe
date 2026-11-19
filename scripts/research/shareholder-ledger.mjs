// Quantities are per starting share. A replacement lists the entire new basket,
// including the original security if it survives. Cash is retained without interest.
export function settleClaim ({ initial, start, end, terms, dividends, quotes }) {
  const positions = new Map([[initial, 1]])
  let distributions = 0
  let mergerCash = 0
  const ledger = []
  const events = [...terms.map(e => ({ ...e, kind: 'action' })), ...dividends.map(e => ({ ...e, kind: 'dividend' }))]
    .filter(e => e.date > start && e.date <= end).sort((a, b) => a.date.localeCompare(b.date))
  for (const e of events) {
    const leg = e.kind === 'action' ? e.from : e.leg
    const qty = positions.get(leg)
    if (!qty) continue
    if (e.kind === 'dividend') {
      const gross = qty * e.amount
      distributions += gross
      ledger.push({ date: e.date, kind: e.kind, leg, qty, perShare: e.amount, gross })
    } else {
      positions.delete(leg)
      for (const [ticker, ratio] of Object.entries(e.shares)) {
        if (!(ratio > 0)) throw Error('Invalid share entitlement for ' + ticker)
        positions.set(ticker, (positions.get(ticker) || 0) + qty * ratio)
      }
      mergerCash += qty * e.cash
      ledger.push({ date: e.date, kind: e.kind, leg, qty, sharesPerOldShare: e.shares, cashPerOldShare: e.cash })
    }
  }
  const securities = [...positions].map(([ticker, quantity]) => {
    const q = quotes[ticker]
    const close = q?.close ?? Math.round(100 * q?.value / q?.shares) / 100
    if (!(close > 0 && Number.isFinite(close))) throw Error('Missing terminal holding quote for ' + ticker)
    return { ticker, quantity, close, amount: quantity * close }
  })
  const marketValue = securities.reduce((s, leg) => s + leg.amount, 0)
  return { securities, marketValue, distributions, mergerCash, wealth: marketValue + distributions + mergerCash, ledger }
}
