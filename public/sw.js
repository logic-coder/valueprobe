// Offline shell for the static build: navigations try the network and fall back to
// the cached shell, other same-origin GETs go cache-first. Quarterly snapshots under
// data/ therefore keep working on a plane; live quotes still need the network.
const CACHE = 'valueprobe-shell-v3'
const scopePath = new URL(self.registration.scope).pathname.replace(/\/?$/, '/')
const SHELL = new URL(scopePath + 'index.html', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(new Request(SHELL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => /^valueprobe-shell-v\d+$/.test(key) && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

async function remember (key, response) {
  try {
    const cache = await caches.open(CACHE)
    await cache.put(key, response.clone())
  } catch { /* a full cache should not hide a successful response */ }
  return response
}

async function dataResponse (request, immutable) {
  if (immutable) {
    const cached = await caches.match(request, { cacheName: CACHE })
    if (cached) return cached
  }
  try {
    const response = await fetch(request, immutable ? undefined : { cache: 'no-cache' })
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      return remember(request, response)
    }
    // A removed resource should reach the client so it can reload its release metadata.
    if (response.status < 500) return response
    return (await caches.match(request, { cacheName: CACHE })) || response
  } catch {
    return (await caches.match(request, { cacheName: CACHE })) || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => response.ok ? remember(SHELL, response) : response)
        .catch(async () => (await caches.match(SHELL)) || (await caches.match(request))),
    )
    return
  }

  // Snapshot paths prefer fresh data. The release ID makes valuation details and summaries immutable.
  if (url.pathname.startsWith(scopePath + 'data/')) {
    const immutable = /^data\/valuation\/[a-f0-9]{20}\//.test(url.pathname.slice(scopePath.length))
    event.respondWith(dataResponse(request, immutable))
    return
  }

  event.respondWith(
    caches.match(request, { cacheName: CACHE })
      .then(hit => hit || fetch(request).then(response => response.ok ? remember(request, response) : response)),
  )
})
