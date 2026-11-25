// Official v3 earnings-base selection. Pure functions only: the same public
// inputs must produce the same published base in the browser, tests and the
// artifact build. This module replaces the 40% latest-vs-median cliff and the
// two-sided 2× upshift. It does not invent adjusted EPS, does not fall back
// from a polluted or unknown TTM into the official base, and has no
// symbol-specific branches.
//
// Minimum v1 defaults, documented here because the plan leaves them open:
// - When operating income is missing or zero, a year cannot be clean if N is
//   non-zero; it is nonoperating if the net-income gate or an EPS sign-change
//   already fired, otherwise unknown. When N is 0 after a search and NI is
//   available, the year may be clean even if OI is missing (OI is not needed
//   once there is nothing for the 10% gate to test).
// - When operating income is negative, the 10% gate uses abs(OI).
// - After the whitelist was searched and no such facts exist, N = 0 for that
//   period. unknown is reserved for a period that will not align or a required
//   denominator that is missing.
// First release does not apply IQR / quartile trimming (the window is at most
// five years). n >= 3, including a confirmed-step three-year window, always
// uses the recency-weighted formula; never a three-year median shortcut.

export const QUALITY = Object.freeze({
  CLEAN: 'clean',
  NONOPERATING: 'nonoperating',
  UNKNOWN: 'unknown',
})

export const BASE_METHOD = Object.freeze({
  WEIGHTED: 'weighted',
  PERSISTENT_STEP: 'persistent-step',
  SHORT_HISTORY: 'short-history',
  MEDIAN_FALLBACK: 'median-fallback',
})

export const NI_MATERIALITY = 0.25
export const OI_MATERIALITY = 0.10
export const QUALITY_WEIGHT = Object.freeze({
  [QUALITY.CLEAN]: 1,
  [QUALITY.NONOPERATING]: 0.25,
  [QUALITY.UNKNOWN]: 0.25,
})
export const STEP_PRIOR_YEARS = 3
export const STEP_LATEST_YEARS = 2
export const STEP_WINDOW_YEARS = STEP_PRIOR_YEARS + STEP_LATEST_YEARS
export const STEP_LEVEL_FRACTION = 0.15
export const STEP_MAD_MULTIPLE = 1.5
export const OI_CONFIRM_RATIO = 0.9
export const FCF_CONFIRM_RATIO = 1
export const CASH_PERIOD_LAG_DAYS = 180
export const CASH_BEHIND_FY_DAYS = 450
export const EARNINGS_WINDOW = 5

