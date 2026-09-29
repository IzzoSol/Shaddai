/* world-realm-homes.js — realm home kits built from the owner's refs (fal-assets/refs/world/*), all CODE ($0), instanced, lazy.
 *
 *   var rh = window.buildWorldRealmHomes({ THREE, scene, heightAt, interiors?: iv3 api, layout?: WORLD_LAYOUT, cullM?: 650 })
 *     rh.types                       -> { 'earth-burrow', 'cave-home', 'leaf-tree-home', 'pod-home', 'arctic-dome' } (label, size, sink, style)
 *     rh.place(type, x, z, { yaw?, ownerId?, id?, faceDownhill? })  -> home { id, type, x, y, z, yaw, rest }   (grounded; half-buried types sink into the slope)
 *     rh.village(type, cx, cz, n, { radius, seed })                  -> n homes on a spiral with a winding path (terraced on slopes)
 *     rh.update(px, pz)                                              -> call ~2 Hz: fills the instance buffers with homes within cullM (constant draw calls)
 *     rh.homes                                                       -> all placed homes
 *   Refs: earth-burrow = meadow-hillside-earth-homes (green-roof half-buried domes, curved wood + glass fronts, round skylights);
 *         cave-home = meadow-cliff-cave-homes (carved into a rock overhang, arched wooden doors, grass terrace, pool);
 *         leaf-tree-home = forest-treehouse-sketches (white tower, layered leaf canopies, glowing blue ribbed band, spire + orb);
 *         pod-home = forest-pod-village (egg pod, silver roof, glass front, wood deck + stairs); arctic-dome = arctic-white-dome-village.
 * Performance: one InstancedMesh per (type, material) — a handful of draw calls no matter how many homes exist.
 * Interiors: recipes + styles are registered into world-interiors-v3 (buildWorldInteriorsV3.pure) so every home is enterable; bed = respawn
 *   rest point (WorldSurvival), plus stash, wardrobe, mail, ARCADE cabinets (vs agents or people), trade counter, workbench, hydration, comms.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, CAP = 48;
  var COL = { grass: 0x5f9a3f, grassDk: 0x3f7a30, wood: 0xb58a55, woodDk: 0x7a5530, stone: 0x8c9088, rock: 0x8d8778, glass: 0xffdca0, water: 0x3fc6d8, white: 0xeef2f4,
    leaf: 0x86c44a, leafDk: 0x5f9a35, blue: 0x49b8ff, silver: 0xc9d2d8, dark: 0x2a2f36, ice: 0xdff3fb, cyan: 0x66f0ff, orb: 0xc770ff, gold: 0xe8c45c };

  function defineInteriorStyles(pure) {
    if (!pure || pure.__realmHomes) return; pure.__realmHomes = true;
    var S = pure.STYLE_DEF;
    S.earth = { wall: 0x8a6a45, floor: 0x6e5636, ceil: 0x6a8a4a, seam: 0xffc477, glassWalls: false };    // timber + turf, warm seam light
    S.cave = { wall: 0x8d8778, floor: 0x6f6a5c, ceil: 0x777063, seam: 0xffb060, glassWalls: false };     // carved rock, lantern glow
    S.leaf = { wall: 0xe8efe6, floor: 0xc9d8c2, ceil: 0x9cc27a, seam: 0x49b8ff, glassWalls: false };     // white lacquer, leaf ceiling, blue ribbing
    S.pod = { wall: 0xd7dde2, floor: 0x9a7a52, ceil: 0xc9d2d8, seam: 0x7dffd8, glassWalls: false };      // pale shell, wood floor
    S.ice = { wall: 0xdff3fb, floor: 0xb9d9e6, ceil: 0xeaf8ff, seam: 0x66f0ff, glassWalls: false };      // frosted white, cyan seam
    var F = pure.FALLBACK; F.stool = F.stool || { fp: [0.5, 0.5], h: 0.45, color: 0x6b5033 }; F.bench = F.bench || { fp: [1.8, 0.5], h: 0.45, color: 0x6b5033 }; F.chair = F.chair || { fp: [0.6, 0.6], h: 0.9, color: 0x6b5033 };   // seats (WorldSit reads them)
    var R = pure.RECIPES, first = function (c, kind, xs, z, q, o) { for (var i = 0; i < xs.length; i++) { var it = c.place(kind, xs[i], z, q, o); if (it) return it; } return null; };
    function homeRecipe(extra) {     // one themed home: sleep/respawn, stash, wardrobe, mail, arcade x2, trade counter, craft, cook, comms
      return function (c) {
        var i = c.inner, cx = (i.x0 + i.x1) / 2;
        first(c, 'bed-pod', [i.x0 + 1.3, i.x0 + 1.9, cx], i.z0 + c.depth('bed-pod', 0) + 0.02, 0, { use: 'respawn' });
        c.atBack('stash', i.x1 - 0.7, { use: 'stash' }); c.atBack('hydro-station', i.x1 - 2.4, { use: 'cook' });
        c.atLeft('wardrobe', i.z0 + 2.8, { use: 'wardrobe' }) || c.atLeft('wardrobe', 0.6, { use: 'wardrobe' });
        c.atRight('mail-terminal', i.z0 + 2.4, { use: 'mail' }) || c.atRight('mail-terminal', 0, { use: 'mail' });
        c.atRight('arcade-cabinet', 0.6, { use: 'arcade', tag: 'blackjack' }, 0.02) || c.atRight('arcade-cabinet', -0.8, { use: 'arcade', tag: 'skate' });
        c.atRight('arcade-cabinet', 1.9, { use: 'arcade', tag: 'reflex' }, 0.02);
        c.atLeft('workbench', 0.6, { use: 'craft', npc: 'crafter' }, 1.25) || c.atLeft('workbench', -1.2, { use: 'craft' });
        first(c, 'stall', [-2.4, 2.4, 0], i.z1 - 1.4, 2, { use: 'trade', npc: 'trader' });
        c.atLeft('comms-console', i.z1 - 2.2, { use: 'comms' }) || c.atRight('comms-console', i.z1 - 2.2, { use: 'comms' });
        first(c, 'sofa', [-2.4, 2.4, 0], 0.8, 0, {}); first(c, 'stool', [-1.3, 1.3, 0.4], -0.7, 0, {}); first(c, 'bench', [i.x1 - 1.4, i.x0 + 1.4], i.z1 - 0.5, 0, {}); c.place('rug', 0, 0.2, 0); c.place('planter', i.x0 + 0.5, i.z1 - 0.5, 0);
        if (extra) extra(c, i); c.light(0, 0); c.light(cx - 3, -1); c.light(cx + 3, -1);
      };
    }
    R['earth-burrow'] = { label: 'Earth burrow: half-buried turf home — sleep/respawn, stash, arcade, trade, craft', style: 'earth', ceil: 3.4, size: [12, 8, 4], build: homeRecipe() };
    R['cave-home'] = { label: 'Cave home: carved rock rooms — sleep/respawn, stash, arcade, trade, craft', style: 'cave', ceil: 3.6, size: [16, 8, 4.6], build: homeRecipe(function (c, i) { c.partZ(i.z0 + 3.4, i.x0, i.x0 + (i.x1 - i.x0) * 0.42, [{ x: i.x0 + 2.5, w: 1.6 }]); }) };
    R['leaf-tree-home'] = { label: 'Leaf tree home: white tower rooms — sleep/respawn, stash, arcade, trade, craft', style: 'leaf', ceil: 3.6, size: [10, 10, 9], build: homeRecipe() };
    R['pod-home'] = { label: 'Pod home: egg pod on a deck — sleep/respawn, stash, arcade, trade, craft', style: 'pod', ceil: 3.2, size: [10, 6.5, 3.6], build: homeRecipe() };
    R['arctic-dome'] = { label: 'Arctic dome: frosted dome home — sleep/respawn, stash, arcade, trade, craft', style: 'ice', ceil: 3.6, size: [11, 9, 4.2], build: homeRecipe() };
  }

  /* ───────────────────────── geometry kits (metres, +z = front/door, y up, y=0 is the ground) ───────────────────────── */
  function build(opts) {
    var THREE = opts.THREE, scene = opts.scene, heightAt = opts.heightAt || function () { return 0; }, cullM = opts.cullM || 650;
    var iv3 = opts.interiors || null, layout = opts.layout || root.WORLD_LAYOUT || null;
    if (root.buildWorldInteriorsV3 && root.buildWorldInteriorsV3.pure) defineInteriorStyles(root.buildWorldInteriorsV3.pure);
    var M = {};   // shared materials (Lambert = cheap on integrated GPUs)
    function mat(name, color, o) { return M[name] || (M[name] = new THREE.MeshLambertMaterial(Object.assign({ color: color, name: 'rh-' + name }, o || {}))); }
    var mats = {
      grass: mat('grass', COL.grass), grassDk: mat('grassDk', COL.grassDk), wood: mat('wood', COL.wood), woodDk: mat('woodDk', COL.woodDk), stone: mat('stone', COL.stone), rock: mat('rock', COL.rock),
      glass: mat('glass', 0x27384a, { emissive: 0xff9c4a, emissiveIntensity: 0.32, transparent: true, opacity: 0.92 }),
      water: mat('water', COL.water, { emissive: COL.water, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }),
      white: mat('white', COL.white), leaf: mat('leaf', COL.leaf, { side: THREE.DoubleSide }), leafDk: mat('leafDk', COL.leafDk, { side: THREE.DoubleSide }),
      blue: mat('blue', 0x0a2a44, { emissive: COL.blue, emissiveIntensity: 1.3 }), silver: mat('silver', COL.silver), dark: mat('dark', COL.dark),
      ice: mat('ice', COL.ice), cyan: mat('cyan', 0x0a3a44, { emissive: COL.cyan, emissiveIntensity: 1.4 }), orb: mat('orb', 0x2a0a44, { emissive: COL.orb, emissiveIntensity: 1.6 }), gold: mat('gold', COL.gold, { emissive: COL.gold, emissiveIntensity: 0.25 })
    };
    var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
    function part(list, matName, geo, x, y, z, rx, ry, rz, sx, sy, sz) {
      _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x || 0, y || 0, z || 0); _s.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
      list.push({ mat: matName, geo: geo, m: new THREE.Matrix4().compose(_p, _q, _s) });
    }
    function mergeBy(list) {   // -> { matName: BufferGeometry } (one merged geometry per material, non-indexed)
      var out = {}, by = {};
      list.forEach(function (it) { (by[it.mat] = by[it.mat] || []).push(it); });
      Object.keys(by).forEach(function (k) {
        var pos = [], nor = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
        by[k].forEach(function (it) {
          var g = it.geo.index ? it.geo.toNonIndexed() : it.geo, pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(it.m);
          for (var i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(it.m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); }
        });
        var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out[k] = bg;
      });
      return out;
    }
    function arch(w, h, depth) {   // arched opening shape (rect + semicircle top), extruded
      var s = new THREE.Shape(), r = w / 2; s.moveTo(-r, 0); s.lineTo(-r, h - r); s.absarc(0, h - r, r, Math.PI, 0, true); s.lineTo(r, 0); s.lineTo(-r, 0);
      return new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false });
    }
    function semi(r) { return new THREE.CircleGeometry(r, 20, 0, Math.PI); }
    var box = function (w, h, d) { return new THREE.BoxGeometry(w, h, d); };
    var cyl = function (rt, rb, h, seg, open, ts, tl) { return new THREE.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open, ts || 0, tl == null ? Math.PI * 2 : tl); };

    var KITS = {};
    // 1) EARTH BURROW — extruded half-ellipse loaf (turf roof), flat wood-slat front with glass arches, skylights, stepping stones
    KITS['earth-burrow'] = { label: 'Earth burrow', size: [14, 10, 4.2], sink: 0.35, style: 'earth', faceDownhill: true, build: function (L) {
      var sh = new THREE.Shape(); sh.absellipse(0, 0, 7.0, 3.7, 0, Math.PI, false); sh.lineTo(-7, 0);
      var loaf = new THREE.ExtrudeGeometry(sh, { depth: 8.6, bevelEnabled: false, curveSegments: 20 }); loaf.translate(0, 0, -4.6);      // z -4.6 .. +4.0
      part(L, 'grass', loaf, 0, 0, 0);
      part(L, 'wood', new THREE.ShapeGeometry(sh, 20), 0, 0, 4.02);                                                                    // wood-slat front face
      [[0, 2.5], [-4.3, 1.55], [4.3, 1.55]].forEach(function (a) {                                                                      // glass arches with timber frames
        part(L, 'woodDk', arch(a[1] * 2 + 0.3, a[1] + 0.9 - 0.0, 0.25), a[0], 0, 4.02);
        part(L, 'glass', arch(a[1] * 2, a[1] + 0.75, 0.3), a[0], 0.02, 4.06);
      });
      [[0, 2.5], [-4.3, 1.55], [4.3, 1.55]].forEach(function (a) { for (var m = -1; m <= 1; m++) part(L, 'woodDk', box(0.09, a[1] + 0.7, 0.1), a[0] + m * a[1] * 0.62, (a[1] + 0.7) / 2, 4.38); part(L, 'woodDk', box(a[1] * 2, 0.09, 0.1), a[0], a[1] * 0.75, 4.38); });   // timber mullions
      part(L, 'woodDk', box(1.1, 2.0, 0.34), 0, 1.0, 4.14);                                                                             // door
      part(L, 'gold', box(0.1, 0.1, 0.08), 0.35, 1.0, 4.34);
      [[-2.4, 1.0], [2.6, -1.2], [0, -2.6]].forEach(function (s) { part(L, 'glass', cyl(0.9, 0.9, 0.08, 20), s[0], 3.42 * Math.sqrt(Math.max(0, 1 - s[0] * s[0] / 49)) - 0.02, s[1]); });   // round skylights
      for (var i = 0; i < 6; i++) part(L, 'stone', cyl(0.62, 0.7, 0.14, 8), Math.sin(i * 1.3) * 0.9, 0.07, 5.0 + i * 1.05);            // stepping-stone path
      part(L, 'grassDk', cyl(0.5, 0.7, 1.6, 6), -6.2, 0.7, 2.0); part(L, 'grassDk', cyl(0.4, 0.6, 1.3, 6), 6.4, 0.6, -1.5);           // shrubs
    } };
    // 2) CAVE HOME — rock overhang over a carved cliff face: 3 arched wooden doors, grass terrace, pool, steps
    KITS['cave-home'] = { label: 'Cave home', size: [18, 12, 6.4], sink: 0.4, style: 'cave', faceDownhill: true, build: function (L) {
      var g = new THREE.IcosahedronGeometry(1, 2), pa = g.attributes.position, v = new THREE.Vector3();
      for (var i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); var n = Math.sin(v.x * 4.1) * Math.cos(v.z * 3.3) * 0.12 + Math.sin(v.y * 5.3 + v.x * 2.0) * 0.08; v.multiplyScalar(1 + n); pa.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals();
      part(L, 'rock', g, 0, 5.6, -1.0, 0, 0, 0, 10.5, 3.2, 5.4);                                                                        // overhang
      part(L, 'rock', box(20, 5.4, 4.0), 0, 2.7, -3.6);                                                                                 // cliff body
      part(L, 'grass', box(19, 0.5, 2.6), 0, 5.5, 0.4, 0, 0, 0);                                                                        // mossy lip under the overhang
      part(L, 'stone', box(15, 0.5, 4.0), 0, 0.25, 1.9); part(L, 'grass', box(15, 0.14, 3.6), 0, 0.54, 1.9);                            // grass terrace
      [-5.6, 0, 5.6].forEach(function (x, k) {
        part(L, 'woodDk', arch(k === 1 ? 2.6 : 2.0, k === 1 ? 3.4 : 2.9, 0.3), x, 0.5, -1.55);
        part(L, 'glass', arch(k === 1 ? 2.1 : 1.6, k === 1 ? 2.9 : 2.45, 0.32), x, 0.52, -1.58);
      });
      part(L, 'water', cyl(2.6, 2.6, 0.12, 24), 6.2, 0.62, 3.6, 0, 0, 0, 1.0, 1, 0.7); part(L, 'stone', cyl(2.9, 2.9, 0.34, 24), 6.2, 0.4, 3.6, 0, 0, 0, 1.0, 1, 0.7);
      for (var s = 0; s < 4; s++) part(L, 'stone', box(3.2 - s * 0.3, 0.16, 0.9), -1.5, 0.08 + s * 0.02, 4.6 + s * 0.85);
      part(L, 'grassDk', new THREE.IcosahedronGeometry(1, 1), -8.4, 1.0, 3.6, 0, 0, 0, 1.3, 1.0, 1.2); part(L, 'grassDk', new THREE.IcosahedronGeometry(1, 1), 8.6, 5.9, 0.2, 0, 0, 0, 1.6, 1.0, 1.4);
    } };
    // 3) LEAF TREE HOME — white tower, three swept leaf canopies, glowing blue ribbed band, spire + orb, root buttresses
    KITS['leaf-tree-home'] = { label: 'Leaf tree home', size: [14, 14, 13], sink: 0, style: 'leaf', build: function (L) {
      part(L, 'stone', cyl(6.4, 7.0, 0.6, 24), 0, 0.3, 0);
      part(L, 'white', cyl(2.5, 2.9, 7.2, 20), 0, 4.2, 0);
      [[7.4, 3.5], [5.6, 6.1], [3.7, 8.7]].forEach(function (t, k) {                                                                 // leaf canopy tiers: swept discs with lifted rims
        var pr = []; for (var q = 8; q >= 0; q--) { var u = q / 8; pr.push(new THREE.Vector2(t[0] * u, 0.15 + Math.pow(u, 3) * 1.3 - u * 0.25)); }
        part(L, k % 2 ? 'leafDk' : 'leaf', new THREE.LatheGeometry(pr, 22), 0, t[1], 0, 0, k * 0.7, 0);
        part(L, 'white', cyl(t[0] * 0.3, t[0] * 0.3, 0.22, 16), 0, t[1] + 0.1, 0);
      });
      for (var i = 0; i < 24; i++) { var a = i / 24 * Math.PI * 2; part(L, 'blue', box(0.34, 0.75, 0.14), Math.sin(a) * 6.9, 3.3, Math.cos(a) * 6.9, 0, a, 0); }   // glowing ribbed band
      part(L, 'dark', cyl(0.12, 0.2, 5.2, 8), 0, 10.6, 0); part(L, 'orb', new THREE.SphereGeometry(0.55, 12, 10), 0, 13.4, 0); part(L, 'gold', new THREE.TorusGeometry(0.85, 0.06, 6, 20), 0, 13.4, 0);
      part(L, 'glass', arch(1.8, 2.8, 0.3), 0, 0.6, 2.75);
      for (var b = 0; b < 3; b++) { var ba = b * 2.1 + 0.6; part(L, 'woodDk', box(0.7, 3.4, 1.4), Math.sin(ba) * 3.4, 1.4, Math.cos(ba) * 3.4, 0.5, ba, 0); }   // root buttresses
    } };
    // 4) POD HOME — egg pod on a wooden deck: silver roof shell, glass front, deck + stairs + legs
    KITS['pod-home'] = { label: 'Pod home', size: [13, 9, 5.4], sink: 0, style: 'pod', build: function (L) {
      part(L, 'wood', box(12.4, 0.36, 8.2), 0, 0.95, 0.2);
      [[-5.6, -3.4], [5.6, -3.4], [-5.6, 3.6], [5.6, 3.6]].forEach(function (p) { part(L, 'woodDk', cyl(0.22, 0.28, 1.0, 8), p[0], 0.5, p[1]); });
      var egg = new THREE.SphereGeometry(1, 28, 16);
      part(L, 'wood', egg, 0, 2.7, -0.4, 0, 0, 0, 5.4, 2.4, 3.5);
      part(L, 'silver', new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), 0, 2.7, -0.4, 0, 0, 0, 5.46, 2.46, 3.55);
      part(L, 'glass', new THREE.SphereGeometry(1, 20, 12, Math.PI / 2 - 0.7, 1.4, 0.85, 1.15), 0, 2.7, -0.4, 0, 0, 0, 5.5, 2.5, 3.56);
      for (var i = 0; i < 4; i++) part(L, 'wood', box(3.4, 0.16, 0.6), 0, 0.2 + i * 0.22, 4.9 - i * 0.55);
      part(L, 'woodDk', box(12.4, 0.5, 0.1), 0, 1.4, 4.3); part(L, 'gold', box(0.9, 0.14, 0.06), 0, 3.6, 3.2);
    } };
    // 5) ARCTIC DOME — frosted white dome, glowing cyan band, entrance tunnel, ice ring base
    KITS['arctic-dome'] = { label: 'Arctic dome', size: [14, 14, 6.6], sink: 0.3, style: 'ice', build: function (L) {
      part(L, 'ice', new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0, 0, 0, 6.4, 5.6, 6.4);
      part(L, 'cyan', new THREE.TorusGeometry(6.35, 0.16, 6, 36), 0, 1.05, 0, Math.PI / 2, 0, 0); part(L, 'cyan', new THREE.TorusGeometry(4.9, 0.12, 6, 36), 0, 3.6, 0, Math.PI / 2, 0, 0);
      part(L, 'ice', cyl(2.0, 2.0, 4.0, 16, true, 0, Math.PI), 0, 0, 6.2, Math.PI / 2, Math.PI / 2, 0); part(L, 'glass', arch(2.4, 2.6, 0.3), 0, 0, 8.05);
      part(L, 'stone', cyl(7.2, 7.4, 0.3, 32), 0, 0.1, 0);
      for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2 + 0.4; part(L, 'ice', new THREE.ConeGeometry(0.5, 2.0 + (i % 3) * 0.6, 6), Math.sin(a) * 8.4, 1.0, Math.cos(a) * 8.4); }   // ice spikes
    } };

    /* ── instance pools: one InstancedMesh per (type, material) ── */
    var types = {}, homes = [], byId = {}, group = new THREE.Group(); group.name = 'realm-homes'; scene.add(group);
    Object.keys(KITS).forEach(function (k) {
      var list = [], K = KITS[k]; K.build(list); var merged = mergeBy(list), meshes = [];
      Object.keys(merged).forEach(function (mn) { var im = new THREE.InstancedMesh(merged[mn], mats[mn], CAP); im.count = 0; im.frustumCulled = false; im.name = 'rh-' + k + '-' + mn; group.add(im); meshes.push(im); });
      types[k] = { id: k, label: K.label, size: K.size, sink: K.sink, style: K.style, faceDownhill: !!K.faceDownhill, meshes: meshes, homes: [] };
    });

    function slopeYaw(x, z) {   // door faces DOWNHILL (yaw convention: local +z -> (sin r, cos r))
      var d = 4 * U, gx = heightAt(x + d, z) - heightAt(x - d, z), gz = heightAt(x, z + d) - heightAt(x, z - d);
      return Math.hypot(gx, gz) < 0.4 ? null : Math.atan2(-gx, -gz);
    }
    function place(type, x, z, o) {
      o = o || {}; var T = types[type]; if (!T) throw new Error('unknown home type ' + type);
      var yaw = o.yaw != null ? o.yaw : (T.faceDownhill ? slopeYaw(x, z) : null); if (yaw == null) yaw = ((x * 12.9898 + z * 78.233) % 6.283);
      var gy = heightAt(x, z), id = o.id || ('home:' + type + '@' + Math.round(x) + ',' + Math.round(z));
      if (byId[id]) return byId[id];
      // sink the building into the slope: use the UPHILL edge height so half-buried homes really are dug in
      var hUp = heightAt(x - Math.sin(yaw) * 4 * U, z - Math.cos(yaw) * 4 * U), y = Math.max(gy, hUp * 0.55 + gy * 0.45) - T.sink * U;
      var h = { id: id, type: type, x: x, y: y, z: z, yaw: yaw, ownerId: o.ownerId || null, T: T }; T.homes.push(h); homes.push(h); byId[id] = h;
      var sz = T.size, solid = null;
      // solid shell (OBB) + enterable interior
      if (layout && layout.realmColliders) { solid = { x: x, z: z, hx: sz[0] / 2 * U * 0.92, hz: sz[1] / 2 * U * 0.92, rot: yaw, top: y + sz[2] * U, label: 'realmhome:' + id }; layout.realmColliders.push(solid); }
      if (iv3 && iv3.register) { try { iv3.register({ id: id, key: type, recipe: type, x: x, z: z, rot: yaw, w: Math.min(sz[0] - 2, 14), d: Math.min(sz[1] - 2, 9), h: sz[2], canon: solid, ownerId: h.ownerId }); h.enterable = true; } catch (e) { h.enterable = false; } }
      // the bed = a respawn rest point (public realm bed until someone owns it)
      var WS = root.WorldSurvival; if (WS && WS.registerRestPoint) WS.registerRestPoint({ id: id, kind: h.ownerId ? 'home' : 'realm-bed', name: T.label + (h.ownerId ? '' : ' (rest house)'), x: x, z: z, r: sz[0] * 0.7 });
      return h;
    }
    function village(type, cx, cz, n, o) {
      o = o || {}; var out = [], R = o.radius || 60, seed = o.seed || 7, r = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (var i = 0; i < n; i++) { var a = i * 2.399 + r() * 0.4, d = R * U * Math.sqrt((i + 0.6) / n) * (0.55 + 0.45 * r()); out.push(place(type, cx + Math.cos(a) * d, cz + Math.sin(a) * d, {})); }
      return out;
    }
    var _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ss = new THREE.Vector3(U, U, U), _up = new THREE.Vector3(0, 1, 0);
    function update(px, pz) {
      var lim = cullM * U; lim *= lim;
      Object.keys(types).forEach(function (k) {
        var T = types[k], n = 0; if (!T.homes.length) { T.meshes.forEach(function (im) { im.count = 0; }); return; }
        for (var i = 0; i < T.homes.length && n < CAP; i++) {
          var h = T.homes[i], dx = h.x - px, dz = h.z - pz; if (dx * dx + dz * dz > lim) continue;
          _qq.setFromAxisAngle(_up, h.yaw); _pp.set(h.x, h.y, h.z); _mm.compose(_pp, _qq, _ss);
          for (var m = 0; m < T.meshes.length; m++) T.meshes[m].setMatrixAt(n, _mm); n++;
        }
        T.meshes.forEach(function (im) { im.count = n; im.instanceMatrix.needsUpdate = true; });
      });
    }
    return { types: types, place: place, village: village, update: update, homes: homes, group: group, byId: byId, mats: mats,
      stats: function () { var t = 0, dc = 0; Object.keys(types).forEach(function (k) { dc += types[k].meshes.length; t += types[k].homes.length; }); return { homes: t, drawCallsMax: dc }; } };
  }
  root.buildWorldRealmHomes = build; root.__realmHomesDefineStyles = defineInteriorStyles;
})(typeof window !== 'undefined' ? window : globalThis);
