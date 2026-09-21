// Deliberately simple, on purpose — Expo's own PWA guide warns that an aggressive
// service worker can trap users on a stale build with no easy way to update. This one
// never precaches a fixed file list (Metro's JS bundle filename changes every build, so
// a hand-written list would go stale immediately) and never caches anything beyond this
// origin (the Gemini API call is cross-origin and must always hit the network).
//
// Strategy: network-first, falling back to the cache only when the network fails.
// Online, you always get the latest deploy; offline, you get whatever last loaded
// successfully. The cache fills itself the first time each asset is fetched, so the app
// works offline after that first visit, without a separate build step to populate it.
const CACHE_NAME = 'jinote-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match(self.registration.scope)))
  );
});
