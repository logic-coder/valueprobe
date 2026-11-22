// Multiple-based cross-check: what a peer multiple would imply for this symbol.
// Uses the per-share inputs already on screen; nothing is written back to the kernel.
/** No-growth cross-check: about 1 / 8%, not a fair value. */
export const LONG_RUN_PE = 12
/** The required return LONG_RUN_PE implies, disclosed so it is not read as
 *  the page's own discount rate (that one is ceil(10y) + 6 and moves). */
export const NO_GROWTH_RATE = Math.round(1000 / LONG_RUN_PE) / 10

export const MULTIPLES = Object.freeze([
  { key: 'pe', labelKey: 'multiple_pe', baseField: 'eps' },
  { key: 'pfcf', labelKey: 'multiple_pfcf', baseField: 'freecashflow' },
  { key: 'pbv', labelKey: 'multiple_pbv', baseField: 'tbv' },
])

/** @returns {number|null} price implied by base * multiple */
export function impliedPrice (base, multiple) {
  const value = Number(base)
  const factor = Number(multiple)
  if (!Number.isFinite(value) || !Number.isFinite(factor) || value <= 0 || factor <= 0) return null
  const price = value * factor
  return Number.isFinite(price) ? Math.round(price * 100) / 100 : null
}

/** Current multiple (price / base), or null when it has no meaning. */
export function currentMultiple (base, price) {
  const value = Number(base)
  const market = Number(price)
  if (!Number.isFinite(value) || !Number.isFinite(market) || value <= 0 || market <= 0) return null
  return Math.round((market / value) * 100) / 100
}
