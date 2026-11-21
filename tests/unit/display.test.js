import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readStored } from '../../src/lib/storage'
import { useDisplayStore } from '../../src/store/display'
import { useMoney } from '../../src/composables/useMoney'

const boot = (stored) => {
  window.localStorage.clear()
  if (stored !== undefined) window.localStorage.setItem('fv-display-currency', stored)
  setActivePinia(createPinia())
  return useDisplayStore()
}

describe('display currency', () => {
  beforeEach(() => window.localStorage.clear())

  it('restores a supported code', () => {
    expect(boot('USD').currency).toBe('USD')
  })

  it('drops a code the select cannot show', () => {
    expect(boot('BTC').currency).toBe('')
    expect(boot('').currency).toBe('')
  })

  it('offers a converted reference only for a different display currency', () => {
    const display = boot('USD')
    display.rates.CNY = 0.14
    const { convertedIn } = useMoney()
    expect(convertedIn('¥', 7)).toBe('≈ $0.98')
    expect(display.currency).toBe('USD')
    display.rates.CNY = null
    expect(convertedIn('¥', 7)).toBe('≈ n/a')
  })

  it('keeps the native value when no conversion is active', () => {
    boot('')
    const { convertedIn } = useMoney()
    expect(convertedIn('¥', 7)).toBe('')
    const same = boot('CNY')
    expect(same.currency).toBe('CNY')
    expect(convertedIn('¥', 7)).toBe('')
  })

  it('reset clears the state and the stored value', () => {
    const display = boot('HKD')
    display.reset()
    expect(display.currency).toBe('')
    expect(readStored('fv-display-currency')).toBe('')
  })
})
