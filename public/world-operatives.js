/* world-operatives.js — WHO YOU CAN PLAY AS (owner 2026-10-01): the 8 FORGE archetypes (3D rigged models from the Forge) are the free BASE operatives you start with;
 * the SHADDAI council agents and the villain are premium: pay Sparks once to unlock each, forever (per browser; production = per-account via the ledger).
 *
 *   WorldOperatives.list()          -> [{code, name, color, portrait, base, price, owned, glb}]  bases first
 *   WorldOperatives.owned(code) / price(code) / unlock(code) -> {ok, msg}
 *   WorldOperatives.defaultCode()   -> the first operative you own (a base, for new players)
 *   WorldOperatives.glbFor(code)    -> model url (forge archetype walk GLB, or the council body)
 * Codes: forge archetypes are 'FORGE-<ID>' (e.g. FORGE-VANGUARD); council keep their codenames (SHADDAI, ZEROX, ...).
 * ?unlockall in the page URL owns everything (dev/testing). Prices are Sparks (closed-loop points, never cash). Persistence: localStorage 'shd_ops_v1'.
 */
(function (root) {
  'use strict';
  var BASES = [
    { id: 'vanguard', name: 'VANGUARD', color: 0xff5a6e }, { id: 'ghost', name: 'GHOST', color: 0x9fb0e0 },
    { id: 'artisan', name: 'ARTISAN', color: 0xe8c45c }, { id: 'oracle', name: 'SEER', color: 0xc084fc },
    { id: 'street-deity', name: 'STREET DEITY', color: 0xff9d3d }, { id: 'psionic', name: 'PSIONIC', color: 0x27e0ff },
    { id: 'harvester', name: 'HARVESTER', color: 0x34e5b0 }, { id: 'gaia-link', name: 'GAIA LINK', color: 0x7fe08a }
  ];
  var PREMIUM = [
    { code: 'SHADDAI', color: 0xffcf4a, price: 4000 }, { code: 'ZEROX', color: 0x27e0ff, price: 1500 }, { code: 'ORACLE', color: 0xc084fc, price: 1500 },
    { code: 'NEXUS', color: 0x34e5b0, price: 1500 }, { code: 'TURTLE', color: 0x1fd6c4, price: 1500 }, { code: 'QUILL', color: 0xff9d3d, price: 1500 },
    { code: 'PIKADON', color: 0xff5a6e, price: 1500 }, { code: 'VILLAIN', color: 0xff2a4d, price: 3000 }
  ];
  // ALPHA (2026-10-11, owner: "remove the basic characters from the intro"): the eight forge archetypes are hidden from character select (?basics=1 brings them back)
  // and the eight council agents are free (?strict=1 restores the Sparks prices), so a new player always has real agents to choose from.
  var QS = (root.location && root.location.search) || '', SHOW_BASICS = /[?&]basics=1\b/.test(QS), ALPHA_FREE = !/[?&]strict=1\b/.test(QS);
  var KEY = 'shd_ops_v1';
  function load() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.owned) return j; } catch (e) { } return { owned: {} }; }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function all() { if (/[?&]unlockall\b/.test((root.location && root.location.search) || '')) return true; try { return root.localStorage && root.localStorage.getItem('shd_access') === '4444'; } catch (e) { return false; } }   // owner test access: ?unlockall or the 4444 access code (bottom-right key)
  var ALL = [];
  BASES.forEach(function (b) { ALL.push({ code: 'FORGE-' + b.id.toUpperCase(), name: b.name, color: b.color, base: true, price: 0, portrait: '/assets/forge-models/' + b.id + '-portrait.png', glb: '/assets/forge-models/' + b.id + '-final.glb?v=4' }); });
  PREMIUM.forEach(function (p) { ALL.push({ code: p.code, name: p.code, color: p.color, base: false, price: p.price, portrait: '/assets/agents/' + p.code + (p.code === 'VILLAIN' ? '-action' : '-portrait') + '.png', glb: '/assets/agents/' + p.code + '.glb?v=15' }); });
  function def(code) { code = String(code || '').toUpperCase(); for (var i = 0; i < ALL.length; i++) if (ALL[i].code === code) return ALL[i]; return null; }
  function owned(code) { var d = def(code); return !!d && (d.base || d.price === 0 || ALPHA_FREE || all() || !!S.owned[d.code]); }
  function price(code) { var d = def(code); return d ? d.price : 0; }
  function unlock(code) {
    var d = def(code); if (!d) return { ok: false, msg: 'Unknown operative' };
    if (owned(d.code)) return { ok: true, msg: d.name + ' is already yours' };
    var sp = root.ShdSparks; if (!sp || !sp.spend) return { ok: false, msg: 'Sparks ledger not ready' };
    if (!sp.spend(d.price, 'operative', d.code)) return { ok: false, msg: d.name + ' costs ' + d.price + ' Sparks' };
    S.owned[d.code] = 1; save(); return { ok: true, msg: d.name + ' unlocked' };
  }
  function list() { return ALL.filter(function (d) { return !d.base || SHOW_BASICS; }).map(function (d) { return { code: d.code, name: d.name, color: d.color, portrait: d.portrait, base: d.base, price: d.price, owned: owned(d.code), glb: d.glb }; }); }
  function defaultCode() { var L = ALL.filter(function (d) { return !d.base || SHOW_BASICS; }); for (var i = 0; i < L.length; i++) if (owned(L[i].code)) return L[i].code; return (L[0] || ALL[0]).code; }
  function glbFor(code) { var d = def(code); return d ? d.glb : '/assets/agents/' + encodeURIComponent(String(code).toUpperCase()) + '.glb?v=15'; }
  root.WorldOperatives = { list: list, owned: owned, price: price, unlock: unlock, defaultCode: defaultCode, glbFor: glbFor, def: def, _reset: function () { S = { owned: {} }; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
