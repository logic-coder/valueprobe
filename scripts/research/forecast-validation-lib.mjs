/**
 * Walk-forward forecast-validation harness (maintainer tool).
 *
 * This is a policy-evaluation harness for maintainers, not a user-facing
 * feature and not a release gate on official values or published artifacts.
 * It does not change official growth, discount, or published bytes.
 *
 * Modes:
 *   official (default) — factor experiment on the official v3 published
 *     path. Every cell uses the same presentValue() machinery (linear fade,
 *     finite terminal years, continuation) and the same official discount
 *     and terminal. Bases (earnings, cash, midpoint, official-selected) and
 *     growth rules (zero, five-year, ten-year, slower official window) are
 *     crossed independently. The official-selected base comes from toStock()
 *     plus blendOfficialBase() (normalised earnings, cash median, 50–200%
 *     midpoint, latest-FY upshift when the rule fires). The frozen 2006-03-15
 *     five-name US industrials panel is a harness debug set, not a general
 *     acceptance sample. Additional frozen panels may be added under
 *     forecast-validation-panels/; do not backfill today's survivors.
 *   historical — reproduces the 2026-11-22 research-branch run (naive CAGRs,
 *     5/10/1 blend, hardcoded 11% discount, no terminal). That file is a
 *     historical research artifact, not an official v3 result.
 *
 * The retired constant-explicit-plus-Gordon official table is frozen at
 * forecast-validation-official-legacy-gordon-2006.json and is not a growth
 * comparison (it mixed a five-year earnings median with a three-year cash
 * median).
 *
 * From repo root:
 *   npm run research:forecast
 *   npm run research:forecast -- --check
 *   npm run research:forecast -- --historical
 *   npm run research:forecast -- --historical --check
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { windowGrowth, officialGrowth, MAX_UNDERWRITTEN_GROWTH } from '../../src/lib/assumptions.js'
import { blendOfficialBase, presentValue, round2, valueBand } from '../../src/lib/dcf.js'
import { toStock } from '../../src/lib/stockRecord.js'
import {
  POLICY_VERSION, POLICY_V1, POLICY_V1_HASH,
  policyDiscountRate, policyFallbackDiscountRate, policyValue,
} from '../../src/lib/policy.js'

// Research-branch blend weights, kept here as an experimental comparison.
// Official v3 does not use a 5/10/1 blend as the published growth rate.
export const RESEARCH_GROWTH_BLEND = Object.freeze({
  oneYear: 0.2,
  fiveYear: 0.5,
  tenYear: 0.3,
})
export const DAMPENING_REFERENCE = 0.5
// Hardcoded in the 2026-11-22 research run. It happened to equal
// ceil(4.73) + 6, but historical mode must not drift with later policy edits.
export const HISTORICAL_DISCOUNT_RATE = 11

export const HISTORICAL_OUT = 'scripts/research/forecast-validation-research-2006.json'
export const OFFICIAL_OUT = 'scripts/research/forecast-validation-official.json'
export const LEGACY_GORDON_OUT = 'scripts/research/forecast-validation-official-legacy-gordon-2006.json'
export const PANEL_PATH = 'scripts/research/cash-path-inputs.json'
export const EXPANSION_PANELS_DIR = 'scripts/research/forecast-validation-panels'
// Must match the continuation cap in src/lib/dcf.js (not exported).
export const CONTINUATION_SPREAD = 0.02
export const BASE_KEYS = Object.freeze(['earnings', 'cash', 'midpoint', 'officialSelected'])
export const GROWTH_KEYS = Object.freeze(['zero', 'five', 'ten', 'slower'])

const root = process.cwd()

export const med = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return null
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const cashPerShare = (row) => (row.ocf - row.capex) / row.shares
const smape = (p, a) => (p === 0 && a === 0) ? 0 : 200 * Math.abs(p - a) / (Math.abs(p) + Math.abs(a))
export const round4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)

export function forecastFlows (base, growth, years) {
  const flows = []
  let cash = base
  for (let t = 1; t <= years; t++) {
    cash *= 1 + growth / 100
    flows.push(cash)
  }
  return flows
}

/**
 * Present value of explicit forecast flows. When terminalGrowthRate is a
 * finite number, a Gordon continuation is added after the last explicit year.
 * The frozen 2006 panel has no observed terminal cash, so default scoring
 * omits it; expanded official reruns should pass official tg.
 */
export function discountFlows (flows, discountRate, terminalGrowthRate = null) {
  if (!Array.isArray(flows) || !flows.length || !Number.isFinite(discountRate)) return null
  const r = discountRate / 100
  const explicit = flows.reduce((sum, cash, i) => sum + cash / (1 + r) ** (i + 1), 0)
  if (!Number.isFinite(terminalGrowthRate)) return explicit
  const last = flows.at(-1)
  const continuing = last * (1 + terminalGrowthRate / 100)
  if (!(r > terminalGrowthRate / 100) || !(continuing > 0) || !Number.isFinite(continuing)) return null
  return explicit + continuing / (r - terminalGrowthRate / 100) / (1 + r) ** flows.length
}

function naiveCagr (series, years) {
  const last = series.at(-1)
  if (!last || !(last.val > 0)) return null
  const first = series.find((row) => row.fy === last.fy - years)
  if (!first || !(first.val > 0)) return null
  const rate = (Math.pow(last.val / first.val, 1 / years) - 1) * 100
  return Number.isFinite(rate) ? rate : null
}

function blendedRate (g5, g10, g1) {
  if (![g5, g10, g1].every((x) => x !== null && Number.isFinite(x))) return null
  return RESEARCH_GROWTH_BLEND.fiveYear * g5
    + RESEARCH_GROWTH_BLEND.tenYear * g10
    + RESEARCH_GROWTH_BLEND.oneYear * g1
}

