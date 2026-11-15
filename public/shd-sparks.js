/* SHADDAI V119 — SPARKS. The header Sparks number is your real balance from the server (/api/economy/balance), refreshed on a timer,
   when you return to the tab, and right after a purchase. If it cannot be read (signed out, offline, server off) it shows a dash,
   never an invented 0. Clicking it opens the Shop. Per-bot spending caps live on each bot token (Worlds > My Space > Outside bots). */
(function () {
  'use strict';
  var bal = null, at = 0, last = '', busy = false, again = false;
  function uid() { try { var u = localStorage.getItem('shd_userid'); return u && u.indexOf('guest') !== 0 && u !== 'local' ? u : ''; } catch (e) { return ''; } }
  function hdr() { var o = {}; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function refresh() {
    var u = uid(); if (!u) { bal = null; last = 'signed out'; paint(); return Promise.resolve(null); }
    if (busy) { again = true; return Promise.resolve(bal); } busy = true;      // a refresh asked for while one is running (e.g. right after a purchase) runs again afterwards
    return fetch('/api/economy/balance?userId=' + encodeURIComponent(u), { credentials: 'same-origin', headers: hdr() })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) { if (x.ok && x.d && isFinite(Number(x.d.balance_sparks != null ? x.d.balance_sparks : x.d.sparks_balance))) { /* balance_sparks is the display number (units / 100); sparks_balance is raw ledger units — never show the raw integer as Sparks. */ bal = Number(x.d.balance_sparks != null ? x.d.balance_sparks : x.d.sparks_balance); at = Date.now(); last = 'ok'; } else { bal = null; last = 'unavailable'; } })
      .catch(function () { bal = null; last = 'offline'; })
      .then(function () { busy = false; paint(); if (again) { again = false; return refresh(); } return bal; });
  }
  function fmt(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : (Math.round(v * 100) / 100).toString(); }
  function paint() {
    var el = document.getElementById('navSparks'); if (!el) return;
    el.textContent = bal == null ? '—' : fmt(bal);
    var p = el.parentElement; if (p) p.title = bal == null ? 'Sparks balance is not available (' + (last || 'loading') + '). Click to open the Shop.' : 'Your Sparks: ' + bal + ' (updated ' + new Date(at).toTimeString().slice(0, 8) + '). Click to open the Shop.';
  }
  function init() { refresh(); setInterval(function () { if (!document.hidden) refresh(); }, 60000); document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); }); window.addEventListener('shd:sparks', refresh); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.shdSparks = { value: function () { return bal; }, refresh: refresh, updatedAt: function () { return at; }, status: function () { return last; } };
})();
