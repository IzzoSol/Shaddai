/* world-wildlife-v4.js — WOLF PACKS in the wilderness (Map v4, ?map=v4), 2026-09-27.
 *
 * Owner: "wolves should be in the wilderness — and more at night".
 *   • WHERE: only wilderness — the belt between The Grid and the realms, and the corridors between realm wedges
 *     (terrain.json realms, compass degrees + radii). Never in The Grid, never inside a realm's core, never on water.
 *   • WHEN: day → a few calm packs that keep their distance (flee if you come close); night (sky nightFactor) → many
 *     more packs, and they HUNT: stalk inside ~60 m, charge, bite (telegraphed snarl ≥ 0.6 s so a roll gets you out).
 *   • HOW: packs spawn in a ring 180–520 m around the player and despawn beyond 900 m → only nearby wolves exist.
 *     Mixers update only for wolves within 150 m (others coast). One shared rigged GLB (SkeletonUtils clone per wolf).
 * Model: /assets/creatures/wolf.glb (owner download, 59 bones; clips walk/run/idle/creep/sit…), 1.6 m long.
 *
 *   window.buildWorldWildlifeV4({ THREE, scene, loader, cloneSkinned, heightAt (units), terrainMeta, getPlayer():{pos},
 *                                 nightFactor():0..1, onHitPlayer(dmg, kind, info), isWater(x,z)? })
 *     → { update(dt), meleeHit(pos, fwd, range, dmg), hitTest(pos, r) → id|null, damage(id, dmg), stats(), dispose() }
 */
