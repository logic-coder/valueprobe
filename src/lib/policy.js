// ValueProbe public policy v3: the single place that decides which inputs the
// published intrinsic value uses, and which caveats travel with it. Pure
// functions only — the browser, the tests and scripts/policy-values.mjs all call
// this module, so the committed artifact and the screen cannot drift apart.
//
// Editing POLICY_V1 or the policy functions changes every published number. Bump POLICY_VERSION and
// update POLICY_V1_HASH in the same change; verify-data fails otherwise.
import { adoptGrowth, officialGrowth, MAX_UNDERWRITTEN_GROWTH, MIN_CLEAN_YEARS, REGIME_GAP_PP } from './assumptions'
import { cashflowCurrency, reportingCurrency, reportingCurrencySource, rateForCurrency, EQUITY_PREMIUM, FALLBACK_DISCOUNT_RATE, REQUIRED_RETURN_FLOOR } from './riskFree'
import { DCF_DEFAULTS, marginOfSafety, preferredEps, presentValue, RECENT_BASE_LAG_RATIO, residualIncomeValue, round2, valueBand } from './dcf'
import { orderBy, REASON, REASON_ORDER, WARNING, WARNING_ORDER } from './reasons'

export const POLICY_VERSION = 'v3'

const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export const POLICY_V1 = deepFreeze({
  version: POLICY_VERSION,
  // Semantics added in v3; listed here so the pinned hash changes with them.
  revision: {
    classification: 'industry+ocf+columns',
    terminalBoundary: 'shared-effective-growth',
    band: 'slower-window-mid-faster-window-ceiling',
    cashCrossCheck: 'midpoint-within-ratio-veto-beyond',
    earningsBase: 'normalized-eps-or-recent-lag-midpoint',
    publicationGate: 'cash-ratio-veto-beyond-2x',
    officialGrowth: 'slower-of-two-windows',
    insuranceEvidence: 'underwriting-insurers',
    requiredReturn: 'floor-10-or-reporting-10y-ceil-plus-6',
    baseDisclosure: 'component-list',
  },
  trialOnlyIndustries: ['reit', 'refining'],
  // Repeatable earning power: five-year normalised EPS. With M≈D, owner
  // earnings equal that figure. After-capex cash is a cross-check only.
  basis: 'repeatable-earnings',
  model: { nonFinancial: 'owner', financialInstitution: 'residual' },
  horizon: {
    years: DCF_DEFAULTS.years,
    terminalGrowthRate: DCF_DEFAULTS.terminalGrowthRate,
    yearsOfTerminalGrowth: DCF_DEFAULTS.yearsOfTerminalGrowth,
  },
  growth: {
    windowYears: 10,
    cap: MAX_UNDERWRITTEN_GROWTH,
    shortHistory: 'wider-band',
    cleanYears: MIN_CLEAN_YEARS,
    regimeGapPp: REGIME_GAP_PP,
    // Negative history starts at 0% when the long window is negative, fades
    // to the default terminal, and carries REGIME_UNCERTAIN. Opposite-sign
    // windows also carry REGIME_UNCERTAIN; a same-sign gap only widens the
    // range. Missing windows with a positive repeatable base start at 0% and
    // still fade to the default terminal.
    negative: 'zero-start-default-terminal',
    missingWindow: 'zero-start',
  },
  discount: {
    rule: 'max(floor, local-10y-ceil+6)',
    spread: EQUITY_PREMIUM,
    rounding: 'ceil',
    floor: REQUIRED_RETURN_FLOOR,
    // The rate follows the enterprise reporting currency, under one market-wide
    // formula. Published per-share values stay in the listing/quote currency.
    currency: 'reporting',
    hkdProxy: 'USD',
    // A missing local yield keeps the value and uses the disclosed 10% fallback;
    // the entry carries a RATE_FALLBACK warning and the rate row says so.
    missing: 'fallback',
    fallback: FALLBACK_DISCOUNT_RATE,
    min: 0,
    max: 50,
  },
  price: {
    // Price never enters the intrinsic value; it only enters the margin of
    // safety and the sort order. A stale price is disclosed, not silently used.
    marginWarningDays: 7,
  },
  cashMidpoint: {
    // Earnings and cash are two measurements of the same owner earnings. Within
    // roughly 2.5x they are usable: publish the midpoint and span both in the
    // band (Tencent ≈ 2.25x stays publishable). Beyond that they no longer
    // describe one business, so the entry stays refused.
    maxRatio: 2.5,
  },
  recentBase: {
    // A one-way rise can leave the normalised median years behind. Switch to
    // the latest full year's earnings/cash midpoint at this lag multiple.
    lagRatio: RECENT_BASE_LAG_RATIO,
  },
  staleness: {
    // A stale snapshot keeps its value and carries a STALE_DATA warning; the data
    // gate fails separately so the refresh cannot slip past a release.
    fundamentalsDays: 120,
    ratesDays: 10,
  },
  band: { discountSpread: 2, growthEnvelope: 'scenario' },
  terminalShareDisclosed: true,
})

