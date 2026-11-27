// Fallback fundamentals for issuers whose SEC Company Facts are stale or
// dimensional (Berkshire is the pilot: EPS is tagged by share class). This
// reads the SEC's own rendered 10-K reports, never a price feed, and refuses
// to invent a per-share figure when the filing does not expose one.
import { windowGrowth } from '../../src/lib/assumptions.js'

const UA = 'valueprobe-snapshot/1.0 (open-source research; contact: logic159@163.com)'
const ARCHIVE = 'https://www.sec.gov/Archives/edgar/data/'

const decode = (text) => String(text ?? '')
  .replace(/&#160;|&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/<[^>]*>/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const numeric = (cell) => {
  const raw = decode(cell)
  if (!raw || raw === '—' || raw === '-') return null
  const negative = /^\(.*\)$/.test(raw)
  const clean = raw.replace(/[(),$\s]/g, '')
  const value = Number(clean)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

const cellsOf = (row) => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1])

/** Years in the statement header, newest first. */
export function reportYears (html) {
  const years = [...html.matchAll(/<th\b[^>]*>\s*<div>[^<]*?(\d{4})<\/div>\s*<\/th>/g)]
    .map(match => Number(match[1]))
  return [...new Set(years.filter(year => year > 1980 && year < 2100))]
}

function conceptOf (row) {
  const match = row.match(/defref_([^'"\s]+)/)
  if (!match) return ''
  const parts = match[1].split('_')
  return parts.at(-1) || ''
}

function memberOf (row, label) {
  const source = row + label
  if (/ClassAMember|Equivalent Class A/i.test(source)) return 'A'
  if (/ClassBMember|Equivalent Class B/i.test(source)) return 'B'
  if (/StatementClassOfStockAxis/i.test(source)) return 'unknown'
  return null
}

/** Parse one SEC rendered statement into rows with year-aligned values. */
export function parseSecReport (html) {
  const years = reportYears(html)
  const rows = []
  let currentMember = null
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = match[1]
    const cells = cellsOf(row)
    if (!cells.length) continue
    const label = decode(cells[0])
    const member = memberOf(row, label)
    if (member) currentMember = member
    const values = cells.slice(1).map(numeric)
    if (!label || !values.some(value => value != null)) continue
    rows.push({ label, concept: conceptOf(row), member: currentMember, values })
  }
  return { years, rows }
}

const isEps = (row) => /EarningsPerShare/i.test(row.concept) && /per share|per average equivalent/i.test(row.label)
const isShares = (row) => /WeightedAverageNumberOfShares|SharesOutstanding/i.test(row.concept)
const isOcf = (row) => /NetCashProvidedByUsedInOperatingActivities/i.test(row.concept)
const isCapex = (row) => /PaymentsToAcquirePropertyPlantAndEquipment|PaymentsToAcquireProductiveAssets/i.test(row.concept)

const pickRow = (parsed, predicate, member, rank) => {
  const candidates = parsed.rows.filter(row => predicate(row) && (row.member ?? null) === (member ?? null))
  candidates.sort((left, right) => (rank(right) - rank(left)) || right.values.filter(v => v != null).length - left.values.filter(v => v != null).length)
  return candidates[0] || null
}

const epsRank = (row) => /Diluted/i.test(row.concept + row.label) ? 3 : /Basic/i.test(row.concept + row.label) ? 2 : 1

function valuesByYear (row, years) {
  if (!row) return []
  const out = []
  // Cash-flow statements insert empty footnote columns between year columns.
  // When a row has more cells than the header has years, drop only those blanks.
  const values = row.values.length > years.length ? row.values.filter(value => value != null) : row.values
  values.forEach((value, index) => {
    const year = years[index]
    if (year && value != null) out.push({ fy: year, val: value })
  })
  return out
}

function latestOf (points) {
  return points.length ? points.reduce((best, point) => point.fy >= best.fy ? point : best) : null
}

function reportFile (summaryHtml, wanted) {
  for (const match of summaryHtml.matchAll(/<Report\b[^>]*>([\s\S]*?)<\/Report>/g)) {
    const body = match[1]
    const pick = (tag) => (body.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>')) || [])[1] || ''
    const name = decode(pick('ShortName')) + ' ' + decode(pick('LongName'))
    if (wanted.test(name)) return decode(pick('HtmlFileName'))
  }
  return null
}

async function readSecText (url) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' }, signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt))
    }
  }
  throw lastError
}

const tenK = (submissions) => {
  const recent = submissions?.filings?.recent
  if (!recent) return []
  return recent.form.map((form, index) => ({
    form,
    filed: recent.filingDate[index],
    report: recent.reportDate[index],
    accession: recent.accessionNumber[index],
    document: recent.primaryDocument[index],
  })).filter(row => row.form === '10-K' && /^\d{4}-\d{2}-\d{2}$/.test(row.report || ''))
    .sort((left, right) => right.report.localeCompare(left.report))
}

/**
 * Build a fundamentals pack from the newest 10-Ks. `shareClass` selects a
 * tagged class (A/B) when the issuer reports per-share data by class.
 */
