// Token-bucket limiter, one bucket per source. A source declares its own budget;
// the registry waits for a token instead of hammering the endpoint.

const DEFAULT_RPM = 60
const DEFAULT_BURST = 6

class Bucket {
  constructor (rpm, burst, now) {
    this.capacity = burst
    this.tokens = burst
    this.ratePerMs = rpm / 60_000
    this.updatedAt = now
  }

  refill (now) {
    const elapsed = now - this.updatedAt
    if (elapsed <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerMs)
    this.updatedAt = now
  }
}

export class RateLimiter {
  constructor ({ now = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    this.now = now
    this.sleep = sleep
    this.buckets = new Map()
    this.config = new Map()
  }

  configure (providerId, { requestsPerMinute = DEFAULT_RPM, burst = DEFAULT_BURST } = {}) {
    this.config.set(providerId, { requestsPerMinute: Math.max(1, requestsPerMinute), burst: Math.max(1, burst) })
  }

  bucket (providerId) {
    let bucket = this.buckets.get(providerId)
    if (!bucket) {
      const config = this.config.get(providerId) || { requestsPerMinute: DEFAULT_RPM, burst: DEFAULT_BURST }
      bucket = new Bucket(config.requestsPerMinute, config.burst, this.now())
      this.buckets.set(providerId, bucket)
    }
    return bucket
  }

  tryAcquire (providerId) {
    const bucket = this.bucket(providerId)
    bucket.refill(this.now())
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return true
    }
    return false
  }

  msUntilAvailable (providerId) {
    const bucket = this.bucket(providerId)
    bucket.refill(this.now())
    if (bucket.tokens >= 1) return 0
    return Math.ceil((1 - bucket.tokens) / bucket.ratePerMs)
  }

  /** Wait for a token. True when one was taken, false when the budget is spent. */
  async acquire (providerId, { maxWaitMs = 5_000 } = {}) {
    let waited = 0
    while (!this.tryAcquire(providerId)) {
      const delay = Math.min(this.msUntilAvailable(providerId), maxWaitMs - waited)
      if (delay <= 0 || waited >= maxWaitMs) return false
      await this.sleep(delay)
      waited += delay
    }
    return true
  }

  reset () {
    this.buckets.clear()
  }
}
