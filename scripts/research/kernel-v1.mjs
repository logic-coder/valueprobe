// Frozen v1 kernel for historical replays. The live src/lib/policy.js and
// src/lib/dcf.js move with releases; a rerun of a 2006-2015 study must not.
// Copied from the v1 release; do not edit to follow the live engine.
export const V1_POLICY = 'v1'
export const V1_POLICY_HASH = 'a39917f214d2e1e60b91480cd1b9398c4a027d6214dc9847239d9bc1cb6721d9'

const POLICY = {
  discount: { rounding: 'ceil', spread: 6, fallback: 8, min: 0, max: 50 },
  growth: { cap: 15, negative: 'warn' },
  horizon: { years: 10, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10 },
  staleness: { fundamentalsDays: 120 },
  model: { nonFinancial: 'owner', financialInstitution: 'residual' },
}

const round2 = (value) => Math.round(100 * value) / 100
const round4 = (value) => Math.round(10000 * value) / 10000
const num = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.+-]+/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}
const daysBetween = (later, earlier) => (Date.parse(later) - Date.parse(earlier)) / 86400000
const REASON_ORDER = ['NO_SNAPSHOT', 'NO_EPS', 'NON_POSITIVE_EPS', 'NO_GROWTH', 'NO_BOOK', 'NOT_FINITE']
const WARNING_ORDER = ['CAPPED_GROWTH', 'NEGATIVE_HISTORY_GROWTH', 'GROWTH_ABOVE_RETENTION', 'RATE_FALLBACK',
  'DISCOUNT_CLAMPED', 'PRICE_MISSING', 'STALE_PRICE', 'STALE_DATA', 'QUOTE_DATE_UNKNOWN',
  'EARNINGS_DATE_UNKNOWN', 'CLASSIFICATION_UNVERIFIED', 'MODEL_CAVEAT', 'TERMINAL_DROPPED', 'TERMINAL_CAPPED']
const MAINLAND = new Set(['SHSE', 'SZSE'])
const FINANCIAL_NAME = /银行|保险|人寿|证券|汇丰|太保|中国平安|\bbank\b/i
const reported = (rows, field) => rows.some((row) => row?.[field] !== null && row?.[field] !== undefined)
function filesLikeABank (annual) {
  if (!Array.isArray(annual) || !annual.length) return false
  if (!annual.some((row) => Number(row?.book_value_per_share) > 0)) return false
  if (reported(annual, 'operating_income_per_share')) return false
  return !reported(annual, 'free_cash_flow_per_share') || !reported(annual, 'revenue_per_share')
}
/** v1 routing, before the industry evidence table existed. */
export function classifyV1 (stock, annual) {
  if (!stock || typeof stock !== 'object') return false
  if (MAINLAND.has(stock.exchange_) && stock.cashflow_basis === 'ocf') return true
  if (FINANCIAL_NAME.test(String(stock.company || ''))) return true
  return filesLikeABank(annual)
}

function adoptGrowth (value) {
  const parsed = value === null || value === undefined || value === '' ? NaN : Number(value)
  if (!Number.isFinite(parsed)) return { adopted: null, reason: 'missing' }
  if (parsed > POLICY.growth.cap) return { adopted: POLICY.growth.cap, reason: 'capped' }
  return { adopted: parsed, reason: 'historical' }
}

// v1 presentValue: continuation only above the discount rate, otherwise the
// finite annuity stands alone. This is the behavior the old result files used.
export function presentValueV1 (tbv, years, discountRate, growthRate, base, terminalGrowthRate, yearsOfTerminalGrowth, addToFairValue) {
  const r = Number(discountRate) / 100
  const g0 = Number(growthRate) / 100
  const gT = Number(terminalGrowthRate) / 100
  const n = Math.max(0, Math.round(Number(years) || 0))
  const m = Math.max(0, Math.round(Number(yearsOfTerminalGrowth) || 0))
  let flow = Number(base)
  let growthValue = 0
  let terminalValue = 0
  for (let t = 1; t <= n; t++) {
    const weight = n <= 1 ? 0 : (t - 1) / (n - 1)
    flow *= 1 + g0 + (gT - g0) * weight
    growthValue += flow / Math.pow(1 + r, t)
  }
  for (let k = 1; k <= m; k++) {
    flow *= 1 + gT
    terminalValue += flow / Math.pow(1 + r, n + k)
  }
  if (r > gT) {
    const gc = Math.min(gT, r - 0.02)
    terminalValue += (flow * (1 + gc)) / (r - gc) / Math.pow(1 + r, n + m)
  }
  let fairValue = growthValue + terminalValue
  if (addToFairValue) fairValue += Number(tbv) || 0
  return { fairValue: round2(fairValue), growthValue: round2(growthValue), terminalValue: round2(terminalValue) }
}

