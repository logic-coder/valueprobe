import { describe, expect, it } from 'vitest'
import { CircuitBreaker, CircuitState } from '../../src/data/circuit'

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
