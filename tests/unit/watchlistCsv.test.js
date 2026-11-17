import { beforeEach, describe, expect, it } from 'vitest'
import { exportWatchlistCsv, importWatchCsv, parseWatchCsv, readWatchlist } from '../../src/lib/watchlist'

describe('watchlist CSV', () => {
  beforeEach(() => window.localStorage.clear())

  it('reads the first column, normalises Hong Kong codes and drops junk', () => {
    const text = 'symbol,name\nSHSE:601398,工商银行\nhkse:0700,腾讯\nnot a symbol\n\nNYSE:KO,"Coca-Cola"\nSHSE:601398,dup'
    expect(parseWatchCsv(text)).toEqual(['SHSE:601398', 'HKSE:00700', 'NYSE:KO'])
  })

  it('takes the first cell of tab and semicolon files too', () => {
    expect(parseWatchCsv('SHSE:600519\t贵州茅台')).toEqual(['SHSE:600519'])
    expect(parseWatchCsv('NASDAQ:AAPL;Apple')).toEqual(['NASDAQ:AAPL'])
    expect(parseWatchCsv('601398\nhkse:0700')).toEqual(['SHSE:601398', 'HKSE:00700'])
  })

  it('merges into the list without duplicates and exports a header row', () => {
    importWatchCsv('SHSE:601398\nSHSE:600519')
    importWatchCsv('SHSE:601398\nNYSE:KO')
    expect(readWatchlist()).toEqual(['SHSE:601398', 'NYSE:KO', 'SHSE:600519'])
    expect(exportWatchlistCsv()).toBe('symbol\nSHSE:601398\nNYSE:KO\nSHSE:600519\n')
  })
})
