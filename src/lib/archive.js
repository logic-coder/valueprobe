// Local valuation trail. Each saved snapshot is a dated record of one
// calculation, plus optionally how many shares the position held, so a later
// revisit can measure what the judgement did (see CALCULATION.md).
import { ReturnMethod } from './measure'
import { readStored, writeStored } from './storage'

const KEY = 'fv-valuations'
const LIMIT = 500

const readAll = () => {
  try {
    const parsed = JSON.parse(readStored(KEY, '{}'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

const writeAll = (all) => { writeStored(KEY, JSON.stringify(all)) }

export function listValuations (symbol) {
  return readAll()[symbol] || []
}

export function pushValuation (symbol, record) {
  const all = readAll()
  const list = [{ id: Date.now() + Math.random(), at: Date.now(), ...record }, ...(all[symbol] || [])].slice(0, LIMIT)
  all[symbol] = list
  writeAll(all)
  return list
}

export function removeValuation (symbol, id) {
  const all = readAll()
  all[symbol] = (all[symbol] || []).filter((item) => item.id !== id)
  writeAll(all)
  return all[symbol]
}

export function clearValuations (symbol) {
  const all = readAll()
  delete all[symbol]
  writeAll(all)
  return []
}

/**
 * Turn records into measurement inputs. A record with shares becomes a position
 * point (shares × price) with the share change as an external flow; a record set
 * without shares is a plain price series.
 */
export function buildMeasurement (records) {
  const ordered = [...records]
    .filter((record) => Number.isFinite(Number(record.stockPrice)) && Number(record.stockPrice) > 0)
    .sort((left, right) => new Date(left.at) - new Date(right.at))

  const hasShares = ordered.some((record) => Number(record.shares) > 0)
  if (!hasShares) {
    return {
      method: ReturnMethod.PRICE,
      points: ordered.map((record) => ({ date: record.at, value: Number(record.stockPrice) })),
      flows: [],
    }
  }

  const points = []
  const flows = []
  let previousShares = 0
  for (const record of ordered) {
    const shares = Math.max(0, Number(record.shares) || 0)
    const price = Number(record.stockPrice)
    points.push({ date: record.at, value: shares * price })
    const delta = shares - previousShares
    if (delta > 0) flows.push({ date: record.at, inflow: delta * price })
    else if (delta < 0) flows.push({ date: record.at, outflow: -delta * price })
    previousShares = shares
  }
  return { method: ReturnMethod.POSITION, points, flows }
}
