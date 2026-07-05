/* SHADDAI — service worker DISABLED during active dev so edits ALWAYS show.
   Unregisters any existing SW, wipes its caches, and — if a stale SW is still
   controlling this page — does ONE guarded reload so the window drops it and
   loads fresh. Re-enable (register '/sw.js') once the UI is locked in. */
(function () {
  try {
    var hadController = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (k) { caches.delete(k); });
      }).catch(function () {});
    }

    // If an old SW was controlling this page, it just served us a stale copy.
    // Reload ONCE (guarded by sessionStorage) so the next load is SW-free/fresh.
    if (hadController && !sessionStorage.getItem('shd_sw_evicted')) {
      sessionStorage.setItem('shd_sw_evicted', '1');
      setTimeout(function () { location.reload(); }, 300);
    }
  } catch (e) { /* ignore */ }
})();
