// Display-layer helpers only. The DCF kernel (lib/dcf.js) is a byte-faithful port
// and keeps its raw numbers, including the ±Infinity / NaN the original produces.
// Everything here is about rendering those honestly (see DEVIATIONS.md D1-D5).

export const isNum = (value) => value !== null && value !== '' && Number.isFinite(Number(value))

/** Price/amount out of a display string ("¥9.05" -> 9.05); null when empty. */
export const parseAmount = (value) => {
  const raw = String(value ?? '').replace(/[^0-9.+-]+/g, '')
  return raw === '' ? null : Number(raw)
}

export const money = (currency, value) => (isNum(value) ? (currency || '') + ' ' + Number(value).toFixed(2) : 'n/a')

export const percent = (value) => (isNum(value) ? Number(value).toFixed(2) + '%' : 'n/a')

/** Bare two-decimal percent body, for places that render the "%" separately. */
export const percentBody = (value) => (isNum(value) ? Number(value).toFixed(2) : 'n/a')

export const quantity = (value) => (isNum(value) ? Number(value).toFixed(2) : 'n/a')

/** One-decimal percent, used by the growth-rate table. */
export const percent1 = (value) => (isNum(value) ? Number(value).toFixed(1) + '%' : 'n/a')

export const clamp = (value, min, max) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}
