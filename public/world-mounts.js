/* world-mounts.js — MOUNT + HOVERBOARD catalog, per-realm STORES, ownership and LOSS rules (owner 2026-09-29).
 *   WorldMounts.CATALOG          mounts + boards: { id, name, kind:'mount'|'board', flying, store:[stationIds], price, model, clips, saddle }
 *   WorldMounts.storesAt(id)     what a realm's mount store sells (stations: arctic, forge, darkvault, harbor, suburb, meadow, desert...)
 *   WorldMounts.buy(id, spend)   spend = (n, kind, id) => bool (ShdSparks.spend). One of each; the FLYING ones cost more.
 *   WorldMounts.owned() / has(id) / lose(id, cause) / replaceCost(id)   you can LOSE a mount or board (destroyed, stolen, abandoned); rebuy at a store (small discount for the loser)
 *   WorldMounts.summon(id)       -> the record to spawn (model url + clips + saddle node name); riding/movement is done by the host (world-riders.js seat sockets)
 * Models: public/assets/mounts/<x>.glb (tools/rig-mount.mjs: procedural rig, clips idle/walk/run, hawk fly/glide/idle, 'saddle' node). Boards: HoverboardKit styles.
 * Prices are Sparks (closed-loop). Persisted in localStorage shd_mounts_v1 (dev); production = economy-service inventory.
 */
