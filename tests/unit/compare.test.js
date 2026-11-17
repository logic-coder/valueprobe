import { describe, expect, it } from 'vitest'
import { parseSymbolsQuery, rankRows } from '../../src/lib/compare'

describe('compare helpers', () => {
  it('parses, normalises and dedupes a query', () => {
    expect(parseSymbolsQuery('shse:601398, hkse:0700 SHSE:601398,nasdaq:aapl')).toEqual(['SHSE:601398', 'HKSE:00700', 'NASDAQ:AAPL'])
    expect(parseSymbolsQuery('junk, SHSE:600519')).toEqual(['NASDAQ:JUNK', 'SHSE:600519'])
    expect(parseSymbolsQuery('601398 0700')).toEqual(['SHSE:601398', 'HKSE:00700'])
    expect(parseSymbolsQuery(undefined)).toEqual([])
  })

  it('caps the list at five', () => {
    expect(parseSymbolsQuery('NYSE:KO,NYSE:PEP,NASDAQ:AAPL,NASDAQ:MSFT,SHSE:600519,SHSE:601398')).toHaveLength(5)
  })

  it('ranks by margin of safety and sinks n/a', () => {
    const ranked = rankRows([{ mos: '3.00' }, { mos: null }, { mos: '21.00' }, { mos: 'n/a' }])
    expect(ranked.map((row) => row.mos)).toEqual(['21.00', '3.00', null, 'n/a'])
  })
})
