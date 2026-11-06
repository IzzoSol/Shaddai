/* world-dashboard-link.js — the WORLD side of the World <-> Dashboard link (2026-11-06, owner: "connect the 3D world to the dashboard").
 * Contract: docs/HANDOFF-20261106c-DASHBOARD-WORLD-LINK.md (C1-C5). The dashboard side (public/index.html + backend) is built by
 * another terminal against the same contract.
 *   C1  snapshot  -> localStorage 'shd_world_snapshot_v1' every 5 s / on hide + BroadcastChannel('shd-world') {type:'snapshot', snap}
 *   C2  deep links -> ?navi=<module> &pin=<pinId> &bot=<botId>, applied once the world is playable
 *   C3  academy    -> GET /api/school/progress  (WorldLink.progress())   offline / 404 = state 'offline', nothing breaks
 *   C4  agents     -> GET /api/world/agents every 10 s (WorldLink.agents()) read-only: the server owns tasks; we only render
 *   C5  dashboard  -> Navi slot DASHBOARD opens /dashboard#worlds/myworld
 * No keys: only the player's own session token (shd_token) is sent, to our own origin.
 *   window.WorldLink { snapshot(), publish(), progress(), agents(), dashboardUrl(tab), on(fn), _poll() }
 */
(function (root) {
  'use strict';
  if (root.WorldLink) return;
  var SNAP_KEY = 'shd_world_snapshot_v1', BC = null, listeners = [];
  try { BC = typeof BroadcastChannel === 'function' ? new BroadcastChannel('shd-world') : null; } catch (e) { BC = null; }
  function ls() { try { return root.localStorage; } catch (e) { return null; } }
  function get(k) { var s = ls(); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function emit(what) { listeners.forEach(function (f) { try { f(what); } catch (e) { } }); }
  function apiBase() { return (root.SHADDAI_API_BASE || '').replace(/\/$/, ''); }
  function authHeaders() { var h = {}, t = get('shd_token'); if (t) h.Authorization = 'Bearer ' + t; return h; }

  /* ---------- C1 snapshot ---------- */
  function snapshot(live) {
    var WB = root.WorldBots, WM = root.WorldMounts, WS = root.WorldSurvival, WO = root.WorldOperatives, L = root.ShdSparks, N = root.NaviState;
    var dbg = root.__w3dDebug, pp = dbg && dbg.playerPos, cur = root._playerCharacter || null;
    var snap = {
      v: 1, at: Date.now(), live: live !== false,
      player: { character: cur, name: get('shd_display_name') || '', pos: pp ? { x: Math.round(pp.x), z: Math.round(pp.z) } : null, place: root._currentInterior || null },
      sparks: L && L.get ? L.get() : null,
      activeBot: null, bots: [], mounts: [], spots: [], operatives: [],
      waypoint: N && N.waypoint ? { label: N.waypoint.label, kind: N.waypoint.kind } : null
    };
    try {
      if (WB) {
        var st = WB.state(); snap.activeBot = st.active || null;
        snap.bots = WB.ROSTER.map(function (d) { var r = WB.rec(d.id); return { id: d.id, name: d.name, kind: d.kind, state: r ? r.bodyState : 'locked', hp: r ? r.hp : null, skills: r ? r.skills.slice() : [] }; });
      }
    } catch (e) { }
    try { if (WM) snap.mounts = WM.owned().map(function (m) { var d = WM.def(m.id) || {}; return { id: m.id, name: d.name || m.id, hp: m.hp, flying: !!d.flying }; }); } catch (e) { }
    try { if (WS) { var a = WS.active(); snap.spots = WS.spots().map(function (x) { return { id: x.id, name: x.name, kind: x.kind, active: !!(a && a.id === x.id) }; }); } } catch (e) { }
    try { if (WO) snap.operatives = WO.list().map(function (o) { return { code: o.code, name: o.name, portrait: o.portrait, owned: !!o.owned, equipped: o.code === cur }; }); } catch (e) { }
    return snap;
  }
  var lastJson = '';
  function publish(live) {
    var snap = snapshot(live), j;
    try { j = JSON.stringify(snap); } catch (e) { return null; }
    var body = j.replace(/"at":\d+,/, '');                     // skip identical writes (only the clock moved)
    if (body === lastJson && live !== false) return snap; lastJson = body;
    var s = ls(); try { if (s) s.setItem(SNAP_KEY, j); } catch (e) { }
    try { if (BC) BC.postMessage({ type: 'snapshot', snap: snap }); } catch (e) { }
    return snap;
  }

  /* ---------- C3 academy progress + C4 world agents (server read-only) ---------- */
  var PROG = { state: 'idle', tiers: [], agents: [], at: 0 }, AG = { state: 'idle', agents: [], at: 0 };
  var TIERS = [[1, 'Artificial Intelligence'], [2, 'Machine Learning'], [3, 'Deep Learning'], [4, 'Neural Networks'], [5, 'Generative AI'], [6, 'AI Agents'], [7, 'Agentic AI']]
    .map(function (t) { return { n: t[0], name: t[1] }; });
  function getJson(path) {
    if (typeof root.fetch !== 'function') return Promise.resolve(null);
    return root.fetch(apiBase() + path, { headers: authHeaders(), cache: 'no-store' })
      .then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function loadProgress(force) {
    if (PROG.state === 'loading' || (!force && PROG.state !== 'idle' && Date.now() - PROG.at < 30000)) return Promise.resolve(PROG);
    PROG.state = 'loading';
    return Promise.all([getJson('/api/school/progress'), getJson('/api/school/classes')]).then(function (r) {
      var p = r[0], c = r[1];
      PROG.tiers = (c && Array.isArray(c.tiers) && c.tiers.length) ? c.tiers : TIERS;
      PROG.agents = p && p.ok && Array.isArray(p.agents) ? p.agents.map(function (a) { return { agentId: a.agentId, name: a.name || a.agentId, passed: Array.isArray(a.passed) ? a.passed : [], current: a.current || null }; }) : [];
      PROG.state = p && p.ok ? 'ready' : 'offline'; PROG.at = Date.now(); emit('progress'); return PROG;
    });
  }
  var PIN_KEYS = {};
  function loadAgents() {
    if (AG.state === 'loading') return Promise.resolve(AG); AG.state = 'loading';
    return getJson('/api/world/agents').then(function (j) {
      AG.agents = j && j.ok && Array.isArray(j.agents) ? j.agents.filter(function (a) { return a && a.id; }) : [];
      AG.state = j && j.ok ? 'ready' : 'offline'; AG.at = Date.now();
      // agents with a coordinate place show on the Navi MAP (pin places reuse the world's own pins: nothing is invented)
      var N = root.Navi, seen = {};
      if (N && N.registerPin) AG.agents.forEach(function (a) {
        var p = a.place; if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return;
        var id = 'agent-' + a.id; seen[id] = 1; PIN_KEYS[id] = 1;
        N.registerPin({ id: id, t: (a.name || a.id) + (a.task && a.task.label ? ' · ' + a.task.label : ''), kind: 'Agent', x: p.x, z: p.z });
      });
      if (N && N.unregisterPin) Object.keys(PIN_KEYS).forEach(function (id) { if (!seen[id]) { N.unregisterPin(id); delete PIN_KEYS[id]; } });
      emit('agents'); return AG;
    });
  }
  function agentFor(id) { return AG.agents.filter(function (a) { return String(a.id).toUpperCase() === String(id).toUpperCase(); })[0] || null; }

  /* ---------- C5 dashboard link ---------- */
  function dashboardUrl(tab) { return '/dashboard#worlds/' + (tab || 'myworld'); }
  function openDashboard(tab) { publish(true); try { root.open(dashboardUrl(tab), '_blank'); } catch (e) { } }

  /* ---------- C2 deep links ---------- */
  var NAVI_MODS = /^(map|modes|jobs|inv|market|plots|wallet|sparks|bots|academy|chat|markets|news|radio|settings)$/;
  function deepLink(search) {
    var q = {}; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)); q[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    var out = {};
    if (q.navi && NAVI_MODS.test(q.navi)) out.navi = q.navi;
    if (q.pin && /^[\w:.-]{1,64}$/.test(q.pin)) out.pin = q.pin;
    if (q.bot && /^[\w-]{1,32}$/.test(q.bot)) out.bot = q.bot;
    return out;
  }
  function applyDeepLink(d) {
    var N = root.Navi, done = [];
    if (d.pin && N && N.pins) { var p = N.pins().filter(function (x) { return x.id === d.pin; })[0]; if (p) { N.setWaypoint({ x: p.x, z: p.z, label: p.t, kind: p.kind }); done.push('pin'); } }
    if (d.bot && root.WorldBots && root.WorldBots.rec(d.bot)) { var zone = root.__botZone ? root.__botZone() : 'city', r = root.WorldBots.call(d.bot, zone); if (N && N.toast) N.toast(r.ok ? 'Bot called from the dashboard' : r.why); done.push('bot'); }
    if (d.navi && N) { N.open(); N.setModule(d.navi); done.push('navi'); }
    return done;
  }

  /* ---------- boot ---------- */
  var timers = [];
  function boot() {
    if (root.Navi && root.Navi.enableSlot) root.Navi.enableSlot('Dashboard', function () { openDashboard('myworld'); });
    else setTimeout(boot, 500);
  }
  function whenPlayable(fn) { var n = 0; (function w() { if (root.__loadPlayable && root.Navi) return fn(); if (++n < 600) setTimeout(w, 500); })(); }
  if (typeof document !== 'undefined' && !root.__worldLinkNoBoot) {
    boot();
    var d = deepLink(root.location && root.location.search);
    whenPlayable(function () {
      if (d.navi || d.pin || d.bot) setTimeout(function () { applyDeepLink(d); }, 800);
      publish(true); loadAgents();
      timers.push(setInterval(function () { publish(!document.hidden); }, 5000));   // a hidden tab keeps saying live:false
      timers.push(setInterval(function () { if (!document.hidden) loadAgents(); }, 10000));
    });
    document.addEventListener('visibilitychange', function () { publish(!document.hidden); });
    root.addEventListener('pagehide', function () { publish(false); });
    if (root.ShdSparks && root.ShdSparks.on) try { root.ShdSparks.on(function () { publish(true); }); } catch (e) { }
  }

  root.WorldLink = {
    SNAP_KEY: SNAP_KEY, TIERS: TIERS, snapshot: snapshot, publish: publish, dashboardUrl: dashboardUrl, openDashboard: openDashboard,
    progress: function () { loadProgress(); return PROG; }, reloadProgress: function () { return loadProgress(true); },
    agents: function () { return AG; }, agentFor: agentFor, reloadAgents: loadAgents,
    deepLink: deepLink, applyDeepLink: applyDeepLink, on: function (f) { listeners.push(f); }
  };
})(typeof window !== 'undefined' ? window : this);
