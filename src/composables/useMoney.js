import { computed } from 'vue'
import { useDisplayStore, codeOf } from '../store/display'
import { money } from '../lib/format'
import { symbolOf } from '../lib/fx'

/**
 * Money rendering that honours the display-currency setting. Converted figures
 * carry a leading "≈" so a converted number is never mistaken for a native one;
 * a missing rate renders as "≈ n/a" rather than passing the native value off.
 */
export function useMoney () {
  const display = useDisplayStore()
  const available = computed(() => display.currency !== '')

  const moneyIn = (nativeCurrency, value) => {
    const nativeCode = codeOf(nativeCurrency)
    if (!display.currency || !nativeCode || nativeCode === display.currency) return money(nativeCurrency, value)
    const rate = display.rateBetween(nativeCode)
    if (rate == null) return '≈ n/a'
    const amount = Number(value)
    if (!Number.isFinite(amount)) return '≈ n/a'
    return '≈ ' + symbolOf(display.currency) + (amount * rate).toFixed(2)
  }

  /** Bare converted number for spots that render the symbol themselves. */
  const amountIn = (nativeCurrency, value) => {
    const nativeCode = codeOf(nativeCurrency)
    if (!display.currency || !nativeCode || nativeCode === display.currency) return value
    const rate = display.rateBetween(nativeCode)
    const amount = Number(value)
    if (rate == null || !Number.isFinite(amount)) return null
    return amount * rate
  }

  return { moneyIn, amountIn, available, display }
}
