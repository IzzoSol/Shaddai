/* world-home-deeds.js — buy a realm-town home with Sparks (owner 2026-10-16). Client only renders + asks; the SERVER decides
 * (backend/home-deed-routes.js: one owner per home, Sparks debited once by the economy service, max 3 homes per player).
 *
 *   WorldHomeDeeds.init({ getPlayer():{x,z}|null, U })   reads window.__homeLots (world-realm-kits.js) = [{ id, realm, x, z }] door points
 *   Walk to a home's front door: a toast says FOR SALE / YOURS / OWNED. E opens the deed panel; Buy posts /api/home-deeds/buy.
 *   ?homedeeds=0 disables.
 */
(function (root) {
  'use strict';
  var H = null, U = 7 / 1.8, deeds = {}, price = 2500, me = null, panel = null, cur = null, lastNear = null;
  function api(path, opt) {
    var base = (root.SHADDAI_API_BASE || '').replace(/\/$/, ''), h = { 'content-type': 'application/json' };
    try { var tk = localStorage.getItem('shd_token'); if (tk) h.Authorization = 'Bearer ' + tk; me = localStorage.getItem('shd_uid') || me; } catch (e) { }
    return fetch(base + '/api/home-deeds' + path, Object.assign({ headers: h, cache: 'no-store' }, opt || {})).then(function (r) { return r.json(); });
  }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function refresh() { return api('').then(function (j) { if (j && j.ok) { deeds = j.deeds || {}; price = j.price || price; } }).catch(function () { }); }
  function status(id) { var d = deeds[id]; return !d ? 'sale' : (me && d.owner === me ? 'mine' : 'owned'); }
  function near() { var p = H.getPlayer && H.getPlayer(), L = root.__homeLots || [], best = null, bd = 8 * U; if (!p) return null;
    for (var i = 0; i < L.length; i++) { var d = Math.hypot(p.x - L[i].x, p.z - L[i].z); if (d < bd) { bd = d; best = L[i]; } } return best; }
  function close() { if (panel) panel.style.display = 'none'; cur = null; }
  function open(lot) {
    cur = lot; if (!panel) { panel = document.createElement('div'); panel.id = 'homeDeedPanel';
      panel.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9300;min-width:320px;padding:14px 18px;background:rgba(6,10,14,.95);border:2px solid #e8c45c;border-radius:12px;color:#f3f0e6;font:700 14px Rajdhani,sans-serif';
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t || !cur) return; if (t.getAttribute('data-a') === 'buy') buy(cur); else close(); }); }
    var st = status(lot.id), name = lot.realm.charAt(0).toUpperCase() + lot.realm.slice(1) + ' home · lot ' + (+lot.id.split(':')[2] + 1);
    panel.innerHTML = '<div style="font:900 12px Orbitron,sans-serif;letter-spacing:.25em;color:#e8c45c;margin-bottom:6px">HOME DEED</div><div>' + name + '</div>' +
      (st === 'sale' ? '<div style="margin:8px 0;opacity:.8">For sale: <b style="color:#00ff9c">' + price + ' Sparks</b>. Yours for good - furnish it, invite friends, house your agents.</div><button data-a="buy" style="background:#e8c45c;color:#06080b;border:0;padding:7px 16px;border-radius:7px;font-weight:800;cursor:pointer">Buy for ' + price + ' Sparks</button> '
        : st === 'mine' ? '<div style="margin:8px 0;color:#00ff9c">This home is yours.</div>' : '<div style="margin:8px 0;opacity:.75">This home already has an owner.</div>') +
      '<button data-a="x" style="background:none;color:#aaa;border:1px solid #555;padding:6px 12px;border-radius:7px;cursor:pointer;margin-left:6px">Close</button><div style="opacity:.55;font-size:11px;margin-top:6px">E to close</div>';
    panel.style.display = 'block';
  }
  function buy(lot) {
    api('/buy', { method: 'POST', body: JSON.stringify({ homeId: lot.id }) }).then(function (j) {
      if (j && j.ok) { toast(j.replayed ? 'You already own this home' : 'Home bought - welcome home!'); if (root.ShdSparks && root.ShdSparks.sync) root.ShdSparks.sync(); }
      else toast((j && j.error) || 'Purchase failed');
      return refresh().then(function () { if (cur) open(cur); });
    }).catch(function () { toast('Home sales are offline right now'); });
  }
  function init(h) {
    if (typeof location !== 'undefined' && /[?&]homedeeds=0\b/.test(location.search)) return null;
    H = h; U = h.U || U; refresh(); setInterval(refresh, 60000);
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'KeyE' || e.repeat) return;
      if (panel && panel.style.display === 'block') { close(); e.stopImmediatePropagation(); return; }
      var lot = near(); if (lot) { open(lot); e.stopImmediatePropagation(); }
    }, true);
    setInterval(function () { var lot = near(); if (lot && lot !== lastNear) { var s = status(lot.id); toast(s === 'sale' ? 'Home for sale (' + price + ' Sparks) - E for the deed' : s === 'mine' ? 'Your home - E' : 'Owned home'); } if (!lot && cur) close(); lastNear = lot; }, 600);
    return root.WorldHomeDeeds;
  }
  root.WorldHomeDeeds = { init: init, _status: status, _set: function (d, p, u) { deeds = d; price = p; me = u; } };
})(typeof window !== 'undefined' ? window : globalThis);
