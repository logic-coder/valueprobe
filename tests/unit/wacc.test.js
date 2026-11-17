import { describe, expect, it } from 'vitest'
import { ERP_DEFAULT, buildUpRate } from '../../src/lib/wacc'

describe('build-up discount rate', () => {
  it('applies the beta load to the premium', () => {
    expect(buildUpRate({ riskFree: 5, erp: 6, beta: 1.2, sizePremium: 0 })).toBe(12)
  })

  it('adds the size premium', () => {
    expect(buildUpRate({ riskFree: 4, erp: ERP_DEFAULT, beta: 1, sizePremium: 2 })).toBe(11)
  })

  it('defaults beta to 1 and erp to the module default', () => {
    expect(buildUpRate({ riskFree: 4 })).toBe(9)
  })

  it('rounds to whole percent and rejects junk', () => {
    expect(buildUpRate({ riskFree: 5, erp: 5.5, beta: 1, sizePremium: 0 })).toBe(11)
    expect(buildUpRate({ riskFree: 'x' })).toBeNull()
  })
})
