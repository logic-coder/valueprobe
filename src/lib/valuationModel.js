// The page picks a model. A snapshot may suggest one; it does not force it.
export const VALUATION_MODELS = ['owner', 'residual']

/** @param {object|null|undefined} stock */
export function suggestedModel (stock) {
  return stock?.financial_institution === true ? 'residual' : 'owner'
}

/**
 * Firm free cash flow is a claim on the whole business. Discounting it at an
 * equity rate, without the net debt we do not have, is not an equity value.
 * Equity free cash flow (operating cash flow minus capital spending) may be used.
 */
export function firmFreeCashFlow (stock) {
  return stock?.cashflow_basis === 'fcff'
}