// sha256(JSON.stringify(POLICY_V1)); pinned by tests/unit/policy.test.js so an
// unversioned policy edit cannot ship.
export const POLICY_V1_HASH = '961a1eb4812f7d87f73b3805e7c6673d05095efe3b27de8b257f71bb3bc267de'

const num = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const daysBetween = (laterIso, earlierIso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(laterIso || '') || !/^\d{4}-\d{2}-\d{2}$/.test(earlierIso || '')) return null
  const later = Date.parse(laterIso)
  const earlier = Date.parse(earlierIso)
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null
  return (later - earlier) / 86_400_000
}

const round4 = (value) => Math.round(value * 10_000) / 10_000

/** Snapshot prices are display strings ("¥9.06", "HK$81.9"); the kernel wants a number. */
const priceOf = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.+-]+/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function quoteDateStatus (price, priceDate, referenceDate = new Date().toISOString().slice(0, 10)) {
  if (!(price > 0)) return 'missing'
  if (!priceDate) return 'unknown'
  const age = daysBetween(referenceDate, priceDate)
  if (age == null || age < 0) return 'unknown'
  return age > POLICY_V1.price.marginWarningDays ? 'historical' : 'dated'
}


const close4 = (left, right) => left != null && right != null && Math.abs(left - right) < 0.00015

/** Which ingredient official `eps` came from. Disclosure only; does not change the base. */
function describeBaseKind (eps, latest, normalized, cash, financial) {
  if (eps == null) return null
  if (financial) return 'normalized'
  if (normalized != null && close4(eps, normalized)) return 'normalized'
  if (cash > 0 && close4(eps, cash) && !(normalized > 0)) return 'cash'
  if (latest != null && close4(eps, latest)) return 'latest'
  if (cash > 0 && normalized > 0 && close4(eps, (cash + normalized) / 2)) return 'midpoint'
  return 'repeatable'
}

/** Same EPS preference as buildDefaults, so a seeded calculator equals the artifact. */
export const policyEps = (stock) => preferredEps(stock)

/** Single-window cap. Official published growth is officialGrowth(). */
export function policyGrowth (value) {
  return adoptGrowth(value)
}

/** Default discount rate in percent from a real local ten-year yield, or null. */
export function policyDiscountRate (yieldPct) {
  const value = num(yieldPct)
  if (value === null) return null
  const raw = POLICY_V1.discount.rounding === 'none'
    ? value + POLICY_V1.discount.spread
    : Math.ceil(value) + POLICY_V1.discount.spread
  if (!Number.isFinite(raw)) return null
  return round4(Math.max(POLICY_V1.discount.floor, raw))
}

/** The published discount rate used when no local yield is available. */
export const policyFallbackDiscountRate = () => POLICY_V1.discount.fallback

/**
 * Model the policy publishes for this record. The classification is recorded on the
 * normalised record by lib/stockRecord (the snapshot provider applies the same
 * heuristic), so the page and the artifact cannot disagree about a symbol.
 */
