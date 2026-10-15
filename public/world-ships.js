/* world-ships.js — NAVAL SHIP TIERS: 3 classes x 3 tiers, ownership, upgrades (engine / handling / hull), loss + rebuy. Sparks are closed-loop: this module only SPENDS.
 *   WorldShips.CATALOG                [{ id:'galleon-2', cls:'galleon'|'skimmer'|'nautilus', tier:1..3, name, price, speed, turn, hp, reload, note }]
 *   WorldShips.buy(id, spend?)        spend = (n, kind, id) => bool (defaults to ShdSparks.spend). Refused (no side effects) if unknown / owned / unaffordable.
 *   WorldShips.has(id) / owned() / lost() / select(id) / selected() / lose(id, cause) / replaceCost(id) / summon(id)
 *   WorldShips.upgrade(kind, spend?)  kind: engine|handling|hull, 3 levels, cost 300 / 700 / 1500 (like world-skydock). level(kind)
 *   WorldShips.mult(shipId)           -> { speed, turn, hp, reload }  = tier stats x upgrade levels (reload < 1 = faster). Unknown / unowned ids use the base tier-I stats.
 * Persisted in localStorage shd_ships_v1 (dev); production = economy-service inventory.
 */
(function (root) {
  'use strict';
  var KEY = 'shd_ships_v1', MAXL = 3, TUNE = { rebuyDiscount: 0.15 };
  var UPGRADES = {
    engine: { name: 'Reactor tuning', per: 0.06, cost: [300, 700, 1500], note: '+6% top speed per level' },
    handling: { name: 'Rudder vanes', per: 0.08, cost: [300, 700, 1500], note: '+8% turning per level' },
    hull: { name: 'Ablative plating', per: 0.10, cost: [300, 700, 1500], note: '+10% hull per level' }
  };
  var TIERS = [   // stat multipliers on top of the class base in world-naval.js
    { speed: 1.00, turn: 1.00, hp: 1.00, reload: 1.00 },
    { speed: 1.07, turn: 1.06, hp: 1.20, reload: 0.90 },
    { speed: 1.15, turn: 1.12, hp: 1.45, reload: 0.80 }
  ];
  var NAMES = {
    galleon: ['Bastion Galleon', 'Aegis Dreadnought', 'Leviathan Ironclad'],
    skimmer: ['Dart Skimmer', 'Comet Skimmer', 'Photon Raptor'],
    nautilus: ['Abyss Nautilus', 'Trench Nautilus', 'Void Kraken-Hunter']
  };
  var PRICE = { galleon: [500, 1400, 3200], skimmer: [400, 1200, 2800], nautilus: [600, 1600, 3600] };
  var CATALOG = [];
  ['galleon', 'skimmer', 'nautilus'].forEach(function (cls) {
    for (var t = 0; t < 3; t++) CATALOG.push({ id: cls + '-' + (t + 1), cls: cls, tier: t + 1, name: NAMES[cls][t], price: PRICE[cls][t], speed: TIERS[t].speed, turn: TIERS[t].turn, hp: TIERS[t].hp, reload: TIERS[t].reload, note: cls + ' tier ' + (t + 1) });
  });
  var byId = {}; CATALOG.forEach(function (c) { byId[c.id] = c; });
  function load() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.owned) { j.lost = j.lost || []; j.lv = j.lv || {}; j.sel = j.sel || null; return j; } } catch (e) { } return { owned: [], lost: [], sel: null, lv: {} }; }
  var S = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function defSpend() { var sp = root.ShdSparks; return sp && sp.spend ? function (n, k, id) { return sp.spend(n, k, id); } : null; }
  function has(id) { return S.owned.some(function (o) { return o.id === id; }); }
  function replaceCost(id) { var c = byId[id]; if (!c) return 0; return S.lost.indexOf(id) >= 0 ? Math.round(c.price * (1 - TUNE.rebuyDiscount)) : c.price; }
  function buy(id, spend) {
    var c = byId[id]; if (!c) return { ok: false, why: 'unknown ship' };
    if (has(id)) return { ok: false, why: 'you already own it' };
    var cost = replaceCost(id); spend = spend || defSpend();
    if (!spend || !spend(cost, 'ship', id)) return { ok: false, why: 'not enough Sparks (' + cost + ')' };
    S.owned.push({ id: id, at: Date.now() }); S.lost = S.lost.filter(function (x) { return x !== id; }); if (!S.sel) S.sel = id; save();
    return { ok: true, paid: cost, item: c };
  }
  function select(id) { if (!has(id)) return false; S.sel = id; save(); return true; }
  function lose(id, cause) {
    if (!has(id)) return false;
    S.owned = S.owned.filter(function (o) { return o.id !== id; }); if (S.lost.indexOf(id) < 0) S.lost.push(id);
    if (S.sel === id) S.sel = S.owned.length ? S.owned[0].id : null; save();
    toast('You lost your ' + byId[id].name + ' (' + (cause || 'sunk') + '). Rebuy at the harbor.'); return true;
  }
  function summon(id) { var c = byId[id]; if (!c || !has(id)) return null; return { id: id, cls: c.cls, tier: c.tier, name: c.name, mult: mult(id) }; }
  function level(kind) { return S.lv[kind] || 0; }
  function upgrade(kind, spend) {
    var u = UPGRADES[kind]; if (!u) return { ok: false, msg: 'Unknown upgrade' };
    var L = level(kind); if (L >= MAXL) return { ok: false, msg: u.name + ' is maxed' };
    var cost = u.cost[L]; spend = spend || defSpend();
    if (!spend || !spend(cost, 'ship-upgrade', kind)) return { ok: false, msg: 'Needs ' + cost + ' Sparks' };
    S.lv[kind] = L + 1; save(); return { ok: true, msg: u.name + ' level ' + (L + 1), paid: cost };
  }
  function mult(id) {
    var c = byId[id] || { speed: 1, turn: 1, hp: 1, reload: 1 };
    return { speed: c.speed * (1 + UPGRADES.engine.per * level('engine')), turn: c.turn * (1 + UPGRADES.handling.per * level('handling')), hp: c.hp * (1 + UPGRADES.hull.per * level('hull')), reload: c.reload };
  }
  root.WorldShips = {
    CATALOG: CATALOG, UPGRADES: UPGRADES, MAXL: MAXL, TUNE: TUNE, def: function (id) { return byId[id]; }, ofClass: function (cls) { return CATALOG.filter(function (c) { return c.cls === cls; }); },
    buy: buy, has: has, owned: function () { return S.owned.slice(); }, lost: function () { return S.lost.slice(); }, select: select, selected: function () { return S.sel; },
    lose: lose, replaceCost: replaceCost, summon: summon, level: level, upgrade: upgrade, mult: mult, _reset: function () { S = { owned: [], lost: [], sel: null, lv: {} }; save(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
