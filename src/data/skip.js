// Why a source was skipped, and the record of every attempt. The diagnostics are
// what lets the UI say "走的是兜底" instead of silently switching sources.

export const SkipReason = Object.freeze({
  MARKET_NOT_COVERED: 'MARKET_NOT_COVERED',
  OPERATION_NOT_SUPPORTED: 'OPERATION_NOT_SUPPORTED',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  RATE_LIMITED: 'RATE_LIMITED',
  RESOLUTION_FAILED: 'RESOLUTION_FAILED',
  PREFERRED_OVERRIDE: 'PREFERRED_OVERRIDE',
})

const LABELS = {
  [SkipReason.MARKET_NOT_COVERED]: '不覆盖该市场',
  [SkipReason.OPERATION_NOT_SUPPORTED]: '不支持该操作',
  [SkipReason.CIRCUIT_OPEN]: '熔断中',
  [SkipReason.RATE_LIMITED]: '被限流',
  [SkipReason.RESOLUTION_FAILED]: '代码解析失败',
  [SkipReason.PREFERRED_OVERRIDE]: '用户指定了其它源',
}

export class FetchDiagnostics {
  constructor () {
    this.attempts = []
  }

  recordSkip (providerId, reason) {
    this.attempts.push({ providerId, skipped: reason, error: null, success: false })
  }

  recordError (providerId, error) {
    this.attempts.push({ providerId, skipped: null, error: String(error), success: false })
  }

  recordSuccess (providerId) {
    this.attempts.push({ providerId, skipped: null, error: null, success: true })
  }

  get hasSuccess () {
    return this.attempts.some((attempt) => attempt.success)
  }

  /** True only when an earlier source actually failed, not merely skipped. */
  get usedFallback () {
    const index = this.attempts.findIndex((attempt) => attempt.success)
    if (index < 0) return false
    return this.attempts.slice(0, index).some((attempt) => attempt.error)
  }

  /** Providers that were skipped, with the localized reason. */
  get skips () {
    return this.attempts
      .filter((attempt) => attempt.skipped)
      .map((attempt) => ({ providerId: attempt.providerId, reason: attempt.skipped, label: LABELS[attempt.skipped] || attempt.skipped }))
  }

  get errors () {
    return this.attempts.filter((attempt) => attempt.error).map((attempt) => ({ providerId: attempt.providerId, error: attempt.error }))
  }

  summary () {
    return this.attempts
      .map((attempt) => {
        if (attempt.success) return attempt.providerId + ': SUCCESS'
        if (attempt.skipped) return attempt.providerId + ': SKIPPED (' + attempt.skipped + ')'
        return attempt.providerId + ': ERROR (' + attempt.error + ')'
      })
      .join(' -> ')
  }

  toJSON () {
    return { attempts: this.attempts, summary: this.summary() }
  }
}
