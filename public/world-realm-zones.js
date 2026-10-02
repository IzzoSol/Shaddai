/* world-realm-zones.js — runtime that applies realm hazards + passive/fight mode to the player.
 *   WorldRealmZones.create({ layout, getPos, getHP, setHP, perk, onHurt, toast, mode, hazards, clock })
 *   .update(dt)   per frame (cheap: one biome lookup, throttled to 4 Hz)
 *   .state()      { realm, zone, warn, drain, forcedFight }
 * Zones: Castle realm (darkforest) core around the keep = poison gas; Arctic = deep cold; Volcano = scorching air; the Void forces FIGHT mode.
 * Gear comes from perks (world-inventory ShdInv): mask-gas / mask-lava / mask-arctic (level numbers) and resist-fire / resist-cold / resist-poison / resist-void (0..1).
 * SAFETY: until the gear shop exists, hazards only weaken you: HP never drops below FLOOR (25) from a hazard.
 */
(function (root) {
  'use strict';
  var FLOOR = 25, TICK = 0.25, GAS_R_M = 300;
  var REALM_ZONE = { arctic: 'arctic-cold', volcano: 'ember-heat' };
  function create(o) {
    var H = o.hazards || root.WorldRealmHazards, M = o.mode || root.WorldCombatMode, U = 7 / 1.8, acc = 0, st = { realm: null, zone: null, warn: null, drain: 1, forcedFight: false }, warnT = -99, now = o.clock || function () { return Date.now() / 1000; };
    function gear() {
      var p = o.perk || function () { return 0; };
      return { masks: { gas: +p('mask-gas') || 0, lava: +p('mask-lava') || 0, arctic: +p('mask-arctic') || 0 },
        resist: { fire: +p('resist-fire') || 0, cold: +p('resist-cold') || 0, poison: +p('resist-poison') || 0, void: +p('resist-void') || 0 } };
    }
    function realmAt(x, z) { var b = o.layout && o.layout.biomeAt ? o.layout.biomeAt(x, z) : null; return b || null; }
    if (M && o.layout) M.setInVoid(function (x, z) { var b = realmAt(x, z); return !!b && b.id === 'void'; });
    function zoneFor(b, x, z) {
      if (!b) return null;
      if (b.id === 'darkforest') { var c = b.center || [0, 0]; return Math.hypot(x - c[0], z - c[1]) <= GAS_R_M * U ? 'castle-gas' : null; }
      return REALM_ZONE[b.id] || null;
    }
    function update(dt) {
      var P = o.getPos(); if (!P) return st;
      if (M) M.update(P.x, P.z);
      acc += dt; if (acc < TICK) return st; var step = acc; acc = 0;
      var b = realmAt(P.x, P.z), zid = zoneFor(b, P.x, P.z);
      st.realm = b ? b.id : null; st.zone = zid; st.forcedFight = !!(M && M.locked()); st.warn = null; st.drain = 1;
      if (!zid || !H) return st;
      var r = H.tick(zid, gear(), step); st.warn = r.warn; st.drain = 1 + r.stamina;
      if (r.hp > 0) {
        var hp = o.getHP(); if (hp > FLOOR) { var nhp = Math.max(FLOOR, hp - r.hp); o.setHP(nhp); if (o.onHurt && hp - nhp > 0.5) o.onHurt(hp - nhp); }
      }
      if (st.warn && o.toast && now() - warnT > 12) { warnT = now(); o.toast(H.ZONES[zid].name + ' - ' + st.warn); }
      return st;
    }
    return { update: update, state: function () { return st; }, gear: gear };
  }
  root.WorldRealmZones = { create: create, FLOOR: FLOOR };
})(typeof window !== 'undefined' ? window : globalThis);
