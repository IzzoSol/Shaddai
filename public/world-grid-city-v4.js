/* world-grid-city-v4.js — THE GRID city blocks for Map v4 (?map=v4), built from a pre-generated plan.
 *
 *   var city = window.buildGridCityV4({ THREE, scene, heightAt, plan, camera, night, rebuildCollision });
 *   city.update(t, dt, camPos);  city.stats();  city.setNight(k);  city.dispose();
 *
 * WHY a plan file: public/assets/world/grid-city-v4.json is produced by tools/grid-city/grid-city-plan.cjs
 * (deterministic seed). Blender (tools/blender/grid-city-v4.py) reads the same file, so the game and the Blender
 * scene show the SAME ~1000 buildings. This module makes no layout decisions — it only turns records into meshes.
 *
 * Frame: plan is in metres, X = east, Y = north. Game units: x = X·U, z = -Y·U, U = plan.units_per_m (7/1.8).
 * rot_deg is rotation about the vertical; it is used as three's rotation.y directly (world (cosρ, sinρ) in XY →
 * game (cosρ, -sinρ) in xz — the same handedness flip as z = -Y, so no sign change is needed).
 * heightAt(x, z) takes and returns GAME units.
 *
 * DRAW CALLS (the whole point): every solid in the city is a stretched copy of ONE unit box (base at y = 0).
 * Towers, tapered crowns, needles, cantilevered slabs, accent strips, skybridges, lamp poles/heads, plaza and park
 * pads, fountains and tree trunks are all instances of that box; a per-instance attribute aAux = (taper, kind,
 * seed) tells the shared MeshStandardMaterial (patched in onBeforeCompile) how to draw each one:
 *   taper — top of the box is scaled by this in x/z (1 = box, 0.62 tapered tier, 0.25 crown, 0.04 needle)
 *   kind  — 0 glass facade (procedural window texture, windows glow via emissiveMap) · 1 emissive accent
 *           (colour = instanceColor, the SHADDAI teal/emerald/gold) · 2 matte (poles, pads, basins)
 *   seed  — offsets the window UVs so neighbouring towers don't share the same lit-window pattern
 * Window UVs are rebuilt in the vertex shader from the instance's real size (read back from instanceMatrix), so a
 * 200 m tower gets ~57 floors and a 4 m slab gets one glass band — one texture, correct scale everywhere.
 * Tree canopies (low green domes) are the only other geometry. Everything is split into 16 spatial chunks
 * (8 × 45° wedges × inner/outer band) so three.js frustum-culls whole chunks: ≤ 16 box + ≤ 16 canopy meshes =
 * ≤ 32 draw calls with the whole city on screen, typically 8–14 in a street-level view.
 */
