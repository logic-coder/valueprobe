// Valuation-performance measurement: what a series of dated observations is
// worth saying about a position, and what it cannot say.
//
// Every metric is either a number or `null` *together with a stable reason*, so
// the UI renders "n/a + why" instead of NaN. Bounded arithmetic declines
// out-of-range paths; a decline is a reported reason, never a throw.
//
// Mirrors the reference engine's measurement contract (CALCULATION.md).
import { div, mul } from './arith'

export const ReturnMethod = Object.freeze({
  POSITION: 'position',
  PRICE: 'price',
  NOT_APPLICABLE: 'not_applicable',
})

export const QualityStatus = Object.freeze({ OK: 'ok', PARTIAL: 'partial', NO_DATA: 'no_data', NOT_APPLICABLE: 'not_applicable' })

export const Reason = Object.freeze({
  TWO_POINTS_REQUIRED: 'TWO_POINTS_REQUIRED',
  NON_POSITIVE_START: 'NON_POSITIVE_START',
  UNKNOWN_FLOW: 'UNKNOWN_FLOW',
  NEGATIVE_DENOMINATOR: 'NEGATIVE_DENOMINATOR',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  NO_SIGN_CHANGE: 'NO_SIGN_CHANGE',
  NO_CONVERGENCE: 'NO_CONVERGENCE',
  ANNUALIZATION_TOO_SHORT: 'ANNUALIZATION_TOO_SHORT',
  PRICE_ONLY: 'PRICE_ONLY',
  NO_RETURNS: 'NO_RETURNS',
})

const DAYS_PER_YEAR = 365.25
export const MIN_ANNUALIZATION_DAYS = 30

const days = (from, to) => (new Date(to) - new Date(from)) / 86_400_000

const empty = () => ({
  returns: { valueReturn: null, annualizedValueReturn: null, twr: null, annualizedTwr: null, irr: null, annualizedIrr: null },
  risk: { volatility: null, maxDrawdown: null, peakDate: null, troughDate: null, recoveryDate: null, durationDays: null },
  quality: { status: QualityStatus.NO_DATA, method: ReturnMethod.NOT_APPLICABLE, warnings: [], reasons: [] },
})

const annualize = (from, to, total) => {
  const span = days(from, to)
  if (!(span >= MIN_ANNUALIZATION_DAYS)) return null
  if (total == null || total <= -1) return null
  const factor = Math.pow(1 + total, DAYS_PER_YEAR / span)
  return Number.isFinite(factor) ? factor - 1 : null
}

/** Annualised stdev of log returns, scaled by the sampling frequency. */
function volatility (returns, coveredDays) {
  const logs = returns.filter((step) => step > -1).map((step) => Math.log(1 + step))
  if (logs.length < 2 || !(coveredDays > 0)) return null
  const mean = logs.reduce((total, value) => total + value, 0) / logs.length
  const variance = logs.reduce((total, value) => total + (value - mean) ** 2, 0) / (logs.length - 1)
  const perYear = (logs.length * DAYS_PER_YEAR) / coveredDays
  const scaled = Math.sqrt(variance) * Math.sqrt(perYear)
  return Number.isFinite(scaled) ? scaled : null
}

/** Max drawdown of a cumulative path, with peak, trough and recovery dates. */
function drawdown (returns, dates) {
  let cumulative = 1
  let peak = 1
  let peakDate = dates[0]
  let max = 0
  let maxPeak = peakDate
  let trough = dates[0]
  let recovery = null
  let inDrawdown = false
  for (let i = 0; i < returns.length; i++) {
    const next = mul(cumulative, 1 + returns[i])
    if (next === null) break
    cumulative = next
    // Float dust must not read as "still under water": the reference compares
    // exact decimals, so allow a relative epsilon here.
    if (cumulative - peak >= -1e-12 * Math.max(1, peak)) {
      peak = cumulative
      peakDate = dates[i + 1]
      if (inDrawdown && recovery === null) recovery = dates[i + 1]
    }
    if (peak > 0) {
      const current = div(cumulative - peak, peak)
      if (current !== null && current < max) {
        max = current
        maxPeak = peakDate
        trough = dates[i + 1]
        recovery = null
        inDrawdown = true
      }
    }
  }
  const end = recovery || trough
  return { maxDrawdown: max, peakDate: maxPeak, troughDate: trough, recoveryDate: recovery, durationDays: Math.round(days(maxPeak, end)) }
}

/**
 * XIRR over dated cash flows (negative = money in, positive = money out).
 * Bisection between -99.9999% and a doubling upper bound, as the reference does.
 */
export function xirr (flows) {
  const usable = flows.filter((flow) => Number.isFinite(flow.amount) && flow.amount !== 0)
  if (usable.length < 2) return { irr: null, reason: Reason.TWO_POINTS_REQUIRED }
  if (!usable.some((flow) => flow.amount > 0) || !usable.some((flow) => flow.amount < 0)) {
    return { irr: null, reason: Reason.NO_SIGN_CHANGE }
  }
  const origin = new Date(usable[0].date).getTime()
  const npv = (rate) => {
    if (rate < -0.999999) return null
    let total = 0
    for (const flow of usable) {
      const years = (new Date(flow.date).getTime() - origin) / (86_400_000 * DAYS_PER_YEAR)
      total += flow.amount / Math.pow(1 + rate, years)
    }
    return Number.isFinite(total) ? total : null
  }
  let low = -0.999999
  let high = 10
  let npvLow = npv(low)
  if (npvLow === null) return { irr: null, reason: Reason.OUT_OF_RANGE }
  let npvHigh = npv(high)
  let expansions = 0
  while (npvHigh !== null && Math.sign(npvLow) === Math.sign(npvHigh) && expansions < 16) {
    high *= 2
    npvHigh = npv(high)
    expansions++
  }
  if (npvHigh === null || Math.sign(npvLow) === Math.sign(npvHigh)) return { irr: null, reason: Reason.NO_CONVERGENCE }
  for (let i = 0; i < 128; i++) {
    const mid = (low + high) / 2
    const value = npv(mid)
    if (value === null) return { irr: null, reason: Reason.NO_CONVERGENCE }
    if (Math.abs(value) < 1e-7 || Math.abs(high - low) < 1e-10) return { irr: mid, reason: null }
    if (Math.sign(value) === Math.sign(npvLow)) {
      low = mid
      npvLow = value
    } else {
      high = mid
    }
  }
  return { irr: null, reason: Reason.NO_CONVERGENCE }
}

