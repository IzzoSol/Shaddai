/* world-underground-bazaar.js — THE UNDERGROUND BAZAAR under SHADDAI City (2026-10-23, owner: "in the middle of shaddai city ... an
 * elevator into this underground bazaar and city ... the middle is a platform elevator that goes up and down into this realm";
 * "the underground bazaar city has a train station that connects to the colosseum train and the underwater train").
 *
 *   WorldUndergroundBazaar.build({ THREE, GLTFLoader, scene, heightAt, getPlayer, setPlayer(x,y,z,yaw), isInside?, anchor? }) -> Promise<api>
 *
 * Art: Blender kit K32 (Shaddai/public/assets/kits/_src/k32_underground_bazaar.py -> shaddai_bazaar_city_v01.glb, headless
 * tools/k32_export_bg.py). The cavern sits DEPTH_M under the Grid centre and is only drawn while you are in it.
 * SURFACE LIFT: a gold platform at the anchor (default: Grid centre plaza). E on it = ride down (fade, the platform sinks, arrive on the
 * cavern lift). E on the cavern lift = ride up. STATION (west wall): E at the Colosseum Line platform = ride to the Colosseum door;
 * E at the Undersea Line platform = glass-tube ride to the Ocean realm station. Ground = flat cavern floor; the pyramid, canal (except
 * the four bridges) and cavern wall are solid. ?bazaar=0 = off.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, DEPTH_M = 288, SHAFT_M = 145, PAD_R_M = 162, FILE = '/assets/kits/shaddai_bazaar_city_v01.glb?v=20261023e'   // shaft = the Grid's centre circle (canon-v4: empty disc r ~150 m), USE_M = 9;
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]bazaar=0/.test(location.search || '')) return Promise.resolve(null);
    var THREE = o.THREE, A = (o.anchor && o.anchor()) || { x: 0, z: 0 };
    var gy = o.heightAt ? o.heightAt(A.x, A.z) : 0, BY = gy - DEPTH_M * U;   // shaft top = BY + 338 m, still under the Grid
    var st = { inside: false, busy: false, hooks: {}, root: null, wallR: 420 }, group = new THREE.Group(); group.name = 'underground-bazaar'; group.visible = false; o.scene.add(group);
    // surface lift pad (code-built: gold disc, glow ring, beacon column) — reads as the Grid's centre platform
    var pad = new THREE.Group(); pad.name = 'bazaar-lift-pad';
    var gold = new THREE.MeshStandardMaterial({ color: 0xd9a63e, metalness: 0.8, roughness: 0.3 }), glow = new THREE.MeshBasicMaterial({ color: 0xffc35a });
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 0.8, 48), gold); disc.position.y = 0.4; pad.add(disc);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.25, 8, 64), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.85; pad.add(ring);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 60, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 30; pad.add(beam);
    // the lift pad stands on the east rim of the Grid's centre circle; the circle itself is the open shaft with the pyramid tip in it
    var padX = A.x + PAD_R_M * U, padY = o.heightAt ? o.heightAt(padX, A.z) : gy;
    pad.scale.setScalar(U); pad.position.set(padX, padY, A.z); o.scene.add(pad);
    var collar = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_M + 1.2, 1.1, 10, 96), gold); collar.rotation.x = Math.PI / 2; collar.scale.setScalar(U); collar.position.set(A.x, gy + 0.6 * U, A.z); o.scene.add(collar);
    var rail = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_M + 1.2, 0.18, 6, 96), glow); rail.rotation.x = Math.PI / 2; rail.scale.setScalar(U); rail.position.set(A.x, gy + 1.9 * U, A.z); o.scene.add(rail);
    var tip = new THREE.Mesh(new THREE.ConeGeometry(16.5 * Math.SQRT2, 42, 4), gold); tip.rotation.y = Math.PI / 4; tip.scale.setScalar(U); tip.position.set(A.x, BY + (DEPTH_M + 21) * U, A.z); o.scene.add(tip);   // far stand-in for the GLB tip
    var holeSet = false; function cutHole() { try { var TV = root.__w3dDebug && root.__w3dDebug.terrainV4; if (TV && TV.setHole) { TV.setHole(A.x, A.z, (SHAFT_M + 0.6) * U); holeSet = true; } } catch (e) { } }
    cutHole();
    var stars = null;
    function hookWorld(name) { var h = st.hooks[name]; if (!h) return null; var v = new THREE.Vector3(); h.getWorldPosition(v); return v; }
    var ready = new Promise(function (res) {
      new o.GLTFLoader().load(FILE, function (g) {
        var s = g.scene; s.scale.setScalar(U); s.position.set(A.x, BY, A.z); group.add(s);
        var hemi = new THREE.HemisphereLight(0xffe0a8, 0x2a1a10, 1.6); hemi.position.set(A.x, BY + 150 * U, A.z); group.add(hemi);   // warm cavern light (only lit while the cavern is drawn)
        var key = new THREE.PointLight(0xffd27a, 3, 900 * U, 1.2); key.position.set(A.x, BY + 160 * U, A.z); group.add(key);
        s.traverse(function (n) {
          if (/^hook_/.test(n.name)) st.hooks[n.name.replace(/\.\d+$/, '')] = n;
          if (n.userData && n.userData.wall_r) st.wallR = n.userData.wall_r;
          if (n.isMesh) { n.material.side = THREE.DoubleSide; if (n.material.name === 'bazaar_water') { n.material = new THREE.MeshStandardMaterial({ color: 0x1a6fd0, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.85 }); st.water = n.material; } }
        });
        // daylight from the Grid falling down the central shaft (additive cone; the cavern is a city UNDER the Grid, not a sky)
        var beamG = new THREE.CylinderGeometry(40 * U, 70 * U, 330 * U, 40, 1, true);
        stars = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        stars.position.set(A.x, BY + 175 * U, A.z); group.add(stars);
        group.updateMatrixWorld(true); res(true);
      }, null, function (e) { console.warn('[bazaar]', e && e.message); res(false); });
    });
    var fade = null;
    function fadeTo(on, ms) { if (!fade) { fade = document.createElement('div'); fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:9400;transition:opacity .6s'; document.body.appendChild(fade); }
      fade.style.transition = 'opacity ' + (ms || 600) + 'ms'; fade.style.opacity = on ? 1 : 0; }
    function ride(to, label) {   // to: {x, y, z, inside}
      if (st.busy) return; st.busy = true; if (root.__toast) root.__toast(label);
      fadeTo(true, 700);
      setTimeout(function () {
        st.inside = !!to.inside; group.visible = st.inside; if (o.setPlayer) o.setPlayer(to.x, to.y, to.z, to.yaw || 0); surface(!st.inside, to);
        setTimeout(function () { fadeTo(false, 900); st.busy = false; }, 500);
      }, 800);
    }
    // while underground the surface city is not drawn at all (it is 288 m of rock away): top-level scene children are hidden and
    // restored on the way up. Kept: the cavern, lights, and anything within 80 m of the player (the avatar, held items).
    var hidden = [];
    function surface(show, at) {
      if (show) { hidden.forEach(function (c) { c.visible = true; }); hidden = []; return; }
      o.scene.children.forEach(function (c) {
        if (c === group || c.isLight || c.isCamera || !c.visible) return;
        var w = c.position; if (Math.hypot(w.x - at.x, w.y - at.y, w.z - at.z) < 80 * U) return;
        c.visible = false; hidden.push(c);
      });
    }
    function near(p, v, m) { return v && Math.hypot(p.x - v.x, p.z - v.z) < (m || USE_M) * U; }
    function use() {
      var p = o.getPlayer && o.getPlayer(); if (!p || st.busy) return false;
      if (o.isInside && o.isInside()) return false;
      if (!st.inside && Math.hypot(p.x - padX, p.z - A.z) < 10 * U && Math.abs(p.y - padY) < 6 * U) {
        var L = hookWorld('hook_lift'); if (!L) return false; ride({ x: L.x, y: L.y, z: L.z, inside: true }, 'Descending to the Underground Bazaar'); return true;
      }
      if (!st.inside) return false;
      var L2 = hookWorld('hook_lift'); if (near(p, L2)) { ride({ x: padX + 13 * U, y: padY, z: A.z, inside: false }, 'Rising to the Grid — the pyramid tip'); return true; }
      var C = hookWorld('hook_line_colosseum'), CW = root.COLOSSEUM_WORLD;
      if (near(p, C, 12) && CW) { var dx = CW.door[0] + CW.front[0] * 30 * U, dz = CW.door[1] + CW.front[1] * 30 * U; ride({ x: dx, y: o.heightAt ? o.heightAt(dx, dz) : 0, z: dz, inside: false }, 'Colosseum Line — next stop: the Colosseum'); return true; }
      var W = hookWorld('hook_line_undersea');
      if (near(p, W, 12)) {
        var T = (root.__worldTransitApi && root.__worldTransitApi.stations || []).filter(function (s) { return s.realm === 'ocean' && s.group; })[0];
        if (T) { var tp = T.group.position; ride({ x: tp.x + 12 * U, y: o.heightAt ? o.heightAt(tp.x + 12 * U, tp.z) : tp.y, z: tp.z, inside: false }, 'Undersea Line — through the reef tube to the Harbor'); return true; }
      }
      return false;
    }
    addEventListener('keydown', function (e) { if (e.code !== 'KeyE' || e.repeat) return; if (use()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    // floor + solids inside the cavern (metres in cavern space)
    (root.__groundHooks = root.__groundHooks || []).push(function (p) {
      if (!st.inside) return null;
      var lx = (p.x - A.x) / U, lz = (p.z - A.z) / U, r = Math.hypot(lx, lz), wr = st.wallR - 3;
      var stx = lx < -wr + 2 && Math.abs(lz) < 40 && lx > -wr - 122;                                  // station hall (west, beyond the wall)
      if (!stx && r > wr) { lx *= wr / r; lz *= wr / r; }
      if (Math.abs(lx) < 77 && Math.abs(lz) < 77) { if (Math.abs(lx) > Math.abs(lz)) lx = lx < 0 ? -77 : 77; else lz = lz < 0 ? -77 : 77; }   // pyramid base is solid
      var rr = Math.hypot(lx, lz), ang = Math.atan2(lz, lx), onBridge = false;
      for (var k = 0; k < 4; k++) { var d = Math.abs(Math.atan2(Math.sin(ang - (k * Math.PI / 2 + Math.PI / 4)), Math.cos(ang - (k * Math.PI / 2 + Math.PI / 4)))); if (d * rr < 7) onBridge = true; }
      if (!onBridge && rr > 117 && rr < 147) { var to = rr < 132 ? 117 : 147; lx *= to / rr; lz *= to / rr; }   // canal: walk the bridges
      p.x = A.x + lx * U; p.z = A.z + lz * U;
      return BY + (onBridge && rr > 117 && rr < 147 ? 2.0 * U * Math.sin(Math.PI * (rr - 116) / 33) : 0) + (stx ? 1.3 * U : 0);
    });
    (root.__groundAtHooks = root.__groundAtHooks || []).push(function (x, z) { return st.inside ? BY : null; });   // controller floor in the cavern
    (root.__groundHooks = root.__groundHooks || []).push(function (p) {   // surface: the shaft is open — hold walkers outside the collar
      if (st.inside) return null; var dx = p.x - A.x, dz = p.z - A.z, r = Math.hypot(dx, dz), R = (SHAFT_M + 2.4) * U;
      if (r < R && r > 1e-3 && Math.abs(p.y - gy) < 30 * U) { p.x = A.x + dx / r * R; p.z = A.z + dz / r * R; }
      return null;
    });
    var nearT = 0;
    function tick(t) {
      if (t - nearT > 0.5) { nearT = t; if (!holeSet) cutHole(); var pp = o.getPlayer && o.getPlayer(); var near_ = pp && Math.hypot(pp.x - A.x, pp.z - A.z) < 900 * U; group.visible = st.inside || !!near_; tip.visible = !group.visible; } if (st.inside && st.water) st.water.opacity = 0.8 + 0.05 * Math.sin(t * 1.3); ring.material.color.setHSL(0.11, 1, 0.6 + 0.08 * Math.sin(t * 2)); }
    return ready.then(function (ok) {
      var api = { group: group, pad: pad, tick: tick, use: use, isInside: function () { return st.inside; }, stats: function () { return { loaded: ok, hooks: Object.keys(st.hooks), inside: st.inside, depthM: DEPTH_M }; } };
      root.__bazaar = api; return api;
    });
  }
  root.WorldUndergroundBazaar = { build: build };
})(typeof window !== 'undefined' ? window : this);
