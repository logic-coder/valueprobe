// Refresh the files the published site reads. Run this on your machine, then
// commit the snapshots and the valuation release together.
//
//   npm run snapshot
//   npm run snapshot -- SHSE:601398 NASDAQ:AAPL
//
// Each file keeps a seed price (editable on the page) plus the statement fields
// that change only when a new report arrives: earnings, cash flow, book, growth,
// the annual table and the chart series.
import { cp, mkdir, readFile, rename, rmdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromAshareReports, fromHkReports, supplementsFromHkCashflowItems, toHkQuoteCurrency } from '../src/data/providers/eastmoney-statements.js'
import { fundamentalsFromFacts, quoteSplitFactor, scalePerShare } from '../src/data/providers/edgar-xbrl.js'
import { parseEastMoneyYields } from '../src/lib/riskFree.js'
import { ARTIFACT_PATH, DATA_DIR, buildArtifacts, snapshotFiles } from './lib/policy-artifact.mjs'
import { atomicWrite, classifyShareBasis, readOptionalJson, recoverRecord, transport, useQuote } from './lib/snapshot-transport.mjs'
import { applyVerifiedEarnings, verifiedQuoteFactor } from './lib/verified-earnings.mjs'
import { parseSymbol } from '../src/config/markets.js'
import { recoverInstall, installSnapshots } from './lib/snapshot-install.mjs'
import { tencentKlineQuote, tencentKlineSymbol } from './lib/snapshot-quotes.mjs'
import { filingFactsFor } from './lib/sec-filing-fallback.mjs'
import { PUBLISH_PATH, assessPublish, classifyOutcome, committedPublish, previousRelease, publishState, refreshVerification } from './lib/publish-gate.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const liveDir = resolve(root, DATA_DIR)
const UA = 'valueprobe-snapshot/1.0 (open-source research; contact: logic159@163.com)'
const SECID = { SHSE: '1', SZSE: '0', HKSE: '128', NASDAQ: '105', NYSE: '106', AMEX: '107' }
const SCALE = { SHSE: 100, SZSE: 100, HKSE: 1000, NASDAQ: 1000, NYSE: 1000, AMEX: 1000 }
const US = new Set(['NYSE', 'NASDAQ', 'AMEX'])

