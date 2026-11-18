import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('axios', () => ({ default: { create: () => ({ get }) } }))

const { api } = await import('../../src/api')

beforeEach(() => {
  localStorage.clear()
  get.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})

const liveBody = {
  result: {
    data: [
      { SOLAR_DATE: '2026-11-18 00:00:00', EMM00166466: 1.5892, EMG00001310: null },
      { SOLAR_DATE: '2026-11-17 00:00:00', EMM00166466: 1.6055, EMG00001310: 5.1 },
    ],
  },
}

describe('risk-free rates', () => {
  it('reads local ten-year yields from the East Money treasury table', async () => {
    get.mockResolvedValue({ data: liveBody })
    const result = await api.getRiskFreeRates()
    expect(get.mock.calls[0][0]).toMatch(/RPTA_WEB_TREASURYYIELD/)
    expect(result.CNY).toMatchObject({ value: 1.5892, asOf: '2026-11-18', source: 'live' })
    expect(result.USD).toMatchObject({ value: 5.1, asOf: '2026-11-17', source: 'live' })
  })

  it('falls back to the bundled ten-year yields when the network is gone', async () => {
    get.mockRejectedValue(new Error('offline'))
    const result = await api.getRiskFreeRates()
    expect(result.CNY).toMatchObject({ value: 1.5892, source: 'bundled' })
    expect(result.USD).toMatchObject({ value: 5.1, source: 'bundled' })
  })

  it('does not trust a non-numeric body, and does not replace a missing CNY yield with USD', async () => {
    get.mockResolvedValue({ data: '<html>challenge</html>' })
    const result = await api.getRiskFreeRates()
    expect(result.CNY.source).toBe('bundled')
    expect(result.CNY.value).toBeCloseTo(1.5892)
    expect(result.USD.value).toBeCloseTo(5.1)
  })

  it('keeps a live CNY yield when only the USD column is empty, filling USD from the bundle', async () => {
    get.mockResolvedValue({
      data: { result: { data: [{ SOLAR_DATE: '2026-11-18 00:00:00', EMM00166466: 1.7, EMG00001310: null }] } },
    })
    const result = await api.getRiskFreeRates()
    expect(result.CNY).toMatchObject({ value: 1.7, source: 'live' })
    expect(result.USD).toMatchObject({ value: 5.1, source: 'bundled' })
  })

  it('serves the bundled DCF view without a request', async () => {
    const view = await api.getView(1983)
    expect(get).not.toHaveBeenCalled()
    expect(view).toBeTruthy()
  })
})
