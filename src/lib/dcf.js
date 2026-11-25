// `calGr2fv` is the frozen two-stage finite annuity. `presentValue`, what the page
// shows, adds a continuing value after the second stage.
import { adoptGrowth, officialGrowth } from './assumptions'
import { defaultDiscountRate } from './riskFree'
import { selectOfficialBase } from './valuationBase'

export const round2 = (value) => Math.round(100 * value) / 100

/**
 * Discounted cash-flow / discounted-earnings fair value.
 *
 * @param {number} tbv tangible book value per share (added to the fair value when addToFairValue)
 * @param {number} years fast-growth years
 * @param {number} discountRate discount rate in percent
 * @param {number} growthRate fast-growth rate in percent
 * @param {number} base base per-share flow (eps or free cash flow)
 * @param {number} terminalGrowthRate terminal growth rate in percent
 * @param {number} yearsOfTerminalGrowth number of terminal-growth years
 * @param {boolean} addToFairValue add TBV to the resulting fair value
 */
export function calGr2fv (tbv, years, discountRate, growthRate, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue) {
  const f = discountRate / 100
  const h = growthRate / 100
  const p = terminalGrowthRate / 100
  const m = (1 + h) / (1 + f)
  const g = (1 + p) / (1 + f)
  // annuity factor of the fast-growth window
  const c = m === 1 ? m * years : (m * (1 - Math.pow(m, years))) / (1 - m)
  // terminal window, discounted back after the fast-growth window
  // The finite geometric series is valid on both sides of g = 1; only the
  // closed form divides by zero exactly there, where the limit is years.
  const u = Math.abs(1 - g) < 1e-12
    ? Math.pow(m, years) * yearsOfTerminalGrowth
    : Math.pow(m, years) * (g / (1 - g)) * (1 - Math.pow(g, yearsOfTerminalGrowth))
  let fair = base * (c + u)
  if (addToFairValue) fair += tbv
  return {
    fairValue: round2(fair),
    growthValue: round2(base * c),
    terminalValue: round2(base * u),
  }
}

/**
 * What the page discounts. The fast-growth rate is the rate at the start of the
 * explicit window and falls in a straight line to the terminal rate. Holding a
 * historical CAGR flat for the whole window, while it is above the discount
 * rate, makes each later year worth more than the one before it.
 * `calGr2fv` stays the constant-rate closed form.
 */
export function presentValue (tbv, years, discountRate, growthRate, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue) {
  const result = unroundedPresentValue(tbv, years, discountRate, growthRate, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue)
  return {
    fairValue: round2(result.fairValue),
    growthValue: round2(result.growthValue),
    terminalValue: round2(result.terminalValue),
    finiteTerminalValue: round2(result.finiteTerminalValue),
    continuationValue: round2(result.continuationValue),
    continuation: result.continuation,
    effectiveTerminalGrowth: result.effectiveTerminalGrowth,
  }
}

// The capitalized rate is never closer than this to the discount rate, so the
// multiple stays at or under 1 / 2% and the r = gT boundary does not jump.
const CONTINUATION_SPREAD = 0.02

// Year 1 grows at g0 and the last fast-growth year at gT, then gT for the
// terminal years, then one continuing value for everything after.
function unroundedPresentValue (tbv, years, discountRate, growthRate, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue) {
  const r = Number(discountRate) / 100
  const g0 = Number(growthRate) / 100
  const gT = Number(terminalGrowthRate) / 100
  const n = Math.max(0, Math.round(Number(years) || 0))
  const m = Math.max(0, Math.round(Number(yearsOfTerminalGrowth) || 0))
  const start = Number(base)
  const invalid = { fairValue: NaN, growthValue: NaN, terminalValue: NaN, finiteTerminalValue: NaN, continuationValue: NaN, continuation: false, effectiveTerminalGrowth: null }
  if (!(r > -1) || !Number.isFinite(g0) || !Number.isFinite(gT) || !Number.isFinite(start)) return invalid
  // One effective rate for the fade target, the terminal years and the continuing
  // value. Above the cap, changing raw terminal growth therefore changes nothing.
  const gc = Math.min(gT, r - CONTINUATION_SPREAD)
  let flow = start
  let growthValue = 0
  let finiteTerminalValue = 0
  for (let t = 1; t <= n; t++) {
    const weight = n <= 1 ? 0 : (t - 1) / (n - 1)
    flow *= 1 + g0 + (gc - g0) * weight
    const discounted = flow / Math.pow(1 + r, t)
    if (!Number.isFinite(discounted)) return invalid
    growthValue += discounted
  }
  for (let k = 1; k <= m; k++) {
    flow *= 1 + gc
    const discounted = flow / Math.pow(1 + r, n + k)
    if (!Number.isFinite(discounted)) return invalid
    finiteTerminalValue += discounted
  }
  // The business outlives the explicit window. Always capitalize at the same
  // effective rate: crossing gT = r then changes that rate only, not the horizon.
  // The finite part above stays separately reportable.
  const continuing = (flow * (1 + gc)) / (r - gc) / Math.pow(1 + r, n + m)
  if (!Number.isFinite(continuing)) return invalid
  const terminalValue = finiteTerminalValue + continuing
  let fairValue = growthValue + terminalValue
  if (addToFairValue) fairValue += Number(tbv) || 0
  return {
    fairValue, growthValue, terminalValue, finiteTerminalValue, continuationValue: continuing,
    continuation: true, effectiveTerminalGrowth: gc * 100,
  }
}