function epsSeries (company, study = null) {
  const rows = Array.isArray(company.epsSeries)
    ? company.epsSeries.map((row) => ({ fy: Number(row?.fy), val: Number(row?.val ?? row?.eps), periodEnd: row?.periodEnd, availableAt: row?.availableAt, source: row?.source }))
    : company.epsFrom1995.map((val, i) => ({ fy: 1995 + i, val }))
  return rows.filter((row) => Number.isFinite(row.val) && visibleAt(row, study))
}

function visibleAt (row, study) {
  if (!row?.periodEnd && !row?.availableAt) return true
  if (!study || study.role === 'harness-debug') return true
  return typeof row.periodEnd === 'string' && typeof row.availableAt === 'string'
    && row.periodEnd <= study.asOf && row.availableAt <= study.asOf
}

function completePanelCompany (company) {
  const base = company.baseYears
  const observed = company.observations
  const series = epsSeries(company)
  if (!Array.isArray(base) || base.length !== 3 || !base.every((row) => row.shares > 0)) return null
  if (!Array.isArray(observed) || observed.length !== 10 || !observed.every((row) => row.shares > 0)) return null
  if (series.length < 10) return null
  const flatBase = med(base.map(cashPerShare))
  const latestEps = series.at(-1).val
  const fiveMedian = med(series.slice(-5).map((row) => row.val))
  if (!(flatBase > 0) || !(latestEps > 0) || !(fiveMedian > 0)) return null
  return { series, flatBase, latestEps, fiveMedian, observed }
}

function scoreForecast (flows, realisedPv, discountRate, terminalGrowthRate = null) {
  const predicted = discountFlows(flows, discountRate, terminalGrowthRate)
  if (!Number.isFinite(predicted) || !Number.isFinite(realisedPv)) return null
  return round4(smape(predicted, realisedPv))
}

function medianScores (rows, keys) {
  return Object.fromEntries(keys.map((key) => [key, round4(med(rows.map((row) => row[key])))]))
}

function beats (rows, left, right) {
  return rows.filter((row) => Number.isFinite(row[left]) && Number.isFinite(row[right]) && row[left] < row[right]).length
}

export function loadPanel (cwd = root) {
  return JSON.parse(readFileSync(cwd + '/' + PANEL_PATH, 'utf8'))
}

export function officialDiscountRate (study) {
  const rate = policyDiscountRate(study.yieldPct)
  return Number.isFinite(rate) ? rate : policyFallbackDiscountRate()
}

export function buildHistoricalReport (study) {
  const discountRate = HISTORICAL_DISCOUNT_RATE
  const years = 10
  const rows = []
  for (const company of study.companies) {
    const panel = completePanelCompany(company)
    if (!panel) continue
    const { series, flatBase, latestEps, fiveMedian, observed } = panel
    const g10 = naiveCagr(series, 10)
    const g5 = naiveCagr(series, 5)
    const g1 = naiveCagr(series, 1)
    const blended = blendedRate(g5, g10, g1)
    const damp = blended === null ? null : blended * DAMPENING_REFERENCE
    if (damp === null || g10 === null) continue

    const realisedPv = discountFlows(observed.map(cashPerShare), discountRate, null)
    rows.push({
      ticker: company.ticker,
      flat: scoreForecast(forecastFlows(flatBase, 0, years), realisedPv, discountRate),
      historical: scoreForecast(forecastFlows(latestEps, g10, years), realisedPv, discountRate),
      dampened: scoreForecast(forecastFlows(fiveMedian, damp, years), realisedPv, discountRate),
      blended: scoreForecast(forecastFlows(fiveMedian, blended, years), realisedPv, discountRate),
      excludedAfterSplit: Boolean(company.breakFrom),
    })
  }
  const paired = rows.filter((row) => !row.excludedAfterSplit)
  return {
    kind: 'historical-research-run',
    recorded: '2026-11-22',
    policy: 'research-branch-blended-growth',
    asOf: study.asOf,
    note: 'Historical research run recorded 2026-11-22 under the research-branch growth blend (5y 50%, 10y 30%, 1y 20%), a hardcoded 11% discount, and no terminal value. Frozen entry-date cash panel; discounted ten-year cumulative cash. This is not an official v3 result and must not be treated as a license to change official growth or discount.',
    growthBlend: { ...RESEARCH_GROWTH_BLEND },
    dampeningReference: DAMPENING_REFERENCE,
    discountRate,
    terminalIncluded: false,
    sample: rows.length,
    paired: paired.length,
    medians: medianScores(paired, ['flat', 'historical', 'dampened', 'blended']),
    dampenedBeatsFlat: beats(paired, 'dampened', 'flat'),
    dampenedBeatsHistorical: beats(paired, 'dampened', 'historical'),
    blendedBeatsFlat: beats(paired, 'blended', 'flat'),
    blendedBeatsHistorical: beats(paired, 'blended', 'historical'),
    rows,
  }
}


export function officialHorizon () {
  return {
    years: POLICY_V1.horizon.years,
    yearsOfTerminalGrowth: POLICY_V1.horizon.yearsOfTerminalGrowth,
    terminalGrowthRate: POLICY_V1.horizon.terminalGrowthRate,
  }
}

export function clipOfficialRate (rate) {
  if (!Number.isFinite(rate)) return null
  return Math.max(0, Math.min(MAX_UNDERWRITTEN_GROWTH, rate))
}

export function entryAnnualRows (company, study = null) {
  const series = epsSeries(company, study)
  const datedRows = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => visibleAt(row, study))
  const cashByFy = new Map(datedRows(company.baseYears).map((row) => [Number(row.fy), cashPerShare(row)]))
  const revByFy = new Map(datedRows(company.revenueChecks).map((row) => [Number(row.fy), Number(row.revenue) / Number(row.shares)]))
  const years = new Set(series.map((row) => row.fy))
  for (const year of cashByFy.keys()) years.add(year)
  for (const year of revByFy.keys()) years.add(year)
  return [...years].sort((a, b) => a - b).map((fy) => ({
    date: fy + '-12',
    eps_without_nri: series.find((row) => row.fy === fy)?.val ?? null,
    free_cash_flow_per_share: cashByFy.has(fy) ? cashByFy.get(fy) : null,
    revenue_per_share: revByFy.has(fy) ? revByFy.get(fy) : null,
  }))
}

