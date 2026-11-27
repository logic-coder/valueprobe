import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => JSON.parse(readFileSync(resolve(here, '../../../src/data/bundled', name), 'utf8'))

export const stockFixture = fixture('stock_icbc.json')
export const financialFixture = fixture('fin_1983.json')
const indicatorFixture = fixture('indicator_data.json')
const policyArtifact = JSON.parse(readFileSync(resolve(here, '../../../public/data/intrinsic/v3.json'), 'utf8'))
export const publishedEntry = symbol => policyArtifact.entries[symbol]

const year = (y, unit, value) => [unit, { end: y + '-09-30', fy: y, fp: 'FY', form: '10-K', val: value }]

const concept = (unit, rows) => {
  const units = {}
  for (const [name, entry] of rows) (units[name] ||= []).push(entry)
  return { units }
}

const snapshotFixture = {
  symbol: '601398',
  exchange_: 'SHSE',
  company: '工商银行',
  price: '¥8.85',
  currency: '¥',
  ttm_eps: 1.08,
  ttm_eps_nri: 1.08,
  free_cash_flow_per_share: 6.64,
  tangible_book: 11.24,
  earning_growth_10y: 3,
  cashflow_growth_10y: -4.8,
  predictability: 1,
  as_of: '2026-09-30',
}

// Eight fiscal years: growth10y needs a span of at least seven. A shorter slice
// leaves earnings growth empty, and the page then shows fair value as n/a.
// 2026 stays at 7.1 so the displayed trailing EPS remains $ 7.10.
const fiscalYears = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
const edgarFixture = {
  entityName: 'Apple Inc.',
  dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-09-30', val: 15_000_000_000 }] } } },
  'us-gaap': {
    EarningsPerShareDiluted: concept('USD/shares', fiscalYears.map((y) => year(y, 'USD/shares', 4.3 + (y - 2019) * 0.4))),
    StockholdersEquity: concept('USD', [2022, 2023, 2024, 2025, 2026].map((y, i) => year(y, 'USD', 5e10 + i * 1e10))),
    Goodwill: concept('USD', [2022, 2023, 2024, 2025, 2026].map((y) => year(y, 'USD', 1e9))),
    NetCashProvidedByUsedInOperatingActivities: concept('USD', [2022, 2023, 2024, 2025, 2026].map((y, i) => year(y, 'USD', 9e10 + i * 1e9))),
    PaymentsToAcquirePropertyPlantAndEquipment: concept('USD', [2022, 2023, 2024, 2025, 2026].map((y) => year(y, 'USD', 1e10))),
  },
}

// Deterministic offline API: every suite runs against bundled fixtures.
export const ratesFixture = {
  as_of: '2026-11-18',
  USD: { value: 5.1, as_of: '2026-11-17', tenor: '10Y' },
  CNY: { value: 1.5892, as_of: '2026-11-18', tenor: '10Y' },
}

export const yieldFixture = {
  result: {
    data: [
      { SOLAR_DATE: '2026-11-18 00:00:00', EMM00166466: 1.5892, EMG00001310: null },
      { SOLAR_DATE: '2026-11-17 00:00:00', EMM00166466: 1.6055, EMG00001310: 5.1 },
    ],
  },
}

