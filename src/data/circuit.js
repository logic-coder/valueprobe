// Per-source circuit breaker: closed -> open after repeated transient failures,
// then half-open probes, then closed again after consecutive successes.
// In-memory by design; a reload starts from a healthy pool.

export const CircuitState = Object.freeze({ CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' })

const FAILURE_THRESHOLD = 5
const RECOVERY_MS = 60_000
const HALF_OPEN_SUCCESSES = 2

export class CircuitBreaker {
  constructor ({ failureThreshold = FAILURE_THRESHOLD, recoveryMs = RECOVERY_MS, halfOpenSuccesses = HALF_OPEN_SUCCESSES, now = () => Date.now() } = {}) {
    this.failureThreshold = failureThreshold
    this.recoveryMs = recoveryMs
    this.halfOpenSuccesses = halfOpenSuccesses
    this.now = now
    this.circuits = new Map()
  }

  circuit (providerId) {
    let circuit = this.circuits.get(providerId)
    if (!circuit) {
      circuit = { state: CircuitState.CLOSED, failures: 0, halfOpenSuccesses: 0, lastFailure: null, healthy: true }
      this.circuits.set(providerId, circuit)
    }
    if (circuit.state === CircuitState.OPEN && this.now() - circuit.lastFailure >= this.recoveryMs) {
      circuit.state = CircuitState.HALF_OPEN
      circuit.halfOpenSuccesses = 0
    }
    return circuit
  }

  stateOf (providerId) {
    return this.circuit(providerId).state
  }

  isAllowed (providerId) {
    return this.circuit(providerId).state !== CircuitState.OPEN
  }

  recordSuccess (providerId) {
    const circuit = this.circuit(providerId)
    circuit.failures = 0
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.halfOpenSuccesses += 1
      if (circuit.halfOpenSuccesses >= this.halfOpenSuccesses) circuit.state = CircuitState.CLOSED
    }
  }

  recordFailure (providerId) {
    const circuit = this.circuit(providerId)
    const now = this.now()
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.state = CircuitState.OPEN
      circuit.lastFailure = now
      return
    }
    circuit.failures += 1
    if (circuit.failures >= this.failureThreshold) {
      circuit.state = CircuitState.OPEN
      circuit.lastFailure = now
    }
  }

  reset (providerId) {
    this.circuits.delete(providerId)
  }

  snapshot () {
    const out = {}
    for (const [providerId, circuit] of this.circuits) out[providerId] = { state: circuit.state, failures: circuit.failures }
    return out
  }
}
