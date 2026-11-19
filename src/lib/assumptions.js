// Default growth assumptions for the calculator, the watchlist and compare.
// A missing or refused history stays empty. A real history is used as reported,
// including negative rates, but the explicit window never underwrites more than
// MAX_UNDERWRITTEN_GROWTH. Nothing here is written back into the annuity formula.

export const MAX_UNDERWRITTEN_GROWTH = 15

// A year-to-year drop below this share of the prior positive value is a split
// candidate (a split cuts per-share figures to 1/2, 1/4, 1/5, 1/10 or 1/20).
const LEVEL_SHIFT_RATIO = 0.4
// A restated same-year series (revenue per share) that fell by more than a
// quarter says the business shrank; the earnings cliff is then not a unit break.
const COMPANION_FLOOR = 0.75
export const MIN_CLEAN_YEARS = 4
const MAX_GROWTH_YEARS = 10

/**
 * @param {unknown} value historical growth rate in percent
 * @returns {{ historical: number|null, adopted: number|null, reason: 'historical'|'capped'|'missing' }}
 */
export function adoptGrowth (value) {
  const parsed = value === null || value === undefined || value === '' ? NaN : Number(value)
  if (!Number.isFinite(parsed)) {
    return { historical: null, adopted: null, reason: 'missing' }
  }
  if (parsed > MAX_UNDERWRITTEN_GROWTH) {
    return { historical: parsed, adopted: MAX_UNDERWRITTEN_GROWTH, reason: 'capped' }
  }
  return { historical: parsed, adopted: parsed, reason: 'historical' }
}

/**
 * Compound growth of an annual per-share series (one slot per consecutive year,
 * null for a missing year) over the longest recent suffix without a level shift.
 * Old years are never rescaled: a contaminated window is refused, not repaired.
 * A level shift starts as a positive year followed by a positive year under 40%
 * of it. The new base may compound back through the old 40% line; what decides is:
 * - with a same-year companion (revenue per share, restated across splits) on
 *   both sides of the drop: the companion did not fall by more than a quarter,
 *   and earnings per unit of companion fell under 40% and never climbed back
 *   over that line. A margin squeeze reverts; a unit change does not.
 * - without one: the year after the drop is still positive and under the line
 *   (not a one-year dip, not a second crash).
 * A fall into losses, or a drop in the latest year alone, is not called a shift.
 * @param {Array<number|null|undefined>} values oldest first
 * @param {Array<number|null|undefined>} [companion] same slots as `values`
 * @returns {{ rate: number|null, start: number, end: number, years: number, shifted: boolean }|null}
 *   start/end are indexes into `values`. rate is null when the clean window is
 *   under four fiscal years or does not start and end positive.
 */
export function cleanGrowth (values, companion = []) {
  if (!Array.isArray(values)) return null
  const finite = (value) => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const points = []
  values.forEach((value, index) => {
    const parsed = finite(value)
    if (parsed !== null) points.push({ index, value: parsed, companion: finite(companion?.[index]) })
  })
  if (!points.length) return null
  const lastIndex = points.at(-1).index
  const recent = points.filter((point) => point.index >= lastIndex - MAX_GROWTH_YEARS)
  const unitBreak = (i) => {
    const before = recent[i - 1]
    const after = recent.slice(i)
    if (!(before.value > 0) || !(after[0].value > 0)) return false
    if (after[0].value >= before.value * LEVEL_SHIFT_RATIO) return false
    if (before.companion > 0 && after[0].companion > 0) {
      if (after[0].companion < before.companion * COMPANION_FLOOR) return false
      const line = (before.value / before.companion) * LEVEL_SHIFT_RATIO
      return after.every((point) => !(point.companion > 0) || point.value / point.companion < line)
    }
    return after[1].value > 0 && after[1].value < before.value * LEVEL_SHIFT_RATIO
  }
  let from = 0
  for (let i = 1; i < recent.length - 1; i++) {
    if (unitBreak(i)) from = i
  }
  const window = recent.slice(from)
  const first = window.find((point) => point.value > 0) || window[0]
  const last = window.at(-1)
  const years = last.index - first.index
  const result = { rate: null, start: first.index, end: last.index, years, shifted: from > 0 }
  if (!(first.value > 0) || !(last.value > 0) || years + 1 < MIN_CLEAN_YEARS) return result
  const rate = (Math.pow(last.value / first.value, 1 / years) - 1) * 100
  if (Number.isFinite(rate)) result.rate = Number(rate.toFixed(2))
  return result
}
