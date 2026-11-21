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

function compatibleMeta (meta) {
  if (!meta || meta.missing) return null
  if (meta.policyVersion === POLICY_VERSION) return meta
  // A release retry may cross a deployment or rollback. Reload the shell once
  // for this pair rather than seed a trial with another policy's inputs.
  try {
    const key = 'fv-policy-reload:' + POLICY_VERSION + ':' + meta.policyVersion
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      window.location.reload()
    }
  } catch { /* Storage or navigation unavailable. Reject the incompatible data. */ }
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
