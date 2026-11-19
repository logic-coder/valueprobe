import { describe, expect, it } from 'vitest'
import { clamp, isNum, money, parseAmount, percent, percent1, percentBody, quantity } from '../../src/lib/format'

describe('isNum', () => {
  it('accepts finite numbers and numeric strings', () => {
    expect(isNum(0)).toBe(true)
    expect(isNum('1.5')).toBe(true)
    expect(isNum(-3)).toBe(true)
  })

  it('rejects the kernel infinities, NaN, null and empty', () => {
    expect(isNum(Infinity)).toBe(false)
    expect(isNum(-Infinity)).toBe(false)
    expect(isNum(NaN)).toBe(false)
    expect(isNum(null)).toBe(false)
    expect(isNum('')).toBe(false)
    expect(isNum('abc')).toBe(false)
  })
})

describe('money / percent', () => {
  it('formats finite values to two decimals', () => {
    expect(money('¥', 11.564)).toBe('¥ 11.56')
    expect(money('$', '7')).toBe('$ 7.00')
    expect(percent(23.444)).toBe('23.44%')
    expect(percentBody(23.444)).toBe('23.44')
    expect(quantity(3.333)).toBe('3.33')
  })

  it('renders non-finite edge cases as n/a', () => {
    expect(money('¥', -Infinity)).toBe('n/a')
    expect(money('¥', NaN)).toBe('n/a')
    expect(percent(-Infinity)).toBe('n/a')
    expect(percentBody(NaN)).toBe('n/a')
    expect(money('¥', null)).toBe('n/a')
  })

  it('formats table rates with one decimal and n/a fallback', () => {
    expect(percent1(3.46)).toBe('3.5%')
    expect(percent1(undefined)).toBe('n/a')
  })

  it('keeps zero a real value, not n/a', () => {
    expect(money('¥', 0)).toBe('¥ 0.00')
    expect(percent(0)).toBe('0.00%')
  })
})

describe('clamp', () => {
  it('bounds the discount rate input', () => {
    expect(clamp(80, 0, 50)).toBe(50)
    expect(clamp(-4, 0, 50)).toBe(0)
    expect(clamp(12, 0, 50)).toBe(12)
  })

  it('falls back to the lower bound for junk', () => {
    expect(clamp('abc', 0, 50)).toBe(0)
    expect(clamp(undefined, 0, 50)).toBe(0)
  })
})

describe('parseAmount', () => {
  it('strips currency marks and spaces', () => {
    expect(parseAmount('¥9.05')).toBe(9.05)
    expect(parseAmount(' HK$ 1,234.5 ')).toBe(1234.5)
  })

  it('is null for an empty value, not zero', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount(null)).toBeNull()
  })
})
