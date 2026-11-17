import { describe, expect, it } from 'vitest'
import { secidFor } from '../../src/data/providers/eastmoney'

describe('eastmoney secid', () => {
  it('uses a dot, which is the only separator the quote host accepts', () => {
    expect(secidFor('NASDAQ', 'MSFT')).toBe('105.MSFT')
    expect(secidFor('SHSE', '601398')).toBe('1.601398')
    expect(secidFor('HKSE', '00700')).toBe('128.00700')
    expect(secidFor('NYSE', 'KO')).toBe('106.KO')
  })
})
