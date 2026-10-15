// node tools/tests/world-interiors-furnish.test.mjs — agent-room furniture plans (world-interiors.js furnishRoom), fake library, no browser
import * as THREE from '../../public/vendor/three/three.module.js';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; globalThis.THREE = THREE;
require('../../public/world-interiors.js'); const I = globalThis._interiorFurnish;
let pass = 0; const t = async (n, fn) => { await fn(); pass++; console.log('  ok ', n); };
const KIT = 'anvil-station arcade-cabinet bar-counter bed-pod broadcast-desk casino-table ceiling-light class-desk-row comms-console counter desk gallery-frame grow-rack holo-shelf hydro-station lectern lift mail-terminal meeting-table planter rug server-rack shelf sofa stall stash terminal wardrobe workbench'.split(' ');
let resolveLib; const lib = { kinds: [], _p: null, meta: (k) => ({ footprint_m: [1.5, 1], height_m: k === 'ceiling-light' ? 0.4 : 1.2 }), build: (k) => (KIT.includes(k) ? new THREE.Group() : null) };

await t('every one of the 7 agents has a plan, and every kind exists in the Blender furniture kit', () => {
  assert.deepStrictEqual(Object.keys(I.FURNISH).sort(), ['NEXUS', 'ORACLE', 'PIKADON', 'QUILL', 'SHADDAI', 'TURTLE', 'ZEROX']);
  Object.values(I.FURNISH).forEach((plan) => plan.forEach((it) => assert(KIT.includes(it[0]), 'missing kind ' + it[0])));
});
await t('library loads late: room furnishes once it lands, scaled to units, inside the 80x80 room, floor or ceiling', async () => {
  const g = new THREE.Group(); I.furnishRoom(g, 'NEXUS'); assert.strictEqual(g.children.length, 0);   // no library yet
  lib._p = new Promise((r) => { resolveLib = r; }); globalThis.SHADDAI_FURNITURE = lib;
  await new Promise((r) => setTimeout(r, 2100)); lib.kinds = KIT; resolveLib(KIT.length); await lib._p; await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(g.children.length, I.FURNISH.NEXUS.length + 4);
  g.children.forEach((o) => { near(o.scale.x, 7 / 1.8); assert(Math.abs(o.position.x) < 40 && Math.abs(o.position.z) < 40, o.name); assert(o.position.y === 0 || o.position.y > 15, o.name); });
});
function near(a, b) { assert(Math.abs(a - b) < 1e-6, a + ' != ' + b); }
console.log(`${pass} passed, 0 failed`); process.exit(0);
