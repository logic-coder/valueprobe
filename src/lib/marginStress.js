import { marginOfSafety, presentValue, residualIncomeValue } from './dcf'

// Fixed public-input sensitivity. The quote is used only after both valuations.
export function marginStress (entry, price) {
  if (entry?.status !== 'ok' || !(price > 0) || !Number.isFinite(Number(price))) return null
  const p = entry.inputs
  if (!p || !['owner', 'residual'].includes(p.model) || !(p.eps > 0)) return null
  const bank = p.model === 'residual'
  const earnings = p.eps * 0.8
  const fairAt = (rate, growth) => bank
    ? residualIncomeValue(p.tangibleBook, earnings, rate, growth, p.terminalGrowthRate, p.years)?.fairValue
    : presentValue(0, p.years, rate, growth, earnings, p.terminalGrowthRate, p.yearsOfTerminalGrowth, false).fairValue
  const tighterGrowth = bank ? p.growth : Math.max(0, Number(p.growth) - 3)
  const values = [entry.value, fairAt(p.discountRate, p.growth),
    fairAt(p.discountRate + 1, tighterGrowth)]
  const rows = values.map(value => ({ value, margin: Number(marginOfSafety(price, value)) }))
  return rows.every(row => Number.isFinite(row.margin)) ? rows : null
}