const IMPLIED_LOW = -99
const IMPLIED_HIGH = 200
const IMPLIED_ITERATIONS = 60

/** Starting growth whose fading path is worth the market price. */
export function impliedGrowth (tbv, years, discountRate, base, price, terminalGrowthRate, priceAgain, yearsOfTerminalGrowth, addToFairValue) {
  const supplied = priceAgain !== undefined && priceAgain !== null && priceAgain !== '' ? priceAgain : price
  const target = parseFloat(supplied)
  const baseNum = Number(base)
  if (!(baseNum > 0) || !(target > 0)) return null
  const fairAt = (growth) => unroundedPresentValue(tbv, years, discountRate, growth, baseNum, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue).fairValue
  const lowFair = fairAt(IMPLIED_LOW)
  const highFair = fairAt(IMPLIED_HIGH)
  if (!Number.isFinite(lowFair) || !Number.isFinite(highFair)) return null
  if (lowFair > target || highFair < target) return null
  let low = IMPLIED_LOW
  let high = IMPLIED_HIGH
  for (let i = 0; i < IMPLIED_ITERATIONS; i++) {
    const mid = (low + high) / 2
    const fair = fairAt(mid)
    if (!Number.isFinite(fair)) return null
    if (fair < target) low = mid
    else high = mid
  }
  return ((low + high) / 2).toFixed(2)
}

/**
 * Frozen comparison solver for the original constant-growth finite annuity.
 * The page pairs `presentValue` with `impliedGrowth`.
 */
export function calculateReverse (tbv, years, discountRate, base, price, terminalGrowthRate, priceAgain, yearsOfTerminalGrowth, addToFairValue) {
  let iterations = 0
  let last = 0
  let h = 75
  const supplied = priceAgain !== undefined && priceAgain !== null && priceAgain !== '' ? priceAgain : price
  const target = parseFloat(supplied)
  const baseNum = Number(base)
  // A non-positive base makes every candidate 0 or NaN. The old search treated
  // that NaN as "converged" and returned an astronomical growth rate.
  if (!(baseNum > 0) || !(target > 0)) return null
  let fair = 0
  do {
    iterations++
    if (iterations > 2e6) return null
    const candidate = h - 50
    fair = calGr2fv(tbv, years, discountRate, candidate, baseNum, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue).fairValue
    last = candidate
    if (!Number.isFinite(fair) || fair <= 0) return null
    if (fair < target) h += h / 2
    else h -= h / 2
  } while (target / fair > 1.00001 || target / fair < 0.99999)
  if (!Number.isFinite(last)) return null
  return last.toFixed(2)
}

const clamp01 = (value) => Math.min(1, Math.max(0, value))

/**
 * What the equity is worth if today's return on book never fades.
 * book × (ROE − g) / (r − g). The range sorts this to whichever end it lands on.
 * @returns {number|null}
 */
export function enduringBookValue (tbv, eps, discountRate, growthRate, terminalGrowthRate) {
  const book = Number(tbv)
  const earnings = Number(eps)
  const r = Number(discountRate) / 100
  const roe = earnings / book
  if (!(book > 0) || !(earnings > 0) || !(r > 0)) return null
  const g = Math.min(Number(growthRate) / 100, Number(terminalGrowthRate) / 100, roe - 0.01)
  if (!(roe > g) || !(r > g)) return null
  const fair = book * (roe - g) / (r - g)
  return Number.isFinite(fair) && fair > 0 ? round2(fair) : null
}

