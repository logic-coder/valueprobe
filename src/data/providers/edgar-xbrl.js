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
const FORMS = new Set(['10-K', '20-F', '40-F'])
const SPLITS = [2, 3, 4, 5, 10, 20, 25, 50]
const EPS_CONCEPTS = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic']
const REVENUE_CONCEPTS = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax']
const CAPEX_CONCEPTS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  'PaymentsToAcquireOtherPropertyPlantAndEquipment',
  'PurchaseOfPropertyAndEquipment',
]

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

function durationDays (item) {
  const start = Date.parse(item.start || '')
  const end = Date.parse(item.end || '')
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return (end - start) / 86400000
}

/** Comparative columns in a 10-K reuse the filing's fy. The period end is the year. */
function periodYear (item) {
  const end = Number(String(item.end || '').slice(0, 4))
  if (end > 1980 && end < 2100) return end
  return Number.isFinite(item.fy) ? item.fy : null
}

/** One concept, one unit. A full fiscal year beats a later stub with the same period end. */
function annualConcept (facts, concept, unit, taxonomyName = 'us-gaap', preferEarliest = false) {
  const entries = taxonomy(facts)[taxonomyName]?.[concept]?.units?.[unit]
  if (!entries) return []
  const byYear = new Map()
  for (const item of entries) {
    if (!FORMS.has(item.form) || item.fp !== 'FY' || !Number.isFinite(item.val)) continue
    const days = durationDays(item)
    const full = days == null || days >= 300
    const filed = String(item.filed || item.end || '')
    const year = periodYear(item)
    if (!year) continue
    const prev = byYear.get(year)
    const newerOrOlder = !prev ? true : (preferEarliest ? filed < prev.filed : filed >= prev.filed)
    const better = !prev || (full && !prev.full) || (full === prev.full && newerOrOlder)
    if (better) byYear.set(year, { val: item.val, full, filed })
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([fy, item]) => ({ fy, val: item.val, filed: item.filed }))
}

/**
 * Freshest concept that can support a history. The first concept with two
 * points used to win even when those points stopped a decade ago.
 */
function annual (facts, concepts, unit, taxonomyName = 'us-gaap', preferEarliest = false) {
  let best = []
  for (const concept of concepts) {
    const series = annualConcept(facts, concept, unit, taxonomyName, preferEarliest)
    if (series.length < 2) continue
    const newer = (series.at(-1)?.fy || 0) > (best.at(-1)?.fy || 0)
    const longer = (series.at(-1)?.fy || 0) === (best.at(-1)?.fy || 0) && series.length > best.length
    if (newer || longer) best = series
  }
  return best.slice(-YEAR_LIMIT)
}

/** EPS stays in US dollars per share. Another unit would be mislabeled as dollars. */
function earningsPerShare (facts) {
  const direct = annual(facts, EPS_CONCEPTS, 'USD/shares')
  if (direct.length >= 2) return direct
  const ifrsConcepts = ['DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare']
  return annual(facts, ifrsConcepts, 'USD/shares', 'ifrs-full')
}

const deiValue = (facts, concept) => {
  const entries = taxonomy(facts).dei?.[concept]?.units?.shares
  if (!entries?.length) return null
  return [...entries].sort((a, b) => String(b.end).localeCompare(String(a.end)))[0].val
}

const SHARE_CONCEPTS = [
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
  'WeightedAverageNumberOfSharesOutstandingBasic',
]

const median = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** 730 next to 730,000,000 is the same count reported in millions. */
function normalizeShareUnits (series) {
  const big = series.map((point) => point.val).filter((value) => value >= 1e6)
  const reference = median(big)
  if (!reference) return series
  return series.map((point) => {
    if (!(point.val > 0) || point.val >= reference / 100) return point
    for (const scale of [1e3, 1e6]) {
      const scaled = point.val * scale
      if (Math.abs(scaled - reference) / reference < 0.5) return { ...point, val: scaled }
    }
    return point
  })
}

function nearestSplitWithin (ratio, tolerance) {
  if (!(ratio > 1.6)) return null
  let best = null
  let error = tolerance
  for (const factor of SPLITS) {
    const gap = Math.abs(ratio - factor) / factor
    if (gap <= error) {
      error = gap
      best = factor
    }
  }
  return best
}

/**
 * Original 10-K share counts usually are not restated, but later filings
 * sometimes rewrite older years onto a post-split basis. assemble keeps the
 * original count so the jump stays in the split year. Multiply older counts
 * when the share count jumps by a split factor and revenue does not. Returns
 * shares on the latest year's basis.
 */
