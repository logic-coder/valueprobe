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

  it('flags a mainland ocf file as a financial institution, not an HK ocf file', async () => {
    get.mockResolvedValue({ data: { price: '¥43.3', company: '招商银行', cashflow_basis: 'ocf' } })
    expect((await snapshot.fetchStock('SHSE:600036')).financial_institution).toBe(true)
    get.mockResolvedValue({ data: { price: 'HK$373.6', company: '腾讯控股', cashflow_basis: 'ocf' } })
    expect((await snapshot.fetchStock('HKSE:00700')).financial_institution).toBeUndefined()
  })

  it('falls through when the file has no price', async () => {
    get.mockResolvedValue({ data: { as_of: '2026-09-30' } })
    await expect(snapshot.fetchStock('SHSE:601398')).rejects.toThrow(/no record/)
  })

  it('replaces a split-contaminated growth rate before the annual series is dropped', async () => {
    const eps = [27.85, 18, 43.7, 49.16, 2.93, 5.61, 4.56, 5.8, 8.04, 10.81]
    const annual = eps.map((value, index) => ({ date: (2016 + index) + '-12', eps_without_nri: value, free_cash_flow_per_share: null }))
    get.mockResolvedValue({ data: { price: '$280.2', earning_growth_10y: -9.98, cashflow_growth_10y: null, financials: { annual } } })
    const stock = await snapshot.fetchStock('NASDAQ:GOOGL')
    expect(stock.earning_growth_10y).toBe(29.83)
    expect(stock.growth_window).toEqual({ eps: { from: 2020, to: 2025 } })
    expect(stock.cashflow_growth_10y).toBeNull()
    expect(stock.financials).toBeUndefined()
  })

  it('reads revenue per share from the same rows to confirm a split whose earnings grew back', async () => {
    const eps = [9.21, 2.98, 2.97, 3.28, 5.61, 6.11, 6.13, 6.08, 7.46, 8.98]
    const revenue = [10.9124, 13.2795, 13.9911, 15.6613, 21.691, 24.1536, 24.2393, 25.3785, 27.7354, 32.5288]
    const annual = eps.map((value, index) => ({ date: (2017 + index) + '-12', eps_without_nri: value, revenue_per_share: revenue[index] }))
    get.mockResolvedValue({ data: { price: '$351.91', earning_growth_10y: -0.28, financials: { annual } } })
    const stock = await snapshot.fetchStock('NASDAQ:AAPL')
    expect(stock.earning_growth_10y).toBe(14.78)
    expect(stock.growth_window).toEqual({ eps: { from: 2018, to: 2026 } })
  })

  it('drops a stored rate when the clean window after a split is too short', async () => {
    const eps = [20, 22, 24, 26, 28, 30, 32, 3.4, 3.6, 3.9]
    const annual = eps.map((value, index) => ({ date: (2017 + index) + '-12', eps_without_nri: value }))
    get.mockResolvedValue({ data: { price: 10, earning_growth_10y: 7.43, financials: { annual } } })
    const stock = await snapshot.fetchStock('NASDAQ:NVDA')
    expect(stock.earning_growth_10y).toBeNull()
    expect(stock.growth_refused).toEqual({ eps: 'short' })
    expect(stock.growth_window).toBeUndefined()
  })

  it('does not keep a stored ten-year rate when the annuals cannot support the window, and leaves bank cash flow alone', async () => {
    const annual = [1, 1.1, 1.2, 1.3, 1.4].map((value, index) => ({ date: (2021 + index) + '-12', eps_without_nri: value, free_cash_flow_per_share: [9, 9, 1, 1, 1][index] }))
    get.mockResolvedValue({ data: { price: 9, earning_growth_10y: 3, cashflow_growth_10y: -4.8, cashflow_basis: 'ocf', financials: { annual } } })
    const stock = await snapshot.fetchStock('SHSE:601398')
    expect(stock.earning_growth_10y).toBeNull()
    expect(stock.cashflow_growth_10y).toBe(-4.8)
    expect(stock.growth_window).toBeUndefined()
  })

  it('turns the quote timestamp into the as_of instant', async () => {
    get.mockResolvedValue({ data: { price: 9.05, currency: 'CNY', as_of: '2026-09-30' } })
    const quote = await snapshot.fetchQuote('SHSE:601398')
    expect(quote.provider).toBe('snapshot')
    expect(quote.timestamp).toBe(Date.parse('2026-09-30'))
  })
})
