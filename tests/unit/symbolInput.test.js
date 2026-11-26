import { describe, expect, it } from 'vitest'
import { guessSymbol, searchStocks } from '../../src/lib/symbolInput'

describe('guessSymbol', () => {
  it('keeps an explicit exchange', () => {
    expect(guessSymbol(' hkse:0700 ')).toBe('hkse:0700')
  })

  it('maps six-digit A-share codes by their first digit', () => {
    expect(guessSymbol('601398')).toBe('SHSE:601398')
    expect(guessSymbol('600519')).toBe('SHSE:600519')
    expect(guessSymbol('000858')).toBe('SZSE:000858')
    expect(guessSymbol('300750')).toBe('SZSE:300750')
  })

  it('pads short numeric codes to the Hong Kong form', () => {
    expect(guessSymbol('700')).toBe('HKSE:00700')
    expect(guessSymbol('0941')).toBe('HKSE:00941')
  })

  it('falls back to NASDAQ for tickers and leaves empty input empty', () => {
    expect(guessSymbol('aapl')).toBe('NASDAQ:aapl')
    expect(guessSymbol('')).toBe('')
  })
})

describe('searchStocks keeps a recognisable alias beside a legal entity name', () => {
  const catalog = [{ symbol: 'NYSE:BAC', name: 'BofA Finance LLC' }]

  it('finds the bank by its Chinese and English common names', () => {
    expect(searchStocks(catalog, '美国银行').map(match => match.stock.symbol)).toEqual(['NYSE:BAC'])
    expect(searchStocks(catalog, 'bank of america').map(match => match.stock.symbol)).toEqual(['NYSE:BAC'])
  })
})

describe('searchStocks restores names lost to SEC display names', () => {
  const catalog = [
    { symbol: 'NASDAQ:GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'NASDAQ:GOOG', name: 'Alphabet Inc.' },
    { symbol: 'NASDAQ:NVDA', name: 'NVIDIA CORP' },
    { symbol: 'NASDAQ:SMCI', name: 'Super Micro Computer, Inc.' },
    { symbol: 'NYSE:TSM', name: 'TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD' },
    { symbol: 'NYSE:JPM', name: 'JPMORGAN CHASE & CO' },
  ]

  it('finds the companies readers previously searched by Chinese name', () => {
    const cases = [
      ['谷歌', ['NASDAQ:GOOGL', 'NASDAQ:GOOG']],
      ['谷歌A', ['NASDAQ:GOOGL']],
      ['谷歌C', ['NASDAQ:GOOG']],
      ['Google', ['NASDAQ:GOOGL']],
      ['英伟达', ['NASDAQ:NVDA']],
      ['超微电脑', ['NASDAQ:SMCI']],
      ['台积电', ['NYSE:TSM']],
      ['摩根大通', ['NYSE:JPM']],
    ]
    for (const [query, symbols] of cases) {
      expect(searchStocks(catalog, query).map(match => match.stock.symbol)).toEqual(symbols)
    }
  })
})
