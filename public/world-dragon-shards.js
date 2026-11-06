/* world-dragon-shards.js — the seven dragon missions (owner 2026-10-23: "dragons sleeping in each terrain ... we can make it a mission to defeat
 * each and obtain the shard"). Each realm's dragon sleeps at its lair (world-dragons.js lairFor); beating it awards that realm's shard.
 *   WorldDragonShards.attach(dragonsApi)  - shows the mission tracker and announces a mission the first time you near a sleeping dragon
 *   WorldDragonShards.award(defeatedEvent) / owned() / list()
 * Shards are a story collectible only (no Sparks, no trade). CLIENT VIEW: stored in localStorage 'w3d_dragon_shards'; before shards unlock
 * anything of value the server must award and own them (PIKADON rule: the server is authoritative for items). ?shards=0 hides the tracker.
 */
(function (root) {
  'use strict';
  var KEY = 'w3d_dragon_shards', SEEN = 'w3d_dragon_missions_seen';
  var SHARD = { ice: 'Frost Shard', lava: 'Ember Shard', thorn: 'Verdant Shard', sand: 'Dune Shard', void: 'Void Shard', crystal: 'Tide Shard', lightning: 'Storm Shard', blight: 'Blight Shard' };
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  var api = null, box = null, OPEN = 'w3d_dragon_tracker_open', peekUntil = 0, lastHtml = '';
  function owned() { return load(KEY); }
  function list() { var o = owned(); return (api && api.dragons || []).map(function (d) { return { id: d.id, name: d.name, element: d.element, shard: SHARD[d.element] || 'Dragon Shard', have: !!o[d.id], asleep: d.state === 'sleep' }; }); }
  // COMPACT TRACKER (2026-11-05, owner: "side popups ... make sure nothing is in the way"): a one-line chip by default; click to pin the full
  // list open (remembered). It peeks open for 6 s when something happens (mission briefing, shard won), then folds away again.
  function pinned() { try { return localStorage.getItem(OPEN) === '1'; } catch (e) { return false; } }
  function render() {
    if (!box || typeof document === 'undefined') return; var L = list(), n = L.filter(function (m) { return m.have; }).length, open = pinned() || Date.now() < peekUntil;
    var h = '<div style="font-weight:700;letter-spacing:.1em;color:#e8c45c;white-space:nowrap">DRAGON SHARDS ' + n + '/' + L.length + ' <span style="opacity:.7">' + (open ? '▾' : '▸') + '</span></div>' +
      (open ? L.map(function (m) { return '<div style="opacity:' + (m.have ? 1 : 0.75) + '">' + (m.have ? '◆ ' : '◇ ') + m.shard + (m.have ? '' : ' <span style="opacity:.6">- ' + m.name + '</span>') + '</div>'; }).join('') : '');
    if (h !== lastHtml) { box.innerHTML = h; lastHtml = h; }                                  // no DOM churn every 2 s when nothing changed
    box.style.padding = open ? '8px 11px' : '6px 11px';
  }
  function peek() { peekUntil = Date.now() + 6000; render(); setTimeout(render, 6100); }
  function award(e) {
    if (!e || !e.id) return; var o = owned(), d = api && api.dragons.find(function (x) { return x.id === e.id; }), sh = SHARD[(d && d.element) || e.element] || 'Dragon Shard';
    if (!o[e.id]) { o[e.id] = { shard: sh, at: Date.now() }; save(KEY, o); }
    var n = Object.keys(o).length, total = (api && api.dragons && api.dragons.length) || n;   // was a hard-coded /7 while the tracker counted every dragon
    if (root.__toast) root.__toast('🐉 ' + (e.name || 'The dragon') + ' is defeated - you obtained the ' + sh + ' (' + n + '/' + total + ')'); peek();
  }
  function attach(dr) {
    api = dr; if (typeof document === 'undefined' || /[?&]shards=0\b/.test(location.search || '')) return;
    box = document.createElement('div'); box.id = 'dragon-shards'; box.setAttribute('role', 'button'); box.setAttribute('tabindex', '0'); box.title = 'Dragon missions: click to show or hide the list';
    box.style.cssText = "position:fixed;right:14px;top:120px;z-index:40;font:600 11.5px/1.5 'Chakra Petch','IBM Plex Mono',ui-monospace,sans-serif;color:#e9f4ee;" +
      'background:linear-gradient(180deg,rgba(12,18,30,.88),rgba(5,8,15,.94));border:1px solid rgba(232,196,92,.34);border-radius:11px;padding:6px 11px;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.5);pointer-events:auto;cursor:pointer;user-select:none;max-width:250px';
    var toggle = function () { try { localStorage.setItem(OPEN, pinned() ? '0' : '1'); } catch (e) { } peekUntil = 0; render(); };
    box.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    document.body.appendChild(box); render();
    var seen = load(SEEN);
    setInterval(function () {   // mission briefing the first time you come within 700 m of a sleeping dragon
      var P = root.__w3dDebug && root.__w3dDebug.playerPos; if (!P || !api) return; var U = 7 / 1.8;
      api.dragons.forEach(function (d) { if (seen[d.id] || d.defeated || owned()[d.id]) return; if (Math.hypot(d.f.x - P.x, d.f.z - P.z) / U < 700) { seen[d.id] = 1; save(SEEN, seen); peek(); if (root.__toast) root.__toast('Mission: ' + d.name + ' sleeps nearby - defeat it to claim the ' + (SHARD[d.element] || 'shard')); } });
      render();
    }, 2000);
  }
  root.WorldDragonShards = { attach: attach, award: award, owned: owned, list: list, SHARD: SHARD };
})(typeof window !== 'undefined' ? window : globalThis);
