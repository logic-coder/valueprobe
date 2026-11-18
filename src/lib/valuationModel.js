// The page picks a model. A snapshot may suggest one; it does not force it.
export const VALUATION_MODELS = ['owner', 'residual']

/** @param {object|null|undefined} stock */
export function suggestedModel (stock) {
  return stock?.financial_institution === true ? 'residual' : 'owner'
}
