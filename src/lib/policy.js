// ValueProbe public policy v3: the single place that decides which inputs the
// published intrinsic value uses, and which caveats travel with it. Pure
// functions only — the browser, the tests and scripts/policy-values.mjs all call
// this module, so the committed artifact and the screen cannot drift apart.
//
// Editing POLICY_V1 or the policy functions changes every published number. Bump POLICY_VERSION and
// update POLICY_V1_HASH in the same change; verify-data fails otherwise.
import { adoptGrowth, officialGrowth, MAX_UNDERWRITTEN_GROWTH, MIN_CLEAN_YEARS, REGIME_GAP_PP } from './assumptions'
import { cashflowCurrency, reportingCurrency, reportingCurrencySource, rateForCurrency, EQUITY_PREMIUM, FALLBACK_DISCOUNT_RATE, REQUIRED_RETURN_FLOOR } from './riskFree'
import { blendOfficialBase, DCF_DEFAULTS, marginOfSafety, preferredEps, presentValue, residualIncomeValue, round2, valueBand } from './dcf'
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
    band: 'disclosed-window-and-cash-earnings-envelope',
    cashCrossCheck: 'midpoint-when-gap-50-to-200',
    earningsBase: 'weighted-or-persistent-step-cash-bounded-fallback',
    publicationGate: 'cash-unreconciled-over-3x',
    officialGrowth: 'slower-of-two-clipped-windows',
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
    // When both windows exist, each is floored at 0% and capped at 15%, and
    // the slower is the official mid; the faster only widens the high end.
    // Negative history starts at 0%, fades to the default terminal, and
    // carries REGIME_UNCERTAIN. Opposite-sign windows also carry
    // REGIME_UNCERTAIN. Missing windows with a positive repeatable base
    // start at 0% and still fade to the default terminal.
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
export const POLICY_V1_HASH = 'c90b9e0ca92ddb829de9b5e91cba99928f5da874786f54e3936fcb6d30035ac5'

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
function describeBaseKind (eps, latest, normalized, cash, financial, { upshift = false, blend = null, method = null } = {}) {
  if (eps == null) return null
  if (blend === 'midpoint') return 'midpoint'
  if (method === 'persistent-step') return 'persistent-step'
  if (method === 'short-history') return 'short-history'
  if (method === 'median-fallback') return 'median-fallback'
  if (method === 'cash-confirmed-fallback') return 'cash-confirmed-fallback'
  if (upshift) return 'latest-fiscal'
  if (financial) return 'normalized'
  if (method === 'weighted') return 'normalized'
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
  latestFyEps: null,
  latestFyFcf: null,
  baseUpshift: false,
  baseMethod: null,
  baseAsOf: null,
  cashAsOf: null,
  ttmAsOf: null,
  ttmQuality: null,
  capexToOcf: null,
  capexToRevenue: null,
  maintenanceCapexMethod: null,
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
  // Official earnings_base is already chosen from complete fiscal years.
  // TTM (policyEps) stays a display figure and is not a fallback base.
  const latestEps = num(policyEps(stock))
  const earningsSide = num(stock.earnings_base)
  const cashSide = num(stock.cash_base)
  const epsNormalized = num(stock.eps_normalized)
  const upshift = stock.base_upshift === true
  // A cash-bounded fallback is already the lower of two reported measures; blending
  // it with the higher cash side would undo the bound.
  const blended = stock.cash_bounded_fallback === true
    ? { base: earningsSide, action: 'earnings', gap: null }
    : blendOfficialBase(earningsSide, cashSide, { financial: stock.financial_institution === true })
  // Midpoint of the two bases is the official mid because DCF is linear in the
  // base when tangible book is not added. A gap above 3× keeps the earnings
  // side only long enough to disclose the cash check, then refuses.
  const eps = blended.action === 'midpoint' ? blended.base : earningsSide
  const daPerShare = num(stock.da_per_share)
  const maintenanceCapexProxy = num(stock.maintenance_capex_proxy)
  const sbcPerShare = num(stock.sbc_per_share)
  inputs.basis = POLICY_V1.basis
  inputs.eps = eps
  inputs.epsLatest = latestEps
  inputs.epsNormalized = epsNormalized
  inputs.cashMedian = cashSide
  inputs.latestFyEps = num(stock.latest_fy_eps)
  inputs.latestFyFcf = num(stock.latest_fy_fcf)
  inputs.baseUpshift = upshift
  inputs.baseMethod = stock.base_method || null
  inputs.baseAsOf = stock.base_as_of || null
  inputs.cashAsOf = stock.cash_as_of || null
  inputs.ttmAsOf = stock.ttm_as_of || null
  inputs.ttmQuality = stock.ttm_eps_quality || null
  inputs.capexToOcf = num(stock.capex_to_ocf)
  inputs.capexToRevenue = num(stock.capex_to_revenue)
  inputs.maintenanceCapexMethod = stock.maintenance_capex_method || null
  inputs.daPerShare = daPerShare
  inputs.maintenanceCapexProxy = maintenanceCapexProxy
  inputs.sbcPerShare = sbcPerShare
  inputs.ownerBaseGap = stock.owner_base_gap === true || daPerShare == null
  inputs.baseKind = describeBaseKind(eps, latestEps, epsNormalized, cashSide, stock.financial_institution === true, {
    upshift, blend: blended.action, method: stock.base_method || null,
  })
  if (stock.base_refusal && REASON[stock.base_refusal]) reasons.push(REASON[stock.base_refusal])
  else if (earningsSide === null) reasons.push(REASON.NO_EPS)
  else if (earningsSide <= 0) reasons.push(REASON.NON_POSITIVE_EPS)
  else if (latestEps !== null && Math.abs(eps / latestEps - 1) >= 0.25) warnings.push(WARNING.NORMALIZED_EPS)
  if (Array.isArray(stock.base_warnings)) {
    for (const code of stock.base_warnings) {
      if (WARNING[code]) warnings.push(WARNING[code])
    }
  }

  // ---- growth -------------------------------------------------------------
  // A cash-only base without a reported EPS (Visa) is not enough to assume 0%.
  const official = officialGrowth({
    growth10: stock.earning_growth_10y,
    growth5: stock.earning_growth_5y,
    hasPositiveBase: earningsSide > 0 && latestEps != null,
  })
  const growth = official.adopted
  const terminalGrowthRate = POLICY_V1.horizon.terminalGrowthRate
  inputs.growth = growth
  inputs.growthWindow = official.window
  inputs.growthCap = official.cap
  inputs.growth10 = official.historical10
  inputs.growth5 = official.historical5
  inputs.regimeUncertain = official.regimeUncertain === true
  inputs.terminalGrowthRate = terminalGrowthRate
  if (growth === null) reasons.push(REASON.NO_GROWTH)
  warnings.push(...official.warnings)
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
  if (value !== null) {
    if (model !== POLICY_V1.model.financialInstitution) {
      const cashBase = cashSide != null && Number.isFinite(cashSide) ? cashSide : null
      const cashValue = cashBase === null
        ? null
        : presentValue(tangibleBook, horizon.years, discountRate, growth, cashBase, terminalGrowthRate, horizon.yearsOfTerminalGrowth, false).fairValue
      if (cashValue !== null && Number.isFinite(cashValue) && cashValue > 0) {
        const earningsValue = blended.action === 'midpoint'
          ? presentValue(tangibleBook, horizon.years, discountRate, growth, earningsSide, terminalGrowthRate, horizon.yearsOfTerminalGrowth, false).fairValue
          : value
        const gap = earningsValue > 0 ? cashValue / earningsValue - 1 : null
        cash = { value: round2(cashValue), base: cashBase, gapPct: gap == null ? null : round4(gap * 100) }
        if (blended.action === 'refuse') reasons.push(REASON.CASH_UNRECONCILED)
        else if (blended.action === 'midpoint') warnings.push(WARNING.CASH_MIDPOINT)
        else if (gap != null && Math.abs(gap) >= 0.25) warnings.push(WARNING.CASH_DIVERGENCE)
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

  const band = valueBand({
    residual: model === POLICY_V1.model.financialInstitution,
    bandSpread: POLICY_V1.band.discountSpread,
    tbv: tangibleBook,
    base: blended.action === 'midpoint' ? earningsSide : eps,
    cashBase: blended.action === 'midpoint' ? cashSide : null,
    blend: blended.action === 'midpoint' ? 'midpoint' : null,
    discountRate,
    growthRate: growth,
    terminalGrowthRate,
    growth10: official.historical10,
    growth5: official.historical5,
    highGrowth: official.highGrowth,
    growthCap: official.cap,
    window: official.window,
    regimeUncertain: official.regimeUncertain === true,
    years: horizon.years,
    yearsOfTerminalGrowth: horizon.yearsOfTerminalGrowth,
    addToFairValue: false,
  })

  // The headline is the official mid, including a cash/earnings midpoint.
  if (band.mid != null) value = band.mid

  // ---- price is a separate fact: it only feeds the margin of safety --------
  const margin = Number(marginOfSafety(price, value))

  return finish({
    ...base,
    value,
    band: band.low === null && band.high === null ? null : { low: band.low, mid: band.mid, high: band.high },
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
