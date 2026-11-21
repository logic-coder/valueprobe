// Stable reason and warning codes for the public policy. A published value is
// either a number plus zero or more warnings, or null plus one or more reasons.
// The UI translates the codes; the data gate rejects unknown ones. Never
// renumber or reuse a code: bump the policy version instead.
export const REASON = Object.freeze({
  NO_SNAPSHOT: 'NO_SNAPSHOT',
  NO_EPS: 'NO_EPS',
  NON_POSITIVE_EPS: 'NON_POSITIVE_EPS',
  NO_GROWTH: 'NO_GROWTH',
  NO_BOOK: 'NO_BOOK',
  NOT_FINITE: 'NOT_FINITE',
})

export const WARNING = Object.freeze({
  CAPPED_GROWTH: 'CAPPED_GROWTH',
  NEGATIVE_HISTORY_GROWTH: 'NEGATIVE_HISTORY_GROWTH',
  GROWTH_ABOVE_RETENTION: 'GROWTH_ABOVE_RETENTION',
  RATE_FALLBACK: 'RATE_FALLBACK',
  DISCOUNT_CLAMPED: 'DISCOUNT_CLAMPED',
  PRICE_MISSING: 'PRICE_MISSING',
  STALE_PRICE: 'STALE_PRICE',
  STALE_DATA: 'STALE_DATA',
  QUOTE_DATE_UNKNOWN: 'QUOTE_DATE_UNKNOWN',
  EARNINGS_DATE_UNKNOWN: 'EARNINGS_DATE_UNKNOWN',
  // Route rests on missing provider columns, and the other model would differ.
  CLASSIFICATION_UNVERIFIED: 'CLASSIFICATION_UNVERIFIED',
  // Owner model on a REIT/refiner: no FFO/AFFO or mid-cycle normalisation.
  MODEL_CAVEAT: 'MODEL_CAVEAT',
  // Historical: value used to stop at the explicit years. Kept for old artifacts.
  TERMINAL_DROPPED: 'TERMINAL_DROPPED',
  // Terminal growth was cut to (at most) two points under the discount rate.
  TERMINAL_CAPPED: 'TERMINAL_CAPPED',
})

/** Canonical order for the artifact, so diffs stay readable. */
export const REASON_ORDER = Object.freeze(Object.values(REASON))
export const WARNING_ORDER = Object.freeze(Object.values(WARNING))
export const REASON_CODES = REASON_ORDER
export const WARNING_CODES = WARNING_ORDER

const REASON_SET = new Set(REASON_ORDER)
const WARNING_SET = new Set(WARNING_ORDER)

export const isKnownReason = (code) => REASON_SET.has(code)
export const isKnownWarning = (code) => WARNING_SET.has(code)

/** Sort codes in canonical order; unknown codes sink to the end (caught by the gate). */
export const orderBy = (list, codes) => [...new Set(list)].sort((a, b) => {
  const left = codes.indexOf(a)
  const right = codes.indexOf(b)
  return (left === -1 ? codes.length : left) - (right === -1 ? codes.length : right)
})
