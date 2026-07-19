/* world-biomes.js — SHADDAI World 3D: BIOME PROPS + WATER + ATMOSPHERE module.
 *
 * Enhanced v2: richer per-biome props, InstancedMesh everywhere possible,
 * allocation-free update(), modest emissive to avoid white-blowout.
 *
 * Public interface (unchanged):
 *   const biomes = window.buildWorldBiomes(THREE, scene, window.WORLD_LAYOUT);
 *   biomes.update(elapsedSeconds);   // call each frame
 *   biomes.dispose();                // cleanup
 *
 * Per-biome additions
 *   forest  — instanced mushrooms, instanced ferns (X-cross), animated fireflies
 *   arctic  — instanced ice spires, instanced snow drifts, dual aurora shimmer planes
 *   desert  — instanced cacti (body+arms), instanced bleached bones, blowing sand motes
 *   void    — instanced floating debris, portal rift rings, towers now instanced
 *   grid    — pylons now instanced, instanced holo-panels, instanced data nodes
 */
window.buildWorldBiomes = function (THREE, scene, layout) {
  var _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  layout = layout || window.WORLD_LAYOUT;

  // ── seeded PRNG (mulberry32) — stable scatter across reloads ──
  let _seed = 0x5ADDA1;
  function rand() {
    _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
    let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rrange = (a, b) => a + (b - a) * rand();

  const group = new THREE.Group();
  group.name = 'world-biomes';
  scene.add(group);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // animation buckets (filled during build, consumed in update — no allocations)
  const pulsers       = [];  // { mat, base, amp, speed }  — emissiveIntensity
  const auroraPlanes  = [];  // { mat, base, amp, speed, phase } — opacity
  const voidFloaters  = [];  // { m, y0, ph, sp }
  const forestFireflies = []; // { attr, base, offsets }
  const desertSandMotes = []; // { attr, base }
  // ── AMBIENT LIFE FX (2026-07-05) — cheap, characterless motion over the map ──
  const ambientMotes  = [];  // { attr, base, offsets, cx, cz, r2 } — plaza drift Points
  const godRays       = [];  // { mat, base, amp, speed, phase, x, z, r2 } — light-shaft opacity
  let   ambientDrones = null; // { mesh, bases:[{x,y0,z,ph,sp,s}], obj } — floating orbs

  let water = null;  // { geo, base:Float32Array, update(t) }

  const biome = (id) => layout.biomes.find((b) => b.id === id);

  // ── clearance: skip sectors + world centre so props don't bury buildings ──
  // (2026-07-05) The old 25u ring was far smaller than a building's footprint
  // (half-widths ~62-78u) and its ground lounge, so cacti/rocks/bones scattered
  // straight INTO TURTLE's lounge and the like. Widened: SECTOR_CLEAR keeps every
  // prop well outside each building + its walk-through lounge, and a bigger
  // world-centre ring keeps the plaza/temple approach clear of terrain clutter.
  const CLEAR        = 60;   // world centre (temple + inner plaza rings)
  const SECTOR_CLEAR = 96;   // each agent building + its elevated lounge footprint
  function blocked(x, z) {
    if (Math.hypot(x, z) < CLEAR) return true;
    for (const s of layout.sectors) {
      if (Math.hypot(x - s.pos[0], z - s.pos[1]) < SECTOR_CLEAR) return true;
    }
    return false;
  }

  // pick a valid scatter point inside a biome circle
  function scatter(b, margin) {
    const r = b.radius - (margin || 0);
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      const x = b.center[0] + Math.cos(a) * d;
      const z = b.center[1] + Math.sin(a) * d;
      if (!blocked(x, z)) return [x, z];
    }
    return null;
  }

  function addBiomeLight(b, intensity, dist) {
    const L = new THREE.PointLight(b.color, intensity, dist, 2);
    L.position.set(b.center[0], 28, b.center[1]);
    group.add(L);
  }

  const heightAt = (typeof window !== 'undefined' && window.WORLD_HEIGHT_AT)
    ? window.WORLD_HEIGHT_AT
    : function () { return 0; };

  // ── shared FLUX-baked ROCK albedo (grey granite) — loaded ONCE, shared by ──
  // every rock prop (desert spikes + the scattered boulder field). RepeatWrapping
  // so it tiles over larger boulders. SRGB colour space, anisotropic. On failure
  // the texture stays null and the props keep their flat base colour.
  const _rockTex = track(new THREE.TextureLoader().load('/assets/textures/rock.png'));
  _rockTex.wrapS = _rockTex.wrapT = THREE.RepeatWrapping;
  _rockTex.repeat.set(1.6, 1.6);
  _rockTex.anisotropy = 8;
  if (THREE.SRGBColorSpace) _rockTex.colorSpace = THREE.SRGBColorSpace;

  // ── shared transform helpers (module-scope; never recreated in loops) ──
  const _m    = new THREE.Matrix4();
  const _pos  = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _euler= new THREE.Euler();
  const _up   = new THREE.Vector3(0, 1, 0);
  const _scl  = new THREE.Vector3();

  // helper: write one instance matrix and advance counter
  function setInst(mesh, idx, px, py, pz, rx, ry, rz, sx, sy, sz) {
    _pos.set(px, py, pz);
    _euler.set(rx, ry, rz);
    _quat.setFromEuler(_euler);
    _scl.set(sx, sy, sz);
    _m.compose(_pos, _quat, _scl);
    mesh.setMatrixAt(idx, _m);
  }

  // helper: bake several (already positioned) part geometries into ONE
  // BufferGeometry so a whole multi-part tree still renders as a single
  // InstancedMesh (one draw call). Source parts are disposed after merge.
  function mergeGeos(geos) {
    let total = 0;
    const parts = [];
    for (let i = 0; i < geos.length; i++) {
      const g = geos[i].index ? geos[i].toNonIndexed() : geos[i];
      parts.push(g);
      total += g.attributes.position.count;
    }
    const posOut = new Float32Array(total * 3);
    let off = 0;
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i].attributes.position.array;
      posOut.set(a, off);
      off += a.length;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
    merged.computeVertexNormals();
    for (let i = 0; i < geos.length; i++) { if (geos[i].dispose) geos[i].dispose(); }
    return merged;
  }

  // ══════════════════════════════════════════════════════════════════
  //  FOREST
  // ══════════════════════════════════════════════════════════════════
  (function buildForest() {
    const b = biome('forest'); if (!b) return;
    const cx = b.center[0], cz = b.center[1];
    const PLAZA_R = 130;
    const TREE_GAP = 11;
    const placed = [];
    const target = 96;

    function farEnough(x, z) {
      for (let i = 0; i < placed.length; i++) {
        const dx = x - placed[i][0], dz = z - placed[i][1];
        if (dx * dx + dz * dz < TREE_GAP * TREE_GAP) return false;
      }
      return true;
    }
    for (let tries = 0; placed.length < target && tries < target * 24; tries++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * (b.radius - 8);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.hypot(x, z) < PLAZA_R) continue;
      if (blocked(x, z)) continue;
      if (!farEnough(x, z)) continue;
      placed.push([x, z]);
    }
    const COUNT = placed.length;

    // ── TREES ── 3 stylised species, each a merged multi-part model so
    // the whole forest is only 6 draw calls (trunk + foliage per type):
    //   • CONIFER  — tapered 2-segment trunk + 4 stacked cone tiers
    //   • BROADLEAF— forked trunk (3 branches) + 5 clustered canopy blobs
    //   • CRYSTAL  — faceted crystal trunk + spiky octahedron cluster (exotic)
    // Per-instance colour variation (instanceColor) + tilt/rotation/scale
    // jitter keep clusters from looking copy-pasted. Zero per-frame cost.
    const _col = new THREE.Color();

    // assign a species to every placed tree (stable via seeded rand)
    const typeOf = new Uint8Array(COUNT);      // 0 conifer · 1 broadleaf · 2 crystal
    let nCon = 0, nBroad = 0, nCry = 0;
    for (let i = 0; i < COUNT; i++) {
      const r = rand();
      const ty = r < 0.15 ? 2 : (r < 0.55 ? 1 : 0);
      typeOf[i] = ty;
      if (ty === 0) nCon++; else if (ty === 1) nBroad++; else nCry++;
    }

    // ---- merged geometries (parts pre-positioned, then baked to one mesh) ----
    const coniTrunkGeo = track(mergeGeos([
      new THREE.CylinderGeometry(0.55, 1.05, 5.5, 6).translate(0, 2.6, 0),
      new THREE.CylinderGeometry(0.26, 0.55, 5.0, 6).translate(0, 7.4, 0),
    ]));
    const coniLeafGeo = track(mergeGeos([
      new THREE.ConeGeometry(4.7, 6.5, 7).translate(0, 9.5, 0),
      new THREE.ConeGeometry(3.7, 5.6, 7).translate(0, 13.4, 0),
      new THREE.ConeGeometry(2.6, 4.6, 7).translate(0, 16.9, 0),
      new THREE.ConeGeometry(1.4, 3.2, 7).translate(0, 19.7, 0),
    ]));

    const broadTrunkGeo = track(mergeGeos([
      new THREE.CylinderGeometry(0.5, 1.05, 8, 6).translate(0, 4, 0),
      new THREE.CylinderGeometry(0.26, 0.42, 5.2, 5).rotateZ(0.6).translate(-1.7, 7.3, 0),
      new THREE.CylinderGeometry(0.24, 0.40, 4.6, 5).rotateZ(-0.7).translate(1.8, 7.9, 0.4),
      new THREE.CylinderGeometry(0.22, 0.34, 4.2, 5).rotateX(0.65).translate(0.2, 8.3, -1.6),
    ]));
    const broadLeafGeo = track(mergeGeos([
      new THREE.IcosahedronGeometry(3.5, 0).translate(0, 11.6, 0),
      new THREE.IcosahedronGeometry(2.7, 0).translate(-2.9, 10.6, 0.5),
      new THREE.IcosahedronGeometry(2.6, 0).translate(2.8, 11.3, -0.6),
      new THREE.IcosahedronGeometry(2.2, 0).translate(0.4, 13.6, -1.9),
      new THREE.IcosahedronGeometry(2.0, 0).translate(-0.7, 9.9, 2.3),
    ]));

    const cryTrunkGeo = track(mergeGeos([
      new THREE.CylinderGeometry(0.30, 0.62, 7, 5).translate(0, 3.5, 0),
      new THREE.CylinderGeometry(0.16, 0.30, 4.2, 5).rotateZ(0.5).translate(-1.0, 6.6, 0),
    ]));
    const cryLeafGeo = track(mergeGeos([
      new THREE.OctahedronGeometry(2.3, 0).translate(0, 9.2, 0),
      new THREE.OctahedronGeometry(1.6, 0).translate(-1.5, 11.1, 0.3),
      new THREE.OctahedronGeometry(1.7, 0).translate(1.4, 10.6, -0.4),
      new THREE.OctahedronGeometry(1.2, 0).translate(0.2, 12.8, 0.8),
    ]));

    // ---- materials (foliage colour comes from instanceColor; base = white) ----
    // Bark base = WHITE so per-instance instanceColor fully drives a real brown
    // bark tone (warm sienna → dark umber) with tonal variation per tree.
    const barkMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
    const cryBarkMat = track(new THREE.MeshStandardMaterial({
      color: 0x9fb8d8, emissive: 0x2a4a6a, emissiveIntensity: 0.25,
      roughness: 0.3, metalness: 0.4, flatShading: true, transparent: true, opacity: 0.9,
    }));
    const coniLeafMat = track(new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x2ea866, emissiveIntensity: 0.22,
      roughness: 0.8, flatShading: true,
    }));
    const broadLeafMat = track(new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x3ddc84, emissiveIntensity: 0.18,
      roughness: 0.85, flatShading: true,
    }));
    const cryLeafMat = track(new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x40e0ff, emissiveIntensity: 0.5,
      roughness: 0.2, metalness: 0.3, flatShading: true, transparent: true, opacity: 0.92,
    }));
    pulsers.push({ mat: coniLeafMat,  base: 0.22, amp: 0.10, speed: 0.8 });
    pulsers.push({ mat: broadLeafMat, base: 0.18, amp: 0.09, speed: 0.7 });
    pulsers.push({ mat: cryLeafMat,   base: 0.50, amp: 0.22, speed: 1.5 });

    // ---- one instanced trunk + foliage per species ----
    const coniTrunk = new THREE.InstancedMesh(coniTrunkGeo, barkMat,      Math.max(1, nCon));
    const coniLeaf  = new THREE.InstancedMesh(coniLeafGeo,  coniLeafMat,  Math.max(1, nCon));
    const broadTrunk= new THREE.InstancedMesh(broadTrunkGeo,barkMat,      Math.max(1, nBroad));
    const broadLeaf = new THREE.InstancedMesh(broadLeafGeo, broadLeafMat, Math.max(1, nBroad));
    const cryTrunk  = new THREE.InstancedMesh(cryTrunkGeo,  cryBarkMat,   Math.max(1, nCry));
    const cryLeaf   = new THREE.InstancedMesh(cryLeafGeo,   cryLeafMat,   Math.max(1, nCry));
    coniTrunk.castShadow = coniLeaf.castShadow = true;
    broadTrunk.castShadow = broadLeaf.castShadow = true;
    cryTrunk.castShadow = cryLeaf.castShadow = true;
    coniTrunk.name = 'forest-trees-conifer';

    // reusable bark colour (per-instance brown tonal variation; no allocation in loop)
    const _bark = new THREE.Color();
    let ci = 0, bi = 0, cyi = 0;
    for (let i = 0; i < COUNT; i++) {
      const x = placed[i][0], z = placed[i][1];
      const s = rrange(0.7, 1.5);
      _pos.set(x, heightAt(x, z) - 0.2, z);
      _euler.set(rrange(-0.06, 0.06), rand() * Math.PI * 2, rrange(-0.06, 0.06));
      _quat.setFromEuler(_euler);
      _scl.set(s, s * rrange(0.9, 1.18), s);   // slight height variance per tree
      _m.compose(_pos, _quat, _scl);
      const ty = typeOf[i];
      if (ty === 0) {
        coniTrunk.setMatrixAt(ci, _m); coniLeaf.setMatrixAt(ci, _m);
        // warm brown bark, per-tree tonal drift (hue ~0.07 sienna, low lightness)
        _bark.setHSL(0.065 + rand() * 0.03, 0.42 + rand() * 0.16, 0.15 + rand() * 0.09);
        coniTrunk.setColorAt(ci, _bark);
        // richer conifer green (deeper, more saturated pine)
        _col.setHSL(0.33 + rand() * 0.05, 0.60 + rand() * 0.18, 0.28 + rand() * 0.10);
        coniLeaf.setColorAt(ci, _col); ci++;
      } else if (ty === 1) {
        broadTrunk.setMatrixAt(bi, _m); broadLeaf.setMatrixAt(bi, _m);
        _bark.setHSL(0.075 + rand() * 0.035, 0.40 + rand() * 0.15, 0.17 + rand() * 0.09);
        broadTrunk.setColorAt(bi, _bark);
        // lush leaf green (shifted off yellow-lime toward a fuller green)
        _col.setHSL(0.29 + rand() * 0.06, 0.62 + rand() * 0.18, 0.36 + rand() * 0.12);
        broadLeaf.setColorAt(bi, _col); bi++;
      } else {
        cryTrunk.setMatrixAt(cyi, _m); cryLeaf.setMatrixAt(cyi, _m);
        const hue = rand() < 0.5 ? 0.50 + rand() * 0.06 : 0.80 + rand() * 0.09;
        _col.setHSL(hue, 0.85, 0.62);
        cryLeaf.setColorAt(cyi, _col); cyi++;
      }
    }
    coniTrunk.count = coniLeaf.count = ci;
    broadTrunk.count = broadLeaf.count = bi;
    cryTrunk.count = cryLeaf.count = cyi;
    coniTrunk.instanceMatrix.needsUpdate = coniLeaf.instanceMatrix.needsUpdate = true;
    broadTrunk.instanceMatrix.needsUpdate = broadLeaf.instanceMatrix.needsUpdate = true;
    cryTrunk.instanceMatrix.needsUpdate = cryLeaf.instanceMatrix.needsUpdate = true;
    if (coniLeaf.instanceColor)  coniLeaf.instanceColor.needsUpdate = true;
    if (broadLeaf.instanceColor) broadLeaf.instanceColor.needsUpdate = true;
    if (cryLeaf.instanceColor)   cryLeaf.instanceColor.needsUpdate = true;
    if (coniTrunk.instanceColor)  coniTrunk.instanceColor.needsUpdate = true;
    if (broadTrunk.instanceColor) broadTrunk.instanceColor.needsUpdate = true;
    group.add(coniTrunk, coniLeaf, broadTrunk, broadLeaf, cryTrunk, cryLeaf);

    // ── MUSHROOMS (instanced stem + cap) ─────────────────────────────
    const MUSH = 44;
    const mStemGeo = track(new THREE.CylinderGeometry(0.18, 0.28, 1.2, 5));
    mStemGeo.translate(0, 0.6, 0);
    const mCapGeo  = track(new THREE.SphereGeometry(0.58, 6, 4));
    mCapGeo.translate(0, 1.45, 0);
    const mStemMat = track(new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.9 }));
    const mCapMat  = track(new THREE.MeshStandardMaterial({
      color: 0x8b1a6b, emissive: 0xd040a0, emissiveIntensity: 0.20, roughness: 0.7,
    }));
    pulsers.push({ mat: mCapMat, base: 0.20, amp: 0.13, speed: 1.4 });

    const mStems = new THREE.InstancedMesh(mStemGeo, mStemMat, MUSH);
    const mCaps  = new THREE.InstancedMesh(mCapGeo,  mCapMat,  MUSH);
    let mc = 0;
    for (let tries = 0; mc < MUSH && tries < MUSH * 20; tries++) {
      const p = scatter(b, 5); if (!p) continue;
      if (Math.hypot(p[0], p[1]) < PLAZA_R) continue;
      const s = rrange(0.6, 1.7);
      setInst(mStems, mc, p[0], heightAt(p[0], p[1]) - 0.1, p[1],
              0, rand() * Math.PI * 2, 0, s, s, s);
      mCaps.setMatrixAt(mc, _m);
      mc++;
    }
    mStems.count = mCaps.count = mc;
    mStems.instanceMatrix.needsUpdate = mCaps.instanceMatrix.needsUpdate = true;
    group.add(mStems, mCaps);

    // ── FERNS (instanced X-cross planes as ground cover) ─────────────
    const FERN = 65;
    const fGeoA = track(new THREE.PlaneGeometry(2.8, 2.2));
    fGeoA.translate(0, 1.1, 0);
    const fGeoB = track(new THREE.PlaneGeometry(2.8, 2.2));
    fGeoB.translate(0, 1.1, 0);
    fGeoB.rotateY(Math.PI / 2);
    const fMat = track(new THREE.MeshStandardMaterial({
      color: 0x256038, emissive: 0x1a4228, emissiveIntensity: 0.07,
      roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.88,
    }));
    const fernsA = new THREE.InstancedMesh(fGeoA, fMat, FERN);
    const fernsB = new THREE.InstancedMesh(fGeoB, fMat, FERN);
    let fc = 0;
    for (let tries = 0; fc < FERN && tries < FERN * 20; tries++) {
      const p = scatter(b, 5); if (!p) continue;
      if (Math.hypot(p[0], p[1]) < PLAZA_R) continue;
      const s = rrange(0.7, 1.5);
      setInst(fernsA, fc, p[0], heightAt(p[0], p[1]) - 0.05, p[1],
              0, rand() * Math.PI * 2, 0, s, s, s);
      fernsB.setMatrixAt(fc, _m);
      fc++;
    }
    fernsA.count = fernsB.count = fc;
    fernsA.instanceMatrix.needsUpdate = fernsB.instanceMatrix.needsUpdate = true;
    group.add(fernsA, fernsB);

    // ── GLOW SHARDS (instanced small emerald crystals, ground-seated) ─
    // Characteristic forest detail: low bioluminescent quartz clusters that
    // catch the eye between trees. One InstancedMesh, faceted octahedra, tilt
    // + scale jitter so no two read the same. Natural clustering: each seed
    // scatters 1-3 satellites nearby. Static → zero per-frame cost. Emissive
    // pulses with the shared forest pulser (respects the emissive cap).
    const GSHARD = 54;
    const gsGeo = track(new THREE.OctahedronGeometry(0.5, 0));
    const gsMat = track(new THREE.MeshStandardMaterial({
      color: 0x123322, emissive: 0x36f0a0, emissiveIntensity: 0.42,
      roughness: 0.25, metalness: 0.25, flatShading: true,
      transparent: true, opacity: 0.9,
    }));
    pulsers.push({ mat: gsMat, base: 0.42, amp: 0.18, speed: 1.1 });
    const gshards = new THREE.InstancedMesh(gsGeo, gsMat, GSHARD);
    let gsc = 0;
    for (let tries = 0; gsc < GSHARD && tries < GSHARD * 14; tries++) {
      const p = scatter(b, 5); if (!p) continue;
      if (Math.hypot(p[0], p[1]) < PLAZA_R) continue;
      // cluster: a main shard + a few smaller satellites around it
      const kids = 1 + (rand() * 3 | 0);
      for (let k = 0; k < kids && gsc < GSHARD; k++) {
        const ox = k === 0 ? 0 : rrange(-2.2, 2.2);
        const oz = k === 0 ? 0 : rrange(-2.2, 2.2);
        const x = p[0] + ox, z = p[1] + oz;
        const s = (k === 0 ? rrange(1.1, 2.2) : rrange(0.5, 1.1));
        setInst(gshards, gsc, x, heightAt(x, z) + s * 0.35, z,
                rrange(-0.4, 0.4), rand() * Math.PI * 2, rrange(-0.4, 0.4),
                s, s * rrange(1.1, 1.9), s);   // vertically stretched crystal
        gsc++;
      }
    }
    gshards.count = gsc;
    gshards.instanceMatrix.needsUpdate = true;
    group.add(gshards);

    // ── FIREFLIES (Points, animated each frame) ───────────────────────
    const FF = 80;
    const ffBase    = new Float32Array(FF * 3);
    const ffOffsets = new Float32Array(FF * 3);
    for (let i = 0; i < FF; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (b.radius - 10);
      let x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.hypot(x, z) < PLAZA_R) { x = cx + Math.cos(a) * PLAZA_R; z = cz + Math.sin(a) * PLAZA_R; }
      ffBase[i * 3] = x; ffBase[i * 3 + 1] = rrange(1.5, 10); ffBase[i * 3 + 2] = z;
      ffOffsets[i * 3]     = rand() * Math.PI * 2;
      ffOffsets[i * 3 + 1] = rand() * Math.PI * 2;
      ffOffsets[i * 3 + 2] = rand() * Math.PI * 2;
    }
    const ffArr  = new Float32Array(FF * 3);
    ffArr.set(ffBase);
    const ffGeo  = track(new THREE.BufferGeometry());
    const ffAttr = new THREE.BufferAttribute(ffArr, 3);
    ffGeo.setAttribute('position', ffAttr);
    const ffMat  = track(new THREE.PointsMaterial({
      color: 0xaaffcc, size: 1.5, transparent: true, opacity: 0.72,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    group.add(new THREE.Points(ffGeo, ffMat));
    forestFireflies.push({ attr: ffAttr, base: ffBase, offsets: ffOffsets });

    // ── static spore mist ─────────────────────────────────────────────
    const N = 100, spPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * b.radius;
      spPos[i * 3] = cx + Math.cos(a) * d;
      spPos[i * 3 + 1] = rrange(2, 22);
      spPos[i * 3 + 2] = cz + Math.sin(a) * d;
    }
    const spGeo = track(new THREE.BufferGeometry());
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    const spMat = track(new THREE.PointsMaterial({
      color: 0x9bffce, size: 1.3, transparent: true, opacity: 0.45, depthWrite: false,
    }));
    group.add(new THREE.Points(spGeo, spMat));

    addBiomeLight(b, 1.1, 320);
  })();

  // ══════════════════════════════════════════════════════════════════
  //  ARCTIC
  // ══════════════════════════════════════════════════════════════════
  (function buildArctic() {
    const b = biome('arctic'); if (!b) return;

    // ── ICE SHARDS (instanced icosahedra) ────────────────────────────
    const SHARD = 30;
    const shGeo = track(new THREE.IcosahedronGeometry(1, 0));
    const shMat = track(new THREE.MeshStandardMaterial({
      color: 0x8fd0ff, emissive: 0x2a6fb0, emissiveIntensity: 0.18,
      roughness: 0.25, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.78,
    }));
    const shards = new THREE.InstancedMesh(shGeo, shMat, SHARD);
    let shc = 0;
    for (let i = 0; shc < SHARD && i < SHARD * 8; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const h = rrange(4, 14);
      setInst(shards, shc,
        p[0], heightAt(p[0], p[1]) + h * 0.35, p[1],
        rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5,
        rrange(2, 5), h, rrange(2, 5));
      shc++;
    }
    shards.count = shc;
    shards.instanceMatrix.needsUpdate = true;
    group.add(shards);

    // ── ICE SPIRES (instanced cones — tall & thin) ───────────────────
    const SPIRE = 22;
    const spireGeo = track(new THREE.ConeGeometry(0.55, 18, 5));
    spireGeo.translate(0, 9, 0);
    const spireMat = track(new THREE.MeshStandardMaterial({
      color: 0xc8eeff, emissive: 0x4096d0, emissiveIntensity: 0.16,
      roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.68, flatShading: true,
    }));
    const spires = new THREE.InstancedMesh(spireGeo, spireMat, SPIRE);
    let spc = 0;
    for (let i = 0; spc < SPIRE && i < SPIRE * 8; i++) {
      const p = scatter(b, 8); if (!p) continue;
      const s = rrange(0.5, 1.7);
      setInst(spires, spc,
        p[0], heightAt(p[0], p[1]), p[1],
        0, rand() * Math.PI * 2, 0,
        s * rrange(0.4, 1.0), s, s * rrange(0.4, 1.0));
      spc++;
    }
    spires.count = spc;
    spires.instanceMatrix.needsUpdate = true;
    group.add(spires);

    // ── SNOW DRIFTS (instanced flat oblate spheroids) ─────────────────
    const DRIFT = 38;
    const drGeo = track(new THREE.SphereGeometry(1, 8, 5));
    const drMat = track(new THREE.MeshStandardMaterial({ color: 0xedf5ff, roughness: 1.0 }));
    const drifts = new THREE.InstancedMesh(drGeo, drMat, DRIFT);
    let dc = 0;
    for (let i = 0; dc < DRIFT && i < DRIFT * 8; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const w = rrange(5, 15), h = rrange(0.4, 1.8);
      setInst(drifts, dc,
        p[0], heightAt(p[0], p[1]) + h * 0.4, p[1],
        0, rand() * Math.PI * 2, 0,
        w, h, w * rrange(0.6, 1.1));
      dc++;
    }
    drifts.count = dc;
    drifts.instanceMatrix.needsUpdate = true;
    group.add(drifts);

    // ── FROST TUFTS (instanced low ice-crystal clusters, ground-seated) ─
    // Cheap characteristic arctic ground cover: short pale-cyan cones fanned
    // out of one merged tuft so a whole cluster is a single instance. Scatter
    // + rotation/scale jitter reads as wind-blown frost grass between the big
    // spires. One InstancedMesh, static → zero per-frame cost.
    const tuftGeo = track(mergeGeos([
      new THREE.ConeGeometry(0.10, 1.4, 4).translate(0, 0.7, 0),
      new THREE.ConeGeometry(0.09, 1.1, 4).rotateZ(0.4).translate(0.35, 0.55, 0),
      new THREE.ConeGeometry(0.09, 1.0, 4).rotateZ(-0.5).translate(-0.32, 0.5, 0.1),
      new THREE.ConeGeometry(0.08, 0.9, 4).rotateX(0.45).translate(0.05, 0.45, 0.34),
    ]));
    const TUFT = 46;
    const tuftMat = track(new THREE.MeshStandardMaterial({
      color: 0xbfe8ff, emissive: 0x2f7fc0, emissiveIntensity: 0.14,
      roughness: 0.4, metalness: 0.1, flatShading: true,
      transparent: true, opacity: 0.85,
    }));
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFT);
    let tuc = 0;
    for (let i = 0; tuc < TUFT && i < TUFT * 10; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const s = rrange(0.7, 1.8);
      setInst(tufts, tuc, p[0], heightAt(p[0], p[1]) - 0.05, p[1],
              0, rand() * Math.PI * 2, 0, s, s * rrange(0.9, 1.4), s);
      tuc++;
    }
    tufts.count = tuc;
    tufts.instanceMatrix.needsUpdate = true;
    group.add(tufts);

    // ── AURORA (two large additive planes high overhead) ──────────────
    // Low opacity + AdditiveBlending = tasteful shimmer, no blowout.
    const aGeo = track(new THREE.PlaneGeometry(b.radius * 2.4, 55, 10, 3));
    aGeo.rotateX(Math.PI * 0.07);
    const aMat1 = track(new THREE.MeshBasicMaterial({
      color: 0x00ffb0, transparent: true, opacity: 0.08,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    const aMat2 = track(new THREE.MeshBasicMaterial({
      color: 0x5500ff, transparent: true, opacity: 0.05,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    const aM1 = new THREE.Mesh(aGeo, aMat1);
    const aM2 = new THREE.Mesh(aGeo, aMat2);
    aM1.position.set(b.center[0], 92, b.center[1]);
    aM2.position.set(b.center[0], 98, b.center[1]);
    aM2.rotation.y = 0.45;
    group.add(aM1, aM2);
    auroraPlanes.push({ mat: aMat1, base: 0.08, amp: 0.05, speed: 0.35, phase: 0.0 });
    auroraPlanes.push({ mat: aMat2, base: 0.05, amp: 0.04, speed: 0.27, phase: 1.9 });

    // ── ANIMATED WATER PLANE ──────────────────────────────────────────
    // PERF: SEG 64→48→40. The wave field is low-frequency (shortest wavelength
    // ≈ 2π/0.19 ≈ 33u; at 40 segs a cell is 220/40 = 5.5u — still ~6 samples
    // per shortest wave), so the animated silhouette is visually unchanged while
    // BOTH the one-time build (49²=2401 → 41²=1681 verts, colour/damp precompute)
    // AND the every-frame vertex + computeVertexNormals() cost drop a further ~30%.
    const SEG = 40, SIZE = 220, HALF = SIZE / 2;
    const wgeo = track(new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG));
    wgeo.rotateX(-Math.PI / 2);
    const wpos = wgeo.attributes.position;
    const vN = wpos.count;
    const wbase = new Float32Array(wpos.array.length);
    wbase.set(wpos.array);

    const deep    = new THREE.Color(0x0c4f7a);
    const shallow = new THREE.Color(0x3aa6d6);
    const foam    = new THREE.Color(0xcdeeff);
    const wcol    = new Float32Array(vN * 3);
    const _c = new THREE.Color();
    for (let i = 0; i < vN; i++) {
      const x = wbase[i * 3], z = wbase[i * 3 + 2];
      const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF;
      const foamAmt = Math.max(0, (edge - 0.78) / 0.22);
      _c.copy(deep).lerp(shallow, edge * 0.6);
      _c.lerp(foam, Math.min(1, foamAmt * foamAmt));
      wcol[i * 3] = _c.r; wcol[i * 3 + 1] = _c.g; wcol[i * 3 + 2] = _c.b;
    }
    wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));

    // PERF: per-vertex edge damping depends only on the (static) rest x/z, so it
    // is identical every frame. Precompute it once here instead of recomputing
    // abs/max/div/branch for ~2400 verts on every update() call. Bit-identical to
    // the old inline formula.
    const wdamp = new Float32Array(vN);
    for (let i = 0; i < vN; i++) {
      const x = wbase[i * 3], z = wbase[i * 3 + 2];
      const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF;
      wdamp[i] = edge > 0.8 ? Math.max(0.25, 1 - (edge - 0.8) * 3.0) : 1;
    }

    const wmat = track(new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff,
      emissive: 0x0a3358, emissiveIntensity: 0.38,
      roughness: 0.12, metalness: 0.6,
      transparent: true, opacity: 0.82, envMapIntensity: 1.4,
    }));
    const wmesh = new THREE.Mesh(wgeo, wmat);
    wmesh.position.set(b.center[0], 0.05, b.center[1]);
    wmesh.receiveShadow = true;
    group.add(wmesh);

    water = {
      geo: wgeo, base: wbase,
      update(t) {
        const arr = wpos.array;
        // vi walks the per-vertex damp table in lockstep with the xyz stride
        for (let i = 0, vi = 0; i < arr.length; i += 3, vi++) {
          const x = wbase[i], z = wbase[i + 2];
          const damp = wdamp[vi];              // precomputed (static per vertex)
          arr[i + 1] = wbase[i + 1] + damp * (
              Math.sin(x * 0.075 + t * 1.4) * 0.55
            + Math.cos(z * 0.065 - t * 1.1) * 0.50
            + Math.sin((x + z) * 0.140 + t * 2.2) * 0.22
            + Math.cos((x - z) * 0.190 - t * 2.8) * 0.12
          );
        }
        wpos.needsUpdate = true;
        wgeo.computeVertexNormals();
        wmat.emissiveIntensity = 0.38 + Math.sin(t * 1.7) * 0.10;
        wmat.roughness = 0.12 + (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.06;
      },
    };

    addBiomeLight(b, 1.0, 320);
  })();

  // ══════════════════════════════════════════════════════════════════
  //  DESERT
  // ══════════════════════════════════════════════════════════════════
  (function buildDesert() {
    const b = biome('desert'); if (!b) return;

    // ── DUNES (instanced oblate spheroids) ────────────────────────────
    // Owner polish (2026-07-05): the desert used to also spawn spiky "rock
    // spikes" (tan cones) and cacti, plus BIG bright-yellow dunes — the owner
    // disliked those "cactus and big yellow rocks" from the start (they read as
    // janky/obtrusive and could clip TURTLE's lounge). The cacti + rock spikes
    // are REMOVED entirely; the dunes are kept but toned WAY down: fewer, much
    // smaller, and a muted sand tone (not the loud yellow) so they sit quietly
    // as low ground swells instead of dominating as "big yellow rocks".
    const DUNE = 10;
    const duneGeo = track(new THREE.SphereGeometry(1, 10, 6));
    const duneMat = track(new THREE.MeshStandardMaterial({
      color: 0xc79a5c, roughness: 1, flatShading: true,   // muted sand (was loud 0xe8a445)
    }));
    const dunes = new THREE.InstancedMesh(duneGeo, duneMat, DUNE);
    let dunec = 0;
    for (let i = 0; dunec < DUNE && i < DUNE * 8; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const w = rrange(7, 14), h = rrange(1.4, 2.8);       // smaller, low swells (was 10-26 wide, 2-5 high)
      setInst(dunes, dunec,
        p[0], heightAt(p[0], p[1]) + h * 0.12, p[1],
        0, rand() * Math.PI, 0,
        w, h, w * rrange(0.7, 1.2));
      dunec++;
    }
    dunes.count = dunec;
    dunes.instanceMatrix.needsUpdate = true;
    group.add(dunes);

    // (REMOVED 2026-07-05) ROCK SPIKES (tan cones) + CACTI — the "cactus and big
    // yellow rocks" the owner disliked. Deleted for a cleaner, less-cluttered
    // desert. Bleached bones + drifting sand motes below still carry the biome.

    // ── BLEACHED BONES / ROCKS (instanced small pale shapes) ──────────
    const BONE = 30;
    const bGeo = track(new THREE.SphereGeometry(1, 5, 4));
    const bMat = track(new THREE.MeshStandardMaterial({
      color: 0xe8e0cc, roughness: 1, flatShading: true,
    }));
    const bones = new THREE.InstancedMesh(bGeo, bMat, BONE);
    let bnc = 0;
    for (let i = 0; bnc < BONE && i < BONE * 8; i++) {
      const p = scatter(b, 3); if (!p) continue;
      setInst(bones, bnc,
        p[0], heightAt(p[0], p[1]) + 0.2, p[1],
        rand() * 0.8, rand() * Math.PI * 2, rand() * 0.6,
        rrange(0.4, 1.2), rrange(0.2, 0.5), rrange(0.3, 0.9));
      bnc++;
    }
    bones.count = bnc;
    bones.instanceMatrix.needsUpdate = true;
    group.add(bones);

    // ── SAND MOTES (Points, drift with animated wind each frame) ──────
    const SM = 160;
    const smBase = new Float32Array(SM * 3);
    for (let i = 0; i < SM; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (b.radius - 4);
      smBase[i * 3]     = b.center[0] + Math.cos(a) * d;
      smBase[i * 3 + 1] = rrange(0.3, 5.0);
      smBase[i * 3 + 2] = b.center[1] + Math.sin(a) * d;
    }
    const smArr  = new Float32Array(SM * 3);
    smArr.set(smBase);
    const smGeo  = track(new THREE.BufferGeometry());
    const smAttr = new THREE.BufferAttribute(smArr, 3);
    smGeo.setAttribute('position', smAttr);
    const smMat  = track(new THREE.PointsMaterial({
      color: 0xd4a855, size: 0.9, transparent: true, opacity: 0.40,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    group.add(new THREE.Points(smGeo, smMat));
    desertSandMotes.push({ attr: smAttr, base: smBase });

    addBiomeLight(b, 1.0, 320);
  })();

  // ══════════════════════════════════════════════════════════════════
  //  VOID
  // ══════════════════════════════════════════════════════════════════
  (function buildVoid() {
    const b = biome('void'); if (!b) return;

    // ── TOWERS (instanced, two colour variants) ───────────────────────
    const TOWER = 12;
    const twGeo  = track(new THREE.CylinderGeometry(0.6, 2.4, 40, 6));
    const cMag   = track(new THREE.MeshStandardMaterial({
      color: 0x2a0a3a, emissive: 0xd61fff, emissiveIntensity: 0.50,
      roughness: 0.5, flatShading: true,
    }));
    const cCyan  = track(new THREE.MeshStandardMaterial({
      color: 0x0a2a3a, emissive: 0x1ff0ff, emissiveIntensity: 0.50,
      roughness: 0.5, flatShading: true,
    }));
    pulsers.push({ mat: cMag,  base: 0.50, amp: 0.22, speed: 1.3 });
    pulsers.push({ mat: cCyan, base: 0.50, amp: 0.22, speed: 1.1 });
    const twM = new THREE.InstancedMesh(twGeo, cMag,  TOWER);
    const twC = new THREE.InstancedMesh(twGeo, cCyan, TOWER);
    let tm = 0, tc = 0;
    for (let i = 0; (tm + tc) < TOWER && i < TOWER * 8; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const s = rrange(0.7, 1.6);
      setInst(twM, tm, p[0], heightAt(p[0], p[1]) + 20 * s, p[1],
              0, rand() * Math.PI * 2, 0, rrange(0.7, 1.3), s, rrange(0.7, 1.3));
      if (rand() < 0.5) { twC.setMatrixAt(tc, _m); tc++; }
      else              { twM.setMatrixAt(tm, _m); tm++; }
    }
    twM.count = tm; twC.count = tc;
    twM.instanceMatrix.needsUpdate = twC.instanceMatrix.needsUpdate = true;
    group.add(twM, twC);

    // ── FLOATING SHARDS (per-mesh for individual animation) ───────────
    const shGeo = track(new THREE.OctahedronGeometry(1.6, 0));
    const shMat = track(new THREE.MeshStandardMaterial({
      color: 0x3a1a5a, emissive: 0x9b59f5, emissiveIntensity: 0.40, flatShading: true,
    }));
    pulsers.push({ mat: shMat, base: 0.40, amp: 0.18, speed: 0.9 });
    for (let i = 0; i < 0; i++) {   // owner: floating sky clutter → disabled (read as glitch boxes)
      const p = scatter(b, 4); if (!p) continue;
      const m = new THREE.Mesh(shGeo, shMat);
      m.scale.setScalar(rrange(0.8, 2.2));
      const y0 = rrange(8, 30);
      m.position.set(p[0], y0, p[1]);
      group.add(m);
      voidFloaters.push({ m, y0, ph: rand() * Math.PI * 2, sp: rrange(0.4, 0.9) });
    }

    // ── FLOATING DEBRIS (instanced small boxes at mid-air) ────────────
    // Owner: these read as "floating glitch square boxes in the air" → disabled.
    const DEBRIS = 0;
    const dbGeo  = track(new THREE.BoxGeometry(1, 1, 1));
    const dbMat  = track(new THREE.MeshStandardMaterial({
      color: 0x1a0a2a, emissive: 0x6a10c8, emissiveIntensity: 0.28,
      roughness: 0.7, flatShading: true,
    }));
    pulsers.push({ mat: dbMat, base: 0.28, amp: 0.16, speed: 0.65 });
    const debris = new THREE.InstancedMesh(dbGeo, dbMat, DEBRIS);
    let dbc = 0;
    for (let i = 0; dbc < DEBRIS && i < DEBRIS * 8; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const s = rrange(0.4, 2.5);
      setInst(debris, dbc,
        p[0], rrange(12, 46), p[1],
        rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI,
        s, s * rrange(0.4, 2.0), s * rrange(0.4, 2.0));
      dbc++;
    }
    debris.count = dbc;
    debris.instanceMatrix.needsUpdate = true;
    group.add(debris);

    // ── PORTAL RIFTS (Torus rings, additive + pulsing) ─────────────────
    const RIFT = 6;
    const rfGeo = track(new THREE.TorusGeometry(5.5, 0.55, 8, 24));
    const rfMat = track(new THREE.MeshStandardMaterial({
      color: 0x3a005a, emissive: 0xcc22ff, emissiveIntensity: 0.50,
      transparent: true, opacity: 0.60,
      depthWrite: false, blending: THREE.AdditiveBlending,
      roughness: 0.4, side: THREE.DoubleSide,
    }));
    pulsers.push({ mat: rfMat, base: 0.50, amp: 0.28, speed: 1.5 });
    for (let i = 0; i < RIFT; i++) {
      const p = scatter(b, 5); if (!p) continue;
      const m = new THREE.Mesh(rfGeo, rfMat);
      const y0 = rrange(10, 28);
      m.position.set(p[0], y0, p[1]);
      m.rotation.set(rrange(-0.4, 0.4), rand() * Math.PI * 2, rrange(-0.3, 0.3));
      m.scale.setScalar(rrange(0.6, 1.5));
      group.add(m);
      // rifts also gently drift vertically
      voidFloaters.push({ m, y0, ph: rand() * Math.PI * 2, sp: rrange(0.15, 0.45) });
    }

    addBiomeLight(b, 1.2, 300);
  })();

  // ══════════════════════════════════════════════════════════════════
  //  GRID
  // ══════════════════════════════════════════════════════════════════
  (function buildGrid() {
    const b = biome('grid'); if (!b) return;

    // ── PYLONS (instanced ring) ───────────────────────────────────────
    const PYLON = 12;
    const pyGeo  = track(new THREE.CylinderGeometry(0.5, 0.8, 22, 6));
    const pyMat  = track(new THREE.MeshStandardMaterial({
      color: 0x0a3a4a, emissive: 0x27e0ff, emissiveIntensity: 0.45,
      roughness: 0.4, flatShading: true,
    }));
    pulsers.push({ mat: pyMat, base: 0.45, amp: 0.28, speed: 1.6 });
    const pylons = new THREE.InstancedMesh(pyGeo, pyMat, PYLON);
    const ring   = b.radius * 0.86;
    let pyc = 0;
    for (let i = 0; i < PYLON; i++) {
      const a = (i / PYLON) * Math.PI * 2 + 0.15;
      const x = b.center[0] + Math.cos(a) * ring;
      const z = b.center[1] + Math.sin(a) * ring;
      if (blocked(x, z)) continue;
      setInst(pylons, pyc, x, heightAt(x, z) + 11, z, 0, 0, 0, 1, 1, 1);
      pyc++;
    }
    pylons.count = pyc;
    pylons.instanceMatrix.needsUpdate = true;
    group.add(pylons);

    // ── HOLO-PANELS (instanced thin boxes, transparent glow) ──────────
    // owner: these floating box panels read as "glitch square boxes in the air" → disabled.
    const PANEL = 0;
    const panGeo = track(new THREE.BoxGeometry(6, 4, 0.12));
    const panMat = track(new THREE.MeshStandardMaterial({
      color: 0x0d1f30, emissive: 0x00d4ff, emissiveIntensity: 0.32,
      transparent: true, opacity: 0.52, roughness: 0.2, metalness: 0.8,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    pulsers.push({ mat: panMat, base: 0.32, amp: 0.20, speed: 2.1 });
    const panels = new THREE.InstancedMesh(panGeo, panMat, PANEL);
    let pc = 0;
    for (let i = 0; pc < PANEL && i < PANEL * 8; i++) {
      const p = scatter(b, 10); if (!p) continue;
      const h = rrange(5, 18);
      setInst(panels, pc,
        p[0], heightAt(p[0], p[1]) + h, p[1],
        0, rand() * Math.PI * 2, rrange(-0.08, 0.08),
        rrange(0.6, 1.8), rrange(0.5, 1.5), 1);
      pc++;
    }
    panels.count = pc;
    panels.instanceMatrix.needsUpdate = true;
    group.add(panels);

    // ── DATA NODES (instanced small glowing spheres) ──────────────────
    const NODE = 26;
    const ndGeo = track(new THREE.SphereGeometry(0.55, 6, 5));
    const ndMat = track(new THREE.MeshStandardMaterial({
      color: 0x00ffee, emissive: 0x00ffee, emissiveIntensity: 0.38,
      roughness: 0.1, metalness: 0.6,
    }));
    pulsers.push({ mat: ndMat, base: 0.38, amp: 0.24, speed: 2.8 });
    const nodes = new THREE.InstancedMesh(ndGeo, ndMat, NODE);
    let nc = 0;
    for (let i = 0; nc < NODE && i < NODE * 8; i++) {
      const p = scatter(b, 5); if (!p) continue;
      const h = rrange(3, 22);
      setInst(nodes, nc, p[0], heightAt(p[0], p[1]) + h, p[1],
              0, 0, 0, rrange(0.5, 1.4), rrange(0.5, 1.4), rrange(0.5, 1.4));
      nc++;
    }
    nodes.count = nc;
    nodes.instanceMatrix.needsUpdate = true;
    group.add(nodes);

    // ── GROUND GLYPHS (instanced flat emissive rings, laid flush on terrain) ─
    // Distinct grid-biome ground detail: thin glowing circuit rings that sit
    // just above the surface (walk-over, no collision) like data etched into
    // the plain. RingGeometry laid flat, scale/rotation jitter, additive glow
    // that pulses on a shared grid pulser. One InstancedMesh, static → free.
    const GLYPH = 30;
    const glGeo = track(new THREE.RingGeometry(1.3, 2.0, 6, 1));
    glGeo.rotateX(-Math.PI / 2);                 // lay flat on the ground
    const glMat = track(new THREE.MeshBasicMaterial({
      color: 0x00e6ff, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const glyphs = new THREE.InstancedMesh(glGeo, glMat, GLYPH);
    let glc = 0;
    for (let i = 0; glc < GLYPH && i < GLYPH * 8; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const s = rrange(0.8, 2.4);
      setInst(glyphs, glc, p[0], heightAt(p[0], p[1]) + 0.12, p[1],
              0, rand() * Math.PI * 2, 0, s, 1, s);
      glc++;
    }
    glyphs.count = glc;
    glyphs.instanceMatrix.needsUpdate = true;
    group.add(glyphs);

    addBiomeLight(b, 0.9, 340);
  })();

  // ══════════════════════════════════════════════════════════════════
  //  BOULDERS (scattered granite rock field across natural biomes)
  //  ONE InstancedMesh (single draw call), faceted rock geometry, the shared
  //  FLUX rock.png albedo. Seated on the terrain via heightAt with varied
  //  scale/rotation so no two boulders read the same. Static → zero update cost.
  // ══════════════════════════════════════════════════════════════════
  (function buildBoulders() {
    const TARGET = 34;
    const rockGeo = track(new THREE.IcosahedronGeometry(1, 1)); // rounded, faceted, cheap
    const rockMat = track(new THREE.MeshStandardMaterial({
      map: _rockTex, color: 0x9a938a, roughness: 0.95, metalness: 0.03, flatShading: true,
    }));
    const boulders = new THREE.InstancedMesh(rockGeo, rockMat, TARGET);
    boulders.castShadow = boulders.receiveShadow = true;
    boulders.name = 'world-boulders';

    const ids = ['forest', 'arctic', 'desert', 'void'];
    const per = Math.ceil(TARGET / ids.length);
    let rc = 0;
    for (let bi = 0; bi < ids.length && rc < TARGET; bi++) {
      const b = biome(ids[bi]); if (!b) continue;
      for (let k = 0; k < per && rc < TARGET; k++) {
        const p = scatter(b, 6); if (!p) continue;
        const s = rrange(1.4, 4.2);
        setInst(boulders, rc,
          p[0], heightAt(p[0], p[1]) + s * 0.30, p[1],
          rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI,
          s, s * rrange(0.6, 1.0), s * rrange(0.75, 1.15));
        rc++;
      }
    }
    boulders.count = rc;
    boulders.instanceMatrix.needsUpdate = true;
    if (rc > 0) group.add(boulders);
  })();

  // ══════════════════════════════════════════════════════════════════
  //  AMBIENT LIFE FX — drifting motes, floating orbs, god-ray shafts
  //  Adds motion/atmosphere over the central plaza + agent lounges WITHOUT any
  //  new dynamic lights or walking NPCs. All emissive/additive, all instanced or
  //  single-draw, shared materials, zero per-frame allocation, and DISTANCE-GATED
  //  in update() so nothing animates while the player is far away.
  // ══════════════════════════════════════════════════════════════════
  (function buildAmbientFX() {
    const sectors = (layout && layout.sectors) ? layout.sectors : [];
    const spots   = [[0, 0]];                                   // world-centre plaza/temple
    for (let i = 0; i < sectors.length && spots.length < 7; i++) {
      const s = sectors[i]; if (s && s.pos) spots.push([s.pos[0], s.pos[1]]);
    }

    // ── 1) PLAZA DRIFT MOTES — one additive Points cloud over the inner plaza. ──
    (function buildMotes() {
      const N = 200, R = 168;
      const base = new Float32Array(N * 3), offs = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = rand() * Math.PI * 2, d = 40 + Math.sqrt(rand()) * (R - 40);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const y = heightAt(x, z) + rrange(6, 42);
        base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
        offs[i * 3] = rand() * 6.28; offs[i * 3 + 1] = rand() * 6.28; offs[i * 3 + 2] = rand() * 6.28;
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
      const mat = track(new THREE.PointsMaterial({
        color: 0x8fd8ff, size: 2.2, sizeAttenuation: true, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const pts = new THREE.Points(geo, mat); pts.name = 'ambient-motes'; pts.frustumCulled = false;
      group.add(pts);
      ambientMotes.push({ attr: geo.attributes.position, base, offsets: offs, cx: 0, cz: 0, r2: 340 * 340 });
    })();

    // ── 2) FLOATING ORBS/DRONES — one InstancedMesh of emissive spheres that ──
    // bob on a sine path over the plaza + lounges (shared material, no lights).
    (function buildDrones() {
      const pos = [];
      // a ring of orbs hovering over the inner plaza
      const RING = 6, RR = 120;
      for (let i = 0; i < RING; i++) {
        const a = (i / RING) * Math.PI * 2;
        const x = Math.cos(a) * RR, z = Math.sin(a) * RR;
        pos.push([x, heightAt(x, z) + 26, z, rrange(0.8, 1.5)]);
      }
      // one orb drifting over each agent lounge (offset inward toward centre)
      for (let i = 1; i < spots.length && pos.length < 12; i++) {
        const sx = spots[i][0], sz = spots[i][1], L = Math.hypot(sx, sz) || 1;
        const x = sx * 0.86, z = sz * 0.86;                     // pull in over the lounge apron
        pos.push([x, heightAt(x, z) + 30, z, rrange(1.0, 1.8)]);
      }
      const geo = track(new THREE.SphereGeometry(1.6, 12, 10));
      const mat = track(new THREE.MeshBasicMaterial({
        color: 0x66e6ff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const mesh = new THREE.InstancedMesh(geo, mat, pos.length);
      mesh.name = 'ambient-drones'; mesh.frustumCulled = false;
      const bases = [];
      for (let i = 0; i < pos.length; i++) {
        const p = pos[i];
        bases.push({ x: p[0], y0: p[1], z: p[2], ph: rand() * 6.28, sp: rrange(0.5, 0.9), s: p[3] });
        setInst(mesh, i, p[0], p[1], p[2], 0, 0, 0, p[3], p[3], p[3]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      ambientDrones = { mesh, bases, obj: new THREE.Object3D() };
    })();

    // ── 3) GOD-RAY SHAFTS — faint additive cones of light over key spots. ──
    (function buildGodRays() {
      const geo = track(new THREE.ConeGeometry(10, 64, 12, 1, true));   // open-ended shaft
      const mat = track(new THREE.MeshBasicMaterial({
        color: 0xbfe6ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const im = new THREE.InstancedMesh(geo, mat, spots.length);
      im.name = 'ambient-godrays'; im.frustumCulled = false;
      for (let i = 0; i < spots.length; i++) {
        const x = spots[i][0], z = spots[i][1];
        setInst(im, i, x, heightAt(x, z) + 34, z, 0, rand() * Math.PI, 0, 1, 1, 1);
      }
      im.instanceMatrix.needsUpdate = true; group.add(im);
      // one shared material → pulse its opacity as a group (cheap; near-gated to plaza).
      godRays.push({ mat, base: 0.06, amp: 0.035, speed: 0.5, phase: 0, x: 0, z: 0, r2: 520 * 520 });
    })();
  })();

  // ══════════════════════════════════════════════════════════════════
  //  PERF: FREEZE STATIC TRANSFORMS
  //  Every prop here is placed ONCE (instanced props carry their placement in
  //  instanceMatrix; the object's own transform is identity). Only the void
  //  floaters/rifts animate their position/rotation. So stop three.js from
  //  recomposing local matrices from position/quat/scale for all the static
  //  objects each frame (30+ InstancedMeshes/Points/aurora/lights/water).
  //  Bakes each local matrix once; the animated void meshes keep auto-update.
  // ══════════════════════════════════════════════════════════════════
  (function freezeStatic() {
    var animated = new Set();
    for (var i = 0; i < voidFloaters.length; i++) animated.add(voidFloaters[i].m);
    group.matrixAutoUpdate = false; group.updateMatrix();     // group is identity
    for (var c = 0; c < group.children.length; c++) {
      var o = group.children[c];
      if (animated.has(o)) continue;                          // keep floaters live
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    }
  })();

  // ══════════════════════════════════════════════════════════════════
  //  UPDATE (allocation-free; only mutates pre-allocated arrays)
  // ══════════════════════════════════════════════════════════════════
  function update(t) {
    // arctic water ripples
    if (water) water.update(t);

    // emissive pulsers (MeshStandardMaterial)
    for (let i = 0; i < pulsers.length; i++) {
      const p = pulsers[i];
      p.mat.emissiveIntensity = p.base + Math.sin(t * p.speed) * p.amp;
    }

    // void floaters: shards + rift rings
    for (let i = 0; i < voidFloaters.length; i++) {
      const f = voidFloaters[i];
      f.m.position.y  = f.y0 + Math.sin(t * f.sp + f.ph) * 2.5;
      f.m.rotation.y  = t * f.sp * 0.5;
    }

    // forest fireflies: gentle drift on pre-allocated buffer
    for (let fi = 0; fi < forestFireflies.length; fi++) {
      const ff  = forestFireflies[fi];
      const arr = ff.attr.array;
      const ba  = ff.base;
      const ofs = ff.offsets;
      const n   = arr.length / 3;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        arr[i3]     = ba[i3]     + Math.sin(t * 0.70 + ofs[i3])     * 2.4;
        arr[i3 + 1] = ba[i3 + 1] + Math.sin(t * 0.90 + ofs[i3 + 1]) * 1.7;
        arr[i3 + 2] = ba[i3 + 2] + Math.cos(t * 0.60 + ofs[i3 + 2]) * 2.4;
      }
      ff.attr.needsUpdate = true;
    }

    // desert sand motes: slow wind drift, low to the ground
    for (let si = 0; si < desertSandMotes.length; si++) {
      const sm  = desertSandMotes[si];
      const arr = sm.attr.array;
      const ba  = sm.base;
      const wx  = Math.sin(t * 0.22) * 4.0;
      const wz  = Math.cos(t * 0.17) * 2.5;
      const n   = arr.length / 3;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const ph = i * 0.43;
        arr[i3]     = ba[i3]     + wx + Math.sin(t * 1.1 + ph) * 1.2;
        arr[i3 + 1] = ba[i3 + 1] + Math.sin(t * 0.8 + ph) * 0.45;
        arr[i3 + 2] = ba[i3 + 2] + wz + Math.cos(t * 0.9 + ph) * 1.0;
      }
      sm.attr.needsUpdate = true;
    }

    // aurora opacity shimmer
    for (let ai = 0; ai < auroraPlanes.length; ai++) {
      const a = auroraPlanes[ai];
      a.mat.opacity = Math.max(0.01, a.base + Math.sin(t * a.speed + a.phase) * a.amp);
    }

    // ── AMBIENT LIFE FX (distance-gated: skip while the player is far away) ──
    const pp = (typeof window !== 'undefined') ? window._playerPos : null;
    const near = (x, z, r2) => !pp || ((pp.x - x) * (pp.x - x) + (pp.z - z) * (pp.z - z) < r2);

    // plaza drift motes: gentle 3-axis wander on a pre-allocated buffer
    for (let mi = 0; mi < ambientMotes.length; mi++) {
      const m = ambientMotes[mi];
      if (!near(m.cx, m.cz, m.r2)) continue;
      const arr = m.attr.array, ba = m.base, of = m.offsets, n = arr.length / 3;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        arr[i3]     = ba[i3]     + Math.sin(t * 0.28 + of[i3])     * 3.2;
        arr[i3 + 1] = ba[i3 + 1] + Math.sin(t * 0.35 + of[i3 + 1]) * 2.0;
        arr[i3 + 2] = ba[i3 + 2] + Math.cos(t * 0.24 + of[i3 + 2]) * 3.2;
      }
      m.attr.needsUpdate = true;
    }

    // floating orbs: bob each on its own sine (only upload if some orb is near)
    if (ambientDrones) {
      const D = ambientDrones, bs = D.bases, o = D.obj;
      let dirty = false;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (!near(b.x, b.z, 260 * 260)) continue;
        o.position.set(b.x, b.y0 + Math.sin(t * b.sp + b.ph) * 3.0, b.z);
        o.rotation.set(0, t * b.sp * 0.4, 0);
        o.scale.set(b.s, b.s, b.s);
        o.updateMatrix(); D.mesh.setMatrixAt(i, o.matrix);
        dirty = true;
      }
      if (dirty) D.mesh.instanceMatrix.needsUpdate = true;
    }

    // god-ray shafts: slow additive opacity breathing (near-gated to the plaza)
    for (let gi = 0; gi < godRays.length; gi++) {
      const g = godRays[gi];
      if (!near(g.x, g.z, g.r2)) continue;
      g.mat.opacity = Math.max(0.01, g.base + Math.sin(t * g.speed + g.phase) * g.amp);
    }
  }

  function dispose() {
    for (let i = 0; i < disposables.length; i++) {
      if (disposables[i].dispose) disposables[i].dispose();
    }
    scene.remove(group);
  }

  console.log('[BENCH] world-biomes built in', Math.round(((performance || Date).now() - _t0)), 'ms');

  return { update, dispose };
};
