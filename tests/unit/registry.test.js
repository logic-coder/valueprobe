import { describe, expect, it } from 'vitest'
import { ProviderRegistry } from '../../src/data/registry'
import { Coverage } from '../../src/data/coverage'
import { DataError, ErrorCode } from '../../src/data/errors'
import { CircuitBreaker } from '../../src/data/circuit'
import { RateLimiter } from '../../src/data/limiter'
import { SkipReason } from '../../src/data/skip'

const blank = { stock: false, quote: false, profile: false, history: false, financials: false }

function provider (id, priority, behaviour, extra = {}) {
  return {
    id,
    priority,
    capabilities: { ...blank, stock: true, quote: true, profile: true, ...(extra.capabilities || {}) },
    coverage: extra.coverage || Coverage.global(),
    rateLimit: { requestsPerMinute: 600, burst: 50 },
    async fetchStock () {
      if (behaviour === 'fail') throw new DataError(ErrorCode.TIMEOUT, id, 'timeout')
      if (behaviour === 'never') throw new DataError(ErrorCode.VALIDATION, id, 'bad symbol')
      if (behaviour === 'null') return null
      return { symbol: 'X', price: '1', _provider: id }
    },
    async fetchQuote () {
      if (behaviour === 'fail') throw new DataError(ErrorCode.TIMEOUT, id, 'timeout')
      return { price: 10, currency: 'USD', timestamp: Date.now(), provider: id }
    },
    async fetchProfile () {
      if (behaviour === 'fail') throw new DataError(ErrorCode.NETWORK, id, 'down')
      return { company: id, exchange_: 'NASDAQ', currency: 'USD' }
    },
  }
}

const build = (providers, options = {}) => new ProviderRegistry({
  providers,
  breaker: options.breaker || new CircuitBreaker(),
  limiter: new RateLimiter({ sleep: async () => {} }),
  preferences: options.preferences || (() => ({ order: [], pinned: {} })),
})

