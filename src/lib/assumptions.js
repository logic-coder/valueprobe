// Default growth assumptions for the calculator, the watchlist and compare.
// Official starting growth is officialGrowth(), shared with the published value.
// adoptGrowth() remains the single-window cap used for cash-flow trial inputs
// and for displaying a raw window; it still keeps a negative rate as reported.
// Nothing here is written back into the annuity formula.
import { WARNING } from './reasons'

export const MAX_UNDERWRITTEN_GROWTH = 15
// Kept for frozen artifacts and historical tests. Official short history no
// longer applies this tighter cap; it widens the value range instead.
export const SHORT_HISTORY_GROWTH_CAP = 10
// Ten-year and five-year windows conflict when they have opposite signs, or
// when they differ by at least this many percentage points.
export const REGIME_GAP_PP = 8

// A year-to-year drop below this share of the prior positive value is a split
// candidate (a split cuts per-share figures to 1/2, 1/4, 1/5, 1/10 or 1/20).
const LEVEL_SHIFT_RATIO = 0.4
// A restated same-year series (revenue per share) that fell by more than a
// quarter says the business shrank; the earnings cliff is then not a unit break.
const COMPANION_FLOOR = 0.75
export const MIN_CLEAN_YEARS = 4
const MAX_GROWTH_YEARS = 10
// A 10-year label needs at least seven years of span; a 5-year label at least four.
export const WINDOW_SPAN = Object.freeze({ 10: 7, 5: 4, 1: 1 })

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

const parseRate = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const clipWindow = (raw, cap) => {
  const capped = Math.min(raw, cap)
  return { raw, adopted: Math.max(capped, 0), hitCap: raw > cap, negative: raw < 0 }
}

/** True when the ten-year and five-year windows disagree enough to mark a regime. */
export function windowsConflict (ten, five, gapPp = REGIME_GAP_PP) {
  if (ten == null || five == null || !Number.isFinite(ten) || !Number.isFinite(five)) return false
  if ((ten < 0 && five > 0) || (ten > 0 && five < 0)) return true
  return Math.abs(ten - five) >= gapPp
}

/**
 * Official starting growth. Shared by policyValue() and buildDefaults(), so the
 * calculator seed equals the published value. A single clean long window is the
 * centered prior: the ten-year window when it exists, otherwise the five-year
 * window, always capped at 15%. The five-year rate is a comparison only and is
 * never min'd with the ten-year rate. A five-year-only history keeps the same
 * 15% cap, carries SHORT_HISTORY, and widens the value range rather than
 * applying a tighter 10% cap. Negative history floors the starting rate to 0%
 * and keeps the default terminal; a conflict between windows also marks
 * REGIME_UNCERTAIN. A positive repeatable base with no window starts at 0%
 * (terminal stays the policy default). zeroTerminal remains on the return
 * object for compatibility and is always false under this policy.
 *
 * @param {{ growth10?: unknown, growth5?: unknown, hasPositiveBase?: boolean }} input
 * @returns {{
 *   historical10: number|null,
 *   historical5: number|null,
 *   adopted: number|null,
 *   window: '10y'|'5y'|'none'|null,
 *   cap: number|null,
 *   reason: 'historical'|'capped'|'zeroed'|'no-window'|'missing',
 *   zeroTerminal: boolean,
 *   regimeUncertain: boolean,
 *   windowConflict: boolean,
 *   warnings: string[],
 * }}
 */
