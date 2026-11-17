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
    const waited = await limiter.acquire('src')
    expect(waited).toBe(1000)
    expect(slept.length).toBeGreaterThan(0)
  })

  it('gives up inside the wait budget', async () => {
    const { limiter } = make()
    limiter.configure('slow', { requestsPerMinute: 1, burst: 1 })
    limiter.tryAcquire('slow')
    const waited = await limiter.acquire('slow', { maxWaitMs: 500 })
    expect(waited).toBeLessThanOrEqual(500)
  })
})
