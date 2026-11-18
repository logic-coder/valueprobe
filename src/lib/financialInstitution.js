// Deposit-takers, insurers and brokers are valued on tangible book, not on an
// earnings annuity. A cash-flow label alone is not evidence. Hong Kong
// non-financials such as Tencent, Meituan and China Mobile are `invest`
// (operating cash flow plus negative investing cash flow), not banks. What counts:
// - mainland files, whose loader sets `ocf` for financials alone;
// - a name that says bank, insurer or broker (Hong Kong files carry nothing else);
// - US filings with book but no operating income and no free cash flow or revenue,
//   which is how JPM, MS and GS report (an industrial omits at most one of these).

const MAINLAND = new Set(['SHSE', 'SZSE'])
const FINANCIAL_NAME = /银行|保险|人寿|证券|汇丰|太保|中国平安|\bbank\b/i

const reported = (rows, field) => rows.some((row) => row?.[field] !== null && row?.[field] !== undefined)

function filesLikeABank (annual) {
  if (!Array.isArray(annual) || !annual.length) return false
  if (!annual.some((row) => Number(row?.book_value_per_share) > 0)) return false
  if (reported(annual, 'operating_income_per_share')) return false
  return !reported(annual, 'free_cash_flow_per_share') || !reported(annual, 'revenue_per_share')
}

/**
 * @param {object|null|undefined} stock stock payload as loaded
 * @param {Array<object>} [annual] annual per-share rows, when the payload no longer carries them
 */
export function isFinancialInstitution (stock, annual = stock?.financials?.annual) {
  if (!stock || typeof stock !== 'object') return false
  if (MAINLAND.has(stock.exchange_) && stock.cashflow_basis === 'ocf') return true
  if (FINANCIAL_NAME.test(String(stock.company || ''))) return true
  return filesLikeABank(annual)
}
