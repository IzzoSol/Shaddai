'use strict';
// tools/tests/world-riders.test.cjs — public/world-riders.js (generic mount + stance IK) against real three.js, riding
// an Object3D vehicle, the real hoverboard, the real dragon-ride core and the real Grid Bike (world-actions.js).
// Run: node tools/tests/world-riders.test.cjs < /dev/null
const path = require('path'), assert = require('assert');
const T = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
// world-actions.js builds a small DOM HUD — a stub is enough for veh.bike
const el = () => ({ style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, set textContent(v) {}, set innerHTML(v) {}, classList: { add() {}, remove() {}, contains() { return false; } } });
global.window = global;
global.document = { createElement: el, body: el(), getElementById: el, activeElement: null, addEventListener() {} };
global.addEventListener = () => {}; global.localStorage = { getItem() { return null; }, setItem() {} };
const PUB = path.join(__dirname, '..', '..', 'public');
require(path.join(PUB, 'world-actions.js'));           // window.WorldRiderPose + buildWorldActions (veh.bike)
require(path.join(PUB, 'world-hoverboards.js'));
require(path.join(PUB, 'world-hoverboard.js'));
require(path.join(PUB, 'world-riders.js'));
const RIDE = require(path.join(PUB, 'world-dragon-ride.js'));
const markers = require(path.join(PUB, 'assets', 'world', 'markers-v4.json')).markers;
const U = 7 / 1.8;
let pass = 0, fail = 0;
const test = (n, f) => { try { const i = f(); pass++; console.log('  ok  ' + n + (i ? '  — ' + i : '')); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); } };

let allocs = 0;
const CT = Object.assign({}, T);
['Vector3', 'Quaternion', 'Matrix4', 'Euler', 'Color', 'Box3', 'Object3D', 'Group', 'Mesh'].forEach(k => {
  CT[k] = class extends T[k] { constructor(...a) { super(...a); allocs++; } };
});

// ── a Meshy-style agent: the 24 joints of fal-assets/characters/zerox/zerox-rigged.glb under an Armature scaled 0.01 (cm), T-pose, 7 units tall, faces +Z ──
function meshyAgent(THREE) {
  const avatar = new THREE.Group(), model = new THREE.Group(); avatar.add(model);
  const arm = new THREE.Object3D(); arm.name = 'Armature'; arm.scale.setScalar(0.01); model.add(arm);
  const B = {};
  const bone = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); (parent ? B[parent] : arm).add(b); B[name] = b; return b; };
  bone('Hips', null, 0, 370, 0);
  bone('Spine02', 'Hips', 0, 25, 0); bone('Spine01', 'Spine02', 0, 45, 0); bone('Spine', 'Spine01', 0, 45, 0);
  bone('neck', 'Spine', 0, 90, 0); bone('Head', 'neck', 0, 35, 0); bone('head_end', 'Head', 0, 60, 0); bone('headfront', 'Head', 0, 20, 25);
  [['Left', 1], ['Right', -1]].forEach(([s, k]) => {
    bone(s + 'Shoulder', 'Spine', k * 25, 70, 0); bone(s + 'Arm', s + 'Shoulder', k * 35, 0, 0);
    bone(s + 'ForeArm', s + 'Arm', k * 100, 0, 0); bone(s + 'Hand', s + 'ForeArm', k * 90, 0, 0);
    bone(s + 'UpLeg', 'Hips', k * 40, -15, 0); bone(s + 'Leg', s + 'UpLeg', 0, -170, 0);
    bone(s + 'Foot', s + 'Leg', 0, -165, 0); bone(s + 'ToeBase', s + 'Foot', 0, -15, 40);
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 0.6)); body.position.y = 3.5; model.add(body);
  avatar.updateMatrixWorld(true);
  return { avatar, B };
}
const wp = (o, v) => (v || new T.Vector3()).setFromMatrixPosition(o.matrixWorld);

console.log('world-riders tests');

test('the synthetic agent really has the 24 Meshy bones', () => {
  const { B } = meshyAgent(T);
  assert.strictEqual(Object.keys(B).length, 24);
});

