// Eastmoney main-indicator rows to the per-share fields the calculator already reads.
// A-share figures come from the HSF10 indicator table. Hong Kong figures come from
// the HK main-indicator table. Both are year-to-date on interim rows, so trailing
// twelve months are rebuilt from an annual report plus the matching stub.

const num = (value) => {
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
  const ordered = newest(rows)
  const latest = ordered[0]
  if (!latest) return null
  const current = read(latest)
  if (reportKind(latest.REPORT_TYPE) === 'FY') return current
  const year = reportYear(latest)
  const kind = reportKind(latest.REPORT_TYPE)
  if (!year || !kind || current == null) return current
  const annual = ordered.find((row) => reportKind(row.REPORT_TYPE) === 'FY' && reportYear(row) === year - 1)
  const stub = ordered.find((row) => reportKind(row.REPORT_TYPE) === kind && reportYear(row) === year - 1)
  const prior = read(annual)
  const same = read(stub)
  if (prior == null || same == null) return current
  return current + prior - same
}

/** Compound annual growth in percent. Null when the span or the sign cannot support it. */
export function cagr (older, newer) {
  if (!older || !newer) return null
  const years = newer.fy - older.fy
  if (!(years >= 1) || !(older.val > 0) || !(newer.val > 0)) return null
  const rate = (Math.pow(newer.val / older.val, 1 / years) - 1) * 100
  return Number.isFinite(rate) ? Math.round(rate * 100) / 100 : null
}

/** Growth over a window. A 10-year label needs at least seven years of span. */
export function windowGrowth (points, yearsWanted) {
  const clean = points.filter((point) => point && Number.isFinite(point.fy) && Number.isFinite(point.val))
  if (clean.length < 2) return null
  const last = clean[clean.length - 1]
  let start = yearsWanted === 1
    ? clean[clean.length - 2]
    : clean.reduce((chosen, point) => (point.fy <= last.fy - yearsWanted ? point : chosen), clean[0])
  const minimum = yearsWanted === 1 ? 1 : Math.ceil(yearsWanted * 0.7)
  // A negative anchor makes the whole window fail. Step forward to the first
  // positive year that still covers the minimum span, instead of borrowing a
  // shorter window and labeling it as ten years.
  if (yearsWanted > 1 && !(start?.val > 0)) {
    start = clean.find((point) => point.fy < last.fy && point.val > 0 && last.fy - point.fy >= minimum) || null
  }
  if (!start || last.fy - start.fy < minimum) return null
  // A start that is a small fraction of the typical year is a trough, not a base.
  if (yearsWanted > 1 && startIsTrough(clean, start)) return null
  return cagr(start, last)
}

function startIsTrough (points, start) {
  const positives = points.map((point) => point.val).filter((value) => value > 0).sort((left, right) => left - right)
  if (positives.length < 3) return false
  const median = positives[Math.floor(positives.length / 2)]
  return start.val < median * 0.2
}

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
export function fromAshareReports (recent, annualReports) {
  const annual = annualRows(annualReports)
  const mixed = newest([...(recent || []), ...(annualReports || [])])
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
  const ttmEps = trailingTwelve(mixed, epsOf)
  const ttmDiluted = trailingTwelve(mixed, dilutedOf)
  const ttmFcf = trailingTwelve(mixed, fcfOf) ?? fcfOf(annual.at(-1))
  const latestBook = num(mixed[0]?.BPS)
  const table = annual.map((row) => ({
    date: dateLabel(row),
    eps_without_nri: round4(epsOf(row)),
    revenue_per_share: round4(num(row.PER_TOI)),
    operating_income_per_share: round4(num(row.PER_EBIT)),
    ebitda_per_share: null,
    free_cash_flow_per_share: round4(fcfOf(row)),
    dividends_per_share: null,
    book_value_per_share: round4(num(row.BPS)),
  }))
  const epsPoints = series(annual, epsOf)
  const cashPoints = series(annual, fcfOf)
  const bookPoints = series(annual, (row) => num(row.BPS))
  const revenuePoints = series(annual, (row) => num(row.PER_TOI))
  const ebitPoints = series(annual, (row) => num(row.PER_EBIT))
  return pack({
    ttmEps: ttmEps ?? epsPoints.at(-1)?.val ?? null,
    ttmDiluted,
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

const isHkFinancial = (row) => num(row?.NET_INTEREST_INCOME) != null || num(row?.PREMIUM_INCOME) != null

/** Hong Kong main-indicator rows. EPS_TTM is already trailing; cash flow is reconstructed per year. */
export function fromHkReports (rows) {
  const list = newest(rows || [])
  const annual = annualRows(list)
  const latest = list[0]
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
  const table = annual.map((row) => ({
    date: dateLabel(row),
    eps_without_nri: round4(epsOf(row)),
    revenue_per_share: round4(num(row.PER_OI)),
    operating_income_per_share: round4(shares(row.HOLDER_PROFIT, row.BASIC_EPS) && num(row.OPERATE_PROFIT) != null
      ? num(row.OPERATE_PROFIT) / shares(row.HOLDER_PROFIT, row.BASIC_EPS)
      : null),
    ebitda_per_share: null,
    free_cash_flow_per_share: round4(fcfOf(row)),
    dividends_per_share: round4(num(row.DPS_HKD)),
    book_value_per_share: round4(num(row.BPS)),
  }))
  return pack({
    ttmEps: num(latest?.EPS_TTM) ?? epsOf(annual.at(-1)) ?? null,
    ttmDiluted: num(latest?.EPS_TTM),
    ttmFcf: fcfOf(annual.at(-1)),
    book: num(latest?.BPS),
    basis: usedFlow ? 'fcf' : 'ocf',
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
}

function pack (input) {
  const positive = input.epsPoints.filter((point) => point.val > 0).length
  const predictability = input.epsPoints.length
    ? Math.min(5, Math.max(1, Math.round((positive / input.epsPoints.length) * 5)))
    : null
  const financials = {
    annual: input.table,
    ttm: input.ttmEps == null ? [] : [{
      date: input.table.at(-1)?.date || '',
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
    eps_period: 'TTM',
    predictability,
    ...growthSet('earning_growth', input.epsPoints),
    ...growthSet('cashflow_growth', input.cashPoints),
    ...growthSet('book_growth', input.bookPoints),
    ...growthSet('rvn_growth', input.revenuePoints),
    ...growthSet('ebit_growth', input.ebitPoints),
  }
  // Operating cash flow of a bank is not owner earnings. Keep it out of the
  // number the calculator will grow and out of the free-cash-flow history.
  if (input.basis === 'ocf') {
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
const SCALE_ROWS = ['eps_without_nri', 'revenue_per_share', 'operating_income_per_share', 'free_cash_flow_per_share', 'book_value_per_share']

/**
 * Hong Kong indicator rows are in yuan. The quote is in HKD. Dividends are
 * already DPS_HKD and are left alone. Growth rates are ratios.
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
