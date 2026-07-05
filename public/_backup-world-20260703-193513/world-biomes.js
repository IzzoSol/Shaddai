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

  let water = null;  // { geo, base:Float32Array, update(t) }

  const biome = (id) => layout.biomes.find((b) => b.id === id);

  // ── clearance: skip sectors + world centre so props don't bury buildings ──
  const CLEAR = 25;
  function blocked(x, z) {
    if (Math.hypot(x, z) < CLEAR) return true;
    for (const s of layout.sectors) {
      if (Math.hypot(x - s.pos[0], z - s.pos[1]) < CLEAR) return true;
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

    // ── TREES (instanced trunks + 2 leaf tiers) ──────────────────────
    const trunkGeo = track(new THREE.CylinderGeometry(0.55, 1.0, 9, 6));
    trunkGeo.translate(0, 4.5, 0);
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 }));

    const leafGeoLo = track(new THREE.ConeGeometry(4.4, 8, 7));
    leafGeoLo.translate(0, 11, 0);
    const leafGeoHi = track(new THREE.ConeGeometry(3.1, 6.5, 7));
    leafGeoHi.translate(0, 15.5, 0);
    const leafMat = track(new THREE.MeshStandardMaterial({
      color: 0x1f7a45, emissive: 0x3ddc84, emissiveIntensity: 0.28,
      roughness: 0.8, flatShading: true,
    }));
    pulsers.push({ mat: leafMat, base: 0.28, amp: 0.12, speed: 0.8 });

    const trunks  = new THREE.InstancedMesh(trunkGeo,  trunkMat, COUNT);
    const leavesL = new THREE.InstancedMesh(leafGeoLo, leafMat,  COUNT);
    const leavesH = new THREE.InstancedMesh(leafGeoHi, leafMat,  COUNT);
    trunks.castShadow = leavesL.castShadow = leavesH.castShadow = true;
    trunks.name = 'forest-trunks';

    for (let i = 0; i < COUNT; i++) {
      const x = placed[i][0], z = placed[i][1];
      const s = rrange(0.7, 1.5);
      _pos.set(x, heightAt(x, z) - 0.2, z);
      _quat.setFromAxisAngle(_up, rand() * Math.PI * 2);
      _scl.setScalar(s);
      _m.compose(_pos, _quat, _scl);
      trunks.setMatrixAt(i, _m);
      leavesL.setMatrixAt(i, _m);
      leavesH.setMatrixAt(i, _m);
    }
    trunks.instanceMatrix.needsUpdate  = true;
    leavesL.instanceMatrix.needsUpdate = true;
    leavesH.instanceMatrix.needsUpdate = true;
    group.add(trunks, leavesL, leavesH);

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
    // PERF: SEG 64→48. The wave field is low-frequency (shortest wavelength
    // ≈ 2π/0.19 ≈ 33u; at 48 segs a cell is 220/48 ≈ 4.6u — still ~7 samples
    // per shortest wave), so the animated silhouette is visually unchanged while
    // per-frame vertex work AND the every-frame computeVertexNormals() cost
    // (which scales with face count) drop ~44%.
    const SEG = 48, SIZE = 220, HALF = SIZE / 2;
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
    const DUNE = 24;
    const duneGeo = track(new THREE.SphereGeometry(1, 10, 6));
    const duneMat = track(new THREE.MeshStandardMaterial({
      color: 0xe8a445, roughness: 1, flatShading: true,
    }));
    const dunes = new THREE.InstancedMesh(duneGeo, duneMat, DUNE);
    let dunec = 0;
    for (let i = 0; dunec < DUNE && i < DUNE * 8; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const w = rrange(10, 26), h = rrange(2, 5);
      setInst(dunes, dunec,
        p[0], heightAt(p[0], p[1]) + h * 0.18, p[1],
        0, rand() * Math.PI, 0,
        w, h, w * rrange(0.7, 1.2));
      dunec++;
    }
    dunes.count = dunec;
    dunes.instanceMatrix.needsUpdate = true;
    group.add(dunes);

    // ── ROCK SPIKES (instanced cones) ─────────────────────────────────
    const SPIKE = 18;
    const spkGeo = track(new THREE.ConeGeometry(1.6, 7, 5));
    const spkMat = track(new THREE.MeshStandardMaterial({
      color: 0x8a5a2a, roughness: 1, flatShading: true,
    }));
    const spikes = new THREE.InstancedMesh(spkGeo, spkMat, SPIKE);
    let spkc = 0;
    for (let i = 0; spkc < SPIKE && i < SPIKE * 8; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const s = rrange(0.8, 1.8);
      setInst(spikes, spkc,
        p[0], heightAt(p[0], p[1]) + 3.5 * s, p[1],
        0, rand() * Math.PI * 2, rrange(-0.2, 0.2),
        s, s, s);
      spkc++;
    }
    spikes.count = spkc;
    spikes.instanceMatrix.needsUpdate = true;
    group.add(spikes);

    // ── CACTI (instanced body + two arm cylinders, shared material) ───
    const CACT = 22;
    const cBodyGeo = track(new THREE.CylinderGeometry(0.55, 0.70, 8, 6));
    cBodyGeo.translate(0, 4, 0);
    const cArmLGeo = track(new THREE.CylinderGeometry(0.32, 0.38, 4, 5));
    cArmLGeo.rotateZ(Math.PI / 2.2);
    cArmLGeo.translate(-3.0, 4.5, 0);
    const cArmRGeo = track(new THREE.CylinderGeometry(0.32, 0.38, 4, 5));
    cArmRGeo.rotateZ(-Math.PI / 2.2);
    cArmRGeo.translate(3.0, 5.5, 0);
    const cMat = track(new THREE.MeshStandardMaterial({
      color: 0x3a7a30, emissive: 0x1a4a18, emissiveIntensity: 0.08, roughness: 0.95,
    }));
    const cBody = new THREE.InstancedMesh(cBodyGeo, cMat, CACT);
    const cArmL = new THREE.InstancedMesh(cArmLGeo, cMat, CACT);
    const cArmR = new THREE.InstancedMesh(cArmRGeo, cMat, CACT);
    let cc = 0;
    for (let i = 0; cc < CACT && i < CACT * 12; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const s = rrange(0.6, 1.4);
      setInst(cBody, cc, p[0], heightAt(p[0], p[1]), p[1],
              0, rand() * Math.PI * 2, 0, s, s, s);
      cArmL.setMatrixAt(cc, _m);
      cArmR.setMatrixAt(cc, _m);
      cc++;
    }
    cBody.count = cArmL.count = cArmR.count = cc;
    cBody.instanceMatrix.needsUpdate = true;
    cArmL.instanceMatrix.needsUpdate = true;
    cArmR.instanceMatrix.needsUpdate = true;
    group.add(cBody, cArmL, cArmR);

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
    for (let i = 0; i < 14; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const m = new THREE.Mesh(shGeo, shMat);
      m.scale.setScalar(rrange(0.8, 2.2));
      const y0 = rrange(8, 30);
      m.position.set(p[0], y0, p[1]);
      group.add(m);
      voidFloaters.push({ m, y0, ph: rand() * Math.PI * 2, sp: rrange(0.4, 0.9) });
    }

    // ── FLOATING DEBRIS (instanced small boxes at mid-air) ────────────
    const DEBRIS = 32;
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
    const PANEL = 18;
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

    addBiomeLight(b, 0.9, 340);
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
  }

  function dispose() {
    for (let i = 0; i < disposables.length; i++) {
      if (disposables[i].dispose) disposables[i].dispose();
    }
    scene.remove(group);
  }

  return { update, dispose };
};
