/* world-campfire.js — FIRE BUILDING (owner 2026-10-01: "cosmetics for fire building ... lighting a fire at night and the visual of it").
 *   Buy a CAMP KIT (80) -> press the CAMP button / `Digit?`-free key `Backslash` -> you KNEEL (1.0 s), sparks fly (0.8 s), the flame CATCHES (1.5 s), then it burns for 6 min.
 *   A LOG (45) adds 2 min (max 15 min on one fire). The last 20 s it DIES DOWN (smaller flame, embers, smoke), then smoulders as coals for 30 s.
 *   WARMTH: within 9 m of a burning fire you heal ~1.5 HP/s (only when you have not been hit for 3 s) · SAFE ZONE: animals keep away (wolves almost ignore you, everything else aggros at 60 %).
 *   Visual: crossed logs + stone ring, 3 nested additive flame cones that flicker, rising embers, smoke, ground glow, ONE real point light on the nearest fire (light budget!). Brighter relative to the dark: strongest at night.
 *   COSMETIC FLAMES (250 each, 400 for blue): classic orange, emerald, violet, gold-white, blue — visual only.   Max 3 fires, 4 m apart, 5 s cooldown, never in water.
 *   WorldCampfire.create({ THREE, scene, heightAt, getPlayer, getNight, waterAt?, onKneel?(bool), onHeal?(hp), U? }) -> { place(), update(dt), fires(), isSafe(x,z), warmAt(x,z), dispose() }
 *   WorldCampfire.buyKit() / buyLog() / buyStyle(id) / equipStyle(id) / state() / kits() · pure: phaseOf(f) · lightLevel(f, night, t) · healPerSecond · STYLES
 * Persistence: localStorage 'shd_camp_v1' (kits, logs, owned styles, equipped). Sparks are closed-loop points.
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8, KEY = 'shd_camp_v1';
  var T = { kneel: 1.0, spark: 0.8, catchS: 1.5, burnBase: 360, logS: 120, maxBurn: 900, dyingS: 20, coalsS: 30, warmR: 9, safeR: 12, heal: 1.5, healGap: 3, maxFires: 3, minGap: 4, cooldown: 5 };
  var PRICES = { kit: 80, log: 45 };
  var STYLES = { classic: { name: 'Classic', price: 0, core: 0xffe08a, mid: 0xff9a2a, out: 0xff5a1a, light: 0xff9a40 }, emerald: { name: 'Emerald', price: 250, core: 0xb8ffe0, mid: 0x00ff9c, out: 0x00a870, light: 0x20ffaa },
    violet: { name: 'Violet', price: 250, core: 0xe6d0ff, mid: 0xb06bff, out: 0x6a2cd0, light: 0xa070ff }, gold: { name: 'Gold-white', price: 250, core: 0xfff2c8, mid: 0xffd36a, out: 0xe0a020, light: 0xffd88a }, blue: { name: 'Blue flame', price: 400, core: 0xcfe8ff, mid: 0x4aa0ff, out: 0x1a50d0, light: 0x60b0ff } };
  function load() { try { var j = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (j && j.owned) return j; } catch (e) { } return { kits: 0, logs: 0, owned: { classic: 1 }, style: 'classic' }; }
  var S = load(); function save() { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function spend(n, k, id) { var sp = root.ShdSparks; return !!(sp && sp.spend && sp.spend(n, k, id)); }

  // ---------- pure helpers (tested) ----------
  /* fire f = { age, burnS } -> phase. ignition timeline: kneel -> spark -> catch -> burning -> dying -> coals -> out */
  function phaseOf(f) {
    var a = f.age, t1 = T.kneel, t2 = t1 + T.spark, t3 = t2 + T.catchS, tb = t3 + f.burnS, td = tb + T.dyingS, tc = td + T.coalsS;
    if (a < t1) return 'kneel'; if (a < t2) return 'spark'; if (a < t3) return 'catch'; if (a < tb - T.dyingS) return 'burning'; if (a < tb) return 'dying'; if (a < tc) return 'coals'; return 'out';
  }
  function flameScale(f) {   // 0..1 how big the flame is right now
    var a = f.age, t2 = T.kneel + T.spark, t3 = t2 + T.catchS, tb = t3 + f.burnS, p = phaseOf(f);
    if (p === 'kneel' || p === 'spark') return p === 'spark' ? 0.08 : 0; if (p === 'catch') return (a - t2) / T.catchS; if (p === 'burning') return 1; if (p === 'dying') return 0.25 + 0.75 * Math.max(0, (tb - a) / T.dyingS); return 0;
  }
  function lightLevel(f, night, t) {   // point-light intensity: ramps with the flame, flickers +-12%, brighter in the dark (never zero by day so it still reads)
    var s = flameScale(f), flick = 1 + 0.12 * Math.sin(t * 17 + f.seed) * Math.sin(t * 7.3 + f.seed * 2) + 0.06 * Math.sin(t * 31 + f.seed); return s * flick * (0.45 + 1.55 * Math.max(0, Math.min(1, night)));
  }
  function burning(f) { var p = phaseOf(f); return p === 'burning' || p === 'dying' || p === 'catch'; }
  function healPerSecond(fires, x, z, sinceHit) { if (sinceHit < T.healGap) return 0; for (var i = 0; i < fires.length; i++) { var f = fires[i]; if ((phaseOf(f) === 'burning' || phaseOf(f) === 'dying') && Math.hypot(f.x - x, f.z - z) <= T.warmR * f.U) return T.heal * flameScale(f); } return 0; }
  function isSafe(fires, x, z) { for (var i = 0; i < fires.length; i++) { var f = fires[i]; if (burning(f) && flameScale(f) > 0.3 && Math.hypot(f.x - x, f.z - z) <= T.safeR * f.U) return true; } return false; }

  // ---------- shop ----------
  function buyKit() { if (!spend(PRICES.kit, 'camp', 'kit')) return { ok: false, msg: 'Needs ' + PRICES.kit + ' Sparks' }; S.kits++; save(); return { ok: true, msg: 'Camp kit ready (' + S.kits + ')' }; }
  function buyLog() { if (!spend(PRICES.log, 'camp', 'log')) return { ok: false, msg: 'Needs ' + PRICES.log + ' Sparks' }; S.logs++; save(); return { ok: true, msg: 'Log added (' + S.logs + ')' }; }
  function buyStyle(id) { var st = STYLES[id]; if (!st) return { ok: false, msg: 'Unknown flame' }; if (S.owned[id]) return { ok: false, msg: 'Already owned' }; if (!spend(st.price, 'camp-style', id)) return { ok: false, msg: 'Needs ' + st.price + ' Sparks' }; S.owned[id] = 1; S.style = id; save(); return { ok: true, msg: st.name + ' flame unlocked' }; }
  function equipStyle(id) { if (!STYLES[id] || !S.owned[id]) return { ok: false, msg: 'Not owned' }; S.style = id; save(); return { ok: true, msg: STYLES[id].name + ' equipped' }; }

  // ---------- visuals + runtime ----------
  function create(o) {
    var THREE = o.THREE, U = o.U || U0, list = [], cool = 0, sinceHit = 99, light = new THREE.PointLight(0xff9a40, 0, 26 * U, 1.6), t = 0;
    light.castShadow = false; o.scene.add(light);
    var logGeo = new THREE.CylinderGeometry(0.16 * U, 0.18 * U, 1.5 * U, 7), logMat = new THREE.MeshLambertMaterial({ color: 0x4a3322 }), stoneGeo = new THREE.BoxGeometry(0.45 * U, 0.3 * U, 0.38 * U), stoneMat = new THREE.MeshLambertMaterial({ color: 0x6d6f73 });
    function flameCone(col, h, r) { var m = new THREE.Mesh(new THREE.ConeGeometry(r * U, h * U, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.position.y = h * U / 2; return m; }
    function buildFire(x, z, y, style) {
      var g = new THREE.Group(), st = STYLES[style] || STYLES.classic; g.position.set(x, y, z);
      for (var i = 0; i < 3; i++) { var l = new THREE.Mesh(logGeo, logMat); l.rotation.z = Math.PI / 2 - 0.25; l.rotation.y = i * Math.PI / 3; l.position.y = 0.3 * U; g.add(l); }
      for (var k = 0; k < 9; k++) { var a = k / 9 * Math.PI * 2, s = new THREE.Mesh(stoneGeo, stoneMat); s.position.set(Math.cos(a) * 1.25 * U, 0.15 * U, Math.sin(a) * 1.25 * U); s.rotation.y = a; g.add(s); }
      var fl = new THREE.Group(); var c1 = flameCone(st.out, 2.4, 0.75), c2 = flameCone(st.mid, 1.9, 0.5), c3 = flameCone(st.core, 1.3, 0.28); fl.add(c1); fl.add(c2); fl.add(c3); fl.position.y = 0.35 * U; g.add(fl);
      var glow = new THREE.Mesh(new THREE.CircleGeometry(5 * U, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: st.light, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.position.y = 0.08 * U; g.add(glow);
      var pg = new THREE.BufferGeometry(), N = 24, pp = new Float32Array(N * 3); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); var em = new THREE.Points(pg, (typeof WorldVFX !== 'undefined' && WorldVFX.softPointsMaterial ? WorldVFX.softPointsMaterial(THREE, { color: st.core, size: 0.22 * U, additive: true }) : new THREE.PointsMaterial({ color: st.core, size: 0.22 * U, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))); em.frustumCulled = false; g.add(em);
      var smoke = []; for (var q = 0; q < 4; q++) { var sm = new THREE.Mesh(new THREE.SphereGeometry(0.7 * U, 8, 6), new THREE.MeshBasicMaterial({ color: 0x555a60, transparent: true, opacity: 0, depthWrite: false, fog: false })); sm.visible = false; g.add(sm); smoke.push(sm); }
      return { group: g, flames: [c1, c2, c3], fl: fl, glow: glow, em: em, pp: pp, N: N, smoke: smoke, style: st };
    }
    function place() {
      var pl = o.getPlayer && o.getPlayer(); if (!pl || !pl.pos) return { ok: false, msg: 'Not ready' }; if (cool > 0) return { ok: false, msg: 'Wait a moment' };
      if (S.kits <= 0) return { ok: false, msg: 'You need a camp kit (buy one at the Armory or Sky Dock)' }; if (list.filter(function (f) { return phaseOf(f) !== 'out'; }).length >= T.maxFires) return { ok: false, msg: 'Too many fires (' + T.maxFires + ')' };
      var x = pl.pos.x + Math.sin(o.getYaw ? o.getYaw() : 0) * 2.2 * U, z = pl.pos.z + Math.cos(o.getYaw ? o.getYaw() : 0) * 2.2 * U, y = o.heightAt(x, z);
      if (o.waterAt && o.waterAt(x, z) != null && o.waterAt(x, z) > y - 0.3 * U) return { ok: false, msg: 'Too wet to light a fire here' };
      for (var i = 0; i < list.length; i++) if (phaseOf(list[i]) !== 'out' && Math.hypot(list[i].x - x, list[i].z - z) < T.minGap * U) return { ok: false, msg: 'Too close to another fire' };
      S.kits--; save(); cool = T.cooldown; var v = buildFire(x, z, y, S.style); o.scene.add(v.group);
      var f = { x: x, z: z, y: y, U: U, age: 0, burnS: T.burnBase, seed: Math.random() * 100, v: v, kneeling: true }; list.push(f); if (o.onKneel) o.onKneel(true); return { ok: true, msg: 'Lighting the fire...' };
    }
    function addLog() { var pl = o.getPlayer && o.getPlayer(); if (!pl || S.logs <= 0) return { ok: false, msg: 'No logs (buy them at the Armory)' }; var f = null, bd = 1e9; list.forEach(function (x) { var d = Math.hypot(x.x - pl.pos.x, x.z - pl.pos.z); if (burning(x) && d < bd) { bd = d; f = x; } }); if (!f || bd > 6 * U) return { ok: false, msg: 'Stand next to a burning fire' }; if (f.burnS >= T.maxBurn) return { ok: false, msg: 'The fire is fully stoked' }; S.logs--; save(); f.burnS = Math.min(T.maxBurn, f.burnS + T.logS); return { ok: true, msg: 'Log added: +2 min' }; }
    function update(dt) {
      t += dt; cool = Math.max(0, cool - dt); sinceHit += dt; var night = o.getNight ? o.getNight() : 0, pl = o.getPlayer && o.getPlayer(), best = null, bl = 0;
      for (var i = list.length - 1; i >= 0; i--) {
        var f = list[i]; f.age += dt; var ph = phaseOf(f), s = flameScale(f), v = f.v;
        if (f.kneeling && ph !== 'kneel') { f.kneeling = false; if (o.onKneel && !list.some(function (x) { return x.kneeling; })) o.onKneel(false); }
        v.fl.visible = s > 0.01; v.fl.scale.set(0.5 + 0.5 * s, s * (1 + 0.1 * Math.sin(t * 13 + f.seed)), 0.5 + 0.5 * s); v.flames.forEach(function (c, k) { c.rotation.y = t * (2 + k) + f.seed; c.scale.y = 0.9 + 0.2 * Math.sin(t * (9 + k * 4) + f.seed + k); c.material.opacity = 0.5 + 0.35 * s; });
        v.glow.material.opacity = 0.22 * s * (0.3 + 0.7 * Math.max(0, Math.min(1, night)));
        for (var p = 0; p < v.N; p++) { var life = ((t * 0.7 + p / v.N + f.seed) % 1), a = p * 2.4 + f.seed; v.pp[p * 3] = Math.sin(a) * 0.5 * U * (0.4 + life); v.pp[p * 3 + 1] = (0.4 + life * 3.6) * U; v.pp[p * 3 + 2] = Math.cos(a) * 0.5 * U * (0.4 + life); } v.em.geometry.attributes.position.needsUpdate = true; v.em.visible = (ph === 'spark' || ph === 'catch' || ph === 'burning' || ph === 'dying' || ph === 'coals'); v.em.material.size = (ph === 'spark' ? 0.34 : 0.2) * U * (ph === 'coals' ? 0.5 : 1);
        v.smoke.forEach(function (sm, k) { var on = ph === 'dying' || ph === 'coals'; sm.visible = on; if (on) { var u = ((t * 0.25 + k / 4) % 1); sm.position.set(Math.sin(u * 3 + k) * 0.5 * U, (1.5 + u * 4) * U, Math.cos(u * 2 + k) * 0.5 * U); sm.scale.setScalar(0.6 + u * 1.4); sm.material.opacity = (ph === 'coals' ? 0.12 : 0.22) * (1 - u); } });
        if (ph === 'out') { o.scene.remove(v.group); list.splice(i, 1); continue; }
        if (pl && pl.pos) { var ll = lightLevel(f, night, t), d = Math.hypot(f.x - pl.pos.x, f.z - pl.pos.z); if (burning(f) && ll > 0 && (!best || d < best.d)) { best = { f: f, d: d }; bl = ll; } }
      }
      if (best) { light.color.setHex(best.f.v.style.light); light.position.set(best.f.x, best.f.y + 2.2 * U, best.f.z); light.intensity = bl * 10 * U * U;   /* physical units like the interior lights (40*U*U for a lamp) */ } else light.intensity = 0;
      if (pl && pl.pos && o.onHeal) { var hps = healPerSecond(list, pl.pos.x, pl.pos.z, sinceHit); if (hps > 0) o.onHeal(hps * dt); }
    }
    return { place: place, addLog: addLog, update: update, fires: function () { return list; }, isSafe: function (x, z) { return isSafe(list, x, z); }, warmAt: function (x, z) { return healPerSecond(list, x, z, 99); }, hurt: function () { sinceHit = 0; }, light: light, dispose: function () { list.forEach(function (f) { o.scene.remove(f.v.group); }); list.length = 0; o.scene.remove(light); } };
  }
  root.WorldCampfire = { T: T, PRICES: PRICES, STYLES: STYLES, create: create, buyKit: buyKit, buyLog: buyLog, buyStyle: buyStyle, equipStyle: equipStyle, state: function () { return { kits: S.kits, logs: S.logs, owned: Object.keys(S.owned), style: S.style }; }, phaseOf: phaseOf, flameScale: flameScale, lightLevel: lightLevel, healPerSecond: healPerSecond, isSafe: isSafe, _reset: function () { S = { kits: 0, logs: 0, owned: { classic: 1 }, style: 'classic' }; save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
