// Committed public-policy artifact: the watchlist, comparison and method pages
// show the numbers the build published (public/data/intrinsic/v1.json) instead
// of recomputing them. Static hosts only read public/data; dev serves the same file.
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
const ARTIFACT_PATH = 'data/intrinsic/v1.json'

let pending = null

const load = async () => {
  try {
    const response = await fetch(BASE + ARTIFACT_PATH)
    if (!response.ok) return null
    const body = await response.json()
    return body?.schema === 1 && typeof body.policyVersion === 'string'
      && typeof body.generatedAt === 'string' && body.entries && !Array.isArray(body.entries)
      && typeof body.entries === 'object' ? body : null
  } catch {
    return null
  }
}

/**
 * The published artifact, fetched once per session. A missing/broken file is an
 * expected state (an older build), so it resolves to null instead of throwing.
 * @returns {Promise<object|null>}
 */
export function getPolicyArtifact () {
  if (!pending) {
    pending = load().then((artifact) => {
      // A failure must not pin the session to "no artifact": a later mount retries.
      if (!artifact) pending = null
      return artifact
    })
  }
  return pending
}

/** One symbol's published entry, or null when the universe does not cover it. */
export function entryOf (artifact, symbol) {
  if (!artifact || typeof artifact !== 'object' || !artifact.entries || !symbol) return null
  const entry = artifact.entries[symbol]
  return entry && typeof entry === 'object' ? entry : null
}
