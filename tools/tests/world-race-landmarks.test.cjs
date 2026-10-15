const vm = require('vm'), fs = require('fs');
const THREE = require('../ual/node_modules/three/build/three.cjs');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }
const canvasStub = { getContext: () => ({ fillRect() { }, strokeRect() { }, fillText() { } }), width: 0, height: 0 };
const ctx = { console, THREE, document: { createElement: () => Object.assign({}, canvasStub) } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['world-race.js', 'world-race-landmarks.js']) vm.runInContext(fs.readFileSync('public/' + f, 'utf8'), ctx);
const WR = ctx.WorldRace, U = 7 / 1.8;
const C = WR.CIRCUITS['dragon-gate'];
t('circuit registered', !!C && C.laps === 3 && C.gates.length >= 8);
t('track has 72 points and a real length near 1.57 km', WR.trackWorld('dragon-gate', U).length === 72 && Math.abs(WR.trackLengthM('dragon-gate') - C.lengthM) < 30);
const pts = WR.trackWorld('dragon-gate', 1);
const dx = pts[18].x - pts[54].x, dz = pts[18].z - pts[54].z;   // the two passes through the middle land on the same spot
t('figure-8: the two lobes meet at one junction', Math.hypot(dx, dz) < 1 && Math.hypot(pts[0].x - pts[36].x, pts[0].z - pts[36].z) > 400);
const scene = new THREE.Scene(); const L = ctx.buildRaceLandmarks({ THREE, scene, heightAt: () => 0, WorldRace: WR });
t('landmarks built', !!L && scene.children.includes(L.group));
let meshes = 0; L.group.traverse(o => { if (o.isMesh) meshes++; });
t('draw calls stay small (<= 140 meshes)', meshes > 20 && meshes <= 140);
const cones = L.group.children.find(c => c.isInstancedMesh); t('14 start cones in one instanced mesh', cones && cones.count === 14);
L.dispose(); t('disposes', !scene.children.includes(L.group));
t('start/finish: checkered line across the ribbon, an 8-slot staggered grid behind it, and arches at the city circuits', () => {
  const scene = new THREE.Scene(), L = ctx.buildRaceLandmarks({ THREE, scene, heightAt: () => 0, WorldRace: WR }); const sfs = []; L.group.traverse(o => { if (o.name && o.name.indexOf('start-finish') === 0) sfs.push(o); });
  assert(sfs.length >= 3, 'dragon gate + quarter loop + grid ring: ' + sfs.length); const g = sfs[0]; const slots = g.children.find(c => c.isInstancedMesh); assert(slots && slots.count === 8, '8 grid slots');
  const m = new THREE.Matrix4(), v = new THREE.Vector3(); let behind = 0; for (let i = 0; i < 8; i++) { slots.getMatrixAt(i, m); v.setFromMatrixPosition(m); if (v.z < 0) behind++; } assert.strictEqual(behind, 8, 'the whole grid is BEHIND the line (local -z)');
  const arch = sfs.find(o => o.name === 'start-finish:quarter-loop'); assert(arch); const banners = arch.children.filter(c => c.geometry && c.geometry.type === 'PlaneGeometry' && Math.abs(c.position.y - 9.9 * 7 / 1.8) < 1e-6); assert.strictEqual(banners.length, 2, 'banner front + back'); assert(banners.every(b => b.material.side === THREE.FrontSide)); assert(Math.abs(Math.abs(banners[0].rotation.y - banners[1].rotation.y) - Math.PI) < 1e-9);
  const line = g.children.find(c => c.geometry && c.geometry.type === 'PlaneGeometry' && c.rotation.x < -1.5); assert(line && Math.abs(line.geometry.parameters.width - 8 * 7 / 1.8) < 1e-6, 'line spans the 8 m ribbon');
  let meshes = 0; L.group.traverse(o => { if (o.isMesh || o.isInstancedMesh) meshes++; }); assert(meshes < 200, 'draw-call budget ' + meshes); L.dispose();
});
t('track edge lines: two bright kerb strips run the whole circuit, 4 m either side of the centre line', () => {
  const scene = new THREE.Scene(), L = ctx.buildRaceLandmarks({ THREE, scene, heightAt: () => 0, WorldRace: WR }), edges = L.group.children.filter(c => c.name === 'track-edge'); assert.strictEqual(edges.length, 2);
  const pts = WR.trackWorld('dragon-gate', U); edges.forEach(e => { const pos = e.geometry.attributes.position; let nearest = 1e9, far = 0; for (let i = 0; i < pos.count; i += 2) { const x = pos.getX(i), z = pos.getZ(i); let d = 1e9; for (const p of pts) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); nearest = Math.min(nearest, d); far = Math.max(far, d); } assert(far < 4.6 * U && far > 3.0 * U, 'kerb distance ' + (far / U).toFixed(1) + ' m'); assert(e.material.opacity > 0.8); });
  L.dispose();
});
console.log(bad ? 'FAIL' : 'ok', ok, 'pass'); process.exit(bad ? 1 : 0);
