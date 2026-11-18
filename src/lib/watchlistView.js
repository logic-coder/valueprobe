// One line of the watchlist's valuation overview. Display-only: it seeds and computes
// exactly like the stock page's defaults would, and never writes back.
import { buildDefaults, marginOfSafety, presentValue, residualIncomeValue } from './dcf'
import { suggestedModel } from './valuationModel'
import { parseAmount } from './format'

const num = (value) => {
  const parsed = parseAmount(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Default-assumption fair value and margin of safety for a quote+payload.
 * @param {object} stock stock payload
 * @param {number|null} indicator latest risk-free indicator, as the calculator takes it
 * @returns {{fairValue: number|null, mos: string|null}}
 */
export function defaultView (stock, indicator = null) {
  const price = num(stock?.price)
  if (price === null || price <= 0) return { fairValue: null, mos: null }
  const defaults = buildDefaults(indicator, stock, num(stock.free_cash_flow_per_share) || 0)
  const form = defaults.dcfForm
  const result = defaults.dcfResultForm
  let fair
  try {
    fair = suggestedModel(stock) === 'residual'
      ? residualIncomeValue(num(result.tbv), form.eps, form.discountRate, form.growthRate, form.terminalGrowthRate)?.fairValue ?? null
      : presentValue(num(result.tbv) ?? 0, form.years, form.discountRate, form.growthRate, form.eps,
        form.terminalGrowthRate, form.yearsOfTerminalGrowth, false).fairValue
  } catch {
    return { fairValue: null, mos: null }
  }
  if (!Number.isFinite(fair) || fair <= 0) return { fairValue: null, mos: null }
  return { fairValue: fair, mos: marginOfSafety(price, fair) }
}