export function entryStockFromCompany (company, study) {
  const series = epsSeries(company, study)
  if (!series.length) return null
  const latest = series.at(-1).val
  return toStock({
    symbol: company.ticker,
    exchange_: 'NYSE',
    currency: '$',
    reporting_currency: 'USD',
    reporting_currency_source: 'research-panel',
    per_share_currency: 'USD',
    per_share_fx_to_quote: 1,
    as_of: study.asOf,
    ttm_eps: latest,
    ttm_eps_nri: latest,
    financials: { annual: entryAnnualRows(company, study) },
  })
}

/**
 * Official published-path value: presentValue() with linear fade, finite
 * terminal years and continuation. Tangible book is not added (owner model).
 */
export function publishedPathValue (base, growth, discountRate, horizon = officialHorizon()) {
  if (!(base > 0) || !Number.isFinite(growth) || !Number.isFinite(discountRate)) return null
  const result = presentValue(
    0,
    horizon.years,
    discountRate,
    growth,
    base,
    horizon.terminalGrowthRate,
    horizon.yearsOfTerminalGrowth,
    false,
  )
  return Number.isFinite(result.fairValue) && result.fairValue > 0 ? result.fairValue : null
}

/**
 * Realised published-path value: discount the observed explicit-window flows,
 * then attach the same finite terminal years and continuation from the last
 * observed flow. Used for both after-capex cash and, when present, earnings.
 */
export function realizedPublishedPathValue (flows, discountRate, horizon = officialHorizon()) {
  if (!Array.isArray(flows) || !flows.length || !flows.every(Number.isFinite) || !Number.isFinite(discountRate)) return null
  const r = discountRate / 100
  const gc = Math.min(horizon.terminalGrowthRate / 100, r - CONTINUATION_SPREAD)
  let pv = 0
  for (let t = 0; t < flows.length; t++) {
    const discounted = flows[t] / (1 + r) ** (t + 1)
    if (!Number.isFinite(discounted)) return null
    pv += discounted
  }
  const last = flows.at(-1)
  if (!(last > 0) || !(r > gc)) return null
  let flow = last
  const n = flows.length
  const m = horizon.yearsOfTerminalGrowth
  for (let k = 1; k <= m; k++) {
    flow *= 1 + gc
    const discounted = flow / (1 + r) ** (n + k)
    if (!Number.isFinite(discounted)) return null
    pv += discounted
  }
  const continuing = (flow * (1 + gc)) / (r - gc) / (1 + r) ** (n + m)
  if (!Number.isFinite(continuing)) return null
  return round2(pv + continuing)
}

export function scorePublished (predicted, realised) {
  if (!Number.isFinite(predicted) || !Number.isFinite(realised)) return null
  return round4(smape(predicted, realised))
}

function factorGrid (bases, growths, realised, discountRate, horizon) {
  const cells = {}
  for (const baseKey of BASE_KEYS) {
    cells[baseKey] = {}
    for (const growthKey of GROWTH_KEYS) {
      cells[baseKey][growthKey] = scorePublished(
        publishedPathValue(bases[baseKey], growths[growthKey], discountRate, horizon),
        realised,
      )
    }
  }
  return cells
}

function medianFactorTable (rows, cellsOf) {
  const table = {}
  for (const baseKey of BASE_KEYS) {
    table[baseKey] = {}
    for (const growthKey of GROWTH_KEYS) {
      table[baseKey][growthKey] = round4(med(rows.map((row) => cellsOf(row)?.[baseKey]?.[growthKey])))
    }
  }
  return table
}

function observationFlows (observations, field, entryFy) {
  if (!Array.isArray(observations) || observations.length !== 10 || !Number.isFinite(entryFy)) return null
  const ordered = [...observations].sort((left, right) => Number(left?.fy) - Number(right?.fy))
  if (!ordered.every((row, index) => Number(row?.fy) === entryFy + index + 1)) return null
  const flows = ordered.map((row) => {
    if (field === 'cash') return cashPerShare(row)
    const value = Number(row?.eps ?? row?.val ?? row?.earnings)
    return Number.isFinite(value) ? value : null
  })
  return flows.every(Number.isFinite) ? flows : null
}

function predictionOf (value, band = null, status = 'ok', reasons = []) {
  return {
    status,
    value: Number.isFinite(value) && value > 0 ? round4(value) : null,
    low: Number.isFinite(band?.low) ? band.low : null,
    high: Number.isFinite(band?.high) ? band.high : null,
    reasons,
  }
}

function zeroGrowthPrediction (base, discountRate, horizon) {
  if (!(base > 0)) return null
  const band = valueBand({
    tbv: 0, base, discountRate, growthRate: 0, terminalGrowthRate: horizon.terminalGrowthRate,
    years: horizon.years, yearsOfTerminalGrowth: horizon.yearsOfTerminalGrowth, addToFairValue: false,
    bandSpread: POLICY_V1.band.discountSpread, growthSpread: POLICY_V1.band.growthSpread,
    growthCap: POLICY_V1.growth.cap, sustainableGrowth: 0, highGrowth: 0, lowGrowth: 0,
  })
  return predictionOf(band.mid, band, band.mid == null ? 'refused' : 'ok', band.mid == null ? ['NO_BASE_VALUE'] : [])
}