export async function filingFactsFor ({ symbol, cik, submissions, shareClass = null, readText = readSecText }) {
  const filings = tenK(submissions).slice(0, 5)
  if (!filings.length) return null
  const base = ARCHIVE + String(cik).padStart(10, '0') + '/'
  const epsByYear = new Map()
  const sharesByYear = new Map()
  const cashByYear = new Map()
  const sourceByYear = new Map()

  for (const filing of filings) {
    const dir = base + String(filing.accession || '').replace(/-/g, '') + '/'
    const summaryHtml = await readText(dir + 'FilingSummary.xml')
    const earningsFile = reportFile(summaryHtml, /statements? of earnings|statements? of income/i)
    const cashFile = reportFile(summaryHtml, /statements? of cash flows/i)
    if (!earningsFile) continue
    const earningsHtml = await readText(dir + earningsFile)
    const earnings = parseSecReport(earningsHtml)
    const target = shareClass
    const epsRow = pickRow(earnings, isEps, target, epsRank)
    const shareRow = pickRow(earnings, isShares, target, row => row.concept.length)
    const epsA = shareClass ? pickRow(earnings, isEps, 'A', epsRank) : null
    const epsB = shareClass ? pickRow(earnings, isEps, 'B', epsRank) : null
    const sharesA = shareClass ? pickRow(earnings, isShares, 'A', row => row.concept.length) : null
    const sharesB = shareClass ? pickRow(earnings, isShares, 'B', row => row.concept.length) : null
    let cash = { years: [], rows: [] }
    if (cashFile) cash = parseSecReport(await readText(dir + cashFile))
    const cashRow = pickRow(cash, isOcf, null, row => row.concept.length)
    const capexRow = pickRow(cash, isCapex, null, row => row.concept.length)

    for (const point of valuesByYear(epsRow, earnings.years)) {
      if (!epsByYear.has(point.fy)) {
        epsByYear.set(point.fy, point.val)
        sourceByYear.set(point.fy, dir + earningsFile)
      }
    }
    for (const point of valuesByYear(shareRow, earnings.years)) sharesByYear.set(point.fy, point.val)
    for (const fy of earnings.years) {
      const ocf = valuesByYear(cashRow, cash.years).find(point => point.fy === fy)?.val
      const capex = valuesByYear(capexRow, cash.years).find(point => point.fy === fy)?.val
      if (ocf != null && capex != null) cashByYear.set(fy, { ocf: ocf * 1e6, capex: Math.abs(capex) * 1e6 })
    }
    if (shareClass) {
      for (const point of valuesByYear(sharesA, earnings.years)) sharesByYear.set('A:' + point.fy, point.val)
      for (const point of valuesByYear(sharesB, earnings.years)) sharesByYear.set('B:' + point.fy, point.val)
      const a = latestOf(valuesByYear(epsA, earnings.years))
      const b = latestOf(valuesByYear(epsB, earnings.years))
      if (a && b && b.val > 0) {
        const ratio = Math.round(a.val / b.val)
        if (ratio > 1 && Math.abs(a.val / b.val / ratio - 1) < 0.02) sharesByYear.set('ratio', ratio)
      }
    }
  }

  const series = [...epsByYear.entries()].map(([fy, val]) => ({ fy, val })).sort((a, b) => a.fy - b.fy)
  if (series.length < 2) return null
  const latest = series.at(-1)
  const ratio = sharesByYear.get('ratio') || 1
  const filingSharesByYear = new Map()
  const annual = series.map(({ fy, val }) => {
    const flow = cashByYear.get(fy)
    const shares = sharesByYear.get(fy)
    const fullShares = shareClass && sharesByYear.get('A:' + fy) && sharesByYear.get('B:' + fy)
      ? (shareClass === 'B' ? sharesByYear.get('B:' + fy) + sharesByYear.get('A:' + fy) * ratio : sharesByYear.get('A:' + fy) + sharesByYear.get('B:' + fy) / ratio)
      : shares
    filingSharesByYear.set(fy, fullShares || null)
    const perShare = fullShares > 0 && flow ? {
      free_cash_flow_per_share: Number(((flow.ocf - flow.capex) / fullShares).toFixed(4)),
      operating_cash_flow_per_share: Number((flow.ocf / fullShares).toFixed(4)),
      capex_per_share: Number((flow.capex / fullShares).toFixed(4)),
    } : {}
    return {
      date: fy + '-12',
      eps_without_nri: val,
      ...perShare,
      financials_from_filing: true,
    }
  })
  const cashSeries = annual.filter(row => row.free_cash_flow_per_share != null)
    .map(row => ({ fy: Number(row.date.slice(0, 4)), val: row.free_cash_flow_per_share }))
  return {
    fields: {
      symbol: String(symbol).split(':')[1],
      exchange_: String(symbol).split(':')[0],
      company: submissions?.name || String(symbol).split(':')[1],
      currency: '$',
      reporting_currency: null,
      reporting_currency_source: 'edgar-rendered-filing-currency-unverified',
      per_share_currency: null,
      unit_unreconciled: true,
      filingShares: filingSharesByYear.get(latest.fy) || null,
      ttm_eps: latest.val,
      eps_as_of: latest.fy + '-12-31',
      eps_period: 'FY',
      free_cash_flow_per_share: cashSeries.at(-1)?.val ?? null,
      earning_growth_10y: windowGrowth(series, 10),
      earning_growth_5y: windowGrowth(series, 5),
      earning_growth_1y: windowGrowth(series, 1),
      cashflow_growth_10y: windowGrowth(cashSeries, 10),
      cashflow_growth_5y: windowGrowth(cashSeries, 5),
      cashflow_growth_1y: windowGrowth(cashSeries, 1),
      _partial: true,
      _sources: ['edgar-filing'],
      _fiscal: 'FY',
      _filedThrough: latest.fy,
    },
    financials: { annual, ttm: [], quarter: [] },
    filingShares: filingSharesByYear.get(latest.fy) || null,
    earningsSource: sourceByYear.get(latest.fy) || base,
  }
}
