import axios from 'axios'
import { transport } from '../transport'
import { readStored, writeStored } from '../../lib/storage'
import { windowGrowth } from '../../lib/assumptions'

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
// Known integer split factors. A 3.5-for-1 or other non-standard ratio is
// left unadjusted rather than guessed; add a factor here only with a filing.
export const KNOWN_SPLIT_FACTORS = [2, 3, 4, 5, 10, 20, 25, 50]
// Share-count jump vs a known factor may be 18% off and still count as that split.
export const SHARE_SPLIT_TOLERANCE = 0.18
// EPS restatements use a tighter 8% window so a real earnings swing is not a split.
export const RESTATEMENT_SPLIT_TOLERANCE = 0.08
// If revenue also jumped by more than 55% of the candidate factor, treat it as
// growth (or a real downturn) rather than a unit break. Protects NVDA FY2023.
export const REVENUE_SPLIT_GUARD = 0.55
const EPS_CONCEPTS = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic']
const REVENUE_CONCEPTS = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax']
const OIL_AND_GAS_CAPEX = 'PaymentsToAcquireOilAndGasPropertyAndEquipment'
const OTHER_CAPEX = 'PaymentsToAcquireOtherPropertyPlantAndEquipment'
const CAPEX_CONCEPTS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  OTHER_CAPEX,
  'PurchaseOfPropertyAndEquipment',
]
const IFRS_EQUITY_CONCEPTS = ['EquityAttributableToOwnersOfParent']
const IFRS_OCF_CONCEPTS = ['CashFlowsFromUsedInOperatingActivities']
const IFRS_CAPEX_CONCEPTS = [
  'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  'PurchaseOfPropertyAndEquipment',
]
const IFRS_SHARE_CONCEPTS = [
  'AdjustedWeightedAverageShares',
  'WeightedAverageShares',
]
// Depreciation and share-based compensation are disclosure lines for the
// official owner-earnings identity (M≈D, so OE=E). Missing concepts stay
// empty; they are never invented from EBITDA or net income.
const DA_CONCEPTS = [
  'DepreciationDepletionAndAmortization',
  'DepreciationAmortizationAndAccretionNet',
  'DepreciationAndAmortization',
  'Depreciation',
]
const IFRS_DA_CONCEPTS = [
  'DepreciationAndAmortisationExpense',
  'DepreciationDepletionAndAmortisationExpense',
  'DepreciationExpense',
]
const SBC_CONCEPTS = [
  'ShareBasedCompensation',
  'AllocatedShareBasedCompensationExpense',
]
const IFRS_SBC_CONCEPTS = [
  'ShareBasedPaymentExpense',
  'ShareBasedPaymentArrangementsExpense',
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

const CURRENCY_STATEMENT_CONCEPTS = [
  ['us-gaap', ['NetIncomeLoss', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'OperatingIncomeLoss', 'NetCashProvidedByUsedInOperatingActivities', 'StockholdersEquity']],
  ['ifrs-full', ['ProfitLoss', 'Revenue', 'ProfitLossFromOperatingActivities', 'CashFlowsFromUsedInOperatingActivities', 'EquityAttributableToOwnersOfParent']],
]

/** Latest complete annual statement unit, with enough provenance to audit the choice. */
export function reportingCurrencyFromFacts (facts, verifiedCurrency = null, replayV1 = false) {
  const candidates = []
  for (const [taxonomyName, concepts] of CURRENCY_STATEMENT_CONCEPTS) {
    for (const concept of concepts) {
      for (const [unit, entries] of Object.entries(taxonomy(facts)[taxonomyName]?.[concept]?.units || {})) {
        if (!/^[A-Z]{3}$/.test(unit)) continue
        for (const item of entries) {
          if (!FORMS.has(item.form) || item.fp !== 'FY' || !Number.isFinite(item.val) || !item.end) continue
          const days = durationDays(item)
          if (days != null && (days < 350 || days > 378)) continue
          candidates.push({ currency: unit, concept, taxonomyName, end: item.end, filed: item.filed || '', accn: item.accn || null })
        }
      }
    }
  }
  if (!candidates.length) return { currency: null, conflict: false, evidence: null }
  const latestEnd = candidates.map((item) => item.end).sort().at(-1)
  const latest = candidates.filter((item) => item.end === latestEnd)
  const verified = verifiedCurrency && latest.find((item) => item.currency === verifiedCurrency)
  if (verified) return { currency: verifiedCurrency, conflict: false, evidence: verified }
  if (verifiedCurrency) return { currency: null, conflict: true, evidence: latest[0] }
  let currencies = [...new Set(latest.map((item) => item.currency))]
  const epsFor = (currency) => {
    const gaap = annualSelection(facts, EPS_CONCEPTS, currency + '/shares', 'us-gaap').series
    if (gaap.length >= 2) return gaap
    return annualSelection(facts, ['DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare'], currency + '/shares', 'ifrs-full').series
  }
  const eps = new Map(currencies.map((currency) => [currency, epsFor(currency)]))
  const shares = normalizeShareUnits(annualPrefer(facts, SHARE_CONCEPTS, IFRS_SHARE_CONCEPTS, 'shares', true, replayV1))
  const coherent = (currency) => {
    const income = annualPrefer(facts, NET_INCOME_CONCEPTS, IFRS_NET_INCOME_CONCEPTS, currency, false, replayV1)
    for (const point of [...eps.get(currency)].reverse()) {
      const profit = income.find((item) => item.fy === point.fy)?.val
      const count = shares.find((item) => item.fy === point.fy)?.val
      if (!(profit > 0 || profit < 0) || !(count > 0)) continue
      const ratio = Math.abs(point.val * count / profit)
      return ratio >= 0.2 && ratio <= 5
    }
    return null
  }
  const coherence = new Map(currencies.map((currency) => [currency, coherent(currency)]))
  const proven = currencies.filter((currency) => coherence.get(currency) === true)
  if (proven.length) currencies = proven
  const supported = currencies.filter((currency) => eps.get(currency).length >= 2)
  // A dollar tag that repeats the same local-currency numbers is a label copy,
  // not a translated series. Exclude it only when another statement currency
  // can carry the per-share data.
  if (supported.includes('USD') && supported.length > 1) {
    const usd = new Map(eps.get('USD').map((point) => [point.fy, point.val]))
    const copied = supported.filter((currency) => currency !== 'USD').some((currency) => {
      const same = eps.get(currency).filter((point) => usd.has(point.fy) && Math.abs(usd.get(point.fy) - point.val) < 0.000001)
      return same.length >= 2
    })
    if (copied) currencies = currencies.filter((currency) => currency !== 'USD')
  }
  const choices = currencies.filter((currency) => eps.get(currency).length >= 2)
  if (!choices.length && currencies.length === 1) choices.push(currencies[0])
  if (choices.length !== 1) {
    return { currency: null, conflict: true, evidence: latest.sort((a, b) => a.concept.localeCompare(b.concept))[0] }
  }
  const currency = choices[0]
  const evidence = latest.filter((item) => item.currency === currency)
    .sort((a, b) => String(b.filed).localeCompare(String(a.filed)) || a.concept.localeCompare(b.concept))[0]
  return { currency, conflict: false, evidence }
}

/** Comparative columns in a 10-K reuse the filing's fy. The period end is the year. */
function periodYear (item) {
  const end = Number(String(item.end || '').slice(0, 4))
  if (end > 1980 && end < 2100) return end
  return Number.isFinite(item.fy) ? item.fy : null
}

/** One concept, one unit. A full fiscal year beats a later stub with the same period end. */
function annualConcept (facts, concept, unit, taxonomyName = 'us-gaap', preferEarliest = false, completeOnly = false) {
  const entries = taxonomy(facts)[taxonomyName]?.[concept]?.units?.[unit]
  if (!entries) return []
  const byYear = new Map()
  for (const item of entries) {
    if (!FORMS.has(item.form) || item.fp !== 'FY' || !Number.isFinite(item.val)) continue
    const days = durationDays(item)
    if (completeOnly && days != null && (days < 350 || days > 378)) continue
    const full = days == null || days >= 300
    const filed = String(item.filed || item.end || '')
    const year = periodYear(item)
    if (!year) continue
    const prev = byYear.get(year)
    const newerOrOlder = !prev ? true : (preferEarliest ? filed < prev.filed : filed >= prev.filed)
    const better = !prev || (full && !prev.full) || (full === prev.full && newerOrOlder)
    if (better) byYear.set(year, { val: item.val, full, filed, start: item.start || null, end: item.end || null, accn: item.accn })
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0])
    .map(([fy, { val, filed, start, end, accn }]) => ({ fy, val, filed, start, end, accn }))
}