export function evaluateOfficialCompany (company, study, discountRate, horizon = officialHorizon()) {
  const series = epsSeries(company, study)
  const meta = {
    ticker: company.ticker,
    industry: company.industry || null,
    entryYear: company.entryYear ?? series.at(-1)?.fy ?? null,
    excludedAfterSplit: Boolean(company.breakFrom),
  }
  const blocked = {
    ...meta,
    status: meta.excludedAfterSplit ? 'excluded' : 'data-blocked',
    blend: 'none', blendGap: null, upshift: false,
    bases: { earnings: null, cash: null, midpoint: null, officialSelected: null, earningsFiveMedian: null },
    growths: { zero: 0, five: null, ten: null, slower: null, window: null, reason: null, historical5: null, historical10: null },
    publishedValue: null, publishedBaseKind: null, publishedGrowth: null, predictedOfficial: null,
    prediction: predictionOf(null, null, meta.excludedAfterSplit ? 'excluded' : 'data-blocked', ['ENTRY_DATA_MISSING']),
    zeroPrediction: null,
    realisedCash: null, realisedOwnerEarnings: null, hasOwnerEarningsOutcome: false,
    cashCells: null, ownerEarningsCells: null,
  }
  const stock = entryStockFromCompany(company, study)
  if (!stock) return blocked
  const official = officialGrowth({
    growth10: stock.earning_growth_10y,
    growth5: stock.earning_growth_5y,
    hasPositiveBase: stock.earnings_base > 0 && (stock.ttm_eps_nri != null || stock.ttm_eps != null),
  })
  const blended = blendOfficialBase(stock.earnings_base, stock.cash_base, {
    financial: stock.financial_institution === true,
  })
  const fiveMedian = series.length ? med(series.slice(-5).map((row) => row.val)) : null
  const bases = {
    earnings: stock.earnings_base > 0 ? stock.earnings_base : null,
    cash: stock.cash_base > 0 ? stock.cash_base : null,
    midpoint: stock.earnings_base > 0 && stock.cash_base > 0
      ? (stock.earnings_base + stock.cash_base) / 2
      : null,
    officialSelected: blended.action === 'refuse' || blended.action === 'none' ? null : blended.base,
  }
  const growths = {
    zero: 0,
    five: official.historical5 == null ? null : clipOfficialRate(official.historical5),
    ten: official.historical10 == null ? null : clipOfficialRate(official.historical10),
    slower: official.adopted,
  }
  const entryFy = series.at(-1)?.fy
  const cashFlows = observationFlows(company.observations || company.cashObservations, 'cash', entryFy)
  const epsFlows = observationFlows(company.epsObservations, 'eps', entryFy)
  const realisedCash = cashFlows ? realizedPublishedPathValue(cashFlows, discountRate, horizon) : null
  const realisedEarnings = epsFlows ? realizedPublishedPathValue(epsFlows, discountRate, horizon) : null
  const predictedOfficial = publishedPathValue(bases.officialSelected, growths.slower, discountRate, horizon)
  const published = policyValue(stock, { rate: study.yieldPct, generatedAt: study.asOf })
  const prediction = published.status === 'ok'
    ? predictionOf(published.value, published.band)
    : predictionOf(null, published.band, 'refused', published.reasons)
  return {
    ...meta,
    status: meta.excludedAfterSplit ? 'excluded' : published.status === 'ok' ? 'eligible' : 'refused',
    blend: blended.action,
    blendGap: blended.gap == null ? null : round4(blended.gap),
    upshift: stock.base_upshift === true,
    bases: {
      earnings: bases.earnings == null ? null : round4(bases.earnings),
      cash: bases.cash == null ? null : round4(bases.cash),
      midpoint: bases.midpoint == null ? null : round4(bases.midpoint),
      officialSelected: bases.officialSelected == null ? null : round4(bases.officialSelected),
      earningsFiveMedian: fiveMedian == null ? null : round4(fiveMedian),
    },
    growths: {
      zero: 0,
      five: growths.five,
      ten: growths.ten,
      slower: growths.slower,
      window: official.window,
      reason: official.reason,
      historical5: official.historical5,
      historical10: official.historical10,
    },
    publishedValue: published.value,
    publishedBaseKind: published.inputs?.baseKind ?? null,
    publishedGrowth: published.inputs?.growth ?? null,
    predictedOfficial: predictedOfficial == null ? null : round4(predictedOfficial),
    prediction,
    zeroPrediction: zeroGrowthPrediction(bases.officialSelected, discountRate, horizon),
    realisedCash: realisedCash == null ? null : round4(realisedCash),
    realisedOwnerEarnings: realisedEarnings == null ? null : round4(realisedEarnings),
    hasOwnerEarningsOutcome: Boolean(epsFlows),
    cashCells: realisedCash == null ? null : factorGrid(bases, growths, realisedCash, discountRate, horizon),
    ownerEarningsCells: realisedEarnings == null ? null : factorGrid(bases, growths, realisedEarnings, discountRate, horizon),
  }
}

