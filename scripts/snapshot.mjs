#!/usr/bin/env node
// Refresh the files the published site reads. Run this on your machine, then
// commit public/data and push. Valuation itself stays in the browser.
//
//   node scripts/snapshot.mjs
//   node scripts/snapshot.mjs SHSE:601398 NASDAQ:AAPL
//
// Each file keeps a seed price (editable on the page) plus the statement fields
// that change only when a new report arrives: earnings, cash flow, book, growth,
// the annual table and the chart series.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromAshareReports, fromHkReports, convertReportingCurrency } from '../src/data/providers/eastmoney-statements.js'
import { fundamentalsFromFacts, quoteSplitFactor, scalePerShare } from '../src/data/providers/edgar-xbrl.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const OUT = resolve(root, 'public/data')
const UA = 'valueprobe-snapshot/1.0 (open-source research; contact: logic159@163.com)'
const SECID = { SHSE: '1', SZSE: '0', HKSE: '128', NASDAQ: '105', NYSE: '106', AMEX: '107' }
const SCALE = { SHSE: 100, SZSE: 100, HKSE: 1000, NASDAQ: 1000, NYSE: 1000, AMEX: 1000 }
const US = new Set(['NYSE', 'NASDAQ', 'AMEX'])
const HEADERS = { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://emweb.securities.eastmoney.com/' }

const fromArgs = process.argv.slice(2)
const symbols = fromArgs.length
  ? fromArgs
  : JSON.parse(await readFile(resolve(here, 'watchlist.json'), 'utf8'))

await mkdir(OUT, { recursive: true })

async function getJson (url) {
  const response = await fetch(url, { headers: HEADERS })
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url)
  return response.json()
}

function priceOf (quote, market) {
  const decimals = Number(quote.f59)
  const scale = Number.isInteger(decimals) && decimals >= 0 && decimals <= 4 ? 10 ** decimals : (SCALE[market] || 100)
  const price = Math.round((Number(quote.f43) / scale) * 100) / 100
  if (!Number.isFinite(price)) throw new Error('empty quote')
  const currency = market === 'HKSE' ? 'HK$' : US.has(market) ? '$' : '¥'
  return { price: currency + price, currency, company: quote.f58 || '', marketCap: Number(quote.f116) }
}

async function quoteFor (market, code) {
  const secid = SECID[market]
  if (!secid) throw new Error('market not on the quote feed')
  const url = 'https://push2.eastmoney.com/api/qt/stock/get?secid=' + encodeURIComponent(secid + '.' + code) + '&fields=f43,f57,f58,f59,f116'
  const quote = (await getJson(url))?.data
  if (!quote) throw new Error('empty quote')
  return priceOf(quote, market)
}

async function statementsFor (market, code) {
  if (market === 'SHSE' || market === 'SZSE') {
    const listed = (market === 'SHSE' ? 'SH' : 'SZ') + code
    const base = 'https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?code=' + listed
    const [recent, annual] = await Promise.all([
      getJson(base + '&type=0'),
      getJson(base + '&type=1'),
    ])
    return fromAshareReports(recent.data || [], annual.data || [])
  }
  if (market === 'HKSE') {
    const filter = encodeURIComponent('(SECUCODE="' + code + '.HK")')
    const url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_HKF10_FN_MAININDICATOR&columns=ALL&filter='
      + filter + '&pageNumber=1&pageSize=40&sortTypes=-1&sortColumns=REPORT_DATE'
    const body = await getJson(url)
    return fromHkReports(body?.result?.data || [])
  }
  return null
}

let tickerMap = null
async function edgarFor (market, code) {
  if (!tickerMap) {
    const body = await getJson('https://www.sec.gov/files/company_tickers.json')
    tickerMap = {}
    for (const entry of Object.values(body)) tickerMap[String(entry.ticker).toUpperCase()] = entry
  }
  const entry = tickerMap[code]
  if (!entry) throw new Error('unknown US ticker')
  const cik = String(entry.cik_str).padStart(10, '0')
  const facts = await getJson('https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json')
  return fundamentalsFromFacts(market + ':' + code, facts)
}

