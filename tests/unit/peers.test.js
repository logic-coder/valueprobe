import { describe, expect, it } from 'vitest'
import { median, peerRow, peerSummary, peersFor } from '../../src/lib/peers'

const quote = (price, eps, book) => ({ price, ttm_eps: eps, tangible_book: book, company: 'x' })

describe('peers', () => {
  it('knows a curated peer set and nothing else', () => {
    expect(peersFor('SHSE:601398')).toHaveLength(4)
    expect(peersFor('NYSE:IBM')).toEqual([])
  })

  it('derives the multiples from a quote and keeps junk null', () => {
    const row = peerRow(quote(10, 2, 5), 'SHSE:601939')
    expect(row.pe).toBe(5)
    expect(row.pb).toBe(2)
    expect(peerRow(quote(0, 0, 0), 'X').pe).toBeNull()
    expect(peerRow(quote('¥8.85', '1.08', '11.24'), 'X').pe).toBeCloseTo(8.194)
    expect(peerRow({}, 'X').name).toBe('X')
  })

  it('takes the median of the available values only', () => {
    expect(median([1, 3, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([null, NaN, 5])).toBe(5)
    expect(median([null])).toBeNull()
  })

  it('implies a price from the median p/e and measures the gap', () => {
    const rows = [{ pe: 8 }, { pe: 10 }, { pe: null }]
    const summary = peerSummary(rows, 2, 20)
    expect(summary.medianPe).toBe(9)
    expect(summary.implied).toBe(18)
    expect(summary.gap).toBeCloseTo(-0.1)
  })

  it('reports no implication without a basis', () => {
    expect(peerSummary([{ pe: 9 }], 0, 20).implied).toBeNull()
  })
})