/**
 * Residual income for a bank or insurer. Return on book fades in a straight
 * line from today's ROE to the cost of equity, so the premium does not last
 * forever. Book grows by retained earnings. When ROE already equals the
 * discount rate, every excess is zero and the value is the book.
 * @returns {{ fairValue: number, roe: number, growth: number }|null}
 */
export function residualIncomeValue (tbv, eps, discountRate, growthRate, terminalGrowthRate, years = 10) {
  const book0 = Number(tbv)
  const earnings0 = Number(eps)
  const r = Number(discountRate) / 100
  const n = Math.max(1, Math.round(Number(years) || 10))
  if (!(book0 > 0) || !(earnings0 > 0) || !(r >= 0)) return null
  const roe0 = earnings0 / book0
  // At a zero cost of equity nothing is discounted and g/r is undefined; keep
  // every excess return and let book compound at ROE. Band ends below zero
  // still stay missing.
  const gStable = r > 0 ? Math.min(Math.max(Number(terminalGrowthRate) / 100, 0), r - 0.005) : Math.max(Number(terminalGrowthRate) / 100, 0)
  const retainStable = r > 0 ? clamp01(gStable / r) : 1
  const gHist = Number(growthRate) / 100
  const retainNow = roe0 > 0 ? clamp01(gHist / roe0) : retainStable
  let book = book0
  let pv = 0
  for (let t = 1; t <= n; t++) {
    const weight = n <= 1 ? 1 : (t - 1) / (n - 1)
    const roe = roe0 + (r - roe0) * weight
    pv += book * (roe - r) / Math.pow(1 + r, t)
    const retain = retainNow + (retainStable - retainNow) * weight
    book += book * roe * retain
  }
  const fair = book0 + pv
  if (!Number.isFinite(fair) || fair <= 0) return null
  return { fairValue: round2(fair), roe: round2(roe0 * 100), growth: round2(gStable * 100) }
}

/**
 * Disclosed growth and discount scenarios around a centered point estimate.
 * Mid is always the official assumptions. Low and high are the more adverse
 * and more favourable already-disclosed cases: discount ±2 points, and a
 * lower or higher disclosed starting rate. A 0% growth low is used only when
 * the official start is already 0%, history is negative, or the regime is
 * uncertain (opposite signs or a negative window). A 0% terminal is included
 * on the low side only when the regime is uncertain. A positive five-year
 * official window may widen the high end toward the 15% cap; a zeroed
 * short history does not invent 15%. A missing window does not invent a
 * 15% high. The official mid is never replaced by the arithmetic middle of
 * an asymmetric envelope.
 */
export function envelopeScenarios (input) {
  const spread = Number(input.bandSpread ?? 2)
  const cap = Number.isFinite(Number(input.growthCap)) ? Number(input.growthCap) : 15
  const officialG = Number(input.growthRate)
  const officialT = Number(input.terminalGrowthRate)
  const adopt = (raw) => {
    if (raw == null || raw === '') return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), cap) : null
  }
  const fiveAdopted = adopt(input.growth5)
  const tenAdopted = adopt(input.growth10)
  const short = input.window === '5y'
  const noWindow = input.window === 'none'
  const regime = input.regimeUncertain === true
  const lowDiscount = Number(input.discountRate) + spread
  const highDiscount = Math.max(Number(input.discountRate) - spread, officialT + 2)
  let highGrowth = officialG
  if (fiveAdopted != null && fiveAdopted > officialG) highGrowth = fiveAdopted
  if (tenAdopted != null && tenAdopted > officialG) highGrowth = Math.max(highGrowth, tenAdopted)
  if (Number.isFinite(Number(input.highGrowth)) && Number(input.highGrowth) > highGrowth) {
    highGrowth = Math.min(Number(input.highGrowth), cap)
  }
  if (short && officialG > 0) highGrowth = cap

  const mid = { discount: Number(input.discountRate), growth: officialG, terminal: officialT }
  const low = [
    { discount: lowDiscount, growth: officialG, terminal: officialT },
  ]
  const slower = [fiveAdopted, tenAdopted].filter((rate) => rate != null && rate < officialG)
  if (slower.length) {
    low.push({ discount: lowDiscount, growth: Math.min(...slower), terminal: officialT })
  }
  if (regime && officialG !== 0) {
    low.push({ discount: lowDiscount, growth: 0, terminal: officialT })
  }
  if (regime) {
    low.push({ discount: lowDiscount, growth: officialG, terminal: 0 })
    low.push({ discount: lowDiscount, growth: 0, terminal: 0 })
    if (fiveAdopted != null) low.push({ discount: lowDiscount, growth: fiveAdopted, terminal: 0 })
  }
  const high = noWindow
    ? [{ discount: highDiscount, growth: officialG, terminal: officialT }]
    : [
        { discount: highDiscount, growth: officialG, terminal: officialT },
        { discount: highDiscount, growth: highGrowth, terminal: officialT },
      ]
  return { mid, low, high }
}