function historyFrom (financials) {
  const history = {}
  for (const row of financials?.annual || []) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'date' || value == null) continue
      ;(history[key] ||= []).push([row.date, value])
    }
  }
  return history
}

function recordFrom (market, code, quote, pack) {
  const fields = pack?.fields || {}
  return {
    as_of: new Date().toISOString().slice(0, 10),
    symbol: code,
    exchange_: market,
    company: quote.company || fields.company || code,
    currency: quote.currency,
    price: quote.price,
    ttm_eps: fields.ttm_eps ?? null,
    ttm_eps_nri: fields.ttm_eps_nri ?? fields.ttm_eps ?? null,
    free_cash_flow_per_share: fields.free_cash_flow_per_share ?? null,
    tangible_book: fields.tangible_book ?? null,
    earning_growth_10y: fields.earning_growth_10y ?? null,
    earning_growth_5y: fields.earning_growth_5y ?? null,
    earning_growth_1y: fields.earning_growth_1y ?? null,
    cashflow_growth_10y: fields.cashflow_growth_10y ?? null,
    cashflow_growth_5y: fields.cashflow_growth_5y ?? null,
    cashflow_growth_1y: fields.cashflow_growth_1y ?? null,
    book_growth_10y: fields.book_growth_10y ?? null,
    rvn_growth_10y: fields.rvn_growth_10y ?? null,
    ebit_growth_10y: fields.ebit_growth_10y ?? null,
    cashflow_basis: fields.cashflow_basis || null,
    eps_period: fields.eps_period || null,
    predictability: fields.predictability ?? null,
    financials: pack?.financials || { annual: [], ttm: [], quarter: [] },
    history: historyFrom(pack?.financials),
  }
}

let written = 0
const fxBody = await getJson('https://api.frankfurter.dev/v1/latest?from=CNY')
const hkdPerYuan = Number(fxBody?.rates?.HKD)
if (!(hkdPerYuan > 1.05 && hkdPerYuan < 1.3)) throw new Error('unexpected CNY to HKD rate ' + hkdPerYuan)

for (const symbol of symbols) {
  const [market, code] = String(symbol).split(':')
  try {
    const quote = await quoteFor(market, code)
    let pack = US.has(market) ? await edgarFor(market, code) : await statementsFor(market, code)
    const note = {}
    if (market === 'HKSE' && pack) {
      pack = convertReportingCurrency(pack, hkdPerYuan)
      note.report_currency = 'CNY'
      note.fx_to_quote = Math.round(hkdPerYuan * 10000) / 10000
    }
    if (US.has(market) && pack) {
      const price = Number(String(quote.price).replace(/[^0-9.-]/g, ''))
      const factor = quoteSplitFactor(price, quote.marketCap, pack.filingShares)
      if (factor !== 1) {
        pack = scalePerShare(pack, factor)
        note.split_to_quote = factor
      }
    }
    const record = { ...recordFrom(market, code, quote, pack), ...note }
    await writeFile(resolve(OUT, market + '-' + code + '.json'), JSON.stringify(record, null, 2) + '\n')
    written++
    console.log('wrote', market + '-' + code + '.json', record.price, 'eps', record.ttm_eps, note.split_to_quote ? 'split ' + note.split_to_quote : '')
  } catch (error) {
    console.error('skip', symbol, '-', error.message)
  }
}

const names = (await readdir(OUT)).filter((name) => /^[A-Z]+-.+\.json$/.test(name) && name !== 'catalog.json')
const catalog = []
for (const name of names.sort()) {
  try {
    const row = JSON.parse(await readFile(resolve(OUT, name), 'utf8'))
    catalog.push({ symbol: row.exchange_ + ':' + row.symbol, name: row.company || row.symbol, market: row.exchange_ })
  } catch { /* skip a broken file */ }
}
await writeFile(resolve(OUT, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(written + '/' + symbols.length + ' snapshots written; catalog has ' + catalog.length)
