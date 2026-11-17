import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('axios', () => ({ default: { create: () => ({ get }) } }))

const { api } = await import('../../src/api')
const { TREASURY_URL } = await import('../../src/api/indicator')

beforeEach(() => {
  localStorage.clear()
  get.mockReset()
})

describe('risk-free indicator', () => {
  it('reads the Treasury note rate from the public fiscal-data endpoint', async () => {
    get.mockResolvedValue({ data: { data: [{ avg_interest_rate_amt: '5.14' }] } })
    const result = await api.getLatestIndicator(37)
    expect(get.mock.calls[0][0]).toBe(TREASURY_URL)
    expect(result).toEqual({ value: 5.14, source: 'live' })
  })

  it('falls back to the bundled rate when the network is gone', async () => {
    get.mockRejectedValue(new Error('offline'))
    const result = await api.getLatestIndicator(37)
    expect(result.source).toBe('bundled')
    expect(result.value).toBeCloseTo(5.14)
  })

  it('does not trust a non-numeric body', async () => {
    get.mockResolvedValue({ data: '<html>challenge</html>' })
    const result = await api.getLatestIndicator(37)
    expect(result).toEqual({ value: 5.14, source: 'bundled' })
  })

  it('serves the bundled DCF view without a request', async () => {
    const view = await api.getView(1983)
    expect(get).not.toHaveBeenCalled()
    expect(view).toBeTruthy()
  })
})
