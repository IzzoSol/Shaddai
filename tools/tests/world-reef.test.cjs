/* world-reef.test.cjs — the reef station module: draw budget, pod layout, placement on the water, dispose. Run: node tools/tests/world-reef.test.cjs */
const assert = require('assert'), path = require('path');
const THREE = require(path.join(__dirname, '../ual/node_modules/three/build/three.cjs'));
const WorldReef = require(path.join(__dirname, '../../public/world-reef.js'));

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + e.message); } }

const U = 7 / 1.8;                       // the host's units per metre (V4_U)
const flatWater = (x, z) => 0.5 * U;     // a calm sheet of water at 0.5 m

t('builds the station group with the expected parts', () => {
  const scene = new THREE.Scene();
  const r = WorldReef.create({ THREE, scene, U, x: 0, z: 0, waterY: flatWater });
  assert.strictEqual(r.group.name, 'reef-station');
  assert.ok(scene.children.includes(r.group), 'added to the scene');
  assert.strictEqual(WorldReef.PODS.length, 5, 'five pods');
});

t('draw budget stays under 16 (5 pods + 5 glass bands + deck + rail + piles)', () => {
  const r = WorldReef.create({ THREE, scene: null, U, x: 0, z: 0, waterY: flatWater });
  assert.ok(r.draws <= 16, 'draws=' + r.draws);
  assert.strictEqual(r.draws, 5 + 5 + 1 + 1 + 1 + 1, 'exact count (5 pods, 5 glass, deck, walkways, rail, piles)');
});

t('pods sit on the water surface plus their height offset, not underground', () => {
  const r = WorldReef.create({ THREE, scene: null, U, x: 0, z: 0, waterY: flatWater });
  const pods = r.group.children.filter(c => c.geometry && c.geometry.type === 'SphereGeometry');
  assert.strictEqual(pods.length, 5);
  pods.forEach(p => assert.ok(p.position.y >= 0.5 * U, 'pod above water, y=' + p.position.y));
});

t('pods are flattened domes: scale y is 0.45 of the radius', () => {
  const r = WorldReef.create({ THREE, scene: null, U, x: 0, z: 0, waterY: flatWater });
  const pod = r.group.children.find(c => c.geometry && c.geometry.type === 'SphereGeometry');
  assert.ok(Math.abs(pod.scale.y / pod.scale.x - 0.45) < 1e-6, 'ratio ' + (pod.scale.y / pod.scale.x));
});

t('placement follows the given centre', () => {
  const r = WorldReef.create({ THREE, scene: null, U, x: 300, z: -120, waterY: flatWater });
  const pod = r.group.children.find(c => c.geometry && c.geometry.type === 'SphereGeometry');
  assert.ok(Math.abs(pod.position.x - 300) < 1e-6 && Math.abs(pod.position.z + 120) < 1e-6, 'pod at (' + pod.position.x + ',' + pod.position.z + ')');
});

t('dispose releases geometry and removes the group', () => {
  const scene = new THREE.Scene();
  const r = WorldReef.create({ THREE, scene, U, x: 0, z: 0, waterY: flatWater });
  r.dispose();
  assert.ok(!scene.children.includes(r.group), 'removed from scene');
});

t('hero pod (Blender GLB geometry) is scaled uniformly by radius, not flattened twice', () => {
  const hero = new THREE.SphereGeometry(1, 16, 8);   // stands in for the flattened Blender dome
  const r = WorldReef.create({ THREE, scene: null, U, x: 0, z: 0, waterY: flatWater, podGeometry: hero });
  const pod = r.group.children.find(c => c.geometry === hero);
  assert.ok(pod, 'hero geometry used for pods');
  assert.ok(Math.abs(pod.scale.y / pod.scale.x - 1) < 1e-6, 'hero y/x ratio ' + (pod.scale.y / pod.scale.x));
});

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
