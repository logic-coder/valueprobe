import { median } from './owner-earnings.mjs'

export function historicalCashBase (annualCash) {
  if (!Array.isArray(annualCash) || annualCash.length !== 3 || !annualCash.every(Number.isFinite)) return null
  const base = median(annualCash)
  return base > 0 ? base : null
}

// Growth is for cash after reinvestment and already reflects its funding needs.
export function forecastCash (base, { years, growth, terminalGrowthRate }) {
  if (!Number.isFinite(base) || base <= 0) return null
  if (!Number.isInteger(years) || years < 2 || ![growth, terminalGrowthRate].every(rate => Number.isFinite(rate) && rate > -100)) return null

  let cash = base
  const flows = Array.from({ length: years }, (_, index) => {
    const rate = growth + (terminalGrowthRate - growth) * index / (years - 1)
    cash *= 1 + rate / 100
    return cash
  })
  const continuingCash = cash * (1 + terminalGrowthRate / 100)
  if (!(continuingCash > 0) || !Number.isFinite(continuingCash)) return null
  return { base, flows, continuingCash, terminalGrowthRate }
}

export function discountCash (forecast, discountRate) {
  if (!forecast || !Number.isFinite(discountRate) || discountRate <= Math.max(0, forecast.terminalGrowthRate)) return null
  const rate = discountRate / 100
  const explicitValue = forecast.flows.reduce((value, cash, index) => value + cash / (1 + rate) ** (index + 1), 0)
  const terminalValue = forecast.continuingCash / (rate - forecast.terminalGrowthRate / 100) / (1 + rate) ** forecast.flows.length
  const value = explicitValue + terminalValue
  return Number.isFinite(value) ? { value, explicitValue, terminalValue } : null
}
