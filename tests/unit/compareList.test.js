import { beforeEach, describe, expect, it } from 'vitest'
import { addCompare, isComparing, readCompare, removeCompare, toggleCompare } from '../../src/lib/compareList'

describe('compare queue', () => {
  beforeEach(() => window.localStorage.clear())

  it('adds normalised symbols and toggles them off', () => {
    expect(addCompare('hkse:0700')).toEqual(['HKSE:00700'])
    expect(isComparing('HKSE:00700')).toBe(true)
    expect(toggleCompare('HKSE:00700')).toEqual([])
    expect(addCompare('junk')).toEqual([])
  })

  it('does not duplicate and caps at five, newest first', () => {
    for (const symbol of ['NYSE:KO', 'NYSE:PEP', 'NASDAQ:AAPL', 'NASDAQ:MSFT', 'SHSE:600519']) addCompare(symbol)
    addCompare('SHSE:601398')
    addCompare('NYSE:KO')
    expect(readCompare()).toHaveLength(5)
    expect(readCompare()[0]).toBe('NYSE:KO')
    expect(removeCompare('NYSE:KO')).not.toContain('NYSE:KO')
  })
})
