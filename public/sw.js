// Minimal service worker required for PWA install prompt.
// Only caches static assets (icons, fonts). Never intercepts page navigation
// or Next.js chunks to avoid stale-cache white-screen issues.

const CACHE_NAME = 'teamclaw-v1'
const CACHEABLE_PATTERN = /\.(png|jpg|jpeg|svg|ico|woff2?)$/

self.addEventListener('install', () => {
  // Activate immediately without waiting for old SW to retire
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Claim all open tabs so the SW is active right away
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept: navigation, API calls, Next.js chunks, or non-GET
  if (
    event.request.mode === 'navigate' ||
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/')
  ) {
    return // Let the browser handle it normally
  }

  // Only cache static assets (images, fonts)
  if (CACHEABLE_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
  }
  // All other requests: don't call event.respondWith() → browser handles natively
})
