import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { defaultDiscountRate, FALLBACK_DISCOUNT_RATE, parseEastMoneyYields, rateForCurrency, yieldForStock } from '../../src/lib/riskFree'

const rates = {
  USD: { value: 5.1, asOf: '2026-11-17', source: 'live' },
  CNY: { value: 1.5892, asOf: '2026-11-18', source: 'live' },
}

describe('defaultDiscountRate', () => {
  it('ceils a local ten-year yield and adds six points', () => {
    expect(defaultDiscountRate(5.1)).toBe(12)
    expect(defaultDiscountRate(1.5892)).toBe(8)
    expect(defaultDiscountRate(5.14)).toBe(12)
  })

  it('keeps zero and negative yields, and falls back only when missing', () => {
    expect(defaultDiscountRate(0)).toBe(6)
    expect(defaultDiscountRate(-2.5)).toBe(4)
    expect(defaultDiscountRate(null)).toBe(8)
    expect(defaultDiscountRate(undefined)).toBe(8)
    expect(defaultDiscountRate('')).toBe(8)
    expect(defaultDiscountRate('n/a')).toBe(8)
  })

  it('keeps the retired coupon file out of the bundle and the fallback at 8%', () => {
    // Average outstanding coupon rates (5.14, 3.399) are not ten-year yields
    // and were never a fallback. The orphan file must stay deleted.
    const bundled = 'src/data/bundled'
    expect(fs.existsSync(bundled + '/latest_indicator.json')).toBe(false)
    expect(FALLBACK_DISCOUNT_RATE).toBe(8)
    const rates = JSON.parse(fs.readFileSync(bundled + '/risk_free.json', 'utf8'))
    for (const code of ['USD', 'CNY']) {
      expect(rates[code].value).toBeGreaterThan(0)
      expect(rates[code].tenor).toBe('10Y')
    }
    expect(rates.USD.value).not.toBe(5.14)
    expect(rates.CNY.value).not.toBe(3.399)
  })
})

describe('rateForCurrency', () => {
  it('uses the cash-flow currency, not a display symbol alone', () => {
    expect(rateForCurrency(rates, '¥').value).toBe(1.5892)
    expect(rateForCurrency(rates, 'CNY').value).toBe(1.5892)
    expect(rateForCurrency(rates, '$').value).toBe(5.1)
  })

  it('proxies Hong Kong dollar cash flows to the US ten-year and says so', () => {
    const hkd = rateForCurrency(rates, 'HK$')
    expect(hkd.value).toBe(5.1)
    expect(hkd.source).toBe('usd_proxy')
    expect(hkd.proxy).toBe('USD')
    expect(hkd.currency).toBe('HKD')
  })

  it('does not silently substitute the US yield for a missing local one', () => {
    const cny = rateForCurrency({ USD: rates.USD, CNY: null }, 'CNY')
    expect(cny.value).toBeNull()
    expect(cny.source).toBe('fallback')
    expect(rateForCurrency({ USD: rates.USD }, 'EUR').source).toBe('fallback')
  })
})

describe('yieldForStock', () => {
  it('reads the stock reporting currency', () => {
    expect(yieldForStock(rates, { currency: '¥' })).toBe(1.5892)
    expect(yieldForStock(rates, { currency: '$' })).toBe(5.1)
    expect(yieldForStock(rates, { currency: 'HK$' })).toBe(5.1)
  })
})

describe('parseEastMoneyYields', () => {
  it('takes the latest non-empty observation for each series', () => {
    const parsed = parseEastMoneyYields({
      result: {
        data: [
          { SOLAR_DATE: '2026-11-18 00:00:00', EMM00166466: 1.5892, EMG00001310: null },
          { SOLAR_DATE: '2026-11-17 00:00:00', EMM00166466: 1.6055, EMG00001310: 5.1 },
        ],
      },
    })
    expect(parsed.CNY).toEqual({ value: 1.5892, asOf: '2026-11-18', source: 'live' })
    expect(parsed.USD).toEqual({ value: 5.1, asOf: '2026-11-17', source: 'live' })
  })

  it('keeps a zero or negative observation instead of skipping it', () => {
    const parsed = parseEastMoneyYields({
      result: { data: [
        { SOLAR_DATE: '2026-11-18 00:00:00', EMM00166466: 0, EMG00001310: -0.2 },
        { SOLAR_DATE: '2026-11-17 00:00:00', EMM00166466: 1.6, EMG00001310: 5.1 },
      ] },
    })
    expect(parsed.CNY.value).toBe(0)
    expect(parsed.USD.value).toBe(-0.2)
  })
})
