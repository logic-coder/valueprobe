// Sensitivity matrix around the current assumptions. Every cell uses the same
// fading path as the headline, so the centre cell is that fair value.
import { presentValue } from './dcf'

export const SENS_STEPS = 2
const DISCOUNT_RANGE = [0, 50]
const GROWTH_RANGE = [-20, 60]

/** Five centred values, clamped to the accepted input ranges. */
function axis (center, [min, max]) {
  const value = Math.round(Number(center) || 0)
  const low = Math.max(min, value - SENS_STEPS)
  const high = Math.min(max, value + SENS_STEPS)
  const values = []
  for (let current = low; current <= high; current++) values.push(current)
  return values
}

/**
 * @returns {{discounts:number[], growths:number[], rows:(number|null)[][], center:{discountRate:number, growthRate:number}}}
 */
export function buildSensitivityGrid ({
  discountRate, growthRate, tbv, years, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue,
}) {
  const discounts = axis(discountRate, DISCOUNT_RANGE)
  const growths = axis(growthRate, GROWTH_RANGE)
  const rows = discounts.map((dr) => growths.map((gr) => {
    const { fairValue } = presentValue(tbv, years, dr, gr, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue)
    return Number.isFinite(fairValue) ? fairValue : null
  }))
  return {
    discounts,
    growths,
    rows,
    center: { discountRate: Math.round(Number(discountRate) || 0), growthRate: Math.round(Number(growthRate) || 0) },
  }
}

/** Bucket a fair value against the price for cell tinting. */
export function marginBucket (fairValue, price) {
  if (!Number.isFinite(fairValue) || !(fairValue > 0) || !Number.isFinite(price) || !(price > 0)) return 'na'
  const margin = 1 - price / fairValue
  if (margin >= 0.3) return 'good'
  if (margin >= 0) return 'ok'
  if (margin >= -0.2) return 'thin'
  return 'bad'
}
