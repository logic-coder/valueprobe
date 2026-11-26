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
// Named widening reference: a same-sign gap of this size still puts the other
// window in the value range, but no longer marks REGIME_UNCERTAIN. Opposite
// signs, or a negative window, are what mark a regime.
export const REGIME_GAP_PP = 8
// Optimistic and pessimistic growth move this many points around the already
// constrained official start, then the same hard envelope clips them again.
export const BAND_GROWTH_SPREAD = 2

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

/** True when the ten-year and five-year windows have opposite signs. */
export function windowsConflict (ten, five) {
  if (ten == null || five == null || !Number.isFinite(ten) || !Number.isFinite(five)) return false
  return (ten < 0 && five > 0) || (ten > 0 && five < 0)
}

/**
 * Sustainable starting growth g* in percent: max(0, RR × ROE).
 * ROE uses the official earnings base over latest tangible book, the same
 * ratio the former warning compared against. A missing payout is not invented:
 * RR is treated as 1 (all earnings potentially reinvestable), which is the
 * loosest cap the book can support. A payout at or above earnings binds g* to 0.
 * Financial / residual-income names skip this cap. Missing, non-positive or
 * near-zero book leaves g* unavailable so the 15% underwriting cap remains.
 */
export function retentionCap ({ financial = false, base, tangibleBook, payoutRatio } = {}) {
  if (financial === true) return null
  const book = parseRate(tangibleBook)
  const earnings = parseRate(base)
  if (!(book > 0) || book < 1e-6 || !(earnings > 0)) return null
  const payout = parseRate(payoutRatio)
  const retained = payout == null ? 1 : Math.max(0, 1 - payout)
  const rate = retained * (earnings / book) * 100
  if (!Number.isFinite(rate)) return null
  return Number(Math.max(0, rate).toFixed(4))
}

/**
 * Growth envelope around an already-constrained official start.
 * High and low move BAND_GROWTH_SPREAD points, then clip to [0, min(15%, g*)].
 * When the official start is already at that upper bound, the high stays there
 * and width comes from the discount-rate spread.
 */
export function envelopeGrowth (official, { cap = MAX_UNDERWRITTEN_GROWTH, sustainableGrowth = null, spread = BAND_GROWTH_SPREAD } = {}) {
  const mid = parseRate(official)
  const rawCap = parseRate(cap)
  const upperCap = rawCap == null ? MAX_UNDERWRITTEN_GROWTH : rawCap
  const gStar = parseRate(sustainableGrowth)
  const upper = gStar == null ? upperCap : Math.min(upperCap, Math.max(0, gStar))
  if (mid == null) return { low: null, mid: null, high: null, cap: upper }
  const atUpper = mid + 1e-12 >= upper
  if (mid === 0 || atUpper) {
    return { low: mid === 0 ? 0 : Math.max(0, mid - spread), mid, high: mid, cap: upper }
  }
  return {
    low: Math.max(0, mid - spread),
    mid,
    high: Math.min(mid + spread, upper),
    cap: upper,
  }
}

/**
 * Official starting growth. Shared by policyValue() and buildDefaults(), so the
 * calculator seed equals the published value. When both clean windows exist,
 * each is floored at 0% and capped at 15%, and the slower of the two is the
 * official start; that start is then also capped at sustainable growth g*
 * when g* can be observed. A single window (including a five-year-only
 * SHORT_HISTORY case) is used as official, still under the 15% and g* caps.
 * A five-year-only history keeps the 15% cap and carries SHORT_HISTORY; the
 * value range no longer widens toward 15% just because the official window is
 * the five-year one. Negative history floors the starting rate to 0% and keeps
 * the default terminal, and marks REGIME_UNCERTAIN. Opposite-sign windows also
 * mark REGIME_UNCERTAIN. A positive repeatable base with no window starts at
 * 0% (terminal stays the policy default). Optimistic and pessimistic growth
 * used in the published range move two points around this already-constrained
 * start and are clipped by the same envelope; they do not put a faster window
 * or the 15% cap back in when the official start is already below that bound.
 * zeroTerminal remains on the return object for compatibility and is always
 * false under this policy. Financial names skip the g* cap.
 *
 * @param {{ growth10?: unknown, growth5?: unknown, hasPositiveBase?: boolean, sustainableGrowth?: unknown, financial?: boolean }} input
 * @returns {{
 *   historical10: number|null,
 *   historical5: number|null,
 *   adopted: number|null,
 *   window: '10y'|'5y'|'none'|null,
 *   cap: number|null,
 *   reason: 'historical'|'capped'|'zeroed'|'retention'|'no-window'|'missing',
 *   highGrowth: number|null,
 *   lowGrowth: number|null,
 *   sustainableGrowth: number|null,
 *   retentionBound: boolean,
 *   zeroTerminal: boolean,
 *   regimeUncertain: boolean,
 *   windowConflict: boolean,
 *   warnings: string[],
 * }}
 */
