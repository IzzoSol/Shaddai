/* world-broadside.js — BROADSIDE FX for the naval galleon: 8 muzzles (4 per side), muzzle flash, tracers, smoke puffs, water columns, synthesized boom.
 * Pure visuals, everything preallocated and pooled (objects are hidden, never added/removed after create). No lights, no Math.random (seeded rng), no files.
 *
 *   var B = WorldBroadside.create({ THREE, scene, rng, waterHeightAt?(x,z), vfx?, flash?(x,y,z,dur), audio?(kind,vol), baseY? })
 *   B.fire(side, ship)   side: 'starboard'|'port'|+1|-1 (starboard = ship-local +x = sim psi+90deg) ; ship = { x, z, psi, y? }  -> true if it fired (per-side cooldown 0.35 s)
 *   B.update(dt)         B.stats() -> { liveTracers, liveSmoke, oldestSmoke, draws, liveFlash, liveColumns, impacts, shots }       B.dispose()
 *   WorldBroadside.synthBoom(audioCtx) -> audio callback (noise burst + low sine thump), no assets.
 * Per salvo: 4 flashes (0.08 s), 12 tracers (220 m/s, gravity 4, 1.1 s), 4 smoke puffs (scale 1->8, opacity .5->0 over 1.4 s, killed at 1.6 s). Tracer below water -> white column 0.5 s.
 */
