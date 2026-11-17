// Two-stage finite annuity. Fast-growth years, then a second stage of
// `yearsOfTerminalGrowth` years. Cash flows stop after that; there is no perpetuity.
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
  const r = Number(discountRate) / 100
  const g0 = Number(growthRate) / 100
  const gT = Number(terminalGrowthRate) / 100
  const n = Math.max(0, Math.round(Number(years) || 0))
  const m = Math.max(0, Math.round(Number(yearsOfTerminalGrowth) || 0))
  const start = Number(base)
  if (!(r > -1) || !Number.isFinite(g0) || !Number.isFinite(gT) || !Number.isFinite(start)) {
    return { fairValue: NaN, growthValue: NaN, terminalValue: NaN }
  }
  let flow = start
  let growthValue = 0
  let terminalValue = 0
  for (let t = 1; t <= n; t++) {
    flow *= 1 + g0 + (gT - g0) * (t / n)
    const discounted = flow / Math.pow(1 + r, t)
    if (!Number.isFinite(discounted)) return { fairValue: NaN, growthValue: NaN, terminalValue: NaN }
    growthValue += discounted
  }
  for (let k = 1; k <= m; k++) {
    flow *= 1 + gT
    const discounted = flow / Math.pow(1 + r, n + k)
    if (!Number.isFinite(discounted)) return { fairValue: NaN, growthValue: NaN, terminalValue: NaN }
    terminalValue += discounted
  }
  let fair = growthValue + terminalValue
  if (addToFairValue) fair += Number(tbv) || 0
  return {
    fairValue: round2(fair),
    growthValue: round2(growthValue),
    terminalValue: round2(terminalValue),
  }
}

/** Starting growth whose fading path is worth the market price. */
export function impliedGrowth (tbv, years, discountRate, base, price, terminalGrowthRate, priceAgain, yearsOfTerminalGrowth, addToFairValue) {
  let iterations = 0
  let last = 0
  let h = 75
  const supplied = priceAgain !== undefined && priceAgain !== null && priceAgain !== '' ? priceAgain : price
  const target = parseFloat(supplied)
  const baseNum = Number(base)
  if (!(baseNum > 0) || !(target > 0)) return null
  let fair = 0
  do {
    iterations++
    if (iterations > 2e6) return null
    const candidate = h - 50
    fair = presentValue(tbv, years, discountRate, candidate, baseNum, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue).fairValue
    last = candidate
    if (!Number.isFinite(fair) || fair <= 0) return null
    if (fair < target) h += h / 2
    else h -= h / 2
  } while (target / fair > 1.00001 || target / fair < 0.99999)
  if (!Number.isFinite(last)) return null
  return last.toFixed(2)
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
  const eps = stock.ttm_eps_nri ? stock.ttm_eps_nri : (stock.ttm_eps ? stock.ttm_eps : 0)
  const earnings = adoptGrowth(stock.earning_growth_10y)
  const cash = adoptGrowth(stock.cashflow_growth_10y)
  return {
    dcfForm: {
      eps,
      freecashflow: freeCashFlow || 0,
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
