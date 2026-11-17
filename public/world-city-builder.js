/* world-city-builder.js — WAVE2 (issue #6): the designed Grid city finally gets BUILT.
 *
 * grid-city-v4.json (318 buildings / 199 plazas / 302 parks / 1,301 lamps, centred on origin) used to have
 * exactly one runtime consumer: WorldCityHeights, a race-track height raster. Nothing instantiated the plan
 * as geometry on a normal load, so the city footprint around the plaza was an empty grey plain.
 *
 * This module is a NEW consumer of the plan (world-grid-city-v4.js stays superseded/unwired — do not wire it;
 * it would double-build). v1 builds the SPAWN DISTRICT: every building whose centre lies within `radiusM`
 * (default 700 m) of the plan origin, phased in after spawn by the host (world-main bootCityBuilder), so boot
 * time does not regress. Farther districts are a later phase.
 *
 * Rendering: ONE unit-box InstancedMesh for all box/slab/crown tiers and ONE tapered-prism InstancedMesh for
 * taper/needle tiers (per-instance matrix carries position/rotation/scale; per-instance colour carries the
 * kind tint mixed toward the building's accent). Lamps are two more InstancedMeshes (pole + head). District
 * draw calls are O(archetypes) = 4, not O(buildings) — the naive per-tier count for the same district is 306.
 *
 * Placement math mirrors world-city-heights.js exactly (same plan, same convention):
 *   tier offset (ox, oy) rotated by rot_deg:  e = x_m + ox*c - oy*s,  nth = y_m + ox*s + oy*c
 *   world x = e * U, world z = -nth * U,  mesh rotation.y = rot_deg (local +x -> (c, -s), local +z -> (s, c))
 * Ground Y comes from the host's heightAt(x, z); tier z0 (metres) stacks on top of it.
 *
 * API:
 *   WorldCityBuilder.planDistrict(plan, { U?, radiusM? })
 *     -> { boxes: [{x, z, y0, w, d, h, rotY, type, kind, accent}], lamps: [{x, z}], stats }   (PURE, no THREE)
 *   WorldCityBuilder.build({ THREE, scene, plan, U?, heightAt, radiusM? })
 *     -> { group, stats: { buildings, tiers, lamps, meshes, drawCalls, naiveDrawCalls }, dispose() }
 *   WorldCityBuilder.planCells(plan, { U?, cellM? })   (V2 / C-5, PURE, no THREE)
 *     -> { cells: [{ key, cx, cz, boundsM, centreM, boxes, lamps, proxies, maxTopM }], stats }
 *   WorldCityBuilder.buildCells({ THREE, scene, plan, U?, heightAt, cellM?, fullM?, proxyM?, hyst? })
 *     -> { group, cells (per-cell bounds/maxTop/band — the C-6 PVS-lite input), stats, update(x, z), dispose() }
 * Node: require() exposes { planDistrict, build, planCells, buildCells } for the structural tests.
 */