test('seat: rider stays on the seat while the vehicle drives, climbs and turns; limbs reach pegs', () => {
  const riders = window.buildRiders({ THREE: T });
  const car = new T.Group(); car.rotation.order = 'YXZ';
  riders.addSocket(car, 'seat', 0, 3, 0);
  const pegL = new T.Object3D(); pegL.position.set(0.8, 1.2, 1.4); car.add(pegL);
  const pegR = new T.Object3D(); pegR.position.set(-0.8, 1.2, 1.4); car.add(pegR);
  car.getObjectByName('seat').userData.pegL = pegL; car.getObjectByName('seat').userData.pegR = pegR;
  const { avatar, B } = meshyAgent(T);
  riders.mount(avatar, car, { seat: 'seat', instant: true });
  let worstHip = 0, worstQ = 0, worstFoot = 0;
  const sp = new T.Vector3(), sq = new T.Quaternion(), hq = new T.Quaternion(), hip = new T.Vector3(), foot = new T.Vector3(), tgt = new T.Vector3();
  for (let i = 0; i < 600; i++) {
    const t = i / 60;
    car.position.set(Math.sin(t * 0.7) * 80, 5 + t * 2, Math.cos(t * 0.7) * 80);
    car.rotation.set(Math.sin(t) * 0.15, t * 0.7 + Math.PI / 2, Math.cos(t * 1.3) * 0.25, 'YXZ');
    car.updateMatrixWorld(true);
    riders.update(1 / 60);
    const s = car.getObjectByName('seat'); s.matrixWorld.decompose(sp, sq, tgt);
    wp(B.Hips, hip);
    const up = new T.Vector3(0, 1, 0).applyQuaternion(sq);
    worstHip = Math.max(worstHip, hip.distanceTo(sp.clone().addScaledVector(up, 0.08 * U)) / U);
    worstQ = Math.max(worstQ, avatar.quaternion.angleTo(sq));
    if (i > 30) { wp(B.LeftFoot, foot); wp(pegL, tgt); worstFoot = Math.max(worstFoot, foot.distanceTo(tgt) / U); }
  }
  assert(riders.isMounted(avatar));
  assert(worstHip < 0.05, 'hips drift ' + worstHip.toFixed(3) + ' m');
  assert(worstQ < 0.36, 'rider not aligned with the seat: ' + worstQ.toFixed(3));   // ≤ default side-lean (0.3) + tuck
  assert(worstFoot < 0.2, 'foot off the peg by ' + worstFoot.toFixed(3) + ' m');
  return 'hip drift ' + (worstHip * 100).toFixed(1) + ' cm, foot ' + (worstFoot * 100).toFixed(1) + ' cm';
});

test('lean + crouch blend from input tilts the spine and the root', () => {
  const riders = window.buildRiders({ THREE: T });
  const v = new T.Group(); riders.addSocket(v, 'seat', 0, 3, 0); v.updateMatrixWorld(true);
  const { avatar, B } = meshyAgent(T);
  riders.mount(avatar, v, { seat: 'seat', instant: true });
  riders.update(1 / 60);
  const head0 = wp(B.Head).clone();
  riders.setInput(avatar, 1, 1);
  for (let i = 0; i < 5; i++) riders.update(1 / 60);
  const head1 = wp(B.Head);
  assert(head1.x < head0.x - 0.3, 'lean right moves the head right (−X): ' + head0.x.toFixed(2) + ' → ' + head1.x.toFixed(2));
  assert(head1.z > head0.z + 0.3, 'crouch tucks forward');
});

