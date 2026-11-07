/* ══════════════════════════════════════════════════════════════════
   SHADDAI — TIER STATE + PRO GATE  (shd-tier.js)
   Single source of truth for a visitor's plan state:

     mode: 'guest'  — not signed in (teaser: SHDFree caps apply)
           'free'   — signed in, free plan (unlimited core; Pro grayed)
           'pro'    — signed in, paid plan (alpha/builder/pro/elite …)

   Detection:
     signed-in = Firebase user (SHD_AUTH) OR a non-guest shd_userid.
     plan      = GET /api/billing/subscription (x-user-id + Bearer token
                 when available), cached in sessionStorage for 60s.

   API:
     SHDTier.state()                    → { mode, signedIn, tier, plan } (sync, cached)
     SHDTier.refresh()                  → Promise<state> (authoritative, cached)
     SHDTier.isPro() / isSignedIn()     → bool
     SHDTier.gatePro(feature, cb)       → run cb if Pro; else show upsell
     SHDTier.upsell(feature)            → show the Pro upsell overlay
     SHDTier.applyGating()              → auto-lock [data-pro] elements (gray + 🔒)
     SHDTier.onAuthChange()             → call after sign-in/sign-out to re-resolve

   Mark any element with data-pro="<feature name>" and it will be grayed
   out (with a 🔒 chip) for guests and free users, and its click will open
   the upsell instead of doing its normal thing. Pro users are untouched.
   Self-contained, no deps.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SHDTier) return;

  var CACHE_KEY = 'shd_tier_cache';
  var CACHE_TTL = 60000;                 // 1 min — long enough for a page visit
  var HOOK_ID   = 'shdProHook';

  // Tiers that count as "paid". 'builder' is the legacy paid plan id.
  var PAID = { pro: 1, alpha: 1, elite: 1, builder: 1, premium: 1 };

  /* ── identity ─────────────────────────────────────────────────── */

  function firebaseUid() {
    try { if (window.SHD_AUTH && SHD_AUTH.user && SHD_AUTH.user.uid) return SHD_AUTH.user.uid; } catch (e) {}
    return null;
  }
  function localUid() {
    try { var u = localStorage.getItem('shd_userid'); if (u && u.indexOf('guest') !== 0 && u !== 'local') return u; } catch (e) {}
    return null;
  }
  function uid() { return firebaseUid() || localUid(); }
  function bearer() {
    try { if (window.SHD_AUTH && SHD_AUTH.token) return SHD_AUTH.token; } catch (e) {}
    return null;
  }
  function signedIn() { return !!uid(); }

  /* ── cache ────────────────────────────────────────────────────── */

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.ts && Date.now() - c.ts < CACHE_TTL && c.data) return c.data;
    } catch (e) {}
    return null;
  }
  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {}
  }

  /* ── plan fetch ───────────────────────────────────────────────── */

  function guestState() {
    return { mode: 'guest', signedIn: false, tier: 'free', plan: null, source: 'local' };
  }

  function fetchPlan() {
    return new Promise(function (resolve) {
      var u = uid();
      if (!u) return resolve(guestState());
      var cached = readCache();
      if (cached) return resolve(cached);

      var headers = { 'x-user-id': u, 'Accept': 'application/json' };
      var tok = bearer();
      if (tok) headers['Authorization'] = 'Bearer ' + tok;

      fetch('/api/billing/subscription', { headers: headers, signal: AbortSignal.timeout(7000) })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          var sub = (d && d.subscription) || d || {};
          var tier = (sub.tier || (sub.customer && sub.customer.tier) || 'free') + '';
          tier = tier.toLowerCase().trim();
          var paid = !!PAID[tier];
          var out = {
            mode: paid ? 'pro' : 'free',
            signedIn: true,
            tier: tier,
            plan: sub,
            source: 'api'
          };
          writeCache(out);
          resolve(out);
        })
        .catch(function () {
          // Network/5xx — assume signed-in free rather than degrading the visitor to guest.
          resolve({ mode: 'free', signedIn: true, tier: 'free', plan: null, source: 'fallback', error: true });
        });
    });
  }

  /* ── upsell overlay ───────────────────────────────────────────── */

  function upsellCss() {
    var css = document.createElement('style');
    css.id = 'shdTierCss';
    css.textContent =
      '#shdProHook{position:fixed;inset:0;z-index:100060;display:none;place-items:center;background:rgba(6,4,16,.88);backdrop-filter:blur(8px);font-family:"Chakra Petch","IBM Plex Mono",sans-serif}' +
      '#shdProHook.on{display:grid}' +
      '#shdProHook .c{max-width:430px;text-align:center;padding:28px 26px;border:1px solid rgba(196,162,78,.45);border-radius:16px;background:linear-gradient(160deg,#180f38,#0a0518);color:#efe9ff;box-shadow:0 0 60px rgba(196,162,78,.28)}' +
      '#shdProHook h2{font-family:"Space Grotesk","Cinzel",sans-serif;font-size:22px;margin:0 0 8px;background:linear-gradient(90deg,#e8c45c,#00ff9c);-webkit-background-clip:text;background-clip:text;color:transparent}' +
      '#shdProHook p{color:#9a86c8;font-size:13px;line-height:1.55;margin:0 0 18px}' +
      '#shdProHook button{font-family:"Space Grotesk","Cinzel",sans-serif;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(100deg,#e8c45c,#00ff9c);color:#0b0416}' +
      '#shdProHook .x{background:none;border:1px solid rgba(196,162,78,.4);color:#9a86c8;margin-left:8px}' +
      /* locked-element style for [data-pro] gating */
      '.shd-locked{position:relative;filter:grayscale(1) opacity(.55) !important;cursor:not-allowed !important;}' +
      '.shd-locked::after{content:"🔒 Pro";position:absolute;top:6px;right:6px;z-index:3;font-family:"IBM Plex Mono",monospace;font-size:9px;font-weight:600;letter-spacing:.12em;color:#0b0416;background:linear-gradient(100deg,#e8c45c,#00ff9c);padding:2px 7px;border-radius:100px;}' +
      '.shd-locked-wrap{position:relative;pointer-events:none}' +
      '.shd-locked-wrap .shd-locked{pointer-events:none}' +
      '.shd-locked-btn{pointer-events:auto !important;cursor:pointer !important;}';
    document.head.appendChild(css);
  }

  function upsell(feature) {
    var name = feature || 'this';
    var isIn = signedIn();
    var ex = document.getElementById(HOOK_ID);
    if (ex) {
      ex.querySelector('.shdProMsg').innerHTML = msg(name, isIn);
      ex.querySelector('.shdProPri').textContent = isIn ? 'Upgrade to Pro — $30/mo →' : 'Sign in first →';
      ex.classList.add('on');
      return;
    }
    upsellCss();
    var d = document.createElement('div');
    d.id = HOOK_ID;
    d.innerHTML =
      '<div class="c">' +
      '<h2>🔒 ' + name + ' is a Pro feature</h2>' +
      '<p class="shdProMsg"></p>' +
      '<button class="shdProPri">' + (isIn ? 'Upgrade to Pro — $30/mo →' : 'Sign in first →') + '</button>' +
      '<button class="x shdProX">Maybe later</button>' +
      '</div>';
    d.querySelector('.shdProMsg').innerHTML = msg(name, isIn);
    document.body.appendChild(d);
    d.querySelector('.shdProPri').onclick = function () {
      if (isIn) { if (window.shdPlans) { d.classList.remove('on'); shdPlans.open(); } else location.href = '/?plans=1'; }
      else { try { if (window.shdSignIn) shdSignIn(); else location.href = '/dashboard'; } catch (e) { location.href = '/dashboard'; } }
    };
    d.querySelector('.shdProX').onclick = function () { d.classList.remove('on'); };
    d.classList.add('on');
  }

  function msg(name, isIn) {
    if (!isIn) {
      return 'Sign in to keep your work and unlock more — then upgrade to Pro to use <b style="color:#efe9ff">' + name + '</b>.';
    }
    return '<b style="color:#efe9ff">' + name + '</b> is included in Pro — one flat $30/mo: SHADDAI MCP, premium brains, workflow chains, media generation &amp; priority compute.';
  }

  /* ── data-pro gating ──────────────────────────────────────────── */

  function isPro(s) { return s && s.mode === 'pro'; }

  function applyGating() {
    var els = document.querySelectorAll('[data-pro]');
    if (!els.length) return;
    var s = state();
    if (isPro(s)) return;                 // Pro users see everything live
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.getAttribute('data-pro-done')) continue;
      el.setAttribute('data-pro-done', '1');
      el.classList.add('shd-locked');
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        upsell(this.getAttribute('data-pro') || 'this feature');
      }, true);
    }
  }

  /* ── public API ───────────────────────────────────────────────── */

  var _last = null;

  window.SHDTier = {
    state: function () {
      if (_last) return _last;
      if (!signedIn()) { _last = guestState(); return _last; }
      return readCache() || { mode: 'free', signedIn: true, tier: 'free', plan: null, source: 'cache-miss' };
    },
    refresh: function () {
      return fetchPlan().then(function (s) { _last = s; return s; });
    },
    isPro: function () { return isPro(window.SHDTier.state()); },
    isSignedIn: function () { return signedIn(); },
    gatePro: function (feature, cb) {
      if (isPro(window.SHDTier.state())) { if (cb) cb(); return true; }
      upsell(feature);
      return false;
    },
    upsell: upsell,
    applyGating: applyGating,
    onAuthChange: function () { _last = null; try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {} return fetchPlan().then(function (s) { _last = s; return s; }); }
  };

  // Auto-lock [data-pro] elements once the DOM is ready; re-resolve after auth settles.
  function fireReady(s) {
    try { window.dispatchEvent(new CustomEvent('shdTierReady', { detail: s })); } catch (e) {}
  }
  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { window.SHDTier.applyGating(); });
    } else {
      window.SHDTier.applyGating();
    }
    window.SHDTier.refresh().then(function (s) { window.SHDTier.applyGating(); fireReady(s); });
  }
  try { boot(); } catch (e) {}
})();