/**
 * Freshest concept that can support a history. The first concept with two
 * points used to win even when those points stopped a decade ago.
 */
function annual (facts, concepts, unit, taxonomyName = 'us-gaap', preferEarliest = false) {
  return annualSelection(facts, concepts, unit, taxonomyName, preferEarliest).series
}

function annualSelection (facts, concepts, unit, taxonomyName, preferEarliest = false, completeOnly = false) {
  let best = []
  let chosen = null
  for (const concept of concepts) {
    const series = annualConcept(facts, concept, unit, taxonomyName, preferEarliest, completeOnly)
    if (series.length < 2) continue
    const newer = (series.at(-1)?.fy || 0) > (best.at(-1)?.fy || 0)
    const longer = (series.at(-1)?.fy || 0) === (best.at(-1)?.fy || 0) && series.length > best.length
    if (newer || longer) {
      best = series
      chosen = concept
    }
  }
  return { series: best.slice(-YEAR_LIMIT), points: taxonomy(facts)[taxonomyName]?.[chosen]?.units?.[unit] || [] }
}

/** Prefer the most recent compatible series. Keep one taxonomy per history. */
function annualPrefer (facts, gaapConcepts, ifrsConcepts, unit, preferEarliest = false, replayV1 = false) {
  const gaap = annual(facts, gaapConcepts, unit, 'us-gaap', preferEarliest)
  if (replayV1 && gaap.length >= 2) return gaap
  const ifrs = ifrsConcepts?.length ? annual(facts, ifrsConcepts, unit, 'ifrs-full', preferEarliest) : []
  return seriesPeriod(ifrs) > seriesPeriod(gaap) ? ifrs : gaap
}

