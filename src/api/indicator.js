import { mode, registry } from '../data'
import { getFresh, put } from '../lib/cache'
import viewFixture from '../data/bundled/view_1983.json'
import latestIndicatorFixture from '../data/bundled/latest_indicator.json'
import { http, TTL } from './client'
import { resolve } from './degrade'
import { useDataStateStore } from '../store/dataState'

/** Last-resort risk-free rate, bundled so the discount default never collapses to 8%. */
export const BUNDLED_RISK_FREE = parseFloat(latestIndicatorFixture)
const clone = (value) => JSON.parse(JSON.stringify(value))

// Average coupon on outstanding US Treasury notes. The host sends
// Access-Control-Allow-Origin: *, so a static page can call it directly.
export const TREASURY_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?fields=record_date,security_desc,avg_interest_rate_amt&filter=security_desc:eq:Treasury%20Notes&sort=-record_date&page[size]=1'

/** @returns {number|null} */
export function parseTreasuryRate (body) {
  const value = Number(body?.data?.[0]?.avg_interest_rate_amt)
  return Number.isFinite(value) ? value : null
}

// The financial-table definition ships with the app. There is no remote view to fetch.
export async function getView () {
  return clone(viewFixture)
}

/**
 * Latest risk-free indicator. Returns the value *and* where it came from, so the
 * calculator can say when the rate is cached or bundled instead of live.
 * @returns {Promise<{value:number, source:'live'|'cache'|'bundled'}>}
 */
export async function getLatestIndicator (id) {
  if (mode === 'fixture') return { value: BUNDLED_RISK_FREE, source: 'bundled' }
  const cached = getFresh('indicator:' + id)
  if (cached !== null) return { value: cached, source: 'cache' }
  try {
    const { data } = await http.get(TREASURY_URL)
    const parsed = parseTreasuryRate(data)
    if (parsed === null) throw new Error('risk-free rate is not a number')
    put('indicator:' + id, parsed, TTL.indicator)
    return { value: parsed, source: 'live' }
  } catch (error) {
    return { value: BUNDLED_RISK_FREE, source: 'bundled' }
  }
}

export async function getIndicatorData (symbol, indicator) {
  const source = useDataStateStore()
  if (source.stateOf(symbol) === 'manual') return []
  return resolve(symbol, 'chart:' + indicator, async () => {
    const { value } = await registry.fetchHistory(symbol, indicator)
    return value
  }, TTL.chart)
}
