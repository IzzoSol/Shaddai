/* world-realm-hazards.js — REALM HAZARDS + PROTECTIVE GEAR (pure rules, no DOM).
 *   Each realm has hazard zones (poison gas, purple lava, cold, heat). Gear lowers the damage / stamina drain:
 *     masks:   mask-gas (level 1..), mask-lava, mask-arctic, mask-wrap (desert head + feet wrap)   -> a mask only fully protects at or above the zone's required level
 *     clothes: suit-fire, suit-frost, suit-void               -> each piece resists one element (0..0.6), pieces of the same element stack to a cap
 *   WorldRealmHazards.ZONES            known zone templates
 *   WorldRealmHazards.tick(zone, gear, dt) -> { hp, stamina, warn }   damage per second applied over dt (hp = damage dealt, stamina = drain multiplier extra)
 *   WorldRealmHazards.zoneAt(realmZones, x, z) -> zone | null   (circles / boxes)
 * gear = { masks: { gas: 0..n, lava: 0..n, arctic: 0..n, wrap: 0..n }, resist: { fire: 0..1, cold: 0..1, poison: 0..1, void: 0..1, sun: 0..1 } }
 */
(function (root) {
  'use strict';
  // dps = health damage per second unprotected; drain = extra stamina drain multiplier unprotected; need = {mask, level} = the mask that counters it
  var ZONES = {
    'castle-gas':   { name: 'Poison Gas',   element: 'poison', dps: 6,  drain: 0.5, need: { mask: 'gas', level: 10 } },
    'castle-lava':  { name: 'Purple Lava',  element: 'fire',   dps: 14, drain: 0.3, need: { mask: 'lava', level: 5 }, contact: true },
    'arctic-cold':  { name: 'Deep Cold',    element: 'cold',   dps: 2,  drain: 1.2, need: { mask: 'arctic', level: 3 } },
    'ember-heat':   { name: 'Scorching Air', element: 'fire',  dps: 3,  drain: 0.8, need: { mask: 'lava', level: 2 } },
    'void-drain':   { name: 'Void Drain',   element: 'void',   dps: 4,  drain: 1.0, need: { mask: 'gas', level: 1 } },   // owner 2026-10-22: the void needs a gas mask (Void Respirator)
    'desert-sun':   { name: 'Searing Sun',  element: 'sun',    dps: 2,  drain: 1.0, need: { mask: 'wrap', level: 1 } }   // owner 2026-10-22: Desert Wrap covers head + feet
  };
  var CAP = 0.85;
  function lvl(gear, m) { return (gear && gear.masks && gear.masks[m]) || 0; }
  function res(gear, e) { var r = (gear && gear.resist && gear.resist[e]) || 0; return Math.max(0, Math.min(CAP, r)); }
  /* mask effect: at/above the required level = blocks the mask-countered part fully (drain relief + 70 % damage); below = proportional */
  function maskK(zone, gear) { if (!zone.need) return 0; var have = lvl(gear, zone.need.mask); return Math.max(0, Math.min(1, have / zone.need.level)); }
  function tick(zone, gear, dt) {
    if (typeof zone === 'string') zone = ZONES[zone]; if (!zone) return { hp: 0, stamina: 0, warn: null };
    var mk = maskK(zone, gear), er = res(gear, zone.element);
    var dmgK = (1 - 0.7 * mk) * (1 - er), drainK = (1 - mk) * (1 - er * 0.5);
    var warn = null; if (zone.need && mk < 1) warn = 'Need ' + zone.need.mask + ' mask level ' + zone.need.level + ' (you have ' + lvl(gear, zone.need.mask) + ')';
    return { hp: zone.dps * dmgK * dt, stamina: zone.drain * drainK, warn: warn, protectedPct: Math.round((1 - dmgK) * 100) };
  }
  function zoneAt(zones, x, z) {
    for (var i = 0; i < (zones || []).length; i++) { var q = zones[i];
      if (q.r != null ? Math.hypot(x - q.x, z - q.z) <= q.r : (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1)) return q; }
    return null;
  }
  root.WorldRealmHazards = { ZONES: ZONES, tick: tick, zoneAt: zoneAt, CAP: CAP };
})(typeof window !== 'undefined' ? window : globalThis);
