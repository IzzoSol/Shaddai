// node tools/ual/transit-kit-glb.test.mjs — K9 transit kit + K9b water link as the game uses them (REAL GLBs): the Colosseum metro hall swap
// (100 m along x, platform on -z, rails ALONG the hall over the trench) and the reef line pieces (18 m glass tube along z, shore portal).
import * as THREE from 'three'; import { GLTFLoader as GL } from 'three/examples/jsm/loaders/GLTFLoader.js'; import fs from 'node:fs'; import assert from 'node:assert';
globalThis.self = globalThis;
const load = (f) => new Promise((res, rej) => { const b = fs.readFileSync(new URL('../../public/assets/kits/' + f, import.meta.url)); new GL().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej); });
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const k9 = await load('shaddai_transit_kit_v01.glb'), wl = await load('shaddai_water_link_v01.glb');
const size = (o) => { const c = o.clone(true); c.position.set(0, 0, 0); c.updateMatrixWorld(true); return new THREE.Box3().setFromObject(c); };
t('metro hall: 100 m along x, ~24 m deep, platform hooks on -z', () => { const h = k9.scene.getObjectByName('metro_hall_100m'); const b = size(h), s = b.getSize(new THREE.Vector3()); assert(s.x > 99 && s.x < 103 && s.z < 30, s.toArray().join()); assert(h.getObjectByName('hook_board_point').position.z < 0); });
t('metro rails run ALONG the hall over the trench', () => { const hc = k9.scene.getObjectByName('metro_hall_100m').clone(true); hc.position.set(0, 0, 0); hc.updateMatrixWorld(true); const r = new THREE.Box3().setFromObject(hc.getObjectByName('metro_hall_rails')), s = r.getSize(new THREE.Vector3()), c = r.getCenter(new THREE.Vector3()); assert(s.x > 95 && s.z < 8, 'rails ' + s.toArray().join()); assert(c.z > 2 && c.z < 7, 'over the trench z ' + c.z); });
t('glass tube tile: 18 m along z (the host yaws it with atan2(dx,dz))', () => { const s = size(k9.scene.getObjectByName('glass_tube_18m')).getSize(new THREE.Vector3()); assert(Math.abs(s.z - 18) < 0.5 && s.x < 10); });
t('shore portal present', () => assert(wl.scene.getObjectByName('shore_portal')));
console.log(pass + ' passed, 0 failed');
