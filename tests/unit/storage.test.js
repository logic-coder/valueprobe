import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStored, removeStored, writeStored } from '../../src/lib/storage'

describe('safe storage', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips through localStorage and takes the fallback for misses', () => {
    expect(readStored('k', 'none')).toBe('none')
    writeStored('k', 'v')
    expect(readStored('k')).toBe('v')
    removeStored('k')
    expect(readStored('k', 'gone')).toBe('gone')
  })

  it('keeps working for the session when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => writeStored('a', '1')).not.toThrow()
    expect(readStored('a')).toBe('1')
    expect(() => removeStored('a')).not.toThrow()
    expect(readStored('a', 'x')).toBe('x')
  })
})
