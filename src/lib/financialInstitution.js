// Deposit-takers, insurers and brokers are valued on tangible book, not on an
// earnings annuity. A cash-flow label alone is not evidence: Hong Kong files mark
// Tencent, Meituan and China Mobile `ocf` only because their cash-flow fields were
// wiped. Only mainland files, whose loader sets `ocf` for financials alone, and
// names that say "bank" count.

const MAINLAND = new Set(['SHSE', 'SZSE'])
const BANK_NAME = /银行|\bbank\b/i

/** @param {object|null|undefined} stock stock payload as loaded */
export function isFinancialInstitution (stock) {
  if (!stock || typeof stock !== 'object') return false
  if (MAINLAND.has(stock.exchange_) && stock.cashflow_basis === 'ocf') return true
  return BANK_NAME.test(String(stock.company || ''))
}
