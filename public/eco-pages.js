// SHADDAI · eco-pages.js — shared helpers for the economy HTML pages.
// Pairs with eco-pages.css. Self-contained, never throws.
(function () {
  'use strict';
  if (window.EcoUI) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function whoami() {
    var r = { userId: '', token: '' };
    try {
      r.userId = localStorage.getItem('shd_userid') || sessionStorage.getItem('shd_userid') || '';
      r.token = localStorage.getItem('shd_token') || sessionStorage.getItem('shd_token') || '';
    } catch (e) {}
    return r;
  }

  // Build fetch headers: JSON + existing session (Bearer JWT + x-user-id for local dev).
  function headers(extra) {
    var h = { 'Content-Type': 'application/json' };
    var me = whoami();
    if (me.token) h['Authorization'] = 'Bearer ' + me.token;
    if (me.userId) h['x-user-id'] = me.userId;
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function timeout(ms) { try { return AbortSignal.timeout(ms); } catch (e) { return undefined; } }

  // api(path, opts) -> Promise<{ status, json }>. Resolves on ANY http response,
  // throws only on network failure.
  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      headers: headers(opts.headers),
      signal: timeout(opts.timeout || 15000)
    };
    if (opts.body && (init.method === 'POST' || init.method === 'PUT' || init.method === 'DELETE')) {
      init.body = JSON.stringify(opts.body);
    }
    return fetch(path, init).then(function (r) {
      return r.json().then(function (j) {
        return { status: r.status, json: j || {} };
      }).catch(function () {
        return { status: r.status, json: {} };
      });
    });
  }

  function toast(msg, isErr) {
    var t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 4000);
  }

  function fmtUsd(n) {
    var v = Number(n);
    if (!isFinite(v)) return '$0.00';
    return '$' + v.toFixed(v % 1 === 0 ? 0 : 2);
  }

  function ago(iso) {
    if (!iso) return '—';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function activeNav() {
    var path = location.pathname.split('/').pop() || '';
    document.querySelectorAll('.nav .links a').forEach(function (a) {
      if (a.getAttribute('href') === path) a.classList.add('on');
    });
  }

  function showWho() {
    var me = whoami();
    var el = document.querySelector('.nav .who');
    if (!el) return;
    el.textContent = me.userId ? (me.token ? '● ' : '○ ') + me.userId : '○ guest · sign in for identity';
  }

  // Standard error handling for action buttons.
  function jost(opts) {
    opts = opts || {};
    var btn = opts.btn;
    function done() { if (btn) { btn.disabled = false; btn.textContent = opts.label || 'Do it'; } }
    return function () {
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      return api(opts.path, { method: opts.method || 'POST', body: opts.body })
        .then(function (r) {
          if (!r.json || r.json.ok === false) throw new Error((r.json && (r.json.error || r.json.reason)) || ('HTTP ' + r.status));
          if (opts.onOk) opts.onOk(r.json);
          else toast(opts.okMsg || 'Done');
          return r.json;
        })
        .catch(function (e) { toast(e.message || 'Request failed', true); })
        .finally(done);
    };
  }

  window.EcoUI = { esc: esc, whoami: whoami, headers: headers, api: api, toast: toast, fmtUsd: fmtUsd, ago: ago, activeNav: activeNav, showWho: showWho, jost: jost };

  document.addEventListener('DOMContentLoaded', function () {
    activeNav();
    showWho();
  });
})();