export function buildLegacyConstantGordonContrast (study, discountRate, horizon = officialHorizon()) {
  const years = horizon.years
  const terminalGrowthRate = horizon.terminalGrowthRate
  const rows = []
  for (const company of study.companies) {
    const panel = completePanelCompany(company)
    if (!panel) continue
    const { series, flatBase, fiveMedian, observed } = panel
    const official = officialGrowth({
      growth10: windowGrowth(series, 10),
      growth5: windowGrowth(series, 5),
      hasPositiveBase: panel.latestEps > 0,
    })
    const stock = entryStockFromCompany(company, study)
    const blended = stock
      ? blendOfficialBase(stock.earnings_base, stock.cash_base, { financial: stock.financial_institution === true })
      : { action: 'none', base: null }
    const selected = blended.action === 'refuse' || blended.action === 'none' ? null : blended.base
    const ten = clipOfficialRate(official.historical10)
    const slower = official.adopted
    const realised = discountFlows(observed.map(cashPerShare), discountRate, terminalGrowthRate)
    const score = (base, growth) => (
      Number.isFinite(base) && Number.isFinite(growth)
        ? scoreForecast(forecastFlows(base, growth, years), realised, discountRate, terminalGrowthRate)
        : null
    )
    rows.push({
      ticker: company.ticker,
      officialMixed: score(fiveMedian, slower),
      flatCashZero: score(flatBase, 0),
      fiveMedTen: score(fiveMedian, ten),
      fiveMedSlower: score(fiveMedian, slower),
      fiveMedZero: score(fiveMedian, 0),
      officialSelectedTen: score(selected, ten),
      officialSelectedSlower: score(selected, slower),
      officialSelectedZero: score(selected, 0),
      officialGrowth: slower,
      officialWindow: official.window,
      growth10: official.historical10,
      growth5: official.historical5,
      excludedAfterSplit: Boolean(company.breakFrom),
    })
  }
  const paired = rows.filter((row) => !row.excludedAfterSplit)
  const keys = [
    'officialMixed', 'flatCashZero', 'fiveMedTen', 'fiveMedSlower', 'fiveMedZero',
    'officialSelectedTen', 'officialSelectedSlower', 'officialSelectedZero',
  ]
  return {
    kind: 'retired-constant-explicit-plus-gordon',
    note: 'Retired 口径, kept so the old mixed table can be reproduced. officialMixed is five-year earnings median plus slower-window growth; flatCashZero is three-year cash median plus zero growth. Those two columns are not a same-base growth comparison. fiveMedTen vs fiveMedSlower holds the earnings median fixed. officialSelectedTen/Slower/Zero use toStock plus blendOfficialBase (the 50–200% midpoint rule) but still the constant-explicit-plus-Gordon scorer, not presentValue(). Not a license to change official policy.',
    medians: medianScores(paired, keys),
    officialMixedBeatsFlatCashZero: beats(paired, 'officialMixed', 'flatCashZero'),
    rows: paired,
  }
}

const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
const pct = (numerator, denominator) => denominator ? round4(numerator / denominator * 100) : null
const nearestRankP90 = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  return sorted.length ? sorted[Math.ceil(sorted.length * 0.9) - 1] : null
}

export function summarizeValidation (rows, outcome) {
  const eligible = rows.filter((row) => !row.excludedAfterSplit)
  const refused = eligible.filter((row) => row.prediction?.status === 'refused')
  const entryBlocked = eligible.filter((row) => row.prediction?.status !== 'ok' && row.prediction?.status !== 'refused')
  const outcomeBlocked = eligible.filter((row) => row.prediction?.status === 'ok' && !Number.isFinite(row[outcome]))
  const scored = eligible.filter((row) => row.prediction?.status === 'ok' && Number.isFinite(row[outcome]))
  const officialScores = scored.map((row) => scorePublished(row.prediction.value, row[outcome]))
  const zeroScores = scored.map((row) => scorePublished(row.zeroPrediction?.value, row[outcome]))
  const bandScored = scored.filter((row) => Number.isFinite(row.prediction.low) && Number.isFinite(row.prediction.high))
  const covered = bandScored.filter((row) => row[outcome] >= row.prediction.low && row[outcome] <= row.prediction.high)
  const paired = scored.filter((row) => Number.isFinite(row.zeroPrediction?.value))
  const deltas = paired.map((row) => scorePublished(row.prediction.value, row[outcome]) - scorePublished(row.zeroPrediction.value, row[outcome]))
  const evaluable = refused.length + scored.length
  return {
    outcome,
    eligible: eligible.length,
    scored: scored.length,
    refused: refused.length,
    dataBlocked: entryBlocked.length + outcomeBlocked.length,
    entryBlocked: entryBlocked.length,
    outcomeBlocked: outcomeBlocked.length,
    bandAvailable: bandScored.length,
    medianSmapePct: round4(med(officialScores)),
    p90SmapePct: round4(nearestRankP90(officialScores)),
    bandCoveragePct: pct(covered.length, bandScored.length),
    refusalRatePct: pct(refused.length, eligible.length),
    refusalRateAmongEvaluablePct: pct(refused.length, evaluable),
    zeroBaseline: {
      sameBase: true,
      medianSmapePct: round4(med(zeroScores)),
      p90SmapePct: round4(nearestRankP90(zeroScores)),
    },
    pairedWithZeroBaseline: paired.length,
    comparisonWithZeroBaseline: {
      sameBase: true,
      medianDeltaPp: round4(med(deltas)),
      p90DeltaPp: round4(nearestRankP90(deltas)),
      wins: deltas.filter((delta) => delta < 0).length,
      losses: deltas.filter((delta) => delta > 0).length,
      ties: deltas.filter((delta) => delta === 0).length,
    },
  }
}

export function groupValidation (rows, dimension) {
  const groups = new Map()
  for (const row of rows) {
    if (row.excludedAfterSplit) continue
    const key = dimension === 'entryYear' ? row.entryYear : row.industry
    const label = key == null || key === '' ? 'unknown' : String(key)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(row)
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })).map(([label, grouped]) => ({
    [dimension]: label,
    companies: grouped.length,
    cash: summarizeValidation(grouped, 'realisedCash'),
    ownerEarnings: summarizeValidation(grouped, 'realisedOwnerEarnings'),
  }))
}

export function panelUniverseHash (companies) {
  const members = companies.map((company) => ({
    ticker: company.ticker,
    cik: company.cik ?? null,
    industry: company.industry ?? null,
  })).sort((left, right) => String(left.ticker).localeCompare(String(right.ticker)))
  return createHash('sha256').update(JSON.stringify(members)).digest('hex')
}

