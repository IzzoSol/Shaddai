/* SHADDAI service worker — minimal, safe. */
const CACHE = 'shaddai-v3-glitch';

// Cache-first only for these static, same-origin asset types.
const STATIC_RE = /\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/i;

self.addEventListener('install', (event) => {
  // Activate this worker as soon as it's finished installing.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET; let the browser deal with everything else.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // CRITICAL: never touch /api/* — always go straight to network (live data + auth).
  if (sameOrigin && url.pathname.startsWith('/api/')) {
    return; // default browser fetch
  }

  // Network-first for navigations (HTML page loads).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (sameOrigin && res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Cache-first for static same-origin assets.
  if (sameOrigin && STATIC_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else: network-first, fall back to cache if offline.
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