function splitAdjustedShares (shares, revenue) {
  const years = shares.map((point) => point.fy)
  const reported = new Map(shares.map((point) => [point.fy, point.val]))
  const extra = new Map(years.map((year) => [year, 1]))
  const splits = []
  for (let index = 1; index < years.length; index++) {
    const prev = years[index - 1]
    const year = years[index]
    const factor = nearestSplit(reported.get(year) / reported.get(prev))
    if (!factor) continue
    const prevRevenue = revenue.get(prev)
    const revenueNow = revenue.get(year)
    const revenueRatio = prevRevenue > 0 && revenueNow > 0 ? revenueNow / prevRevenue : 1
    if (revenueRatio > factor * 0.55) continue
    splits.push({ year, factor, filed: shares.find((point) => point.fy === year)?.filed || '' })
    for (const older of years) {
      if (older < year) extra.set(older, extra.get(older) * factor)
    }
  }
  const adjusted = new Map()
  for (const year of years) adjusted.set(year, reported.get(year) * extra.get(year))
  return { adjusted, extra, splits }
}

function nearestSplit (ratio) {
  return nearestSplitWithin(ratio, 0.18)
}

/**
 * When share counts start after a split, there is no jump to see. The same
 * fiscal year's EPS in a later 10-K is often restated onto the new share
 * basis; that ratio is the split, and item.fy on the later row is the
 * split-year filing.
 */
function restatementSplits (facts) {
  const splits = []
  const seen = new Set()
  const taxonomies = [
    ['us-gaap', EPS_CONCEPTS],
    ['ifrs-full', ['DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare']],
  ]
  for (const [taxonomyName, concepts] of taxonomies) {
    for (const concept of concepts) {
      const entries = taxonomy(facts)[taxonomyName]?.[concept]?.units?.['USD/shares']
      if (!entries) continue
      const byYear = new Map()
      for (const item of entries) {
        if (!FORMS.has(item.form) || item.fp !== 'FY' || !Number.isFinite(item.val)) continue
        const days = durationDays(item)
        if (days != null && days < 300) continue
        const year = periodYear(item)
        const filed = String(item.filed || '')
        if (!year || !filed) continue
        const list = byYear.get(year) || []
        list.push({ val: item.val, filed, filingYear: Number.isFinite(item.fy) ? item.fy : null })
        byYear.set(year, list)
      }
      for (const [period, list] of byYear) {
        list.sort((left, right) => left.filed.localeCompare(right.filed) || left.val - right.val)
        let basis = list[0]
        for (let index = 1; index < list.length; index++) {
          const after = list[index]
          if (!basis || after.filed <= basis.filed) continue
          const factor = (
            basis.val > 0 && after.val > 0
              ? nearestSplitWithin(basis.val / after.val, 0.08)
              : null
          )
          const year = after.filingYear
          if (factor && year && year > period) {
            const key = year + ':' + factor
            if (!seen.has(key)) {
              seen.add(key)
              splits.push({ year, factor, filed: after.filed })
            }
          }
          basis = after
        }
      }
    }
  }
  return splits.sort((left, right) => left.year - right.year)
}

function mergeSplits (fromShares, fromRestatement) {
  const merged = [...fromShares]
  const seen = new Set(fromShares.map((split) => split.year + ':' + split.factor))
  for (const split of fromRestatement) {
    const key = split.year + ':' + split.factor
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(split)
  }
  return merged.sort((left, right) => left.year - right.year)
}

/**
 * Companyfacts keep each 10-K's original EPS. Later filings restate only a
 * short comparison window, so years older than that stay on a pre-split basis.
 * Share counts are not restated either; splitAdjustedShares finds the split
 * years when the count jumps. restatementSplits covers the case where share
 * history starts after the split. Apply those factors only to EPS last filed
 * before that year's 10-K — a comparative column in the split-year filing is
 * already post-split.
 */
export function rescaleFiledEps (eps, splits) {
  if (!splits?.length) return eps
  return eps.map((point) => {
    let factor = 1
    for (const split of splits) {
      if (!(point.fy < split.year) || !(split.factor > 1)) continue
      const filed = String(point.filed || '')
      const splitFiled = String(split.filed || '')
      if (!filed || !splitFiled || filed >= splitFiled) continue
      factor *= split.factor
    }
    if (factor === 1 || !Number.isFinite(point.val)) return point
    return { ...point, val: Number((point.val / factor).toFixed(4)) }
  })
}

