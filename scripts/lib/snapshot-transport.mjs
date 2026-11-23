import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export async function atomicWrite (path, bytes) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(tmp, bytes)
    await rename(tmp, path)
  } finally {
    await unlink(tmp).catch(() => {})
  }
}

export function transport ({ headers, cacheDir, fetcher = fetch, timeout = 20_000, valid = () => true, onFetched }) {
  const queues = new Map()
  const pending = new Map()
  const work = async (url, pace, queue) => {
    const cooldown = queue.waitUntil - Date.now()
    if (cooldown > 30_000) throw new Error('supplier deferred ' + new URL(url).hostname)
    await delay(Math.max(0, cooldown))
    for (let i = 0; i < 3; i++) {
      let wait = 400 * 2 ** i
      try {
        const response = await fetcher(url, { headers, signal: AbortSignal.timeout(timeout) })
        if (response.ok) {
          const body = await response.json()
          if (!valid(body)) throw new Error('Invalid supplier response ' + new URL(url).hostname)
          onFetched?.(body)
          queue.waitUntil = Date.now() + pace
          return body
        }
        const error = Object.assign(new Error('HTTP ' + response.status + ' ' + url), { status: response.status })
        if (response.status === 429 || response.status >= 500) {
          const retry = response.headers.get('retry-after')
          const requested = Number(retry) || (Date.parse(retry) - Date.now()) / 1000
          if (requested > 0) wait = Math.max(wait, requested * 1000)
        }
        throw error
      } catch (error) {
        queue.waitUntil = Date.now() + pace
        if (i === 2 || (error.status && error.status !== 429 && error.status < 500)) {
          if (wait > 30_000) queue.waitUntil = Date.now() + wait
          throw error
        }
      }
      // A long Retry-After should pause the host, not hold the entire refresh indefinitely.
      if (wait > 30_000) {
        queue.waitUntil = Date.now() + wait
        throw new Error('supplier deferred ' + new URL(url).hostname)
      }
      await delay(wait)
    }
  }
  return function getJson (url, cacheKey = null) {
    const run = async () => {
      const cache = cacheKey && resolve(cacheDir, createHash('sha256').update(cacheKey).digest('hex') + '.json')
      if (cache) {
        const saved = await readFile(cache, 'utf8').catch(() => null)
        if (saved) {
          try {
            const body = JSON.parse(saved)
            if (valid(body)) return body
          } catch { /* repair the cache from the source */ }
        }
      }
      const host = new URL(url).hostname
      const key = host.endsWith('.sec.gov') ? 'sec' : host.endsWith('.eastmoney.com') ? 'eastmoney' : host
      const queue = queues.get(key) ?? { tail: Promise.resolve(), waitUntil: 0 }
      queues.set(key, queue)
      const response = queue.tail.then(() => work(url, key === 'sec' ? 190 : 140, queue))
      queue.tail = response.catch(() => {})
      const result = await response
      if (cache) await atomicWrite(cache, JSON.stringify(result))
      return result
    }
    if (!cacheKey) return run()
    if (!pending.has(cacheKey)) pending.set(cacheKey, run().finally(() => pending.delete(cacheKey)))
    return pending.get(cacheKey)
  }
}

export async function readOptionalJson (path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export function useQuote (record, quote) {
  if (!quote || quote.currency !== record.currency) return record
  // Never write or refresh a price without a real quote date. Do not invent today
  // or backfill quote_as_of from the fundamentals as_of.
  if (!quote.asOf) return record
  if (record.quote_as_of && quote.asOf < record.quote_as_of) return record
  if (record.quote_as_of === quote.asOf && record.price === quote.price &&
    (record.quote_source ?? null) === (quote.source ?? null)) return record
  const next = { ...record, price: quote.price, quote_as_of: quote.asOf }
  if (quote.source) next.quote_source = quote.source
  else delete next.quote_source
  return next
}

export function classifyShareBasis (ratio, factor) {
  if (!(ratio > 0)) return 'unknown'
  if (factor !== 1 || ratio < 0.8 || ratio > 1.25) return 'review'
  return 'comparable'
}
