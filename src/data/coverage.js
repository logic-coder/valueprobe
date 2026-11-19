// Which markets a data source may serve. A provider declares coverage so the
// registry can skip it up front instead of burning a request (docs/DATA_SOURCES.md).

const freeze = (value) => (value ? Object.freeze(value.slice()) : null)

export const Coverage = Object.freeze({
  /** No restriction. */
  global: () => Object.freeze({ markets: null, deny: null, allowUnknown: true }),

  /** Only these markets. */
  of: (markets) => Object.freeze({ markets: freeze(markets), deny: null, allowUnknown: false }),

  /** These markets, and anything outside the whitelist when the caller allows it. */
  ofBestEffort: (markets) => Object.freeze({ markets: freeze(markets), deny: null, allowUnknown: true }),

  /** Everything except these markets. */
  except: (markets) => Object.freeze({ markets: null, deny: freeze(markets), allowUnknown: true }),
})

/** @returns {boolean} whether `market` is inside the coverage. */
export function supports (coverage, market) {
  if (!coverage) return false
  if (coverage.deny && coverage.deny.includes(market)) return false
  if (!coverage.markets) return true
  if (coverage.markets.includes(market)) return true
  return coverage.allowUnknown === true
}

/** Human-readable coverage for diagnostics and settings screens. */
export function describe (coverage) {
  if (!coverage.markets) return coverage.deny ? '除 ' + coverage.deny.join('/') : '全部市场'
  return coverage.markets.join('/')
}
