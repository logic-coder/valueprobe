import { useDataStateStore } from '../store/dataState'

/**
 * Record which sources answered, so the banner can say a fallback was used.
 * The stock fetch replaces the flag. A later financials fetch must not clear it
 * just because that one table came from the first file that had the rows.
 */
export function track (symbol, diagnostics, { replace = false } = {}) {
  const source = useDataStateStore()
  const previous = source.metaOf(symbol)
  source.setMeta(symbol, {
    providers: diagnostics.attempts.filter((attempt) => attempt.success).map((attempt) => attempt.providerId),
    fallback: diagnostics.usedFallback || (!replace && Boolean(previous.fallback)),
    skips: diagnostics.skips.map((skip) => ({ providerId: skip.providerId, reason: skip.reason })),
  })
}