const HEADERS = { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://emweb.securities.eastmoney.com/' }

const args = process.argv.slice(2)
const options = Object.fromEntries(args.filter(arg => arg.startsWith('--') && arg.includes('='))
  .map(arg => [arg.slice(2, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]))
const mode = options.mode || 'all'
if (!['all', 'quotes', 'fundamentals'].includes(mode) || args.some(arg => arg.startsWith('--') &&
  !['mode', 'universe', 'stage', 'cache', 'candidates', 'rates', 'reference'].includes(arg.slice(2, arg.indexOf('='))))) throw new Error('Unknown snapshot option')
if (options.stage === '' || options.universe === '' || options.cache === '' || options.reference === '') throw new Error('Expected a non-empty path')
if (options.rates && options.rates !== 'keep') throw new Error('--rates must be keep')
if (options.candidates && (!['missing', 'new'].includes(options.candidates) || !options.stage || !options.universe)) {
  throw new Error('--candidates requires --stage and --universe')
}
const declared = JSON.parse(await readFile(resolve(root, options.universe || 'scripts/watchlist.json'), 'utf8'))
const requested = args.filter(arg => !arg.startsWith('--'))
const symbols = requested.length ? requested : options.candidates ? null : declared
if (!Array.isArray(declared) || !declared.length || new Set(declared).size !== declared.length ||
  declared.some(symbol => parseSymbol(symbol).symbol !== symbol || !SECID[symbol.split(':')[0]]) ||
  (symbols && (new Set(symbols).size !== symbols.length || symbols.some(symbol => !declared.includes(symbol))))) throw new Error('Invalid coverage list or requested code')
const tempRoot = resolve(root, options.stage || 'tmp-snapshot-' + randomUUID())
const cacheDir = resolve(root, options.cache || 'tmp-snapshot-cache')
const inLocalTemp = path => path.startsWith(resolve(root, 'tmp-'))
if (!inLocalTemp(tempRoot) || !inLocalTemp(cacheDir)) throw new Error('Stage and cache must use workspace tmp-* paths')
const OUT = resolve(tempRoot, 'data')
const stageOnly = Boolean(options.stage || options.universe)
const reference = options.reference ? await readOptionalJson(resolve(root, options.reference)) : null
if (options.reference && (!stageOnly || !reference?.quotes)) throw new Error('--reference requires a staged release and a quotes object')
const backup = resolve(root, 'tmp-snapshot-previous')
await mkdir(tempRoot, { recursive: true })
const lock = resolve(root, 'tmp-snapshot-lock')
await mkdir(lock).catch(error => {
  if (error.code === 'EEXIST') throw new Error('Another refresh owns tmp-snapshot-lock. After confirming the previous process stopped, remove the empty lock directory and retry.')
  throw error
})
try {
  await recoverInstall(liveDir, backup)
  await cp(liveDir, OUT, { recursive: true, force: false })
  const fromFile = name => name.replace(/^([A-Z]+)-(.+)\.json$/, '$1:$2')
  const existing = new Set(snapshotFiles(root, OUT).map(fromFile))
  const baseline = new Set(snapshotFiles(root).map(fromFile))
  const declaredSet = new Set(declared)
  const omitted = [...existing].filter(symbol => !declaredSet.has(symbol))
  for (const symbol of omitted) {
    const file = symbol.replace(':', '-') + '.json'
    const archived = resolve(tempRoot, 'omitted', file)
    await mkdir(dirname(archived), { recursive: true })
    await rename(resolve(OUT, file), archived)
    existing.delete(symbol)
  }
  await refresh(existing, baseline)
} finally {
  await rmdir(lock)
}

async function refresh (existing, baseline) {
  const active = symbols ?? declared.filter(symbol => !baseline.has(symbol) && (options.candidates === 'new' || !existing.has(symbol)))
  if (!active.length && !stageOnly) throw new Error('No symbols to refresh')
  const day = new Date().toISOString().slice(0, 10)
  const scope = requested.length ? 'targeted' : options.candidates ? 'candidates' : 'all'
  const prior = await previousRelease(liveDir)
  const fetched = new WeakSet()
  const onFetched = body => { if (body && typeof body === 'object') fetched.add(body) }
  const getJson = transport({ headers: HEADERS, cacheDir })
  const secJson = transport({ headers: { 'User-Agent': UA, Accept: 'application/json' }, cacheDir, onFetched,
    valid: body => body?.facts || Object.values(body ?? {}).some(entry => entry?.cik_str && entry.ticker) })
  const secPlainJson = transport({ headers: { 'User-Agent': UA, Accept: 'application/json' }, cacheDir, onFetched })
  const reportsJson = transport({ headers: HEADERS, cacheDir, onFetched,
    valid: body => Array.isArray(body?.data) || Array.isArray(body?.result?.data) })
  const statement = url => reportsJson(url, day + ':statement:' + url)

  async function writeRates () {
    const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?pageSize=10&pageNumber=1&reportName=RPTA_WEB_TREASURYYIELD&columns=ALL&sortColumns=SOLAR_DATE&sortTypes=-1'
    const file = resolve(OUT, 'rates.json')
    const stats = { requested: true, live: [], kept: [], failed: [] }
    const existing = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'))
    const validRate = row => row?.value != null && row.value !== '' && Number.isFinite(Number(row.value))
    try {
      const body = await getJson(url)
      const live = parseEastMoneyYields(body)
      const pick = (code, row) => {
        const prev = existing[code]
        if (row && Number.isFinite(row.value) && row.asOf &&
          (!prev?.as_of || row.asOf >= prev.as_of)) {
          stats.live.push(code)
          return { value: row.value, as_of: row.asOf, tenor: '10Y' }
        }
        if (validRate(prev)) {
          stats.kept.push(code)
          return prev
        }
        stats.failed.push(code)
        return null
      }
      const record = {
        as_of: new Date().toISOString().slice(0, 10),
        USD: pick('USD', live.USD),
        CNY: pick('CNY', live.CNY),
      }
      if (!record.USD && !record.CNY) throw new Error('empty yields')
      await atomicWrite(file, JSON.stringify(record, null, 2) + '\n')
      console.log('wrote rates.json', 'CNY', record.CNY && record.CNY.value, 'USD', record.USD && record.USD.value)
    } catch (error) {
      stats.live = []
      stats.kept = []
      stats.failed = []
      for (const code of ['USD', 'CNY']) {
        if (validRate(existing[code])) stats.kept.push(code)
        else stats.failed.push(code)
      }
      stats.error = error.message
      console.error('keep existing rates.json -', error.message)
    }
    return stats
  }


  function priceOf (quote, market) {
    const decimals = Number(quote.f59)
    const scale = Number.isInteger(decimals) && decimals >= 0 && decimals <= 4 ? 10 ** decimals : (SCALE[market] || 100)
    const price = Math.round((Number(quote.f43) / scale) * 100) / 100
    if (!Number.isFinite(price) || price <= 0) throw new Error('empty quote')
    const currency = market === 'HKSE' ? 'HK$' : US.has(market) ? '$' : '¥'
    const seconds = Number(quote.f124)
    const zone = US.has(market) ? 'America/New_York' : 'Asia/Shanghai'
    const asOf = seconds > 0 && seconds < Date.now() / 1000 + 60
      ? new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(new Date(seconds * 1000))
      : null
    return { price: currency + price, currency, company: quote.f58 || '', marketCap: Number(quote.f116), asOf }
  }

  async function quoteFor (market, code) {
    if (reference) {
      const saved = reference.quotes[market + ':' + code]
      if (!(saved?.close > 0 && Number.isSafeInteger(saved.cik) &&
        /^\d{4}-\d{2}-\d{2}$/.test(reference.date)) || !US.has(market)) {
        throw new Error('no verified reference quote')
      }
      return { price: '$' + saved.close, currency: '$', company: saved.name, asOf: reference.date,
        marketCap: NaN, checkedSince: saved.checkedSince, issuer: saved.cik, source: reference.source, localReference: true }
    }
    try {
      return await eastMoneyQuote(market, code)
    } catch (error) {
      // The primary feed rate-limits by closing the connection. A dated close from
      // the second feed is better than an undated price; the record keeps the
      // source, and a later primary success replaces it.
      try { return await tencentQuote(market, code) } catch { throw error }
    }
  }

  async function tencentQuote (market, code) {
    const symbol = tencentKlineSymbol(market, code)
    if (!symbol) throw new Error('market not on the fallback quote feed')
    const read = transport({ headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://gu.qq.com/' }, cacheDir })
    const body = await read('https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=' + encodeURIComponent(symbol + ',day,,,1'))
    return tencentKlineQuote(body, market, code)
  }

  async function eastMoneyQuote (market, code) {
    const secid = SECID[market]
    if (!secid) throw new Error('market not on the quote feed')
    const live = 'https://push2.eastmoney.com/api/qt/stock/get?secid=' + encodeURIComponent(secid + '.' + code) + '&fields=f43,f57,f58,f59,f116,f124'
    try {
      const quote = (await getJson(live))?.data
      if (!quote) throw new Error('empty quote')
      if (String(quote.f57).toUpperCase() !== code) throw new Error('quote symbol mismatch')
      const indicative = priceOf(quote, market)
      if (indicative.asOf) return indicative
      // f124 missing: use the dated kline close. Never write an undated price.
      const close = await quoteFromKline(market, code, secid)
      if (!close.asOf) throw new Error('quote date missing')
      // Market cap only verifies the share units against its accompanying price.
      if (close.price === indicative.price) return { ...close, marketCap: indicative.marketCap }
      return close
    } catch (error) {
      // push2 resets the socket (UND_ERR_SOCKET) after a long run. The daily
      // kline host still answers; its close is already in quote units, and
      // without a market cap the split check stays at 1.
      if (error.status && error.status < 500 && error.status !== 429) throw error
      return quoteFromKline(market, code, secid)
    }
  }

  async function quoteFromKline (market, code, secid) {
    const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=' + encodeURIComponent(secid + '.' + code)
      + '&klt=101&fqt=0&lmt=1&end=20500101&fields1=f1,f2,f3&fields2=f51,f53'
    const data = (await getJson(url))?.data
    if (String(data?.code).toUpperCase() !== code) throw new Error('quote symbol mismatch')
    const [date, value] = String(data?.klines?.at(-1) || '').split(',')
    const close = Number(value)
    if (!(close > 0)) throw new Error('empty quote')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('quote date missing')
    const currency = market === 'HKSE' ? 'HK$' : US.has(market) ? '$' : '¥'
    return { price: currency + close, currency, company: data.name || '', marketCap: NaN, asOf: date }
  }

  async function pagedDatacenter (buildUrl) {
    const rows = []
    for (let page = 1; page <= 10; page++) {
      const body = await statement(buildUrl(page))
      const chunk = body?.result?.data
      if (!Array.isArray(chunk) || !chunk.length) break
      rows.push(...chunk)
      const pages = Number(body.result.pages) || 1
      if (page >= pages) break
    }
    return rows
  }

  async function ashareSupplements (market, code) {
    const secu = encodeURIComponent('(SECUCODE="' + code + '.' + (market === 'SHSE' ? 'SH' : 'SZ') + '")(REPORT_TYPE="年报")')
    try {
      return await pagedDatacenter((page) => 'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_GCASHFLOW&columns=ALL&filter='
        + secu + '&pageNumber=' + page + '&pageSize=50&sortTypes=-1&sortColumns=REPORT_DATE&source=F10&client=PC')
    } catch (error) {
      console.warn('A-share cash-flow supplements skipped for ' + market + ':' + code + ' - ' + error.message)
      return []
    }
  }

  async function hkSupplements (code) {
    const filter = encodeURIComponent('(SECUCODE="' + code + '.HK")')
    try {
      const summary = await statement('https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY&columns=SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,START_DATE,REPORT_DATE,FISCAL_YEAR,CURRENCY,ACCOUNT_STANDARD,REPORT_TYPE&filter='
        + filter + '&source=F10&client=PC&pageNumber=1&pageSize=10')
      const years = (summary?.result?.data?.[0]?.REPORT_LIST || [])
        .filter((row) => row.REPORT_TYPE === '年报')
        .map((row) => String(row.REPORT_DATE || '').slice(0, 10))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      if (!years.length) return []
      const dated = encodeURIComponent('(SECUCODE="' + code + '.HK")(REPORT_DATE in (' + years.map((date) => "'" + date + "'").join(',') + '))')
      const rows = await pagedDatacenter((page) => 'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_HKF10_FN_CASHFLOW_PC&columns=SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,ORG_CODE,REPORT_DATE,DATE_TYPE_CODE,FISCAL_YEAR,START_DATE,STD_ITEM_CODE,STD_ITEM_NAME,AMOUNT&filter='
        + dated + '&pageNumber=' + page + '&pageSize=200&sortTypes=-1,1&sortColumns=REPORT_DATE,STD_ITEM_CODE&source=F10&client=PC')
      return supplementsFromHkCashflowItems(rows)
    } catch (error) {
      console.warn('Hong Kong cash-flow supplements skipped for HKSE:' + code + ' - ' + error.message)
      return []
    }
  }

  async function statementsFor (market, code) {
    if (market === 'SHSE' || market === 'SZSE') {
      const listed = (market === 'SHSE' ? 'SH' : 'SZ') + code
      const base = 'https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?code=' + listed
      const [recent, annual, supplements] = await Promise.all([
        statement(base + '&type=0'),
        statement(base + '&type=1'),
        ashareSupplements(market, code),
      ])
      if (!Array.isArray(recent.data) || !Array.isArray(annual.data)) throw new Error('invalid mainland statements response')
      return { ...fromAshareReports(recent.data, annual.data, supplements), earningsSource: base + '&type=0', upstreamFetched: fetched.has(recent) }
    }
    if (market === 'HKSE') {
      const filter = encodeURIComponent('(SECUCODE="' + code + '.HK")')
      const url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_HKF10_FN_MAININDICATOR&columns=ALL&filter='
        + filter + '&pageNumber=1&pageSize=40&sortTypes=-1&sortColumns=REPORT_DATE'
      const [body, supplements] = await Promise.all([
        statement(url),
        hkSupplements(code),
      ])
      if (!Array.isArray(body?.result?.data)) throw new Error('invalid Hong Kong statements response')
      return { ...fromHkReports(body.result.data, supplements), earningsSource: url, upstreamFetched: fetched.has(body) }
    }
    return null
  }

  let tickerMap = null
  async function edgarFor (market, code, expectedIssuer) {
    if (!tickerMap) {
      tickerMap = secJson('https://www.sec.gov/files/company_tickers.json', day + ':sec-tickers')
        .then(body => Object.fromEntries(Object.values(body).map(entry => [String(entry.ticker).toUpperCase(), entry])))
        .catch(error => { tickerMap = null; throw error })
    }
    // SEC uses BRK-B / BRK-A while the quote feed uses BRK.B / BRK.A.
    const secTicker = code.includes('.') ? code.replace('.', '-') : code
    const entry = (await tickerMap)[secTicker]
    if (!entry) throw new Error('unknown US ticker')
    if (expectedIssuer && Number(entry.cik_str) !== expectedIssuer) throw new Error('listing issuer identity changed')
    const cik = String(entry.cik_str).padStart(10, '0')
    const url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json'
    const facts = await secJson(url, day + ':cik:' + cik)
    if (Number(facts.cik) !== Number(entry.cik_str)) throw new Error('SEC issuer mismatch')
    let built
    // Berkshire's Company Facts has recent totals but EPS only to 2013 and tags
    // newer EPS by share class. Its per-share figures must come from the 10-K.
    if (code === 'BRK.B') {
      const submissionsUrl = 'https://data.sec.gov/submissions/CIK' + cik + '.json'
      const submissions = await secPlainJson(submissionsUrl, day + ':submissions:' + cik)
      built = await filingFactsFor({ symbol: market + ':' + code, cik: entry.cik_str, submissions, shareClass: 'B' })
      if (!built) throw new Error('SEC 10-K fallback produced no fundamentals')
    } else {
      try {
        built = fundamentalsFromFacts(market + ':' + code, facts)
      } catch (error) {
        // Some issuers tag EPS dimensionally or stop updating Company Facts.
        // Use their own 10-K statements before giving up on the listing.
        const submissionsUrl = 'https://data.sec.gov/submissions/CIK' + cik + '.json'
        const submissions = await secPlainJson(submissionsUrl, day + ':submissions:' + cik)
        const fallback = await filingFactsFor({ symbol: market + ':' + code, cik: entry.cik_str, submissions })
        if (!fallback) throw error
        built = fallback
      }
    }
    return { ...built, earningsSource: built.earningsSource || url, upstreamFetched: true }
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

  function recordFrom (market, code, quote, pack, note) {
    const fields = pack?.fields || {}
    const record = applyVerifiedEarnings({
      as_of: new Date().toISOString().slice(0, 10),
      symbol: code,
      exchange_: market,
      // US filings: SEC entityName / fundamentals beat an East Money quote nickname.
      company: (US.has(market) && fields.company) ? fields.company : (quote.company || fields.company || code),
      currency: quote.currency,
      price: quote.price,
      quote_as_of: quote.asOf,
    ...(quote.source ? { quote_source: quote.source } : {}),
      ttm_eps: fields.ttm_eps ?? null,
      ttm_eps_nri: fields.ttm_eps_nri ?? fields.ttm_eps ?? null,
      ...(fields.ttm_quality_facts_searched ? {
        ttm_nonoperating_gain: fields.ttm_nonoperating_gain ?? null,
        ttm_net_income: fields.ttm_net_income ?? null,
        ttm_operating_income: fields.ttm_operating_income ?? null,
        ttm_quality_as_of: fields.ttm_quality_as_of ?? null,
        ttm_quality_facts_searched: true,
      } : {}),
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
      eps_as_of: fields.eps_as_of || null,
      eps_source: pack?.earningsSource || null,
      predictability: fields.predictability ?? null,
      financials: pack?.financials || { annual: [], ttm: [], quarter: [] },
      ...note,
    })
    return { ...record, history: historyFrom(record.financials) }
  }

  const hkSymbols = active.filter(symbol => mode !== 'quotes' && symbol.startsWith('HKSE:'))
  let hkdPerYuan = null
  if (hkSymbols.length) {
    try {
      const fxBody = await getJson('https://api.frankfurter.dev/v1/latest?from=CNY')
      hkdPerYuan = Number(fxBody?.rates?.HKD)
    } catch { /* try the mirror */ }
    if (!(hkdPerYuan > 1.05 && hkdPerYuan < 1.3)) {
      try {
        const mirror = await getJson('https://open.er-api.com/v6/latest/CNY')
        hkdPerYuan = mirror?.result === 'success' ? Number(mirror.rates?.HKD) : NaN
      } catch { /* preserve the existing HK statements if both sources are unavailable */ }
    }
  }

  const usable = (pack) => {
    const fields = pack?.fields || {}
    const annual = pack?.financials?.annual || []
    return fields.ttm_eps != null || fields.tangible_book != null || annual.some((row) => row.eps_without_nri != null || row.book_value_per_share != null)
  }

  const rates = options.rates === 'keep' ? { requested: false } : await writeRates()

  const outcomes = []
  const workers = Math.min(8, active.length)
  const results = await Promise.allSettled(Array.from({ length: workers }, async (_, worker) => {
    for (let i = worker; i < active.length; i += workers) {
        const symbol = active[i]
        const [market, code] = String(symbol).split(':')
        const file = resolve(OUT, market + '-' + code + '.json')
        const prev = await readOptionalJson(file)
        let quote = null
        let quoteError = null
        if (mode !== 'fundamentals') {
          try { quote = await quoteFor(market, code) } catch (error) { quoteError = error.message }
        }
        let record = prev
        let fundamentals = false
        let fundamentalFetched = false
        let fundamentalError = null
        let shareRatio = null
        try {
          if (mode === 'quotes') {
            if (prev && quote) record = useQuote(prev, quote)
          } else {
            const seed = quote || (prev && { price: prev.price, currency: prev.currency, company: prev.company,
              asOf: prev.quote_as_of ?? null, source: prev.quote_source })
            if (!seed) throw new Error('no reference quote for new listing')
            let pack = US.has(market) ? await edgarFor(market, code, seed.issuer) : await statementsFor(market, code)
            fundamentalFetched = pack?.upstreamFetched === true
            const note = {}
            if (market === 'HKSE' && pack) {
              const reportCurrency = String(pack.reportCurrency || 'CNY').toUpperCase()
              // This feed labels yuan figures as HKD. Only a real third currency is refused.
              if (!['CNY', 'RMB', 'HKD', ''].includes(reportCurrency)) throw new Error('statement currency ' + reportCurrency)
              const sourceCurrency = pack.perShareCurrency
              if (sourceCurrency !== 'HKD' && !(hkdPerYuan > 1.05 && hkdPerYuan < 1.3)) throw new Error('missing CNY/HKD conversion')
              pack = toHkQuoteCurrency(pack, hkdPerYuan)
              note.report_currency = reportCurrency
              note.fundamentals_currency = sourceCurrency
              note.fx_to_quote = sourceCurrency === 'HKD' ? 1 : Math.round(hkdPerYuan * 10000) / 10000
            }
            if (US.has(market) && pack) {
              const price = Number(String(seed.price).replace(/[^0-9.-]/g, ''))
              const verified = verifiedQuoteFactor(symbol)
              const factor = verified ?? (seed.marketCap > 0
                ? quoteSplitFactor(price, seed.marketCap, pack.filingShares) : (Number(prev?.split_to_quote) || 1))
              shareRatio = (seed.marketCap / price) / pack.filingShares
              const checkedOrdinaryShare = /^\d{4}-\d{2}-\d{2}$/.test(seed.checkedSince) && pack.filingShares > 0 &&
                pack.fields.eps_as_of && pack.fields.eps_as_of >= seed.checkedSince && pack.fields.eps_as_of <= seed.asOf
              if (!baseline.has(symbol) && !verified && !checkedOrdinaryShare && classifyShareBasis(shareRatio, factor) !== 'comparable') {
                // A dated fallback quote has no market cap, so the ratio cannot be
                // computed. Keep the filed per-share basis and disclose that gap
                // instead of silently dropping an otherwise verified listing.
                if (!(Number(seed.marketCap) > 0) && pack.filingShares > 0) note.share_basis_unverified = true
                else throw new Error('share basis needs verification')
              }
              if (factor !== 1) {
                pack = scalePerShare(pack, factor)
                note.split_to_quote = factor
              }
            }
            if (!usable(pack)) throw new Error('no fundamentals')
            record = recordFrom(market, code, seed, pack, note)
            if (prev?.eps_as_of && (!record.eps_as_of || record.eps_as_of < prev.eps_as_of)) {
              record = prev
              throw new Error('latest filing is older than the saved filing')
            }
            if (prev) {
              const { as_of: oldDate, ...oldFields } = prev
              const { as_of: newDate, ...newFields } = record
              if (JSON.stringify(oldFields) === JSON.stringify(newFields)) record = { as_of: oldDate ?? newDate, ...newFields }
            }
            fundamentals = true
          }
        } catch (error) {
          fundamentalError = error.message
        }
        // The quote is applied once, wherever the record stands: the success path
        // has already built the record from it, and the recovery path must not
        // drop a quote that did arrive.
        if (record) record = recoverRecord(record, quote, { market, fundamentalError, us: US })
        const classified = classifyOutcome({ mode, quote, prev, patch: record, fundamentals, fundamentalError, fundamentalFetched })
        if (record && JSON.stringify(record) !== JSON.stringify(prev)) await atomicWrite(file, JSON.stringify(record, null, 2) + '\n')
        outcomes.push({ symbol, available: Boolean(record), fundamentals, datedQuote: Boolean(record?.quote_as_of), shareRatio,
          quoteError, fundamentalError, ...classified })
        await atomicWrite(resolve(tempRoot, 'outcomes', symbol.replace(':', '-') + '.json'), JSON.stringify(outcomes.at(-1)) + '\n')
    }
  }))
  const failedWorker = results.find(result => result.status === 'rejected')
  if (failedWorker) throw failedWorker.reason

  const names = snapshotFiles(root, OUT)
  const catalog = []
  const catalogSkipped = []
  for (const name of names.sort()) {
    try {
      const row = JSON.parse(await readFile(resolve(OUT, name), 'utf8'))
      if (row.ttm_eps == null && row.tangible_book == null && !(row.financials?.annual || []).some((item) => item.eps_without_nri != null || item.book_value_per_share != null)) continue
      catalog.push({ symbol: row.exchange_ + ':' + row.symbol, name: row.company || row.symbol, market: row.exchange_ })
    } catch (error) {
      // Not fatal (verify:data reads every file and will fail loudly), but a silently
      // dropped symbol still reads as "not in the coverage list".
      catalogSkipped.push({ file: name, error: error.message })
    }
  }
  if (catalogSkipped.length) console.warn('catalog skipped ' + catalogSkipped.length + ' unreadable snapshot(s); verify:data will fail on them')
  await atomicWrite(resolve(OUT, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')

  // The published value is read from the artifact, not recomputed in the browser, so a
  // refresh that leaves it behind is an incomplete refresh. Regenerate it right here.
  const built = buildArtifacts({ root, dataDir: OUT, declared, generatedAt: day })
  const byMarket = {}
  for (const symbol of declared) {
    const market = symbol.split(':')[0]
    const marketStats = byMarket[market] ??= { declared: 0, snapshots: 0, valued: 0, refused: 0, staleFundamentals: 0, reasons: {} }
    const entry = built.artifact.entries[symbol]
    marketStats.declared++
    if (!entry) continue
    marketStats.snapshots++
    marketStats[entry.status === 'ok' ? 'valued' : 'refused']++
    if (entry.warnings.includes('STALE_DATA')) marketStats.staleFundamentals++
    for (const reason of entry.reasons) marketStats.reasons[reason] = (marketStats.reasons[reason] ?? 0) + 1
  }
  if (Object.values(built.artifact.rates).some(rate => !rate)) built.problems.push('missing currency yield')
  const assessment = assessPublish({ mode, scope, outcomes, previous: prior.artifact, current: built.artifact, rates })
  for (const problem of built.problems) assessment.blocked.push('artifact: ' + problem)
  const verification = refreshVerification(assessment, outcomes, rates, prior.publish, new Date().toISOString())
  const publish = publishState({
    ...verification, blocked: assessment.blocked, partial: assessment.partial, mode, scope, rates,
    generatedAt: day, artifact: built.artifact, manifest: built.manifest, previous: committedPublish(root) ?? prior.publish,
  })
  await atomicWrite(resolve(OUT, ARTIFACT_PATH.replace(DATA_DIR + '/', '')), JSON.stringify(built.artifact, null, 2) + '\n')
  await atomicWrite(resolve(OUT, 'manifest.json'), JSON.stringify(built.manifest, null, 2) + '\n')
  await atomicWrite(resolve(OUT, PUBLISH_PATH.replace('public/data/', '')), JSON.stringify(publish, null, 2) + '\n')
  await atomicWrite(resolve(tempRoot, 'report.json'), JSON.stringify({
    outcomes: outcomes.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    coverage: built.artifact.coverage, universe: built.artifact.universe, byMarket, problems: built.problems, catalogSkipped,
    publish,
  }, null, 2) + '\n')
  for (const blocked of publish.blocked) console.error('publish blocked: ' + blocked)
  for (const partial of publish.partial) console.warn('publish partial: ' + partial)
  if (publish.status === 'blocked') throw new Error('Publish blocked; inspect ' + tempRoot + '/report.json')
  if (!stageOnly) {
    await installSnapshots(OUT, liveDir, backup, tempRoot)
  }
  console.log('publish', publish.status, 'batch', publish.batch.slice(0, 12))
  console.log('valuation coverage', built.artifact.coverage.valued, 'valued', built.artifact.coverage.refused, 'refused:', tempRoot)
}
