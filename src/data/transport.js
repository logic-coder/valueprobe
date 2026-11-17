// How requests reach an upstream: through the dev/preview proxy, directly, or
// through a user-configured CORS gateway.
//
// A static host (GitHub Pages) has no proxy, so every provider declares whether
// its host is browser-safe:
//   corsSafe: true  -> called directly (the host echoes Access-Control-Allow-Origin)
//   corsSafe: false -> needs the gateway; without one it is skipped with a reason.
//
// Query strings belong to the *target*, not to the gateway URL: they are built
// here and folded into the URL before a gateway sees it. Passing them as axios
// params would append them after the gateway URL, where a gateway that only
// reads its own `url` parameter would ignore them.
import { DataError, ErrorCode } from './errors'

const env = import.meta.env || {}
const MODE = env.VITE_TRANSPORT || (env.DEV ? 'proxy' : 'direct')
const GATEWAY = env.VITE_CORS_GATEWAY || ''

/** Deterministic query string, or '' when there is nothing to append. */
export function toQuery (query) {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value))
  }
  const text = params.toString()
  return text ? '?' + text : ''
}

export class Transport {
  constructor ({ mode = MODE, gateway = GATEWAY } = {}) {
    this.mode = mode
    this.gateway = gateway
  }

  /** Absolute URL for one provider endpoint. */
  absolute (provider, path, query) {
    return provider.origin.replace(/\/$/, '') + path + toQuery(query)
  }

  /**
   * @param {{query?: object}} [options] target query string
   * @throws {DataError} when the provider is not reachable under this transport
   */
  url (provider, path, query) {
    if (this.mode === 'proxy') return (provider.proxyPath || '') + path + toQuery(query)
    const absolute = this.absolute(provider, path, query)
    if (provider.corsSafe) return absolute
    if (!this.gateway) {
      throw new DataError(
        ErrorCode.NOT_SUPPORTED,
        provider.id,
        provider.id + ' 需要 CORS 网关（本页为静态托管）',
      )
    }
    return this.gateway.replace('{url}', encodeURIComponent(absolute))
  }
}

export const transport = new Transport()