(function (root) {
  'use strict';
  var COOLDOWN = 0.35, TRACER_V = 220, GRAV = 4, TRACER_LIFE = 1.1, TAIL = 0.045, FLASH_T = 0.08, SMOKE_FADE = 1.4, SMOKE_KILL = 1.6, COL_T = 0.5;
  var PER_MUZZLE = 3, NT = 128, NS = 48, NF = 16, NC = 24;
  var MUZ = [];   // ship-local muzzle offsets for the +x (starboard) side; port mirrors x
  for (var mi = 0; mi < 4; mi++) MUZ.push({ x: 2.5, y: 1.4, z: -3.3 + mi * 2.2 });

  function radialTex(THREE) {
    var n = 32, d = new Uint8Array(n * n * 4);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { var dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, a = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)); a = a * a * (3 - 2 * a); var i = (y * n + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255); }
    var t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.needsUpdate = true; return t;
  }

  function create(o) {
    var THREE = o.THREE, rng = o.rng || (root.WorldRNG && root.WorldRNG.create(1)); if (!THREE || !rng) throw new Error('WorldBroadside needs THREE and rng');
    var wh = o.waterHeightAt || function () { return 0; }, vfx = o.vfx || null, flashCb = o.flash || null, audio = o.audio || null, baseY = o.baseY || 0;
    var group = new THREE.Group(); group.name = 'broadside-fx'; if (o.scene) o.scene.add(group);
    var tex = radialTex(THREE), cd = [0, 0], shots = 0, impacts = 0, _p = { x: 0, y: 0, z: 0 };

    // ---- tracers: struct-of-arrays + ONE LineSegments ----
    var tx = new Float32Array(NT), ty = new Float32Array(NT), tz = new Float32Array(NT), vx = new Float32Array(NT), vy = new Float32Array(NT), vz = new Float32Array(NT), tage = new Float32Array(NT), talive = new Uint8Array(NT), liveT = 0;
    var pos = new Float32Array(NT * 6), geo = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(pos, 3); if (pa.setUsage) pa.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('position', pa);
    var lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false })); lines.frustumCulled = false; lines.visible = false; group.add(lines);

    // ---- smoke sprites ----
    var smoke = [], sage = new Float32Array(NS), salive = new Uint8Array(NS), sx = new Float32Array(NS), sy = new Float32Array(NS), sz = new Float32Array(NS), liveS = 0, oldestS = 0;
    for (var i = 0; i < NS; i++) { var sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb8bcc2, transparent: true, opacity: 0, depthWrite: false })); sm.visible = false; group.add(sm); smoke.push(sm); }

    // ---- flash sprites (emissive, additive; NO lights) ----
    var flashes = [], fage = new Float32Array(NF), falive = new Uint8Array(NF), liveF = 0;
    for (i = 0; i < NF; i++) { var fs = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb04a, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending })); fs.visible = false; group.add(fs); flashes.push(fs); }

    // ---- water columns ----
    var cgeo = new THREE.CylinderGeometry(0.45, 1.2, 1, 10, 1, true); cgeo.translate(0, 0.5, 0);
    var cols = [], cage = new Float32Array(NC), calive = new Uint8Array(NC), liveC = 0;
    for (i = 0; i < NC; i++) { var cm = new THREE.Mesh(cgeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); cm.visible = false; group.add(cm); cols.push(cm); }

    function killT(k) { talive[k] = 0; var b = k * 6; pos[b] = pos[b + 1] = pos[b + 2] = pos[b + 3] = pos[b + 4] = pos[b + 5] = 0; }
    function freeT() { var k, best = 0, ba = -1; for (k = 0; k < NT; k++) { if (!talive[k]) return k; if (tage[k] > ba) { ba = tage[k]; best = k; } } return best; }
    function freeS() { var k, best = 0, ba = -1; for (k = 0; k < NS; k++) { if (!salive[k]) return k; if (sage[k] > ba) { ba = sage[k]; best = k; } } return best; }
    function freeF() { for (var k = 0; k < NF; k++) if (!falive[k]) return k; return 0; }
    function freeC() { for (var k = 0; k < NC; k++) if (!calive[k]) return k; return -1; }

    function impact(x, y, z) {
      impacts++;
      if (vfx && vfx.burst) { _p.x = x; _p.y = y; _p.z = z; vfx.burst('splash', _p); return; }
      var k = freeC(); if (k < 0) return; calive[k] = 1; cage[k] = 0; var m = cols[k]; m.position.set(x, y, z); m.scale.set(1, 1, 1); m.material.opacity = 0.85; m.visible = true;
    }

    function fire(side, ship) {
      if (!ship) return false;
      var s = (side === 'port' || side === -1) ? -1 : 1, ci = s > 0 ? 0 : 1; if (cd[ci] > 0) return false; cd[ci] = COOLDOWN; shots++;
      var sn = Math.sin(ship.psi), cs = Math.cos(ship.psi), y0 = ship.y != null ? ship.y : baseY, dx = s * cs, dz = -s * sn, sv = ship.v || 0;
      for (var m = 0; m < 4; m++) {
        var mu = MUZ[m], lx = mu.x * s, wx = ship.x + lx * cs + mu.z * sn, wz = ship.z - lx * sn + mu.z * cs, wy = y0 + mu.y;
        if (flashCb) flashCb(wx, wy, wz, FLASH_T); else { var f = freeF(); falive[f] = 1; fage[f] = 0; flashes[f].position.set(wx, wy, wz); flashes[f].scale.setScalar(3.2); flashes[f].material.opacity = 1; flashes[f].visible = true; }
        if (vfx && vfx.burst) { _p.x = wx; _p.y = wy; _p.z = wz; vfx.burst('muzzle', _p); }
        var si = freeS(); salive[si] = 1; sage[si] = 0; sx[si] = wx + dx * 1.2; sy[si] = wy; sz[si] = wz + dz * 1.2; var sp = smoke[si]; sp.position.set(sx[si], sy[si], sz[si]); sp.scale.setScalar(1); sp.material.opacity = 0.5; sp.visible = true;
        for (var j = 0; j < PER_MUZZLE; j++) {
          var k = freeT(), yaw = (rng() - 0.5) * 0.08, pitch = -0.01 + rng() * 0.06, c2 = Math.cos(yaw), s2 = Math.sin(yaw), ddx = dx * c2 - dz * s2, ddz = dx * s2 + dz * c2, h = Math.cos(pitch);
          talive[k] = 1; tage[k] = 0; tx[k] = wx; ty[k] = wy; tz[k] = wz; vx[k] = ddx * h * TRACER_V + sn * sv * 0.3; vy[k] = Math.sin(pitch) * TRACER_V; vz[k] = ddz * h * TRACER_V + cs * sv * 0.3;
        }
      }
      if (audio) audio('boom', 1);
      return true;
    }

    function update(dt) {
      if (dt > 0.1) dt = 0.1; var k;
      cd[0] = cd[0] > dt ? cd[0] - dt : 0; cd[1] = cd[1] > dt ? cd[1] - dt : 0;
      liveT = 0;
      for (k = 0; k < NT; k++) {
        if (!talive[k]) continue; tage[k] += dt; if (tage[k] >= TRACER_LIFE) { killT(k); continue; }
        vy[k] -= GRAV * dt; tx[k] += vx[k] * dt; ty[k] += vy[k] * dt; tz[k] += vz[k] * dt;
        var w = wh(tx[k], tz[k]); if (ty[k] <= w) { impact(tx[k], w, tz[k]); killT(k); continue; }
        var b = k * 6; pos[b] = tx[k]; pos[b + 1] = ty[k]; pos[b + 2] = tz[k]; pos[b + 3] = tx[k] - vx[k] * TAIL; pos[b + 4] = ty[k] - vy[k] * TAIL; pos[b + 5] = tz[k] - vz[k] * TAIL; liveT++;
      }
      if (liveT > 0 || lines.visible) { pa.needsUpdate = true; lines.visible = liveT > 0; }
      liveS = 0; oldestS = 0;
      for (k = 0; k < NS; k++) {
        if (!salive[k]) continue; sage[k] += dt; var a = sage[k];
        if (a >= SMOKE_KILL) { salive[k] = 0; smoke[k].visible = false; smoke[k].material.opacity = 0; continue; }
        var u = a < SMOKE_FADE ? a / SMOKE_FADE : 1, sp2 = smoke[k]; sp2.scale.setScalar(1 + 7 * u); sp2.material.opacity = 0.5 * (1 - u); sp2.position.y = sy[k] + a * 1.5; liveS++; if (a > oldestS) oldestS = a;
      }
      liveF = 0;
      for (k = 0; k < NF; k++) { if (!falive[k]) continue; fage[k] += dt; if (fage[k] >= FLASH_T) { falive[k] = 0; flashes[k].visible = false; continue; } flashes[k].material.opacity = 1 - fage[k] / FLASH_T; liveF++; }
      liveC = 0;
      for (k = 0; k < NC; k++) {
        if (!calive[k]) continue; cage[k] += dt; var q = cage[k] / COL_T; if (q >= 1) { calive[k] = 0; cols[k].visible = false; continue; }
        var cm2 = cols[k]; cm2.scale.set(1 + q * 2, 1 + 7 * (1 - (1 - q) * (1 - q)), 1 + q * 2); cm2.material.opacity = 0.85 * (1 - q); liveC++;
      }
    }
    function stats() { return { liveTracers: liveT, liveSmoke: liveS, oldestSmoke: oldestS, liveFlash: liveF, liveColumns: liveC, draws: (liveT > 0 ? 1 : 0) + liveS + liveF + liveC, impacts: impacts, shots: shots }; }
    function dispose() { if (group.parent) group.parent.remove(group); geo.dispose(); cgeo.dispose(); tex.dispose(); smoke.concat(flashes).concat(cols).forEach(function (m) { m.material.dispose(); }); lines.material.dispose(); }
    return { fire: fire, update: update, stats: stats, dispose: dispose, group: group, _pool: { smoke: smoke, flashes: flashes, cols: cols, lines: lines }, MUZZLES: MUZ };
  }

  function synthBoom(ac) {   // returns audio(kind, vol); synthesized: filtered noise burst + falling sine thump
    var noise = null;
    return function (kind, vol) {
      try {
        if (!ac) return; var t = ac.currentTime, v = vol == null ? 1 : vol;
        if (!noise) { var n = Math.floor(ac.sampleRate * 0.5), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0), s = 12345; for (var i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296 * 2 - 1) * (1 - i / n); } noise = buf; }
        var src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = noise; lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.45); g.gain.setValueAtTime(0.7 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); src.connect(lp); lp.connect(g); g.connect(ac.destination); src.start(t);
        var o = ac.createOscillator(), og = ac.createGain(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.35); og.gain.setValueAtTime(0.8 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.4); o.connect(og); og.connect(ac.destination); o.start(t); o.stop(t + 0.45);
      } catch (e) { }
    };
  }
  root.WorldBroadside = { create: create, synthBoom: synthBoom, COOLDOWN: COOLDOWN, MUZZLES: MUZ };
})(typeof window !== 'undefined' ? window : globalThis);
