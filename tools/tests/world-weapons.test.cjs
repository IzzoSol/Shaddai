'use strict';
// tools/tests/world-weapons.test.cjs — public/world-weapons.js against real three.js. Run: node tools/tests/world-weapons.test.cjs < /dev/null
const path = require('path'), fs = require('fs'), assert = require('assert'), v8 = require('v8'), vm = require('vm');
v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
const T = require(path.join(__dirname, '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
global.window = {}; require(path.join(__dirname, '..', '..', 'public', 'world-weapons.js'));
let pass = 0, fail = 0; const test = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); } };
const AG = window.WEAPON_AGENTS, W = {};
// THREE behind a proxy so update() touching THREE.* at all (i.e. constructing anything) is caught
let watching = false, touched = [];
const TP = new Proxy(T, { get(t, k) { if (watching) touched.push(String(k)); return t[k]; } });
const tris = (g) => { let n = 0; g.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); }); return n; };

test('all 7 agents build', () => {
  assert.deepStrictEqual(AG, ['zerox', 'nexus', 'pikadon', 'oracle', 'turtle', 'quill', 'shaddai']);
  AG.forEach(a => { const w = W[a] = window.buildAgentWeapon({ THREE: TP, agent: a }); assert(w.group.isGroup && w.grip.isObject3D && typeof w.update === 'function', a); });
  assert.throws(() => window.buildAgentWeapon({ THREE: T, agent: 'nobody' }));
});
test('triangle budget < 3k each', () => AG.forEach(a => { const n = tris(W[a].group); assert(n < 3000 && n > 60, a + ' ' + n); console.log('       ' + a + ': ' + n + ' tris'); }));
test('no textures anywhere (procedural materials only)', () => AG.forEach(a => W[a].group.traverse(o => { if (o.material) ['map', 'normalMap', 'emissiveMap', 'roughnessMap'].forEach(k => assert(!o.material[k], a + ' ' + k)); })));
test('grip point sits inside the handle', () => AG.forEach(a => {
  const w = W[a]; assert(w.handleBox && !w.handleBox.isEmpty(), a + ' handleBox');
  assert(w.handleBox.containsPoint(w.grip.position), a + ' grip ' + w.grip.position.toArray() + ' not in ' + w.handleBox.min.toArray() + '..' + w.handleBox.max.toArray());
}));
test('sizes are plausible metres', () => {
  const len = a => { const b = new T.Box3().setFromObject(W[a].group); return b.max.y - b.min.y; };
  assert(len('zerox') > 0.9 && len('zerox') < 1.1, 'katana ' + len('zerox'));
  assert(len('oracle') > 1.4 && len('oracle') < 1.7, 'staff ' + len('oracle'));
  assert(len('pikadon') > 0.9 && len('pikadon') < 1.3, 'hammer ' + len('pikadon'));
});
test('emissive mats exposed (MeshStandard + emissive), glow reacts to state', () => AG.forEach(a => {
  const w = W[a]; assert(w.emissiveMats.length >= 1, a);
  w.emissiveMats.forEach(m => assert(m.isMeshStandardMaterial && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0, a));
  for (let i = 0; i < 60; i++) w.update(1 / 60, 'idle'); const lo = w.emissiveMats[0].emissive.r + w.emissiveMats[0].emissive.g + w.emissiveMats[0].emissive.b;
  for (let i = 0; i < 60; i++) w.update(1 / 60, 'attack'); const hi = w.emissiveMats[0].emissive.r + w.emissiveMats[0].emissive.g + w.emissiveMats[0].emissive.b;
  assert(hi > lo * 2, a + ' ' + lo + ' → ' + hi);
  const ei = w.emissiveMats.map(m => m.emissiveIntensity); w.update(0.016, 'charge'); assert.deepStrictEqual(w.emissiveMats.map(m => m.emissiveIntensity), ei, 'update must not fight the day/night ramp');
}));
test('ZEROX arcs: pooled lines, visible when attacking, none when idle', () => {
  const w = W.zerox; assert(w.arcs.pool.length >= 5);
  for (let i = 0; i < 30; i++) w.update(1 / 60, 'attack'); assert(w.arcs.pool.some(a => a.line.visible));
  for (let i = 0; i < 60; i++) w.update(1 / 60, 'idle'); assert(w.arcs.pool.every(a => !a.line.visible));
  const bb = new T.Box3(); w.arcs.pool.forEach(a => { for (let k = 0; k < a.arr.length; k += 3) if (a.arr[k + 1]) bb.expandByPoint(new T.Vector3(a.arr[k], a.arr[k + 1], a.arr[k + 2])); });
  assert(bb.min.y >= 0.1 && bb.max.y <= 0.83 && Math.abs(bb.min.x) < 0.05, 'arcs hug the blade');
});
test('NEXUS beam: hidden idle/charge, shown on attack, length settable', () => {
  const w = W.nexus; w.update(0.016, 'charge'); assert(!w.beam.visible); w.beamLength = 20; w.update(0.016, 'attack'); assert(w.beam.visible && w.beam.scale.y === 20); w.update(0.016, 'drawn'); assert(!w.beam.visible);
});
test('QUILL ink trail appears on attack and fades after', () => {
  const w = W.quill; for (let i = 0; i < 20; i++) { w.group.rotation.z = i * 0.1; w.update(1 / 60, 'attack'); } assert(w.trail.visible);
  for (let i = 0; i < 200; i++) w.update(1 / 60, 'idle'); assert(!w.trail.visible); w.group.rotation.set(0, 0, 0);
});
test('TURTLE flail verlet stays bounded under abuse', () => {
  const w = W.turtle, c = w.chain, st = ['idle', 'drawn', 'attack', 'charge'];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let f = 0; f < 4000; f++) {
    if (f % 7 === 0) { w.group.position.set((rnd() - 0.5) * 40, (rnd() - 0.5) * 40, (rnd() - 0.5) * 40); w.group.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); }
    if (f === 2000) w.group.scale.setScalar(7 / 1.8);
    const dt = f % 97 === 0 ? 5 : f % 53 === 0 ? -1 : f % 31 === 0 ? NaN : rnd() * 0.05;
    w.update(dt, st[(f >> 6) % 4]);
    for (let i = 0; i < c.count; i++) {
      const x = c.points[i * 3] - c.anchor.x, y = c.points[i * 3 + 1] - c.anchor.y, z = c.points[i * 3 + 2] - c.anchor.z, d = Math.hypot(x, y, z);
      assert(Number.isFinite(d) && d <= i * c.linkLength * c.scale * 1.001 + 1e-4, 'frame ' + f + ' pt ' + i + ' d=' + d);
    }
  }
  w.group.position.set(0, 0, 0); w.group.rotation.set(0, 0, 0); w.group.scale.setScalar(1);
  for (let i = 0; i < 600; i++) w.update(1 / 60, 'idle');
  const tip = c.points[(c.count - 1) * 3 + 1] - c.anchor.y; assert(tip < -c.length * 0.9, 'hangs under gravity ' + tip);
});
test('update() allocates nothing (no THREE access, flat heap)', () => {
  const states = ['idle', 'drawn', 'attack', 'charge'];
  const run = (n) => { for (let i = 0; i < n; i++) for (const a of AG) { W[a].group.rotation.y = i * 0.01; W[a].update(1 / 60, states[(i >> 5) & 3]); } };
  run(3000); touched = []; watching = true; run(200); watching = false;
  assert.strictEqual(touched.length, 0, 'update touched THREE.' + touched.slice(0, 5).join(', THREE.'));
  gc(); gc(); const h0 = process.memoryUsage().heapUsed; run(20000); gc(); gc(); const dh = process.memoryUsage().heapUsed - h0;
  console.log('       heap delta over 140k updates: ' + (dh / 1024).toFixed(1) + ' KB');
  assert(dh < 256 * 1024, 'heap grew ' + dh);
});