function datedFactProblems (rows, label, company, fields = []) {
  const problems = []
  if (!Array.isArray(rows) || !rows.length) return [company.ticker + ': ' + label + ' missing']
  for (const [index, row] of rows.entries()) {
    const where = company.ticker + ': ' + label + '[' + index + ']'
    const fiscalYear = row?.fy
    if (fiscalYear === null || fiscalYear === undefined || fiscalYear === '' || !Number.isInteger(Number(fiscalYear))) problems.push(where + ' has no fiscal year')
    if (!isoDate(row?.periodEnd) || !isoDate(row?.availableAt)) problems.push(where + ' needs periodEnd and availableAt dates')
    else if (row.availableAt < row.periodEnd) problems.push(where + ' is available before period end')
    if (typeof row?.source !== 'string' || !row.source.trim()) problems.push(where + ' has no source')
    for (const field of fields) {
      const raw = row?.[field]
      if (raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw))) problems.push(where + ' has no finite ' + field)
      if (field === 'shares' && !(Number(raw) > 0)) problems.push(where + ' has non-positive shares')
    }
  }
  return problems
}

export function validateExpansionPanel (panel) {
  const problems = []
  if (!isoDate(panel?.asOf)) problems.push('panel asOf must be an ISO date')
  if (!isoDate(panel?.universeFrozenAt) || panel.universeFrozenAt > panel.asOf) problems.push('universeFrozenAt must be an ISO date on or before asOf')
  if (!Array.isArray(panel?.companies) || !panel.companies.length) return [...problems, 'panel has no companies']
  const expectedHash = panelUniverseHash(panel.companies)
  if (panel.universeHash !== expectedHash) problems.push('universeHash does not match the frozen member list')
  const tickers = new Set()
  for (const company of panel.companies) {
    if (!company.ticker || tickers.has(company.ticker)) problems.push('missing or duplicate ticker: ' + String(company.ticker))
    tickers.add(company.ticker)
    if (typeof company.industry !== 'string' || !company.industry.trim()) problems.push(company.ticker + ': industry missing')
    if (!Array.isArray(company.epsSeries) || !company.epsSeries.length) problems.push(company.ticker + ': expansion panels require dated epsSeries facts')
    else problems.push(...datedFactProblems(company.epsSeries, 'epsSeries', company, ['val']))
    problems.push(...datedFactProblems(company.baseYears, 'baseYears', company, ['ocf', 'capex', 'shares']))
    if (company.revenueChecks != null) problems.push(...datedFactProblems(company.revenueChecks, 'revenueChecks', company, ['revenue', 'shares']))
    const outcomes = company.observations || company.cashObservations
    problems.push(...datedFactProblems(outcomes, 'cash outcomes', company, ['ocf', 'capex', 'shares']))
    problems.push(...datedFactProblems(company.epsObservations, 'earnings outcomes', company, ['eps']))
    if (Array.isArray(outcomes) && outcomes.length !== 10) problems.push(company.ticker + ': cash outcomes must contain exactly ten fiscal years')
    if (Array.isArray(company.epsObservations) && company.epsObservations.length !== 10) problems.push(company.ticker + ': earnings outcomes must contain exactly ten fiscal years')
    const visibleEps = Array.isArray(company.epsSeries)
      ? company.epsSeries.filter((row) => isoDate(row?.periodEnd) && isoDate(row?.availableAt) && row.periodEnd <= panel.asOf && row.availableAt <= panel.asOf)
      : []
    const entryFy = visibleEps.length ? Math.max(...visibleEps.map((row) => Number(row.fy))) : null
    if (Number.isFinite(entryFy)) {
      for (const [label, outcomeRows] of [['cash', outcomes], ['earnings', company.epsObservations]]) {
        if (!Array.isArray(outcomeRows) || outcomeRows.length !== 10) continue
        const years = outcomeRows.map((row) => Number(row.fy)).sort((left, right) => left - right)
        if (!years.every((fy, index) => fy === entryFy + index + 1)) problems.push(company.ticker + ': ' + label + ' outcomes must be exactly FY+1..FY+10')
      }
    }
  }
  return problems
}

function panelIdentity (study) {
  return {
    asOf: study.asOf,
    yieldPct: study.yieldPct ?? null,
    role: study.role || (study.asOf === '2006-03-15' ? 'harness-debug' : 'expansion'),
    universeRule: study.universeRule || (study.asOf === '2006-03-15'
      ? 'Frozen 2006-03-15 entry-date cash panel from scripts/research/cash-path-inputs.json. Six US names drawn from a period industrial/tech filing set; VZ has no complete cash path. This is a harness debug set, not a general acceptance sample.'
      : null),
  }
}

export function loadExpansionPanels (cwd = root) {
  const dir = cwd + '/' + EXPANSION_PANELS_DIR
  if (!existsSync(dir)) return []
  const names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
  return names.map((name) => {
    const panel = JSON.parse(readFileSync(dir + '/' + name, 'utf8'))
    return { file: EXPANSION_PANELS_DIR + '/' + name, ...panel }
  })
}

