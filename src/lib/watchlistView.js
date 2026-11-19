// One line of the watchlist's valuation overview. Display-only: it calls the
// same public-policy function as the stock page and the committed artifact, so
// the three can never disagree about what a value means.
import { policyValue } from './policy'

/**
 * Default-assumption intrinsic value and margin of safety for a quote+payload.
 * @param {object} stock stock payload
 * @param {number|null} indicator local ten-year yield in percent, as the calculator takes it
 * @returns {{fairValue: number|null, mos: number|null}}
 */
export function defaultView (stock, indicator = null) {
  if (!stock) return { fairValue: null, mos: null }
  const value = policyValue(stock, { rate: indicator === undefined ? null : indicator })
  if (value.status !== 'ok') return { fairValue: null, mos: null }
  return { fairValue: value.value, mos: value.marginOfSafety }
}
