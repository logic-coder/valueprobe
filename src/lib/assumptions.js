// Default growth assumptions for the calculator, the watchlist and compare.
// A missing history is a labeled placeholder. A real history is used as reported,
// including negative rates. Nothing here is written back into the annuity formula.

export const PLACEHOLDER_GROWTH = 5

/**
 * @param {unknown} value historical growth rate in percent
 * @returns {{ historical: number|null, adopted: number, reason: 'historical'|'missing' }}
 */
export function adoptGrowth (value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return { historical: null, adopted: PLACEHOLDER_GROWTH, reason: 'missing' }
  }
  return { historical: parsed, adopted: parsed, reason: 'historical' }
}
