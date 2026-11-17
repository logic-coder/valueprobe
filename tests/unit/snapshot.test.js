import { beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshot, snapshotPath } from '../../src/data/providers/snapshot'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('axios', () => ({ default: { create: () => ({ get }) } }))

beforeEach(() => get.mockReset())

describe('snapshot provider', () => {
  it('reads one JSON per symbol from the deployed base', () => {
    expect(snapshotPath('SHSE:601398')).toMatch(/\/data\/SHSE-601398\.json$/)
    expect(snapshot.corsSafe).toBe(true)
  })

  it('stamps the record with its own as_of date', async () => {
    get.mockResolvedValue({ data: { price: 9.05, currency: 'CNY', as_of: '2026-09-30' } })
    const stock = await snapshot.fetchStock('SHSE:601398')
    expect(get).toHaveBeenCalledWith(snapshotPath('SHSE:601398'))
    expect(stock._provider).toBe('snapshot')
    expect(stock._as_of).toBe('2026-09-30')
    expect(stock.exchange_).toBe('SHSE')
  })

  it('falls through when the file has no price', async () => {
    get.mockResolvedValue({ data: { as_of: '2026-09-30' } })
    await expect(snapshot.fetchStock('SHSE:601398')).rejects.toThrow(/no record/)
  })

  it('turns the quote timestamp into the as_of instant', async () => {
    get.mockResolvedValue({ data: { price: 9.05, currency: 'CNY', as_of: '2026-09-30' } })
    const quote = await snapshot.fetchQuote('SHSE:601398')
    expect(quote.provider).toBe('snapshot')
    expect(quote.timestamp).toBe(Date.parse('2026-09-30'))
  })
})
