import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../../src/data/limiter'

const make = (slept) => {
  let clock = 0
  const limiter = new RateLimiter({
    now: () => clock,
    sleep: async (ms) => { clock += ms; slept?.push(ms) },
  })
  limiter.configure('src', { requestsPerMinute: 60, burst: 2 })
  return { limiter, advance: (ms) => { clock += ms } }
}

describe('rate limiter', () => {
  it('allows the burst then blocks', () => {
    const { limiter } = make()
    expect(limiter.tryAcquire('src')).toBe(true)
    expect(limiter.tryAcquire('src')).toBe(true)
    expect(limiter.tryAcquire('src')).toBe(false)
  })

  it('refills at the configured rate', () => {
    const { limiter, advance } = make()
    limiter.tryAcquire('src')
    limiter.tryAcquire('src')
    expect(limiter.msUntilAvailable('src')).toBe(1000)
    advance(1000)
    expect(limiter.tryAcquire('src')).toBe(true)
  })

  it('waits for a token instead of failing', async () => {
    const slept = []
    const { limiter } = make(slept)
    limiter.tryAcquire('src')
    limiter.tryAcquire('src')
    expect(await limiter.acquire('src')).toBe(true)
    expect(slept).toEqual([1000])
  })

  it('gives up inside the wait budget', async () => {
    const { limiter } = make()
    limiter.configure('slow', { requestsPerMinute: 1, burst: 1 })
    limiter.tryAcquire('slow')
    expect(await limiter.acquire('slow', { maxWaitMs: 500 })).toBe(false)
  })

  it('takes the source again once the refill passes the wait budget', async () => {
    const { limiter, advance } = make()
    limiter.configure('slow', { requestsPerMinute: 10, burst: 1 })
    expect(await limiter.acquire('slow')).toBe(true)
    expect(await limiter.acquire('slow')).toBe(false)
    advance(6000)
    expect(await limiter.acquire('slow')).toBe(true)
  })
})
