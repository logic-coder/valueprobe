// Eastmoney quote feed (price series only). No CORS on the host, so it needs the
// gateway on a static host.
import axios from 'axios'
import { Coverage } from '../coverage'
import { notSupported } from '../errors'
import { transport } from '../transport'
import { fromAshareReports, fromHkReports, supplementsFromHkCashflowItems, toHkQuoteCurrency } from './eastmoney-statements'
import { fx } from '../../lib/fx'

// CN 0/1, HK 128, US 105/106/107. The quote host wants a dot (105.MSFT).
// A colon is encoded to %3A and the host answers rc 102 with no quote.
const SECID = { SHSE: '1', SZSE: '0', HKSE: '128', NASDAQ: '105', NYSE: '106', AMEX: '107' }
const PRICE_INDICATORS = new Set(['price', 'share_price', 'close_price', 'stock_price', 'share_price_adjusted'])
// Used only when the payload does not say how many decimals f43 carries.
// A-shares quote in fen (2 decimals). HK and US quotes on this feed use 3.
const PRICE_SCALE = { SHSE: 100, SZSE: 100, HKSE: 1000, NASDAQ: 1000, NYSE: 1000, AMEX: 1000 }

/** f59, when present, is the decimal count and wins over the market default. */
export function scaleFor (quote, market) {
  const decimals = Number(quote?.f59)
  if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 4) return 10 ** decimals
  return PRICE_SCALE[market] || 100
}

const http = axios.create({ timeout: 5_000 })
const his = axios.create({ timeout: 5_000 })
const reports = axios.create({ timeout: 8_000 })

const US = new Set(['NYSE', 'NASDAQ', 'AMEX'])
const F10 = { id: 'eastmoney', origin: 'https://emweb.securities.eastmoney.com', proxyPath: '/emf10', corsSafe: false }
const DC = { id: 'eastmoney', origin: 'https://datacenter.eastmoney.com', proxyPath: '/emdc', corsSafe: false }
const statementCache = new Map()

async function yuanToHkd () {
  try {
    const result = await fx.convert(1, 'CNY', 'HKD')
    if (!result.ok || result.rate < 1.05 || result.rate > 1.3) return null
    return result.rate
  } catch (error) {
    return null
  }
}

const optional = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stockFromQuote (symbol, quote) {
  const raw = quote.raw || {}
  const [market, code] = symbol.split(':')
  const eps = Number(raw.ttm_eps ?? raw.eps)
  return {
    symbol: code,
    exchange_: market,
    company: raw.company || quote.name,
    currency: quote.currency,
    price: quote.price,
    ttm_eps: eps,
    free_cash_flow_per_share: optional(raw.fcf ?? raw.free_cash_flow_per_share),
    tangible_book: optional(raw.tbv ?? raw.tangible_book),
    earning_growth_10y: optional(raw.growth ?? raw.earning_growth_10y),
    cashflow_growth_10y: optional(raw.fcfGrowth ?? raw.cashflow_growth_10y),
    predictability: optional(raw.predictability),
    price52whigh: raw.price52whigh,
    price52wlow: raw.price52wlow,
    _provider: 'eastmoney',
  }
}

async function datacenterRows (params) {
  const rows = []
  for (let page = 1; page <= 10; page++) {
    const { data } = await reports.get(transport.url(DC, '/securities/api/data/v1/get', { ...params, pageNumber: page }))
    const chunk = data?.result?.data
    if (!Array.isArray(chunk) || !chunk.length) break
    rows.push(...chunk)
    const pages = Number(data.result.pages) || 1
    if (page >= pages) break
  }
  return rows
}

async function ashareSupplements (market, code) {
  try {
    return await datacenterRows({
      reportName: 'RPT_F10_FINANCE_GCASHFLOW',
      columns: 'ALL',
      filter: '(SECUCODE="' + code + '.' + (market === 'SHSE' ? 'SH' : 'SZ') + '")(REPORT_TYPE="年报")',
      pageSize: 50,
      sortTypes: -1,
      sortColumns: 'REPORT_DATE',
      source: 'F10',
      client: 'PC',
    })
  } catch {
    return []
  }
}

