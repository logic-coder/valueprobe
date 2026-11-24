import { afterEach, expect, it, vi } from 'vitest'
import { POLICY_VERSION } from '../../src/lib/policy'

const previous = '1'.repeat(20)
const current = '2'.repeat(20)
const symbol = 'NASDAQ:AAPL'
const metadata = (release, policyVersion = POLICY_VERSION) => ({ schema: 1, release, policyVersion, generatedAt: '2026-11-20',
  universe: {}, coverage: {}, symbols: [symbol] })

afterEach(() => vi.unstubAllGlobals())

it('revalidates removed release metadata once and loads matching details and summary', async () => {
  vi.resetModules()
  const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  const requests = vi.fn(async (url) => {
    if (url.endsWith('/meta.json')) return json(metadata(requests.mock.calls.length === 1 ? previous : current))
    if (url.includes(previous)) return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })
    if (url.endsWith('summary.json')) return json({ release: current, entries: { [symbol]: { value: 179.75 } } })
    return json({ release: current, entry: { symbol, value: 179.75 } })
  })
  vi.stubGlobal('fetch', requests)
  const { getPolicyEntry, getPolicySummary } = await import('../../src/api/policy')
  const [detail, summary] = await Promise.all([getPolicyEntry(symbol), getPolicySummary()])
  expect(detail.meta.release).toBe(current)
  expect(detail.entry.value).toBe(summary[symbol].value)
  expect(requests.mock.calls.filter(([url]) => url.endsWith('/meta.json'))).toHaveLength(2)
  expect(requests.mock.calls[0][1]).toEqual({ cache: 'no-cache' })
})

it('announces a policy mismatch without reloading underneath the reader', async () => {
  vi.resetModules()
  const reload = vi.fn()
  const dispatchEvent = vi.fn()
  vi.stubGlobal('window', { location: { reload }, dispatchEvent })
  vi.stubGlobal('CustomEvent', class CustomEvent { constructor (type, options) { this.type = type; this.detail = options?.detail } })
  const requests = vi.fn(async url => {
    if (url.endsWith('/meta.json')) {
      const body = requests.mock.calls.length === 1 ? metadata(previous) : metadata(current, 'next-policy')
      return new Response(JSON.stringify(body))
    }
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', requests)
  const { getPolicyEntry, getPolicySummary } = await import('../../src/api/policy')
  expect(await getPolicyEntry(symbol)).toBeNull()
  expect(await getPolicySummary()).toBeNull()
  // One announcement for the whole pair, never a reload: unsaved trials survive.
  expect(dispatchEvent).toHaveBeenCalledTimes(1)
  expect(dispatchEvent.mock.calls[0][0].type).toBe('fv:policy-mismatch')
  expect(dispatchEvent.mock.calls[0][0].detail).toMatchObject({ expected: POLICY_VERSION, actual: 'next-policy' })
  expect(reload).not.toHaveBeenCalled()
  expect(requests.mock.calls.some(([url]) => url.includes(current))).toBe(false)
})