export function policyModel (stock) {
  if (!stock) return POLICY_V1.model.nonFinancial
  return stock.financial_institution === true ? POLICY_V1.model.financialInstitution : POLICY_V1.model.nonFinancial
}

export function symbolOf (stock) {
  if (!stock) return null
  return stock.exchange_ && stock.symbol ? stock.exchange_ + ':' + stock.symbol : null
}

const emptyInputs = () => ({
  model: POLICY_V1.model.nonFinancial,
  basis: POLICY_V1.basis,
  eps: null,
  epsLatest: null,
  epsNormalized: null,
  cashMedian: null,
  daPerShare: null,
  maintenanceCapexProxy: null,
  sbcPerShare: null,
  ownerBaseGap: false,
  baseKind: null,
  growth: null,
  growthWindow: null,
  growthCap: null,
  growth10: null,
  growth5: null,
  regimeUncertain: false,
  fasterWindowRate: null,
  usedSlowerWindow: false,
  ownerBaseRecent: null,
  cashMidpoint: false,
  discountRate: null,
  reportingCurrency: null,
  reportingCurrencySource: null,
  terminalGrowthRate: POLICY_V1.horizon.terminalGrowthRate,
  years: POLICY_V1.horizon.years,
  yearsOfTerminalGrowth: POLICY_V1.horizon.yearsOfTerminalGrowth,
  tangibleBook: null,
  addToFairValue: false,
  currency: null,
  rate: null,
  classification: 'none',
  industry: null,
})

const finish = (entry, reasons, warnings) => ({
  ...entry,
  status: entry.value === null ? 'refused' : 'ok',
  reasons: orderBy(reasons, REASON_ORDER),
  warnings: orderBy(warnings, WARNING_ORDER),
})

/**
 * One published intrinsic value: a number plus warnings, or null plus reasons.
 * @param {object} stock normalised record (lib/stockRecord.toStock)
 * @param {{rates?: object|null, rate?: number|null|undefined, generatedAt?: string|null}} options
 *   rates  committed public/data/rates.json shape; rate overrides it with an
 *   already-resolved ten-year yield (watchlist). generatedAt enables staleness checks.
 * @returns {object}
 */
