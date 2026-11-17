// localStorage with a memory fallback. Private modes and "block all cookies" make
// getItem throw; the app should still boot and keep state for the session.
const memory = new Map()

const store = () => {
  try {
    return window.localStorage
  } catch (error) {
    return null
  }
}

export function readStored (key, fallback = null) {
  const target = store()
  if (target) {
    try {
      const raw = target.getItem(key)
      return raw === null ? fallback : raw
    } catch (error) { /* fall through to memory */ }
  }
  return memory.has(key) ? memory.get(key) : fallback
}

export function writeStored (key, value) {
  memory.set(key, value)
  try { store()?.setItem(key, value) } catch (error) { /* quota or blocked */ }
  return value
}

export function removeStored (key) {
  memory.delete(key)
  try { store()?.removeItem(key) } catch (error) { /* blocked */ }
}
