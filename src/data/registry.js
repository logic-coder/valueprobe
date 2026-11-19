// The registry that turns a pile of sources into one answer: filter by
// capability and coverage, order by preference, gate on the breaker, meter each
// source, validate, and record every attempt so the UI can explain itself.
//
// Contract (docs/DATA_SOURCES.md): a source that is skipped is *recorded as skipped*,
// never silently dropped.
import { CircuitBreaker } from './circuit'
import { RateLimiter } from './limiter'
import { FetchDiagnostics, SkipReason } from './skip'
import { DataError, ErrorCode, RetryClass, classify } from './errors'
import { supports } from './coverage'
import { pinnedProvider, readPreferences } from './preferences'
import { validateQuote } from './validate'

/** Operations a provider can serve. */
const Operation = Object.freeze({ STOCK: 'stock', QUOTE: 'quote', PROFILE: 'profile', HISTORY: 'history', FINANCIALS: 'financials' })

export class ProviderRegistry {
  constructor ({ providers = [], breaker = new CircuitBreaker(), limiter = new RateLimiter(), preferences = readPreferences, validate = validateQuote } = {}) {
    this.providers = providers
    this.breaker = breaker
    this.limiter = limiter
    this.preferences = preferences
    this.validate = validate
    for (const provider of providers) this.limiter.configure(provider.id, provider.rateLimit)
  }

  /** Ordered eligible providers for one operation, recording skips. */
  eligible (operation, symbol, diagnostics, { preferred, fallbackMode } = {}) {
    const market = String(symbol).split(':')[0]
    const preferences = this.preferences()
    const pinned = preferred || preferences.pinned?.[symbol] || pinnedProvider(symbol)
    const order = preferences.order || []

    const rank = (provider) => {
      if (pinned && provider.id === pinned) return Number.NEGATIVE_INFINITY

      const userIndex = order.indexOf(provider.id)
      return userIndex === -1 ? provider.priority : userIndex
    }

    const eligible = []
    for (const provider of this.providers) {
      // Fallback files wait until live sources have failed. Skipping them here
      // keeps a committed snapshot from hiding a fresher quote.
      // A pin overrides the fallback gate, so the user can force the quarterly file.
      if (fallbackMode === 'primary' && provider.fallback && provider.id !== pinned) continue
      if (fallbackMode === 'fallback' && !provider.fallback) continue
      const capabilities = provider.capabilities || {}
      if (!capabilities[operation]) {
        diagnostics.recordSkip(provider.id, SkipReason.OPERATION_NOT_SUPPORTED)
        continue
      }
      if (!supports(provider.coverage, market)) {
        diagnostics.recordSkip(provider.id, SkipReason.MARKET_NOT_COVERED)
        continue
      }
      if (!this.breaker.isAllowed(provider.id)) {
        diagnostics.recordSkip(provider.id, SkipReason.CIRCUIT_OPEN)
        continue
      }
      eligible.push(provider)
    }
    return eligible.sort((left, right) => rank(left) - rank(right))
  }

  /**
   * Run one operation against the ordered candidates.
   * @param {string} operation
   * @param {string} symbol
   * @param {(provider:object) => Promise<any>} run
   */
  async execute (operation, symbol, run, options = {}) {
    const diagnostics = new FetchDiagnostics()
    const candidates = this.eligible(operation, symbol, diagnostics, options)
    if (!candidates.length) throw new DataError(ErrorCode.NO_DATA, 'registry', '没有可用的数据源（' + operation + '）')

    let lastError = null
    for (const provider of candidates) {
      await this.limiter.acquire(provider.id)
      try {
        const value = await run(provider)
        if (value == null) {
          diagnostics.recordError(provider.id, 'empty result')
          continue
        }
        if (operation === Operation.QUOTE) {
          // A source that is honest about being quarterly says how old its quotes may
          // be; the validator's week-long default would otherwise reject it.
          const problem = this.validate({ ...value, provider: provider.id }, { maxAgeMs: provider.maxQuoteAgeMs })
        if (problem) {
          // A bad payload is not a healthy response. Recording success here kept
          // a source that only returns junk at the front of every later attempt.
          diagnostics.recordError(provider.id, problem.message)
          lastError = problem
          continue
        }
        }
        this.breaker.recordSuccess(provider.id)
        diagnostics.recordSuccess(provider.id)
        return { value, provider: provider.id, diagnostics }
      } catch (error) {
        const dataError = classify(error, provider.id)
        // "Not my market / not my filings" is a skip. Recording it as an error made
        // a normal US handoff (quote here, filings there) look like every source failed.
        if (dataError.code === ErrorCode.NOT_SUPPORTED) diagnostics.recordSkip(provider.id, SkipReason.OPERATION_NOT_SUPPORTED)
        else diagnostics.recordError(provider.id, dataError.message)
        if (dataError.retryClass === RetryClass.NEVER) throw dataError
        if (dataError.retryClass === RetryClass.FAILOVER_WITH_PENALTY) this.breaker.recordFailure(provider.id)
        lastError = dataError
      }
    }
    throw lastError || new DataError(ErrorCode.NO_DATA, 'registry', '所有数据源都失败（' + operation + '）')
  }

