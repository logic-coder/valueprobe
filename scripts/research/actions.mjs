import { readFileSync, writeFileSync } from 'node:fs'
import { settleClaim } from './shareholder-ledger.mjs'

const read = file => JSON.parse(readFileSync('scripts/research/' + file))
const terms = [...read('action-terms.json'), ...read('holdout-terms.json')]
const quotes = read('action-quotes.json')
const raw = readFileSync('scripts/research/action-dividends.csv', 'utf8').trim().split(/\r?\n/).slice(1)
const dividends = raw.map(line => {
  const [leg, date, amount, , sourceAmount, undoFactor] = line.split(',')
  if (!(+amount > 0) || Math.abs(+amount - +sourceAmount * +undoFactor) > 0.00005) throw Error('Invalid cash amount in ' + line)
  return { leg, date, amount: +amount }
})
if (new Set(dividends.map(d => d.leg + '/' + d.date)).size !== dividends.length) throw Error('Duplicate cash entitlement')
const [head, first] = readFileSync('scripts/research/dia-october.csv', 'utf8').split(/\r?\n/)
const anchor = Object.fromEntries(head.split(',').map((col, j) => [col, first.split(',')[j]]))
const end = '2025-10-31'
const holdings = ['DD.old', 'DIS.old', 'UTX', 'PFE', 'MRK', 'IBM', 'MMM', 'GE', 'PCP'].map(initial => {
  const cashExit = initial === 'PCP'
  const start = cashExit ? '2015-12-31' : anchor.date
  const terminalDate = cashExit ? '2016-01-29' : end
  const price = cashExit ? Math.round(102300633 / 440932 * 100) / 100 : Number(anchor[initial.split('.')[0]])
  const result = settleClaim({ initial, start, end: terminalDate, terms, dividends, quotes })
  return { cohort: cashExit ? 'cashExitControl' : 'dia', initial, start, end: terminalDate, price, ...result, cumulativeReturn: result.wealth / price - 1 }
})
const laterQuotes = read('holdout-quotes.json')
for (const [initial, entry] of Object.entries(read('holdout-entry.json'))) {
  const start = '2015-12-31'
  const end = '2025-12-31'
  const price = Math.round(100 * entry.decValue / entry.decShares) / 100
  const result = settleClaim({ initial, start, end, terms, dividends, quotes: laterQuotes })
  holdings.push({ cohort: 'sectorHoldout', initial, start, end, price, ...result, cumulativeReturn: result.wealth / price - 1 })
}
const report = { currency: 'USD', entryUnit: 'one original share', dividends: 'gross entitlements, uninvested, includes receivables',
  terminalQuoteSource: 'https://www.sec.gov/Archives/edgar/data/844779/000141036825043515/NPORT_0CIF_76203212_1025.htm',
  holdoutQuoteSource: 'https://www.sec.gov/Archives/edgar/data/36405/000003640526000070/0000036405-26-000070-index.htm',
  holdoutQuoteExceptions: { GTX: laterQuotes.GTX.source },
  terms, holdings }
const output = 'public/research/shareholder-claims.json'
const serialized = JSON.stringify(report, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== serialized) throw Error('Shareholder ledger differs from the published file')
} else writeFileSync(output, serialized)
console.table(holdings.map(r => ({ ticker: r.initial, entry: r.price, securities: r.marketValue.toFixed(2),
  grossDividends: r.distributions.toFixed(2), mergerCash: r.mergerCash, terminalWealth: r.wealth.toFixed(2) })))