/**
 * Measure a dated observation series.
 * @param {{date:string|number|Date, value:number}[]} points ordered, one per observation
 * @param {{date:string|number|Date, inflow:number, outflow:number}[]} flows
 * @param {{method?:string, openingDate?:any}} options
 */
export function measure (points, flows = [], options = {}) {
  const result = empty()
  const ordered = [...points].filter((point) => Number.isFinite(Number(point.value))).sort((left, right) => new Date(left.date) - new Date(right.date))
  result.quality.method = options.method || ReturnMethod.POSITION

  if (ordered.length < 2) {
    result.quality.reasons.push(Reason.TWO_POINTS_REQUIRED)
    result.quality.status = QualityStatus.NO_DATA
    return result
  }

  const dates = ordered.map((point) => point.date)
  const values = ordered.map((point) => Number(point.value))
  if (!(values[0] > 0)) {
    result.quality.reasons.push(Reason.NON_POSITIVE_START)
    return result
  }

  const flowByIndex = new Map()
  for (const flow of flows) {
    const index = dates.findIndex((date) => new Date(date).getTime() === new Date(flow.date).getTime())
    if (index > 0) flowByIndex.set(index, { inflow: Number(flow.inflow) || 0, outflow: Number(flow.outflow) || 0 })
  }

  const steps = []
  const stepDates = []
  let factor = 1
  let chained = true
  for (let i = 1; i < values.length; i++) {
    const flow = flowByIndex.get(i) || { inflow: 0, outflow: 0 }
    const denominator = values[i - 1] + flow.inflow
    if (!(denominator > 0)) {
      result.quality.reasons.push(Reason.NEGATIVE_DENOMINATOR)
      chained = false
      break
    }
    const step = div(values[i] + flow.outflow - values[i - 1] - flow.inflow, denominator)
    if (step === null) {
      result.quality.reasons.push(Reason.OUT_OF_RANGE)
      chained = false
      break
    }
    steps.push(step)
    stepDates.push(dates[i])
    const next = mul(factor, 1 + step)
    if (next === null) {
      result.quality.reasons.push(Reason.OUT_OF_RANGE)
      chained = false
      break
    }
    factor = next
  }

  const coveredDays = days(dates[0], dates[dates.length - 1])
  const valueReturn = values[0] > 0 ? values[values.length - 1] / values[0] - 1 : null
  result.returns.valueReturn = Number.isFinite(valueReturn) ? valueReturn : null
  result.returns.annualizedValueReturn = annualize(dates[0], dates[dates.length - 1], result.returns.valueReturn)

  if (chained && steps.length === values.length - 1) {
    result.returns.twr = factor - 1
    result.returns.annualizedTwr = annualize(dates[0], dates[dates.length - 1], result.returns.twr)
    const risk = drawdown(steps, dates)
    result.risk = risk
    result.risk.volatility = volatility(steps, coveredDays)
  } else if (!result.quality.reasons.length) {
    result.quality.reasons.push(Reason.NO_RETURNS)
  }

  // Money-weighted return needs dated external flows, not just prices.
  if (steps.length) {
    const cashFlows = [{ date: dates[0], amount: -(values[0] + (flowByIndex.get(0)?.inflow || 0)) }]
    for (let i = 1; i < values.length; i++) {
      const flow = flowByIndex.get(i) || { inflow: 0, outflow: 0 }
      if (flow.inflow) cashFlows.push({ date: dates[i], amount: -flow.inflow })
      if (flow.outflow) cashFlows.push({ date: dates[i], amount: flow.outflow })
    }
    cashFlows.push({ date: dates[dates.length - 1], amount: values[values.length - 1] })
    const solved = xirr(cashFlows)
    if (solved.irr !== null) {
      result.returns.irr = solved.irr
      result.returns.annualizedIrr = solved.irr
    } else {
      result.quality.reasons.push(solved.reason || Reason.NO_CONVERGENCE)
    }
  }

  if (result.quality.method === ReturnMethod.PRICE) {
    // No position, no money-weighted answer: say so instead of implying one.
    result.returns.irr = null
    result.returns.annualizedIrr = null
    result.quality.warnings.push(Reason.PRICE_ONLY)
  }

  const fatal = result.quality.reasons.filter((reason) => reason !== Reason.ANNUALIZATION_TOO_SHORT)
  // Nothing measured is no_data; something measured but incomplete is partial.
  if (fatal.length) result.quality.status = result.returns.twr === null ? QualityStatus.NO_DATA : QualityStatus.PARTIAL
  else result.quality.status = QualityStatus.OK
  if (result.risk.volatility === null && result.quality.status === QualityStatus.OK) result.quality.status = QualityStatus.PARTIAL
  return result
}

/** Convenience: measure a plain price series (no position, no flows). */
export function measurePriceSeries (points) {
  const measured = measure(points.map((point) => ({ date: point.date, value: Number(point.value ?? point.price) })), [], { method: ReturnMethod.PRICE })
  measured.quality.method = ReturnMethod.PRICE
  return measured
}
