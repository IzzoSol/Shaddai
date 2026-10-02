/* world-mobs.js — WILDERNESS MOBS with CAMPS, loot and a RESPAWN TIMER (owner 2026-10-01: "mobs in the wilderness that we can defeat, and a timer for them to come back").
 *
 *   var mobs = window.buildWorldMobs({ THREE, scene, heightAt, terrainMeta?, getPlayer(): {pos, alive}, nightFactor(): 0..1,
 *                                      onHitPlayer(dmg, kind, info), onKill({type, name, sparks, x, z, night}), isWater?(x,z) })
 *   mobs.update(dt)                           every frame
 *   mobs.meleeHit(pos, fwd, reach, dmg) -> n  left-click melee (cone in front of the player)
 *   mobs.boltHit(pos, fwd, range, dmg)  -> n  Q projectile (long thin cone)
 *   mobs.camps() / mobs.nearestCamp(pos) / mobs.stats() / mobs.on('kill'|'respawn'|'aggro', fn)
 *
 * 8 camps in the wilderness belt between The Grid and the realms (never on water), each with 4 themed mobs: MUMMIES (desert), IMPS (forge), WRAITHS (arctic), STALKERS (dark forest).
 * Mobs wander near their camp, aggro at ~40 m, chase, telegraph (0.5 s) then strike, leash back and heal when you leave. Night: +30% aggro range, +30% damage, +50% loot.
 * Death -> falls, drops Sparks (closed loop; the host credits them), and RESPAWNS at the camp after RESPAWN_S (shown on the camp status HUD). Only camps near the player are simulated/visible.
 * Hit detection is analytic (no physics). Nothing allocates per frame after build. Units: world units, U = 7/1.8 per metre.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8;
  var TYPES = {
    mummy:   { name: 'Dune Mummy',    hp: 40, dmg: 5,  speed: 4.2, loot: [9, 14],  scale: 1.0, eye: 0x7dff9a, tint: 0xd8c9a0 },
    imp:     { name: 'Ember Imp',     hp: 26, dmg: 4,  speed: 7.2, loot: [8, 12],  scale: 0.7, eye: 0xffd24a, tint: 0xd4502a },
    wraith:  { name: 'Frost Wraith',  hp: 56, dmg: 7,  speed: 3.6, loot: [14, 20], scale: 1.25, eye: 0x9ff3ff, tint: 0x8fc8ff },
    stalker: { name: 'Forest Stalker', hp: 72, dmg: 9, speed: 6.0, loot: [18, 26], scale: 1.1, eye: 0xff5a6e, tint: 0x2a3a30 },
    /* ROSTER EXPANSION (owner 2026-10-01 "more enemies, different types"): */
    wolf:     { name: 'Ash Wolf',      hp: 34, dmg: 6,  speed: 8.4, loot: [10, 15], scale: 0.85, eye: 0xffb24a, tint: 0x7d7f86, pack: true, scent: true },                 // fast pack hunter; ignores you (mostly) while Scent-Away is active
    golem:    { name: 'Stone Golem',   hp: 150, dmg: 16, speed: 2.4, loot: [30, 44], scale: 1.9, eye: 0xff8a3a, tint: 0x6f6a62, windup: 1.1, kb: 7 },                     // slow, huge telegraph, big knockback
    spitter:  { name: 'Venom Spitter', hp: 30, dmg: 5,  speed: 4.6, loot: [11, 16], scale: 0.9, eye: 0xb6ff3a, tint: 0x3d6b2a, ranged: 22, windup: 0.8 },                   // keeps its distance and spits (0.8 s tell)
    scorpion: { name: 'Rift Scorpion', hp: 58, dmg: 9,  speed: 5.4, loot: [16, 22], scale: 0.95, eye: 0xff3a3a, tint: 0x5a2f55, windup: 0.45 }                              // low, quick sting
  };
  var ORDER = ['mummy', 'imp', 'wraith', 'stalker'], ORDER_ALL = ORDER.concat(['wolf', 'golem', 'spitter', 'scorpion']);
  var TUNE = { campsN: 8, perCamp: 4, ringExtraM: 420, ring2N: 8, ring2ExtraM: 1400, ring2PerCamp: 5, aggroM: 40, leashM: 95, reachM: 2.6, windup: 0.6, cd: 1.9, maxAttackers: 2, respawnS: 90, simM: 260, showM: 520, wanderM: 11 };

  root.buildWorldMobs = function (o) {
    var THREE = o.THREE, scene = o.scene, hAt = o.heightAt, T = o.terrainMeta || {}, GRID = T.grid_r_m || 1600, WL = (T.water_level_m != null ? T.water_level_m : 0);
    var group = new THREE.Group(); group.name = 'world-mobs'; scene.add(group);
    var listeners = {}, camps = [], st = { kills: 0, spawned: 0, hits: 0 };
    function emit(e, a) { (listeners[e] || []).forEach(function (f) { try { f(a); } catch (x) { } }); }
    function wet(x, z) { return (hAt(x, z) < (WL + 0.8) * U) || (o.isWater && o.isWater(x, z)); }

    // ---- shared geometry / materials (tiny, flat-shaded; no lights) ----
    var stripeTex = (function () { if (typeof document === 'undefined') return null; var c = document.createElement('canvas'); c.width = 64; c.height = 128; var x = c.getContext('2d'); x.fillStyle = '#d9c9a0'; x.fillRect(0, 0, 64, 128);
      for (var i = 0; i < 18; i++) { x.fillStyle = i % 2 ? 'rgba(120,98,60,.55)' : 'rgba(250,240,210,.4)'; x.save(); x.translate(0, i * 7); x.rotate(0.18); x.fillRect(-20, 0, 120, 4); x.restore(); }
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
    var G = { body: new THREE.CapsuleGeometry(0.42, 1.0, 4, 10), head: new THREE.SphereGeometry(0.34, 10, 8), arm: new THREE.CapsuleGeometry(0.13, 0.7, 3, 6), eye: new THREE.SphereGeometry(0.07, 6, 5),
      horn: new THREE.ConeGeometry(0.1, 0.34, 6), cone: new THREE.ConeGeometry(0.6, 2.2, 10, 1, true), quad: new THREE.CapsuleGeometry(0.4, 1.3, 4, 8), ring: new THREE.RingGeometry(0.9, 1.1, 24), bar: new THREE.PlaneGeometry(1, 0.1) };
    var M = {}; ORDER_ALL.forEach(function (k) { var tp = TYPES[k]; M[k] = { skin: new THREE.MeshLambertMaterial(k === 'mummy' && stripeTex ? { map: stripeTex } : { color: tp.tint, transparent: k === 'wraith', opacity: k === 'wraith' ? 0.72 : 1 }), eye: new THREE.MeshBasicMaterial({ color: tp.eye }) }; });
    var barBg = new THREE.MeshBasicMaterial({ color: 0x120a0a, depthTest: false, transparent: true, opacity: 0.8 }), barFg = new THREE.MeshBasicMaterial({ color: 0xff4a4a, depthTest: false });
    var ringMat = new THREE.MeshBasicMaterial({ color: 0xe8c45c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });

    function buildMob(kind) {
      var tp = TYPES[kind], m = M[kind], g = new THREE.Group(), body, parts = {};
      g.userData.kind = kind;
      var inner = new THREE.Group(); g.add(inner); parts.inner = inner;
      if (kind === 'stalker' || kind === 'wolf' || kind === 'scorpion') {
        body = new THREE.Mesh(G.quad, m.skin); body.rotation.x = Math.PI / 2; body.position.y = 0.85; inner.add(body);
        var hd = new THREE.Mesh(G.head, m.skin); hd.scale.set(0.9, 0.8, 1.2); hd.position.set(0, 1.05, 1.0); inner.add(hd); parts.head = hd;
        [-0.14, 0.14].forEach(function (x) { var e = new THREE.Mesh(G.eye, m.eye); e.position.set(x, 1.12, 1.32); inner.add(e); });
        [[-0.32, -0.5], [0.32, -0.5], [-0.32, 0.55], [0.32, 0.55]].forEach(function (p, i) { var l = new THREE.Mesh(G.arm, m.skin); l.scale.set(1, 1, 1); l.position.set(p[0], 0.4, p[1]); inner.add(l); parts['leg' + i] = l; });
        if (kind === 'scorpion') { var tail = new THREE.Mesh(G.arm, m.skin); tail.scale.set(1.2, 1.6, 1.2); tail.position.set(0, 1.25, -0.95); tail.rotation.x = -0.9; inner.add(tail); parts.tail = tail; body.position.y = 0.55; }
        if (kind === 'wolf') { var ear = [-0.16, 0.16].map(function (x) { var e2 = new THREE.Mesh(G.horn, m.skin); e2.position.set(x, 1.38, 0.95); inner.add(e2); return e2; }); parts.ears = ear; }
      } else if (kind === 'wraith') {
        body = new THREE.Mesh(G.cone, m.skin); body.rotation.x = Math.PI; body.position.y = 1.5; inner.add(body);
        var wh = new THREE.Mesh(G.head, m.skin); wh.position.y = 2.75; inner.add(wh); parts.head = wh; [-0.12, 0.12].forEach(function (x) { var e = new THREE.Mesh(G.eye, m.eye); e.position.set(x, 2.8, 0.3); inner.add(e); });
        [-1, 1].forEach(function (s, i) { var a = new THREE.Mesh(G.arm, m.skin); a.position.set(s * 0.55, 2.1, 0.2); a.rotation.z = s * 0.5; inner.add(a); parts['arm' + i] = a; });
      } else {   // mummy / imp: humanoid
        body = new THREE.Mesh(G.body, m.skin); body.position.y = 1.0; inner.add(body);
        var hd2 = new THREE.Mesh(G.head, m.skin); hd2.position.y = 2.0; inner.add(hd2); parts.head = hd2;
        [-0.13, 0.13].forEach(function (x) { var e = new THREE.Mesh(G.eye, m.eye); e.position.set(x, 2.05, 0.3); inner.add(e); });
        [-1, 1].forEach(function (s, i) { var a = new THREE.Mesh(G.arm, m.skin); a.position.set(s * 0.58, 1.35, 0.25); a.rotation.x = -1.2; inner.add(a); parts['arm' + i] = a; });
        if (kind === 'imp') [-1, 1].forEach(function (s) { var hn = new THREE.Mesh(G.horn, m.eye); hn.position.set(s * 0.2, 2.35, 0); hn.rotation.z = -s * 0.35; inner.add(hn); });
      }
      g.scale.setScalar(tp.scale * U);   // model authored in metres
      // billboard HP bar (world-space plane facing the camera each frame)
      var bar = new THREE.Group(); var bg = new THREE.Mesh(G.bar, barBg), fg = new THREE.Mesh(G.bar, barFg); bg.scale.set(1.2, 1, 1); fg.position.z = 0.001; bar.add(bg); bar.add(fg); bar.position.y = (kind === 'wraith' ? 3.3 : 2.7); bar.renderOrder = 999; bg.renderOrder = 998; fg.renderOrder = 999; g.add(bar); parts.bar = bar; parts.fg = fg;
      g.userData.parts = parts; return g;
    }

    // ---- camps: even angles around the belt, nudged off water ----
    // two rings: inner belt (8 camps x4) and a tougher outer ring (8 camps x5) so the wilderness keeps pushing back the farther you go
    var RINGS = [{ n: TUNE.campsN, extra: TUNE.ringExtraM, phase: 0.4, per: TUNE.perCamp, off: 0 }, { n: TUNE.ring2N, extra: TUNE.ring2ExtraM, phase: 0.4 + Math.PI / TUNE.ring2N, per: TUNE.ring2PerCamp, off: 2 }];
    var campIdx = 0;
    RINGS.forEach(function (RG) {
      var rm = (GRID + RG.extra) * U;
      for (var ci = 0; ci < RG.n; ci++) {
        var ang = (ci / RG.n) * Math.PI * 2 + RG.phase, cx = 0, cz = 0, ok = false;
        for (var tries = 0; tries < 30 && !ok; tries++) { var rr = rm * (1 + (tries % 10) * 0.04), aa = ang + Math.floor(tries / 10) * 0.12; cx = Math.sin(aa) * rr; cz = -Math.cos(aa) * rr; ok = !wet(cx, cz) && !wet(cx + 60 * U, cz) && !wet(cx, cz + 60 * U); }
        if (!ok) continue;
        var kind = ORDER[(campIdx + RG.off) % ORDER.length], camp = { id: 'camp' + campIdx, kind: kind, x: cx, z: cz, mobs: [], marker: null, near: false, ring: RG.off ? 2 : 1 }; campIdx++;
        var mk = new THREE.Group(); var ring = new THREE.Mesh(G.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(14 * U); ring.position.y = 0.4; mk.add(ring);
        var fire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.4, 7), new THREE.MeshBasicMaterial({ color: TYPES[kind].eye, transparent: true, opacity: 0.8 })); fire.scale.setScalar(U * 0.9); fire.position.y = 1.7 * U * 0.9; mk.add(fire);
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 4, 6), new THREE.MeshLambertMaterial({ color: 0x3a2f24 })); pole.scale.setScalar(U); pole.position.set(3 * U, 2 * U, 0); mk.add(pole);
        mk.position.set(cx, hAt(cx, cz), cz); group.add(mk); camp.marker = mk; camp.fire = fire; camps.push(camp);
        var comp = ['wolf', 'spitter', 'scorpion', 'golem'][(campIdx - 1) % 4]; if (!RG.off && comp === 'golem') comp = 'spitter';   // last mob of every camp is a companion type (golems only in the tougher outer ring)
        for (var mi = 0; mi < RG.per; mi++) {
          var mkind = (mi === RG.per - 1) ? comp : kind;
          var a2 = mi / RG.per * 6.283, hx = cx + Math.cos(a2) * 6 * U, hz = cz + Math.sin(a2) * 6 * U, g = buildMob(mkind), tp = TYPES[mkind], hpK = RG.off ? 1.5 : 1;
          var mob = { g: g, kind: mkind, camp: camp, hx: hx, hz: hz, x: hx, z: hz, yaw: a2, hp: Math.round(tp.hp * hpK), max: Math.round(tp.hp * hpK), state: 'idle', t: Math.random() * 6, windup: 0, cd: 0, dead: false, deadT: 0, respawnAt: 0, wx: hx, wz: hz, flash: 0, bob: Math.random() * 6 };
          g.position.set(hx, hAt(hx, hz), hz); g.visible = false; group.add(g); camp.mobs.push(mob); st.spawned++;
        }
      }
    });

    function night() { return o.nightFactor ? o.nightFactor() : 0; }
    function setBar(mob) { var p = mob.g.userData.parts, k = Math.max(0, mob.hp / mob.max); p.fg.scale.x = Math.max(0.001, k * 1.12); p.fg.position.x = -(1 - k) * 0.56; }
    var tmpA = 0;
    function update(dt) {
      var pl = o.getPlayer ? o.getPlayer() : null; if (!pl || !pl.pos) return; var P = pl.pos, alive = pl.alive !== false, nt = night(), now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      for (var ci = 0; ci < camps.length; ci++) {
        var camp = camps[ci], dc = Math.hypot(P.x - camp.x, P.z - camp.z) / U, vis = dc < TUNE.showM, sim = dc < TUNE.simM; camp.near = sim; camp.marker.visible = vis; camp.fire.scale.y = U * (0.8 + 0.25 * Math.sin(now * 8 + ci));
        for (var mi = 0; mi < camp.mobs.length; mi++) {
          var m = camp.mobs[mi], tp = TYPES[m.kind], g = m.g;
          if (m.dead) {   // respawn timer runs in real time even when you are far away
            if (m.deadT < 0.7) { m.deadT += dt; g.userData.parts.inner.rotation.x = Math.min(1.4, m.deadT * 2.4); g.position.y -= dt * 0.4 * U; if (m.deadT >= 0.7) g.visible = false; }
            if (now >= m.respawnAt) { m.dead = false; m.hp = m.max; m.x = m.hx; m.z = m.hz; m.state = 'idle'; m.deadT = 0; g.userData.parts.inner.rotation.x = 0; setBar(m); g.visible = vis; emit('respawn', { type: m.kind, camp: camp.id }); }
            continue;
          }
          g.visible = vis; if (!sim) continue;
          var dx = P.x - m.x, dz = P.z - m.z, d = Math.hypot(dx, dz) / U, aggro = TUNE.aggroM * (1 + 0.3 * nt) * (tp.pack ? 1.35 : 1) * (tp.scent && now < scentUntil ? 0.12 : 1) * (safeFn && safeFn(P.x, P.z) ? (tp.pack ? 0.1 : 0.6) : 1), home = Math.hypot(m.x - m.hx, m.z - m.hz) / U, dmgK = 1 + 0.3 * nt;
          m.cd -= dt; m.flash -= dt; m.bob += dt * (m.state === 'chase' ? 9 : 3);
          if (m.state === 'idle') { m.t -= dt; if (m.t <= 0) { m.t = 2 + Math.random() * 4; var wa = Math.random() * 6.28, wr = Math.random() * TUNE.wanderM * U; m.wx = m.hx + Math.cos(wa) * wr; m.wz = m.hz + Math.sin(wa) * wr; }
            var ex = m.wx - m.x, ez = m.wz - m.z, ed = Math.hypot(ex, ez); if (ed > 0.5 * U) { m.x += ex / ed * tp.speed * 0.35 * U * dt; m.z += ez / ed * tp.speed * 0.35 * U * dt; m.yaw = Math.atan2(ex, ez); }
            if (alive && d < aggro) { m.state = 'chase'; emit('aggro', { type: m.kind }); if (tp.pack) camp.mobs.forEach(function (q) { if (q.kind === m.kind && q.state === 'idle' && !q.dead) q.state = 'chase'; }); } }
          else if (m.state === 'chase') {
            if (!alive || d > TUNE.leashM || home > TUNE.leashM) { m.state = 'return'; }
            else if (tp.ranged) { var wr2 = tp.ranged; if (d > wr2) { m.x += dx / (d * U) * tp.speed * U * dt; m.z += dz / (d * U) * tp.speed * U * dt; } else if (d < wr2 * 0.6) { m.x -= dx / (d * U) * tp.speed * U * dt; m.z -= dz / (d * U) * tp.speed * U * dt; } m.yaw = Math.atan2(dx, dz);
              if (d <= wr2 * 1.15 && m.cd <= 0) { var busy2 = 0; for (var q2 = 0; q2 < camp.mobs.length; q2++) if (camp.mobs[q2].state === 'windup') busy2++; if (busy2 < TUNE.maxAttackers) { m.state = 'windup'; m.windup = tp.windup || TUNE.windup; } } }
            else if (d > TUNE.reachM) { m.x += dx / (d * U) * tp.speed * U * dt; m.z += dz / (d * U) * tp.speed * U * dt; m.yaw = Math.atan2(dx, dz); }
            else if (m.cd <= 0) { var busy = 0; for (var q = 0; q < camp.mobs.length; q++) if (camp.mobs[q].state === 'windup') busy++; if (busy < TUNE.maxAttackers) { m.state = 'windup'; m.windup = tp.windup || TUNE.windup; } } }
          else if (m.state === 'windup') { m.windup -= dt; m.yaw = Math.atan2(dx, dz); g.userData.parts.inner.position.y = Math.sin(now * 40) * 0.05;
            if (m.windup <= 0) { g.userData.parts.inner.position.y = 0; m.cd = TUNE.cd; m.state = 'chase'; if (tp.ranged) emit('shot', { kind: m.kind, from: { x: m.x, z: m.z }, to: { x: P.x, z: P.z } }); if (alive && Math.hypot(P.x - m.x, P.z - m.z) / U < (tp.ranged ? tp.ranged * 1.4 : TUNE.reachM + 1.4) && o.onHitPlayer) o.onHitPlayer(Math.round(tp.dmg * dmgK), tp.ranged ? 'mob-ranged' : 'mob', { mob: m.kind, knockback: { x: dx / (d * U + 1e-6) * (tp.kb || 3), z: dz / (d * U + 1e-6) * (tp.kb || 3) } }); } }
          else if (m.state === 'return') { var rx = m.hx - m.x, rz = m.hz - m.z, rd = Math.hypot(rx, rz); if (rd < 1.5 * U) { m.state = 'idle'; m.hp = m.max; setBar(m); } else { m.x += rx / rd * tp.speed * 1.4 * U * dt; m.z += rz / rd * tp.speed * 1.4 * U * dt; m.yaw = Math.atan2(rx, rz); m.hp = Math.min(m.max, m.hp + dt * 12); setBar(m); } if (alive && d < aggro * 0.6 && home < TUNE.leashM * 0.5) m.state = 'chase'; }
          g.position.set(m.x, hAt(m.x, m.z) + (m.kind === 'wraith' ? (1.2 + Math.sin(m.bob * 0.5) * 0.4) * U : 0), m.z); g.rotation.y = m.yaw;
          var pr = g.userData.parts; if (pr.arm0) { var sw = Math.sin(m.bob) * (m.state === 'chase' ? 0.7 : 0.15); pr.arm0.rotation.x = -1.2 + sw; pr.arm1.rotation.x = -1.2 - sw; }
          pr.inner.scale.setScalar(m.flash > 0 ? 1.12 : 1); pr.bar.visible = d < 60; if (pr.bar.visible && o.camera) pr.bar.quaternion.copy(o.camera.quaternion).premultiply(tmpQ.copy(g.quaternion).invert());
        }
      }
    }
    var tmpQ = new THREE.Quaternion(), scentUntil = 0, safeFn = null;
    function nowS() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }

    function hit(mob, dmg) {
      if (mob.dead) return false; mob.hp -= dmg; mob.flash = 0.1; st.hits++; setBar(mob); emit('hit', { type: mob.kind, name: TYPES[mob.kind].name, dmg: dmg, x: mob.x, y: hAt(mob.x, mob.z) + 2.4 * TYPES[mob.kind].scale * U, z: mob.z, killed: mob.hp <= 0, hp: Math.max(0, mob.hp), max: mob.max }); if (mob.state === 'idle' || mob.state === 'return') mob.state = 'chase';
      if (mob.hp <= 0) { var tp = TYPES[mob.kind], nt = night(), loot = Math.round((tp.loot[0] + Math.random() * (tp.loot[1] - tp.loot[0])) * (1 + 0.5 * nt)); mob.dead = true; mob.deadT = 0; mob.respawnAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 + TUNE.respawnS * (1 - 0.25 * nt); st.kills++;
        var info = { type: mob.kind, name: tp.name, sparks: loot, x: mob.x, z: mob.z, night: nt > 0.5, camp: mob.camp.id }; emit('kill', info); if (o.onKill) o.onKill(info); }
      return true;
    }
    function cone(pos, fwd, reach, dmg, cosMin) { var n = 0, fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
      camps.forEach(function (c) { if (!c.near) return; c.mobs.forEach(function (m) { if (m.dead) return; var dx = m.x - pos.x, dz = m.z - pos.z, d = Math.hypot(dx, dz); if (d > reach + 1.2 * U) return; var dot = (dx * fx + dz * fz) / (d || 1); if (dot < cosMin && d > 1.4 * U) return; if (hit(m, dmg)) n++; }); }); return n; }
    function meleeHit(pos, fwd, reach, dmg) { return cone(pos, fwd, reach || 5 * U, dmg || 12, 0.25); }
    function boltHit(pos, fwd, range, dmg) { var best = null, bd = 1e9, fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl; range = range || 32 * U;
      camps.forEach(function (c) { if (!c.near) return; c.mobs.forEach(function (m) { if (m.dead) return; var dx = m.x - pos.x, dz = m.z - pos.z, d = Math.hypot(dx, dz), along = dx * fx + dz * fz; if (along < 0 || d > range) return; var perp = Math.abs(dx * fz - dz * fx); if (perp < 2.2 * U && along < bd) { bd = along; best = m; } }); }); if (best && hit(best, dmg || 14)) return 1; return 0; }
    function nearestCamp(pos) { var b = null, bd = 1e12; camps.forEach(function (c) { var d = Math.hypot(pos.x - c.x, pos.z - c.z); if (d < bd) { bd = d; b = c; } }); if (!b) return null; var nowS = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000, alive = 0, next = 1e9;
      b.mobs.forEach(function (m) { if (!m.dead) alive++; else next = Math.min(next, m.respawnAt - nowS); }); return { id: b.id, kind: b.kind, name: TYPES[b.kind].name, distM: Math.round(bd / U), alive: alive, total: b.mobs.length, respawnIn: alive < b.mobs.length ? Math.max(0, Math.round(next)) : null, x: b.x, z: b.z }; }
    function blips(P, rU) { var out = []; camps.forEach(function (c) { if (!c.near) return; c.mobs.forEach(function (m) { if (m.dead) return; if (Math.hypot(m.x - P.x, m.z - P.z) <= rU * 1.6) out.push({ x: m.x, z: m.z, kind: 'enemy', type: m.kind }); }); }); return out; }
    return { setSafeFn: function (f) { safeFn = f; }, blips: blips, setScentless: function (sec) { scentUntil = nowS() + Math.max(0, sec || 0); return scentUntil; }, isScentless: function () { return nowS() < scentUntil; }, TYPES: TYPES, update: update, meleeHit: meleeHit, boltHit: boltHit, camps: function () { return camps.map(function (c) { return { id: c.id, kind: c.kind, x: c.x, z: c.z }; }); }, nearestCamp: nearestCamp, stats: function () { return { camps: camps.length, mobs: st.spawned, kills: st.kills, hits: st.hits }; },
      on: function (e, f) { (listeners[e] = listeners[e] || []).push(f); }, TYPES: TYPES, TUNE: TUNE, group: group,
      // test hooks
      _mobs: function () { var a = []; camps.forEach(function (c) { c.mobs.forEach(function (m) { a.push(m); }); }); return a; }, _hit: hit, dispose: function () { scene.remove(group); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