const seriesPeriod = series => series.at(-1)?.end || String(series.at(-1)?.fy || '')

// Some 10-Ks disclose oil and gas additions separately from other PP&E.
// Use those lines only when both reconcile to the same filing and cash-flow period.
function sameFilingCapitalSpending (facts, operatingCash, totalConcepts, currency) {
  const days = durationDays(operatingCash)
  if (!operatingCash.accn || days == null || days < 300 || !currency) return null

  const gaap = taxonomy(facts)['us-gaap']
  const matchingPayment = (concept) => {
    const entries = gaap?.[concept]?.units?.[currency] || []
    const payments = new Set(entries.filter((item) =>
      item.accn === operatingCash.accn && item.start === operatingCash.start && item.end === operatingCash.end &&
      FORMS.has(item.form) && item.fp === 'FY' && Number.isFinite(item.val),
    ).map((item) => Math.abs(item.val)))
    return payments.size === 1 ? payments.values().next().value : null
  }
  for (const concept of totalConcepts) {
    const payment = matchingPayment(concept)
    if (payment != null) return payment
  }
  const oilAndGas = matchingPayment(OIL_AND_GAS_CAPEX)
  const other = matchingPayment(OTHER_CAPEX)
  return oilAndGas == null || other == null ? null : oilAndGas + other
}

// Filers sometimes tag per-share amounts as USD/share (singular). The unit is
// selected from the statement currency above; a same-named USD tag carrying a
// local-currency number must never be treated as proof of a dollar series.
function earningsSeries (facts, concepts, taxonomyName, currency, replayV1) {
  if (!currency) return { series: [], points: [] }
  const plural = annualSelection(facts, concepts, currency + '/shares', taxonomyName, false, !replayV1)
  if (replayV1 && plural.series.length >= 2) return plural
  const singular = annualSelection(facts, concepts, currency + '/share', taxonomyName, false, !replayV1)
  return seriesPeriod(singular.series) > seriesPeriod(plural.series) ? singular : plural
}

/** EPS stays in the issuer's reporting currency per ordinary share. */
function earningsPerShare (facts, currency, replayV1) {
  const direct = earningsSeries(facts, EPS_CONCEPTS, 'us-gaap', currency, replayV1)
  if (replayV1 && direct.series.length >= 2) return direct
  const ifrsConcepts = ['DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare']
  const ifrs = earningsSeries(facts, ifrsConcepts, 'ifrs-full', currency, replayV1)
  return seriesPeriod(ifrs.series) > seriesPeriod(direct.series) ? ifrs : direct
}

