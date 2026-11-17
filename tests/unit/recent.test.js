import { beforeEach, describe, expect, it } from 'vitest'
import { addRecent, clearRecent, readRecent } from '../../src/lib/recent'

describe('recent symbols', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps the newest first without duplicates', () => {
    addRecent('SHSE:601398', '工商银行')
    addRecent('NASDAQ:AAPL', '苹果')
    expect(readRecent().map((item) => item.symbol)).toEqual(['NASDAQ:AAPL', 'SHSE:601398'])
    addRecent('SHSE:601398')
    expect(readRecent().map((item) => item.symbol)).toEqual(['SHSE:601398', 'NASDAQ:AAPL'])
    expect(readRecent()[1].name).toBe('苹果')
  })

  it('caps the list and survives junk', () => {
    for (let index = 0; index < 12; index += 1) addRecent('SHSE:60' + String(1000 + index))
    expect(readRecent()).toHaveLength(8)
    window.localStorage.setItem('fv-recent', 'nope')
    expect(readRecent()).toEqual([])
    expect(addRecent('junk')).toEqual([])
  })

  it('clears', () => {
    addRecent('NYSE:KO')
    expect(clearRecent()).toEqual([])
    expect(readRecent()).toEqual([])
  })
})
