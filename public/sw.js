// Minimal service worker required for PWA install prompt.
// Uses network-first strategy — no aggressive caching, so the app always
// fetches fresh data. This keeps behaviour identical to a normal web app
// while satisfying the browser's PWA installability check.

const CACHE_NAME = 'teamclaw-v1'

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for old SW to retire
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Claim all open tabs so the SW is active right away
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Network-first: always go to network, fall back to cache only if offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses for offline fallback
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
