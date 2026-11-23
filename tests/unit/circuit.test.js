import { describe, expect, it } from 'vitest'
import { CircuitBreaker, CircuitState } from '../../src/data/circuit'
import { classify, DataError, ErrorCode, RetryClass } from '../../src/data/errors'

const make = () => {
  let clock = 0
  const breaker = new CircuitBreaker({ now: () => clock, failureThreshold: 3, recoveryMs: 1000, halfOpenSuccesses: 2 })
  return { breaker, advance: (ms) => { clock += ms } }
}

describe('circuit breaker', () => {
  it('opens after the failure threshold and blocks the source', () => {
    const { breaker } = make()
    for (let i = 0; i < 3; i++) breaker.recordFailure('edgar')
    expect(breaker.stateOf('edgar')).toBe(CircuitState.OPEN)
    expect(breaker.isAllowed('edgar')).toBe(false)
  })

  it('stays closed below the threshold', () => {
    const { breaker } = make()
    breaker.recordFailure('edgar')
    breaker.recordFailure('edgar')
    expect(breaker.isAllowed('edgar')).toBe(true)
  })

  it('half-opens after the recovery window and closes after enough successes', () => {
    const { breaker, advance } = make()
    for (let i = 0; i < 3; i++) breaker.recordFailure('edgar')
    advance(1000)
    expect(breaker.stateOf('edgar')).toBe(CircuitState.HALF_OPEN)
    breaker.recordSuccess('edgar')
    expect(breaker.stateOf('edgar')).toBe(CircuitState.HALF_OPEN)
    breaker.recordSuccess('edgar')
    expect(breaker.stateOf('edgar')).toBe(CircuitState.CLOSED)
  })

  it('re-opens when a half-open probe fails', () => {
    const { breaker, advance } = make()
    for (let i = 0; i < 3; i++) breaker.recordFailure('edgar')
    advance(1000)
    breaker.isAllowed('edgar')
    breaker.recordFailure('edgar')
    expect(breaker.stateOf('edgar')).toBe(CircuitState.OPEN)
  })

  it('a success resets the failure streak', () => {
    const { breaker } = make()
    breaker.recordFailure('edgar')
    breaker.recordFailure('edgar')
    breaker.recordSuccess('edgar')
    breaker.recordFailure('edgar')
    expect(breaker.isAllowed('edgar')).toBe(true)
  })

  it('snapshots live circuits only', () => {
    const { breaker } = make()
    breaker.recordFailure('x')
    expect(breaker.snapshot().x).toEqual({ state: CircuitState.CLOSED, failures: 1 })
  })
})

describe('live-source failure penalties', () => {
  it('penalises timeouts, 429s, 5xx responses and network errors', () => {
    expect(classify({ code: 'ECONNABORTED' }, 'eastmoney').retryClass).toBe(RetryClass.FAILOVER_WITH_PENALTY)
    expect(classify({ response: { status: 429 } }, 'eastmoney')).toMatchObject({ code: ErrorCode.RATE_LIMITED, retryClass: RetryClass.FAILOVER_WITH_PENALTY })
    expect(classify({ response: { status: 503 } }, 'eastmoney')).toMatchObject({ code: ErrorCode.HTTP, retryClass: RetryClass.FAILOVER_WITH_PENALTY })
    expect(classify({ code: 'ERR_NETWORK' }, 'eastmoney').retryClass).toBe(RetryClass.FAILOVER_WITH_PENALTY)
  })

  it('does not penalise a 404 or an unsupported market', () => {
    expect(classify({ response: { status: 404 } }, 'eastmoney').retryClass).toBe(RetryClass.NEXT_PROVIDER)
    expect(new DataError(ErrorCode.NOT_SUPPORTED, 'eastmoney', 'market').retryClass).toBe(RetryClass.NEXT_PROVIDER)
  })
})
