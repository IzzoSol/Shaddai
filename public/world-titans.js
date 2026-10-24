/* world-titans.js — REALM TITANS (owner 2026-10-23 refs: ornate armoured samurai-aztec giants "to fight in the terrains"). One 40 m titan per land
 * realm (K41 rigged GLB: 12 bones, clips idle / walk / slam), tinted to its realm. AI: idles at its post; walks at you inside 160 m; ground-slams
 * inside 26 m (telegraphed by the wind-up, 26 dmg if you are still within 22 m at the impact frame). Hit it with melee or projectiles; at 0 HP it
 * falls and stays down (story kill, no loot yet - any reward must be server-owned).
 *   window.WorldTitans.build({ THREE, GLTFLoader, scene, cloneSkinned, heightAt, getPlayer, onHitPlayer, meta }) -> Promise<api>
 *   api.meleeHit(pos, fwd, range, dmg) · api.hitTest(pos, r) -> id · api.damage(id, amt) · api.titans · api.update(dt)
 * ?titans=0 = off.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, URL = '/assets/creatures/titan-rigged.glb?v=20261024a';
  var REALMS = { arctic: [330, 0x9fd8ff], darkforest: [285, 0x3f6a50], desert: [24, 0xc9933f], volcano: [66, 0xb3361a], meadow: [152, 0x6da14a], suburb: [112, 0xd8d0b8], void: [8, 0x5a2fd0], forest: [100, 0x2f8a4a] };
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]titans=0\b/.test(location.search)) return Promise.resolve(null);
    var THREE = o.THREE, H = o.heightAt, api = { titans: [] };
    return new Promise(function (res) { new o.GLTFLoader().load(URL, res, undefined, function () { res(null); }); }).then(function (g) {
      if (!g) { console.warn('[titans] model missing'); return null; }
      var group = new THREE.Group(); group.name = 'world-titans'; o.scene.add(group);
      var wl = ((o.meta && +o.meta.water_level_m) || 2) + 6;
      Object.keys(REALMS).forEach(function (rid, i) {
        var R = REALMS[rid], best = null;
        for (var r = 3500; r <= 4300; r += 100) { var a = R[0] * Math.PI / 180, x = Math.sin(a) * r * U, z = -Math.cos(a) * r * U, h = H(x, z); if (h > wl * U && (!best || Math.abs(r - 3800) < Math.abs(best.r - 3800))) best = { x: x, z: z, h: h, r: r }; }
        if (!best) return;
        var s = i === 0 ? g.scene : (o.cloneSkinned ? o.cloneSkinned(g.scene) : g.scene.clone(true));
        var tint = new THREE.Color(R[1]);
        s.traverse(function (m) { if (m.isMesh && m.material) { m.material = m.material.clone(); if (/armour/.test(m.material.name) && m.material.color) m.material.color.lerp(tint, 0.75); m.castShadow = true; m.frustumCulled = false; } });
        s.scale.setScalar(U); s.position.set(best.x, best.h, best.z); group.add(s);
        var mixer = new THREE.AnimationMixer(s), A = {}; g.animations.forEach(function (c) { A[c.name] = mixer.clipAction(c); });
        if (A.slam) { A.slam.setLoop(THREE.LoopOnce, 1); A.slam.clampWhenFinished = true; }
        var t = { id: 'titan-' + rid, realm: rid, o: s, mixer: mixer, A: A, home: { x: best.x, z: best.z }, hp: 900, hpMax: 900, state: 'idle', cur: null, slamT: 0, dead: false };
        play(t, 'idle'); api.titans.push(t);
      });
      function play(t, n) { if (t.cur === n || !t.A[n]) return; var nx = t.A[n]; nx.reset().fadeIn(0.3).play(); if (t.cur && t.A[t.cur]) t.A[t.cur].fadeOut(0.3); t.cur = n; }
      // PERF 2026-10-24: skinned titans are frustumCulled=false, so all of them drew (and cast into the shadow map) every frame. Cull by a
      // 40 m-tall sphere against the camera instead, and cast shadows only near the player (the sun's shadow box is 60 m). No distance
      // hiding: there is no fog, so titans stay visible on the horizon. ?titancull=0 = old behaviour.
      var cull = !/[?&]titancull=0\b/.test(location.search), frus = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere();
      function setCast(t, on) { if (t.cast === on) return; t.cast = on; t.o.traverse(function (m) { if (m.isMesh) m.castShadow = on; }); }
      api.update = function (dt) {
        var P = o.getPlayer && o.getPlayer(); if (!P) return;
        var cam = cull && root.__w3dDebug && root.__w3dDebug.camera;
        if (cam) { cam.updateMatrixWorld(); pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frus.setFromProjectionMatrix(pv); }
        api.titans.forEach(function (t) {
          var dx = P.x - t.o.position.x, dz = P.z - t.o.position.z, d = Math.hypot(dx, dz) / U;
          if (cam) { sph.center.set(t.o.position.x, t.o.position.y + 20 * U, t.o.position.z); sph.radius = 46 * U;   /* 46 m also covers a fallen (lying) titan */ t.o.visible = frus.intersectsSphere(sph); setCast(t, d < 200); }
          if (d > 2500) return;   // far: frozen (perf)
          t.mixer.update(dt);
          if (t.dead) return;
          if (t.state === 'slam') { t.slamT += dt; if (t.slamT > 0.95 && !t.hit) { t.hit = true; if (d < 22 && o.onHitPlayer) o.onHitPlayer(26, 'titan-slam', { id: t.id }); } if (t.slamT > 1.8) { t.state = 'idle'; } return; }
          if (d < 26) { t.state = 'slam'; t.slamT = 0; t.hit = false; t.o.rotation.y = Math.atan2(dx, dz) + Math.PI; play(t, 'slam'); t.A.slam && t.A.slam.reset().play(); return; }
          if (d < 160) { t.state = 'walk'; play(t, 'walk'); var sp = 5 * U * dt; t.o.position.x += dx / (d * U) * sp; t.o.position.z += dz / (d * U) * sp; t.o.position.y = H(t.o.position.x, t.o.position.z); t.o.rotation.y = Math.atan2(dx, dz) + Math.PI; return; }
          var hx = t.home.x - t.o.position.x, hz = t.home.z - t.o.position.z, hd = Math.hypot(hx, hz) / U;
          if (hd > 8) { play(t, 'walk'); var s2 = 4 * U * dt; t.o.position.x += hx / (hd * U) * s2; t.o.position.z += hz / (hd * U) * s2; t.o.position.y = H(t.o.position.x, t.o.position.z); t.o.rotation.y = Math.atan2(hx, hz) + Math.PI; }
          else { t.state = 'idle'; play(t, 'idle'); }
        });
      };
      function body(t, p) { var dx = p.x - t.o.position.x, dz = p.z - t.o.position.z, dy = p.y - t.o.position.y; return Math.hypot(dx, dz) / U < 9 && dy > -2 * U && dy < 42 * U; }
      api.hitTest = function (p, r) { for (var i = 0; i < api.titans.length; i++) { var t = api.titans[i]; if (!t.dead && body(t, p)) return t.id; } return null; };
      api.damage = function (id, amt) { var t = api.titans.find(function (x) { return x.id === id; }); if (!t || t.dead) return false; t.hp = Math.max(0, t.hp - amt);
        if (t.hp <= 0) { t.dead = true; t.o.rotation.x = -Math.PI / 2; t.o.position.y += 3 * U; t.mixer.stopAllAction(); if (root.__toast) root.__toast('⚔ The Titan of ' + t.realm + ' falls!'); }
        return true; };
      api.meleeHit = function (pos, fwd, range, dmg) { var hit = false; api.titans.forEach(function (t) { if (t.dead) return; var dx = t.o.position.x - pos.x, dz = t.o.position.z - pos.z, d = Math.hypot(dx, dz); if (d < range + 9 * U && (dx * fwd.x + dz * fwd.z) > 0) { api.damage(t.id, dmg); hit = true; } }); return hit; };
      var last = performance.now(); (function tick(now) { var dt = Math.min(0.1, ((now || performance.now()) - last) / 1000); last = now || performance.now(); try { api.update(dt); } catch (e) { } requestAnimationFrame(tick); })();
      api.group = group; root.__titans = api; console.info('[titans]', api.titans.length, 'titans placed');
      return api;
    });
  }
  root.WorldTitans = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
