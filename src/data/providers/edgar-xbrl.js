import axios from 'axios'
import { transport } from '../transport'
import { readStored, writeStored } from '../../lib/storage'

// SEC EDGAR XBRL companyfacts. Public domain filings, no key. The Vite proxy
// injects the descriptive User-Agent EDGAR requires.
const UA_HEADERS = { 'Accept-Encoding': 'gzip, deflate' }
const sec = axios.create({ timeout: 25000, headers: UA_HEADERS })
const secData = axios.create({ timeout: 30000, headers: UA_HEADERS })

// Two SEC hosts; both need the gateway off-proxy.
const SEC = { id: 'edgar', origin: 'https://www.sec.gov', proxyPath: '/sec', corsSafe: false }
const SEC_DATA = { id: 'edgar', origin: 'https://data.sec.gov', proxyPath: '/secdata', corsSafe: false }

const TICKER_KEY = 'fv-edgar-tickers'
const TICKER_TTL = 7 * 24 * 3600e3

const YEAR_LIMIT = 10

async function tickerMap () {
  try {
    const raw = JSON.parse(readStored(TICKER_KEY, 'null'))
    if (raw && Date.now() - raw.at < TICKER_TTL) return raw.map
  } catch (error) { /* refetch */ }
  const { data } = await sec.get(transport.url(SEC, '/files/company_tickers.json'))
  const map = {}
  for (const entry of Object.values(data)) map[String(entry.ticker).toUpperCase()] = entry
  writeStored(TICKER_KEY, JSON.stringify({ at: Date.now(), map }))
  return map
}

const pad = (cik) => String(cik).padStart(10, '0')

// The live companyfacts document nests taxonomies under `facts`. Unit fixtures
// pass the taxonomy object itself.
function taxonomy (facts) {
  if (facts?.facts?.['us-gaap'] || facts?.facts?.dei) return facts.facts
  return facts || {}
}

/** Annual (10-K) values of one us-gaap concept, oldest first. */
function annual (facts, concepts, unit) {
  const usGaap = taxonomy(facts)['us-gaap'] || {}
  for (const concept of concepts) {
    const entries = usGaap[concept]?.units?.[unit]
    if (!entries) continue
    const byYear = new Map()
    for (const item of entries) {
      if (item.form !== '10-K' || item.fp !== 'FY' || !Number.isFinite(item.val)) continue
      // Later filings of the same fiscal year are restatements. Keep the latest.
      const prev = byYear.get(item.fy)
      const filed = String(item.filed || item.end || '')
      if (!prev || filed >= prev.filed) byYear.set(item.fy, { val: item.val, filed })
    }
    if (byYear.size < 2) continue
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).slice(-YEAR_LIMIT).map(([fy, item]) => ({ fy, val: item.val }))
  }
  return []
}

const deiValue = (facts, concept) => {
  const entries = taxonomy(facts).dei?.[concept]?.units?.shares
  if (!entries?.length) return null
  return [...entries].sort((a, b) => String(b.end).localeCompare(String(a.end)))[0].val
}

const latest = (series) => (series.length ? series[series.length - 1].val : null)

const SHARE_CONCEPTS = [
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
  'WeightedAverageNumberOfSharesOutstandingBasic',
]

/** Diluted shares for the same fiscal year as the flow being divided. */
function sharesFor (facts, fy) {
  const series = annual(facts, SHARE_CONCEPTS, 'shares')
  const match = [...series].reverse().find((item) => item.fy <= fy)
  if (match) return match.val
  return deiValue(facts, 'EntityCommonStockSharesOutstanding')
}

/** Compound annual growth in %, or null when the series cannot support it. */
function growth (series) {
  if (series.length < 2) return null
  const first = series[0].val
  const last = latest(series)
  const years = series[series.length - 1].fy - series[0].fy
  if (!years || years < 1) return null
  let pct
  if (first > 0 && last > 0) pct = (Math.pow(last / first, 1 / years) - 1) * 100
  else if (first < 0 && last > 0) pct = ((last - first) / Math.abs(first) / years) * 100
  else pct = ((last - first) / Math.max(Math.abs(first), 1e-9) / years) * 100
  if (!Number.isFinite(pct)) return null
  return Number(Math.max(-100, Math.min(200, pct)).toFixed(2))
}

const predictability = (series) => {
  if (!series.length) return 1
  const positive = series.filter((item) => item.val > 0).length / series.length
  if (positive >= 0.9) return 5
  if (positive >= 0.7) return 4
  if (positive >= 0.5) return 3
  if (positive >= 0.3) return 2
  return 1
}

const factsCache = new Map()

async function loadFacts (symbol) {
  const cached = factsCache.get(symbol)
  if (cached) return cached
  const code = symbol.split(':')[1]
  const map = await tickerMap()
  const entry = map[code]
  if (!entry) throw new Error('EDGAR: unknown ticker ' + code)
  const { data: facts } = await secData.get(transport.url(SEC_DATA, '/api/xbrl/companyfacts/CIK' + pad(entry.cik_str) + '.json'))
  const loaded = { facts, code, entry }
  factsCache.set(symbol, loaded)
  return loaded
}

const findYear = (series, fy) => series.find((item) => item.fy === fy)?.val ?? null

