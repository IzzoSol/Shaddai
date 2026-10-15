/* world-hazards.js — LAVA THAT HURTS (owner 2026-10-02: "lava and health"). Environmental damage with a readable burn, on the overworld AND in the Colosseum lava field.
 *   Standing on lava: 14 HP/s and you CATCH FIRE (3 s of 4 HP/s after you step off). Hovering 0.6 m+ above it (hoverboard, car, flying mount, jetpack) is SAFE — only a HEAT warning.
 *   Water puts you out. EMBER BOOTS (Armory, 900) cut lava damage by 65 %. Death -> WorldSurvival.die('lava') ("YOU BURNED") and the normal respawn.
 *   Overworld lava = where the terrain colour map is molten orange-red (same trick as the grass mask); arena lava = the Colosseum 'lava' field floor, except the obsidian islands.
 *   Feedback: orange edge vignette + "BURNING" label + flames on the avatar, a heat warning near lava, and the HitFX hurt flash when damage lands.
 *
 *   var hz = buildWorldHazards({ THREE, scene, getPlayer()->{pos,alive}, getAvatar?(), heightAt, isSwimming?(), getArena?(), lavaAllow?(x,z), survival?, resist?()->0..1, document? })
 *   hz.update(dt) · hz.zoneAt(pos) -> 'lava'|'arena-lava'|null · hz.state() -> {burning, burnT, inLava, heat} · hz.dispose()
 * Pure helpers (tested): lavaMask(pixels, n, half) · burnStep(st, dt, ctx) · TUNE
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8, TUNE = { lavaDps: 14, burnDps: 4, burnS: 3, safeAlt: 0.6, heatM: 6, chunk: 1 };
  function lavaMask(pixels, n, half) {   // molten: strong red, orange-ish green, almost no blue (not sand, not grass, not asphalt)
    var m = new Uint8Array(n * n), i, r, g, b, k = 0;
    for (i = 0; i < n * n; i++) { r = pixels[i * 4]; g = pixels[i * 4 + 1]; b = pixels[i * 4 + 2]; if (r > 150 && r > g * 1.7 && g > 20 && b < 80 && r > b * 3) { m[i] = 1; k++; } }
    var fn = function (x, z) { var cx = Math.round((x + half) / (2 * half) * (n - 1)), cz = Math.round((z + half) / (2 * half) * (n - 1)); if (cx < 0 || cz < 0 || cx >= n || cz >= n) return false; return m[cz * n + cx] === 1; };
    fn.coverage = k / (n * n); return fn;
  }
  /* one tick of the burn model. st = {burnT, acc}; ctx = {inLava, safe(hovering), swimming, resist(0..1)} -> {dmg, burning} */
  function burnStep(st, dt, ctx) {
    var res = 1 - Math.max(0, Math.min(0.9, ctx.resist || 0)), dmg = 0;
    if (ctx.swimming) st.burnT = 0;
    if (ctx.inLava && !ctx.safe) { dmg += TUNE.lavaDps * res * dt; st.burnT = TUNE.burnS; }
    else if (st.burnT > 0) { dmg += TUNE.burnDps * res * dt; st.burnT = Math.max(0, st.burnT - dt); }
    return { dmg: dmg, burning: st.burnT > 0 };
  }

  function buildWorldHazards(o) {
    var THREE = o.THREE, U = o.U || U0, doc = o.document || (typeof document !== 'undefined' ? document : null), st = { burnT: 0, acc: 0, inLava: false, heat: false, zone: null, dead: false };
    var vig = null, label = null, fx = null, t = 0, v3 = THREE ? new THREE.Vector3() : null;
    if (doc && doc.body) {
      vig = doc.createElement('div'); vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7340;opacity:0;box-shadow:inset 0 0 160px 50px rgba(255,110,20,.8)'; doc.body.appendChild(vig);
      label = doc.createElement('div'); label.style.cssText = 'position:fixed;left:50%;top:30%;transform:translateX(-50%);pointer-events:none;z-index:7341;font:900 22px Orbitron,sans-serif;letter-spacing:.2em;color:#ff9a3a;text-shadow:0 0 12px #ff4a00;opacity:0'; doc.body.appendChild(label);
    }
    if (THREE && o.scene) {   // flames on the avatar while burning (3 additive cones, no light)
      fx = new THREE.Group(); fx.visible = false; [[0xff5a1a, 2.6, 0.6], [0xff9a2a, 2.0, 0.4], [0xffe08a, 1.4, 0.22]].forEach(function (c) { var m = new THREE.Mesh(new THREE.ConeGeometry(c[2] * U, c[1] * U, 8, 1, true), new THREE.MeshBasicMaterial({ color: c[0], transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.position.y = c[1] * U / 2; fx.add(m); }); o.scene.add(fx);
    }
    function arenaZone(p) {
      var A = o.getArena && o.getArena(); if (!A || !A.root || !A.floors || !A.floors.state || A.floors.state.mode !== 'lava') return false;
      v3.set(p.x, p.y, p.z); A.root.worldToLocal(v3); var a = (A.dims && A.dims.A) || 62, b = (A.dims && A.dims.B) || 44; if ((v3.x * v3.x) / (a * a) + (v3.z * v3.z) / (b * b) > 1 || v3.y > 3 || v3.y < -2) return false;
      var isl = A.floors.islands ? A.floors.islands() : []; for (var i = 0; i < isl.length; i++) if (Math.hypot(v3.x - isl[i].x, v3.z - isl[i].z) < isl[i].r + 0.3) return false; return true;
    }
    function zoneAt(p) { if (arenaZone(p)) return 'arena-lava'; if (o.lavaAllow && o.lavaAllow(p.x, p.z)) return 'lava'; return null; }
    function nearLava(p) { if (!o.lavaAllow) return false; var d = TUNE.heatM * U; return o.lavaAllow(p.x + d, p.z) || o.lavaAllow(p.x - d, p.z) || o.lavaAllow(p.x, p.z + d) || o.lavaAllow(p.x, p.z - d); }
    function update(dt) {
      t += dt; var pl = o.getPlayer && o.getPlayer(); if (!pl || !pl.pos || pl.alive === false) { if (fx) fx.visible = false; return; }
      var p = pl.pos, z = zoneAt(p), alt = z === 'arena-lava' ? 0 : (p.y - o.heightAt(p.x, p.z)) / U, safe = alt > TUNE.safeAlt, swim = !!(o.isSwimming && o.isSwimming());
      st.zone = z; st.inLava = !!z; st.heat = !z && nearLava(p) || (!!z && safe);
      var r = burnStep(st, dt, { inLava: !!z, safe: safe, swimming: swim, resist: o.resist ? o.resist() : 0 });
      if (r.dmg > 0) { st.acc += r.dmg; if (st.acc >= TUNE.chunk) { var n = Math.floor(st.acc / TUNE.chunk) * TUNE.chunk; st.acc -= n; if (o.survival && o.survival.damage) o.survival.damage(n, 'lava'); if (o.onHurt) o.onHurt(n); } }
      var burning = r.burning;
      if (vig) { vig.style.opacity = burning ? String(0.45 + 0.25 * Math.sin(t * 9)) : (st.heat ? '0.12' : '0'); label.style.opacity = burning ? '1' : (st.heat ? '0.7' : '0'); label.textContent = burning ? 'BURNING' : (st.heat ? 'HEAT' : ''); }
      if (fx) { var av = o.getAvatar && o.getAvatar(); fx.visible = burning && !!av; if (fx.visible) { fx.position.copy(av.position); fx.children.forEach(function (c, i) { c.rotation.y = t * (3 + i); c.scale.set(1, 0.85 + 0.25 * Math.sin(t * (11 + i * 5)), 1); }); } }
    }
    return { update: update, zoneAt: zoneAt, state: function () { return { burning: st.burnT > 0, burnT: st.burnT, inLava: st.inLava, heat: st.heat, zone: st.zone }; }, dispose: function () { if (vig && vig.parentNode) vig.parentNode.removeChild(vig); if (label && label.parentNode) label.parentNode.removeChild(label); if (fx && o.scene) o.scene.remove(fx); } };
  }
  root.buildWorldHazards = buildWorldHazards; root.WorldHazards = { lavaMask: lavaMask, burnStep: burnStep, TUNE: TUNE };
})(typeof window !== 'undefined' ? window : globalThis);