export function officialGrowth ({ growth10, growth5, hasPositiveBase = false } = {}) {
  const ten = parseRate(growth10)
  const five = parseRate(growth5)
  const warnings = []
  const conflict = windowsConflict(ten, five)
  const base = {
    historical10: ten,
    historical5: five,
    adopted: null,
    window: null,
    cap: null,
    reason: 'missing',
    zeroTerminal: false,
    regimeUncertain: false,
    windowConflict: conflict,
    warnings,
  }
  const finish = (row) => ({ ...base, ...row, warnings })
  const markRegime = (uncertain) => {
    if (uncertain) warnings.push(WARNING.REGIME_UNCERTAIN)
    return uncertain
  }

  if (ten != null) {
    const adoptedTen = clipWindow(ten, MAX_UNDERWRITTEN_GROWTH)
    const regime = markRegime(adoptedTen.negative || conflict)
    if (adoptedTen.negative) {
      return finish({
        adopted: 0,
        window: '10y',
        cap: MAX_UNDERWRITTEN_GROWTH,
        reason: 'zeroed',
        regimeUncertain: regime,
      })
    }
    if (adoptedTen.hitCap) warnings.push(WARNING.CAPPED_GROWTH)
    return finish({
      adopted: adoptedTen.adopted,
      window: '10y',
      cap: MAX_UNDERWRITTEN_GROWTH,
      reason: adoptedTen.hitCap ? 'capped' : 'historical',
      regimeUncertain: regime,
    })
  }

  if (five != null) {
    const adoptedFive = clipWindow(five, MAX_UNDERWRITTEN_GROWTH)
    warnings.push(WARNING.SHORT_HISTORY)
    if (adoptedFive.negative) {
      markRegime(true)
      return finish({
        adopted: 0,
        window: '5y',
        cap: MAX_UNDERWRITTEN_GROWTH,
        reason: 'zeroed',
        regimeUncertain: true,
      })
    }
    if (adoptedFive.hitCap) warnings.push(WARNING.CAPPED_GROWTH)
    return finish({
      adopted: adoptedFive.adopted,
      window: '5y',
      cap: MAX_UNDERWRITTEN_GROWTH,
      reason: adoptedFive.hitCap ? 'capped' : 'historical',
    })
  }

  if (hasPositiveBase) {
    warnings.push(WARNING.SHORT_HISTORY, WARNING.NO_WINDOW_ZERO_START)
    return finish({ adopted: 0, window: 'none', cap: null, reason: 'no-window' })
  }
  return finish({ reason: 'missing' })
}

/**
 * Compound annual growth in percent over a 10-, 5- or 1-year window.
 * Shared by A/H statements, US filings and official-value construction.
 * No invented default; a loss at the end of the window means no growth.
 * A 10-year label needs at least seven years of span, a 5-year label at
 * least four. A 1-year rate needs the immediately preceding fiscal year
 * (a hole is not stretched into a two-year CAGR). A trough at the first
 * year is not used as the base; the start walks forward while the minimum
 * span still holds, instead of dropping the whole window.
 * @param {Array<{fy:number, val:number}|null|undefined>} series oldest first
 * @param {number} yearsWanted
 * @returns {number|null}
 */
export function windowGrowth (series, yearsWanted) {
  const clean = (series || []).filter((point) => point && Number.isFinite(point.fy) && Number.isFinite(point.val))
  if (clean.length < 2) return null
  const last = clean[clean.length - 1]
  if (!(last.val > 0)) return null
  const minimum = WINDOW_SPAN[yearsWanted] ?? Math.ceil(yearsWanted * 0.7)
  const positives = clean.map((point) => point.val).filter((value) => value > 0).sort((left, right) => left - right)
  const typical = positives[Math.floor(positives.length / 2)]
  const isTrough = (point) => yearsWanted > 1 && positives.length >= 3 && point.val < typical * 0.2
  let start
  if (yearsWanted === 1) {
    start = clean.find((point) => point.fy === last.fy - 1) || null
  } else {
    const target = last.fy - yearsWanted
    // Last year at or before the target, or the earliest year if history is shorter.
    start = clean.reduce((chosen, point) => (point.fy <= target ? point : chosen), null) || clean[0]
    if (!start || !(start.val > 0) || isTrough(start)) {
      // Walk forward only. Earlier years must not back-fill a loss or trough.
      const afterFy = start ? start.fy : target
      start = clean.find((point) => point.fy > afterFy && point.val > 0 && last.fy - point.fy >= minimum && !isTrough(point)) || null
    }
  }
  if (!start || !(start.val > 0) || last.fy - start.fy < minimum) return null
  const pct = (Math.pow(last.val / start.val, 1 / (last.fy - start.fy)) - 1) * 100
  if (!Number.isFinite(pct)) return null
  return Number(Math.max(-100, Math.min(200, pct)).toFixed(2))
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
    // A single peak year followed by a return to the pre-peak level is an
    // outlier, not a split. A split cuts every per-share figure and does not
    // recover to the pre-peak EPS (or restated revenue-per-share companion).
    const prePeak = recent[i - 2]
    if (prePeak?.value > 0 && after[0].value >= prePeak.value * COMPANION_FLOOR) return false
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