describe('provider registry', () => {
  it('answers from the highest-priority source', async () => {
    const registry = build([provider('slow', 50), provider('fast', 10)])
    const result = await registry.fetchStock('NASDAQ:AAPL')
    expect(result.provider).toBe('fast')
    expect(result.diagnostics.usedFallback).toBe(false)
  })

  it('fails over and records the penalty', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 })
    const registry = build([provider('broken', 10, 'fail'), provider('ok', 20)], { breaker })
    const result = await registry.fetchStock('NASDAQ:AAPL')
    expect(result.provider).toBe('ok')
    expect(result.diagnostics.usedFallback).toBe(true)
    expect(breaker.isAllowed('broken')).toBe(false)
  })

  it('aborts on a never-retry error instead of failing over', async () => {
    const registry = build([provider('bad', 10, 'never'), provider('ok', 20)])
    await expect(registry.fetchStock('NASDAQ:ZZZZ')).rejects.toMatchObject({ code: ErrorCode.VALIDATION })
  })

  it('skips sources that do not cover the market', async () => {
    const registry = build([provider('us-only', 10, 'ok', { coverage: Coverage.of(['NYSE']) }), provider('all', 20)])
    const result = await registry.fetchStock('SHSE:601398')
    expect(result.provider).toBe('all')
    expect(result.diagnostics.skips[0]).toMatchObject({ providerId: 'us-only', reason: SkipReason.MARKET_NOT_COVERED })
  })

  it('skips sources without the operation capability', async () => {
    const onlyQuote = provider('quote-only', 10, 'ok', { capabilities: { stock: false } })
    const registry = build([onlyQuote, provider('full', 20)])
    const result = await registry.fetchStock('NASDAQ:AAPL')
    expect(result.provider).toBe('full')
    expect(result.diagnostics.skips[0].reason).toBe(SkipReason.OPERATION_NOT_SUPPORTED)
  })

  it('honours a pinned source over priority', async () => {
    const registry = build([provider('first', 10), provider('pinned', 90)], { preferences: () => ({ order: [], pinned: { 'NASDAQ:AAPL': 'pinned' } }) })
    expect((await registry.fetchStock('NASDAQ:AAPL')).provider).toBe('pinned')
  })

  it('honours the user order ahead of default priorities', async () => {
    const registry = build([provider('a', 10), provider('b', 20)], { preferences: () => ({ order: ['b'], pinned: {} }) })
    expect((await registry.fetchStock('NASDAQ:AAPL')).provider).toBe('b')
  })

  it('rejects a quote that fails validation and tries the next source', async () => {
    const bogus = provider('bogus', 10)
    bogus.fetchQuote = async () => ({ price: 0, currency: 'USD', timestamp: Date.now(), provider: 'bogus' })
    const registry = build([bogus, provider('sane', 20)])
    const result = await registry.fetchQuote('NASDAQ:AAPL')
    expect(result.provider).toBe('sane')
    expect(result.diagnostics.errors[0].error).toContain('positive')
  })

  it('reads a local snapshot before calling a live host', async () => {
    let live = 0
    const remote = provider('eastmoney', 10)
    remote.fetchStock = async () => {
      live += 1
      throw new DataError(ErrorCode.TIMEOUT, 'eastmoney', 'timeout')
    }
    const file = provider('snapshot', 15)
    file.fetchStock = async () => ({ symbol: '601398', price: '9.06', _provider: 'snapshot', _as_of: '2026-11-17' })
    const registry = build([remote, file])
    const result = await registry.fetchStockRecord('SHSE:601398')
    expect(result.provider).toBe('snapshot')
    expect(result.value.price).toBe('9.06')
    expect(live).toBe(0)
    expect(result.diagnostics.usedFallback).toBe(false)
  })

  it('does not quote a dead host a second time when the file is missing', async () => {
    let quotes = 0
    const remote = provider('eastmoney', 10, 'fail')
    remote.fetchStock = async () => {
      quotes += 1
      throw new DataError(ErrorCode.TIMEOUT, 'eastmoney', 'timeout')
    }
    remote.fetchQuote = async () => {
      quotes += 1
      throw new DataError(ErrorCode.TIMEOUT, 'eastmoney', 'timeout')
    }
    const registry = build([remote])
    await expect(registry.fetchStockRecord('NASDAQ:MSFT')).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })
    expect(quotes).toBe(1)
  })

  it('does not call a filings handoff a fallback', async () => {
    const quoteOnly = provider('eastmoney', 10, 'ok', { capabilities: { profile: false, financials: true } })
    quoteOnly.fetchStock = async () => { throw new DataError(ErrorCode.NOT_SUPPORTED, 'eastmoney', 'filings cover NASDAQ:MSFT') }
    quoteOnly.fetchFinancials = async () => { throw new DataError(ErrorCode.NOT_SUPPORTED, 'eastmoney', 'filings cover NASDAQ:MSFT') }
    const filings = provider('edgar', 20, 'ok', { capabilities: { stock: false, quote: false, financials: true } })
    filings.fetchFinancials = async () => ({ annual: [] })
    const registry = build([quoteOnly, filings])
    const stock = await registry.fetchStockRecord('NASDAQ:MSFT')
    expect(stock.provider).toBe('eastmoney+edgar')
    expect(stock.diagnostics.usedFallback).toBe(false)
    const books = await registry.fetchFinancials('NASDAQ:MSFT')
    expect(books.provider).toBe('edgar')
    expect(books.diagnostics.usedFallback).toBe(false)
  })

  it('merges a quote and a profile when no source has both', async () => {
    const quoteOnly = provider('q', 10, 'ok', { capabilities: { stock: false, profile: false } })
    const profileOnly = provider('p', 20, 'ok', { capabilities: { stock: false, quote: false } })
    const registry = build([quoteOnly, profileOnly])
    const result = await registry.fetchStockRecord('NASDAQ:AAPL')
    expect(result.value.price).toBe('10')
    expect(result.value.company).toBe('p')
    expect(result.provider).toBe('q+p')
  })

  it('reports no data when nothing is eligible', async () => {
    const registry = build([])
    await expect(registry.fetchStock('NASDAQ:AAPL')).rejects.toMatchObject({ code: ErrorCode.NO_DATA })
  })

  it('skips an open circuit, then serves after recovery', async () => {
    let clock = 0
    const breaker = new CircuitBreaker({ now: () => clock, failureThreshold: 1, recoveryMs: 1000 })
    const first = provider('first', 10, 'fail')
    const registry = build([first, provider('second', 20)], { breaker })
    await registry.fetchStock('NASDAQ:AAPL')
    await registry.fetchStock('NASDAQ:AAPL')
    clock = 2000
    const result = await registry.fetchStock('NASDAQ:AAPL')
    expect(result.diagnostics.attempts.some((attempt) => attempt.skipped === SkipReason.CIRCUIT_OPEN)).toBe(false)
  })
})
