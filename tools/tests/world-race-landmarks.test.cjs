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
console.log(bad ? 'FAIL' : 'ok', ok, 'pass'); process.exit(bad ? 1 : 0);