(function () {
  var U = 7 / 1.8;
  window.buildWorldWildlifeV4 = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, heightAt = opts.heightAt, T = opts.terrainMeta;
    var group = new THREE.Group(); group.name = 'world-wildlife-v4'; scene.add(group);
    var GRID = T.grid_r_m, WL = T.water_level_m, realms = T.realms || [];
    var TUNE = { dayPacks: 2, nightPacks: 7, packMin: 3, packMax: 5, spawnMin: 180, spawnMax: 520, despawn: 900, animNear: 150,
      walk: 1.6, trot: 4.5, run: 11.0, hp: 30, stalkR: 60, chargeR: 28, biteR: 2.6, biteDmg: 7, biteCd: 1.4, snarl: 0.6, fleeR: 35, attackers: 2, biteGap: 0.9, circleR: 9 };
    function norm(c) { return (c % 360 + 360) % 360; }
    function compassOf(x, z) { return norm(Math.atan2(x, -z) * 180 / Math.PI); }       // game: north = -z
    function inRealmCore(c, r) {
      for (var i = 0; i < realms.length; i++) {
        var R = realms[i], span = norm(R.c1 - R.c0), rel = norm(c - R.c0);
        if (rel > 6 && rel < span - 6 && r > R.r0_m + 150 && r < R.r1_m) return true;          // ≥ 6° inside the wedge = realm core
      }
      return false;
    }
    function isWild(x, z) {
      var r = Math.hypot(x, z) / U, c = compassOf(x, z);
      if (r < GRID + 180 || r > T.rim_m - 60) return false;
      if (heightAt(x, z) < (WL + 0.8) * U) return false;
      if (opts.isWater && opts.isWater(x, z)) return false;
      return !inRealmCore(c, r);
    }
    var model = null, clips = {};
    opts.loader.load('/assets/creatures/wolf.glb?v=1', function (g) { model = g; g.animations.forEach(function (a) { clips[a.name] = a; }); }, undefined,
      function (e) { if (window.console) console.warn('[wildlife] wolf model failed:', e && e.message); });

    var packs = [], wolves = [], nextId = 1, st = { packs: 0, wolves: 0, hostile: 0, bites: 0, kills: 0 };
    function makeWolf(x, z, pack) {
      var root = opts.cloneSkinned ? opts.cloneSkinned(model.scene) : model.scene.clone(true);
      root.scale.setScalar(U * (0.9 + Math.random() * 0.25));
      root.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; } });
      group.add(root);
      var mixer = new THREE.AnimationMixer(root), acts = {};
      ['walk', 'run', 'idle', 'creep', 'sit'].forEach(function (n) { if (clips[n]) acts[n] = mixer.clipAction(clips[n]); });
      var w = { id: 'wolf' + (nextId++), root: root, mixer: mixer, acts: acts, cur: null, x: x, z: z, yaw: Math.random() * 6.28, speed: 0, hp: TUNE.hp,
        pack: pack, state: 'roam', biteT: 0, snarlT: 0, dead: 0, offx: (Math.random() - 0.5) * 8 * U, offz: (Math.random() - 0.5) * 8 * U };
      play(w, 'idle'); return w;
    }
    function play(w, n) { var a = w.acts[n] || w.acts.walk; if (!a || w.cur === a) return; a.reset().fadeIn(0.25).play(); if (w.cur) w.cur.fadeOut(0.25); w.cur = a; }
    function spawnPack(P) {
      for (var t = 0; t < 30; t++) {
        var a = Math.random() * Math.PI * 2, d = (TUNE.spawnMin + Math.random() * (TUNE.spawnMax - TUNE.spawnMin)) * U;
        var x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
        if (!isWild(x, z)) continue;
        var pk = { id: packs.length + 1, lx: x, lz: z, tx: x, tz: z, retarget: 0, alive: true }, n = TUNE.packMin + Math.floor(Math.random() * (TUNE.packMax - TUNE.packMin + 1));
        pk.members = [];
        for (var i = 0; i < n; i++) { var w = makeWolf(x + (Math.random() - 0.5) * 10 * U, z + (Math.random() - 0.5) * 10 * U, pk); pk.members.push(w); wolves.push(w); }
        packs.push(pk); return true;
      }
      return false;
    }
    function removeWolf(w) { group.remove(w.root); w.mixer.stopAllAction(); var i = wolves.indexOf(w); if (i >= 0) wolves.splice(i, 1); }
    var acc = 0, biteGapT = 0;
    function update(dt) {
      if (!model) return;
      dt = Math.min(dt || 0, 0.1);
      var P = opts.getPlayer ? opts.getPlayer() : null; if (!P || !P.pos) return;
      var night = opts.nightFactor ? opts.nightFactor() : 0, hostileNow = night > 0.55;
      // pack budget by time of day (spawn at most one pack per 1.5 s so it never hitches)
      acc += dt;
      var want = Math.round(TUNE.dayPacks + (TUNE.nightPacks - TUNE.dayPacks) * night);
      packs = packs.filter(function (pk) { return pk.members.some(function (w) { return !w.dead || w.dead < 3; }); });
      if (packs.length < want && acc > 1.5) { acc = 0; spawnPack(P.pos); }
      packs.forEach(function (pk) {       // leader roams the wilderness: pick wild targets 60-200 m away
        pk.retarget -= dt;
        var dl = Math.hypot(pk.tx - pk.lx, pk.tz - pk.lz);
        if (pk.retarget <= 0 || dl < 4 * U) {
          for (var t = 0; t < 12; t++) { var a = Math.random() * 6.28, d = (60 + Math.random() * 140) * U, x = pk.lx + Math.cos(a) * d, z = pk.lz + Math.sin(a) * d; if (isWild(x, z)) { pk.tx = x; pk.tz = z; break; } }
          pk.retarget = 8 + Math.random() * 10;
        }
        var sp = TUNE.walk * U, dx = pk.tx - pk.lx, dz = pk.tz - pk.lz, L = Math.hypot(dx, dz) || 1;
        var nx = pk.lx + dx / L * sp * dt, nz = pk.lz + dz / L * sp * dt; if (isWild(nx, nz)) { pk.lx = nx; pk.lz = nz; } else pk.retarget = 0;
        var far = Math.hypot(pk.lx - P.pos.x, pk.lz - P.pos.z) > TUNE.despawn * U;
        if (far) { pk.members.forEach(removeWolf); pk.members = []; }
      });
      st.hostile = 0; biteGapT -= dt;
      // attack slots: only the nearest few hostile wolves close in to bite; the rest circle and wait (readable, survivable fights)
      var engaged = {};
      if (hostileNow && P.alive !== false) wolves.filter(function (w) { return !w.dead && Math.hypot(P.pos.x - w.x, P.pos.z - w.z) < TUNE.stalkR * U; })
        .sort(function (a, b) { return Math.hypot(P.pos.x - a.x, P.pos.z - a.z) - Math.hypot(P.pos.x - b.x, P.pos.z - b.z); })
        .slice(0, TUNE.attackers).forEach(function (w) { engaged[w.id] = true; });
      for (var i = 0; i < wolves.length; i++) {
        var w = wolves[i], pk = w.pack;
        if (w.dead) { w.dead += dt; w.root.position.y -= 0.4 * U * dt; if (w.dead > 3) { removeWolf(w); i--; } continue; }
        var dxp = P.pos.x - w.x, dzp = P.pos.z - w.z, dp = Math.hypot(dxp, dzp), tx, tz, spd;
        if (hostileNow && dp < TUNE.stalkR * U && (P.alive !== false)) {
          st.hostile++; w.state = engaged[w.id] ? 'attack' : 'circle';
          if (!engaged[w.id]) {                                       // circle the player at ~9 m, pacing
            var ca = Math.atan2(-dzp, -dxp) + 0.6; tx = P.pos.x + Math.cos(ca) * TUNE.circleR * U; tz = P.pos.z + Math.sin(ca) * TUNE.circleR * U;
            spd = TUNE.trot * U; play(w, 'creep');
          } else if (dp < TUNE.biteR * U) {                                  // bite: snarl telegraph, then damage (cooldown)
            spd = 0; tx = P.pos.x; tz = P.pos.z; w.biteT -= dt;
            if (w.snarlT <= 0 && w.biteT <= 0 && biteGapT <= 0) { w.snarlT = TUNE.snarl; biteGapT = TUNE.biteGap; }
            if (w.snarlT > 0) { w.snarlT -= dt; if (w.snarlT <= 0) { w.biteT = TUNE.biteCd + Math.random() * 0.6; st.bites++; if (opts.onHitPlayer) opts.onHitPlayer(TUNE.biteDmg, 'bite', { knockback: { x: dxp / dp * 6 * U, z: dzp / dp * 6 * U } }); } }
            play(w, 'idle');
          } else { tx = P.pos.x; tz = P.pos.z; spd = (dp < TUNE.chargeR * U ? TUNE.run : TUNE.trot) * U; play(w, dp < TUNE.chargeR * U ? 'run' : 'creep'); }
        } else if (!hostileNow && dp < TUNE.fleeR * U) {
          w.state = 'flee';              // daytime: keep their distance
          tx = w.x - dxp; tz = w.z - dzp; spd = TUNE.run * U; play(w, 'run');
        } else {                                                        // follow the pack leader in loose formation
          w.state = 'roam';
          tx = pk.lx + w.offx; tz = pk.lz + w.offz; var dd = Math.hypot(tx - w.x, tz - w.z);
          spd = dd > 12 * U ? TUNE.trot * U : (dd > 1.5 * U ? TUNE.walk * U : 0); play(w, spd > TUNE.walk * U + 0.1 ? 'run' : (spd > 0 ? 'walk' : 'idle'));
        }
        var ddx = tx - w.x, ddz = tz - w.z, dl2 = Math.hypot(ddx, ddz);
        if (spd > 0 && dl2 > 0.5) {
          var ty = Math.atan2(ddx, ddz), dy = ((ty - w.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; w.yaw += dy * Math.min(1, dt * 6);
          var step = Math.min(spd * dt, dl2); w.x += Math.sin(w.yaw) * step; w.z += Math.cos(w.yaw) * step;
        }
        var gy = heightAt(w.x, w.z);
        w.root.position.set(w.x, gy, w.z); w.root.rotation.y = w.yaw;
        if (dp < TUNE.animNear * U) w.mixer.update(dt);              // far wolves: no skinning update (cheap)
        w.root.visible = dp < 700 * U;
      }
      st.packs = packs.length; st.wolves = wolves.length;
    }
    function damage(id, dmg) {
      var w = wolves.find(function (x) { return x.id === id; }); if (!w || w.dead) return false;
      w.hp -= dmg; if (w.hp <= 0) { w.dead = 0.001; st.kills++; w.mixer.stopAllAction(); }
      else { w.pack.members.forEach(function (m) { if (!m.dead) m.pack.retarget = 0; }); }
      return true;
    }
    return {
      group: group, update: update, damage: damage, get ready() { return !!model; }, _wolves: function () { return wolves; },
      hitTest: function (pos, r) { var rr = (r || 1.5) * U; for (var i = 0; i < wolves.length; i++) { var w = wolves[i]; if (!w.dead && Math.hypot(w.x - pos.x, w.z - pos.z) < rr + 0.6 * U && Math.abs((pos.y || 0) - heightAt(w.x, w.z)) < 3 * U) return w.id; } return null; },
      meleeHit: function (pos, fwd, range, dmg) {
        var hits = 0;
        wolves.forEach(function (w) { if (w.dead) return; var dx = w.x - pos.x, dz = w.z - pos.z, d = Math.hypot(dx, dz); if (d > range || d < 1e-3) return;
          if ((dx * fwd.x + dz * fwd.z) / d > 0.35) { damage(w.id, dmg); hits++; } });
        return hits;
      },
      isWild: isWild,
      stats: function () { return st; },
      dispose: function () { wolves.slice().forEach(removeWolf); scene.remove(group); }
    };
  };
})();
