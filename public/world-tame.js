/* world-tame.js — DRAGON TAMING by crafting (dragons are fought in the wild; a tamed one is earned, not found).
 *   WorldTame.RECIPES        potions + the items they eat
 *   WorldTame.craft(inv, id, skills) -> {ok, reason?}   needs the Academy skill + every material (taken only on success)
 *   WorldTame.tame(inv, dragonKind, skills) -> {ok, reason?}   consumes 1 dragon potion + the lure items; unlocks the dragon as a ride
 *   WorldTame.owned() / has(kind)  (localStorage 'shd_tame_v1')
 * inv = { get(k), take(k,n), add(k,n) } (world-inventory.js ShdInv); skills = { has(id) } (Academy learned flags).
 */
(function (root) {
  'use strict';
  var RECIPES = {
    'potion-ember': { name: 'Ember Dragon Potion', skill: 'alchemy-1', needs: { 'wolf-hide': 6, 'bone-shard': 8, 'ember-herb': 3 }, makes: 'potion-dragon' },
    'potion-frost': { name: 'Frost Dragon Potion', skill: 'alchemy-1', needs: { 'wolf-hide': 6, 'skeleton-core': 4, 'frost-berry': 3 }, makes: 'potion-dragon' },
    'potion-storm': { name: 'Storm Dragon Potion', skill: 'alchemy-2', needs: { 'wolf-hide': 10, 'skeleton-core': 8, 'golden-grain': 5, 'void-dust': 1 }, makes: 'potion-dragon' }
  };
  var LURE = { ember: { 'raw-meat': 4 }, frost: { 'raw-fish': 6 }, storm: { 'raw-meat': 6, 'golden-grain': 2 } };
  var KEY = 'shd_tame_v1';
  function load() { try { return JSON.parse(root.localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(a) { try { root.localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { } }
  function missing(inv, needs) { for (var k in needs) if (inv.get(k) < needs[k]) return k; return null; }
  function craft(inv, id, skills) {
    var r = RECIPES[id]; if (!r) return { ok: false, reason: 'unknown recipe' };
    if (r.skill && !(skills && skills.has(r.skill))) return { ok: false, reason: 'learn ' + r.skill + ' at the Academy first' };
    var miss = missing(inv, r.needs); if (miss) return { ok: false, reason: 'need ' + r.needs[miss] + ' ' + miss };
    for (var k in r.needs) inv.take(k, r.needs[k]);
    inv.add(r.makes, 1); return { ok: true, makes: r.makes };
  }
  function tame(inv, kind, skills) {
    if (!LURE[kind]) return { ok: false, reason: 'that dragon cannot be tamed' };
    if (load().indexOf(kind) >= 0) return { ok: false, reason: 'already tamed' };
    if (!(skills && skills.has('tamer-1'))) return { ok: false, reason: 'learn tamer-1 at the Academy first' };
    if (inv.get('potion-dragon') < 1) return { ok: false, reason: 'need a dragon potion' };
    var miss = missing(inv, LURE[kind]); if (miss) return { ok: false, reason: 'need ' + LURE[kind][miss] + ' ' + miss + ' as a lure' };
    inv.take('potion-dragon', 1); for (var k in LURE[kind]) inv.take(k, LURE[kind][k]);
    var a = load(); a.push(kind); save(a); return { ok: true, kind: kind };
  }
  root.WorldTame = { RECIPES: RECIPES, LURE: LURE, craft: craft, tame: tame, owned: load, has: function (k) { return load().indexOf(k) >= 0; }, _reset: function () { save([]); } };
})(typeof window !== 'undefined' ? window : globalThis);