/** A one-year hole or spike between two consistent years is a mis-tagged fact. */
function dropCliffs (series) {
  return series.filter((point, index) => {
    const prev = series[index - 1]
    const next = series[index + 1]
    if (!prev || !next || !(point.val > 0) || !(prev.val > 0) || !(next.val > 0)) return true
    const dip = point.val < prev.val * 0.45 && point.val < next.val * 0.45
    const spike = point.val > prev.val * 2.5 && point.val > next.val * 2.5
    return !dip && !spike
  })
}

/**
 * Quoted shares versus the latest filing. A split after the 10-K leaves the
 * price on the new basis and the filing on the old one. 1 means no adjustment.
 */
export function quoteSplitFactor (price, marketCap, filingShares) {
  if (!(price > 0) || !(marketCap > 0) || !(filingShares > 0)) return 1
  const ratio = (marketCap / price) / filingShares
  const forward = nearestSplit(ratio)
  if (forward) return forward
  // An ADR quote is one receipt for several ordinary shares. Multiply per-share
  // figures (a factor below 1 divides into a larger number).
  const inverse = nearestSplit(ratio > 0 ? 1 / ratio : 0)
  if (inverse) return 1 / inverse
  return 1
}

const scaleValue = (value, factor) => (value == null || factor === 1 ? value : Number((value / factor).toFixed(4)))

/** Divide every per-share figure by a post-filing split. A factor below 1 scales an ADR up. */
export function scalePerShare (pack, factor) {
  if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return pack
  const scaleRow = (row) => ({
    ...row,
    eps_without_nri: scaleValue(row.eps_without_nri, factor),
    revenue_per_share: scaleValue(row.revenue_per_share, factor),
    operating_income_per_share: scaleValue(row.operating_income_per_share, factor),
    free_cash_flow_per_share: scaleValue(row.free_cash_flow_per_share, factor),
    book_value_per_share: scaleValue(row.book_value_per_share, factor),
  })
  return {
    ...pack,
    fields: {
      ...pack.fields,
      ttm_eps: scaleValue(pack.fields.ttm_eps, factor),
      free_cash_flow_per_share: scaleValue(pack.fields.free_cash_flow_per_share, factor),
      tangible_book: scaleValue(pack.fields.tangible_book, factor),
    },
    financials: {
      annual: (pack.financials?.annual || []).map(scaleRow),
      ttm: (pack.financials?.ttm || []).map(scaleRow),
      quarter: pack.financials?.quarter || [],
    },
  }
}

const MIN_GROWTH_SPAN = 7

/**
 * Ten-year compound growth in %, from the first positive year to the latest.
 * Null when the latest year is not positive or the span is under seven years.
 */
