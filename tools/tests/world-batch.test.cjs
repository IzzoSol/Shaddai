// node tools/tests/world-batch.test.cjs — static batcher: merges by material/shadow/cell, bakes world matrices exactly, skips moving/skinned/instanced/custom meshes
const assert = require('assert'), path = require('path'); global.window = global;
const T = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs')); require('../../public/world-batch.js'); const B = global.WorldBatch, U = 7 / 1.8;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const matA = new T.MeshLambertMaterial({ color: 0xff0000 }), matB = new T.MeshLambertMaterial({ color: 0x00ff00 });
const box = (m, x, y, z, s) => { const o = new T.Mesh(new T.BoxGeometry(1, 1, 1), m); o.position.set(x, y, z); if (s) o.scale.setScalar(s); o.rotation.y = x * 0.1; return o; };
const worldVerts = (meshes) => { const out = []; meshes.forEach(m => { m.updateMatrixWorld(true); const p = m.geometry.attributes.position, v = new T.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); out.push([+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)].join(',')); } }); return out.sort(); };
t('merges many small same-material meshes into one, preserving every vertex in world space (nested groups, rotations, scales)', () => {
  const scene = new T.Scene(), g = new T.Group(); g.name = 'hoverpark'; g.position.set(10, 2, -5); g.rotation.y = 0.7; scene.add(g);
  const list = []; for (let i = 0; i < 30; i++) { const b = box(matA, i % 6, Math.floor(i / 6), 0, 0.5 + (i % 3) * 0.2); const sub = new T.Group(); sub.position.set(0, 0.3, i * 0.2); sub.add(b); g.add(sub); list.push(b); }
  scene.updateMatrixWorld(true); const before = worldVerts(list); const rep = B.mergeMeshes(T, scene, B.collect(scene)); assert.strictEqual(rep.merged, 30); assert.strictEqual(rep.groups, 1); assert.strictEqual(rep.drawCallsSaved, 29);
  const merged = g.children.filter(c => c.name.startsWith('batched:')); assert.strictEqual(merged.length, 1); assert.strictEqual(g.children.filter(c => !c.name.startsWith('batched:')).reduce((n, c) => n + c.children.length, 0), 0, 'originals removed'); assert.deepStrictEqual(worldVerts(merged), before);
  assert.strictEqual(merged[0].geometry.index.count, 30 * 36); assert.strictEqual(merged[0].material, matA, 'material shared, not cloned');
});
t('different materials, shadow flags and far-apart map cells stay separate draw calls (culling still works)', () => {
  const scene = new T.Scene(), G = new T.Group(); scene.add(G); for (let i = 0; i < 4; i++) G.add(box(matA, i, 0, 0)); for (let i = 0; i < 4; i++) G.add(box(matB, i, 0, 0)); for (let i = 0; i < 3; i++) { const b = box(matA, i, 1, 0); b.castShadow = true; G.add(b); }
  for (let i = 0; i < 3; i++) G.add(box(matA, 5000 * U + i, 0, 0));
  const rep = B.mergeMeshes(T, scene, B.collect(scene)); assert.strictEqual(rep.groups, 4, 'A / B / A+shadow / A far away'); assert.strictEqual(rep.merged, 14);
});
t('never merges: skinned, instanced, multi-material, custom userData, frustumCulled=false, non-default layers, invisible, lone meshes', () => {
  const scene = new T.Scene(), G = new T.Group(); scene.add(G); const add = (m) => { G.add(m); return m; };
  const sk = add(new T.SkinnedMesh(new T.BoxGeometry(1, 1, 1), matA)); const inst = add(new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), matA, 3)); const multi = add(new T.Mesh(new T.BoxGeometry(1, 1, 1), [matA, matB]));
  const ud = add(box(matA, 0, 0, 0)); ud.userData.doorIdx = 1; const nc = add(box(matA, 1, 0, 0)); nc.frustumCulled = false; const ly = add(box(matA, 2, 0, 0)); ly.layers.set(2); const hid = add(box(matA, 3, 0, 0)); hid.visible = false; const lone = add(box(matB, 99, 0, 0));
  const plain1 = add(box(matA, 4, 0, 0)), plain2 = add(box(matA, 5, 0, 0)); const list = B.collect(scene); assert.deepStrictEqual(list.sort(), [lone, plain1, plain2].sort());
  const rep = B.mergeMeshes(T, scene, list); assert.strictEqual(rep.merged, 2, 'the lone mesh has no partner'); assert(G.children.includes(sk) && G.children.includes(inst) && G.children.includes(multi) && G.children.includes(lone));
});
t('denied top-level owners (terrain, water, vehicles, trains, crops, characters, grass) are skipped; the Sky Dock and unnamed groups are batched', () => {
  const scene = new T.Scene(); const mk = (name) => { const g = new T.Group(); g.name = name; for (let i = 0; i < 4; i++) g.add(box(matA, i, 0, 0)); scene.add(g); return g; };
  ['world-terrain-v4', 'world-water', 'world-transit', 'farm-patch', 'hovercar-traffic', 'player-avatar', 'world-grass'].forEach(mk); mk('sky-dock'); mk('');
  const list = B.collect(scene); assert.strictEqual(list.length, 8, 'only sky-dock + unnamed (4 + 4)');
});
t('run(): meshes that MOVE during the settle window are left alone, static ones merge; report is complete', async () => {
  const scene = new T.Scene(), G = new T.Group(), still = [], mover = []; scene.add(G); for (let i = 0; i < 6; i++) { const s = box(matA, i, 0, 0), m = box(matA, i, 3, 0); G.add(s); G.add(m); still.push(s); mover.push(m); }
  const iv = setInterval(() => { mover.forEach(m => { m.position.y += 0.05; }); }, 20);
  const rep = await B.run({ THREE: T, scene, settleMs: 400 }); clearInterval(iv); assert.strictEqual(rep.merged, 6); assert.strictEqual(rep.skippedMoving, 6); assert.strictEqual(rep.candidates, 12); assert(mover.every(m => m.parent === G), 'movers untouched');
});
t('merged meshes live under the ORIGINAL owner: hiding the owner hides them, moving the owner moves them (interiors hide the building you enter); direct scene meshes are never merged', () => {
  const scene = new T.Scene(), G = new T.Group(); G.position.set(40, 0, 0); scene.add(G); for (let i = 0; i < 6; i++) G.add(box(matA, i, 0, 0)); const lone = [box(matA, 0, 5, 0), box(matA, 1, 5, 0)]; lone.forEach(m => scene.add(m));
  const rep = B.mergeMeshes(T, scene, B.collect(scene)); assert.strictEqual(rep.merged, 6); const bm = G.children.find(c => c.name.startsWith('batched:')); assert(bm && bm.parent === G); assert(lone.every(m => m.parent === scene), 'direct scene meshes untouched');
  G.visible = false; assert(!bm.visible || !G.visible); G.visible = true; G.position.x = 100; G.updateMatrixWorld(true); const c = new T.Vector3(); new T.Box3().setFromObject(bm).getCenter(c); assert(c.x > 100 && c.x < 108, 'follows the owner: ' + c.x);
});
setTimeout(() => console.log(pass + ' passed'), 700);
