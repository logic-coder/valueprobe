// Bounded arithmetic for user-supplied magnitudes. JS gives Infinity silently;
// the valuation stack prefers to decline a result and record why, so every
// product/quotient that can overflow goes through here (see CALCULATION.md).

/** Largest magnitude the stack agrees to carry. */
export const MAX_MAGNITUDE = 1e15

/** Smallest positive base a return step may divide by. */
export const MIN_RETURN_BASE = 1e-9

export const bounded = (value) => (Number.isFinite(value) && Math.abs(value) <= MAX_MAGNITUDE ? value : null)

export const mul = (left, right) => {
  const value = left * right
  return Number.isFinite(value) ? bounded(value) : null
}

/** `null` for a zero denominator as well as overflow. */
export const div = (numerator, denominator) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
  return bounded(numerator / denominator)
}

export const sum = (values) => {
  let total = 0
  for (const value of values) {
    total += value
    if (!Number.isFinite(total)) return null
  }
  return bounded(total)
}

export const product = (factors) => {
  let total = 1
  for (const factor of factors) {
    total *= factor
    if (!Number.isFinite(total)) return null
  }
  return bounded(total)
}

/** `amount × part / total`, dividing first when the product would overflow. */
export const proportional = (amount, part, total) => {
  if (part === total) return amount
  const direct = mul(amount, part)
  if (direct !== null) return div(direct, total)
  const ratio = div(amount, total)
  return ratio === null ? null : mul(ratio, part)
}

/** Round to `digits` decimals without float dust, or `null` when unusable. */
export const round = (value, digits = 6) => {
  const usable = bounded(value)
  if (usable === null) return null
  const factor = Math.pow(10, digits)
  return Math.round(usable * factor) / factor
}