const clamp01 = (value) => Math.min(1, Math.max(0, value))
/** Frozen v1 residual income; the price decides nothing here. */
export function residualIncomeValueV1 (tbv, eps, discountRate, growthRate, terminalGrowthRate, years = 10) {
  const book0 = Number(tbv)
  const earnings0 = Number(eps)
  const r = Number(discountRate) / 100
  const n = Math.max(1, Math.round(Number(years) || 10))
  if (!(book0 > 0) || !(earnings0 > 0) || !(r >= 0)) return null
  const roe0 = earnings0 / book0
  const gStable = r > 0 ? Math.min(Math.max(Number(terminalGrowthRate) / 100, 0), r - 0.005) : Math.max(Number(terminalGrowthRate) / 100, 0)
  const retainStable = r > 0 ? clamp01(gStable / r) : 1
  const gHist = Number(growthRate) / 100
  const retainNow = roe0 > 0 ? clamp01(gHist / roe0) : retainStable
  let book = book0
  let pv = 0
  for (let t = 1; t <= n; t++) {
    const weight = n <= 1 ? 1 : (t - 1) / (n - 1)
    const roe = roe0 + (r - roe0) * weight
    pv += book * (roe - r) / Math.pow(1 + r, t)
    const retain = retainNow + (retainStable - retainNow) * weight
    book += book * roe * retain
  }
  const fair = book0 + pv
  if (!Number.isFinite(fair) || fair <= 0) return null
  return { fairValue: round2(fair), roe: round2(roe0 * 100), growth: round2(gStable * 100) }
}
export function policyValueV1 (stock, { rate, generatedAt = null } = {}) {
  const reasons = []
  const warnings = []
  const inputs = {
    model: POLICY.model.nonFinancial, eps: null, growth: null, discountRate: null,
    terminalGrowthRate: POLICY.horizon.terminalGrowthRate, years: POLICY.horizon.years,
    yearsOfTerminalGrowth: POLICY.horizon.yearsOfTerminalGrowth, tangibleBook: null, rate: null,
  }
  const asOf = stock?._as_of || stock?.as_of || null
  const price = num(stock?.price)
  let rateRow = { value: POLICY.discount.fallback, asOf: null, source: 'fallback' }
  const resolved = num(rate)
  if (resolved !== null && resolved > 0) rateRow = { value: resolved, asOf: null, source: 'caller' }
  else warnings.push('RATE_FALLBACK')
  let discountRate = rateRow.source === 'fallback'
    ? rateRow.value
    : Math.ceil(rateRow.value) + POLICY.discount.spread
  discountRate = Math.min(POLICY.discount.max, Math.max(POLICY.discount.min, discountRate))
  inputs.discountRate = discountRate
  inputs.rate = { value: rateRow.value, asOf: null, source: rateRow.source }
  const growth = adoptGrowth(stock?.earning_growth_10y)
  inputs.growth = growth.adopted
  if (growth.adopted === null) reasons.push('NO_GROWTH')
  if (growth.reason === 'capped') warnings.push('CAPPED_GROWTH')
  const eps = num(stock?.ttm_eps_nri) ?? num(stock?.ttm_eps)
  inputs.eps = eps
  if (eps === null) reasons.push('NO_EPS')
  else if (eps <= 0) reasons.push('NON_POSITIVE_EPS')
  const tangibleBook = num(stock?.tangible_book)
  inputs.tangibleBook = tangibleBook
  inputs.model = stock?.financial_institution === true ? POLICY.model.financialInstitution : POLICY.model.nonFinancial
  if (inputs.model === POLICY.model.financialInstitution && !(tangibleBook > 0)) reasons.push('NO_BOOK')
  if (generatedAt && stock?.eps_as_of) {
    const age = daysBetween(generatedAt, stock.eps_as_of)
    if (!(age >= 0) || age > POLICY.staleness.fundamentalsDays) warnings.push('STALE_DATA')
  }
  let value = null
  let terminalShare = null
  if (!reasons.length) {
    if (inputs.model === POLICY.model.financialInstitution) {
      const result = residualIncomeValueV1(tangibleBook, eps, discountRate, inputs.growth, POLICY.horizon.terminalGrowthRate, POLICY.horizon.years)
      value = result && Number.isFinite(result.fairValue) && result.fairValue > 0 ? result.fairValue : null
    } else {
      const result = presentValueV1(tangibleBook, POLICY.horizon.years, discountRate, inputs.growth, eps,
        POLICY.horizon.terminalGrowthRate, POLICY.horizon.yearsOfTerminalGrowth, false)
      value = Number.isFinite(result.fairValue) && result.fairValue > 0 ? result.fairValue : null
      const total = result.growthValue + result.terminalValue
      terminalShare = value !== null && total > 0 ? round4(result.terminalValue / total) : null
    }
    if (value === null) reasons.push('NOT_FINITE')
  }
  const margin = value === null || price === null ? null : 1 - price / value
  const order = (list, codes) => [...new Set(list)].sort((x, y) => codes.indexOf(x) - codes.indexOf(y))
  return {
    symbol: stock?.exchange_ && stock?.symbol ? stock.exchange_ + ':' + stock.symbol : null,
    status: value === null ? 'refused' : 'ok', value, band: null, terminalShare, price,
    marginOfSafety: Number.isFinite(margin) ? margin : null, inputs, asOf,
    reasons: order(reasons, REASON_ORDER), warnings: order(warnings, WARNING_ORDER),
  }
}
