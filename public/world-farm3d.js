/* world-farm3d.js — the community FARM PATCH in the 3D world: six raised beds (matching WorldFarm's six beds) at the edge of the SW plot district.
 * Each bed shows its real growth: sprouts scale with progress, ripe beds glow gold. Walk up (within ~14 m) and a "FARM BEDS" button appears (opens WorldFarm).
 * API: buildFarm3D({ THREE, scene, heightAt, getPlayer, U?, at?:{x_m,y_m} }) -> { group, update(dt), pos, dispose() }
 * Placement: metres (-80,-50) in Blender space, which is clear of every plot (>95 m) — world x = x_m*U, z = -y_m*U.
 */
(function (root) {
  'use strict';
  var COLS = { bean: 0x7fe08a, berry: 0xff4f8b, pepper: 0xff7a2a };
  function buildFarm3D(o) {
    var THREE = o.THREE, U = o.U || 7 / 1.8, at = o.at || { x_m: -80, y_m: -50 }, cx = at.x_m * U, cz = -at.y_m * U;
    var BED_W = 2.4 * U, BED_D = 2.4 * U, GAP = 0.8 * U, g = new THREE.Group(); g.name = 'farm-patch';
    var soil = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }), rim = new THREE.MeshStandardMaterial({ color: 0x6d7a82, roughness: 0.6, metalness: 0.3 });
    var beds = [], plantGeo = new THREE.ConeGeometry(0.35 * U / 2, 0.9 * U / 2, 6); plantGeo.translate(0, 0.45 * U / 2, 0);
    var plantMats = {}; Object.keys(COLS).forEach(function (k) { plantMats[k] = new THREE.MeshStandardMaterial({ color: COLS[k], emissive: COLS[k], emissiveIntensity: 0.15, roughness: 0.7 }); });
    var ripeMat = new THREE.MeshStandardMaterial({ color: 0xe8c45c, emissive: 0xe8c45c, emissiveIntensity: 0.9 });
    var hy = o.heightAt ? o.heightAt(cx, cz) : 0;
    for (var i = 0; i < 6; i++) {
      var col = i % 3, row = (i / 3) | 0, bx = cx + (col - 1) * (BED_W + GAP), bz = cz + (row - 0.5) * (BED_D + GAP);
      var by = o.heightAt ? o.heightAt(bx, bz) : hy;
      var bed = new THREE.Group(); bed.position.set(bx, by, bz);
      var box = new THREE.Mesh(new THREE.BoxGeometry(BED_W, 0.5 * U / 2, BED_D), soil); box.position.y = 0.12 * U; bed.add(box);
      [[0, BED_D / 2, BED_W, 0.12 * U], [0, -BED_D / 2, BED_W, 0.12 * U]].forEach(function (r) { var m = new THREE.Mesh(new THREE.BoxGeometry(r[2], 0.45 * U / 2, r[3]), rim); m.position.set(r[0], 0.13 * U, r[1]); bed.add(m); });
      [-BED_W / 2, BED_W / 2].forEach(function (x) { var m = new THREE.Mesh(new THREE.BoxGeometry(0.12 * U, 0.45 * U / 2, BED_D), rim); m.position.set(x, 0.13 * U, 0); bed.add(m); });
      var plants = []; for (var k = 0; k < 4; k++) { var p = new THREE.Mesh(plantGeo, plantMats.bean); p.position.set(((k % 2) - 0.5) * BED_W * 0.45, 0.2 * U, ((k / 2 | 0) - 0.5) * BED_D * 0.45); p.visible = false; bed.add(p); plants.push(p); }
      g.add(bed); beds.push({ plants: plants });
    }
    var sign = new THREE.Mesh(new THREE.BoxGeometry(0.2 * U, 1.6 * U, 0.2 * U), rim); sign.position.set(cx, hy + 0.8 * U, cz - 2.2 * (BED_D + GAP) * 0.6); g.add(sign);
    o.scene.add(g);
    var acc = 0, btn = null, shown = false;
    function refresh() {
      var st = root.WorldFarm && root.WorldFarm.beds ? root.WorldFarm.beds() : [];
      for (var i = 0; i < 6; i++) {
        var v = st[i], ps = beds[i].plants;
        for (var k = 0; k < ps.length; k++) {
          var p = ps[k]; if (!v) { p.visible = false; continue; }
          p.visible = true; var s = 0.25 + 0.75 * v.pct; p.scale.set(s, s * (v.ready ? 1.25 : 1), s);
          p.material = v.ready ? ripeMat : (plantMats[v.crop] || plantMats.bean);
        }
      }
    }
    function ensureBtn(show) {
      if (typeof document === 'undefined') return;
      if (show && !btn) {
        btn = document.createElement('button'); btn.textContent = 'FARM BEDS — tap to tend';
        btn.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:9500;background:linear-gradient(180deg,rgba(0,255,156,.3),rgba(0,120,80,.45));border:1px solid #00ff9c;border-bottom-width:3px;border-radius:10px;color:#eafff6;padding:8px 16px;cursor:pointer;font:700 14px Rajdhani,sans-serif;letter-spacing:.08em';
        btn.onclick = function () { if (root.WorldFarm) root.WorldFarm.open(); }; document.body.appendChild(btn);
      } else if (!show && btn) { btn.remove(); btn = null; }
    }
    function update(dt) {
      acc += dt; if (acc < 1) return; acc = 0; refresh();
      var pl = o.getPlayer && o.getPlayer(); if (!pl || !pl.pos) return;
      var near = Math.hypot(pl.pos.x - cx, pl.pos.z - cz) < 14 * U && !root._currentInterior; if (near !== shown) { shown = near; ensureBtn(near); }
    }
    refresh();
    return { group: g, update: update, pos: { x: cx, z: cz }, dispose: function () { ensureBtn(false); o.scene.remove(g); } };
  }
  root.buildFarm3D = buildFarm3D;
})(typeof window !== 'undefined' ? window : globalThis);
