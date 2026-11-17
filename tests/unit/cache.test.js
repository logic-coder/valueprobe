import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAny, getFresh, put, remove } from '../../src/lib/cache'

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('cache', () => {
  it('round-trips a value with a timestamp', () => {
    put('k', { a: 1 }, 1000)
    expect(getFresh('k')).toEqual({ a: 1 })
    expect(getAny('k').savedAt).toBeTypeOf('number')
  })

  it('hides expired entries from getFresh but keeps them for getAny', () => {
    vi.useFakeTimers()
    put('k', 'v', 1000)
    vi.advanceTimersByTime(1500)
    expect(getFresh('k')).toBeNull()
    expect(getAny('k')).toMatchObject({ value: 'v', expired: true })
  })

  it('treats ttl 0 as never expiring', () => {
    put('k', 'v', 0)
    expect(getFresh('k')).toBe('v')
  })

  it('removes entries', () => {
    put('k', 'v', 1000)
    remove('k')
    expect(getAny('k')).toBeNull()
  })
})
