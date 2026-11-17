import { describe, expect, it } from 'vitest'
import { Coverage, describe as describeCoverage, supports } from '../../src/data/coverage'

describe('coverage', () => {
  it('lets a global source serve everything', () => {
    expect(supports(Coverage.global(), 'SHSE')).toBe(true)
    expect(supports(Coverage.global(), 'NASDAQ')).toBe(true)
  })

  it('limits a listed source to its markets', () => {
    const us = Coverage.of(['NYSE', 'NASDAQ', 'AMEX'])
    expect(supports(us, 'NASDAQ')).toBe(true)
    expect(supports(us, 'SHSE')).toBe(false)
  })

  it('honours a deny list', () => {
    const allButCn = Coverage.except(['SHSE', 'SZSE'])
    expect(supports(allButCn, 'SHSE')).toBe(false)
    expect(supports(allButCn, 'HKSE')).toBe(true)
  })

  it('accepts unknown markets only in best-effort mode', () => {
    expect(supports(Coverage.of(['NASDAQ']), 'OTC')).toBe(false)
    expect(supports(Coverage.ofBestEffort(['NASDAQ']), 'OTC')).toBe(true)
  })

  it('describes itself for the settings screen', () => {
    expect(describeCoverage(Coverage.of(['NYSE']))).toBe('NYSE')
    expect(describeCoverage(Coverage.global())).toBe('全部市场')
  })
})
