// Errors a data source can raise, each carrying how the registry should react.
// Retry taxonomy (docs/DATA_SOURCES.md): each error names which source to try next.

export const RetryClass = {
  /** Bad symbol or validation failure: another provider cannot help. */
  NEVER: 'never',
  /** Transient (429, timeout, 5xx): fail over AND penalise the provider. */
  FAILOVER_WITH_PENALTY: 'failover_with_penalty',
  /** This provider simply has no answer here: try the next one, no penalty. */
  NEXT_PROVIDER: 'next_provider',
  /** Breaker already open. */
  CIRCUIT_OPEN: 'circuit_open',
}

export const ErrorCode = {
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  HTTP: 'HTTP',
  VALIDATION: 'VALIDATION',
  RESOLUTION: 'RESOLUTION',
  NO_DATA: 'NO_DATA',
  RATE_LIMIT_LOCAL: 'RATE_LIMIT_LOCAL',
}

// Terminal: another source cannot fix a bad symbol or a bad payload.
// Timeouts, 429s, 5xx responses and network errors penalise the breaker.
// A 404 or an unsupported market is not a dying host and does not.
const RETRY_BY_CODE = {
  [ErrorCode.VALIDATION]: RetryClass.NEVER,
  [ErrorCode.RESOLUTION]: RetryClass.NEVER,
  [ErrorCode.TIMEOUT]: RetryClass.FAILOVER_WITH_PENALTY,
  [ErrorCode.RATE_LIMITED]: RetryClass.FAILOVER_WITH_PENALTY,
  [ErrorCode.NOT_SUPPORTED]: RetryClass.NEXT_PROVIDER,
  [ErrorCode.NO_DATA]: RetryClass.NEXT_PROVIDER,
  [ErrorCode.NETWORK]: RetryClass.FAILOVER_WITH_PENALTY,
  [ErrorCode.HTTP]: RetryClass.FAILOVER_WITH_PENALTY,
  [ErrorCode.RATE_LIMIT_LOCAL]: RetryClass.CIRCUIT_OPEN,
}

export class DataError extends Error {
  constructor (code, provider, message, extra = {}) {
    super(message || code)
    this.name = 'DataError'
    this.code = code
    this.provider = provider
    this.retryClass = RETRY_BY_CODE[code] || RetryClass.NEXT_PROVIDER
    this.status = extra.status
    this.cause = extra.cause
  }
}

export const notSupported = (provider, operation) => new DataError(ErrorCode.NOT_SUPPORTED, provider, operation + ' not supported')

/** Map an axios/network/validation failure onto the taxonomy. */
export function classify (error, provider) {
  if (error instanceof DataError) return error
  const status = error?.response?.status
  if (status === 429) return new DataError(ErrorCode.RATE_LIMITED, provider, 'rate limited', { status })
  if (status && status >= 500) return new DataError(ErrorCode.HTTP, provider, 'server error ' + status, { status })
  if (status === 404) return new DataError(ErrorCode.NO_DATA, provider, 'not found', { status })
  if (status) return new DataError(ErrorCode.HTTP, provider, 'http ' + status, { status })
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) {
    return new DataError(ErrorCode.TIMEOUT, provider, 'timeout', { cause: error })
  }
  if (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK') {
    return new DataError(ErrorCode.NETWORK, provider, 'network error', { cause: error })
  }
  return new DataError(ErrorCode.NETWORK, provider, error?.message || 'failed', { cause: error })
}
