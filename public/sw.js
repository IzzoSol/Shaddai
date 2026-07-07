// KILL-SWITCH service worker.
// The previous sw.js was cache-first for JS/CSS/images (and cached navigations), so new builds
// never appeared — everything served stale EXCEPT brand-new file paths (e.g. a new image). This
// version caches nothing, purges every existing cache, unregisters itself, and reloads open pages
// so fresh assets load. After one reload the old worker is gone for good.
self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));   // wipe ALL cached responses
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => { try { c.navigate(c.url); } catch (_) {} });   // reload → fetch fresh
    } catch (_) {}
  })());
});

// Never intercept — always hit the network so nothing is ever served stale.
self.addEventListener('fetch', () => { /* passthrough */ });