(function (root) {
  'use strict';
  var KEY = 'shd_mounts_v1', TUNE = { flyMul: 3.2, rebuyDiscount: 0.15, abandonMin: 60 };
  var CATALOG = [
    { id: 'mammoth', name: 'Glacier Mammoth', kind: 'mount', flying: false, store: ['arctic'], price: 600, model: '/assets/mounts/mammoth.glb', clips: { idle: 'idle', walk: 'walk', run: 'run' }, saddle: 'saddle', note: 'Arctic Vault mount store' },
    { id: 'bull', name: 'Forge Bull', kind: 'mount', flying: false, store: ['forge', 'meadow'], price: 400, model: '/assets/mounts/bull.glb', clips: { idle: 'idle', walk: 'walk', run: 'run' }, saddle: 'saddle', note: 'Emberfall + Meadowfields' },
    { id: 'gorilla', name: 'Canopy Gorilla', kind: 'mount', flying: false, store: ['darkvault', 'suburb'], price: 500, model: '/assets/mounts/gorilla.glb', clips: { idle: 'idle', walk: 'walk', run: 'run' }, saddle: 'saddle', note: 'Darkforest + Suburbs' },
    { id: 'hawk', name: 'Sky Hawk', kind: 'mount', flying: true, store: ['harbor'], price: 0, model: '/assets/mounts/hawk.glb', clips: { idle: 'idle', fly: 'fly', glide: 'glide' }, saddle: 'saddle', note: 'Crystal Harbor - flying, the priciest mount' },
    { id: 'skiff', name: 'Aero Skiff (hover ship)', kind: 'mount', flying: true, store: ['central', 'harbor'], price: 0, model: null, procedural: 'skiff', clips: null, saddle: 'saddle', note: 'flying hover ship - Shaddai neon' },
    { id: 'car-pod', name: 'Rimba Pod Racer', kind: 'mount', flying: false, store: ['central', 'harbor'], price: 1200, model: null, procedural: 'car:pod', clips: null, saddle: 'saddle', note: 'hover racing pod - fastest on the ground' },
    { id: 'car-sedan', name: 'Streak Sedan', kind: 'mount', flying: false, store: ['central', 'suburb'], price: 700, model: null, procedural: 'car:sedan', clips: null, saddle: 'saddle', note: 'retro hover sedan' },
    { id: 'car-van', name: 'Courier Van', kind: 'mount', flying: false, store: ['central', 'suburb', 'forge'], price: 500, model: null, procedural: 'car:van', clips: null, saddle: 'saddle', note: 'hover van - slow, roomy' },
    { id: 'board-street', name: 'Street Hoverboard', kind: 'board', flying: false, store: ['central', 'suburb', 'harbor'], price: 150, style: 'sunburst', note: 'ground board (pad)' },
    { id: 'board-foil', name: 'Foil Hoverboard', kind: 'board', flying: true, store: ['central', 'harbor'], price: 0, style: 'racer', note: 'flying board (foil) - costs more' },
    // HOVERBOARDS v02 (owner 2026-10-16: "the new hoverboard and new ships in the prices"): every K22 board design is its own buy (ground boards)
    { id: 'board-obsidian', name: 'Obsidian Gold Board', kind: 'board', flying: false, store: ['central', 'forge'], price: 450, style: 'obsidian', note: 'v02 board' },
    { id: 'board-redline', name: 'Redline H-Frame Board', kind: 'board', flying: false, store: ['central', 'suburb'], price: 300, style: 'redline', note: 'v02 board' },
    { id: 'board-batwing', name: 'Night Batwing Board', kind: 'board', flying: false, store: ['darkvault', 'central'], price: 350, style: 'batwing', note: 'v02 board' },
    { id: 'board-checker', name: 'Checker Rail Board', kind: 'board', flying: false, store: ['meadow', 'central'], price: 250, style: 'checker', note: 'v02 board' },
    { id: 'board-ringfan', name: 'Quad Ring-Fan Board', kind: 'board', flying: false, store: ['harbor', 'central'], price: 350, style: 'ringfan', note: 'v02 board' },
    { id: 'board-bluejet', name: 'Blue Twin-Jet Board', kind: 'board', flying: false, store: ['arctic', 'central'], price: 300, style: 'bluejet', note: 'v02 board' },
    { id: 'board-hauler', name: 'Brass Hauler Board', kind: 'board', flying: false, store: ['desert', 'central'], price: 200, style: 'hauler', note: 'v02 board' },
    { id: 'board-skullpunk', name: 'Skull Punk Board', kind: 'board', flying: false, store: ['volcano', 'central'], price: 400, style: 'skullpunk', note: 'v02 board' },
    // RACE SHIPS (K5 Blender ships, world-hovercars.js): rideable anywhere as mounts (kart-* = the racing handling); also rentable per race at Race HQ
    { id: 'kart-arrow', name: 'Meridian Arrowhead (race ship)', kind: 'mount', flying: false, store: ['central', 'grid'], price: 1500, model: null, procedural: 'car:arrow', clips: null, saddle: 'saddle', note: 'race ship' },
    { id: 'kart-viper', name: 'Void Viper (race ship)', kind: 'mount', flying: false, store: ['central', 'void'], price: 1500, model: null, procedural: 'car:viper', clips: null, saddle: 'saddle', note: 'race ship' },
    { id: 'kart-raptor', name: 'Night Raptor (race ship)', kind: 'mount', flying: false, store: ['central', 'darkvault'], price: 1600, model: null, procedural: 'car:raptor', clips: null, saddle: 'saddle', note: 'race ship' },
    { id: 'kart-lancer', name: 'Gilded Lancer (race ship)', kind: 'mount', flying: false, store: ['central', 'forge'], price: 1700, model: null, procedural: 'car:lancer', clips: null, saddle: 'saddle', note: 'race ship' },
    { id: 'kart-bruiser', name: 'Iron Bruiser (race ship)', kind: 'mount', flying: false, store: ['central', 'volcano'], price: 1800, model: null, procedural: 'car:bruiser', clips: null, saddle: 'saddle', note: 'race ship' }
  ];
  var BASE = { hawk: 700, skiff: 900, 'board-foil': 350 };   // price before the flying multiplier
  CATALOG.forEach(function (c) { if (c.flying && !c.price) c.price = Math.round(BASE[c.id] * TUNE.flyMul); });
  var byId = {}; CATALOG.forEach(function (c) { byId[c.id] = c; });
  var S = (function () { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.owned) return j; } catch (e) { } return { owned: [], lost: [] }; })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  // ALPHA (2026-10-11, owner: "the mounts don't appear (sky hawk)"): every mount and board is owned from the start; `?strict=1` restores the Sparks stores.
  if (typeof location !== 'undefined' && !/[?&]strict=1/.test(location.search || '')) { CATALOG.forEach(function (c) { if (!has(c.id) && S.lost.indexOf(c.id) < 0) S.owned.push({ id: c.id, at: Date.now(), hp: 100 }); }); }
  function has(id) { return S.owned.some(function (o) { return o.id === id; }); }
  function storesAt(station) { return CATALOG.filter(function (c) { return c.store.indexOf(station) >= 0; }); }
  function replaceCost(id) { var c = byId[id]; if (!c) return 0; return S.lost.indexOf(id) >= 0 ? Math.round(c.price * (1 - TUNE.rebuyDiscount)) : c.price; }
  function buy(id, spend, station) {
    var c = byId[id]; if (!c) return { ok: false, why: 'unknown item' };
    if (station && c.store.indexOf(station) < 0) return { ok: false, why: c.name + ' is not sold at this store' };
    if (has(id)) return { ok: false, why: 'you already own it' };
    var cost = replaceCost(id); if (!spend || !spend(cost, 'mount', id)) return { ok: false, why: 'not enough Sparks (' + cost + ')' };
    S.owned.push({ id: id, at: Date.now(), hp: 100 }); S.lost = S.lost.filter(function (x) { return x !== id; }); save(); return { ok: true, paid: cost, item: c };
  }
  function lose(id, cause) { if (!has(id)) return false;
    var ins = root.ShdInv && root.ShdInv.perk('insured'); if (ins && ins[id]) { delete ins[id]; root.ShdInv.setPerk('insured', ins); if (root.Navi && root.Navi.toast) root.Navi.toast('Insurance paid out - your ' + byId[id].name + ' is repaired'); return false; }   /* PIKADON policy consumed */
    S.owned = S.owned.filter(function (o) { return o.id !== id; }); if (S.lost.indexOf(id) < 0) S.lost.push(id); save(); if (root.Navi && root.Navi.toast) root.Navi.toast('You lost your ' + byId[id].name + ' (' + (cause || 'abandoned') + '). Buy another at a mount store.'); return true; }
  function damage(id, n) { var o = S.owned.filter(function (x) { return x.id === id; })[0]; if (!o) return null; o.hp = Math.max(0, o.hp - n); if (o.hp <= 0) lose(id, 'destroyed'); else save(); return o.hp; }
  function summon(id) { var c = byId[id]; if (!c || !has(id)) return null; return { id: id, procedural: c.procedural || null, kind: c.kind, flying: c.flying, model: c.model || null, style: c.style || null, clips: c.clips || null, saddle: c.saddle || 'stand' }; }
  root.WorldMounts = { CATALOG: CATALOG, TUNE: TUNE, def: function (id) { return byId[id]; }, storesAt: storesAt, buy: buy, has: has, owned: function () { return S.owned.slice(); }, lost: function () { return S.lost.slice(); }, lose: lose, damage: damage, replaceCost: replaceCost, summon: summon, _reset: function () { S = { owned: [], lost: [] }; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
