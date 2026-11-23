// Deposit-takers, insurers and brokers are valued on tangible book, not on an
// earnings annuity. Evidence decides the route, in this order:
// - a verified industry row (src/config/industry.js) beats everything;
// - mainland files, whose loader sets `ocf` for financials alone;
// - a name that says bank, insurer or broker (Hong Kong files carry nothing else);
// - US filings with book but no operating income and no cash flow or revenue
//   column, for issuers without an industry row. That shape is unverified, so it
//   is recorded as basis "columns" and the value carries a caveat when both
//   models disagree materially.
// Missing columns are reported separately by dataGaps(); they say nothing about
// the business.
import { industryEvidence } from '../config/industry'

const MAINLAND = new Set(['SHSE', 'SZSE'])
const FINANCIAL_NAME = /银行|保险|人寿|证券|汇丰|太保|中国平安|\bbank\b/i
const ANNUAL_COLUMNS = ['operating_income_per_share', 'free_cash_flow_per_share', 'revenue_per_share']

const reported = (rows, field) => rows.some((row) => row?.[field] !== null && row?.[field] !== undefined)

/** Provider columns missing from every annual row, in a stable order. */
export function dataGaps (annual) {
  if (!Array.isArray(annual) || !annual.length) return []
  return ANNUAL_COLUMNS.filter((field) => !reported(annual, field))
}

function filesLikeABank (annual) {
  if (!Array.isArray(annual) || !annual.length) return false
  if (!annual.some((row) => Number(row?.book_value_per_share) > 0)) return false
  if (reported(annual, 'operating_income_per_share')) return false
  return !reported(annual, 'free_cash_flow_per_share') || !reported(annual, 'revenue_per_share')
}

const symbolOf = (stock) => (stock.exchange_ && stock.symbol ? stock.exchange_ + ':' + stock.symbol : null)

/**
 * How the record was routed and on what evidence.
 * @returns {{financial: boolean, basis: 'industry'|'ocf'|'name'|'columns'|'none', industry?: string}}
 */
export function classify (stock, annual = stock?.financials?.annual) {
  if (!stock || typeof stock !== 'object') return { financial: false, basis: 'none' }
  const evidence = industryEvidence(symbolOf(stock))
  if (evidence) {
    const row = { financial: evidence.financial, basis: 'industry', industry: evidence.industry }
    if (evidence.life) row.life = true
    return row
  }
  if (MAINLAND.has(stock.exchange_) && stock.cashflow_basis === 'ocf') return { financial: true, basis: 'ocf' }
  if (FINANCIAL_NAME.test(String(stock.company || ''))) return { financial: true, basis: 'name' }
  if (filesLikeABank(annual)) return { financial: true, basis: 'columns' }
  return { financial: false, basis: 'none' }
}

/**
 * @param {object|null|undefined} stock stock payload as loaded
 * @param {Array<object>} [annual] annual per-share rows, when the payload no longer carries them
 */
export function isFinancialInstitution (stock, annual = stock?.financials?.annual) {
  return classify(stock, annual).financial
}