async function hkSupplements (code) {
  try {
    const { data } = await reports.get(transport.url(DC, '/securities/api/data/v1/get', {
      reportName: 'RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY',
      columns: 'SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,START_DATE,REPORT_DATE,FISCAL_YEAR,CURRENCY,ACCOUNT_STANDARD,REPORT_TYPE',
      filter: '(SECUCODE="' + code + '.HK")',
      source: 'F10',
      client: 'PC',
      pageNumber: 1,
      pageSize: 10,
    }))
    const years = (data?.result?.data?.[0]?.REPORT_LIST || [])
      .filter((row) => row.REPORT_TYPE === '年报')
      .map((row) => String(row.REPORT_DATE || '').slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    if (!years.length) return []
    const rows = await datacenterRows({
      reportName: 'RPT_HKF10_FN_CASHFLOW_PC',
      columns: 'SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,ORG_CODE,REPORT_DATE,DATE_TYPE_CODE,FISCAL_YEAR,START_DATE,STD_ITEM_CODE,STD_ITEM_NAME,AMOUNT',
      filter: '(SECUCODE="' + code + '.HK")(REPORT_DATE in (' + years.map((date) => "'" + date + "'").join(',') + '))',
      pageSize: 200,
      sortTypes: '-1,1',
      sortColumns: 'REPORT_DATE,STD_ITEM_CODE',
      source: 'F10',
      client: 'PC',
    })
    return supplementsFromHkCashflowItems(rows)
  } catch {
    return []
  }
}

async function loadStatements (symbol) {
  if (statementCache.has(symbol)) return statementCache.get(symbol)
  const [market, code] = symbol.split(':')
  let pack = null
  if (market === 'SHSE' || market === 'SZSE') {
    const listed = (market === 'SHSE' ? 'SH' : 'SZ') + code
    const [recent, annual, supplements] = await Promise.all([
      reports.get(transport.url(F10, '/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew', { type: 0, code: listed })),
      reports.get(transport.url(F10, '/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew', { type: 1, code: listed })),
      ashareSupplements(market, code),
    ])
    pack = fromAshareReports(recent.data?.data || [], annual.data?.data || [], supplements)
  } else if (market === 'HKSE') {
    const [{ data }, supplements] = await Promise.all([
      reports.get(transport.url(DC, '/securities/api/data/v1/get', {
        reportName: 'RPT_HKF10_FN_MAININDICATOR',
        columns: 'ALL',
        filter: '(SECUCODE="' + code + '.HK")',
        pageNumber: 1,
        pageSize: 40,
        sortTypes: -1,
        sortColumns: 'REPORT_DATE',
      })),
      hkSupplements(code),
    ])
    pack = fromHkReports(data?.result?.data || [], supplements)
    const reportCurrency = String(pack.reportCurrency || 'CNY').toUpperCase()
    // Eastmoney stamps HKD on this table even when the figures are already in yuan.
    if (!['CNY', 'RMB', 'HKD', ''].includes(reportCurrency)) {
      throw notSupported('eastmoney', 'statement currency ' + reportCurrency + ' for ' + symbol)
    }
    const rate = await yuanToHkd()
    if (!rate) throw notSupported('eastmoney', 'no CNYHKD rate for ' + symbol)
    pack = toHkQuoteCurrency(pack, rate)
  }
  if (!pack || !pack.financials.annual.length) throw notSupported('eastmoney', 'statements for ' + symbol)
  statementCache.set(symbol, pack)
  return pack
}

export const secidFor = (market, code) => (SECID[market] ? SECID[market] + '.' + code : null)


/**
 * Quote time from East Money field f124, the same rule as scripts/snapshot.mjs.
 * Missing or implausible f124 must not be replaced with Date.now().
 * @returns {{ asOf: string, timestamp: number } | null}
 */
export function quoteTimeFromF124 (quote, market, now = Date.now()) {
  const seconds = Number(quote?.f124)
  if (!(seconds > 0) || seconds >= now / 1000 + 60) return null
  const zone = US.has(market) ? 'America/New_York' : 'Asia/Shanghai'
  const asOf = new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(new Date(seconds * 1000))
  return { asOf, timestamp: seconds * 1000 }
}

export const eastmoney = {
  id: 'eastmoney',
  label: '东方财富',
  priority: 40,
  corsSafe: false,
  origin: 'https://push2.eastmoney.com',
  originHis: 'https://push2his.eastmoney.com',
  proxyPath: '/em',
  proxyPathHis: '/emhis',
  capabilities: { stock: true, quote: true, profile: false, history: true, financials: true },
  coverage: Coverage.of(['SHSE', 'SZSE', 'HKSE', 'NYSE', 'NASDAQ', 'AMEX']),
  rateLimit: { requestsPerMinute: 30, burst: 4 },

  async fetchQuote (symbol) {
    const [market, code] = symbol.split(':')
    const secid = secidFor(market, code)
    if (!secid) throw notSupported('eastmoney', 'market ' + market)
    const { data } = await http.get(
      transport.url(this, '/api/qt/stock/get', { secid, fields: 'f43,f57,f58,f59,f60,f116,f162,f167' }),
    )
    const quote = data?.data
    if (!quote || !quote.f58) throw notSupported('eastmoney', 'quote for ' + symbol)
    const scale = scaleFor(quote, market)
    const us = /NYSE|NASDAQ|AMEX/.test(market)
    const when = quoteTimeFromF124(quote, market)
    return {
      price: Number(quote.f43) / scale,
      currency: market === 'HKSE' ? 'HK$' : us ? '$' : '¥',
      name: quote.f58,
      ...(when || {}),
      provider: 'eastmoney',
      raw: quote,
    }
  },

  // Quotes never carry the statements. A test fixture may attach per-share
  // fields to the quote; otherwise Shanghai, Shenzhen and Hong Kong load the
  // indicator tables. US listings leave fundamentals to the filings source.
  async fetchStock (symbol) {
    const quote = await this.fetchQuote(symbol)
    const raw = quote.raw || {}
    if (Number.isFinite(Number(raw.ttm_eps ?? raw.eps))) return stockFromQuote(symbol, quote)
    const market = symbol.split(':')[0]
    if (US.has(market)) throw notSupported('eastmoney', 'filings cover ' + symbol)
    const pack = await loadStatements(symbol)
    if (!Number.isFinite(pack.fields.ttm_eps) && !Number.isFinite(pack.fields.ttm_eps_nri)) {
      throw notSupported('eastmoney', 'no per-share earnings for ' + symbol)
    }
    return {
      symbol: symbol.split(':')[1],
      exchange_: market,
      company: quote.name,
      currency: quote.currency,
      price: quote.price,
      ...pack.fields,
      _provider: 'eastmoney',
    }
  },

  async fetchFinancials (symbol) {
    const market = symbol.split(':')[0]
    if (US.has(market)) throw notSupported('eastmoney', 'filings cover ' + symbol)
    const pack = await loadStatements(symbol)
    return pack.financials
  },

  async fetchHistory (symbol, indicator) {
    if (!PRICE_INDICATORS.has(indicator)) {
      const market = symbol.split(':')[0]
      if (US.has(market)) throw notSupported('eastmoney', 'indicator ' + indicator)
      const pack = await loadStatements(symbol)
      const points = (pack.financials.annual || [])
        .filter((row) => row[indicator] != null)
        .map((row) => [row.date, row[indicator]])
      if (!points.length) throw notSupported('eastmoney', 'indicator ' + indicator)
      return points
    }
    const [market, code] = symbol.split(':')
    const secid = secidFor(market, code)
    if (!secid) throw notSupported('eastmoney', 'market ' + market)
    const hisProvider = { id: this.id, origin: this.originHis, proxyPath: this.proxyPathHis, corsSafe: false }
    const query = { secid, klt: 102, fqt: 1, beg: 0, end: 20500101, fields1: 'f1,f2', fields2: 'f51,f52' }
    const { data } = await his.get(transport.url(hisProvider, '/api/qt/stock/kline/get', query))
    const rows = data?.data?.klines || []
    return rows.map((row) => {
      const [date, close] = String(row).split(',')
      return { date, value: Number(close) }
    })
  },
}