export function expansionStatus (panels) {
  const checked = panels.filter((panel) => Array.isArray(panel.companies) && panel.companies.length).map((panel) => ({
    panel,
    problems: validateExpansionPanel(panel),
  }))
  const ready = checked.filter((row) => !row.problems.length)
  const invalid = checked.filter((row) => row.problems.length)
  const blockers = invalid.flatMap((row) => row.problems.map((problem) => (row.panel.file || row.panel.id || 'panel') + ': ' + problem))
  if (!checked.length) blockers.push(
    'No frozen expansion panel is committed under scripts/research/forecast-validation-panels/.',
    'An honest panel needs an entry-date universe fixed at the time (not today\'s survivors), fundamentals visible on the entry date only (filed and period-end filters, no look-ahead), and ten subsequent fiscal years of both after-capex cash and earnings.',
    'This repository has no committed SEC as-of facts cache, and no walk-forward cash-and-earnings panels beyond the 2006-03-15 debug set.',
    'The 2006 debug panel itself has no post-entry EPS series, so the owner-earnings target cannot be scored until a frozen epsObservations sidecar is added.',
    'Desired coverage once those inputs exist: later entry dates, A/H listings, platforms, and cyclicals, stored as separate labeled expansion results.',
  )
  return {
    status: ready.length && !invalid.length ? 'present' : 'blocked',
    panels: checked.map(({ panel, problems }) => ({
      file: panel.file || null,
      id: panel.id || panel.asOf || null,
      asOf: panel.asOf || null,
      role: panel.role || 'expansion',
      universeRule: panel.universeRule || null,
      companies: panel.companies.length,
      validation: problems.length ? 'blocked' : 'ready',
      problems,
    })),
    blockers,
    howToAdd: 'Add a frozen JSON panel under scripts/research/forecast-validation-panels/ with asOf, universeFrozenAt, universeHash, yieldPct, universeRule, and companies[{ ticker, cik, industry, epsSeries, baseYears, revenueChecks?, observations/cashObservations, epsObservations }]. Every fact needs fy, periodEnd, availableAt and source; outcomes need exactly FY+1..+10. Compute universeHash with panelUniverseHash(). Then rerun npm run research:forecast. Do not back-cast a universe from later survivors.',
  }
}

function scorePanel (study, discountRate, horizon) {
  const rows = study.companies.map((company) => evaluateOfficialCompany(company, study, discountRate, horizon))
  const paired = rows.filter((row) => !row.excludedAfterSplit && row.cashCells)
  const ownerPaired = paired.filter((row) => row.ownerEarningsCells)
  return {
    ...panelIdentity(study),
    sample: rows.length,
    pairedCash: paired.length,
    pairedOwnerEarnings: ownerPaired.length,
    tickers: paired.map((row) => row.ticker),
    summary: {
      cash: summarizeValidation(rows, 'realisedCash'),
      ownerEarnings: summarizeValidation(rows, 'realisedOwnerEarnings'),
    },
    cashFactors: medianFactorTable(paired, (row) => row.cashCells),
    ownerEarningsFactors: ownerPaired.length ? medianFactorTable(ownerPaired, (row) => row.ownerEarningsCells) : null,
    growthOnOfficialBaseCash: paired.length
      ? Object.fromEntries(GROWTH_KEYS.map((key) => [key, round4(med(paired.map((row) => row.cashCells.officialSelected[key])))]))
      : null,
    growthOnOfficialBaseOwnerEarnings: ownerPaired.length
      ? Object.fromEntries(GROWTH_KEYS.map((key) => [key, round4(med(ownerPaired.map((row) => row.ownerEarningsCells.officialSelected[key])))]))
      : null,
    rows,
  }
}