test('saddle: the player agent is visibly ON the dragon through a flight (dragon-ride core)', () => {
  const H = markers.find(m => m.name === 'VEH_DRAGON_HARNESS').pos_m;
  const playerPos = { x: H[0] * U, y: 6 * U, z: -H[1] * U };      // stand at the harness (metres → units)
  const ride = RIDE.createRideCore({ heightAt: () => 6 * U, playerPos, markers, tune: { arriveTime: 0 } });
  assert(ride.mount('tamed'), 'mount refused: ' + ride.lastRefusal());
  const riders = window.buildRiders({ THREE: T });
  const { avatar, B } = meshyAgent(T);
  avatar.visible = false;
  const dv = riders.dragonVehicle(ride);
  let worst = 0, n = 0;
  const hip = new T.Vector3(), sp = new T.Vector3(), sq = new T.Quaternion();
  for (let i = 0; i < 900; i++) {
    const I = { fwd: i < 600, climb: i > 60 && i < 300, left: i > 300 && i < 500, right: false, back: false, dive: false };
    ride.update(1 / 60, I);
    riders.sync(avatar, ride.isRiding(), dv, 'saddle');
    riders.update(1 / 60);
    if (i > 30) { dv.socket('saddle', sp, sq); wp(B.Hips, hip); worst = Math.max(worst, hip.distanceTo(sp) / U); n++; }
  }
  assert(avatar.visible, 'rider must be visible on the dragon');
  assert(ride.state() !== 'ground', 'should be flying: ' + ride.state());
  assert(worst < 0.3, 'hips off the saddle by ' + worst.toFixed(3) + ' m');
  const l = wp(B.LeftFoot), r = wp(B.RightFoot), c = wp(B.Hips);
  assert(l.distanceTo(r) > 0.6 * U, 'legs straddle (feet ' + (l.distanceTo(r) / U).toFixed(2) + ' m apart)');
  assert(l.y < c.y && r.y < c.y, 'feet hang below the hips');
  ride.dismount && ride.state() === 'ground' && ride.dismount();
  return 'saddle drift ≤ ' + (worst * 100).toFixed(1) + ' cm over ' + n + ' frames, state ' + ride.state();
});

test('bike: the player agent is visibly ON the Grid Bike (veh.bike physics + riders seat)', () => {
  const scene = new T.Scene();
  const gridBike = new T.Group();                        // stand-in for the host's primitive light-cycle (same extents)
  const box = new T.Mesh(new T.BoxGeometry(0.42, 1.2, 3.95)); box.position.set(0, 0.7, -0.05); gridBike.add(box);
  scene.add(gridBike);
  const { avatar, B } = meshyAgent(T);
  const veh = window.buildWorldActions({ THREE: T, scene, loader: null, playerPosGetter: () => pos, isShift: () => false,
    bikeMesh: gridBike, avatar: null, heightAt: () => 2 * U, getColliders: () => [] });
  const pos = new T.Vector3(0, 0, 0), vel = { x: 0, z: 0 };
  const riders = window.buildRiders({ THREE: T });
  const bv = riders.bikeVehicle(gridBike, veh.bike.points, veh.bike);
  let worst = 0;
  const hip = new T.Vector3(), sp = new T.Vector3(), sq = new T.Quaternion(), grip = new T.Vector3(), hand = new T.Vector3();
  for (let i = 0; i < 400; i++) {
    const o = veh.bike.step(1 / 60, { riding: true, throttle: 1, steer: i > 200 ? 1 : 0, camYaw: i / 200, pos, vel });
    vel.x = o.vx; vel.z = o.vz;
    veh.bike.pose(1 / 60, { groundY: 2 * U });
    riders.sync(avatar, veh.bike.isRiding(), bv, 'seat', { visible: true });
    riders.update(1 / 60);
    if (i > 30) { bv.socket('seat', sp, sq); wp(B.Hips, hip); worst = Math.max(worst, hip.distanceTo(sp.addScaledVector(new T.Vector3(0, 1, 0).applyQuaternion(sq), 0.08 * U)) / U); }
  }
  const vRide = veh.bike.speedMS();
  assert(vRide > 10, 'bike should be moving: ' + vRide.toFixed(1));
  assert(avatar.visible && riders.isMounted(avatar));
  assert(worst < 0.05, 'hips off the bike seat by ' + worst.toFixed(3) + ' m');
  wp(B.LeftHand, hand); wp(gridBike.getObjectByName('gripL'), grip);
  assert(hand.distanceTo(grip) < 0.15 * U, 'left hand on the grip (' + (hand.distanceTo(grip) / U).toFixed(2) + ' m)');
  // dismount blends off, then the rig is handed back (bones restored, handle released)
  for (let i = 0; i < 40; i++) { veh.bike.step(1 / 60, { riding: false, throttle: 0, steer: 0, camYaw: 0, pos, vel }); riders.sync(avatar, veh.bike.isRiding(), bv, 'seat'); riders.update(1 / 60); }
  assert(!riders.isMounted(avatar) && riders.count() === 0);
  return 'seat drift ' + (worst * 100).toFixed(1) + ' cm at ' + vRide.toFixed(1) + ' m/s';
});

