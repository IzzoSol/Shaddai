// world-devkit.js — normal sanitizer (the zero-normal Bloom blow-out) + GLTFLoader patch + suspect cycling.
const THREE = require('../ual/node_modules/three/build/three.cjs');
const DK = require('../../public/world-devkit.js');
let ok = 0, bad = 0;
function t(n, c) { c ? ok++ : (bad++, console.log('FAIL', n)); }

// a box with poisoned buffers
const g = new THREE.BoxGeometry(1, 1, 1), n = g.attributes.normal.array, p = g.attributes.position.array;
for (let i = 0; i < 12; i++) n[i] = 0;          // 4 zero normals
p[5] = NaN;                                       // one NaN position
g.setAttribute('tangent', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(NaN), 4));
const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial()), grp = new THREE.Group(); grp.add(mesh, new THREE.Mesh(g, mesh.material));   // shared geometry counted once
const st = DK.sanitizeNormals(grp, THREE);
t('one geometry visited (shared)', st.meshes === 1);
t('NaN position zeroed', st.positions === 1 && p[5] === 0);
t('normals recomputed', st.recomputed === 1);
const a = g.attributes.normal.array; let allUnit = true;
for (let i = 0; i < a.length; i += 3) { const l = a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2]; if (!(Math.abs(l - 1) < 1e-3)) allUnit = false; }
t('every normal finite + unit length', allUnit);
t('NaN tangents removed', !g.attributes.tangent && st.tangents === 1);
// clean geometry is left alone
const clean = new THREE.SphereGeometry(1, 8, 6), st2 = DK.sanitizeNormals(new THREE.Mesh(clean), THREE);
t('clean geometry untouched', st2.recomputed === 0 && st2.positions === 0);

// GLTFLoader patch: wraps parse, sanitizes the scene, still calls onLoad once
function FakeLoader() { }
FakeLoader.prototype.parse = function (d, path, onLoad) { const gg = new THREE.BoxGeometry(); gg.attributes.normal.array.fill(0); onLoad({ scene: new THREE.Mesh(gg) }); };
const dk = DK.create({ THREE });
t('patch applies once', dk.patchGLTFLoader(FakeLoader) === true && dk.patchGLTFLoader(FakeLoader) === false);
let calls = 0, res = null; new FakeLoader().parse(null, '', r => { calls++; res = r; });
const nn = res.scene.geometry.attributes.normal.array;
t('loaded GLTF sanitized before onLoad, onLoad once', calls === 1 && dk.stats.gltfs === 1 && Math.abs(nn[0] * nn[0] + nn[1] * nn[1] + nn[2] * nn[2] - 1) < 1e-3);

// suspects: one OFF at a time, then all ON
const seen = { a: [], b: [] }; dk.suspect('a', v => seen.a.push(v)); dk.suspect('b', v => seen.b.push(v));
t('cycle 1 -> a off', dk.cycle() === 'a' && seen.a.at(-1) === false && seen.b.at(-1) === true);
t('cycle 2 -> b off', dk.cycle() === 'b' && seen.a.at(-1) === true && seen.b.at(-1) === false);
t('cycle 3 -> all on', dk.cycle() === null && seen.a.at(-1) === true && seen.b.at(-1) === true);
console.log(ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