export function buildOfficialReport (study, expansionPanels = loadExpansionPanels()) {
  const discountRate = officialDiscountRate(study)
  const horizon = officialHorizon()
  const debug = scorePanel({ ...study, role: 'harness-debug' }, discountRate, horizon)
  const expansion = expansionStatus(expansionPanels)
  const expansionRuns = expansionPanels
    .filter((panel) => Array.isArray(panel.companies) && panel.companies.length && !validateExpansionPanel(panel).length)
    .map((panel) => scorePanel(panel, officialDiscountRate(panel), horizon))
  const expansionRows = expansionRuns.flatMap((panel) => panel.rows)
  const expansionSummary = {
    status: expansion.status,
    combined: expansionRuns.length ? {
      cash: summarizeValidation(expansionRows, 'realisedCash'),
      ownerEarnings: summarizeValidation(expansionRows, 'realisedOwnerEarnings'),
    } : null,
    byEntryYear: groupValidation(expansionRows, 'entryYear'),
    byIndustry: groupValidation(expansionRows, 'industry'),
  }
  return {
    kind: 'official-policy-factor-run',
    policyVersion: POLICY_VERSION,
    policyHash: POLICY_V1_HASH,
    growthRule: POLICY_V1.revision.officialGrowth,
    discountRule: POLICY_V1.discount.rule,
    asOf: study.asOf,
    role: 'harness-debug',
    note: 'Maintainer factor experiment on the official v3 published path. Forecast cells call presentValue() (linear fade over the explicit window, finite terminal years, then continuation) with the official discount max(10%, ceil(local 10y)+6) and the official 4% terminal. Discount and terminal are not tuned to this sample. Bases are crossed with growth rules: earnings is toStock() earnings_base (normalised EPS, or the latest fiscal year when the synchronous upshift rule fires); cash is toStock() cash_base; midpoint is the arithmetic mid of the two when both are positive, used only as a factor; officialSelected is blendOfficialBase() (earnings-primary below a 50% gap, midpoint at 50–200%, refuse above 200%; financial residual-income names are not cash-blended). Growth rules are zero, the clipped five-year window, the clipped ten-year window, and officialGrowth() (slower of the two clipped windows). The main growth comparison is officialSelected crossed with those four rates, never a mixed-base table. Realised cash is the observed ten-year after-capex cash path plus the same official terminal tail. Realised owner earnings use the same scorer on post-entry EPS when epsObservations are present (OE=E under M≈D); the frozen 2006 debug panel does not include those EPS outcomes. The 2006-03-15 six-name entry panel is a harness debug set (VZ is excluded after its 2006 split and has no complete cash path), not a general acceptance sample. Beating zero growth is not a publication gate and is not a license to change official growth or discount. This is not an official published value.',
    path: {
      forecast: 'src/lib/dcf.js presentValue: linear fade from starting growth to the effective terminal, 10 explicit years, 10 finite terminal years, then a continuation value. addToFairValue is false.',
      baseSelection: 'src/lib/stockRecord.js toStock plus src/lib/dcf.js blendOfficialBase, the same official-selected base policyValue() uses.',
      discount: 'max(10%, ceil(local 10y)+6); not adjusted to market prices or to this sample.',
      terminal: 'POLICY_V1 4% terminal growth, 10 finite terminal years, continuation capped 2 percentage points below the discount rate.',
      realisedCash: 'Discount observed FY+1..+10 after-capex cash per share, then attach the same finite terminal years and continuation from the last observed cash flow.',
      realisedOwnerEarnings: 'Same published-path scorer on observed post-entry EPS when the panel provides epsObservations. Under the disclosed M≈D proxy, owner earnings equal earnings. Missing on the 2006 debug panel.',
    },
    discountRate,
    terminalIncluded: true,
    terminalAligned: true,
    defaultTerminalGrowthRate: horizon.terminalGrowthRate,
    years: horizon.years,
    yearsOfTerminalGrowth: horizon.yearsOfTerminalGrowth,
    growthCap: POLICY_V1.growth.cap,
    definitions: {
      bases: {
        earnings: 'toStock() earnings_base: five-year normalised EPS, or the latest complete fiscal year when the synchronous upshift rule fires.',
        cash: 'toStock() cash_base: three-year positive after-capex cash median, or the latest fiscal year when the upshift rule fires.',
        midpoint: 'Arithmetic mid of earnings and cash when both are positive. A factor cell, not automatically the official published base.',
        officialSelected: 'blendOfficialBase(earnings, cash): earnings if the symmetric gap is under 50%, midpoint at 50–200%, refuse above 200%. This is the official published base for owner-model names.',
      },
      growths: {
        zero: 'Starting growth 0%, still fading to the official 4% terminal on the published path.',
        five: 'The five-year earnings window after the official 0% floor and 15% cap. Null when that window cannot be formed.',
        ten: 'The ten-year earnings window after the official 0% floor and 15% cap. Null when that window cannot be formed.',
        slower: 'officialGrowth(): slower of the two clipped windows, or the one available window.',
      },
      cells: 'Each cell is the SMAPE between publishedPathValue(base, growth) and the named realised published-path value. Read down a column to compare bases at one growth rule; read across a row to compare growth rules at one base. Do not compare earnings-plus-slower with cash-plus-zero as if that were a growth test.',
      acceptanceMetrics: {
        medianSmapePct: 'Median symmetric absolute percentage error on eligible rows with a published prediction and realised outcome.',
        p90SmapePct: 'Nearest-rank 90th percentile: sorted score at index ceil(0.9*n)-1.',
        bandCoveragePct: 'Share of scored rows whose realised value lies inside the published scenario band, including both boundaries. This is not a confidence level.',
        refusalRatePct: 'Policy-refused rows divided by all non-split entry rows. Missing outcomes are counted separately as dataBlocked.',
        refusalRateAmongEvaluablePct: 'Policy-refused rows divided by policy-refused plus scored rows; excludes missing entry/outcome data.',
        zeroBaseline: 'Same official-selected base, discount, horizon and terminal as the official forecast, with starting growth set to zero. Paired deltas are official SMAPE minus zero-growth SMAPE.',
      },
    },
    debugSet: debug,
    expansion: {
      ...expansion,
      runs: expansionRuns,
      summary: expansionSummary,
    },
    legacyConstantGordon: buildLegacyConstantGordonContrast(study, discountRate, horizon),
  }
}

export function reportText (report) {
  return JSON.stringify(report, null, 2) + '\n'
}

export function parseArgs (argv) {
  const historical = argv.includes('--historical')
  const official = argv.includes('--official')
  if (historical && official) throw Error('Choose only one of --historical or --official')
  return {
    check: argv.includes('--check'),
    mode: historical ? 'historical' : official ? 'official' : argv.includes('--check') ? 'both' : 'official',
  }
}

function writeOrCheck (path, text, check) {
  if (check) {
    let committed
    try {
      committed = readFileSync(root + '/' + path, 'utf8')
    } catch {
      throw Error('Missing committed forecast-validation file: ' + path)
    }
    if (committed !== text) throw Error('forecast validation metrics differ from committed file: ' + path)
    return
  }
  writeFileSync(root + '/' + path, text)
}

function officialSummary (report) {
  return {
    mode: 'official',
    path: OFFICIAL_OUT,
    kind: report.kind,
    role: report.role,
    sample: report.debugSet.sample,
    pairedCash: report.debugSet.pairedCash,
    pairedOwnerEarnings: report.debugSet.pairedOwnerEarnings,
    growthOnOfficialBaseCash: report.debugSet.growthOnOfficialBaseCash,
    summary: report.debugSet.summary,
    cashFactors: report.debugSet.cashFactors,
    expansion: {
      status: report.expansion.status,
      panels: report.expansion.panels,
      runCount: report.expansion.runs.length,
      summary: report.expansion.summary,
    },
    legacyMedians: report.legacyConstantGordon.medians,
  }
}

export function run (argv, study = loadPanel(), expansionPanels = loadExpansionPanels()) {
  const options = parseArgs(argv)
  const jobs = options.mode === 'both'
    ? [['historical', HISTORICAL_OUT], ['official', OFFICIAL_OUT]]
    : [[options.mode, options.mode === 'historical' ? HISTORICAL_OUT : OFFICIAL_OUT]]
  const summaries = []
  for (const [mode, path] of jobs) {
    const report = mode === 'historical' ? buildHistoricalReport(study) : buildOfficialReport(study, expansionPanels)
    writeOrCheck(path, reportText(report), options.check)
    summaries.push(mode === 'historical'
      ? {
          mode,
          path,
          kind: report.kind,
          sample: report.sample,
          paired: report.paired,
          medians: report.medians,
        }
      : officialSummary(report))
  }
  return summaries
}

export function main (argv = process.argv.slice(2)) {
  const summaries = run(argv)
  console.log(JSON.stringify(summaries.length === 1 ? summaries[0] : summaries))
}
