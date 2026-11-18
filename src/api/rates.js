import bundledRates from '../data/bundled/risk_free.json'
import { mode } from '../data'
import { transport } from '../data/transport'
import { getFresh, put } from '../lib/cache'
import { parseEastMoneyYields } from '../lib/riskFree'
import { http, TTL } from './client'

const CACHE_KEY = 'rates:10y'
const DC_WEB = {
  id: 'eastmoney',
  origin: 'https://datacenter-web.eastmoney.com',
  proxyPath: '/emdcweb',
  corsSafe: false,
}

export const YIELD_PATH = '/api/data/v1/get'
export const YIELD_QUERY = {
  pageSize: 10,
  pageNumber: 1,
  reportName: 'RPTA_WEB_TREASURYYIELD',
  columns: 'ALL',
  sortColumns: 'SOLAR_DATE',
  sortTypes: -1,
}

const asEntry = (row, source) => {
  const value = Number(row?.value)
  if (!Number.isFinite(value) || value <= 0) return null
  return { value, asOf: row.as_of || row.asOf || null, source, tenor: row.tenor || '10Y' }
}

const fromBundle = (source) => ({
  USD: asEntry(bundledRates.USD, source),
  CNY: asEntry(bundledRates.CNY, source),
})

async function loadSnapshotRates () {
  try {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
    const response = await fetch(base + 'data/rates.json')
    if (!response.ok) return { USD: null, CNY: null }
    const body = await response.json()
    return { USD: asEntry(body.USD, 'snapshot'), CNY: asEntry(body.CNY, 'snapshot') }
  } catch {
    return { USD: null, CNY: null }
  }
}

function merge (preferred, fallback) {
  return {
    USD: preferred.USD || fallback.USD || null,
    CNY: preferred.CNY || fallback.CNY || null,
  }
}

async function loadLiveRates () {
  const { data } = await http.get(transport.url(DC_WEB, YIELD_PATH, YIELD_QUERY))
  return parseEastMoneyYields(data)
}

/**
 * Ten-year government yields by cash-flow currency.
 * Live East Money first (dev proxy or a CORS gateway), then the committed
 * snapshot, then the bundled file. A missing currency stays empty so the
 * default discount rate can fall back to 8% in the open.
 * @returns {Promise<{USD: object|null, CNY: object|null}>}
 */
export async function getRiskFreeRates () {
  if (mode === 'fixture') return fromBundle('bundled')
  const cached = getFresh(CACHE_KEY)
  if (cached) return cached
  let live = { USD: null, CNY: null }
  try {
    live = await loadLiveRates()
  } catch { /* snapshot, then bundled */ }
  const rates = merge(merge(live, await loadSnapshotRates()), fromBundle('bundled'))
  put(CACHE_KEY, rates, TTL.indicator)
  return rates
}
