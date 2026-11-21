import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { peerRow } from '../../src/lib/peers.js'
import { parseSymbol } from '../../src/config/markets.js'

const prefix = 'data/valuation/'
import { POLICY_VERSION } from '../../src/lib/policy.js'
const full = 'public/data/intrinsic/' + POLICY_VERSION + '.json'
const manifest = 'public/data/manifest.json'
const publish = 'public/data/publish.json'

export function policyDelivery (root = process.cwd()) {
  let cached
  const release = () => {
    const raw = readFileSync(resolve(root, full))
    const manifestBytes = readFileSync(resolve(root, manifest))
    const publishBytes = (() => { try { return readFileSync(resolve(root, publish)) } catch { return Buffer.from('{}') } })()
    if (cached?.raw.equals(raw) && cached.manifestBytes.equals(manifestBytes) && cached.publishBytes.equals(publishBytes)) return cached
    const { entries, ...meta } = JSON.parse(raw)
    const { status, batch, generatedAt, upstreamCheckedAt, latestPeriod } = JSON.parse(publishBytes)
    meta.publication = { status, batch, generatedAt, upstreamCheckedAt, latestPeriod }
    const summaries = {}
    for (const [symbol, entry] of Object.entries(entries)) {
      const file = symbol.replace(':', '-') + '.json'
      const stock = JSON.parse(readFileSync(resolve(root, 'public/data', file), 'utf8'))
      const ratios = peerRow(stock, symbol)
      const { name, status, value, price, priceDate, marginOfSafety, reasons, asOf, inputs: { currency } } = entry
      const sameSnapshot = ratios.price === price && stock.as_of === asOf
      summaries[symbol] = { name, status, value, price, priceDate, marginOfSafety, reasons, asOf, inputs: { currency },
        pe: sameSnapshot ? ratios.pe : null, pb: sameSnapshot ? ratios.pb : null }
    }
    // Include the derived representation so URLs also change when its schema changes.
    const id = createHash('sha256').update(raw).update(manifestBytes).update(publishBytes)
      .update(JSON.stringify(summaries)).digest('hex').slice(0, 20)
    cached = { raw, manifestBytes, publishBytes, id, meta: { ...meta, release: id, symbols: Object.keys(entries) }, entries, summaries }
    return cached
  }
  const payload = (d, name) => {
    if (name === 'meta.json') return d.meta
    if (!name.startsWith(d.id + '/')) return null
    name = name.slice(d.id.length + 1)
    if (name === 'summary.json') return { release: d.id, entries: d.summaries }
    const match = /^([A-Z]+)-([A-Z0-9.^-]+)\.json$/.exec(name)
    if (!match) return null
    const parsed = parseSymbol(match[1] + ':' + match[2])
    const entry = parsed.ok && d.entries[parsed.symbol]
    return entry ? { release: d.id, entry } : null
  }
  return {
    name: 'valueprobe-policy-delivery',
    configureServer (server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url.split('?')[0]
        const mount = server.config.base + prefix
        if (!pathname.startsWith(mount)) return next()
        const body = payload(release(), pathname.slice(mount.length))
        res.statusCode = body ? 200 : 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      })
    },
    generateBundle () {
      const d = release()
      const names = ['meta.json', ...['summary.json', ...Object.keys(d.entries).map(s => s.replace(':', '-') + '.json')].map(s => d.id + '/' + s)]
      for (const name of names) this.emitFile({ type: 'asset', fileName: prefix + name, source: JSON.stringify(payload(d, name)) })
    },
  }
}
