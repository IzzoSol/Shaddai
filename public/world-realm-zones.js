/* world-realm-zones.js — runtime that applies realm hazards + passive/fight mode to the player.
 *   WorldRealmZones.create({ layout, getPos, getHP, setHP, perk, onHurt, toast, mode, hazards, clock, castle })
 *   castle() -> { castle:{x,y,z}, pitCentre:{x,z} } | null   (world-void-castle anchors; gas around the keep, purple lava in the pit below the lip)
 *   .update(dt)   per frame (cheap: one biome lookup, throttled to 4 Hz)
 *   .state()      { realm, zone, warn, drain, forcedFight }
 * Zones: the VOID CASTLE keep = poison gas; the pit below the bridge = purple lava; Arctic realm = deep cold; Volcano realm = scorching air; the Void realm forces FIGHT mode.
 * Realm membership is STRICT (inside the realm's wedge and radius band); the layout's nearest-realm fallback is never used for hazards.
 * Gear comes from perks (world-inventory ShdInv): mask-gas / mask-lava / mask-arctic (level numbers) and resist-fire / resist-cold / resist-poison / resist-void (0..1).
 * SAFETY: until the gear shop exists, hazards only weaken you: HP never drops below FLOOR (25) from a hazard.
 */
(function (root) {
  'use strict';
  var FLOOR = 25, TICK = 0.25, GAS_R_M = 120, PIT_R_M = 165, LAVA_BELOW_M = 25;
  var REALM_ZONE = { arctic: 'arctic-cold', volcano: 'ember-heat' };
  function create(o) {
    var H = o.hazards || root.WorldRealmHazards, M = o.mode || root.WorldCombatMode, U = 7 / 1.8, acc = 0, st = { realm: null, zone: null, warn: null, drain: 1, forcedFight: false }, warnT = -99, now = o.clock || function () { return Date.now() / 1000; };
    function gear() {
      var p = o.perk || function () { return 0; };
      return { masks: { gas: +p('mask-gas') || 0, lava: +p('mask-lava') || 0, arctic: +p('mask-arctic') || 0 },
        resist: { fire: +p('resist-fire') || 0, cold: +p('resist-cold') || 0, poison: +p('resist-poison') || 0, void: +p('resist-void') || 0 } };
    }
    function norm(d) { d %= 360; return d < 0 ? d + 360 : d; }
    /* strict realm: inside the wedge (compass degrees, clockwise from north) AND the radius band; null in the Grid core, ring zone and wilderness */
    function realmAt(x, z) {
      var bs = o.layout && o.layout.biomes; if (!bs) return null;
      var deg = norm(Math.atan2(x, -z) * 180 / Math.PI), r = Math.hypot(x, z);
      for (var i = 1; i < bs.length; i++) { var b = bs[i], s = b.sector; if (!s) continue;
        var span = norm(s.c1 - s.c0) || 360; if (norm(deg - s.c0) <= span && r >= s.r0 && r <= s.r1) return b; }
      return null;
    }
    if (M && o.layout) M.setInVoid(function (x, z) { var b = realmAt(x, z); return !!b && b.id === 'void'; });
    function zoneFor(b, P) {
      var C = o.castle && o.castle();
      if (C && C.castle) {
        var dx = P.x - C.castle.x, dz = P.z - C.castle.z;
        if (C.pitCentre && Math.hypot(P.x - C.pitCentre.x, P.z - C.pitCentre.z) <= PIT_R_M * U && P.y != null && P.y < C.castle.y - LAVA_BELOW_M * U) return 'castle-lava';
        if (Math.hypot(dx, dz) <= GAS_R_M * U) return 'castle-gas';
      }
      return b ? (REALM_ZONE[b.id] || null) : null;
    }
    function update(dt) {
      var P = o.getPos(); if (!P) return st;
      if (M) M.update(P.x, P.z);
      acc += dt; if (acc < TICK) return st; var step = acc; acc = 0;
      var b = realmAt(P.x, P.z), zid = zoneFor(b, P);
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
