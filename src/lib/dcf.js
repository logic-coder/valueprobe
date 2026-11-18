// `calGr2fv` is the frozen two-stage finite annuity. `presentValue`, what the page
// shows, adds a continuing value after the second stage.
import { adoptGrowth } from './assumptions'

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
  const u = Math.pow(m, years) * (g / (1 - g)) * (1 - Math.pow(g, yearsOfTerminalGrowth))
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
  const { fairValue, growthValue, terminalValue } = unroundedPresentValue(tbv, years, discountRate, growthRate, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue)
  return {
    fairValue: round2(fairValue),
    growthValue: round2(growthValue),
    terminalValue: round2(terminalValue),
  }
}

// Keeps the capitalization multiple at or under 1 / 2% when terminal growth
// sits just under the discount rate.
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
  const invalid = { fairValue: NaN, growthValue: NaN, terminalValue: NaN }
  if (!(r > -1) || !Number.isFinite(g0) || !Number.isFinite(gT) || !Number.isFinite(start)) return invalid
  let flow = start
  let growthValue = 0
  let terminalValue = 0
  for (let t = 1; t <= n; t++) {
    const weight = n <= 1 ? 0 : (t - 1) / (n - 1)
    flow *= 1 + g0 + (gT - g0) * weight
    const discounted = flow / Math.pow(1 + r, t)
    if (!Number.isFinite(discounted)) return invalid
    growthValue += discounted
  }
  for (let k = 1; k <= m; k++) {
    flow *= 1 + gT
    const discounted = flow / Math.pow(1 + r, n + k)
    if (!Number.isFinite(discounted)) return invalid
    terminalValue += discounted
  }
  // The business outlives the explicit window: capitalize the following year at
  // r - g. Without r > g there is no finite multiple, so the annuity stands alone.
  if (r > gT) {
    const gc = Math.min(gT, r - CONTINUATION_SPREAD)
    const continuing = (flow * (1 + gc)) / (r - gc) / Math.pow(1 + r, n + m)
    if (!Number.isFinite(continuing)) return invalid
    terminalValue += continuing
  }
  let fairValue = growthValue + terminalValue
  if (addToFairValue) fairValue += Number(tbv) || 0
  return { fairValue, growthValue, terminalValue }
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
 * Reverse DCF: solve the fast-growth rate whose fair value equals the market price.
 * Same half-interval search as the original (start 75, step h/2, 2e6 iterations cap).
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
    const result = calGr2fv(tbv, years, discountRate, candidate, baseNum, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue)
    fair = result.fairValue
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
  if (!(book0 > 0) || !(earnings0 > 0) || !(r > 0)) return null
  const roe0 = earnings0 / book0
  const gStable = Math.min(Math.max(Number(terminalGrowthRate) / 100, 0), r - 0.005)
  const retainStable = clamp01(gStable / r)
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
  if (input.residual) {
    const mid = residualIncomeValue(input.tbv, input.base, input.discountRate, input.growthRate, terminal, years)?.fairValue
    const high = enduringBookValue(input.tbv, input.base, input.discountRate, input.growthRate, terminal)
    const low = residualIncomeValue(input.tbv, input.base, Number(input.discountRate) + 2, input.growthRate, terminal, years)?.fairValue
    return orderBand(low, mid, high)
  }
  const at = (discount) => presentValue(input.tbv, years, discount, input.growthRate, input.base, terminal, horizon, add).fairValue
  const mid = at(input.discountRate)
  const low = at(Number(input.discountRate) + 2)
  const eased = Math.max(Number(input.discountRate) - 2, Number(terminal) + 2)
  const high = at(eased)
  return orderBand(low, mid, high)
}

function orderBand (low, mid, high) {
  const values = [low, mid, high].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!values.length || !Number.isFinite(mid)) return { low: null, mid: null, high: null }
  return { low: round2(values[0]), mid: round2(mid), high: round2(values[values.length - 1]) }
}

/** Margin of safety in percent, or "n/a" exactly like the original. */
export function marginOfSafety (price, fairValue) {
  const value = 100 * (1 - price / fairValue)
  if (value > 100 || isNaN(value)) return 'n/a'
  return value.toFixed(2)
}

export const DCF_DEFAULTS = {
  years: 10,
  terminalGrowthRate: 4,
  yearsOfTerminalGrowth: 10,
}

/**
 * Defaults from the latest risk-free rate and the stock payload.
 * Growth uses the reported history. Only a missing history gets a placeholder.
 * @param {number|null} indicator latest risk-free rate, in percent
 * @param {object} stock stock payload
 * @param {number} freeCashFlow free cash flow per share
 */
export function buildDefaults (indicator, stock, freeCashFlow) {
  const discountRate = indicator ? Math.ceil(indicator) + 6 : 8
  const eps = stock.ttm_eps_nri ? stock.ttm_eps_nri : (stock.ttm_eps ?? stock.ttm_eps_nri ?? null)
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