const num = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function medianOf (values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function madOf (values, center = medianOf(values)) {
  if (center == null) return null
  return medianOf(values.filter(Number.isFinite).map((value) => Math.abs(value - center)))
}

/** Last calendar day of a YYYY-MM or YYYY-MM-DD period, or null. */
export function periodEndDate (value) {
  if (!value) return null
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const month = text.match(/^(\d{4})-(\d{2})$/)
  if (!month) return null
  const year = Number(month[1])
  const mon = Number(month[2])
  const day = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return year + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

export function daysBetween (laterIso, earlierIso) {
  const later = periodEndDate(laterIso)
  const earlier = periodEndDate(earlierIso)
  if (!later || !earlier) return null
  const gap = (Date.parse(later) - Date.parse(earlier)) / 86_400_000
  return Number.isFinite(gap) ? gap : null
}

/**
 * Classify one period. N is the whitelist total (EquitySecuritiesFvNiGainLoss
 * and the same family, totals only). Labels only; never publishes NI/shares
 * or any other adjusted EPS.
 */
export function classifyEarningsQuality ({
  n, ni, oi, searched = true, periodAligned = true,
} = {}) {
  if (searched === false || periodAligned === false) return QUALITY.UNKNOWN
  const gain = num(n)
  const income = num(ni)
  const operating = num(oi)
  if (gain == null) return QUALITY.UNKNOWN

  const niMissing = income == null
  const residual = niMissing ? null : income - gain
  const signChange = !niMissing && Math.sign(income) !== Math.sign(residual)
  // A zero whitelist total is not material. Comparing 0 >= 25% × 0 would
  // otherwise mark a genuine zero-earnings year as nonoperating.
  const niGate = !niMissing && Math.abs(gain) > 0 && Math.abs(gain) >= NI_MATERIALITY * Math.abs(income)
  const oiAvailable = operating != null && operating !== 0
  const oiGate = oiAvailable && Math.abs(gain) > 0 && Math.abs(gain) >= OI_MATERIALITY * Math.abs(operating)
  if (signChange || niGate || oiGate) return QUALITY.NONOPERATING
  // OI is required to apply the 10% gate when N is non-zero. If the whitelist
  // search found nothing (N = 0) and NI is available, OI is not a required
  // denominator: the OI gate would not fire anyway. This keeps deposit-takers
  // and other names that simply do not report operating income from being
  // refused for lack of a clean year.
  if (gain === 0 && !niMissing) return QUALITY.CLEAN
  if (operating == null || operating === 0 || niMissing) return QUALITY.UNKNOWN
  return QUALITY.CLEAN
}

export function qualityWeight (quality) {
  return QUALITY_WEIGHT[quality] ?? QUALITY_WEIGHT[QUALITY.UNKNOWN]
}

/**
 * Recency-weighted normalised base for a time-ordered list of observations
 * (oldest first). Missing EPS must already have been skipped; explicit zeros
 * and negatives stay in the list.
 */
export function weightedNormalizedBase (observations) {
  const rows = (observations || []).filter((row) => Number.isFinite(row?.eps))
  const n = rows.length
  const values = rows.map((row) => row.eps)
  const median = medianOf(values)
  const hasCleanPositive = rows.some((row) => row.quality === QUALITY.CLEAN && row.eps > 0)
  if (!n) {
    return { base: null, method: null, median, hasCleanPositive, n, observations: rows }
  }

  let base = null
  let method = null
  if (n >= 3) {
    let weightedSum = 0
    let weightSum = 0
    rows.forEach((row, index) => {
      const weight = (index + 1) * qualityWeight(row.quality)
      weightedSum += weight * row.eps
      weightSum += weight
    })
    base = weightSum > 0 ? weightedSum / weightSum : null
    method = BASE_METHOD.WEIGHTED
  } else if (n === 2) {
    base = median
    method = BASE_METHOD.SHORT_HISTORY
  } else {
    base = values[0]
    method = BASE_METHOD.SHORT_HISTORY
  }

  if (!hasCleanPositive) {
    return { base: null, method, median, hasCleanPositive, n, observations: rows }
  }
  if (base != null && base <= 0 && median > 0) {
    return { base: median, method: BASE_METHOD.MEDIAN_FALLBACK, median, hasCleanPositive, n, observations: rows }
  }
  if (!(base > 0)) {
    return { base: null, method, median, hasCleanPositive, n, observations: rows }
  }
  return { base, method, median, hasCleanPositive, n, observations: rows }
}

const metric = (row, field) => num(row?.[field])

const fiscalYear = (row) => {
  const date = String(row?.date || '')
  const year = Number(date.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

/** Dated annual rows, oldest first, keeping one slot per fiscal year.
 *  Rows without a date keep their array order so fixtures and short tests still work. */
export function datedAnnual (annual) {
  if (!Array.isArray(annual)) return []
  const byYear = new Map()
  const undated = []
  for (const row of annual) {
    const year = fiscalYear(row)
    if (year) byYear.set(year, row)
    else undated.push(row)
  }
  if (byYear.size) return [...byYear.keys()].sort((a, b) => a - b).map((year) => ({ year, row: byYear.get(year) }))
  return undated.map((row, index) => ({ year: index + 1, row }))
}

/**
 * Quality facts on a row, or the v1 default when the source has no whitelist
 * concepts: treat N as 0 after a search, then classify with NI / OI.
 * Totals are preferred (the materiality gates do not need per-share figures).
 * When only per-share figures exist, the same ratios are used.
 */
export function qualityInputsFromRow (row, { sourceSearched = null } = {}) {
  if (!row) return { searched: false, periodAligned: false, n: null, ni: null, oi: null }
  const searchedFlag = row.quality_facts_searched
  const hasFacts = searchedFlag === true
    || row.equity_securities_fv_ni_gain_loss !== undefined
    || row.net_income !== undefined
    || row.operating_income !== undefined
  const searched = searchedFlag === false ? false : (hasFacts || sourceSearched !== false)
  const periodAligned = searchedFlag !== false
  const n = hasFacts ? (num(row.equity_securities_fv_ni_gain_loss) ?? (searched ? 0 : null)) : (searched ? 0 : null)
  const ni = num(row.net_income) ?? metric(row, 'eps_without_nri')
  const oi = num(row.operating_income) ?? metric(row, 'operating_income_per_share')
  return { searched, periodAligned, n, ni, oi }
}

export function classifyAnnualRow (row, options) {
  return classifyEarningsQuality(qualityInputsFromRow(row, options))
}

function observationFromEntry (entry, options) {
  const eps = metric(entry.row, 'eps_without_nri')
  if (eps == null) return null
  return {
    year: entry.year,
    date: entry.row.date,
    eps,
    quality: classifyAnnualRow(entry.row, options),
    operatingIncome: metric(entry.row, 'operating_income_per_share'),
    fcf: metric(entry.row, 'free_cash_flow_per_share'),
    ocf: metric(entry.row, 'operating_cash_flow_per_share'),
    capex: metric(entry.row, 'capex_per_share'),
    revenue: metric(entry.row, 'revenue_per_share'),
    row: entry.row,
  }
}

/** Up to five latest complete fiscal years that actually report EPS, oldest first. */
export function earningsWindow (annual, options) {
  const observations = []
  for (const entry of datedAnnual(annual)) {
    const observation = observationFromEntry(entry, options)
    if (observation) observations.push(observation)
  }
  return observations.slice(-EARNINGS_WINDOW)
}

function consecutive (observations) {
  if (observations.length < 2) return true
  for (let index = 1; index < observations.length; index++) {
    if (observations[index].year !== observations[index - 1].year + 1) return false
  }
  return true
}

/**
 * Persistent earnings-step test for non-financials. Missing confirmation
 * data is unconfirmed; it does not default to a pass. Latest two years must
 * both be clean.
 */
export function detectPersistentStep (observations, { financial = false } = {}) {
  const empty = {
    hit: false,
    oiPath: false,
    cashPath: false,
    threshold: null,
    priorMedian: null,
    reason: financial ? 'financial' : 'not-tested',
  }
  if (financial) return empty
  if (!observations || observations.length < STEP_WINDOW_YEARS || !consecutive(observations.slice(-STEP_WINDOW_YEARS))) {
    return { ...empty, reason: 'incomplete-window' }
  }
  const window = observations.slice(-STEP_WINDOW_YEARS)
  const prior = window.slice(0, STEP_PRIOR_YEARS)
  const latest = window.slice(-STEP_LATEST_YEARS)
  if (latest.some((row) => row.quality !== QUALITY.CLEAN)) {
    return { ...empty, reason: 'quality' }
  }
  const priorEps = prior.map((row) => row.eps)
  const priorMedian = medianOf(priorEps)
  const priorMad = madOf(priorEps, priorMedian)
  if (priorMedian == null) return { ...empty, reason: 'incomplete-window' }
  const threshold = priorMedian + Math.max(STEP_LEVEL_FRACTION * Math.abs(priorMedian), STEP_MAD_MULTIPLE * (priorMad ?? 0))
  if (!latest.every((row) => row.eps > threshold)) {
    return { ...empty, threshold, priorMedian, reason: 'earnings' }
  }

  const oiSeries = window.map((row) => row.operatingIncome)
  const oiComplete = oiSeries.every((value) => value != null)
  const oiPath = oiComplete
    && medianOf(oiSeries.slice(-STEP_LATEST_YEARS)) >= OI_CONFIRM_RATIO * medianOf(oiSeries.slice(0, STEP_PRIOR_YEARS))

  const fcfSeries = window.map((row) => row.fcf)
  const fcfComplete = fcfSeries.every((value) => value != null && value > 0)
  const priorFcfMedian = fcfComplete ? medianOf(fcfSeries.slice(0, STEP_PRIOR_YEARS)) : null
  const cashPath = fcfComplete
    && medianOf(fcfSeries.slice(-STEP_LATEST_YEARS)) >= FCF_CONFIRM_RATIO * priorFcfMedian
    && fcfSeries.at(-1) >= priorFcfMedian

  if (!oiPath && !cashPath) {
    const reason = !oiComplete && !fcfComplete ? 'confirmation-missing' : 'confirmation'
    return { hit: false, oiPath, cashPath, threshold, priorMedian, reason }
  }
  return { hit: true, oiPath, cashPath, threshold, priorMedian, reason: null }
}

function cashWindowMedian (observations, years = 3) {
  const recent = (observations || []).slice(-years)
  if (recent.length < years) return null
  const values = recent.map((row) => row.fcf)
  if (!values.every((value) => value != null && value > 0)) return null
  return Number(medianOf(values).toFixed(4))
}

export function capexDiagnostics (observation) {
  if (!observation) {
    return {
      capexPerShare: null,
      ocfPerShare: null,
      capexToOcf: null,
      capexToRevenue: null,
      maintenanceCapexMethod: 'da-proxy',
    }
  }
  const capex = observation.capex
  const ocf = observation.ocf
  const revenue = observation.revenue
  return {
    capexPerShare: capex,
    ocfPerShare: ocf,
    capexToOcf: capex != null && ocf != null && ocf !== 0 ? capex / ocf : null,
    capexToRevenue: capex != null && revenue != null && revenue !== 0 ? capex / revenue : null,
    maintenanceCapexMethod: 'da-proxy',
  }
}

export function classifyTtmQuality (stock) {
  const asOf = stock?.ttm_quality_as_of || stock?.eps_as_of || null
  const searched = stock?.ttm_quality_facts_searched
  const hasFacts = searched === true
    || stock?.ttm_nonoperating_gain !== undefined
    || stock?.ttm_net_income !== undefined
    || stock?.ttm_operating_income !== undefined
  // A TTM row with no whitelist facts: same v1 default as annual (N = 0 after
  // a search), unless the period itself cannot be aligned.
  const inputs = {
    n: hasFacts ? (num(stock?.ttm_nonoperating_gain) ?? (searched !== false ? 0 : null)) : (searched === false ? null : 0),
    ni: num(stock?.ttm_net_income),
    oi: num(stock?.ttm_operating_income),
    searched: searched === false ? false : true,
    periodAligned: searched !== false,
  }
  // When totals are missing, fall back to TTM EPS / TTM operating income per share.
  if (inputs.ni == null) inputs.ni = num(stock?.ttm_eps_nri) ?? num(stock?.ttm_eps)
  if (inputs.oi == null) {
    const ttmRow = Array.isArray(stock?.financials?.ttm) ? stock.financials.ttm.at(-1) : null
    inputs.oi = metric(ttmRow, 'operating_income_per_share')
  }
  const quality = classifyEarningsQuality(inputs)
  return {
    quality,
    gain: num(stock?.ttm_nonoperating_gain),
    asOf,
  }
}

function refusalOf ({ hasAnnualEps, hasCleanPositive, knownNonPositive }) {
  if (!hasAnnualEps) return 'NO_EPS'
  if (knownNonPositive && !hasCleanPositive) return 'NON_POSITIVE_EPS'
  if (!hasCleanPositive) return 'BASE_QUALITY_INSUFFICIENT'
  return null
}

/**
 * Official earnings and cash bases for one snapshot. TTM is classified for
 * display only and never becomes the published base.
 */
export function selectOfficialBase (stock, { financial = false } = {}) {
  const annual = stock?.financials?.annual
  const observations = earningsWindow(annual, { sourceSearched: null })
  const allDated = datedAnnual(annual)
  const hasAnnualEps = allDated.some((entry) => metric(entry.row, 'eps_without_nri') != null)
  const knownNonPositive = allDated.some((entry) => {
    const eps = metric(entry.row, 'eps_without_nri')
    if (eps == null) return false
    const quality = classifyAnnualRow(entry.row)
    return quality !== QUALITY.UNKNOWN && !(eps > 0)
  }) && observations.every((row) => !(row.quality === QUALITY.CLEAN && row.eps > 0))
    && observations.some((row) => row.quality !== QUALITY.UNKNOWN && !(row.eps > 0))

  const normalized = weightedNormalizedBase(observations)
  const step = detectPersistentStep(observations, { financial })
  const latest = observations.at(-1) || null
  const baseAsOf = periodEndDate(latest?.date) || periodEndDate(stock?.eps_as_of && stock?.eps_period === 'FY' ? stock.eps_as_of : null)
  const ttm = classifyTtmQuality(stock)
  const ttmAsOf = periodEndDate(stock?.ttm_quality_as_of || (stock?.eps_period === 'TTM' ? stock.eps_as_of : null) || stock?.eps_as_of)

  const warnings = []
  if (observations.some((row) => row.quality !== QUALITY.CLEAN)) warnings.push('BASE_QUALITY_REDUCED')
  if (normalized.n > 0 && normalized.n < 3) warnings.push('BASE_HISTORY_SHORT')
  if (ttm.quality === QUALITY.NONOPERATING) warnings.push('TTM_NONOPERATING')
  else if (ttm.quality === QUALITY.UNKNOWN && (stock?.ttm_eps != null || stock?.ttm_eps_nri != null) && stock?.eps_period === 'TTM') {
    warnings.push('TTM_QUALITY_UNKNOWN')
  }

  let method = normalized.method
  let earningsBase = normalized.base
  let cashBase = cashWindowMedian(observations, 3)
  let cashAsOf = periodEndDate(observations.length >= 3 ? observations.at(-1)?.date : null)

  if (step.hit) {
    const recent = observations.slice(-3)
    const stepped = weightedNormalizedBase(recent)
    earningsBase = stepped.base
    method = BASE_METHOD.PERSISTENT_STEP
    warnings.push('PERSISTENT_STEP_BASE')
    if (step.cashPath) {
      cashBase = cashWindowMedian(recent, 3)
      cashAsOf = periodEndDate(recent.at(-1)?.date)
    } else {
      cashBase = null
      cashAsOf = null
    }
  } else if (!cashBase) {
    // Three-year positive-FCF median on dated annual rows, same rule as before.
    const cashRows = datedAnnual(annual).filter((entry) => metric(entry.row, 'free_cash_flow_per_share') != null)
    const recentCash = cashRows.slice(-3)
    if (recentCash.length === 3) {
      const values = recentCash.map((entry) => metric(entry.row, 'free_cash_flow_per_share'))
      if (values.every((value) => value > 0)) {
        cashBase = Number(medianOf(values).toFixed(4))
        cashAsOf = periodEndDate(recentCash.at(-1).row.date)
      }
    }
  }

  const cashLagVsBase = daysBetween(baseAsOf, cashAsOf)
  const ttmCashLag = daysBetween(ttmAsOf, cashAsOf)
  if (ttmCashLag != null && ttmCashLag > CASH_PERIOD_LAG_DAYS) warnings.push('CASH_PERIOD_LAG')
  // Same undated annual window is still same-period cash. Only withdraw cash
  // when earnings has a dated fiscal year and the cash date cannot be confirmed,
  // or when cash is more than one complete fiscal year behind.
  const cashPeriodUnknown = cashBase != null && baseAsOf != null && cashAsOf == null
  const cashTooOld = cashLagVsBase != null && cashLagVsBase > CASH_BEHIND_FY_DAYS
  if (cashPeriodUnknown || cashTooOld) {
    cashBase = null
    // Keep cashAsOf for disclosure even when the figure is withdrawn.
  }

  const rounded = (value) => (value == null ? null : Number(Number(value).toFixed(4)))
  const refusal = refusalOf({
    hasAnnualEps,
    hasCleanPositive: normalized.hasCleanPositive,
    knownNonPositive,
  })
  if (refusal) {
    earningsBase = null
    method = method || (normalized.n > 0 && normalized.n < 3 ? BASE_METHOD.SHORT_HISTORY : normalized.method)
  }

  return {
    earningsBase: rounded(earningsBase),
    cashBase: rounded(cashBase),
    epsNormalized: rounded(normalized.base),
    method: refusal ? method : (earningsBase > 0 ? method : method),
    baseAsOf,
    cashAsOf,
    ttmAsOf,
    cashLagDays: ttmCashLag,
    ttmQuality: ttm.quality,
    ttmNonoperatingGain: ttm.gain,
    ttmQualityAsOf: ttm.asOf,
    step,
    observations,
    warnings,
    refusal,
    ...capexDiagnostics(latest),
  }
}