(function () {
  'use strict';

  var ACCENT = { teal: 0x27e0ff, emerald: 0x00ff9c, gold: 0xe8c45c };
  // facade tints multiply the steel-panel texture: mostly white/silver (the reference megatowers), a few obsidian
  var TINTS = [0xe4eaef, 0xd3dbe2, 0xc2ccd6, 0xaebccb, 0xe9e3d8, 0x3b4550, 0x2c343d];
  var TILE_W = 24, TILE_H = 28;          // metres covered by one window-texture tile (8 bays × 3 m, 8 floors × 3.5 m)

  function mulberry(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ── procedural window textures (canvas): map = steel mullions + dark glass; emissiveMap = randomly lit windows ──
  function windowTextures(THREE, rnd) {
    var N = 512, C = 64;                  // 8 × 8 cells
    function canvas() { var c = document.createElement('canvas'); c.width = c.height = N; return c; }
    var cm = canvas(), gm = cm.getContext('2d'), ce = canvas(), ge = ce.getContext('2d');
    gm.fillStyle = '#b8c1c9'; gm.fillRect(0, 0, N, N);                 // steel panel
    ge.fillStyle = '#000'; ge.fillRect(0, 0, N, N);
    for (var fy = 0; fy < 8; fy++) for (var bx = 0; bx < 8; bx++) {
      var x = bx * C, y = fy * C;
      gm.fillStyle = '#9aa4ad'; gm.fillRect(x, y + C - 10, C, 10);      // spandrel band (floor slab line)
      var grd = gm.createLinearGradient(x, y, x + C, y + C);            // glass: dark teal-black with a sky sheen
      grd.addColorStop(0, '#20394a'); grd.addColorStop(0.55, '#0c1820'); grd.addColorStop(1, '#162a36');
      gm.fillStyle = grd; gm.fillRect(x + 3, y + 3, C - 6, C - 15);
      gm.fillStyle = 'rgba(255,255,255,0.06)'; gm.fillRect(x + 3, y + 3, (C - 6) * 0.35, C - 15);
      var r = rnd();
      if (r < 0.42) {                                                    // lit window (warm office / cool lab light)
        var k = 0.45 + rnd() * 0.55, cool = rnd() < 0.3;
        ge.fillStyle = cool ? 'rgba(160,240,255,' + k + ')' : 'rgba(255,214,150,' + k + ')';
        ge.fillRect(x + 4, y + 4, C - 8, C - 17);
      } else if (r < 0.47) {                                             // dim screen glow
        ge.fillStyle = 'rgba(39,224,255,0.25)'; ge.fillRect(x + 8, y + 10, C - 16, C - 28);
      }
    }
    function tex(c) {
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true; return t;
    }
    return { map: tex(cm), emissive: tex(ce) };
  }

  // ── the ONE facade material (patched): taper, per-kind shading, size-scaled window UVs, night factor ──
  function facadeMaterial(THREE, tx, U, uni) {
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tx.map, emissive: 0xfff0d8, emissiveMap: tx.emissive,
      emissiveIntensity: 1.25, roughness: 0.32, metalness: 0.55 });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uNight = uni.uNight; sh.uniforms.uAccentGain = uni.uAccentGain; sh.uniforms.uInvU = uni.uInvU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aAux;\nvarying float vKind;\nvarying float vRoof;\nuniform float uInvU;')
        .replace('#include <uv_vertex>', [
          '#include <uv_vertex>',
          '#ifdef USE_INSTANCING',
          '  vec3 gcSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)) * uInvU;',
          '#else',
          '  vec3 gcSize = vec3(1.0);',
          '#endif',
          // side faces: u spans the face width (x faces span depth, z faces span width), v spans the height
          '  float gcFaceW = abs(normal.x) > 0.5 ? gcSize.z : gcSize.x;',
          '  vec2 gcUv = vec2(uv.x * gcFaceW / ' + TILE_W.toFixed(1) + ' + aAux.z, uv.y * gcSize.y / ' + TILE_H.toFixed(1) + ' + fract(aAux.z * 7.31));',
          '#ifdef USE_MAP',
          '  vMapUv = gcUv;',
          '#endif',
          '#ifdef USE_EMISSIVEMAP',
          '  vEmissiveMapUv = gcUv;',
          '#endif'].join('\n'))
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          '  transformed.xz *= mix(1.0, aAux.x, position.y);',   // unit box has y in 0..1 → taper toward the top
          '  vKind = aAux.y;',
          '  vRoof = step(0.5, abs(normal.y));'].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vKind;\nvarying float vRoof;\nuniform float uNight;\nuniform float uAccentGain;')
        .replace('#include <map_fragment>', [
          '#ifdef USE_MAP',
          '  if (vKind < 0.5 && vRoof < 0.5) diffuseColor *= texture2D(map, vMapUv);',   // only facades get windows
          '#endif'].join('\n'))
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          '  if (vKind < 0.5 && vRoof > 0.5) diffuseColor.rgb = vec3(0.055, 0.065, 0.075);'].join('\n'))   // obsidian roofs
        .replace('#include <metalnessmap_fragment>', [
          '#include <metalnessmap_fragment>',
          '  if (vKind > 0.5) { metalnessFactor = 0.15; roughnessFactor = 0.75; }'].join('\n'))
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          '  totalEmissiveRadiance *= uNight;',
          '  if (vRoof > 0.5 || vKind > 1.5) totalEmissiveRadiance = vec3(0.0);',
          '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )',
          '  if (vKind > 0.5 && vKind < 1.5) totalEmissiveRadiance = vColor.rgb * uAccentGain;',
          '#endif'].join('\n'));
    };
    m.customProgramCacheKey = function () { return 'grid-city-v4-facade'; };
    return m;
  }

  window.buildGridCityV4 = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, plan = opts.plan;
    if (!THREE || !scene || !plan || !plan.buildings) throw new Error('buildGridCityV4: THREE, scene and plan are required');
    var heightAt = typeof opts.heightAt === 'function' ? opts.heightAt : function () { return 0; };
    var U = +plan.units_per_m || 7 / 1.8, RAD = Math.PI / 180;
    var rnd = mulberry((plan.seed || 1) + 17);
    var uni = { uNight: { value: opts.night != null ? +opts.night : 0.6 }, uAccentGain: { value: 1.8 }, uInvU: { value: 1 / U } };
    var tx = windowTextures(THREE, rnd), mat = facadeMaterial(THREE, tx, U, uni);
    var canopyMat = new THREE.MeshStandardMaterial({ color: 0x1d7a4c, emissive: 0x00ff9c, emissiveIntensity: 0.06, roughness: 0.85, flatShading: true });
    var root = new THREE.Group(); root.name = 'grid-city-v4'; scene.add(root);

    // ── 16 spatial chunks: 8 compass wedges × (r < 900 m | r ≥ 900 m) ──
    var R_SPLIT = 900, NCH = 16, chunks = [];
    for (var ci = 0; ci < NCH; ci++) chunks.push({ box: [], canopy: [] });
    function chunkOf(X, Y) { var c = (Math.atan2(X, Y) / RAD + 360) % 360; return (Math.floor(c / 45) % 8) + (Math.hypot(X, Y) >= R_SPLIT ? 8 : 0); }
    // ground in GAME units: lowest sample under the footprint so nothing floats on a slope
    function groundY(X, Y, rw) {
      var h = heightAt(X * U, -Y * U);
      if (rw > 0) for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2 + 0.785; h = Math.min(h, heightAt((X + Math.cos(a) * rw) * U, -(Y + Math.sin(a) * rw) * U)); }
      return h - 0.3 * U;   // sink 0.3 m: hides the seam on the (flat) Grid disc
    }
    var col = new THREE.Color();
    // push one box instance. (cx,cy) world metres of the building origin; ox/oy local offsets; rho rotation (rad)
    function box(ch, cx, cy, rho, gy, ox, oy, z0, w, d, h, taper, kind, color) {
      var c = Math.cos(rho), s = Math.sin(rho);
      ch.box.push({ x: (cx + ox * c - oy * s) * U, y: gy + z0 * U, z: -(cy + ox * s + oy * c) * U, rho: rho,
        sx: w * U, sy: h * U, sz: d * U, t: taper, k: kind, c: color, seed: rnd() });
    }

    // ── buildings ──
    var byId = {}, colliderRefs = [], L = window.WORLD_LAYOUT;
    var nTiers = 0, nAccents = 0;
    var TAPER = [1, 0.62, 0.25, 1, 0.04];
    plan.buildings.forEach(function (b) {
      var ch = chunks[chunkOf(b.x_m, b.y_m)], rho = b.rot_deg * RAD;
      var gy = groundY(b.x_m, b.y_m, Math.max(b.w_m, b.d_m) * 0.5);
      var tint = TINTS[Math.floor(rnd() * TINTS.length)], acc = ACCENT[b.accent] || ACCENT.teal;
      byId[b.id] = { b: b, gy: gy };
      b.tiers.forEach(function (t, i) {
        var w = t[0], d = t[1], z0 = t[2], h = t[3], ox = t[4], oy = t[5], ty = t[6];
        if (ty === 4) { box(ch, b.x_m, b.y_m, rho, gy, ox, oy, z0, w, d, h, TAPER[4], 1, acc); nTiers++; return; }   // glowing needle
        box(ch, b.x_m, b.y_m, rho, gy, ox, oy, z0, w, d, h, TAPER[ty] || 1, 0, tint); nTiers++;
        if (ty === 3) { box(ch, b.x_m, b.y_m, rho, gy, ox, oy, z0 - 0.35, w + 0.4, d + 0.4, 0.35, 1, 1, acc); nAccents++; return; }   // slab under-glow
        if (ty === 2) return;
        // cornice band at the top of straight tiers, base band on set-back / tapered tiers
        var top = ty === 0, zb = top ? z0 + h - 0.5 : z0, ww = top ? w : w;
        box(ch, b.x_m, b.y_m, rho, gy, ox, oy, zb, ww + 0.8, d + 0.8, 0.9, 1, 1, acc); nAccents++;
        // vertical corner fin on the main shaft of tall buildings (the reference towers' light seams)
        if (i === (b.kind === 'podium' ? 1 : 0) && h > 50 && b.kind !== 'hall') {
          box(ch, b.x_m, b.y_m, rho, gy, ox + w / 2, oy + d / 2, z0, 0.9, 0.9, h, 1, 1, acc); nAccents++;
        }
      });
      // colliders: circles along the widest ground tier (halls get 3, square footprints 1)
      if (L && Array.isArray(L.realmColliders)) {
        var g = b.tiers.filter(function (t) { return t[2] < 3 && t[6] !== 3; }).sort(function (p, q) { return q[0] * q[1] - p[0] * p[1]; })[0];
        if (g) {
          var lw = Math.max(g[0], g[1]), sw = Math.min(g[0], g[1]), along = g[0] >= g[1];
          var n = lw / sw > 1.4 ? Math.ceil(lw / sw) + 1 : 1, rr = (n > 1 ? sw * 0.55 : (g[0] + g[1]) * 0.27);
          for (var k = 0; k < n; k++) {
            var off = n > 1 ? -(lw - sw) / 2 + (lw - sw) * k / (n - 1) : 0;
            var lx = g[4] + (along ? off : 0), ly = g[5] + (along ? 0 : off), cc = Math.cos(rho), ss = Math.sin(rho);
            var X = b.x_m + lx * cc - ly * ss, Y = b.y_m + lx * ss + ly * cc;
            var cref = { x: Math.round(X * U), z: Math.round(-Y * U), r: Math.round(rr * U), label: 'grid-city' };
            L.realmColliders.push(cref); colliderRefs.push(cref);
          }
        }
      }
    });

    // ── skybridges: glass tube box between the two towers at ~55 % of the lower one, glowing underline ──
    var nBridges = 0;
    plan.buildings.forEach(function (a) {
      if (!a.skybridgeTo || !byId[a.skybridgeTo]) return;
      var B = byId[a.skybridgeTo].b, dx = B.x_m - a.x_m, dy = B.y_m - a.y_m, len = Math.hypot(dx, dy);
      var mx = (a.x_m + B.x_m) / 2, my = (a.y_m + B.y_m) / 2, rho = Math.atan2(dy, dx);
      var z = Math.round(Math.min(a.h_m, B.h_m) * 0.55), gy = Math.max(byId[a.id].gy, byId[B.id].gy), ch = chunks[chunkOf(mx, my)];
      box(ch, mx, my, rho, gy, 0, 0, z, len, 7, 5, 1, 0, 0xdfe8ef);
      box(ch, mx, my, rho, gy, 0, 0, z - 0.4, len, 7.4, 0.4, 1, 1, ACCENT[a.accent] || ACCENT.teal);
      nBridges++;
    });

    // ── plazas: dark stone pad + round-ish basin + teal water jet ──
    (plan.plazas || []).forEach(function (p) {
      var ch = chunks[chunkOf(p.x_m, p.y_m)], rho = p.rot_deg * RAD, gy = groundY(p.x_m, p.y_m, 0), fr = p.fountain_r_m || 6;
      box(ch, p.x_m, p.y_m, rho, gy, 0, 0, 0, p.w_m, p.d_m, 0.5, 1, 2, 0x2a3139);
      box(ch, p.x_m, p.y_m, rho, gy, 0, 0, 0.5, fr * 2, fr * 2, 0.9, 0.9, 2, 0x39424c);
      box(ch, p.x_m, p.y_m, rho + 0.785, gy, 0, 0, 0.5, fr * 1.6, fr * 1.6, 0.95, 1, 1, ACCENT.teal);
      box(ch, p.x_m, p.y_m, rho, gy, 0, 0, 1.4, 1.2, 1.2, 5, 0.1, 1, 0xbff6ff);
    });
    // ── parks: emerald lawn pad + trees (trunk box + dome canopy) ──
    var nTrees = 0;
    (plan.parks || []).forEach(function (p) {
      var ch = chunks[chunkOf(p.x_m, p.y_m)], rho = p.rot_deg * RAD, gy = groundY(p.x_m, p.y_m, 0);
      box(ch, p.x_m, p.y_m, rho, gy, 0, 0, 0, p.w_m, p.d_m, 0.6, 1, 2, 0x1c4d33);
      (p.trees || []).forEach(function (t) {
        var ty = groundY(t[0], t[1], 0), r = t[2];
        box(ch, t[0], t[1], 0, ty, 0, 0, 0, 0.6, 0.6, r * 0.9, 1, 2, 0x2b2f33);
        ch.canopy.push({ x: t[0] * U, y: ty + r * 0.75 * U, z: -t[1] * U, r: r * U, ry: rnd() * 6.28 });
        nTrees++;
      });
    });
    // ── lamps: 9 m pole + emissive head (teal-white) ──
    (plan.lamps || []).forEach(function (l) {
      var ch = chunks[chunkOf(l.x_m, l.y_m)], gy = groundY(l.x_m, l.y_m, 0), rho = Math.atan2(l.y_m, l.x_m);
      box(ch, l.x_m, l.y_m, rho, gy, 0, 0, 0, 0.3, 0.3, 9, 1, 2, 0x1a1f26);
      box(ch, l.x_m, l.y_m, rho, gy, 0, 0, 9, 1.6, 0.5, 0.35, 1, 1, 0xc8fbff);
    });

    // ── materialise: one InstancedMesh (box) + one (canopy) per chunk ──
    var baseBox = new THREE.BoxGeometry(1, 1, 1); baseBox.translate(0, 0.5, 0);
    var baseDome = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2); baseDome.scale(1, 0.8, 1);
    var owned = [baseBox, baseDome, mat, canopyMat, tx.map, tx.emissive], meshes = [];
    var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0);
    var totalInst = 0;
    chunks.forEach(function (ch, idx) {
      if (ch.box.length) {
        var g = baseBox.clone(), aux = new Float32Array(ch.box.length * 3);
        var im = new THREE.InstancedMesh(g, mat, ch.box.length);
        ch.box.forEach(function (o, i) {
          Q.setFromAxisAngle(YAX, o.rho); P.set(o.x, o.y, o.z); S.set(o.sx, o.sy, o.sz);
          im.setMatrixAt(i, M4.compose(P, Q, S)); im.setColorAt(i, col.setHex(o.c));
          aux[i * 3] = o.t; aux[i * 3 + 1] = o.k; aux[i * 3 + 2] = o.seed;
        });
        g.setAttribute('aAux', new THREE.InstancedBufferAttribute(aux, 3));
        finish(im, 'grid-city-box-' + idx); owned.push(g); totalInst += ch.box.length;
      }
      if (ch.canopy.length) {
        var gc = baseDome.clone(), cm = new THREE.InstancedMesh(gc, canopyMat, ch.canopy.length);
        ch.canopy.forEach(function (o, i) {
          Q.setFromAxisAngle(YAX, o.ry); P.set(o.x, o.y, o.z); S.set(o.r, o.r, o.r);
          cm.setMatrixAt(i, M4.compose(P, Q, S));
        });
        finish(cm, 'grid-city-canopy-' + idx); owned.push(gc); totalInst += ch.canopy.length;
      }
      ch.box = ch.canopy = null;   // free the build records
    });
    function finish(im, name) {
      im.name = name; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();          // per-chunk sphere → three's frustum test culls the whole chunk
      im.frustumCulled = true; im.matrixAutoUpdate = false; im.updateMatrix();
      im.castShadow = !!opts.shadows; im.receiveShadow = !!opts.shadows;
      root.add(im); meshes.push(im);
    }

    // colliders were pushed after world-collision.js copied the layout → rebuild once so they are solid
    if (colliderRefs.length && opts.rebuildCollision !== false && L && typeof window.buildWorldCollision === 'function') {
      try { window.buildWorldCollision(L); } catch (e) { console.warn('[grid-city-v4] collision rebuild failed:', e && e.message); }
    }

    var st = { buildings: plan.buildings.length, tiers: nTiers, accents: nAccents, skybridges: nBridges,
      plazas: (plan.plazas || []).length, parks: (plan.parks || []).length, trees: nTrees, lamps: (plan.lamps || []).length,
      instances: totalInst, meshes: meshes.length, colliders: colliderRefs.length };
    console.info('[grid-city-v4]', st.buildings, 'buildings ·', st.instances, 'instances ·', st.meshes, 'meshes (max draw calls)');

    return {
      group: root,
      update: function (t, dt, camPos) {
        if (typeof opts.getNight === 'function') { var k = +opts.getNight(t); if (isFinite(k)) uni.uNight.value = Math.max(0, Math.min(1, k)); }
        uni.uAccentGain.value = 1.7 + 0.25 * Math.sin((t || 0) * 0.8);   // slow breathing on the light strips
      },
      setNight: function (k) { uni.uNight.value = Math.max(0, Math.min(1, +k || 0)); },
      stats: function () {
        var vis = 0; meshes.forEach(function (m) { if (m.visible) vis++; });
        return Object.assign({ visibleMeshes: vis }, st);
      },
      dispose: function () {
        scene.remove(root);
        meshes.forEach(function (m) { try { m.dispose(); } catch (e) {} });
        owned.forEach(function (o) { try { o.dispose(); } catch (e) {} });
        if (L && Array.isArray(L.realmColliders)) colliderRefs.forEach(function (c) { var i = L.realmColliders.indexOf(c); if (i >= 0) L.realmColliders.splice(i, 1); });
        if (colliderRefs.length && typeof window.buildWorldCollision === 'function' && L) { try { window.buildWorldCollision(L); } catch (e) {} }
        colliderRefs = []; meshes = [];
      }
    };
  };
})();
