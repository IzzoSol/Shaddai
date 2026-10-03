/* world-buffs.js — timed BUFFS from food, drink and vendors (so vending actually matters).
 *   WorldBuffs.DEFS                      id -> { name, dur_s, resist?:{fire|cold|poison|void: 0..}, drain?: multiplier on hazard stamina drain }
 *   WorldBuffs.fromItem(itemName)        -> buff id | null     (vendor item name -> buff)
 *   WorldBuffs.add(id) · active() · resist(element) · drainMult() · clear()
 * Absolute expiry timestamps are persisted (localStorage 'shd_buffs_v1'), so a refresh keeps them; re-eating refreshes the timer instead of stacking.
 * Consumers: world-realm-zones.js (resist + drain), the Navi MODES tab (list). Pure: clock injectable via WorldBuffs._setClock.
 */
(function (root) {
  'use strict';
  var KEY = 'shd_buffs_v1', clock = function () { return Date.now(); };
  var DEFS = {
    rested: { name: 'Rested', dur_s: 180, drain: 0.8, note: 'hazard stamina drain -20%' },
    warm: { name: 'Warm', dur_s: 300, resist: { cold: 0.25 }, note: 'cold damage -25%' },
    calm: { name: 'Calm Focus', dur_s: 300, resist: { poison: 0.15 }, note: 'gas damage -15%' },
    fizzed: { name: 'Fizzed Up', dur_s: 120, drain: 0.9, note: 'hazard stamina drain -10%' },
    kicked: { name: 'Mule Kick', dur_s: 180, resist: { fire: 0.1 }, note: 'fire damage -10%' }
  };
  var ITEMS = { 'Spark Noodles': 'rested', 'Ember Skewer': 'warm', 'Nebula Nachos': 'rested', 'Void Fizz': 'fizzed', 'Aurora Tea': 'calm', 'Mecha-Mule': 'kicked' };
  var S = {}; try { S = JSON.parse(root.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { S = {}; }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function prune() { var t = clock(), ch = false; for (var k in S) if (S[k] <= t) { delete S[k]; ch = true; } if (ch) save(); }
  function add(id) { if (!DEFS[id]) return false; S[id] = clock() + DEFS[id].dur_s * 1000; save(); return true; }
  function active() { prune(); var t = clock(); return Object.keys(S).map(function (k) { return { id: k, name: DEFS[k].name, left_s: Math.max(0, Math.round((S[k] - t) / 1000)), note: DEFS[k].note }; }); }
  function resist(el) { prune(); var r = 0; for (var k in S) { var d = DEFS[k]; if (d && d.resist && d.resist[el]) r += d.resist[el]; } return Math.min(0.6, r); }
  function drainMult() { prune(); var m = 1; for (var k in S) { var d = DEFS[k]; if (d && d.drain) m *= d.drain; } return Math.max(0.5, m); }
  root.WorldBuffs = { DEFS: DEFS, ITEMS: ITEMS, fromItem: function (n) { return ITEMS[n] || null; }, add: add, active: active, resist: resist, drainMult: drainMult, clear: function () { S = {}; save(); }, _setClock: function (f) { clock = f; } };
})(typeof window !== 'undefined' ? window : globalThis);