export function policyValue (stock, { rates = null, rate, generatedAt = null } = {}) {
  const reasons = []
  const warnings = []
  const inputs = emptyInputs()

  if (!stock || typeof stock !== 'object') {
    return finish({ symbol: null, status: 'refused', value: null, band: null, terminalShare: null, price: null, marginOfSafety: null, inputs, asOf: null, ratesAsOf: null }, [REASON.NO_SNAPSHOT], [])
  }

  const currency = cashflowCurrency(stock)
  const reportCurrency = reportingCurrency(stock)
  const asOf = stock._as_of || stock.as_of || null
  const earningsDate = stock.eps_as_of || null
  const earningsPeriod = stock.eps_period || null
  const earningsSource = stock.eps_source || null
  const price = priceOf(stock.price)
  const priceDate = price === null ? null : (stock.quote_as_of || null)
  inputs.currency = currency
  inputs.reportingCurrency = reportCurrency
  inputs.reportingCurrencySource = reportingCurrencySource(stock)

  // ---- discount rate ------------------------------------------------------
  let rateRow = null
  if (rate !== undefined) {
    const resolved = num(rate)
    if (resolved !== null) rateRow = { value: resolved, asOf: null, source: 'caller', proxy: null }
  } else if (rates) {
    const resolved = rateForCurrency(rates, reportCurrency)
    if (resolved && resolved.value != null) rateRow = resolved
  }
  if (!rateRow) {
    rateRow = { value: POLICY_V1.discount.fallback, asOf: null, source: 'fallback', proxy: null }
    warnings.push(WARNING.RATE_FALLBACK)
  }

  let discountRate = rateRow.source === 'fallback' ? rateRow.value : policyDiscountRate(rateRow.value)
  if (discountRate === null) {
    discountRate = rateRow.value
    warnings.push(WARNING.DISCOUNT_CLAMPED)
  }
  const clamped = Math.min(POLICY_V1.discount.max, Math.max(POLICY_V1.discount.min, discountRate))
  if (clamped !== discountRate) {
    discountRate = clamped
    warnings.push(WARNING.DISCOUNT_CLAMPED)
  }
  inputs.discountRate = discountRate
  inputs.rate = {
    value: rateRow.value,
    asOf: rateRow.asOf || null,
    source: rateRow.source || null,
    proxy: rateRow.proxy || null,
  }

  // ---- freshness (disclosed, never silently repaired) ---------------------
  if (generatedAt) {
    const age = earningsDate ? daysBetween(generatedAt, earningsDate) : null
    if (age === null || age < 0) warnings.push(WARNING.EARNINGS_DATE_UNKNOWN)
    else if (age > POLICY_V1.staleness.fundamentalsDays) warnings.push(WARNING.STALE_DATA)
    const quoteStatus = quoteDateStatus(price, priceDate, generatedAt)
    if (quoteStatus === 'unknown') warnings.push(WARNING.QUOTE_DATE_UNKNOWN)
    if (quoteStatus === 'historical') warnings.push(WARNING.STALE_PRICE)
  }
  if (price === null) warnings.push(WARNING.PRICE_MISSING)
  // A kept snapshot took a fresh quote: a split since the last filing cannot be ruled out.
  if (stock.split_unverified === true) warnings.push(WARNING.SPLIT_UNVERIFIED)

  // ---- earnings base ------------------------------------------------------
  const latestEps = num(policyEps(stock))
  const eps = num(stock.earnings_base) ?? latestEps
  const epsNormalized = num(stock.eps_normalized)
  const cashMedian = num(stock.cash_base)
  const daPerShare = num(stock.da_per_share)
  const maintenanceCapexProxy = num(stock.maintenance_capex_proxy)
  const sbcPerShare = num(stock.sbc_per_share)
  inputs.basis = POLICY_V1.basis
  inputs.eps = eps
  inputs.epsLatest = latestEps
  inputs.epsNormalized = epsNormalized
  inputs.cashMedian = cashMedian
  inputs.daPerShare = daPerShare
  inputs.maintenanceCapexProxy = maintenanceCapexProxy
  inputs.sbcPerShare = sbcPerShare
  inputs.ownerBaseGap = stock.owner_base_gap === true || daPerShare == null
  inputs.baseKind = describeBaseKind(eps, latestEps, epsNormalized, cashMedian, stock.financial_institution === true)
  const recent = stock.owner_base_recent
  inputs.ownerBaseRecent = recent && Number.isFinite(Number(recent.base))
    ? { base: Number(recent.base), latestEps: Number(recent.latestEps), latestCash: Number(recent.latestCash), ratio: Number(recent.ratio) }
    : null
  if (eps === null) reasons.push(REASON.NO_EPS)
  else if (eps <= 0) reasons.push(REASON.NON_POSITIVE_EPS)
  else if (latestEps !== null && Math.abs(eps / latestEps - 1) >= 0.25) warnings.push(WARNING.NORMALIZED_EPS)

  // ---- growth -------------------------------------------------------------
  // A cash-only base without a reported EPS (Visa) is not enough to assume 0%.
  const official = officialGrowth({
    growth10: stock.earning_growth_10y,
    growth5: stock.earning_growth_5y,
    hasPositiveBase: eps > 0 && latestEps != null,
  })
  const growth = official.adopted
  const terminalGrowthRate = POLICY_V1.horizon.terminalGrowthRate
  inputs.growth = growth
  inputs.growthWindow = official.window
  inputs.growthCap = official.cap
  inputs.growth10 = official.historical10
  inputs.growth5 = official.historical5
  inputs.fasterWindowRate = official.fasterWindowRate ?? null
  inputs.usedSlowerWindow = official.usedSlowerWindow === true
  inputs.regimeUncertain = official.regimeUncertain === true
  inputs.terminalGrowthRate = terminalGrowthRate
  if (growth === null) reasons.push(REASON.NO_GROWTH)
  warnings.push(...official.warnings)
  if (inputs.ownerBaseRecent) warnings.push(WARNING.RECENT_BASE_LAG)
  if (official.regimeUncertain && eps > 0 && !(latestEps > 0)) reasons.push(REASON.UNSTABLE_BASE_REGIME)

  // ---- book value (residual-income model only) ----------------------------
  const tangibleBook = num(stock.tangible_book)
  const model = policyModel(stock)
  inputs.model = model
  inputs.classification = stock.classification_basis || 'none'
  inputs.industry = stock.industry || null
  inputs.tangibleBook = tangibleBook
  if (stock.life_insurer) warnings.push(WARNING.LIFE_BOOK_QUALITY)
  if (model === POLICY_V1.model.financialInstitution && !(tangibleBook > 0)) reasons.push(REASON.NO_BOOK)
  if (POLICY_V1.trialOnlyIndustries.includes(inputs.industry)) {
    reasons.push(REASON.INDUSTRY_MODEL_PENDING)
    warnings.push(WARNING.MODEL_CAVEAT)
  }
  if (model !== POLICY_V1.model.financialInstitution && inputs.ownerBaseGap) {
    warnings.push(WARNING.OWNER_BASE_GAP)
  }

  const base = {
    symbol: symbolOf(stock), value: null, band: null, terminalShare: null, cash: null, price, priceDate,
    marginOfSafety: null, inputs, asOf, earningsDate, earningsPeriod, earningsSource, ratesAsOf: inputs.rate.asOf,
  }
  if (reasons.length) return finish(base, reasons, warnings)

  // ---- value --------------------------------------------------------------
  const horizon = POLICY_V1.horizon
  const valueFor = (which) => {
    if (which === POLICY_V1.model.financialInstitution) {
      const result = residualIncomeValue(tangibleBook, eps, discountRate, growth, terminalGrowthRate, horizon.years)
      return { value: result && Number.isFinite(result.fairValue) && result.fairValue > 0 ? result.fairValue : null, terminalShare: null, effectiveTerminalGrowth: null }
    }
    const result = presentValue(tangibleBook, horizon.years, discountRate, growth, eps, terminalGrowthRate, horizon.yearsOfTerminalGrowth, false)
    const ownerValue = Number.isFinite(result.fairValue) && result.fairValue > 0 ? result.fairValue : null
    return {
      value: ownerValue,
      terminalShare: ownerValue != null && result.growthValue + result.terminalValue > 0
        ? round4(result.terminalValue / (result.growthValue + result.terminalValue))
        : null,
      effectiveTerminalGrowth: result.effectiveTerminalGrowth,
    }
  }
  const chosen = valueFor(model)
  let value = chosen.value
  // Near or above the discount rate the capitalized growth is cut, so the value
  // sits on the shared capped caliber rather than switching horizons.
  if (value !== null && chosen.effectiveTerminalGrowth != null && terminalGrowthRate - chosen.effectiveTerminalGrowth > 0.005) {
    warnings.push(WARNING.TERMINAL_CAPPED)
  }
  let terminalShare = chosen.terminalShare
  let cash = null
  let cashMidpointValue = null
  if (value !== null) {
    if (model !== POLICY_V1.model.financialInstitution) {
      const cashBase = Number.isFinite(stock.cash_base) ? stock.cash_base : null
      const cashValue = cashBase === null
        ? null
        : presentValue(tangibleBook, horizon.years, discountRate, growth, cashBase, terminalGrowthRate, horizon.yearsOfTerminalGrowth, false).fairValue
      if (cashValue !== null && Number.isFinite(cashValue) && cashValue > 0) {
        const gap = cashValue / value - 1
        const ratio = Math.max(value, cashValue) / Math.min(value, cashValue)
        cash = { value: round2(cashValue), base: cashBase, gapPct: round4(gap * 100), ratio: round4(ratio) }
        if (ratio > POLICY_V1.cashMidpoint.maxRatio) {
          // Beyond roughly 2x the two measurements no longer describe the same
          // business; a midpoint would be misleading, so keep refusing.
          reasons.push(REASON.CASH_UNRECONCILED)
        } else if (Math.abs(gap) >= 0.5) {
          // Both measurements are positive and within the usable band: publish
          // their midpoint rather than going silent. The band below spans both.
          cashMidpointValue = (value + cashValue) / 2
          inputs.cashMidpoint = true
          warnings.push(WARNING.CASH_MIDPOINT)
        } else if (Math.abs(gap) >= 0.25) {
          warnings.push(WARNING.CASH_DIVERGENCE)
        }
      }
    }
    // Only a column-shaped route is unverified; record it when the other model
    // would publish a materially different number, so the page can say so.
    if (stock.classification_basis === 'columns') {
      const alternate = valueFor(model === POLICY_V1.model.financialInstitution ? POLICY_V1.model.nonFinancial : POLICY_V1.model.financialInstitution).value
      if (alternate !== null && Math.abs(alternate / value - 1) >= 0.25) warnings.push(WARNING.CLASSIFICATION_UNVERIFIED)
    }
    if (model !== POLICY_V1.model.financialInstitution && tangibleBook > 0 && eps > 0 && growth / 100 > eps / tangibleBook) {
      warnings.push(WARNING.GROWTH_ABOVE_RETENTION)
    }
  }
  if (reasons.includes(REASON.CASH_UNRECONCILED)) {
    return finish({ ...base, value: null, band: null, terminalShare, cash, marginOfSafety: null }, reasons, warnings)
  }
  if (value === null) {
    reasons.push(REASON.NOT_FINITE)
    return finish({ ...base, terminalShare }, reasons, warnings)
  }

  // A cash midpoint replaces the headline only after both measurements were
  // checked; the earnings-based value stays as the reference in the band.
  const earningsValue = value
  if (cashMidpointValue !== null) value = cashMidpointValue

  const bandInput = {
    residual: model === POLICY_V1.model.financialInstitution,
    bandSpread: POLICY_V1.band.discountSpread,
    tbv: tangibleBook,
    base: eps,
    discountRate,
    growthRate: growth,
    terminalGrowthRate,
    growth5: official.historical5,
    fasterWindowRate: official.fasterWindowRate ?? null,
    growthCap: official.cap,
    window: official.window,
    regimeUncertain: official.regimeUncertain === true,
    years: horizon.years,
    yearsOfTerminalGrowth: horizon.yearsOfTerminalGrowth,
    addToFairValue: false,
  }
  const band = valueBand(bandInput)
  let low = band.low
  let high = band.high
  // When the headline is the midpoint of two measurements, the disclosed band
  // must contain both of them; otherwise the range would hide the disagreement
  // that the headline is averaging away.
  if (cashMidpointValue !== null && cash?.value > 0) {
    const floor = Math.min(earningsValue, cash.value)
    const ceiling = Math.max(earningsValue, cash.value)
    low = low == null ? floor : Math.min(low, floor)
    high = high == null ? ceiling : Math.max(high, ceiling)
  }
  const publishedBand = {
    low: low == null ? null : round2(low),
    mid: value,
    high: high == null ? null : round2(high),
  }

  // ---- price is a separate fact: it only feeds the margin of safety --------
  const margin = Number(marginOfSafety(price, value))

  return finish({
    ...base,
    value,
    band: publishedBand.low === null && publishedBand.high === null ? null : publishedBand,
    terminalShare,
    cash,
    marginOfSafety: Number.isFinite(margin) ? margin : null,
  }, reasons, warnings)
}

/** Editorial summary of the policy, for the method page. Values stay code-owned. */
export function policySummary () {
  return {
    version: POLICY_VERSION,
    // Semantics added in v3; listed here so the pinned hash changes with them.
    revision: { ...POLICY_V1.revision },
    cashCrossCheck: POLICY_V1.revision.cashCrossCheck,
    basis: POLICY_V1.basis,
    models: { ...POLICY_V1.model },
    horizon: { ...POLICY_V1.horizon },
    growth: { ...POLICY_V1.growth },
    discount: { ...POLICY_V1.discount },
    price: { ...POLICY_V1.price },
    staleness: { ...POLICY_V1.staleness },
  }
}