test('stand: a companion stands on a flying hoverboard (kit stand socket) through spins', () => {
  const scene = new T.Scene(), playerPos = new T.Vector3();
  const hover = window.buildWorldHoverboard({ THREE: T, scene, playerPos, heightAt: () => 0, worldHalf: 1e7, colliders: [] });
  hover.mount(null, { yaw: 0 });
  const riders = window.buildRiders({ THREE: T, scene });
  const h = riders.spawnCompanion('zerox', hover.board, 'stand', {});
  assert(h && h.stanceId === 'stand');
  const IN = o => Object.assign({ fwd: false, back: false, left: false, right: false, boost: false, jump: false }, o || {});
  let worst = 0; const sp = new T.Vector3(), sq = new T.Quaternion(), p = new T.Vector3();
  for (let i = 0; i < 300; i++) {
    hover.update(1 / 60, IN({ fwd: true, jump: i < 80, left: i > 90 && i < 120 }), 0);
    riders.update(1 / 60);
    riders.vehicle(hover.board).socket('stand', sp, sq);
    worst = Math.max(worst, h.rider.position.distanceTo(sp) / U);    // capsule placeholder: root sits on the deck
  }
  assert(worst < 1e-3, 'companion off the deck by ' + worst.toFixed(4) + ' m');
  assert(h.rider.parent === scene && h.rider.getObjectByName('rider-placeholder'), 'placeholder capsule until the GLB lands');
});

test('companion on a sky-traffic ship follows the ship; adoptModel swaps in a rigged body', () => {
  const riders = window.buildRiders({ THREE: T, scene: new T.Scene(), cloneSkinned: s => s });
  const geo = new T.BoxGeometry(2, 1, 4);
  const ship = { x: 100, y: 300, z: -50, heading: 0.3, bank: 0.2, type: { def: { scale: 2 }, mesh: { geometry: geo } } };
  const h = riders.spawnCompanion('ORACLE', riders.skyShipVehicle(ship), 'seat');
  const sp = new T.Vector3(), sq = new T.Quaternion();
  const sv = riders.handle(h.rider).vehicle;
  const { avatar } = meshyAgent(T);
  riders.adoptModel(h.rider, { scene: avatar.children[0], animations: [] });
  for (let i = 0; i < 120; i++) {
    ship.x += 1; ship.heading += 0.01; ship.y = 300 + Math.sin(i / 10);
    riders.update(1 / 60);
  }
  sv.socket('seat', sp, sq);
  assert(sp.y > ship.y, 'seat is on top of the hull');
  let hips = null; h.rider.traverse(o => { if (o.name === 'Hips') hips = o; });
  assert(hips, 'rigged body adopted');
  const hp = wp(hips);
  assert(hp.distanceTo(sp) < 0.6 * U, 'companion hips near the ship seat: ' + (hp.distanceTo(sp) / U).toFixed(2) + ' m');
});

test('no allocation: riders.update over seat + saddle + stand riders builds no THREE objects', () => {
  const riders = window.buildRiders({ THREE: CT });
  const car = new T.Group(); riders.addSocket(car, 'seat', 0, 3, 0);
  const H = markers.find(m => m.name === 'VEH_DRAGON_HARNESS').pos_m;
  const ride = RIDE.createRideCore({ heightAt: () => 6 * U, playerPos: { x: H[0] * U, y: 6 * U, z: -H[1] * U }, markers, tune: { arriveTime: 0 } });
  assert(ride.mount('tamed'));
  const a = meshyAgent(T), b = meshyAgent(T), c = meshyAgent(T);
  const board = new T.Group(); riders.addSocket(board, 'stand', 0, 0.5, 0);
  riders.mount(a.avatar, car, { seat: 'seat', instant: true });
  riders.mount(b.avatar, riders.dragonVehicle(ride), { seat: 'saddle', instant: true });
  riders.mount(c.avatar, board, { seat: 'stand', instant: true });
  const frame = i => { car.position.x = i; car.rotation.y = i * 0.01; car.updateMatrixWorld(true); board.position.z = i; board.updateMatrixWorld(true);
    ride.update(1 / 60, { fwd: true }); riders.setInput(a.avatar, Math.sin(i), 0.5); riders.update(1 / 60); };
  for (let i = 0; i < 60; i++) frame(i);
  allocs = 0;
  for (let i = 60; i < 660; i++) frame(i);
  assert.strictEqual(allocs, 0, allocs + ' THREE objects allocated in 600 frames');
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
