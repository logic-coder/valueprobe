// Discount-rate build-up: risk-free + beta * equity-risk premium + size premium.
// An alternative to the page default (ceil(risk-free) + 6); the applied rate is
// still the bounded integer the kernel already accepts.
export const ERP_DEFAULT = 5

/** @returns {number|null} rounded integer percent, or null for non-finite input */
export function buildUpRate ({ riskFree, erp = ERP_DEFAULT, beta = 1, sizePremium = 0 }) {
  const parts = [riskFree, erp, beta, sizePremium].map(Number)
  if (parts.some((value) => !Number.isFinite(value))) return null
  const [rf, premium, load, size] = parts
  const rate = rf + load * premium + size
  return Number.isFinite(rate) ? Math.round(rate) : null
}
