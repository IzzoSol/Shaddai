/* SHADDAI V119 — Dashboard <-> 3D world link, per docs/HANDOFF-20261106c-DASHBOARD-WORLD-LINK.md (the 3D terminal's contract):
     C1  reads the world snapshot  localStorage['shd_world_snapshot_v1'] + BroadcastChannel('shd-world')  -> "In the 3D world" box (My Space)
     C2  deep links  enter3DWorld({ navi, pin, bot })  -> ?from=dashboard&navi=...   and  #worlds/<tab>  routing both ways
     KPI the Worlds Sparks card falls back to the browser ledger (shaddai.sparks) instead of the never-written shaddai.econ
   The browser ledger is a game balance: editable by the player, never used for money or metering. Server metering uses the economy service. */
(function () {
  'use strict';
  var NAVI = ['map', 'modes', 'jobs', 'inv', 'market', 'plots', 'wallet', 'sparks', 'bots', 'academy', 'chat', 'markets', 'news', 'radio', 'settings'];
  var ALIAS = { worlds: 'worlds', myworld: 'space', space: 'space', agents: 'space', academy: 'athenaeum', athenaeum: 'athenaeum', plots: 'plots', arena: 'arena' };
  var ID = /^[A-Za-z0-9_-]{1,40}$/;

  /* ── C2: #worlds/<tab> ── */
  function route() {
    var m = /^#worlds(?:\/([a-z]+))?/.exec(location.hash); if (!m) return;
    var tab = ALIAS[m[1] || 'worlds'] || 'worlds';
    try { showView('worlds'); setTimeout(function () { if (window.switchWorldsTab) window.switchWorldsTab(tab); }, 90); } catch (e) { /* ignore */ }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('load', function () { setTimeout(route, 1600); });

  /* ── C2: enter3DWorld({ navi, pin, bot }) ── */
  function worldQuery(o) {
    var q = '&from=dashboard';
    if (o && typeof o === 'object') {
      if (o.navi && NAVI.indexOf(o.navi) > -1) q += '&navi=' + encodeURIComponent(o.navi);
      if (o.pin && ID.test(o.pin)) q += '&pin=' + encodeURIComponent(o.pin);
      if (o.bot && ID.test(o.bot)) q += '&bot=' + encodeURIComponent(o.bot);
    }
    return q;
  }
  function wrapEnter() {
    var f = window.enter3DWorld; if (typeof f !== 'function' || f._lk) return;
    window.enter3DWorld = function (o) {
      var r = f.apply(this, []);
      try {
        var fr = document.getElementById('gridWorldFrame'), s = fr && fr.getAttribute('src');
        if (s && s.indexOf('from=dashboard') < 0) fr.setAttribute('src', s + worldQuery(o));
      } catch (e) { /* the world still opens without the params */ }
      return r;
    };
    window.enter3DWorld._lk = true;
  }
  wrapEnter(); window.addEventListener('load', function () { wrapEnter(); setTimeout(wrapEnter, 700); });

  /* ── Sparks KPI fallback (browser ledger) ── */
  function sparksFallback() {
    var el = document.getElementById('whKpiSparks'); if (!el) return;
    var n = 0; try { n = parseInt(localStorage.getItem('shaddai.sparks') || localStorage.getItem('shd_sparks') || '0', 10) || 0; } catch (e) { /* ignore */ }
    var shown = String(el.textContent || '').replace(/[^0-9]/g, '');
    if ((!shown || shown === '0') && n > 0) { el.textContent = n.toLocaleString(); el.title = 'In-game Sparks on this device'; }
  }
  function wrapInit() {
    var f = window.initWorldsView; if (typeof f !== 'function' || f._lk) return;
    window.initWorldsView = function () { var r = f.apply(this, arguments); setTimeout(sparksFallback, 900); return r; }; window.initWorldsView._lk = true;
  }
  wrapInit(); window.addEventListener('load', function () { wrapInit(); setTimeout(wrapInit, 700); });

  /* ── C1: snapshot box ── */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function snapshot() { try { var s = JSON.parse(localStorage.getItem('shd_world_snapshot_v1')); return s && s.v === 1 ? s : null; } catch (e) { return null; } }
  function chip(t, cls) { return h('i', { class: 'sw-chip ' + (cls || ''), text: t }); }
  function go(navi) { return function () { if (window.enter3DWorld) window.enter3DWorld({ navi: navi }); }; }
  function fill(body) {
    var s = snapshot(); body.textContent = '';
    if (!s) { body.appendChild(h('div', { class: 'sw-msg dim', text: 'Enter the 3D world once to see your stuff here.' })); body.appendChild(h('div', { class: 'sw-actions' }, [h('button', { type: 'button', class: 'sw-btn', text: 'Enter the world', onclick: function () { if (window.enter3DWorld) window.enter3DWorld(); } })])); return; }
    var age = Date.now() - (s.at || 0), live = s.live && age < 10 * 60 * 1000;
    var p = s.player || {};
    body.appendChild(h('div', { class: 'sw-row' }, [h('b', { text: (p.name || 'You') + (p.character ? ' · ' + p.character : '') }), chip(live ? 'live' : 'last seen ' + new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), live ? 'ok' : 'warn')]));
    if (p.place) body.appendChild(h('div', { class: 'sw-sub', text: p.place }));
    var grid = h('div', { class: 'sw-grid' });
    function card(title, items, navi, label) {
      var kids = [h('div', { class: 'sw-row' }, [h('b', { text: title }), chip(String(items.length))])];
      kids.push(h('div', { class: 'sw-sub', text: items.length ? items.slice(0, 6).join(' · ') + (items.length > 6 ? ' …' : '') : 'none yet' }));
      if (navi) kids.push(h('div', { class: 'sw-actions' }, [h('button', { type: 'button', class: 'sw-btn ghost', text: label || 'Open in 3D', onclick: go(navi) })]));
      grid.appendChild(h('div', { class: 'sw-card slim' }, kids));
    }
    card('Characters', (s.operatives || []).filter(function (o) { return o.owned; }).map(function (o) { return o.name + (o.equipped ? ' ✓' : ''); }), null);
    card('Bots', (s.bots || []).map(function (b) { return b.name + ' (' + b.state + ')'; }), 'bots');
    card('Mounts', (s.mounts || []).map(function (m) { return m.name + (m.flying ? ' ✈' : ''); }), 'inv');
    card('Respawn spots', (s.spots || []).map(function (x) { return x.name + (x.active ? ' ●' : ''); }), 'plots', 'Plots & homes');
    grid.appendChild(h('div', { class: 'sw-card slim' }, [h('div', { class: 'sw-row' }, [h('b', { text: 'Game Sparks' }), chip(Number(s.sparks || 0).toLocaleString())]), h('div', { class: 'sw-sub', text: 'In-game balance on this device' }), h('div', { class: 'sw-actions' }, [h('button', { type: 'button', class: 'sw-btn ghost', text: 'Wallet in 3D', onclick: go('sparks') })])]));
    body.appendChild(grid);
    if (s.waypoint && s.waypoint.label) body.appendChild(h('div', { class: 'sw-sub', text: 'Waypoint: ' + s.waypoint.label }));
  }
  var bc = null;
  window.shdWorldSnapshotBox = function () {
    var body = h('div', { class: 'sw-body' }); fill(body);
    var box = h('section', { class: 'sw-box' }, [h('div', { class: 'sw-hd' }, [h('b', { text: 'In the 3D world' }), h('span', { text: 'what the world last reported · updates live while it is open' })]), body]);
    try { if (window.BroadcastChannel && !bc) bc = new BroadcastChannel('shd-world'); if (bc) bc.onmessage = function (e) { if (e.data && e.data.type === 'snapshot' && body.isConnected) fill(body); }; } catch (e) { /* storage poll below */ }
    var t = setInterval(function () { if (!body.isConnected) { clearInterval(t); return; } fill(body); }, 15000);
    return box;
  };
  window.shdLink = { route: route, worldQuery: worldQuery, snapshot: snapshot };
})();
