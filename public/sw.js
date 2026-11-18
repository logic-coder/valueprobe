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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(SHELL, copy)).catch(() => {})
          }
          return response
        })
        .catch(async () => (await caches.match(SHELL)) || (await caches.match(request))),
    )
    return
  }

  // Quarterly snapshots keep the same URL across deploys, so read through the network
  // and only fall back to the cached copy when it is offline.
  if (url.pathname.startsWith(scopePath + 'data/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          }
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
      }
      return response
    })),
  )
})