const ownerAt = (input, scene) => presentValue(
  input.tbv, input.years, scene.discount, scene.growth, input.base, scene.terminal, input.yearsOfTerminalGrowth, input.addToFairValue,
).fairValue

const residualAt = (input, scene) => (Number(scene.discount) > 0
  ? residualIncomeValue(input.tbv, input.base, scene.discount, scene.growth, scene.terminal, input.years)?.fairValue
  : null)

function bandFromScenarios (input, valueAt) {
  const scenes = envelopeScenarios(input)
  const mid = valueAt(input, scenes.mid)
  const low = scenes.low.map((scene) => valueAt(input, scene))
  const high = scenes.high.map((scene) => valueAt(input, scene))
  const usable = (value) => (Number.isFinite(value) && value > 0 ? value : null)
  const floor = low.map(usable).filter((value) => value != null)
  const ceiling = high.map(usable).filter((value) => value != null)
  return orderBand(
    floor.length ? Math.min(...floor) : null,
    mid,
    ceiling.length ? Math.max(...ceiling) : null,
  )
}

/** Low, mid and high from the same model. Mid is the headline point estimate. */
export function valueBand (input) {
  if (input.residual) return residualIncomeBand(input)
  if (input.blend === 'midpoint' && Number(input.cashBase) > 0 && Number(input.base) > 0) {
    return blendedOwnerBand(input)
  }
  return bandFromScenarios(input, ownerAt)
}

/**
 * Mid is the official midpoint (equivalent to discounting the mid base, because
 * presentValue is linear in the base when tangible book is not added). Low and
 * high are the union of the disclosed discount/growth envelopes on both bases,
 * so the range covers both valuations and is not narrowed twice around the mid.
 * The midpoint stays strictly inside that union; it is not replaced by the
 * arithmetic middle of the envelope.
 */
function blendedOwnerBand (input) {
  const midBase = (Number(input.base) + Number(input.cashBase)) / 2
  const mid = ownerAt({ ...input, base: midBase }, envelopeScenarios(input).mid)
  const earnings = bandFromScenarios(input, ownerAt)
  const cash = bandFromScenarios({ ...input, base: input.cashBase }, ownerAt)
  const lows = [earnings.low, cash.low, earnings.mid, cash.mid]
  const highs = [earnings.high, cash.high, earnings.mid, cash.mid]
  const usable = (value) => (Number.isFinite(value) && value > 0 ? value : null)
  const floor = lows.map(usable).filter((value) => value != null)
  const ceiling = highs.map(usable).filter((value) => value != null)
  return orderBand(
    floor.length ? Math.min(...floor) : null,
    mid,
    ceiling.length ? Math.max(...ceiling) : null,
  )
}

// One residual model. Discount, growth and terminal follow the same disclosed
// envelope as the owner model. The headline stays the official mid.
export function residualIncomeBand (input) {
  return bandFromScenarios(input, residualAt)
}

export function orderBand (low, mid, high) {
  const usable = (value) => (Number.isFinite(value) && value > 0 ? round2(value) : null)
  const middle = usable(mid)
  if (middle === null) return { low: null, mid: null, high: null }
  const values = [low, mid, high].map(usable).filter((value) => value !== null).sort((a, b) => a - b)
  const floor = values[0]
  const ceiling = values[values.length - 1]
  return {
    low: floor < middle ? floor : null,
    mid: middle,
    high: ceiling > middle ? ceiling : null,
  }
}

/** Margin of safety in percent, or "n/a" exactly like the original. */
export function marginOfSafety (price, fairValue) {
  if (!['number', 'string'].includes(typeof price) || !['number', 'string'].includes(typeof fairValue)) return 'n/a'
  const quote = Number(price)
  const fair = Number(fairValue)
  if (!Number.isFinite(quote) || quote <= 0 || !Number.isFinite(fair) || fair <= 0) return 'n/a'
  const value = 100 * (1 - quote / fair)
  if (!Number.isFinite(value)) return 'n/a'
  return value.toFixed(2)
}

