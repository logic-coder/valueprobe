// Eastmoney main-indicator rows to the per-share fields the calculator already reads.
// A-share figures come from the HSF10 indicator table. Hong Kong figures come from
// the HK main-indicator table. Both are year-to-date on interim rows, so trailing
// twelve months are rebuilt from an annual report plus the matching stub.

const num = (value) => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const round4 = (value) => (value == null ? null : Math.round(value * 10000) / 10000)

export function reportKind (label) {
  const text = String(label || '')
  if (text.includes('年报')) return 'FY'
  if (text.includes('三季')) return 'Q3'
  if (text.includes('中报')) return 'H1'
  if (text.includes('一季')) return 'Q1'
  return null
}

export function reportYear (row) {
  const text = String(row?.REPORT_DATE || '')
  const year = Number(text.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

/** Newest first, as the feed returns them. */
function newest (rows) {
  return [...rows].sort((left, right) => String(right.REPORT_DATE).localeCompare(String(left.REPORT_DATE)))
}

/**
 * Trailing twelve months from year-to-date rows.
 * Annual rows are already twelve months. An interim is YTD + last year − last year's stub.
 */
export function trailingTwelve (rows, read) {
  return trailingPeriod(rows, read)?.value ?? null
}

function trailingPeriod (rows, read, allowOlderAnnual = false) {
  const ordered = newest(rows)
  const latest = ordered[0]
  if (!latest) return null
  const current = read(latest)
  const year = reportYear(latest)
  const kind = reportKind(latest.REPORT_TYPE)
  if (kind !== 'FY' && year && kind && current != null) {
    const annual = ordered.find((row) => reportKind(row.REPORT_TYPE) === 'FY' && reportYear(row) === year - 1)
    const stub = ordered.find((row) => reportKind(row.REPORT_TYPE) === kind && reportYear(row) === year - 1)
    const prior = read(annual)
    const same = read(stub)
    if (prior != null && same != null) return { value: current + prior - same, row: latest, kind: 'TTM' }
  }
  const annual = ordered.find((row) => reportKind(row.REPORT_TYPE) === 'FY' && (!allowOlderAnnual || read(row) != null))
  const value = read(annual)
  return value == null ? null : { value, row: annual, kind: 'FY' }
}

/** Compound annual growth in percent. Null when the span or the sign cannot support it. */
export function cagr (older, newer) {
  if (!older || !newer) return null
  const years = newer.fy - older.fy
  if (!(years >= 1) || !(older.val > 0) || !(newer.val > 0)) return null
  const rate = (Math.pow(newer.val / older.val, 1 / years) - 1) * 100
  return Number.isFinite(rate) ? Math.round(rate * 100) / 100 : null
}

import { windowGrowth } from '../../lib/assumptions'
export { windowGrowth }

function series (rows, read) {
  return newest(rows).reverse().map((row) => ({ fy: reportYear(row), val: read(row) })).filter((point) => point.fy && point.val != null)
}

function growthSet (prefix, points) {
  return {
    [prefix + '_10y']: windowGrowth(points, 10),
    [prefix + '_5y']: windowGrowth(points, 5),
    [prefix + '_1y']: windowGrowth(points, 1),
  }
}

/** Profit over EPS. A loss over a negative EPS is still a positive share count. */
function shares (profit, eps) {
  const earnings = num(profit)
  const each = num(eps)
  if (earnings == null || !each) return null
  const count = earnings / each
  return Number.isFinite(count) && count > 0 ? count : null
}

// Cash-flow supplement lines from East Money statement tables (现金流量表补充资料).
// The main-indicator feed does not carry these; they stay null unless a supplement
// is passed in. Missing components are omitted, never invented.
//
// Field labels are taken from the official F10 NewFinanceAnalysis page templates
// (emweb PC_HSF10), verified against live xjllbAjaxNew / RPT_F10_FINANCE_GCASHFLOW
// rows. Prefer a disclosed total; only sum components when the total is missing.
// Never add a total and its parts together.
//
// ASSET_IMPAIRMENT is 资产减值准备 (the historical ZCJZZJ code names the same
// line). It is not depreciation and is never included. Other impairment lines
// (credit, loan, investment) are also excluded. DEFER_INCOME_AMORTIZE is
// 递延收益摊销, not asset depreciation.
function preferTotal (row, totals, parts) {
  for (const key of totals) {
    const value = num(row?.[key])
    if (value != null) return value
  }
  let total = 0
  let found = false
  for (const key of parts) {
    const value = num(row?.[key])
    if (value == null) continue
    total += value
    found = true
  }
  return found ? total : null
}

/** Depreciation and amortization from a cash-flow supplement row, or null. */
export function depreciationFromSupplement (row) {
  if (!row) return null
  // Hong Kong long-table rows are pivoted onto this combined official line.
  const combined = num(row.DEPRE_AND_AMORT)
  if (combined != null) return combined
  const depreciation = preferTotal(row, ['FA_IR_DEPR'], ['OILGAS_BIOLOGY_DEPR', 'IR_DEPR', 'FIXED_ASSET_DEPR'])
  const amortization = preferTotal(row, ['IA_LPE_AMORTIZE'], ['IA_AMORTIZE', 'LPE_AMORTIZE', 'LONGASSET_AMORTIZE'])
  const rightOfUse = num(row.USERIGHT_ASSET_AMORTIZE)
  const parts = [depreciation, amortization, rightOfUse].filter((value) => value != null)
  return parts.length ? parts.reduce((sum, value) => sum + value, 0) : null
}

/** Share-based compensation from a supplement row. The A-share F10 template has no such line. */
export function shareBasedCompFromSupplement (row) {
  if (!row) return null
  for (const key of ['SHARE_BASED_PAYMENT', 'SHAREBASED_COMP']) {
    const value = num(row[key])
    if (value != null) return value
  }
  return null
}

const HK_DA_ITEM = /折旧及摊销|折旧摊销/
const HK_SBC_ITEM = /股份支付|以股份为基础|以权益结算/
const HK_DA_CODE = '001009'

/**
 * Pivot annual Hong Kong cash-flow items (RPT_HKF10_FN_CASHFLOW_PC) into one
 * supplement row per fiscal year. Only DATE_TYPE_CODE 001 (年报) is kept.
 * Depreciation uses the official combined "加:折旧及摊销" line (code 001009
 * on sampled issuers); impairment ("加:减值及拨备") is not included.
 */
export function supplementsFromHkCashflowItems (rows) {
  const byYear = new Map()
  for (const row of rows || []) {
    if (String(row.DATE_TYPE_CODE ?? '') !== '001') continue
    const year = reportYear(row)
    if (!year) continue
    const extra = byYear.get(year) || { REPORT_DATE: row.REPORT_DATE, REPORT_TYPE: '年报' }
    const name = String(row.STD_ITEM_NAME || '')
    const amount = num(row.AMOUNT)
    const code = String(row.STD_ITEM_CODE || '')
    if (amount != null && HK_DA_ITEM.test(name) && !name.includes('减值')) {
      if (code === HK_DA_CODE || extra.DEPRE_AND_AMORT == null) extra.DEPRE_AND_AMORT = amount
    }
    if (amount != null && HK_SBC_ITEM.test(name) && !/发行股份|回购股份/.test(name)) {
      extra.SHARE_BASED_PAYMENT = extra.SHARE_BASED_PAYMENT == null ? amount : extra.SHARE_BASED_PAYMENT + amount
    }
    byYear.set(year, extra)
  }
  return [...byYear.values()]
}

function supplementByYear (rows) {
  const byYear = new Map()
  for (const row of rows || []) {
    const year = reportYear(row)
    if (year) byYear.set(year, row)
  }
  return byYear
}

function perShare (total, shareCount) {
  if (total == null || !(shareCount > 0)) return null
  return round4(total / shareCount)
}

function dateLabel (row) {
  return String(row.REPORT_DATE || '').slice(0, 7)
}

function annualRows (rows) {
  return newest(rows).filter((row) => reportKind(row.REPORT_TYPE) === 'FY').reverse()
}

/**
 * @param {object[]} recent mixed reports, newest anywhere in the list
 * @param {object[]} annualReports annual indicator rows
 */
export function fromAshareReports (recent, annualReports, supplements = []) {
  const annual = annualRows(annualReports)
  const mixed = newest([...(recent || []), ...(annualReports || [])])
  const supplement = supplementByYear(supplements)
  const epsOf = (row) => num(row?.EPSKCJB ?? row?.EPSXS ?? row?.EPSJB)
  const dilutedOf = (row) => num(row?.EPSXS ?? row?.EPSJB)
  // Banks often publish a firm free-cash-flow figure that rounds to nothing
  // per share. Such a row has no usable firm figure.
  const firmOf = (row) => {
    if (!row) return null
    const count = shares(row.PARENTNETPROFIT, row.EPSJB || row.EPSXS)
    const firm = num(row.FCFF_BACK)
    return count && firm != null && Math.abs(firm / count) >= 0.01 ? firm / count : null
  }
  const usedFirm = annual.some((row) => firmOf(row) != null)
  // Once any year is on firm free cash flow, operating cash flow in another
  // year would mix two bases in one series.
  const fcfOf = (row) => {
    if (!row) return null
    if (usedFirm) return firmOf(row)
    return num(row.MGJYXJJE)
  }
  const earnings = trailingPeriod(mixed, epsOf, true)
  const ttmDiluted = trailingTwelve(mixed, dilutedOf)
  const ttmFcf = trailingTwelve(mixed, fcfOf) ?? fcfOf(annual.at(-1))
  const latestBook = num(mixed[0]?.BPS)
  const table = annual.map((row) => {
    const count = shares(row.PARENTNETPROFIT, row.EPSJB || row.EPSXS)
    const extra = supplement.get(reportYear(row))
    return {
      date: dateLabel(row),
      eps_without_nri: round4(epsOf(row)),
      revenue_per_share: round4(num(row.PER_TOI)),
      operating_income_per_share: round4(num(row.PER_EBIT)),
      ebitda_per_share: null,
      free_cash_flow_per_share: round4(fcfOf(row)),
      depreciation_amortization_per_share: perShare(depreciationFromSupplement(extra), count),
      share_based_comp_per_share: perShare(shareBasedCompFromSupplement(extra), count),
      dividends_per_share: null,
      book_value_per_share: round4(num(row.BPS)),
    }
  })
  const epsPoints = series(annual, epsOf)
  const cashPoints = series(annual, fcfOf)
  const bookPoints = series(annual, (row) => num(row.BPS))
  const revenuePoints = series(annual, (row) => num(row.PER_TOI))
  const ebitPoints = series(annual, (row) => num(row.PER_EBIT))
  return pack({
    ttmEps: earnings?.value ?? null,
    ttmDiluted,
    earningsRow: earnings?.row,
    earningsKind: earnings?.kind,
    ttmFcf,
    book: latestBook,
    basis: usedFirm ? 'fcff' : 'ocf',
    table,
    epsPoints,
    cashPoints,
    bookPoints,
    revenuePoints,
    ebitPoints,
    currency: mixed[0]?.CURRENCY || null,
  })
}

// Ordinary companies also earn interest on cash, so a net-interest line alone does
// not make a bank: it has to be a large part of revenue.
const BANK_INTEREST_SHARE = 0.3
const isHkFinancial = (row) => {
  if (num(row?.PREMIUM_INCOME) > 0) return true
  const interest = num(row?.NET_INTEREST_INCOME)
  if (interest == null) return false
  const count = shares(row.HOLDER_PROFIT, row.BASIC_EPS)
  const revenue = num(row.OPERATE_INCOME) ?? (count && num(row.PER_OI) != null ? num(row.PER_OI) * count : null)
  if (!(revenue > 0)) return true
  return interest >= revenue * BANK_INTEREST_SHARE
}

/** Hong Kong main-indicator rows. EPS_TTM is already trailing; cash flow is reconstructed per year. */
export function fromHkReports (rows, supplements = []) {
  const list = newest(rows || [])
  const annual = annualRows(list)
  const supplement = supplementByYear(supplements)
  const latest = list[0]
  const trailingEps = num(latest?.EPS_TTM)
  const earningsRow = trailingEps == null ? annual.at(-1) : latest
  const epsOf = (row) => num(row?.DILUTED_EPS ?? row?.BASIC_EPS)
  // Banks and insurers: investing cash flow is their lending and float, not capex.
  const financial = list.some(isHkFinancial)
  const fcfOf = (row) => {
    if (!row || financial) return null
    const count = shares(row.HOLDER_PROFIT, row.BASIC_EPS)
    const operate = num(row.NETCASH_OPERATE)
    const invest = num(row.NETCASH_INVEST)
    if (count && operate != null) {
      const capex = invest != null && invest < 0 ? invest : 0
      return (operate + capex) / count
    }
    return num(row.PER_NETCASH_OPERATE)
  }
  const usedFlow = !financial && annual.some((row) => shares(row.HOLDER_PROFIT, row.BASIC_EPS) && num(row.NETCASH_OPERATE) != null)
  const table = annual.map((row) => {
    const count = shares(row.HOLDER_PROFIT, row.BASIC_EPS)
    const extra = supplement.get(reportYear(row))
    return {
      date: dateLabel(row),
      eps_without_nri: round4(epsOf(row)),
      revenue_per_share: round4(num(row.PER_OI)),
      operating_income_per_share: round4(count && num(row.OPERATE_PROFIT) != null
        ? num(row.OPERATE_PROFIT) / count
        : null),
      ebitda_per_share: null,
      free_cash_flow_per_share: round4(fcfOf(row)),
      depreciation_amortization_per_share: perShare(depreciationFromSupplement(extra), count),
      share_based_comp_per_share: perShare(shareBasedCompFromSupplement(extra), count),
      // DPS_HKD on this feed is a current figure repeated on every row, not a history.
      dividends_per_share: null,
      book_value_per_share: round4(num(row.BPS)),
    }
  })
  const parsed = pack({
    ttmEps: trailingEps ?? epsOf(earningsRow),
    ttmDiluted: trailingEps,
    earningsRow,
    earningsKind: reportKind(earningsRow?.REPORT_TYPE) === 'FY' ? 'FY' : 'TTM',
    ttmFcf: fcfOf(annual.at(-1)),
    book: num(latest?.BPS),
    // A non-financial whose rows carry no operating and investing cash flow is not
    // a bank; it simply has no free cash flow to show.
    // 'invest' is operating cash flow plus negative investing cash flow, which
    // includes acquisitions and financial investments, not capital spending alone.
    basis: usedFlow ? 'invest' : financial ? 'ocf' : 'none',
    table,
    epsPoints: series(annual, epsOf),
    cashPoints: series(annual, fcfOf),
    bookPoints: series(annual, (row) => num(row.BPS)),
    revenuePoints: series(annual, (row) => num(row.PER_OI)),
    ebitPoints: series(annual, (row) => {
      const count = shares(row.HOLDER_PROFIT, row.BASIC_EPS)
      const profit = num(row.OPERATE_PROFIT)
      return count && profit != null ? profit / count : null
    }),
    currency: latest?.CURRENCY || null,
  })
  // RPT_HKF10_FN_MAININDICATOR normalizes these monetary fields to CNY.
  // Its CURRENCY flag can say HKD for both CNY and HKD filers. DPS_HKD is
  // separately denominated and is not part of this per-share pack.
  return { ...parsed, perShareCurrency: 'CNY' }
}

function pack (input) {
  const positive = input.epsPoints.filter((point) => point.val > 0).length
  const predictability = input.epsPoints.length
    ? Math.min(5, Math.max(1, Math.round((positive / input.epsPoints.length) * 5)))
    : null
  const financials = {
    annual: input.table,
    ttm: input.ttmEps == null ? [] : [{
      date: input.earningsRow ? dateLabel(input.earningsRow) : '',
      eps_without_nri: round4(input.ttmEps),
      free_cash_flow_per_share: round4(input.ttmFcf),
      book_value_per_share: round4(input.book),
    }],
    quarter: [],
  }
  const fields = {
    ttm_eps: round4(input.ttmDiluted ?? input.ttmEps),
    ttm_eps_nri: round4(input.ttmEps),
    free_cash_flow_per_share: round4(input.ttmFcf),
    tangible_book: round4(input.book),
    cashflow_basis: input.basis,
    eps_period: input.ttmEps == null ? null : (input.earningsKind || null),
    eps_as_of: input.ttmEps == null ? null : (String(input.earningsRow?.REPORT_DATE || '').slice(0, 10) || null),
    predictability,
    ...growthSet('earning_growth', input.epsPoints),
    ...growthSet('cashflow_growth', input.cashPoints),
    ...growthSet('book_growth', input.bookPoints),
    ...growthSet('rvn_growth', input.revenuePoints),
    ...growthSet('ebit_growth', input.ebitPoints),
  }
  // Operating cash flow of a bank is not owner earnings, and operating cash flow
  // without capital spending is not free cash flow. Keep both out of the number
  // the calculator will grow and out of the free-cash-flow history.
  if (input.basis === 'ocf' || input.basis === 'none') {
    fields.free_cash_flow_per_share = null
    fields.cashflow_growth_10y = null
    fields.cashflow_growth_5y = null
    fields.cashflow_growth_1y = null
    for (const row of financials.ttm) row.free_cash_flow_per_share = null
    for (const row of financials.annual) row.free_cash_flow_per_share = null
  }
  return { financials, fields, reportCurrency: input.currency || null }
}

const SCALE_FIELDS = ['ttm_eps', 'ttm_eps_nri', 'free_cash_flow_per_share', 'tangible_book']
const SCALE_ROWS = [
  'eps_without_nri',
  'revenue_per_share',
  'operating_income_per_share',
  'free_cash_flow_per_share',
  'depreciation_amortization_per_share',
  'share_based_comp_per_share',
  'book_value_per_share',
]

/**
 * Hong Kong indicator rows are in yuan. The quote is in HKD. Growth rates are ratios.
 * Dividends stay null: the feed's DPS_HKD is not a historical series.
 */
export function convertReportingCurrency (pack, rate) {
  if (!(rate > 0) || Math.abs(rate - 1) < 1e-6) return pack
  const scale = (value) => (value == null ? null : round4(Number(value) * rate))
  const fields = { ...pack.fields }
  for (const key of SCALE_FIELDS) fields[key] = scale(fields[key])
  const mapRow = (row) => {
    const next = { ...row }
    for (const key of SCALE_ROWS) next[key] = scale(next[key])
    return next
  }
  return {
    fields,
    financials: {
      annual: (pack.financials?.annual || []).map(mapRow),
      ttm: (pack.financials?.ttm || []).map(mapRow),
      quarter: pack.financials?.quarter || [],
    },
  }
}

/** Normalize the provider's financials to the quote currency exactly once. */
export function toHkQuoteCurrency (pack, cnyToHkd) {
  if (pack.perShareCurrency === 'HKD') return pack
  if (pack.perShareCurrency !== 'CNY' || !Number.isFinite(cnyToHkd) || cnyToHkd <= 0) {
    throw new Error('Unusable per-share currency for Hong Kong financials')
  }
  return { ...convertReportingCurrency(pack, cnyToHkd), perShareCurrency: 'HKD' }
}
