import { describe, expect, it, vi } from 'vitest'
import { RATE_TTL_MS, createFx } from '../../src/lib/fx'

const httpWith = (handler) => ({ get: vi.fn(handler) })

describe('fx service', () => {
  it('converts with a fetched cross rate', async () => {
    const fx = createFx({ http: httpWith(async () => ({ data: { rates: { USD: 0.14 } } })), stored: false })
    const result = await fx.convert(100, 'CNY', 'USD')
    expect(result.ok).toBe(true)
    expect(result.value).toBeCloseTo(14)
    expect(result.rate).toBeCloseTo(0.14)
  })

  it('is an identity when the currencies match, without a request', async () => {
    const http = httpWith(async () => ({ data: { rates: {} } }))
    const fx = createFx({ http, stored: false })
    const result = await fx.convert(5, 'USD', 'USD')
    expect(result).toMatchObject({ ok: true, value: 5, provider: 'identity' })
    expect(http.get).not.toHaveBeenCalled()
  })

  it('caches rates inside the ttl', async () => {
    let clock = 0
    const http = httpWith(async () => ({ data: { rates: { USD: 0.1 } } }))
    const fx = createFx({ http, now: () => clock, stored: false })
    await fx.convert(1, 'CNY', 'USD')
    clock = RATE_TTL_MS - 1
    await fx.convert(1, 'CNY', 'USD')
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('falls back to the second mirror, then to stale rates', async () => {
    let clock = 0
    const http = httpWith(async (url) => {
      if (url.includes('/fx/')) throw new Error('down')
      return { data: { result: 'success', rates: { USD: 0.2 } } }
    })
    const fx = createFx({ http, now: () => clock, stored: false })
    expect((await fx.convert(10, 'CNY', 'USD')).value).toBeCloseTo(2)
    clock = RATE_TTL_MS + 1
    const staleHttp = httpWith(async () => { throw new Error('down') })
    const stale = createFx({ http: staleHttp, now: () => clock, stored: false })
    await stale.convert(1, 'CNY', 'USD')
    clock = RATE_TTL_MS * 5
    const result = await stale.convert(1, 'CNY', 'USD')
    expect(result.ok).toBe(false)
  })

  it('reports an explicit reason when nothing resolves', async () => {
    const fx = createFx({ http: httpWith(async () => { throw new Error('down') }), stored: false })
    expect(await fx.convert(1, 'CNY', 'USD')).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(await fx.convert(1, 'CNY', 'USD')).toMatchObject({ ok: false })
    expect(await fx.convert(1, '', 'USD')).toMatchObject({ ok: false, reason: 'no-currency' })
    expect(await fx.convert('abc', 'CNY', 'USD')).toMatchObject({ ok: false, reason: 'no-amount' })
  })

  it('reports a missing pair', async () => {
    const fx = createFx({ http: httpWith(async () => ({ data: { rates: {} } })), stored: false })
    expect(await fx.convert(1, 'CNY', 'XYZ')).toMatchObject({ ok: false, reason: 'no-pair' })
  })
})
