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
  INDUSTRY_MODEL_PENDING: 'INDUSTRY_MODEL_PENDING',
  // After the official base is chosen, cash still differs from it by 50%+.
  CASH_UNRECONCILED: 'CASH_UNRECONCILED',
  // Negative or conflicting history, and the latest reported EPS is not positive.
  UNSTABLE_BASE_REGIME: 'UNSTABLE_BASE_REGIME',
})

export const WARNING = Object.freeze({
  CAPPED_GROWTH: 'CAPPED_GROWTH',
  // v2 meaning, kept for frozen artifacts: a negative rate was still extrapolated.
  NEGATIVE_HISTORY_GROWTH: 'NEGATIVE_HISTORY_GROWTH',
  // Official v3: a negative window was floored to 0% and the terminal input was zeroed.
  NEGATIVE_HISTORY_ZEROED: 'NEGATIVE_HISTORY_ZEROED',
  // Official growth used only the five-year window, or assumed a 0% start with no window.
  SHORT_HISTORY: 'SHORT_HISTORY',
  // No 10y or 5y window, but a positive repeatable base: start at 0%, fade to the default terminal.
  NO_WINDOW_ZERO_START: 'NO_WINDOW_ZERO_START',
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
  // After-capex cash cross-check differs from the published value by 25–49%.
  CASH_DIVERGENCE: 'CASH_DIVERGENCE',
  // Terminal growth was cut to (at most) two points under the discount rate.
  TERMINAL_CAPPED: 'TERMINAL_CAPPED',
  // The published base is normalised away from the latest reported EPS.
  NORMALIZED_EPS: 'NORMALIZED_EPS',
  // Life-insurer GAAP tangible book can be distorted by AOCI and deferred acquisition costs.
  LIFE_BOOK_QUALITY: 'LIFE_BOOK_QUALITY',
  // Depreciation is missing, so maintenance capex cannot be listed. The published base is still normalised earnings.
  OWNER_BASE_GAP: 'OWNER_BASE_GAP',
  // Windows disagree or history is negative. The point estimate keeps the default terminal; the range includes a 0% terminal.
  REGIME_UNCERTAIN: 'REGIME_UNCERTAIN',
  // Earnings and cash valuations diverged enough to refuse before; the published
  // number is now their midpoint and the band spans both measurements.
  CASH_MIDPOINT: 'CASH_MIDPOINT',
  // The normalised base lagged a one-way recent rise, so the published base uses
  // the latest full year's earnings/cash midpoint instead of the stale median.
  RECENT_BASE_LAG: 'RECENT_BASE_LAG',
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