(function (root) {
  'use strict';

  var KIND_TINT = { tower: 0x8a93a6, podium: 0x7a7f8c, terrace: 0x9a8f7a, hall: 0x6a7a8c, spire: 0xaab4c8 };
  var ACCENT = { gold: 0xe8c45c, emerald: 0x2eff8a, teal: 0x2ec6da };

  function planDistrict(plan, o) {
    o = o || {};
    var U = o.U || (plan && plan.units_per_m) || 7 / 1.8;
    var radiusM = o.radiusM != null ? o.radiusM : 700;
    var B = (plan && plan.buildings) || [], L = (plan && plan.lamps) || [];
    var boxes = [], lamps = [], byKind = {}, i, k;
    for (i = 0; i < B.length; i++) {
      var b = B[i];
      if (Math.hypot(b.x_m || 0, b.y_m || 0) > radiusM) continue;
      byKind[b.kind] = (byKind[b.kind] || 0) + 1;
      var rho = (b.rot_deg || 0) * Math.PI / 180, c = Math.cos(rho), s = Math.sin(rho);
      var tiers = b.tiers && b.tiers.length ? b.tiers : [[b.w_m, b.d_m, 0, b.h_m || 0, 0, 0, 0]];
      for (k = 0; k < tiers.length; k++) {
        var t = tiers[k], ox = t[4] || 0, oy = t[5] || 0;
        var e = b.x_m + ox * c - oy * s, nth = b.y_m + ox * s + oy * c;
        boxes.push({
          x: e * U, z: -nth * U, y0: (t[2] || 0) * U,
          w: t[0] * U, d: t[1] * U, h: t[3] * U,
          rotY: rho, type: t[6] || 0, kind: b.kind || 'tower', accent: b.accent || null, id: b.id
        });
      }
    }
    for (i = 0; i < L.length; i++) {
      var l = L[i];
      if (Math.hypot(l.x_m || 0, l.y_m || 0) > radiusM) continue;
      lamps.push({ x: l.x_m * U, z: -l.y_m * U });
    }
    return {
      boxes: boxes, lamps: lamps,
      stats: { buildings: Object.keys(byKind).reduce(function (n, k2) { return n + byKind[k2]; }, 0), byKind: byKind,
        tiers: boxes.length, lamps: lamps.length, buildingsTotal: B.length, lampsTotal: L.length, radiusM: radiusM, U: U }
    };
  }

  function build(o) {
    var THREE = o.THREE, scene = o.scene, U = o.U || (o.plan && o.plan.units_per_m) || 7 / 1.8;
    var heightAt = typeof o.heightAt === 'function' ? o.heightAt : function () { return 0; };
    var D = planDistrict(o.plan, { U: U, radiusM: o.radiusM });
    var group = new THREE.Group(); group.name = 'grid-city-district';

    var boxTiers = D.boxes.filter(function (t) { return t.type !== 1 && t.type !== 4; });
    var taperTiers = D.boxes.filter(function (t) { return t.type === 1 || t.type === 4; });

    var dummy = new THREE.Object3D(), col = new THREE.Color(), tint = new THREE.Color(), acc = new THREE.Color();
    function fill(im, tiers) {
      for (var i = 0; i < tiers.length; i++) {
        var t = tiers[i];
        dummy.position.set(t.x, heightAt(t.x, t.z) + t.y0, t.z);
        dummy.rotation.set(0, t.rotY, 0);
        dummy.scale.set(t.w, t.h, t.d);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        tint.set(KIND_TINT[t.kind] || 0x8a93a6);
        if (t.accent && ACCENT[t.accent]) { acc.set(ACCENT[t.accent]); tint.lerp(acc, 0.25); }
        im.setColorAt(i, tint);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;            // instances span the whole district; never cull the set
      im.castShadow = false; im.receiveShadow = false;   // shadow pass is opt-in (?shadows) and priced per caster
      group.add(im);
    }

    var meshes = 0;
    if (boxTiers.length) {
      var boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);   // origin at the tier's base
      var boxMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 });
      var boxIM = new THREE.InstancedMesh(boxGeo, boxMat, boxTiers.length); boxIM.name = 'city-tiers-box';
      fill(boxIM, boxTiers); meshes++;
    }
    if (taperTiers.length) {
      // 4-sided prism rotated 45° so its faces align with the local axes; radii chosen so the scaled
      // footprint is w×d at the base narrowing to ~0.6·w×0.6·d at the top (taper/needle silhouette).
      var tapGeo = new THREE.CylinderGeometry(0.424, 0.707, 1, 4); tapGeo.rotateY(Math.PI / 4); tapGeo.translate(0, 0.5, 0);
      var tapMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.15 });
      var tapIM = new THREE.InstancedMesh(tapGeo, tapMat, taperTiers.length); tapIM.name = 'city-tiers-taper';
      fill(tapIM, taperTiers); meshes++;
    }
    if (D.lamps.length) {
      var poleH = 5 * U;
      var poleGeo = new THREE.CylinderGeometry(0.09 * U, 0.12 * U, poleH, 5); poleGeo.translate(0, poleH / 2, 0);
      var poleIM = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.7, metalness: 0.4 }), D.lamps.length);
      poleIM.name = 'city-lamp-poles';
      var headGeo = new THREE.SphereGeometry(0.32 * U, 8, 6); headGeo.translate(0, poleH, 0);
      var headIM = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), D.lamps.length);
      headIM.name = 'city-lamp-heads';
      for (var li = 0; li < D.lamps.length; li++) {
        var lp = D.lamps[li];
        dummy.position.set(lp.x, heightAt(lp.x, lp.z), lp.z);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        poleIM.setMatrixAt(li, dummy.matrix); headIM.setMatrixAt(li, dummy.matrix);
      }
      poleIM.instanceMatrix.needsUpdate = true; headIM.instanceMatrix.needsUpdate = true;
      poleIM.frustumCulled = false; headIM.frustumCulled = false;
      group.add(poleIM); group.add(headIM); meshes += 2;
    }

    if (scene) scene.add(group);
    return {
      group: group,
      stats: { buildings: D.stats.buildings, tiers: D.stats.tiers, lamps: D.stats.lamps, byKind: D.stats.byKind,
        meshes: meshes, drawCalls: meshes, naiveDrawCalls: D.stats.tiers + D.stats.lamps * 2, radiusM: D.stats.radiusM },
      dispose: function () {
        group.traverse(function (m) { if (m.isInstancedMesh) { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); } });
        if (group.parent) group.parent.remove(group);
      }
    };
  }

  /* ================= V2 — 250 m CELLS + PER-TIER INSTANCED SETS (C-5) =================
   * The v1 pattern (one district-wide set, frustumCulled = false) is correct at 700 m and wrong as a
   * template for the whole 1,600 m city: nothing off-frustum ever culls. v2 partitions the FULL plan
   * into 250 m cells (the world-clusters-v4 preset that keeps LOD bands honest). Per cell it builds
   * per-tier instanced sets in two representations:
   *   FULL  — the v1 construction, per cell: box-tier IM, taper-tier IM, lamp-pole IM, lamp-head IM.
   *   PROXY — one box per building (footprint x full height): the silhouette set for the mid band.
   * Every InstancedMesh gets computeBoundingSphere() (radius x SPHERE_MARGIN for edge safety) and
   * frustumCulled = true, so the renderer culls per cell — the structural fix aimed at the 4-5 FPS
   * street-level context (FPS_RESEARCH_2 C-5). Bands (full / proxy / hidden) are reassigned by
   * update(x, z) on the clusters cadence (~6.7x/s from the host) with HYST hysteresis on the band
   * edges, the same anti-pop pattern clusters uses.
   * C-6 PVS-LITE CONSUMES THIS: the returned handle's `cells` array carries, per cell,
   * { key, cx, cz, boundsM, boundsU, centreU, maxTopU, band } — everything a per-cell-pair
   * visibility precompute needs (pair it with the WorldCityHeights raster). planCells() is the
   * pure partition, exported for the same reason. Do not change the cell keying casually.
   * C-6 REGISTRATION (live): buildCells also registers, per cell, the lamp pole/head
   * InstancedMeshes and the cell group itself with window.WorldPVS when world-pvs-lite.js
   * is loaded (guarded, so Node tests and ?pvslite=0 are unaffected). PVS's register()
   * enforces the 15 m low cap — the tier/proxy building meshes are never registered, and
   * PVS never writes fullGroup/proxyGroup.visible, so it composes with the band system.
   */

  function planCells(plan, o) {
    o = o || {};
    var U = o.U || (plan && plan.units_per_m) || 7 / 1.8;
    var cellM = o.cellM || 250;
    var D = planDistrict(plan, { U: U, radiusM: 1e9 });   // full plan, v1 placement math verbatim
    var byKey = {}, cells = [], i;
    function cellFor(eM, nthM) {
      var cx = Math.floor(eM / cellM), cz = Math.floor(nthM / cellM), key = cx + ',' + cz;
      var c = byKey[key];
      if (!c) {
        c = byKey[key] = {
          key: key, cx: cx, cz: cz,
          boundsM: { minX: cx * cellM, minY: cz * cellM, maxX: (cx + 1) * cellM, maxY: (cz + 1) * cellM },
          centreM: { x: (cx + 0.5) * cellM, y: (cz + 0.5) * cellM },
          boxes: [], lamps: [], proxies: [], maxTopM: 0
        };
        cells.push(c);
      }
      return c;
    }
    for (i = 0; i < D.boxes.length; i++) {
      var t = D.boxes[i], c1 = cellFor(t.x / U, -t.z / U);
      c1.boxes.push(t);
      var topM = (t.y0 + t.h) / U;
      if (topM > c1.maxTopM) c1.maxTopM = topM;
    }
    for (i = 0; i < D.lamps.length; i++) {
      var l = D.lamps[i];
      cellFor(l.x / U, -l.z / U).lamps.push(l);
    }
    var B = (plan && plan.buildings) || [];
    for (i = 0; i < B.length; i++) {
      var b = B[i], c2 = cellFor(b.x_m || 0, b.y_m || 0);
      var rho = (b.rot_deg || 0) * Math.PI / 180;
      c2.proxies.push({
        x: (b.x_m || 0) * U, z: -(b.y_m || 0) * U, w: (b.w_m || 0) * U, d: (b.d_m || 0) * U,
        h: (b.h_m || 0) * U, rotY: rho, kind: b.kind || 'tower', accent: b.accent || null, id: b.id
      });
      if ((b.h_m || 0) > c2.maxTopM) c2.maxTopM = b.h_m || 0;
    }
    cells.sort(function (a, b2) { return a.cx - b2.cx || a.cz - b2.cz; });
    return {
      cells: cells, cellM: cellM, U: U,
      stats: { cells: cells.length, buildings: B.length, tiers: D.boxes.length, lamps: D.lamps.length, cellM: cellM }
    };
  }

  function buildCells(o) {
    var THREE = o.THREE, scene = o.scene, U = o.U || (o.plan && o.plan.units_per_m) || 7 / 1.8;
    var heightAt = typeof o.heightAt === 'function' ? o.heightAt : function () { return 0; };
    var cellM = o.cellM || 250;
    var fullM = o.fullM != null ? o.fullM : 550, proxyM = o.proxyM != null ? o.proxyM : 1250;
    var hyst = o.hyst != null ? o.hyst : 0.12, sphereMargin = o.sphereMargin != null ? o.sphereMargin : 1.25;
    var P = planCells(o.plan, { U: U, cellM: cellM });
    var group = new THREE.Group(); group.name = 'grid-city-cells';

    // Shared geometry/material set for every cell (v1 shapes, built once): per-cell cost is only
    // the instance buffers, so the whole city stays cheap to hold while bands stream visibility.
    var boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
    var tapGeo = new THREE.CylinderGeometry(0.424, 0.707, 1, 4); tapGeo.rotateY(Math.PI / 4); tapGeo.translate(0, 0.5, 0);
    var poleH = 5 * U;
    var poleGeo = new THREE.CylinderGeometry(0.09 * U, 0.12 * U, poleH, 5); poleGeo.translate(0, poleH / 2, 0);
    var headGeo = new THREE.SphereGeometry(0.32 * U, 8, 6); headGeo.translate(0, poleH, 0);
    var boxMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 });
    var tapMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.15 });
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.7, metalness: 0.4 });
    var headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
    var proxyMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 });

    var dummy = new THREE.Object3D(), tint = new THREE.Color(), acc = new THREE.Color();
    function colourFor(kind, accent) {
      tint.set(KIND_TINT[kind] || 0x8a93a6);
      if (accent && ACCENT[accent]) { acc.set(ACCENT[accent]); tint.lerp(acc, 0.25); }
      return tint;
    }
    function finishIM(im) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false;
      im.frustumCulled = true;                       // the v2 point: cull per cell, not per district
      if (im.computeBoundingSphere) { im.computeBoundingSphere(); if (im.boundingSphere) im.boundingSphere.radius *= sphereMargin; }
      return im;
    }
    function tierIM(geo, mat, name, tiers, withColour) {
      var im = new THREE.InstancedMesh(geo, mat, tiers.length); im.name = name;
      for (var i = 0; i < tiers.length; i++) {
        var t = tiers[i];
        dummy.position.set(t.x, heightAt(t.x, t.z) + (t.y0 || 0), t.z);
        dummy.rotation.set(0, t.rotY || 0, 0);
        dummy.scale.set(t.w, t.h, t.d);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (withColour) im.setColorAt(i, colourFor(t.kind, t.accent));
      }
      return finishIM(im);
    }

    var cells = [], meshesTotal = 0;
    for (var ci = 0; ci < P.cells.length; ci++) {
      var pc = P.cells[ci];
      var cg = new THREE.Group(); cg.name = 'grid-city-cell-' + pc.key;
      var fullG = new THREE.Group(); fullG.name = 'cell-full';
      var proxyG = new THREE.Group(); proxyG.name = 'cell-proxy';
      var boxT = pc.boxes.filter(function (t) { return t.type !== 1 && t.type !== 4; });
      var tapT = pc.boxes.filter(function (t) { return t.type === 1 || t.type === 4; });
      var nFull = 0;
      if (boxT.length) { fullG.add(tierIM(boxGeo, boxMat, 'city-tiers-box', boxT, true)); nFull++; }
      if (tapT.length) { fullG.add(tierIM(tapGeo, tapMat, 'city-tiers-taper', tapT, true)); nFull++; }
      if (pc.lamps.length) {
        var poleIM = new THREE.InstancedMesh(poleGeo, poleMat, pc.lamps.length); poleIM.name = 'city-lamp-poles';
        var headIM = new THREE.InstancedMesh(headGeo, headMat, pc.lamps.length); headIM.name = 'city-lamp-heads';
        for (var li = 0; li < pc.lamps.length; li++) {
          var lp = pc.lamps[li];
          dummy.position.set(lp.x, heightAt(lp.x, lp.z), lp.z);
          dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          poleIM.setMatrixAt(li, dummy.matrix); headIM.setMatrixAt(li, dummy.matrix);
        }
        fullG.add(finishIM(poleIM)); fullG.add(finishIM(headIM)); nFull += 2;
        if (root && root.WorldPVS) { root.WorldPVS.register(poleIM, { low: true, THREE: THREE }); root.WorldPVS.register(headIM, { low: true, THREE: THREE }); }   // C-6 PVS-lite: lamps are this cell's LOW dressing
      }
      var nProxy = 0;
      if (pc.proxies.length) { proxyG.add(tierIM(boxGeo, proxyMat, 'city-proxy', pc.proxies, true)); nProxy = 1; }
      cg.add(fullG); cg.add(proxyG); group.add(cg);
      if (root && root.WorldPVS) root.WorldPVS.register(cg, { low: true, THREE: THREE });   // C-6 PVS-lite: register() itself keeps only genuinely low cells (15 m cap) — tall cells stay exempt forever
      meshesTotal += nFull + nProxy;
      cells.push({
        key: pc.key, cx: pc.cx, cz: pc.cz, boundsM: pc.boundsM,
        boundsU: { minX: pc.boundsM.minX * U, maxX: pc.boundsM.maxX * U, minZ: -pc.boundsM.maxY * U, maxZ: -pc.boundsM.minY * U },
        centreU: { x: pc.centreM.x * U, z: -pc.centreM.y * U },
        maxTopU: pc.maxTopM * U, maxTopM: pc.maxTopM,
        tiers: pc.boxes.length, lamps: pc.lamps.length, buildings: pc.proxies.length,
        meshesFull: nFull, meshesProxy: nProxy, band: 0, fullGroup: fullG, proxyGroup: proxyG
      });
    }

    var stats = { cells: cells.length, buildings: P.stats.buildings, tiers: P.stats.tiers, lamps: P.stats.lamps,
      meshes: meshesTotal, drawCallsMax: meshesTotal, naiveDrawCalls: P.stats.tiers + P.stats.lamps * 2,
      cellM: cellM, fullM: fullM, proxyM: proxyM, bands: { full: 0, proxy: 0, hidden: 0 }, visibleDrawCalls: 0 };

    function setBand(c, b) {
      c.band = b;
      c.fullGroup.visible = (b === 2);
      c.proxyGroup.visible = (b === 1);
    }
    function recount() {
      var f = 0, p = 0, h = 0, dc = 0;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (c.band === 2) { f++; dc += c.meshesFull; } else if (c.band === 1) { p++; dc += c.meshesProxy; } else h++;
      }
      stats.bands = { full: f, proxy: p, hidden: h }; stats.visibleDrawCalls = dc;
    }
    // Band reassignment with hysteresis (clusters pattern): a cell keeps its band unless the
    // camera is clearly past the band edge — (1 - hyst) to promote, (1 + hyst) to demote.
    function update(x, z) {
      var changed = 0;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var dM = Math.hypot(x - c.centreU.x, z - c.centreU.z) / U, want;
        if (c.band === 2) want = dM <= fullM * (1 + hyst) ? 2 : (dM <= proxyM * (1 + hyst) ? 1 : 0);
        else if (c.band === 1) want = dM <= fullM * (1 - hyst) ? 2 : (dM <= proxyM * (1 + hyst) ? 1 : 0);
        else want = dM <= fullM * (1 - hyst) ? 2 : (dM <= proxyM * (1 - hyst) ? 1 : 0);
        if (want !== c.band) { setBand(c, want); changed++; }
      }
      if (changed) recount();
      return changed;
    }
    for (var i2 = 0; i2 < cells.length; i2++) setBand(cells[i2], 0);
    update(0, 0); recount();   // spawn state: origin cells start full, as v1's district did

    if (scene) scene.add(group);
    return {
      group: group, cells: cells, stats: stats, update: update,
      visibleDrawCalls: function () { return stats.visibleDrawCalls; },
      dispose: function () {
        var seen = [], mats = [];
        group.traverse(function (m) { if (m.isInstancedMesh) { if (seen.indexOf(m.geometry) < 0) seen.push(m.geometry); if (mats.indexOf(m.material) < 0) mats.push(m.material); if (m.dispose) m.dispose(); } });
        seen.forEach(function (g) { g.dispose(); }); mats.forEach(function (m2) { m2.dispose(); });
        if (group.parent) group.parent.remove(group);
      }
    };
  }

  var api = { planDistrict: planDistrict, build: build, planCells: planCells, buildCells: buildCells };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldCityBuilder = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