// ── bones: real Meshy v6 rigs, parsed from the GLB JSON chunk (no loader, no browser) ─────────────────
function rigFromGlb(file, rootScale) {
  const b = fs.readFileSync(file), j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
  const joints = new Set(); (j.skins || []).forEach(s => s.joints.forEach(i => joints.add(i)));
  const objs = j.nodes.map((n, i) => { const o = joints.has(i) ? new T.Bone() : new T.Object3D(); o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); return o; });
  j.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const root = new T.Group(); j.scenes[0].nodes.forEach(i => root.add(objs[i])); root.scale.setScalar(rootScale || 1); root.updateMatrixWorld(true);
  return { root, names: j.nodes.filter((n, i) => joints.has(i)).map(n => n.name) };
}
const RIGS = ['zerox', 'nexus'].map(a => path.join(__dirname, '..', '..', 'fal-assets', 'characters', '_m6', a, a + '-rigged.glb'));
test('real Meshy v6 bone names: RightHand/LeftHand found, grip lands on the hand, blade points forward', () => {
  RIGS.forEach(f => {
    const { root, names } = rigFromGlb(f); console.log('       ' + path.basename(f) + ': ' + names.join(' '));
    assert(names.includes('RightHand'));
    assert.strictEqual(window.findHandBone(root, 'right').name, 'RightHand'); assert.strictEqual(window.findHandBone(root, 'left').name, 'LeftHand');
    const w = window.buildAgentWeapon({ THREE: T, agent: 'zerox' }), att = window.attachWeapon(w, root, { hand: 'right' });
    assert(att && att.hand.name === 'RightHand' && att.chest.name === 'Spine', 'chest ' + (att && att.chest && att.chest.name));
    root.updateMatrixWorld(true);
    const g = w.grip.getWorldPosition(new T.Vector3()), h = att.hand.getWorldPosition(new T.Vector3()), d = g.distanceTo(h);
    assert(d > 0.05 && d < 0.13, 'grip ' + d.toFixed(3) + ' m from wrist');
    const tip = w.group.localToWorld(new T.Vector3(0, 0.8, 0)).sub(g).normalize();
    assert(tip.dot(att.forward) > 0.9, 'blade forward ' + tip.dot(att.forward));
    const bb = new T.Box3().setFromObject(w.group); assert(bb.max.y - bb.min.y < 1.2 && bb.getSize(new T.Vector3()).length() > 0.9, 'metre scale on a cm-armature');
    window.sheatheWeapon(w); root.updateMatrixWorld(true);
    const sg = w.grip.getWorldPosition(new T.Vector3()), ch = att.chest.getWorldPosition(new T.Vector3());
    assert(w.group.parent === att.backMount && sg.distanceTo(ch) < 0.35 && sg.clone().sub(ch).dot(att.forward) < -0.05, 'sheathed on the back');
    window.drawWeapon(w); assert(w.group.parent === att.handMount && w.drawn);
  });
});
test('host-scaled body (U = 7/1.8 units/m): weapon scales with it; NEXUS points along the arm', () => {
  const U = 7 / 1.8, { root } = rigFromGlb(RIGS[1], U), w = window.buildAgentWeapon({ THREE: T, agent: 'nexus' }), att = window.attachWeapon(w, root, {});
  root.updateMatrixWorld(true);
  const a = att.hand.getWorldPosition(new T.Vector3()).sub(att.forearm.getWorldPosition(new T.Vector3())).normalize();
  const bar = w.group.localToWorld(new T.Vector3(0, 0.18, 0)).sub(w.group.localToWorld(new T.Vector3())).normalize();
  assert(bar.dot(a) > 0.99, 'barrel along forearm ' + bar.dot(a));
  const len = w.group.localToWorld(new T.Vector3(0, 1, 0)).distanceTo(w.group.localToWorld(new T.Vector3())); assert(Math.abs(len - U) < 1e-3, 'scale ' + len);
  window.sheatheWeapon(w); assert(w.group.parent === att.handMount, 'wrist cannon stays on the arm');
  const s = window.buildAgentWeapon({ THREE: T, agent: 'shaddai' }); window.attachWeapon(s, root, { hand: 'left', sheathed: true });
  assert(!s.group.visible && s._att.hand.name === 'LeftHand'); window.drawWeapon(s); assert(s.group.visible);
});
test('Mixamo, UAL2, Blender, Biped naming + named-socket fallback', () => {
  const mk = (names) => { const r = new T.Group(); let p = r; names.forEach(n => { const b = new T.Bone(); b.name = n; b.position.set(0, 0.1, 0); p.add(b); p = b; }); return r; };
  assert.strictEqual(window.findHandBone(mk(['mixamorig:Hips', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand', 'mixamorig:RightHandIndex1']), 'right').name, 'mixamorig:RightHand');
  assert.strictEqual(window.findHandBone(mk(['mixamorig1_Hips', 'mixamorig1_LeftHand']), 'left').name, 'mixamorig1_LeftHand');
  assert.strictEqual(window.findHandBone(mk(['pelvis', 'spine_01', 'spine_03', 'upperarm_r', 'lowerarm_r', 'hand_r', 'index_01_r']), 'right').name, 'hand_r');
  assert.strictEqual(window.findHandBone(mk(['pelvis', 'upperarm_l', 'lowerarm_l', 'hand_l']), 'left').name, 'hand_l');
  assert.strictEqual(window.findHandBone(mk(['root', 'hand.R', 'hand.L']), 'right').name, 'hand.R');
  assert.strictEqual(window.findHandBone(mk(['Bip01', 'Bip01 R Hand']), 'right').name, 'Bip01 R Hand');
  const sock = new T.Group(); const o = new T.Object3D(); o.name = 'socket_hand_r'; sock.add(o); assert.strictEqual(window.findHandBone(sock, 'right'), o);
  const custom = new T.Group(); const c = new T.Object3D(); c.name = 'GunMount'; custom.add(c); assert.strictEqual(window.findHandBone(custom, 'right', 'GunMount'), c);
  assert.strictEqual(window.findHandBone(mk(['Hips', 'Spine', 'Head']), 'right'), null);
  const w = window.buildAgentWeapon({ THREE: T, agent: 'oracle' }); assert.strictEqual(window.attachWeapon(w, mk(['Hips', 'Head'])), null);
  const w2 = window.buildAgentWeapon({ THREE: T, agent: 'pikadon' }), att = window.attachWeapon(w2, mk(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'upperarm_r', 'lowerarm_r', 'hand_r']));
  assert(att && att.hand.name === 'hand_r' && att.chest.name === 'spine_03');
});
test('palette override recolours the glow', () => {
  const w = window.buildAgentWeapon({ THREE: T, agent: 'zerox', palette: { glow: 0xff0000 } }); w.update(0.5, 'drawn');
  const e = w.emissiveMats.find(m => m.emissive.r > 0); assert(e.emissive.r > 0 && e.emissive.g === 0 && e.emissive.b === 0);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