  fetchStock (symbol, options) {
    return this.execute(Operation.STOCK, symbol, (provider) => provider.fetchStock(symbol), options)
  }

  fetchQuote (symbol, options) {
    return this.execute(Operation.QUOTE, symbol, (provider) => provider.fetchQuote(symbol), options)
  }

  fetchProfile (symbol, options) {
    return this.execute(Operation.PROFILE, symbol, (provider) => provider.fetchProfile(symbol), options)
  }

  fetchHistory (symbol, indicator, options) {
    return this.execute(Operation.HISTORY, symbol, (provider) => provider.fetchHistory(symbol, indicator), options)
  }

  fetchFinancials (symbol, view, params, options) {
    return this.execute(Operation.FINANCIALS, symbol, (provider) => provider.fetchFinancials(symbol, view, params), options)
  }

  /**
   * The quarterly file, and only that file. A missing file fails fast so a dead
   * quote host is never asked twice for a symbol we already have on disk.
   */
  async readSnapshot (symbol) {
    const provider = this.providers.find((item) => item.id === 'snapshot')
    if (!provider?.fetchStock) throw new DataError(ErrorCode.NO_DATA, 'registry', '没有季度快照')
    const diagnostics = new FetchDiagnostics()
    await this.limiter.acquire(provider.id)
    try {
      const value = await provider.fetchStock(symbol)
      if (value == null) throw new DataError(ErrorCode.NO_DATA, provider.id, 'empty result')
      this.breaker.recordSuccess(provider.id)
      diagnostics.recordSuccess(provider.id)
      return { value, provider: provider.id, diagnostics }
    } catch (error) {
      const dataError = classify(error, provider.id)
      diagnostics.recordError(provider.id, dataError.message)
      if (dataError.retryClass === RetryClass.FAILOVER_WITH_PENALTY) this.breaker.recordFailure(provider.id)
      throw dataError
    }
  }

  /**
   * Full stock record. The local file answers first. A live host is only asked
   * when that file is missing, and a timed-out quote is not requested again.
   */
  async fetchStockRecord (symbol, options = {}) {
    const pinned = options.preferred || this.preferences().pinned?.[symbol] || pinnedProvider(symbol)
    const wantFile = options.snapshotOnly === true || !pinned || pinned === 'snapshot'
    if (wantFile) {
      try {
        return await this.readSnapshot(symbol)
      } catch (error) {
        if (options.snapshotOnly || pinned === 'snapshot' || error?.retryClass === RetryClass.NEVER) throw error
      }
    }
    const merge = async () => {
      const [quote, profile] = await Promise.all([
        this.fetchQuote(symbol, { ...options, fallbackMode: 'primary' }),
        this.fetchProfile(symbol, { ...options, fallbackMode: 'primary' }),
      ])
      const diagnostics = new FetchDiagnostics()
      diagnostics.attempts.push(...quote.diagnostics.attempts, ...profile.diagnostics.attempts)
      const merged = {
        ...profile.value,
        ...quote.value,
        symbol: symbol.split(':')[1],
        exchange_: profile.value.exchange_ || quote.value.market || symbol.split(':')[0],
        company: profile.value.company || quote.value.name,
        price: String(quote.value.price),
        currency: quote.value.currency || profile.value.currency,
        _partial: false,
        _as_of: quote.value._as_of || profile.value._as_of || null,
        _sources: [quote.provider, profile.provider],
      }
      return { value: merged, provider: quote.provider + '+' + profile.provider, diagnostics }
    }
    const deadHost = (error) => error?.code === ErrorCode.TIMEOUT || error?.code === ErrorCode.NETWORK || error?.code === ErrorCode.HTTP
    try {
      return await this.fetchStock(symbol, { ...options, fallbackMode: 'primary' })
    } catch (error) {
      if (error?.retryClass === RetryClass.NEVER) throw error
      let failure = error
      // A quote that already timed out will time out again. Skip that second wait.
      // A source that answered the price but not the filings still gets merged.
      if (!deadHost(error)) {
        try {
          return await merge()
        } catch (mergeError) {
          if (mergeError?.retryClass === RetryClass.NEVER) throw mergeError
          failure = mergeError
        }
      }
      if (wantFile) throw failure
      const snap = await this.readSnapshot(symbol)
      snap.diagnostics.attempts.unshift({
        providerId: failure?.provider || 'live',
        skipped: null,
        error: String(failure?.message || 'live source failed'),
        success: false,
      })
      return snap
    }
  }

  snapshot () {
    return { circuits: this.breaker.snapshot(), providers: this.providers.map((provider) => provider.id) }
  }
}
