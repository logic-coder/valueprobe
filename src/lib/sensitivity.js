// Sensitivity matrix around the current assumptions. Every cell uses the same
// fading path as the headline, so the centre cell is that fair value.
import { presentValue } from './dcf'

export const SENS_STEPS = 2
const DISCOUNT_RANGE = [0, 50]
const GROWTH_RANGE = [-20, 60]

/**
 * Five values around the exact centre, one point apart. Neighbours outside the
 * range are dropped. The centre itself is kept when `keepCenter` is set, so a
 * growth rate the range does not cover still gets a column.
 */
function axis (center, [min, max], keepCenter) {
  const values = []
  for (let offset = -SENS_STEPS; offset <= SENS_STEPS; offset++) {
    const value = offset === 0 ? center : center + offset
    const inside = value >= min && value <= max
    if (inside || (offset === 0 && keepCenter)) values.push(value)
  }
  return values
}

const exact = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * @returns {{discounts:number[], growths:number[], rows:(number|null)[][], center:{discountRate:number, growthRate:number}}}
 */
export function buildSensitivityGrid ({
  discountRate, growthRate, tbv, years, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue,
}) {
  const discountCenter = exact(discountRate)
  const growthCenter = exact(growthRate)
  const discounts = axis(discountCenter, DISCOUNT_RANGE, false)
  const growths = axis(growthCenter, GROWTH_RANGE, true)
  const rows = discounts.map((dr) => growths.map((gr) => {
    const { fairValue } = presentValue(tbv, years, dr, gr, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue)
    return Number.isFinite(fairValue) ? fairValue : null
  }))
  return {
    discounts,
    growths,
    rows,
    center: { discountRate: discountCenter, growthRate: growthCenter },
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
