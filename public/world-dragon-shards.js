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
  var SHARD = { ice: 'Frost Shard', lava: 'Ember Shard', thorn: 'Verdant Shard', sand: 'Dune Shard', void: 'Void Shard', crystal: 'Tide Shard', lightning: 'Storm Shard' };
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  var api = null, box = null;
  function owned() { return load(KEY); }
  function list() { var o = owned(); return (api && api.dragons || []).map(function (d) { return { id: d.id, name: d.name, element: d.element, shard: SHARD[d.element] || 'Dragon Shard', have: !!o[d.id], asleep: d.state === 'sleep' }; }); }
  function render() {
    if (!box || typeof document === 'undefined') return; var L = list(), n = L.filter(function (m) { return m.have; }).length;
    box.innerHTML = '<div style="font-weight:700;letter-spacing:.08em;color:#ffd27a">DRAGON SHARDS ' + n + '/' + L.length + '</div>' +
      L.map(function (m) { return '<div style="opacity:' + (m.have ? 1 : 0.75) + '">' + (m.have ? '◆ ' : '◇ ') + m.shard + (m.have ? '' : ' <span style="opacity:.6">- ' + m.name + '</span>') + '</div>'; }).join('');
  }
  function award(e) {
    if (!e || !e.id) return; var o = owned(), d = api && api.dragons.find(function (x) { return x.id === e.id; }), sh = SHARD[(d && d.element) || e.element] || 'Dragon Shard';
    if (!o[e.id]) { o[e.id] = { shard: sh, at: Date.now() }; save(KEY, o); }
    var n = Object.keys(o).length; if (root.__toast) root.__toast('🐉 ' + (e.name || 'The dragon') + ' is defeated - you obtained the ' + sh + ' (' + n + '/7)'); render();
  }
  function attach(dr) {
    api = dr; if (typeof document === 'undefined' || /[?&]shards=0\b/.test(location.search || '')) return;
    box = document.createElement('div'); box.id = 'dragon-shards';
    box.style.cssText = 'position:fixed;right:14px;top:120px;z-index:40;font:12px/1.5 system-ui,sans-serif;color:#e8eef5;background:rgba(8,12,20,.55);border:1px solid rgba(255,210,122,.25);border-radius:10px;padding:8px 11px;pointer-events:none;max-width:240px';
    document.body.appendChild(box); render();
    var seen = load(SEEN);
    setInterval(function () {   // mission briefing the first time you come within 700 m of a sleeping dragon
      var P = root.__w3dDebug && root.__w3dDebug.playerPos; if (!P || !api) return; var U = 7 / 1.8;
      api.dragons.forEach(function (d) { if (seen[d.id] || d.defeated || owned()[d.id]) return; if (Math.hypot(d.f.x - P.x, d.f.z - P.z) / U < 700) { seen[d.id] = 1; save(SEEN, seen); if (root.__toast) root.__toast('Mission: ' + d.name + ' sleeps nearby - defeat it to claim the ' + (SHARD[d.element] || 'shard')); } });
      render();
    }, 2000);
  }
  root.WorldDragonShards = { attach: attach, award: award, owned: owned, list: list, SHARD: SHARD };
})(typeof window !== 'undefined' ? window : globalThis);