// Use the current and comparative YTD figures in the same 10-Q. The 10-K
// and the original comparative must agree with that basis before bridging.
function trailingReportedEps (points, year) {
  if (!year?.start || durationDays(year) < 350 || durationDays(year) > 378) return null
  const next = Date.parse(year.end) + 86400000
  const quarters = points.filter((point) => point.form === '10-Q' && point.accn &&
    point.filed >= point.end && Number.isFinite(point.val) && durationDays(point) >= 75 && durationDays(point) <= 290)
  // Prefer the original report over the same period quoted a year later.
  const current = quarters.filter((point) => Date.parse(point.start) === next)
    .sort((a, b) => b.end.localeCompare(a.end) || a.filed.localeCompare(b.filed))[0]
  if (!current || current.filed <= year.filed) return null
  const prior = quarters.find((point) => point.accn === current.accn && point.start === year.start &&
    Math.abs(durationDays(point) - durationDays(current)) <= 7)
  if (!prior) return null
  const original = quarters.filter((point) => point.start === prior.start && point.end === prior.end && point.filed <= year.filed)
    .sort((a, b) => b.filed.localeCompare(a.filed))[0]
  if (!original || original.val === 0 || original.val !== prior.val) return null
  return { val: Number((year.val + current.val - prior.val).toFixed(4)), end: current.end }
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
  for (const factor of KNOWN_SPLIT_FACTORS) {
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
    if (revenueRatio > factor * REVENUE_SPLIT_GUARD) continue
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
  return nearestSplitWithin(ratio, SHARE_SPLIT_TOLERANCE)
}

/** @param {number} ratio */
export function knownSplitFactor (ratio, tolerance = SHARE_SPLIT_TOLERANCE) {
  return nearestSplitWithin(ratio, tolerance)
}

/**
 * When share counts start after a split, there is no jump to see. The same
 * fiscal year's EPS in a later 10-K is often restated onto the new share
 * basis; that ratio is the split, and item.fy on the later row is the
 * split-year filing.
 */
function restatementSplits (facts, currency) {
  if (!currency) return []
  const splits = []
  const seen = new Set()
  const taxonomies = [
    ['us-gaap', EPS_CONCEPTS],
    ['ifrs-full', ['DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare']],
  ]
  for (const [taxonomyName, concepts] of taxonomies) {
    for (const concept of concepts) {
      const entries = taxonomy(facts)[taxonomyName]?.[concept]?.units?.[currency + '/shares']
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
              ? nearestSplitWithin(basis.val / after.val, RESTATEMENT_SPLIT_TOLERANCE)
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

function neighborsConsistent (prev, next) {
  if (!(prev.val > 0) || !(next.val > 0)) return false
  const ratio = next.val / prev.val
  return ratio >= 0.4 && ratio <= 2.5
}

function ratioNearSplit (ratio) {
  if (!(ratio > 0)) return null
  return nearestSplitWithin(ratio, SHARE_SPLIT_TOLERANCE) || nearestSplitWithin(1 / ratio, SHARE_SPLIT_TOLERANCE)
}

/** Revenue or operating income moved the same way: this is a real year, not a bad tag. */
function companionConfirms (point, prev, next, companions) {
  for (const series of companions) {
    const older = series.find((item) => item.fy === prev.fy)?.val
    const mid = series.find((item) => item.fy === point.fy)?.val
    const newer = series.find((item) => item.fy === next.fy)?.val
    if (!(older > 0) || !Number.isFinite(mid) || !(newer > 0)) continue
    const epsDown = point.val < prev.val && point.val < next.val
    const epsUp = point.val > prev.val && point.val > next.val
    const otherDown = mid < older && mid < newer
    const otherUp = mid > older && mid > newer
    if ((epsDown && otherDown) || (epsUp && otherUp)) return true
  }
  return false
}

/**
 * A one-year hole is only dropped when it looks like a missed split or a
 * unit error: both neighbours sit near the same split factor, or both are
 * off by 20x or more, and those neighbours are consistent with each other.
 * A genuine downturn that later recovered (NVIDIA FY2023) must stay visible.
 */
function isolatedTagError (point, prev, next) {
  if (!neighborsConsistent(prev, next)) return false
  const left = prev.val / point.val
  const right = next.val / point.val
  const leftSplit = ratioNearSplit(left)
  const rightSplit = ratioNearSplit(right)
  if (leftSplit && leftSplit === rightSplit) return true
  return Math.max(left, 1 / left) >= 20 && Math.max(right, 1 / right) >= 20
}

function dropCliffs (series, companions = []) {
  return series.filter((point, index) => {
    const prev = series[index - 1]
    const next = series[index + 1]
    if (!prev || !next || !(point.val > 0) || !(prev.val > 0) || !(next.val > 0)) return true
    const dip = point.val < prev.val * 0.45 && point.val < next.val * 0.45
    const spike = point.val > prev.val * 2.5 && point.val > next.val * 2.5
    if (!dip && !spike) return true
    if (companionConfirms(point, prev, next, companions)) return true
    return !isolatedTagError(point, prev, next)
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

const isScaledPerShareKey = (key) => key === 'ttm_eps' || key === 'ttm_eps_nri' || key === 'tangible_book' ||
  key === 'eps_without_nri' || key.endsWith('_per_share')

/** Scale every per-share field on a flat object. Totals and growth rates are left alone. */
export function scalePerShareFields (object, factor) {
  if (!object || typeof object !== 'object' || !(factor > 0) || Math.abs(factor - 1) < 1e-9) return object
  const next = { ...object }
  for (const [key, value] of Object.entries(next)) {
    if (isScaledPerShareKey(key) && typeof value === 'number' && Number.isFinite(value)) next[key] = scaleValue(value, factor)
  }
  return next
}

/** Divide every per-share figure by a post-filing split. A factor below 1 scales an ADR up. */
export function scalePerShare (pack, factor) {
  if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return pack
  return {
    ...pack,
    fields: scalePerShareFields(pack.fields, factor),
    financials: {
      annual: (pack.financials?.annual || []).map((row) => scalePerShareFields(row, factor)),
      ttm: (pack.financials?.ttm || []).map((row) => scalePerShareFields(row, factor)),
      quarter: (pack.financials?.quarter || []).map((row) => scalePerShareFields(row, factor)),
    },
  }
}

/** Same scaling as scalePerShare, for an already-written snapshot record. */
export function scaleSnapshotRecord (record, factor) {
  if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return record
  const financials = record.financials || {}
  return {
    ...scalePerShareFields(record, factor),
    financials: {
      ...financials,
      annual: (financials.annual || []).map((row) => scalePerShareFields(row, factor)),
      ttm: (financials.ttm || []).map((row) => scalePerShareFields(row, factor)),
      quarter: (financials.quarter || []).map((row) => scalePerShareFields(row, factor)),
    },
  }
}

// Same window contract as A/H statements; official values also call this function.
export const growthWindow = windowGrowth

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


// First-release non-operating whitelist: totals only. Component tags in the
// same family are ignored so a total and its parts cannot be added twice.
export const QUALITY_WHITELIST_CONCEPTS = ['EquitySecuritiesFvNiGainLoss']
const NET_INCOME_CONCEPTS = ['NetIncomeLoss', 'ProfitLoss']
const IFRS_NET_INCOME_CONCEPTS = ['ProfitLoss']
const OPERATING_INCOME_CONCEPTS = ['OperatingIncomeLoss']
const IFRS_OPERATING_INCOME_CONCEPTS = ['ProfitLossFromOperatingActivities']

function conceptUnits (facts, concept, unit, taxonomyName = 'us-gaap') {
  return taxonomy(facts)[taxonomyName]?.[concept]?.units?.[unit] || []
}

function annualByYear (facts, concepts, unit, taxonomyName = 'us-gaap') {
  const byYear = new Map()
  for (const concept of concepts) {
    for (const point of annualConcept(facts, concept, unit, taxonomyName)) {
      if (!byYear.has(point.fy)) byYear.set(point.fy, point)
    }
    if (byYear.size) break
  }
  return byYear
}

function preferAnnualByYear (facts, gaapConcepts, ifrsConcepts, unit) {
  const gaap = annualByYear(facts, gaapConcepts, unit, 'us-gaap')
  if (gaap.size) return gaap
  if (ifrsConcepts?.length) return annualByYear(facts, ifrsConcepts, unit, 'ifrs-full')
  return gaap
}

const fullYear = (item) => {
  const days = durationDays(item)
  return days == null || (days >= 350 && days <= 378)
}

const ytdSpan = (item) => {
  const days = durationDays(item)
  return days != null && days >= 75 && days <= 290
}

function pickDuration (entries, predicate, preferEarliest = false) {
  const matches = entries.filter((item) => Number.isFinite(item.val) && predicate(item))
  if (!matches.length) return null
  return [...matches].sort((a, b) => preferEarliest
    ? String(a.filed || '').localeCompare(String(b.filed || ''))
    : String(b.filed || '').localeCompare(String(a.filed || '')))[0]
}

/**
 * Twelve-month total ending on `end`, using a full-year fact when one exists
 * or the same 10-Q current/comparative bridge as trailing EPS. A single
 * quarter is never treated as TTM.
 */
export function trailingTotal (entries, end, annualPoint) {
  if (!end) return null
  const direct = pickDuration(entries, (item) => item.end === end && fullYear(item))
  if (direct) return { val: direct.val, end: direct.end, start: direct.start || null }
  if (!annualPoint?.end || !annualPoint.start || !fullYear(annualPoint)) return null
  const next = Date.parse(annualPoint.end) + 86400000
  const quarters = entries.filter((item) =>
    (item.form === '10-Q' || item.form === '20-F') && item.accn && item.filed >= item.end
    && Number.isFinite(item.val) && ytdSpan(item))
  const current = quarters.filter((item) => Date.parse(item.start) === next && item.end === end)
    .sort((a, b) => b.end.localeCompare(a.end) || a.filed.localeCompare(b.filed))[0]
  if (!current || current.filed <= annualPoint.filed) return null
  const prior = quarters.find((item) => item.accn === current.accn && item.start === annualPoint.start
    && Math.abs(durationDays(item) - durationDays(current)) <= 7)
  if (!prior) return null
  const original = quarters.filter((item) => item.start === prior.start && item.end === prior.end && item.filed <= annualPoint.filed)
    .sort((a, b) => b.filed.localeCompare(a.filed))[0]
  if (!original || original.val !== prior.val) return null
  return { val: annualPoint.val + current.val - prior.val, end: current.end, start: annualPoint.start }
}

function firstPresentEntries (facts, concepts, unit, taxonomies = ['us-gaap', 'ifrs-full']) {
  for (const taxonomyName of taxonomies) {
    for (const concept of concepts) {
      const entries = conceptUnits(facts, concept, unit, taxonomyName)
      if (entries.length) return { concept, taxonomyName, entries }
    }
  }
  return { concept: null, taxonomyName: null, entries: [] }
}

/**
 * Period totals used by the official quality gate. The whitelist is searched
 * even when it is empty: a missing total is N = 0, not unknown.
 */
export function qualityFactsFromFacts (facts, { ttmEnd = null, ttmAnnualEnd = null, currency = 'USD' } = {}) {
  const searched = true
  const gainMap = preferAnnualByYear(facts, QUALITY_WHITELIST_CONCEPTS, QUALITY_WHITELIST_CONCEPTS, currency)
  const niMap = preferAnnualByYear(facts, NET_INCOME_CONCEPTS, IFRS_NET_INCOME_CONCEPTS, currency)
  const oiMap = preferAnnualByYear(facts, OPERATING_INCOME_CONCEPTS, IFRS_OPERATING_INCOME_CONCEPTS, currency)
  const years = new Set([...gainMap.keys(), ...niMap.keys(), ...oiMap.keys()])
  const annual = [...years].sort((a, b) => a - b).map((fy) => ({
    fy,
    end: gainMap.get(fy)?.end || niMap.get(fy)?.end || oiMap.get(fy)?.end || null,
    n: gainMap.has(fy) ? gainMap.get(fy).val : 0,
    ni: niMap.get(fy)?.val ?? null,
    oi: oiMap.get(fy)?.val ?? null,
    searched,
  }))
  const gainEntries = firstPresentEntries(facts, QUALITY_WHITELIST_CONCEPTS, currency).entries
  const niEntries = firstPresentEntries(facts, [...NET_INCOME_CONCEPTS, ...IFRS_NET_INCOME_CONCEPTS], currency).entries
  const oiEntries = firstPresentEntries(facts, [...OPERATING_INCOME_CONCEPTS, ...IFRS_OPERATING_INCOME_CONCEPTS], currency).entries
  const annualEnd = ttmAnnualEnd || annual.at(-1)?.end || null
  const annualPointFor = (entries) => {
    if (!annualEnd) return null
    return pickDuration(entries, (item) => item.end === annualEnd && (item.form === '10-K' || item.form === '20-F' || item.fp === 'FY') && fullYear(item))
      || pickDuration(entries, (item) => item.end === annualEnd && fullYear(item))
  }
  const end = ttmEnd || annualEnd
  const ttm = end
    ? {
        end,
        n: trailingTotal(gainEntries, end, annualPointFor(gainEntries))?.val ?? (end === annualEnd ? (annual.at(-1)?.n ?? 0) : null),
        ni: trailingTotal(niEntries, end, annualPointFor(niEntries))?.val ?? (end === annualEnd ? (annual.at(-1)?.ni ?? null) : null),
        oi: trailingTotal(oiEntries, end, annualPointFor(oiEntries))?.val ?? (end === annualEnd ? (annual.at(-1)?.oi ?? null) : null),
        searched,
      }
    : null
  // A searched miss on the same fiscal-year period is N = 0. A TTM period that
  // cannot be bridged stays null so the quality gate can mark it unknown.
  if (ttm && ttm.n == null && ttm.searched && end === annualEnd) ttm.n = 0
  return { annual, ttm, searched }
}

function attachQuality (row, fy, quality) {
  const match = quality.annual.find((item) => item.fy === fy)
    || quality.annual.find((item) => item.end && row.date && item.end.slice(0, 7) === String(row.date).slice(0, 7))
  row.quality_facts_searched = true
  row.equity_securities_fv_ni_gain_loss = match ? match.n : 0
  row.net_income = match?.ni ?? null
  row.operating_income = match?.oi ?? null
  return row
}

function assemble (facts, units) {
  // Archived v1 studies keep the selector that generated their frozen inputs.
  const replayV1 = units?.replayV1 === true
  const statement = reportingCurrencyFromFacts(facts, units?.reportingCurrency, replayV1)
  const unitsConfirmed = units && statement.currency === units.reportingCurrency
  // Some issuers publish a USD translation of their per-share numbers. Use
  // that series only when verified for the listing and keep the report currency
  // independent for the required return.
  const currency = unitsConfirmed ? units.perShareCurrency : statement.currency
  const selectAnnual = (gaap, ifrs, unit = currency, preferEarliest = false) => annualPrefer(facts, gaap, ifrs, unit, preferEarliest, replayV1)
  const { series: reportedEps, points: epsFacts } = earningsPerShare(facts, currency, replayV1)
  const revenue = selectAnnual(REVENUE_CONCEPTS, ['Revenue'])
  const operating = selectAnnual(['OperatingIncomeLoss'], ['ProfitLossFromOperatingActivities'])
  const equity = selectAnnual(['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], IFRS_EQUITY_CONCEPTS)
  const goodwill = annual(facts, ['Goodwill'], currency)
  const intangibles = annual(facts, ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet'], currency)
  const ifrsIntangibles = annual(facts, ['IntangibleAssetsAndGoodwill'], currency, 'ifrs-full')
  const ocf = selectAnnual(['NetCashProvidedByUsedInOperatingActivities'], IFRS_OCF_CONCEPTS)
  const da = selectAnnual(DA_CONCEPTS, IFRS_DA_CONCEPTS)
  const sbc = selectAnnual(SBC_CONCEPTS, IFRS_SBC_CONCEPTS)
  const separatesOilAndGas = annualConcept(facts, OIL_AND_GAS_CAPEX, currency).length > 0
  const capexConcepts = separatesOilAndGas ? CAPEX_CONCEPTS.filter((concept) => concept !== OTHER_CAPEX) : CAPEX_CONCEPTS
  const capex = selectAnnual(capexConcepts, IFRS_CAPEX_CONCEPTS)
  // Later 10-Ks sometimes restate older share counts onto a post-split basis.
  // Keep the original filing so the jump stays in the split year; otherwise
  // the same split is also detected from EPS and applied twice.
  const shares = normalizeShareUnits(selectAnnual(SHARE_CONCEPTS, IFRS_SHARE_CONCEPTS, 'shares', true))
  const { adjusted, splits: shareSplits } = splitAdjustedShares(shares, new Map(revenue.map((item) => [item.fy, item.val])))
  const splits = mergeSplits(shareSplits, restatementSplits(facts, currency))
  const restatedEps = rescaleFiledEps(reportedEps, splits)
  const cliffYears = new Set(restatedEps.map((point) => point.fy))
  for (const point of dropCliffs(restatedEps, [revenue, operating])) cliffYears.delete(point.fy)
  const keptEps = restatedEps.filter((point) => !cliffYears.has(point.fy))
  const fcf = []
  for (const point of ocf) {
    const total = findYear(capex, point.fy)
    const spending = total ?? (separatesOilAndGas ? sameFilingCapitalSpending(facts, point, capexConcepts, currency) : null)
    if (spending != null) fcf.push({ fy: point.fy, val: point.val - Math.abs(spending) })
  }
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
  const useIfrsDeduct = goodwill.length < 2 && intangibles.length < 2
  const rows = years.map((fy) => {
    const book = findYear(equity, fy)
    const count = shareFor(fy)
    const deduct = useIfrsDeduct
      ? (findYear(ifrsIntangibles, fy) || 0)
      : ((findYear(goodwill, fy) || 0) + (findYear(intangibles, fy) || 0))
    const tangible = book == null || !(count > 0)
      ? null
      : Number(((book - deduct) / count).toFixed(4))
    return {
      date: keptEps.find((point) => point.fy === fy)?.end?.slice(0, 7) || fy + '-12',
      eps_without_nri: cliffYears.has(fy) ? null : findYear(keptEps, fy),
      revenue_per_share: perShare(revenue, fy),
      operating_income_per_share: perShare(operating, fy),
      ebitda_per_share: null,
      free_cash_flow_per_share: perShare(fcf, fy),
      depreciation_amortization_per_share: perShare(da, fy),
      share_based_comp_per_share: perShare(sbc, fy),
      dividends_per_share: null,
      book_value_per_share: tangible,
    }
  })
  const latestEpsYear = keptEps.at(-1)?.fy || years.at(-1) || 0
  const trailingPreview = trailingReportedEps(epsFacts, keptEps.at(-1))
  const quality = qualityFactsFromFacts(facts, {
    ttmEnd: trailingPreview?.end || keptEps.at(-1)?.end || null,
    ttmAnnualEnd: keptEps.at(-1)?.end || null,
    currency,
  })
  for (const row of rows) {
    const fy = Number(String(row.date || '').slice(0, 4))
    attachQuality(row, fy, quality)
    const capexVal = findYear(capex, fy)
    row.operating_cash_flow_per_share = perShare(ocf, fy)
    row.capex_per_share = capexVal == null || !(shareFor(fy) > 0)
      ? null
      : Number((Math.abs(capexVal) / shareFor(fy)).toFixed(4))
  }
  const fcfHistory = rows
    .filter((row) => row.free_cash_flow_per_share != null)
    .map((row) => ({ fy: Number(row.date.slice(0, 4)), val: row.free_cash_flow_per_share }))
  const recentFcf = [...fcfHistory].reverse().find((point) => point.fy >= latestEpsYear - 1) || null
  const last = rows.find((row) => Number(row.date.slice(0, 4)) === latestEpsYear) || rows.at(-1)
  const lastAnnualEps = keptEps.at(-1)
  const trailingEps = trailingReportedEps(epsFacts, lastAnnualEps)
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
      reporting_currency: statement.currency,
      reporting_currency_source: unitsConfirmed ? units.source : statement.evidence
        ? [statement.evidence.taxonomyName, statement.evidence.concept, statement.evidence.currency, statement.evidence.end, statement.evidence.accn].filter(Boolean).join(':')
        : null,
      per_share_currency: currency,
      unit_unreconciled: !statement.currency,
      ttm_eps: trailingEps?.val ?? lastAnnualEps?.val ?? null,
      eps_as_of: trailingEps?.end ?? lastAnnualEps?.end ?? null,
      eps_period: trailingEps ? 'TTM' : 'FY',
      free_cash_flow_per_share: recentFcf?.val ?? null,
      tangible_book: [...rows].reverse().find((row) => row.book_value_per_share != null)?.book_value_per_share ?? null,
      earning_growth_10y: growthWindow(keptEps, 10),
      earning_growth_5y: growthWindow(keptEps, 5),
      earning_growth_1y: growthWindow(keptEps, 1),
      cashflow_growth_10y: recentFcf ? growthWindow(fcfHistory, 10) : null,
      cashflow_growth_5y: recentFcf ? growthWindow(fcfHistory, 5) : null,
      cashflow_growth_1y: recentFcf ? growthWindow(fcfHistory, 1) : null,
      predictability: predictability(keptEps),
      ttm_nonoperating_gain: quality.ttm?.n ?? null,
      ttm_net_income: quality.ttm?.ni ?? null,
      ttm_operating_income: quality.ttm?.oi ?? null,
      ttm_quality_as_of: quality.ttm?.end ?? trailingEps?.end ?? lastAnnualEps?.end ?? null,
      ttm_quality_facts_searched: true,
    },
  }
}

/** Annual per-share rows the financial table and the chart can both read. */
export function financialsFromFacts (facts) {
  return assemble(facts).financials
}

export function fundamentalsFromFacts (symbol, facts, units) {
  const [market, code] = String(symbol).split(':')
  const built = assemble(facts, units)
  const fields = {
    symbol: code,
    exchange_: market,
    company: facts.entityName || code,
    currency: '$',
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
