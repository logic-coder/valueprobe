import { beforeEach, describe, expect, it } from 'vitest'
import { addWatch, exportWatchlist, importWatchlist, isWatched, readWatchlist, removeWatch, toggleWatch } from '../../src/lib/watchlist'

describe('watchlist', () => {
  beforeEach(() => window.localStorage.clear())

  it('adds at the front without duplicates', () => {
    addWatch('SHSE:601398')
    addWatch('NYSE:KO')
    expect(readWatchlist()).toEqual(['NYSE:KO', 'SHSE:601398'])
    addWatch('SHSE:601398')
    expect(readWatchlist()).toEqual(['SHSE:601398', 'NYSE:KO'])
  })

  it('removes and toggles', () => {
    addWatch('SHSE:601398')
    expect(toggleWatch('SHSE:601398')).toEqual([])
    expect(toggleWatch('SHSE:601398')).toEqual(['SHSE:601398'])
    expect(removeWatch('SHSE:601398')).toEqual([])
  })

  it('drops junk and survives a broken store', () => {
    addWatch('nope')
    expect(readWatchlist()).toEqual([])
    window.localStorage.setItem('fv-watchlist', 'not json')
    expect(readWatchlist()).toEqual([])
    addWatch('NASDAQ:AAPL')
    expect(isWatched('NASDAQ:AAPL')).toBe(true)
  })

  it('exports a document and merges an import without duplicates', () => {
    addWatch('SHSE:601398')
    const document = exportWatchlist()
    expect(JSON.parse(document)).toEqual({ version: 1, symbols: ['SHSE:601398'] })
    importWatchlist(JSON.stringify({ version: 1, symbols: ['NASDAQ:AAPL', 'SHSE:601398'] }))
    expect(readWatchlist()).toEqual(['NASDAQ:AAPL', 'SHSE:601398'])
    expect(importWatchlist('[ "NYSE:KO", "junk" ]')).toEqual(['NYSE:KO', 'NASDAQ:AAPL', 'SHSE:601398'])
    expect(importWatchlist('not json')).toHaveLength(3)
  })

  it('keeps the newest forty entries only', () => {
    for (let index = 0; index < 45; index += 1) addWatch('SHSE:60' + String(1000 + index))
    expect(readWatchlist()).toHaveLength(40)
    expect(readWatchlist()[0]).toBe('SHSE:601044')
  })
})
