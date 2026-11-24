import { parseSymbol } from '../config/markets'
import { POLICY_VERSION } from '../lib/policy'

const base = import.meta.env.BASE_URL + 'data/valuation/'
const pending = new Map()

function read (path, validate) {
  if (!pending.has(path)) {
    const request = fetch(base + path, path === 'meta.json' ? { cache: 'no-cache' } : undefined)
      .then(async response => {
        if (response.status === 404) return { missing: true }
        if (!response.ok) return null
        // Static hosts may serve the SPA shell in place of an unknown JSON path.
        if (response.headers.get('content-type')?.includes('text/html')) return { missing: true }
        return response.json()
      })
      .then(body => {
        if (body?.missing) {
          pending.delete(path)
          return body
        }
        if (validate(body)) return body
        throw new Error('Invalid valuation data')
      })
      .catch(() => {
        pending.delete(path)
        return null
      })
    pending.set(path, request)
  }
  return pending.get(path)
}

export async function getPolicyArtifact () {
  const meta = await getMetadataRequest()
  return compatibleMeta(meta)
}

// A deployment or rollback can leave the shell and the published data on
// different policies. Never reload underneath the reader: an unsaved trial would
// be lost. Announce the mismatch once and let the reader reload when convenient.
const announcedMismatch = new Set()
function compatibleMeta (meta) {
  if (!meta || meta.missing) return null
  if (meta.policyVersion === POLICY_VERSION) return meta
  const pair = POLICY_VERSION + ':' + meta.policyVersion
  if (!announcedMismatch.has(pair)) {
    announcedMismatch.add(pair)
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('fv:policy-mismatch', {
        detail: { expected: POLICY_VERSION, actual: meta.policyVersion },
      }))
    }
  }
  return null
}

export async function getPolicyEntry (symbol) {
  const parsed = parseSymbol(symbol)
  if (!parsed.ok) return { entry: null, meta: null }
  const name = parsed.symbol.replace(':', '-') + '.json'
  return withRelease(async meta => {
    if (!meta.symbols.includes(parsed.symbol)) return { entry: null, meta }
    const body = await read(meta.release + '/' + name, body => body?.release === meta.release && body.entry?.symbol === parsed.symbol)
    return body?.missing ? body : body ? { entry: body.entry, meta } : null
  })
}

export async function getPolicySummary () {
  const body = await withRelease(meta => read(meta.release + '/summary.json',
    body => body?.release === meta.release && body.entries && typeof body.entries === 'object' && !Array.isArray(body.entries)))
  return body?.entries ?? null
}

async function withRelease (load) {
  const metadataRequest = getMetadataRequest()
  const meta = compatibleMeta(await metadataRequest)
  if (!meta) return null
  // Release files are immutable, so a resolved body stays cached; keys from an older
  // release are not, and a reader that outlives a deploy would otherwise keep them.
  for (const key of pending.keys()) if (key !== 'meta.json' && !key.startsWith(meta.release + '/')) pending.delete(key)
  const result = await load(meta)
  if (!result?.missing) return result
  // Deployments can remove the previous release between loading metadata and a resource.
  if (pending.get('meta.json') === metadataRequest) pending.delete('meta.json')
  const current = await getPolicyArtifact()
  if (!current || current.release === meta.release) return null
  const retry = await load(current)
  if (retry?.missing) return null
  return retry
}

function getMetadataRequest () {
  return read('meta.json', body => body?.schema === 1 && /^[a-f0-9]{20}$/.test(body.release) &&
    typeof body.policyVersion === 'string' && typeof body.generatedAt === 'string' && body.universe && body.coverage && Array.isArray(body.symbols))
}