function growth10y (series) {
  const last = series.at(-1)
  if (!last || !(last.val > 0)) return null
  const positives = series.map((point) => point.val).filter((value) => value > 0).sort((left, right) => left - right)
  const typical = positives[Math.floor(positives.length / 2)]
  // A trough is not a base, but a later year in the same series still can be.
  // After split restatement, genuine high-growth names often start well below
  // the median; dropping the whole window left growth empty.
  const first = series.find((point) => (
    point.val > 0
    && last.fy - point.fy >= MIN_GROWTH_SPAN
    && !(positives.length >= 3 && point.val < typical * 0.2)
  ))
  if (!first) return null
  const years = last.fy - first.fy
  const pct = (Math.pow(last.val / first.val, 1 / years) - 1) * 100
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

function assemble (facts) {
  const reportedEps = earningsPerShare(facts)
  const revenue = annual(facts, REVENUE_CONCEPTS, 'USD')
  const operating = annual(facts, ['OperatingIncomeLoss'], 'USD')
  const equity = annual(facts, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], 'USD')
  const goodwill = annual(facts, ['Goodwill'], 'USD')
  const intangibles = annual(facts, ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet'], 'USD')
  const ocf = annual(facts, ['NetCashProvidedByUsedInOperatingActivities'], 'USD')
  const capex = annual(facts, CAPEX_CONCEPTS, 'USD')
  // Later 10-Ks sometimes restate older share counts onto a post-split basis.
  // Keep the original filing so the jump stays in the split year; otherwise
  // the same split is also detected from EPS and applied twice.
  const shares = normalizeShareUnits(annual(facts, SHARE_CONCEPTS, 'shares', 'us-gaap', true))
  const { adjusted, splits: shareSplits } = splitAdjustedShares(shares, new Map(revenue.map((item) => [item.fy, item.val])))
  const splits = mergeSplits(shareSplits, restatementSplits(facts))
  const restatedEps = rescaleFiledEps(reportedEps, splits)
  const cliffYears = new Set(restatedEps.map((point) => point.fy))
  for (const point of dropCliffs(restatedEps)) cliffYears.delete(point.fy)
  const keptEps = restatedEps.filter((point) => !cliffYears.has(point.fy))
  const ocfByYear = new Map(ocf.map((item) => [item.fy, item.val]))
  const fcf = capex
    .filter((item) => ocfByYear.has(item.fy))
    .map((item) => ({ fy: item.fy, val: ocfByYear.get(item.fy) - Math.abs(item.val) }))
  const years = [...new Set([...keptEps, ...revenue, ...operating, ...equity, ...fcf, ...shares].map((item) => item.fy))].sort((a, b) => a - b)
  const shareFor = (fy) => {
    const match = [...adjusted.entries()].reverse().find(([year]) => year <= fy)
    return match ? match[1] : deiValue(facts, 'EntityCommonStockSharesOutstanding')
  }
  const perShare = (series, fy) => {
    const total = findYear(series, fy)
    const count = shareFor(fy)
    if (total == null || !(count > 0)) return null
    return Number((total / count).toFixed(4))
  }
  const rows = years.map((fy) => {
    const book = findYear(equity, fy)
    const count = shareFor(fy)
    const tangible = book == null || !(count > 0)
      ? null
      : Number(((book - (findYear(goodwill, fy) || 0) - (findYear(intangibles, fy) || 0)) / count).toFixed(4))
    return {
      date: fy + '-12',
      eps_without_nri: cliffYears.has(fy) ? null : findYear(keptEps, fy),
      revenue_per_share: perShare(revenue, fy),
      operating_income_per_share: perShare(operating, fy),
      ebitda_per_share: null,
      free_cash_flow_per_share: perShare(fcf, fy),
      dividends_per_share: null,
      book_value_per_share: tangible,
    }
  })
  const latestEpsYear = keptEps.at(-1)?.fy || years.at(-1) || 0
  const fcfHistory = rows
    .filter((row) => row.free_cash_flow_per_share != null)
    .map((row) => ({ fy: Number(row.date.slice(0, 4)), val: row.free_cash_flow_per_share }))
  const recentFcf = [...fcfHistory].reverse().find((point) => point.fy >= latestEpsYear - 1) || null
  const last = rows.at(-1)
  return {
    filingShares: shareFor(latestEpsYear) || null,
    financials: {
      annual: rows,
      ttm: last ? [{
        date: last.date,
        eps_without_nri: last.eps_without_nri,
        free_cash_flow_per_share: recentFcf && Number(last.date.slice(0, 4)) >= latestEpsYear - 1 ? last.free_cash_flow_per_share : null,
        book_value_per_share: last.book_value_per_share,
      }] : [],
      quarter: [],
    },
    fields: {
      ttm_eps: keptEps.at(-1)?.val ?? null,
      free_cash_flow_per_share: recentFcf?.val ?? null,
      tangible_book: [...rows].reverse().find((row) => row.book_value_per_share != null)?.book_value_per_share ?? null,
      earning_growth_10y: growth10y(keptEps),
      cashflow_growth_10y: recentFcf ? growth10y(fcfHistory) : null,
      predictability: predictability(keptEps),
    },
  }
}

/** Annual per-share rows the financial table and the chart can both read. */
export function financialsFromFacts (facts) {
  return assemble(facts).financials
}

export function fundamentalsFromFacts (symbol, facts) {
  const [market, code] = String(symbol).split(':')
  const built = assemble(facts)
  const fields = {
    symbol: code,
    exchange_: market,
    company: facts.entityName || code,
    currency: '$',
    eps_period: 'FY',
    filingShares: built.filingShares,
    ...built.fields,
    _partial: true,
    _sources: ['edgar'],
    _fiscal: 'FY',
    _filedThrough: built.financials.annual.at(-1)?.date?.slice(0, 4) || null,
  }
  if (fields.ttm_eps == null && fields.tangible_book == null) throw new Error('EDGAR: no fundamentals for ' + code)
  return { fields, financials: built.financials, filingShares: built.filingShares }
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
  return fundamentalsFromFacts(symbol, facts).fields
}

export async function fetchStockFromEdgar (symbol) {
  const { facts } = await loadFacts(symbol)
  return profileFromFacts(symbol, facts)
}