export function officialGrowth ({ growth10, growth5, hasPositiveBase = false, sustainableGrowth, financial = false } = {}) {
  const ten = parseRate(growth10)
  const five = parseRate(growth5)
  const warnings = []
  const conflict = windowsConflict(ten, five)
  const negativeWindow = (ten != null && ten < 0) || (five != null && five < 0)
  const tenC = ten != null ? clipWindow(ten, MAX_UNDERWRITTEN_GROWTH) : null
  const fiveC = five != null ? clipWindow(five, MAX_UNDERWRITTEN_GROWTH) : null
  const gStar = financial === true ? null : parseRate(sustainableGrowth)
  const base = {
    historical10: ten,
    historical5: five,
    adopted: null,
    window: null,
    cap: null,
    reason: 'missing',
    highGrowth: null,
    lowGrowth: null,
    sustainableGrowth: gStar,
    retentionBound: false,
    zeroTerminal: false,
    regimeUncertain: false,
    windowConflict: conflict,
    warnings,
  }
  const applyEnvelope = (row) => {
    if (row.adopted == null) return { ...base, ...row, warnings }
    let adopted = row.adopted
    let reason = row.reason
    let retentionBound = false
    if (gStar != null && adopted > gStar) {
      adopted = Math.max(0, gStar)
      reason = 'retention'
      retentionBound = true
      warnings.push(WARNING.GROWTH_ABOVE_RETENTION)
    }
    const envelope = envelopeGrowth(adopted, { cap: MAX_UNDERWRITTEN_GROWTH, sustainableGrowth: gStar })
    // CAPPED_GROWTH refers to the published start, not the pre-retention window.
    if (adopted + 1e-12 >= MAX_UNDERWRITTEN_GROWTH) warnings.push(WARNING.CAPPED_GROWTH)
    return {
      ...base,
      ...row,
      adopted,
      reason,
      retentionBound,
      highGrowth: envelope.high,
      lowGrowth: envelope.low,
      cap: row.cap === undefined ? MAX_UNDERWRITTEN_GROWTH : row.cap,
      warnings,
    }
  }

  const markRegime = (uncertain) => {
    if (uncertain) warnings.push(WARNING.REGIME_UNCERTAIN)
    return uncertain
  }

  if (tenC && fiveC) {
    const slowerIsFive = fiveC.adopted < tenC.adopted
    const chosen = slowerIsFive ? fiveC : tenC
    const regime = markRegime(negativeWindow || conflict)
    return applyEnvelope({
      adopted: chosen.adopted,
      window: slowerIsFive ? '5y' : '10y',
      cap: MAX_UNDERWRITTEN_GROWTH,
      reason: chosen.negative ? 'zeroed' : chosen.hitCap ? 'capped' : 'historical',
      regimeUncertain: regime,
    })
  }

  if (tenC) {
    const regime = markRegime(negativeWindow || conflict)
    if (tenC.negative) {
      return applyEnvelope({
        adopted: 0,
        window: '10y',
        cap: MAX_UNDERWRITTEN_GROWTH,
        reason: 'zeroed',
        regimeUncertain: regime,
      })
    }
    return applyEnvelope({
      adopted: tenC.adopted,
      window: '10y',
      cap: MAX_UNDERWRITTEN_GROWTH,
      reason: tenC.hitCap ? 'capped' : 'historical',
      regimeUncertain: regime,
    })
  }

  if (fiveC) {
    warnings.push(WARNING.SHORT_HISTORY)
    if (fiveC.negative) {
      markRegime(true)
      return applyEnvelope({
        adopted: 0,
        window: '5y',
        cap: MAX_UNDERWRITTEN_GROWTH,
        reason: 'zeroed',
        regimeUncertain: true,
      })
    }
    return applyEnvelope({
      adopted: fiveC.adopted,
      window: '5y',
      cap: MAX_UNDERWRITTEN_GROWTH,
      reason: fiveC.hitCap ? 'capped' : 'historical',
    })
  }

  if (hasPositiveBase) {
    warnings.push(WARNING.SHORT_HISTORY, WARNING.NO_WINDOW_ZERO_START)
    return applyEnvelope({ adopted: 0, window: 'none', cap: null, reason: 'no-window' })
  }
  return applyEnvelope({ reason: 'missing' })
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
