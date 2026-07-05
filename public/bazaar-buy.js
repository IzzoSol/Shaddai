/*!
 * bazaar-buy.js — SHADDAI Bazaar purchase client (collectibles + forged agents).
 * Self-contained, null-safe, never throws. Include anywhere; auto-wires by attribute.
 *
 * Markup it understands (all optional):
 *   <button data-buy-item="col_19"                     → item to buy (required)
 *           data-buy-method="credits|sol"              → default payment method (default: credits)
 *           data-buy-buyer="guest-abc"                 → buyer id (falls back to window.SHADDAI_USER / localStorage / 'guest')
 *           data-buy-price="35">Buy</button>           → optional display price
 *
 * Programmatic API:
 *   window.SHADDAI_BAZAAR_BUY.buy(itemId, { method, buyer, solPrice, mount, onResult })
 *   window.SHADDAI_BAZAAR_BUY.wire()   // (re)scan the DOM for [data-buy-item]
 */
(function () {
  'use strict';

  var API = '/api/bazaar';
  var POLL_MS = 3500;      // Solana Pay rate-limit is 1 call / 3s
  var POLL_MAX = 120;      // ~7 min of polling then give up

  function q(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = String(txt);
    return e;
  }
  function buyerId(explicit) {
    if (explicit) return String(explicit);
    try { if (window.SHADDAI_USER) return String(window.SHADDAI_USER); } catch (e) {}
    try { var s = window.localStorage && localStorage.getItem('shaddai_user'); if (s) return s; } catch (e) {}
    return 'guest';
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.__status = r.status; return d; }); });
  }
  function getJSON(url) {
    return fetch(url).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.__status = r.status; return d; }); });
  }

  // ── result panel (created lazily, attached near the trigger or to <body>) ──
  function panelFor(mount) {
    var host = mount || document.body;
    if (!host) return null;
    var p = host.__bzbuyPanel;
    if (p && p.isConnected) return p;
    p = el('div', 'bzbuy-panel');
    p.innerHTML = '<button class="bzbuy-close" aria-label="close">×</button><div class="bzbuy-body"></div>';
    var close = q('.bzbuy-close', p);
    if (close) close.addEventListener('click', function () { try { p.remove(); } catch (e) {} });
    host.appendChild(p);
    host.__bzbuyPanel = p;
    return p;
  }
  function render(mount, state, html) {
    var p = panelFor(mount);
    if (!p) return;
    p.setAttribute('data-state', state || 'info');
    var body = q('.bzbuy-body', p);
    if (body) body.innerHTML = html;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // ── poll a pending Solana Pay purchase to completion ──────────────────────
  function pollStatus(reference, mount, name, opts, tries) {
    tries = tries || 0;
    getJSON(API + '/purchase/' + encodeURIComponent(reference)).then(function (d) {
      if (d && d.ok && d.status === 'settled') {
        render(mount, 'success',
          '<div class="bzbuy-title bzbuy-ok">✔ Purchase confirmed</div>' +
          '<div class="bzbuy-line">You now own <b>' + esc(name) + '</b>.</div>' +
          (d.signature ? '<div class="bzbuy-mono">tx ' + esc(String(d.signature).slice(0, 24)) + '…</div>' : ''));
        if (opts && typeof opts.onResult === 'function') { try { opts.onResult(d); } catch (e) {} }
        return;
      }
      if (d && d.status === 'paid_unfulfilled') {
        render(mount, 'error', '<div class="bzbuy-title bzbuy-err">Payment received, item unavailable</div><div class="bzbuy-line">' + esc(d.error || '') + '</div>');
        return;
      }
      if (tries >= POLL_MAX) {
        render(mount, 'error', '<div class="bzbuy-title bzbuy-err">Timed out</div><div class="bzbuy-line">We did not detect payment yet. If you paid, it may confirm shortly.</div>');
        return;
      }
      setTimeout(function () { pollStatus(reference, mount, name, opts, tries + 1); }, POLL_MS);
    }).catch(function () {
      if (tries < POLL_MAX) setTimeout(function () { pollStatus(reference, mount, name, opts, tries + 1); }, POLL_MS);
    });
  }

  // ── main entry point ──────────────────────────────────────────────────────
  function buy(itemId, opts) {
    opts = opts || {};
    var mount = opts.mount || null;
    var method = opts.method === 'sol' ? 'sol' : 'credits';
    var body = { itemId: itemId, method: method, buyer: buyerId(opts.buyer) };
    if (opts.solPrice != null) body.solPrice = opts.solPrice;

    render(mount, 'loading', '<div class="bzbuy-title">Processing…</div><div class="bzbuy-line">' + (method === 'sol' ? 'Creating Solana payment' : 'Charging SHAD-Credits') + '</div>');

    return postJSON(API + '/purchase', body).then(function (d) {
      if (!d || d.ok !== true) {
        var msg = (d && d.error) || 'Purchase failed';
        if (d && d.__status === 402) msg = 'Not enough SHAD-Credits' + (d.x402 && d.x402.required != null ? ' (need ' + d.x402.required + ')' : '');
        if (d && d.needsConfig) msg = 'Solana Pay is not set up yet (merchant wallet missing).';
        render(mount, 'error', '<div class="bzbuy-title bzbuy-err">Could not buy</div><div class="bzbuy-line">' + esc(msg) + '</div>');
        if (typeof opts.onResult === 'function') { try { opts.onResult(d); } catch (e) {} }
        return d;
      }

      if (d.status === 'settled') {
        var pay = d.payment || {};
        render(mount, 'success',
          '<div class="bzbuy-title bzbuy-ok">✔ Purchased</div>' +
          '<div class="bzbuy-line">You now own <b>' + esc(d.purchase && d.purchase.name) + '</b>.</div>' +
          (pay.balance != null ? '<div class="bzbuy-mono">balance ' + esc(pay.balance) + ' SHAD-Credits</div>' : ''));
        if (typeof opts.onResult === 'function') { try { opts.onResult(d); } catch (e) {} }
        return d;
      }

      if (d.status === 'pending' && d.payUrl) {
        render(mount, 'pending',
          '<div class="bzbuy-title bzbuy-sol">◎ Pay with Solana</div>' +
          '<div class="bzbuy-line">Approve <b>' + esc(d.amount) + ' SOL</b> in your wallet.</div>' +
          '<a class="bzbuy-solbtn" href="' + esc(d.payUrl) + '">Open in wallet</a>' +
          '<div class="bzbuy-line bzbuy-wait">Waiting for on-chain confirmation…</div>');
        pollStatus(d.reference, mount, (d.purchase && d.purchase.name) || 'item', opts, 0);
        return d;
      }

      render(mount, 'info', '<div class="bzbuy-line">' + esc(JSON.stringify(d)) + '</div>');
      return d;
    }).catch(function (e) {
      render(mount, 'error', '<div class="bzbuy-title bzbuy-err">Network error</div><div class="bzbuy-line">' + esc(e && e.message) + '</div>');
      return { ok: false, error: e && e.message };
    });
  }

  // ── auto-wire any [data-buy-item] element ─────────────────────────────────
  function onClick(ev) {
    var t = ev.currentTarget;
    if (!t) return;
    var itemId = t.getAttribute('data-buy-item');
    if (!itemId) return;
    ev.preventDefault();
    buy(itemId, {
      method: t.getAttribute('data-buy-method') || 'credits',
      buyer: t.getAttribute('data-buy-buyer') || null,
      solPrice: t.getAttribute('data-buy-solprice') || null,
      mount: t.closest ? (t.closest('[data-buy-mount]') || null) : null
    });
  }
  function wire(root) {
    var nodes = [];
    try { nodes = (root || document).querySelectorAll('[data-buy-item]'); } catch (e) { return; }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.__bzbuyWired) continue;
      n.__bzbuyWired = true;
      if (!n.classList.contains('bzbuy-btn')) n.classList.add('bzbuy-btn');
      n.addEventListener('click', onClick);
    }
  }

  window.SHADDAI_BAZAAR_BUY = { buy: buy, wire: wire, buyerId: buyerId };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wire(); });
  } else {
    wire();
  }
})();
