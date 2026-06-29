/* world-biomes.js — SHADDAI World 3D: BIOME PROPS + WATER + ATMOSPHERE module.
 *
 * This module owns PROPS, WATER, and per-biome LIGHTING — NOT the ground.
 * A separate terrain module owns the ground; call this AFTER terrain so props
 * sit on top. The arctic water plane sits at y≈0 in the arctic region.
 *
 * Usage (classic script, loaded after THREE + world-layout.js + terrain):
 *   const biomes = window.buildWorldBiomes(THREE, scene, window.WORLD_LAYOUT);
 *   // in your render loop:  biomes.update(elapsedSeconds);
 *
 * Returns: { update(t), dispose() }
 */
window.buildWorldBiomes = function (THREE, scene, layout) {
  layout = layout || window.WORLD_LAYOUT;

  // ── seeded PRNG (mulberry32) so the scatter is stable across reloads ──
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
  const pulsers = [];   // { mat, base, amp, speed }
  let water = null;     // { mesh, geo, base:Float32Array, update(t) }

  const biome = (id) => layout.biomes.find((b) => b.id === id);

  // clearance: skip sectors + world center so props don't bury buildings
  const CLEAR = 25;
  function blocked(x, z) {
    if (Math.hypot(x, z) < CLEAR) return true; // world center
    for (const s of layout.sectors) {
      if (Math.hypot(x - s.pos[0], z - s.pos[1]) < CLEAR) return true;
    }
    return false;
  }

  // pick a valid point inside a biome circle (a few tries, else null)
  function scatter(b, margin) {
    const r = b.radius - (margin || 0);
    for (let i = 0; i < 8; i++) {
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

  // ════════════════════════════ FOREST ════════════════════════════
  (function buildForest() {
    const b = biome('forest'); if (!b) return;
    const trunkGeo = track(new THREE.CylinderGeometry(0.7, 1.1, 9, 6));
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 }));
    const leafGeo = track(new THREE.ConeGeometry(4.2, 8, 7));
    const leafMat = track(new THREE.MeshStandardMaterial({
      color: 0x1f7a45, emissive: 0x3ddc84, emissiveIntensity: 0.35, roughness: 0.8, flatShading: true,
    }));
    pulsers.push({ mat: leafMat, base: 0.35, amp: 0.18, speed: 0.8 });

    for (let i = 0; i < 40; i++) {
      const p = scatter(b, 8); if (!p) continue;
      const s = rrange(0.7, 1.5);
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 4.5 * s; trunk.scale.setScalar(s);
      tree.add(trunk);
      const tiers = rand() < 0.5 ? 1 : 2;
      for (let k = 0; k < tiers; k++) {
        const cone = new THREE.Mesh(leafGeo, leafMat);
        cone.scale.setScalar(s * (1 - k * 0.3));
        cone.position.y = (9 + k * 5) * s;
        tree.add(cone);
      }
      tree.position.set(p[0], 0, p[1]);
      tree.rotation.y = rand() * Math.PI * 2;
      group.add(tree);
    }

    // floating spore points
    const N = 120, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * b.radius;
      pos[i * 3] = b.center[0] + Math.cos(a) * d;
      pos[i * 3 + 1] = rrange(2, 22);
      pos[i * 3 + 2] = b.center[1] + Math.sin(a) * d;
    }
    const sg = track(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sm = track(new THREE.PointsMaterial({
      color: 0x9bffce, size: 1.6, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    group.add(new THREE.Points(sg, sm));
    addBiomeLight(b, 1.1, 320);
  })();

  // ════════════════════════════ ARCTIC ════════════════════════════
  (function buildArctic() {
    const b = biome('arctic'); if (!b) return;
    const shardGeo = track(new THREE.IcosahedronGeometry(1, 0));
    const shardMat = track(new THREE.MeshStandardMaterial({
      color: 0x8fd0ff, emissive: 0x2a6fb0, emissiveIntensity: 0.25,
      roughness: 0.25, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.78,
    }));
    for (let i = 0; i < 25; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const m = new THREE.Mesh(shardGeo, shardMat);
      const h = rrange(4, 14);
      m.scale.set(rrange(2, 5), h, rrange(2, 5));
      m.position.set(p[0], h * 0.4, p[1]);
      m.rotation.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
      group.add(m);
    }

    // translucent animated WATER plane centered on arctic biome at y≈0
    const SEG = 48, SIZE = 220;
    const wgeo = track(new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG));
    wgeo.rotateX(-Math.PI / 2);
    const wmat = track(new THREE.MeshStandardMaterial({
      color: 0x1f7fc4, emissive: 0x0a3358, emissiveIntensity: 0.45,
      roughness: 0.06, metalness: 0.85, transparent: true, opacity: 0.78,
    }));
    const wmesh = new THREE.Mesh(wgeo, wmat);
    wmesh.position.set(b.center[0], 0.05, b.center[1]);
    group.add(wmesh);
    const wpos = wgeo.attributes.position;
    const base = new Float32Array(wpos.array.length);
    base.set(wpos.array);
    water = {
      mesh: wmesh, geo: wgeo, base,
      update(t) {
        const arr = wpos.array;
        for (let i = 0; i < arr.length; i += 3) {
          const x = base[i], z = base[i + 2];
          arr[i + 1] = base[i + 1]
            + Math.sin(x * 0.08 + t * 1.5) * 0.55
            + Math.cos(z * 0.07 - t * 1.2) * 0.5
            + Math.sin((x + z) * 0.15 + t * 2.3) * 0.22;   // finer chop
        }
        wpos.needsUpdate = true;
        wgeo.computeVertexNormals();
      },
    };
    addBiomeLight(b, 1.0, 320);
  })();

  // ════════════════════════════ DESERT ════════════════════════════
  (function buildDesert() {
    const b = biome('desert'); if (!b) return;
    const duneGeo = track(new THREE.SphereGeometry(1, 12, 8));
    const duneMat = track(new THREE.MeshStandardMaterial({
      color: 0xe8a445, roughness: 1, flatShading: true,
    }));
    for (let i = 0; i < 20; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const m = new THREE.Mesh(duneGeo, duneMat);
      const w = rrange(10, 26), h = rrange(2, 5);
      m.scale.set(w, h, w * rrange(0.7, 1.2));
      m.position.set(p[0], h * 0.2, p[1]);
      m.rotation.y = rand() * Math.PI;
      group.add(m);
    }
    // rock spikes
    const spikeGeo = track(new THREE.ConeGeometry(1.6, 7, 5));
    const spikeMat = track(new THREE.MeshStandardMaterial({
      color: 0x8a5a2a, roughness: 1, flatShading: true,
    }));
    for (let i = 0; i < 7; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const m = new THREE.Mesh(spikeGeo, spikeMat);
      const s = rrange(0.8, 1.8);
      m.scale.setScalar(s);
      m.position.set(p[0], 3.5 * s, p[1]);
      m.rotation.z = rrange(-0.2, 0.2);
      group.add(m);
    }
    addBiomeLight(b, 1.0, 320);
  })();

  // ════════════════════════════ VOID ════════════════════════════
  let voidFloaters = [];
  (function buildVoid() {
    const b = biome('void'); if (!b) return;
    const towerGeo = track(new THREE.CylinderGeometry(0.6, 2.4, 40, 6));
    const cMag = track(new THREE.MeshStandardMaterial({
      color: 0x2a0a3a, emissive: 0xd61fff, emissiveIntensity: 0.7, roughness: 0.5, flatShading: true,
    }));
    const cCyan = track(new THREE.MeshStandardMaterial({
      color: 0x0a2a3a, emissive: 0x1ff0ff, emissiveIntensity: 0.7, roughness: 0.5, flatShading: true,
    }));
    pulsers.push({ mat: cMag, base: 0.7, amp: 0.3, speed: 1.3 });
    pulsers.push({ mat: cCyan, base: 0.7, amp: 0.3, speed: 1.1 });
    for (let i = 0; i < 10; i++) {
      const p = scatter(b, 6); if (!p) continue;
      const s = rrange(0.7, 1.6);
      const m = new THREE.Mesh(towerGeo, rand() < 0.5 ? cMag : cCyan);
      m.scale.set(rrange(0.7, 1.3), s, rrange(0.7, 1.3));
      m.position.set(p[0], 20 * s, p[1]);
      group.add(m);
    }
    // slow-floating shards
    const shGeo = track(new THREE.OctahedronGeometry(1.6, 0));
    const shMat = track(new THREE.MeshStandardMaterial({
      color: 0x3a1a5a, emissive: 0x9b59f5, emissiveIntensity: 0.6, flatShading: true,
    }));
    const floaters = [];
    for (let i = 0; i < 14; i++) {
      const p = scatter(b, 4); if (!p) continue;
      const m = new THREE.Mesh(shGeo, shMat);
      m.scale.setScalar(rrange(0.8, 2.2));
      const y0 = rrange(8, 30);
      m.position.set(p[0], y0, p[1]);
      group.add(m);
      floaters.push({ m, y0, ph: rand() * Math.PI * 2, sp: rrange(0.4, 0.9) });
    }
    pulsers.push({ mat: shMat, base: 0.6, amp: 0.25, speed: 0.9 });
    voidFloaters = floaters;
    addBiomeLight(b, 1.2, 300);
  })();

  // ════════════════════════════ GRID ════════════════════════════
  (function buildGrid() {
    const b = biome('grid'); if (!b) return;
    const pyGeo = track(new THREE.CylinderGeometry(0.5, 0.8, 22, 6));
    const pyMat = track(new THREE.MeshStandardMaterial({
      color: 0x0a3a4a, emissive: 0x27e0ff, emissiveIntensity: 0.6, roughness: 0.4, flatShading: true,
    }));
    pulsers.push({ mat: pyMat, base: 0.6, amp: 0.35, speed: 1.6 });
    const ring = b.radius * 0.86;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.15;
      const x = b.center[0] + Math.cos(a) * ring;
      const z = b.center[1] + Math.sin(a) * ring;
      if (blocked(x, z)) continue;
      const m = new THREE.Mesh(pyGeo, pyMat);
      m.position.set(x, 11, z);
      group.add(m);
    }
    addBiomeLight(b, 0.9, 340);
  })();

  // ════════════════════════════ ANIMATE ════════════════════════════
  function update(t) {
    if (water) water.update(t);
    for (const p of pulsers) {
      p.mat.emissiveIntensity = p.base + Math.sin(t * p.speed) * p.amp;
    }
    for (const f of voidFloaters) {
      f.m.position.y = f.y0 + Math.sin(t * f.sp + f.ph) * 2.5;
      f.m.rotation.y = t * f.sp * 0.5;
    }
  }

  function dispose() {
    for (const d of disposables) { if (d.dispose) d.dispose(); }
    scene.remove(group);
  }

  return { update, dispose };
};
