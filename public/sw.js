// Minimal service worker required for PWA install prompt.
// Only caches static assets (icons, fonts). Never intercepts page navigation
// or Next.js chunks to avoid stale-cache white-screen issues.

const CACHE_NAME = 'teamclaw-v2'
const CACHEABLE_PATTERN = /\.(png|jpg|jpeg|svg|ico|woff2?)$/
const RUNTIME_ICON_PATTERN = /^\/icons\/runtime-(?:normal|pi)-robot\.png$/

self.addEventListener('install', () => {
  // Activate immediately without waiting for old SW to retire
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Drop old static-asset caches so icon updates are not pinned by previous SWs.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept: navigation, API calls, Next.js chunks, or non-GET
  if (
    event.request.mode === 'navigate' ||
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    RUNTIME_ICON_PATTERN.test(url.pathname)
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