/** Annual per-share rows the financial table and the chart can both read. */
export function financialsFromFacts (facts) {
  const eps = annual(facts, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'], 'USD/shares')
  const revenue = annual(facts, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'], 'USD')
  const operating = annual(facts, ['OperatingIncomeLoss'], 'USD')
  const equity = annual(facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], 'USD')
  const goodwill = annual(facts, ['Goodwill'], 'USD')
  const intangibles = annual(facts, ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet'], 'USD')
  const ocf = annual(facts, ['NetCashProvidedByUsedInOperatingActivities'], 'USD')
  const capex = annual(facts, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], 'USD')
  const ocfByYear = new Map(ocf.map((item) => [item.fy, item.val]))
  const fcf = capex.filter((item) => ocfByYear.has(item.fy)).map((item) => ({ fy: item.fy, val: ocfByYear.get(item.fy) - item.val }))
  const years = [...new Set([...eps, ...revenue, ...operating, ...equity, ...fcf].map((item) => item.fy))].sort((a, b) => a - b)
  const perShare = (series, fy) => {
    const total = findYear(series, fy)
    const shares = sharesFor(facts, fy)
    if (total == null || !shares) return null
    return Number((total / shares).toFixed(4))
  }
  const rows = years.map((fy) => ({
    date: fy + '-12',
    eps_without_nri: findYear(eps, fy),
    revenue_per_share: perShare(revenue, fy),
    operating_income_per_share: perShare(operating, fy),
    ebitda_per_share: null,
    free_cash_flow_per_share: perShare(fcf, fy),
    dividends_per_share: null,
    book_value_per_share: (() => {
      const book = findYear(equity, fy)
      if (book == null) return null
      const tangible = book - (findYear(goodwill, fy) || 0) - (findYear(intangibles, fy) || 0)
      const shares = sharesFor(facts, fy)
      return shares ? Number((tangible / shares).toFixed(4)) : null
    })(),
  }))
  return { annual: rows, ttm: [], quarter: [] }
}

export async function fetchFinancialsFromEdgar (symbol) {
  const { facts } = await loadFacts(symbol)
  const table = financialsFromFacts(facts)
  if (!table.annual.length) throw new Error('EDGAR: no financials for ' + symbol)
  return table
}

export async function fetchHistoryFromEdgar (symbol, indicator) {
  const { facts } = await loadFacts(symbol)
  const table = financialsFromFacts(facts)
  const points = table.annual
    .filter((row) => row[indicator] != null)
    .map((row) => [row.date, row[indicator]])
  if (!points.length) throw new Error('EDGAR: no history for ' + indicator)
  return points
}

/** Fundamentals from one companyfacts payload. No network. */
export function profileFromFacts (symbol, facts) {
  const [market, code] = String(symbol).split(':')
  const shares = deiValue(facts, 'EntityCommonStockSharesOutstanding')
  const eps = annual(facts, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'], 'USD/shares')
  const equity = annual(facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], 'USD')
  const goodwill = annual(facts, ['Goodwill'], 'USD')
  const intangibles = annual(facts, ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet'], 'USD')
  const ocf = annual(facts, ['NetCashProvidedByUsedInOperatingActivities'], 'USD')
  const capex = annual(facts, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], 'USD')

  const perShare = (series) => {
    if (!series?.length) return null
    const last = series[series.length - 1]
    const yearShares = sharesFor(facts, last.fy) || shares
    return yearShares ? Number((last.val / yearShares).toFixed(4)) : null
  }

  // Free cash flow per share from the two matching fiscal years.
  let fcfPerShare = null
  let fcfGrowth = null
  const byFy = new Map(ocf.map((item) => [item.fy, item.val]))
  const fcfSeries = capex
    .filter((item) => byFy.has(item.fy))
    .map((item) => ({ fy: item.fy, val: byFy.get(item.fy) - item.val }))
  if (fcfSeries.length) {
    const last = fcfSeries[fcfSeries.length - 1]
    const yearShares = sharesFor(facts, last.fy) || shares
    if (yearShares) fcfPerShare = Number((last.val / yearShares).toFixed(4))
    fcfGrowth = growth(fcfSeries)
  }

  const tbvSeries = equity
    .filter((item) => item.val > 0)
    .map((item) => {
      const gw = goodwill.find((g) => g.fy === item.fy)?.val || 0
      const it = intangibles.find((g) => g.fy === item.fy)?.val || 0
      return { fy: item.fy, val: item.val - gw - it }
    })

  const stock = {
    symbol: code,
    exchange_: market,
    company: facts.entityName || code,
    currency: '$',
    ttm_eps: latest(eps),
    eps_period: 'FY',
    free_cash_flow_per_share: fcfPerShare,
    tangible_book: perShare(tbvSeries),
    earning_growth_10y: growth(eps),
    cashflow_growth_10y: fcfGrowth,
    predictability: predictability(eps),
    _partial: true,
    _sources: ['edgar'],
    _fiscal: 'FY',
    _filedThrough: eps.length ? eps[eps.length - 1].fy : null,
  }
  if (stock.ttm_eps == null && stock.tangible_book == null) throw new Error('EDGAR: no fundamentals for ' + code)
  return stock
}

export async function fetchStockFromEdgar (symbol) {
  const { facts } = await loadFacts(symbol)
  return profileFromFacts(symbol, facts)
}
