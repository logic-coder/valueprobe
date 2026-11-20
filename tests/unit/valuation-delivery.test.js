import { afterEach, expect, it, vi } from 'vitest'

const previous = '1'.repeat(20)
const current = '2'.repeat(20)
const symbol = 'NASDAQ:AAPL'
const metadata = release => ({ schema: 1, release, policyVersion: 'v1', generatedAt: '2026-11-20',
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
