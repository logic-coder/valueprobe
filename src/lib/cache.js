// Namespaced localStorage cache with TTL and stale reads (per-symbol data snapshots).
const PREFIX = 'fv-cache:'

const store = () => {
  try {
    return window.localStorage
  } catch (error) {
    return null
  }
}

export function put (key, value, ttlMs) {
  const target = store()
  if (!target) return
  const record = { v: value, t: Date.now(), ttl: ttlMs || 0 }
  try {
    target.setItem(PREFIX + key, JSON.stringify(record))
  } catch (error) {
    // quota exceeded — drop the oldest entry and retry once
    const keys = Object.keys(target).filter((name) => name.startsWith(PREFIX))
    if (keys.length) target.removeItem(keys[0])
    try { target.setItem(PREFIX + key, JSON.stringify(record)) } catch (e) { /* ignore */ }
  }
}

export function read (key) {
  const target = store()
  if (!target) return null
  try {
    const raw = target.getItem(PREFIX + key)
    if (!raw) return null
    const record = JSON.parse(raw)
    if (!record || typeof record.t !== 'number') return null
    const expired = Boolean(record.ttl) && Date.now() - record.t > record.ttl
    return { value: record.v, savedAt: record.t, expired }
  } catch (error) {
    return null
  }
}

/** Fresh value only, null when expired or absent. */
export function getFresh (key) {
  const record = read(key)
  return record && !record.expired ? record.value : null
}

/** Any value (fresh or expired) plus its timestamp. */
export function getAny (key) {
  const record = read(key)
  return record ? { value: record.value, savedAt: record.savedAt, expired: record.expired } : null
}

export function remove (key) {
  store()?.removeItem(PREFIX + key)
}