export async function mockApi (page, options = {}) {
  // Mutable so a test can flip the network from down to up mid-run, and so a
  // test can knock out one provider to see the failover path.
  const state = { fail: options.fail === true, down: new Set() }

  // FX: fixed cross rates so the display-currency conversion is deterministic.
  const RATES = { CNY: { USD: 0.14, HKD: 1.09 }, USD: { CNY: 7.1, HKD: 7.8 }, HKD: { CNY: 0.92, USD: 0.128 } }
  await page.route('**/fx/**', async (route) => {
    if (state.fail) return route.fulfill({ status: 503, body: '{}' })
    const base = new URL(route.request().url()).searchParams.get('from') || 'CNY'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ base, rates: RATES[base] || {} }) })
  })

  // Eastmoney, both through the dev proxy (/em) and on the provider origin.
  const eastmoneyHandler = async (route) => {
    if (state.fail || state.down.has('eastmoney')) return route.fulfill({ status: 503, body: '{}' })
    const url = route.request().url()
    if (url.includes('/kline/')) {
      const rows = indicatorFixture.revenue_per_share.data.map((point) => point.date + ',' + point.value)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { klines: rows } }) })
    }
    const aapl = /AAPL/.test(url)
    const price = aapl ? 18000 : Number(String(stockFixture.price).replace(/[^0-9.]/g, '')) * 100
    const data = {
      f43: price,
      f57: aapl ? 'AAPL' : '601398',
      f58: aapl ? 'Apple' : stockFixture.company,
      f59: 2,
    }
    // US quotes stay price-only so EDGAR can supply the fundamentals.
    if (!aapl) {
      data.eps = stockFixture.ttm_eps
      data.growth = stockFixture.earning_growth_10y
      data.fcfGrowth = stockFixture.cashflow_growth_10y
      data.tbv = stockFixture.tangible_book
      data.fcf = stockFixture.free_cash_flow_per_share
      data.predictability = stockFixture.predictability
      data.price52whigh = stockFixture.price52whigh
      data.price52wlow = stockFixture.price52wlow
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })
  }
  await page.route('**/em/**', eastmoneyHandler)
  await page.route('**://push2.eastmoney.com/**', eastmoneyHandler)
  await page.route('**://push2his.eastmoney.com/**', eastmoneyHandler)
  // The dev transport sends statements/history through the Vite proxy prefixes,
  // which are not covered by the origin globs above. Without this, a "fail" run
  // could still reach the real network and silently mark the symbol live, which
  // made the stale/retry specs time-dependent.
  const proxyHandler = async (route) => {
    if (state.fail || state.down.has('eastmoney')) return route.fulfill({ status: 503, body: '{}' })
    return route.continue()
  }
  await page.route('**/emf10/**', proxyHandler)
  await page.route('**/emhis/**', proxyHandler)

  // SEC EDGAR: companyfacts for the US fundamentals fallback, without the network.
  const secHandler = async (route) => {
    if (state.fail || state.down.has('edgar')) return route.fulfill({ status: 503, body: '{}' })
    if (route.request().url().includes('company_tickers')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } }) })
    }
    return route.fulfill({ status: 404, body: '{}' })
  }
  await page.route('**/sec/**', secHandler)
  await page.route('**://www.sec.gov/**', secHandler)
  await page.route('**/secdata/**', async (route) => {
    if (state.fail || state.down.has('edgar')) return route.fulfill({ status: 503, body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(edgarFixture) })
  })
  await page.route('**://data.sec.gov/**', async (route) => {
    if (state.fail || state.down.has('edgar')) return route.fulfill({ status: 503, body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(edgarFixture) })
  })

  // Quarterly snapshot committed under public/data/ (served from the app origin).
  await page.route('**/RPTA_WEB_TREASURYYIELD**', async (route) => {
    if (state.fail) return route.fulfill({ status: 404, body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(yieldFixture) })
  })
  await page.route('**/emdcweb/**', async (route) => {
    if (state.fail) return route.fulfill({ status: 404, body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(yieldFixture) })
  })
  await page.route('**/datacenter-web.eastmoney.com/**', async (route) => {
    if (state.fail) return route.fulfill({ status: 404, body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(yieldFixture) })
  })

  await page.route('**/data/*.json', async (route) => {
    const url = route.request().url()
    if (url.includes('catalog.json')) return route.continue()
    if (url.includes('rates.json')) {
      if (state.fail) return route.fulfill({ status: 404, body: '{}' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ratesFixture) })
    }
    if (state.fail || state.down.has('snapshot') || !url.includes('SHSE-601398')) return route.fulfill({ status: 404, body: '{}' })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...snapshotFixture, history: indicatorFixture, financials: financialFixture }),
    })
  })

  page.apiMock = state
  return state
}
