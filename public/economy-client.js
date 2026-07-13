/* ============================================================================
 * SHADDAI · economy-client.js — "Fastest First Dollar" paywall (window.Economy)
 * ----------------------------------------------------------------------------
 * Self-contained, additive, ONE <script> include. Exposes window.Economy:
 *   getBalance()            → GET  /api/economy/balance         (Sparks; hides on 404)
 *   renderSparks(el)        → paint the user's Sparks balance chip into `el`
 *   getEntitlement()        → GET  /api/sub-billing/entitlement/:id → {tier,active} (cached)
 *   gate({el,result,...})   → the value-moment paywall: blur a FINISHED output for a
 *                             FREE user over the free limit; premium card w/ 2 buttons:
 *                               ⬡ Unlock this output — $2.99  → POST /api/sub-billing/checkout/unlock
 *                               Go Pro — $29.99/mo             → POST /api/sub-billing/checkout/subscribe
 *                             → redirect to returned Stripe Checkout url; reveal on return.
 *   goProChip(opts)         → small reusable "⬡ GO PRO" upsell chip element.
 *   freeUsed()/markFreeUse()→ client-side daily free-count (localStorage; server later).
 *
 * Currency is ALWAYS "Sparks" (never gold/coin/currency). Paid tiers
 * (pro/builder/creator/alpha) are NEVER gated. If billing/economy endpoints are
 * not live yet, everything DEGRADES to a soft "⬡ GO PRO" chip — no hard block,
 * no thrown errors, no console spam. Scoped under `.eco-*`; injects its own CSS.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.Economy) return;

  var PAID = { pro:1, builder:1, creator:1, alpha:1, founder:1, genesis:1 };
  var FREE_DAILY_LIMIT = 1;         // free tier: 1 watermarked output/day
  var PRICE_UNLOCK = '$2.99';
  var PRICE_PRO = '$29.99/mo';
  var LS_COUNT = 'shaddai_free_count_v1';
  var LS_UNLOCKED = 'shaddai_unlocked_v1';   // outputs unlocked on this device

  /* ---------- tiny helpers (never throw) ---------- */
  function uid() {
    try { return (window.S && S.user && (S.user.id || S.user.email)) || 'demo'; }
    catch (e) { return 'demo'; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function jget(u) {
    return fetch(u, { signal: safeTimeout(6000) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function jpost(u, body) {
    return fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: safeTimeout(12000)
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function safeTimeout(ms) { try { return AbortSignal.timeout(ms); } catch (e) { return undefined; } }
  function today() { return new Date().toISOString().slice(0, 10); }
  function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- one-time CSS ---------- */
  function injectCss() {
    if (document.getElementById('ecoCss')) return;
    var s = document.createElement('style'); s.id = 'ecoCss';
    s.textContent = [
      ".eco-wrap{position:relative}",
      ".eco-locked{filter:blur(11px) saturate(.6) brightness(.7);pointer-events:none;user-select:none;transform:scale(1.02);transition:filter .5s ease}",
      ".eco-reveal .eco-locked{filter:none;pointer-events:auto;transform:none}",
      /* overlay card */
      ".eco-gate{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:16px;border-radius:12px;background:radial-gradient(120% 90% at 50% 0%,rgba(0,229,136,.10),transparent 60%),linear-gradient(180deg,rgba(4,8,14,.72),rgba(2,4,9,.86));backdrop-filter:blur(2px);animation:ecoIn .45s cubic-bezier(.2,.8,.2,1) both;font-family:'Rajdhani','Chakra Petch',sans-serif}",
      "@keyframes ecoIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
      ".eco-card{position:relative;width:min(360px,100%);border-radius:16px;padding:20px 18px 18px;text-align:center;color:#e7fff4;background:linear-gradient(180deg,rgba(10,20,26,.96),rgba(4,8,13,.98));border:1px solid rgba(0,229,136,.35);box-shadow:0 30px 90px rgba(0,0,0,.6),inset 0 0 60px rgba(0,229,136,.05);overflow:hidden}",
      ".eco-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00ff88,#00E5FF,transparent);filter:drop-shadow(0 0 6px #00ff88);animation:ecoSweep 4.5s linear infinite}",
      "@keyframes ecoSweep{0%{transform:translateX(-45%);opacity:0}12%,88%{opacity:.9}100%{transform:translateX(45%);opacity:0}}",
      ".eco-lock{width:52px;height:52px;margin:0 auto 10px;border-radius:14px;display:grid;place-items:center;background:radial-gradient(circle at 40% 30%,rgba(0,229,136,.34),rgba(0,229,136,.05));border:1px solid rgba(0,229,136,.5);box-shadow:0 0 26px rgba(0,229,136,.35)}",
      ".eco-lock svg{width:26px;height:26px;stroke:#00ff88;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 5px rgba(0,229,136,.7))}",
      ".eco-ttl{font-family:'Orbitron','Rajdhani',sans-serif;font-weight:800;font-size:15px;letter-spacing:.5px;color:#fff;text-shadow:0 0 16px rgba(0,229,136,.55);margin:2px 0 4px}",
      ".eco-sub{font-size:11px;line-height:1.5;color:rgba(231,255,244,.6);margin:0 0 15px}",
      ".eco-btn{display:block;width:100%;box-sizing:border-box;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;letter-spacing:.5px;border-radius:11px;padding:12px 14px;font-size:13px;transition:transform .12s ease,box-shadow .2s ease;border:1px solid transparent}",
      ".eco-btn:active{transform:translateY(1px)}",
      ".eco-btn.primary{color:#02150c;background:linear-gradient(135deg,#00ff88,#00E5FF);box-shadow:0 8px 26px rgba(0,229,136,.4)}",
      ".eco-btn.primary:hover{box-shadow:0 10px 34px rgba(0,229,160,.6)}",
      ".eco-btn.ghost{margin-top:9px;color:#00E5FF;background:rgba(0,229,255,.06);border-color:rgba(0,229,255,.4)}",
      ".eco-btn.ghost:hover{background:rgba(0,229,255,.13)}",
      ".eco-btn small{display:block;font-weight:600;font-size:9.5px;letter-spacing:.6px;opacity:.8;margin-top:2px}",
      ".eco-fine{margin-top:11px;font-size:8.5px;letter-spacing:.8px;color:rgba(231,255,244,.32);text-transform:uppercase}",
      ".eco-x{position:absolute;top:8px;right:10px;cursor:pointer;color:rgba(231,255,244,.4);font-size:15px;line-height:1;background:none;border:none}",
      ".eco-x:hover{color:#fff}",
      /* GO PRO chip */
      ".eco-chip{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;letter-spacing:.6px;font-size:10px;padding:6px 12px;border-radius:20px;color:#02150c;background:linear-gradient(135deg,#00ff88,#00E5FF);border:none;box-shadow:0 4px 16px rgba(0,229,136,.35);transition:transform .12s ease,box-shadow .2s ease}",
      ".eco-chip:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(0,229,160,.55)}",
      ".eco-chip.subtle{color:#00ff88;background:rgba(0,229,136,.08);border:1px solid rgba(0,229,136,.4);box-shadow:none}",
      ".eco-chip.subtle:hover{background:rgba(0,229,136,.16)}",
      /* Sparks balance chip */
      ".eco-sparks{display:inline-flex;align-items:center;gap:6px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;letter-spacing:.4px;color:#00ff88;padding:4px 11px;border-radius:20px;background:rgba(0,229,136,.07);border:1px solid rgba(0,229,136,.3)}",
      ".eco-sparks b{color:#fff;font-weight:800}",
      ".eco-busy{opacity:.6;pointer-events:none}"
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  var LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4" fill="#00ff88" stroke="none"/></svg>';

  /* ================= entitlement (cached) ================= */
  var _entCache = null, _entAt = 0;
  function getEntitlement() {
    var now = Date.now();
    if (_entCache && (now - _entAt) < 60000) return Promise.resolve(_entCache);
    return jget('/api/sub-billing/entitlement/' + encodeURIComponent(uid())).then(function (d) {
      var ent = (d && typeof d.tier === 'string')
        ? { tier: String(d.tier).toLowerCase(), active: d.active !== false }
        : { tier: 'free', active: false };
      _entCache = ent; _entAt = Date.now();
      return ent;
    });
  }
  function isPaid(ent) { return !!(ent && PAID[ent.tier] && ent.active); }

  /* ================= Sparks balance ================= */
  function getBalance() {
    return jget('/api/economy/balance?userId=' + encodeURIComponent(uid())).then(function (d) {
      if (!d) return null;
      var n = (typeof d.sparks_balance === 'number') ? d.sparks_balance
            : (typeof d.sparks === 'number') ? d.sparks
            : (typeof d.balance === 'number') ? d.balance : null;
      return (n == null) ? null : n;
    });
  }
  function renderSparks(el) {
    if (!el) return;
    injectCss();
    getBalance().then(function (n) {
      if (n == null) { el.innerHTML = ''; el.style.display = 'none'; return; } // hide gracefully
      el.style.display = '';
      el.innerHTML = '<span class="eco-sparks">⬡ <b>' + esc(n.toLocaleString()) + '</b> Sparks</span>';
    });
  }

  /* ================= free-tier daily counter ================= */
  function _countRec() {
    var r = readJSON(LS_COUNT, null);
    if (!r || r.day !== today()) r = { day: today(), n: 0 };
    return r;
  }
  function freeUsed() { return _countRec().n; }
  function overFreeLimit() { return freeUsed() >= FREE_DAILY_LIMIT; }
  function markFreeUse() { var r = _countRec(); r.n += 1; writeJSON(LS_COUNT, r); return r.n; }

  function _unlockedSet() { return readJSON(LS_UNLOCKED, {}); }
  function isUnlocked(key) { return key && !!_unlockedSet()[key]; }
  function markUnlocked(key) { if (!key) return; var s = _unlockedSet(); s[key] = Date.now(); writeJSON(LS_UNLOCKED, s); }

  /* On return from a successful Stripe unlock (?unlock=<key> or ?eco_unlock=1) */
  (function handleReturn() {
    try {
      var q = new URLSearchParams(location.search);
      var k = q.get('unlock') || q.get('eco_unlock');
      if (k && k !== '1') markUnlocked(k);
      if (q.get('pro') === '1' || q.get('subscribe') === 'success') { _entCache = null; _entAt = 0; }
    } catch (e) {}
  })();

  /* ================= checkout redirect ================= */
  function checkout(kind, meta) {
    var ret = location.origin + location.pathname;
    var url = kind === 'unlock' ? '/api/sub-billing/checkout/unlock' : '/api/sub-billing/checkout/subscribe';
    // Match the backend contract exactly: unlock needs {item, priceCents, label}; subscribe needs {tier}.
    // successUrl/cancelUrl are sent as harmless extras (backend ignores what it doesn't use).
    var body = kind === 'unlock'
      ? { userId: uid(),
          item: (meta && meta.key) || (meta && meta.product) || 'clip',
          priceCents: 299,                                   // $2.99 per-deliverable unlock
          label: (meta && meta.label) || 'Unlock output',
          successUrl: ret + '?unlock=' + encodeURIComponent((meta && meta.key) || '1'),
          cancelUrl: ret }
      : { userId: uid(),
          tier: (meta && meta.tier) || 'pro',                // "Go Pro" = $29.99/mo
          successUrl: ret + '?pro=1',
          cancelUrl: ret };
    return jpost(url, body).then(function (d) {
      var to = d && (d.url || d.checkoutUrl || d.sessionUrl);
      if (to) { location.href = to; return true; }
      return false;   // endpoint not live / no url → caller degrades
    });
  }

  /* ================= the paywall ================= */
  /* opts: { el (required container), key (stable output id), product, label,
   *         onReveal, force (skip limit check → always gate for demo) }         */
  function gate(opts) {
    opts = opts || {};
    var el = opts.el;
    if (!el || !el.nodeType) return Promise.resolve(false);
    injectCss();

    var key = opts.key || ('out_' + Math.random().toString(36).slice(2));
    // Already paid for this specific output on this device → reveal.
    if (isUnlocked(key)) return Promise.resolve(false);

    return getEntitlement().then(function (ent) {
      // Paid users: never gate.
      if (isPaid(ent)) return false;
      // Free user, still within daily allowance (and not forced): let it through, count it.
      if (!opts.force && !overFreeLimit()) { markFreeUse(); return false; }
      // Otherwise → paywall this output.
      _applyGate(el, key, opts);
      return true;
    });
  }

  function _applyGate(el, key, opts) {
    if (el.querySelector('.eco-gate')) return; // idempotent
    // Wrap existing content so we can blur it behind the card.
    if (!el.classList.contains('eco-wrap')) el.classList.add('eco-wrap');
    Array.prototype.forEach.call(el.children, function (c) { c.classList && c.classList.add('eco-locked'); });

    var card = document.createElement('div');
    card.className = 'eco-gate';
    var label = opts.label ? esc(opts.label) : 'your output';
    card.innerHTML =
      '<div class="eco-card" role="dialog" aria-label="Unlock output">' +
        '<button class="eco-x" title="Close">✕</button>' +
        '<div class="eco-lock">' + LOCK_SVG + '</div>' +
        '<div class="eco-ttl">READY — LOCKED</div>' +
        '<div class="eco-sub">Your ' + label + ' is finished and waiting. ' +
          'Unlock it or go unlimited.</div>' +
        '<button class="eco-btn primary" data-act="unlock">⬡ Unlock this output <small>' + PRICE_UNLOCK + ' · one-time · watermark-free</small></button>' +
        '<button class="eco-btn ghost" data-act="pro">Go Pro <small>' + PRICE_PRO + ' · unlimited · HD · no watermark</small></button>' +
        '<div class="eco-fine">Powered by Stripe · secure checkout</div>' +
      '</div>';
    el.appendChild(card);

    function reveal() {
      markUnlocked(key);
      el.classList.add('eco-reveal');
      Array.prototype.forEach.call(el.querySelectorAll('.eco-locked'), function (c) { c.classList.remove('eco-locked'); });
      var g = el.querySelector('.eco-gate'); if (g) g.remove();
      try { if (typeof opts.onReveal === 'function') opts.onReveal(); } catch (e) {}
    }
    function degrade() {
      // Endpoint not live → don't hard-block. Reveal + drop a soft GO PRO chip.
      reveal();
      var chip = goProChip({ subtle: true, label: '⬡ GO PRO' });
      chip.style.marginTop = '8px';
      el.insertBefore(chip, el.firstChild);
    }

    card.querySelector('.eco-x').onclick = function () {
      var g = el.querySelector('.eco-gate'); if (g) g.remove();
      var chip = goProChip({ subtle: true, label: '⬡ Unlock — ' + PRICE_UNLOCK });
      chip.style.marginTop = '8px';
      chip.onclick = function () { _applyGate(el, key, opts); };
      el.insertBefore(chip, el.firstChild);
    };
    card.querySelector('[data-act="unlock"]').onclick = function (e) {
      var b = e.currentTarget; b.classList.add('eco-busy'); b.textContent = 'Opening checkout…';
      checkout('unlock', { key: key, product: opts.product, label: opts.label }).then(function (ok) {
        if (!ok) degrade();
      });
    };
    card.querySelector('[data-act="pro"]').onclick = function (e) {
      var b = e.currentTarget; b.classList.add('eco-busy'); b.textContent = 'Opening checkout…';
      checkout('subscribe', { product: opts.product }).then(function (ok) {
        if (!ok) degrade();
      });
    };
  }

  /* ================= reusable GO PRO chip ================= */
  function goProChip(opts) {
    opts = opts || {};
    injectCss();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'eco-chip' + (opts.subtle ? ' subtle' : '');
    b.innerHTML = esc(opts.label || '⬡ GO PRO');
    b.onclick = opts.onClick || function () {
      b.classList.add('eco-busy');
      checkout('subscribe', { product: opts.product || 'pro' }).then(function (ok) {
        b.classList.remove('eco-busy');
        if (!ok && typeof window.notify === 'function') notify('Go Pro checkout is being set up — coming soon');
      });
    };
    return b;
  }

  /* ================= public API ================= */
  window.Economy = {
    getBalance: getBalance,
    renderSparks: renderSparks,
    getEntitlement: getEntitlement,
    isPaid: function () { return getEntitlement().then(isPaid); },
    gate: gate,
    goProChip: goProChip,
    freeUsed: freeUsed,
    markFreeUse: markFreeUse,
    _FREE_DAILY_LIMIT: FREE_DAILY_LIMIT
  };
})();
