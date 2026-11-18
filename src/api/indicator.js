import { registry } from '../data'
import { resolve } from './degrade'
import { useDataStateStore } from '../store/dataState'
import viewFixture from '../data/bundled/view_1983.json'
import { TTL } from './client'

const clone = (value) => JSON.parse(JSON.stringify(value))

// The financial-table definition ships with the app. There is no remote view to fetch.
export async function getView () {
  return clone(viewFixture)
}

export async function getIndicatorData (symbol, indicator) {
  const source = useDataStateStore()
  if (source.stateOf(symbol) === 'manual') return []
  return resolve(symbol, 'chart:' + indicator, async () => {
    const { value } = await registry.fetchHistory(symbol, indicator)
    return value
  }, TTL.chart)
}
