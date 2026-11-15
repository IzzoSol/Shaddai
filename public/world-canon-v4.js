/* world-canon-v4.js — the CANON city from Blender, in the game (Map v4, ?map=v4), 2026-09-26.
 *
 * tools/blender/canon/build_canon.py builds the owner's canonical layout (atlas image 37 → world-layout.json) and
 * exports it: public/assets/world/canon-v4.glb (Grid streets + blocks, SHADDAI monument + Central Station, Agora,
 * agent pads, Meadowfields Halt boulevard + civic halls + amphitheater, Quill Forest) in METRES, glTF +Y up with
 * z = -Y — exactly the game's axes, so the whole scene just scales by U. Heights were baked from the same
 * height16.bin the game terrain uses, so every block already sits ON the ground.
 * Colliders (public/assets/world/canon-colliders-v4.json, game units): 1686 rotated boxes + circles → pushed into
 * WORLD_LAYOUT.realmColliders (world-collision.js handles rotated boxes) → solid buildings, no walking through.
 * Walkable tops are published on window.WORLD_WALKABLE_TOPS for the player controller (stand on roofs/decks).
 *
 *   window.buildWorldCanonV4({ THREE, scene, loader }) → Promise<{ group, stats() }>
 */
(function () {
  var U = 7 / 1.8;
  window.buildWorldCanonV4 = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader;
    var st = { meshes: 0, obb: 0, circle: 0 };
    var glb = new Promise(function (res, rej) { loader.load('/assets/world/canon-v4.glb?v=7', res, undefined, rej); });
    var col = fetch('/assets/world/canon-colliders-v4.json?v=7').then(function (r) { return r.json(); });
    var zonesP = fetch('/assets/world/city-zones-v1.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });   // owner drawing: city-building loops
    return Promise.all([glb, col, zonesP]).then(function (both) {
      var g = both[0], C = both[1], Z = both[2];
      var root = g.scene; root.name = 'world-canon-v4'; root.scale.setScalar(U);   // metres → units (axes already match)
      root.traverse(function (o) {
        if (!o.isMesh) return;
        st.meshes++; o.castShadow = true; o.receiveShadow = true; o.matrixAutoUpdate = false;
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) { if (m && m.emissive && m.emissiveIntensity > 0) m.toneMapped = true; });
      });
      root.updateMatrixWorld(true);
      // EMBERFALL CLEAN-UP (owner 2026-10-23: "get rid of the random grey buildings that dont align"): the terrace ring of stacked grey towers and
      // the loose lava-bridge slabs are hidden (meshes + their colliders); the realm-heart town (realm-towns-v2.json) now fills the terrace.
      // ?embertowers=1 brings them back.
      var EMB_HIDE = !(typeof location !== 'undefined' && /[?&]embertowers=1/.test(location.search));
      if (EMB_HIDE) { root.traverse(function (o) { if (/^EMB_(Terrace_Towers|Road_Lava_Bridges)/.test(o.name || '')) { o.visible = false; st.embHidden = (st.embHidden || 0) + 1; } });
        C.obb = C.obb.filter(function (b) { return b.kind !== 'ember-tower' && b.kind !== 'ember-bridge'; }); C.circle = C.circle.filter(function (b) { return b.kind !== 'ember-tower' && b.kind !== 'ember-bridge'; }); }
      // HOVERSKATE PARK KEEP-OUT (2026-10-16, found in the Blender world): CULTURE_LANE kiosk tops (up to 19 m) stand at the park rim (r 165-178 m around
      // the PLAZA_SKATE marker) and poke over the deck edge - drop its triangles inside r 178 m. ?parkclear=0 = untouched.
      if (!(typeof location !== 'undefined' && /[?&]parkclear=0/.test(location.search))) root.traverse(function (o) {
        if (!o.isMesh || !/^CULTURE_LANE/.test(o.name) || !o.geometry.attributes.position) return;
        var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = g.attributes.position, v = new THREE.Vector3(), keep = [], n = p.count;
        for (var i = 0; i < n; i += 3) { var cx = 0, cz = 0; for (var k = 0; k < 3; k++) { v.fromBufferAttribute(p, i + k).applyMatrix4(o.matrixWorld); cx += v.x; cz += v.z; }
          cx /= 3 * U; cz /= -3 * U; if (Math.hypot(cx + 880, cz - 0) >= 178) keep.push(i); }
        if (keep.length * 3 === n) return;
        var out = new THREE.BufferGeometry(); Object.keys(g.attributes).forEach(function (name) { var src = g.attributes[name], sz = src.itemSize, arr = new src.array.constructor(keep.length * 3 * sz);
          keep.forEach(function (i, t) { for (var k = 0; k < 3 * sz; k++) arr[t * 3 * sz + k] = src.array[i * sz + k]; }); out.setAttribute(name, new THREE.BufferAttribute(arr, sz, src.normalized)); });
        o.geometry = out; st.parkCut = (st.parkCut || 0) + (n / 3 - keep.length);
      });
      // DESIGNED CITY (owner 2026-10-16, ref image 66): the dense merged meshes give way to the district layout (grid-fabric-districts-v1.json via
      // world-clusters-v4 + world-city-layout.js roads/plots). Old note: CONSOLIDATED CITY (refs image 66 / 72 / 31: low density, bigger buildings, open streets; built in Blender 36_PREVIEW_LOWDENSITY):
      // the three dense merged meshes (ACADEMY_HALL strips 396k tris, CULTURE_LANE kiosks 106k, BLD_Grid_CardinalWedges blocks 90k) are replaced by
      // canon-consolidated-v1.glb = 120 academy blocks (>= 90 m apart, 1.3x) + 240 culture-lane buildings (>= 45 m apart, 1.6x). The wedge strips'
      // filler colliders go with them. Landmarks, halls, plazas, streets, Forge, monument: untouched. ?cityspread=0 = the old dense city.
      var spread = !(typeof location !== 'undefined' && /[?&]cityspread=0/.test(location.search)), consolidated = null;
      var isFiller = function (k) { return k === 'grid-block' || k === 'suburb-block' || /^(commons|ne-campus|nw-race)-/.test(k); };
      if (spread) {
        // OWNER DRAWING (city-zones-v1.json): the basic city blocks come back INSIDE the 4 drawn loops only (triangles + colliders clipped to them)
        // MISSING-BUILDINGS fix (2026-11-11): the shipped city-zones-v1.json has buildingZones: []
        // so the spread clip below hid the whole dense city (ACADEMY_HALL / CULTURE_LANE /
        // BLD_Grid_CardinalWedges) with no replacement. The owner's 4 drawn loops ARE in the
        // same file under buildingZones_drawn — use them when buildingZones is empty.
        var loops = (Z && Z.buildingZones && Z.buildingZones.length ? Z.buildingZones : (Z && Z.buildingZones_drawn)) || [], inPoly = function (x, y, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
        var inZone = function (xm, ym) { for (var k = 0; k < loops.length; k++) if (inPoly(xm, ym, loops[k])) return true; return false; };
        root.traverse(function (o) {
          if (!o.isMesh || !/^(ACADEMY_HALL|CULTURE_LANE|BLD_Grid_CardinalWedges)/.test(o.name || '')) return;
          if (!loops.length) { o.visible = false; return; }
          var g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = g0.attributes.position, v = new THREE.Vector3(), keep = [], n = p.count;
          for (var i = 0; i < n; i += 3) { var cx = 0, cz = 0; for (var k = 0; k < 3; k++) { v.fromBufferAttribute(p, i + k).applyMatrix4(o.matrixWorld); cx += v.x; cz += v.z; } if (inZone(cx / 3 / U, -cz / 3 / U)) keep.push(i); }
          var out = new THREE.BufferGeometry(); Object.keys(g0.attributes).forEach(function (name) { var src = g0.attributes[name], sz = src.itemSize, arr = new src.array.constructor(keep.length * 3 * sz);
            keep.forEach(function (i, t) { for (var k = 0; k < 3 * sz; k++) arr[t * 3 * sz + k] = src.array[i * sz + k]; }); out.setAttribute(name, new THREE.BufferAttribute(arr, sz, src.normalized)); });
          out.computeBoundingSphere(); o.geometry = out; st.zoneKept = (st.zoneKept || 0) + keep.length;
        });
        var before = C.obb.length; C.obb = C.obb.filter(function (b) { return !isFiller(b.kind) || inZone(b.x / U, -b.z / U); }); st.fillerColliders = before - C.obb.length;
        if (false) consolidated = new Promise(function (res) { loader.load('/assets/world/canon-consolidated-v1.glb?v=1', function (g) { g.scene.name = 'canon-consolidated'; g.scene.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.matrixAutoUpdate = false; o.updateMatrix(); } }); root.add(g.scene); root.updateMatrixWorld(true); res(true); }, undefined, function (e) { console.warn('[canon-v4] consolidated city missing:', e && e.message); res(false); }); });
      }
      scene.add(root);
      var L = window.WORLD_LAYOUT, tops = window.WORLD_WALKABLE_TOPS = window.WORLD_WALKABLE_TOPS || [];
      if (L && L.realmColliders) {
        C.obb.forEach(function (b) {
          if (b.walkableTop) { tops.push({ type: 'obb', x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot, top: b.top, kind: b.kind, deck: true }); return; }   // bridge decks / overlook: stand ON them, walk UNDER them
          L.realmColliders.push({ x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot, label: 'canon:' + b.kind }); st.obb++;
          tops.push({ type: 'obb', x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot, top: b.top, kind: b.kind });
        });
        C.circle.forEach(function (c) {
          if (c.walkableTop) { tops.push({ type: 'circle', x: c.x, z: c.z, r: c.r, top: c.top, kind: c.kind }); return; }   // decks: stand on, not a wall
          L.realmColliders.push({ x: c.x, z: c.z, r: c.r, label: 'canon:' + c.kind }); st.circle++;
          tops.push({ type: 'circle', x: c.x, z: c.z, r: c.r, top: c.top, kind: c.kind });
        });
        if (window.buildWorldCollision) window.buildWorldCollision(L);   // re-register with the new solids
      }
      console.info('[canon-v4] ' + st.meshes + ' meshes · ' + st.obb + ' box + ' + st.circle + ' round colliders · ' + tops.length + ' walkable tops');
      return { group: root, stats: function () { return st; } };
    });
  };
})();
