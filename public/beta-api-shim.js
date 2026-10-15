/* ══════════════════════════════════════════════════════════════════
   SHADDAI · BETA STATIC API SHIM  (beta-api-shim.js)
   The beta preview is a pure static copy, so same-origin /api/* and
   /assets/bot/* would 404 here. This shim rewrites those calls to the
   live SHADDAI backend (r383) so telegram / terminal / paybox / aura /
   signals / world calls all fire against real data on a static host.
   Include EARLY in <head> on every page that talks to the API.
   Self-contained, null-safe, idempotent.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__shdBetaApiShim) return; window.__shdBetaApiShim = true;
  if (!/beta/i.test(location.hostname)) return;   // only the static beta copy proxies /api to the live backend; main serves its own API

  var R383 = 'https://shaddai-g81x.onrender.com';

  // Tag every /api call with the caller's identity (Player Code / signed-in uid)
  // so world's office/gallery/etc. scope to THIS player, never a shared 'local'.
  (function () {
    if (window.__shdFetchScoped || !window.fetch) return; window.__shdFetchScoped = true;
    var _f = window.fetch;
    window.fetch = function (input, init) {
      var url = '', out = input, outInit = init;
      try {
        url = (typeof input === 'string') ? input : (input && input.url) || '';
        var isApi = /^\/api\//.test(url) || url.indexOf(location.origin + '/api/') === 0;
        var isBot = /^\/assets\/bot\//.test(url) || url.indexOf(location.origin + '/assets/bot/') === 0;
        if (isApi || isBot) {
          var rest = url.replace(/^[a-z]+:\/\/[^\/]+/i, '');
          if (isBot) {
            // Bot assets live at /assets/bot/* on the backend too.
          }
          if (typeof input === 'string') { out = R383 + rest; }
          else if (input && input.url) {
            outInit = init || {};
            try { outInit.headers = new Headers(outInit.headers || input.headers || {}); } catch (e) {}
            out = new Request(R383 + rest, outInit);
          }
          if (isApi) {
            outInit = outInit || {};
            try {
              var h = outInit.headers || new Headers();
              if (!(h instanceof Headers)) h = new Headers(h);
              if (!h.has('x-user-id')) {
                var id = ''; try { id = localStorage.getItem('shd_userid') || ''; } catch (e) {}
                if (id) h.set('x-user-id', id);
              }
              outInit.headers = h;
            } catch (e) {}
          }
        }
      } catch (e) {}
      return _f.call(this, out, outInit);
    };
  })();

  // Same-origin WebSocket patch is not needed — the dashboard uses fetch for tg/terminal.
})();