export const DCF_DEFAULTS = {
  years: 10,
  terminalGrowthRate: 4,
  yearsOfTerminalGrowth: 10,
}

/**
 * Defaults from the latest risk-free rate and the stock payload.
 * Growth uses the reported history. A missing history stays empty.
 * @param {number|null} indicator latest risk-free rate, in percent
 * @param {object} stock stock payload
 * @param {number} freeCashFlow free cash flow per share
 */
/** Prefer reported diluted EPS, then basic; explicit 0 is a value, not missing. */
export function preferredEps (stock) {
  for (const value of [stock?.ttm_eps_nri, stock?.ttm_eps]) {
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * Median after-capex cash of the latest three fiscal years, or null unless all
 * three are reported and positive. This function returns only the cash figure.
 * It is a cross-check input, not by itself the published base. When both the
 * cash and earnings sides can form a positive valuation and the symmetric gap
 * is 50%–200%, the official published value uses the midpoint of those two
 * valuations (CASH_MIDPOINT). A gap under 50% stays earnings-primary; a gap
 * above 200%, or a side that cannot form a positive base, still refuses.
 * Financial residual-income paths do not use a cash midpoint.
 */
export function sustainableCashBase (stock) {
  const annual = stock?.financials?.annual
  if (!Array.isArray(annual) || annual.length < 3) return null
  const recent = annual.slice(-3).map((row) => Number(row?.free_cash_flow_per_share))
  if (!recent.every((value) => Number.isFinite(value) && value > 0)) return null
  return Number([...recent].sort((a, b) => a - b)[1].toFixed(4))
}

/** Latest complete fiscal year must exceed this multiple of the earlier peak. */
export const UPSHIFT_PRIOR_MULTIPLE = 2

const datedAnnual = (annual) => (Array.isArray(annual) ? annual.filter((row) => row && row.date) : [])

const metric = (row, field) => {
  const parsed = Number(row?.[field])
  return Number.isFinite(parsed) ? parsed : null
}

/** Latest complete fiscal year figure, or null. */
export function latestFiscalValue (annual, field) {
  const rows = datedAnnual(annual)
  for (let i = rows.length - 1; i >= 0; i--) {
    const value = metric(rows[i], field)
    if (value != null) return Number(value.toFixed(4))
  }
  return null
}

/**
 * Both earnings and cash have risen together off an earlier plateau, so the
 * repeatable base is the latest complete fiscal year on both sides — not a
 * multi-year median, and not trailing twelve-month earnings. Cyclical names
 * that have only returned to an old high stay on the median. Purely mechanical:
 * last three complete years strictly rise on both series, the latest year is
 * the high of all available history on both, and that latest year is more than
 * twice the peak from years before those last three. A missing earlier peak,
 * or a hole in the last three years, is not an upshift.
 */
export function isSynchronousUpshift (annual) {
  const rows = datedAnnual(annual)
  if (rows.length < 3) return false
  const last3 = rows.slice(-3)
  const eps = last3.map((row) => metric(row, 'eps_without_nri'))
  const fcf = last3.map((row) => metric(row, 'free_cash_flow_per_share'))
  if (!eps.every((value) => value > 0) || !fcf.every((value) => value > 0)) return false
  if (!(eps[0] < eps[1] && eps[1] < eps[2])) return false
  if (!(fcf[0] < fcf[1] && fcf[1] < fcf[2])) return false
  const earlier = rows.slice(0, -3)
  const priorEps = earlier.map((row) => metric(row, 'eps_without_nri')).filter((value) => value > 0)
  const priorFcf = earlier.map((row) => metric(row, 'free_cash_flow_per_share')).filter((value) => value > 0)
  if (!priorEps.length || !priorFcf.length) return false
  const peakEps = Math.max(...priorEps)
  const peakFcf = Math.max(...priorFcf)
  const allEps = rows.map((row) => metric(row, 'eps_without_nri')).filter((value) => value > 0)
  const allFcf = rows.map((row) => metric(row, 'free_cash_flow_per_share')).filter((value) => value > 0)
  if (eps[2] !== Math.max(...allEps) || fcf[2] !== Math.max(...allFcf)) return false
  return eps[2] > UPSHIFT_PRIOR_MULTIPLE * peakEps && fcf[2] > UPSHIFT_PRIOR_MULTIPLE * peakFcf
}

/** Larger / smaller − 1, or null when either side is not a positive value. */
export function symmetricValueGap (left, right) {
  if (!(left > 0) || !(right > 0)) return null
  return Math.max(left, right) / Math.min(left, right) - 1
}

/**
 * Choose the published owner-model base after both sides have already been
 * put on the same footing (median or latest fiscal year). presentValue is
 * linear in the base when tangible book is not added, so a 50–200% gap
 * midpoints the two valuations if and only if it midpoints the two bases.
 * A gap above 200% (about 3×) is still a refusal. Financial institutions
 * never mix in free cash flow.
 */
export function blendOfficialBase (earnings, cash, { financial = false } = {}) {
  if (financial) {
    return { base: earnings > 0 ? earnings : null, action: earnings > 0 ? 'earnings' : 'none', gap: null }
  }
  if (!(earnings > 0)) return { base: null, action: 'none', gap: null }
  if (!(cash > 0)) return { base: earnings, action: 'earnings-no-cash', gap: null }
  const gap = symmetricValueGap(earnings, cash)
  if (gap > 2) return { base: earnings, action: 'refuse', gap }
  if (gap >= 0.5) return { base: (earnings + cash) / 2, action: 'midpoint', gap }
  return { base: earnings, action: 'earnings', gap }
}

/**
 * Reported earnings, recency-weighted across up to five complete fiscal years
 * with quality down-weights. A confirmed persistent step uses the last three
 * weighted years. TTM is never a fallback official base.
 */
export function normalizedEpsBase (stock) {
  return selectOfficialBase(stock).earningsBase
}

/**
 * Official earnings-base helper: five-year normalised earnings.
 *
 * Under the disclosed maintenance proxy M≈D, owner earnings equal normalised
 * earnings (OE = E + D − M = E). Depreciation, the maintenance proxy and
 * share-based compensation are listed as components; SBC stays expensed and
 * is not added back. This function itself returns only the earnings figure;
 * it does not blend in cash. After-capex cash remains a separate cross-check
 * input. The published official value is chosen later by blendOfficialBase /
 * policyValue: a 50%–200% gap midpoints the two valuations (CASH_MIDPOINT);
 * a gap under 50% stays earnings-primary; a gap above 200% or a side that
 * cannot form a positive base still refuses. Financial residual-income
 * paths do not use a cash midpoint.
 *
 * No growth is assumed here: this is a repeatable base, not a forecast.
 */
export function normalizedEarningsBase (stock, _options = {}) {
  const earnings = normalizedEpsBase(stock)
  return earnings === null ? null : Number(Number(earnings).toFixed(4))
}

export function buildDefaults (indicator, stock, freeCashFlow) {
  stock = stock || {}
  const discountRate = defaultDiscountRate(indicator)
  const latestEps = preferredEps(stock)
  const earnings = Number.isFinite(stock.earnings_base) ? stock.earnings_base : null
  const cashBase = Number.isFinite(stock.cash_base) ? stock.cash_base : null
  // A cash-bounded fallback is already the lower of two reported measures; the
  // seeded calculator must not blend it back up with the higher cash side.
  const blended = stock.cash_bounded_fallback === true
    ? { base: earnings, action: 'earnings', gap: null }
    : blendOfficialBase(earnings, cashBase, { financial: stock.financial_institution === true })
  const eps = blended.action === 'refuse' || blended.action === 'none' ? earnings : blended.base
  const official = officialGrowth({
    growth10: stock.earning_growth_10y,
    growth5: stock.earning_growth_5y,
    hasPositiveBase: earnings > 0 && latestEps != null,
  })
  const cash = adoptGrowth(stock.cashflow_growth_10y)
  return {
    dcfForm: {
      eps,
      freecashflow: freeCashFlow ?? null,
      years: DCF_DEFAULTS.years,
      growthRate: official.adopted,
      freecashflowGrowthRate: cash.adopted,
      terminalGrowthRate: DCF_DEFAULTS.terminalGrowthRate,
      yearsOfTerminalGrowth: DCF_DEFAULTS.yearsOfTerminalGrowth,
      discountRate,
    },
    dcfResultForm: {
      tbv: stock.tangible_book,
      stockPrice: String(stock.price).replace(/[^0-9.+-]+/g, ''),
    },
  }
}
