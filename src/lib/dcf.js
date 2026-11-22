// `calGr2fv` is the frozen two-stage finite annuity. `presentValue`, what the page
// shows, adds a continuing value after the second stage.
import { adoptGrowth } from './assumptions'
import { defaultDiscountRate } from './riskFree'

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

/** Low, mid and high from the same model. Mid is the headline. */
export function valueBand (input) {
  const years = input.years
  const terminal = input.terminalGrowthRate
  const horizon = input.yearsOfTerminalGrowth
  const add = input.addToFairValue
  if (input.residual) return residualIncomeBand(input)
  const at = (discount) => presentValue(input.tbv, years, discount, input.growthRate, input.base, terminal, horizon, add).fairValue
  const mid = at(input.discountRate)
  const low = at(Number(input.discountRate) + 2)
  const eased = Math.max(Number(input.discountRate) - 2, Number(terminal) + 2)
  const high = at(eased)
  return orderBand(low, mid, high)
}

// One residual model, three discount rates. The convergence target is the
// discount rate, so it moves with the perturbed rate by design; the headline
// stays the base rate. A case that has no value (e.g. rate - 2 <= 0) keeps a
// missing endpoint instead of inventing width.
export function residualIncomeBand (input) {
  const spread = Number(input.bandSpread ?? 2)
  const at = (discount) => (Number(discount) > 0
    ? residualIncomeValue(input.tbv, input.base, discount, input.growthRate, input.terminalGrowthRate, input.years)?.fairValue
    : null)
  return orderBand(at(Number(input.discountRate) + spread), at(input.discountRate), at(Number(input.discountRate) - spread))
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
 * three are reported and positive. It is a cross-check, never the published base.
 */
export function sustainableCashBase (stock) {
  const annual = stock?.financials?.annual
  if (!Array.isArray(annual) || annual.length < 3) return null
  const recent = annual.slice(-3).map((row) => Number(row?.free_cash_flow_per_share))
  if (!recent.every((value) => Number.isFinite(value) && value > 0)) return null
  return Number([...recent].sort((a, b) => a - b)[1].toFixed(4))
}

export function buildDefaults (indicator, stock, freeCashFlow) {
  stock = stock || {}
  const discountRate = defaultDiscountRate(indicator)
  const eps = preferredEps(stock)
  const earnings = adoptGrowth(stock.earning_growth_10y)
  const cash = adoptGrowth(stock.cashflow_growth_10y)
  return {
    dcfForm: {
      eps,
      freecashflow: freeCashFlow ?? null,
      years: DCF_DEFAULTS.years,
      growthRate: earnings.adopted,
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
