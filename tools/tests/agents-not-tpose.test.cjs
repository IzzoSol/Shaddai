'use strict';
/**
 * tools/tests/agents-not-tpose.test.cjs — regression guard: no agent may ever show the T-pose.
 * For every shipped public/assets/agents/<CODE>.glb: rigged (24 canonical bones), bakes idle/walk/run, and after the
 * mixer applies the idle the bones differ from the bind pose (arms come down from the T). Also runs the shared
 * library animator (world-anim.js) on each rig and checks the same.
 * Run: node tools/tests/agents-not-tpose.test.cjs < /dev/null
 */
const path = require('path'), fs = require('fs'), vm = require('vm'), assert = require('assert');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..'), NM = path.join(ROOT, 'tools', 'ual', 'node_modules');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/anim/agent-clips.json'), 'utf8'));
const AGENTS = ['ZEROX', 'TURTLE', 'PIKADON', 'QUILL', 'ORACLE', 'NEXUS', 'SHADDAI'];
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + ((e && e.stack) || e)); } }
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
(async () => {
  const T = await import(pathToFileURL(path.join(NM, 'three/build/three.module.js')).href);
  const { GLTFLoader } = await import(pathToFileURL(path.join(NM, 'three/examples/jsm/loaders/GLTFLoader.js')).href);
  const { NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core', { paths: [NM] })).href);
  const { ALL_EXTENSIONS } = await import(pathToFileURL(require.resolve('@gltf-transform/extensions', { paths: [NM] })).href);
  const { MeshoptDecoder } = require(path.join(NM, 'meshoptimizer'));
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const parse = (buf) => new Promise((res, rej) => new GLTFLoader().parse(ab(buf), '', res, rej));
  const load = async (file) => {   // textures stripped in memory (node has no image decoder); geometry + skin + clips intact
    const doc = await io.read(file); doc.getRoot().listExtensionsUsed().forEach((e) => e.dispose()); doc.getRoot().listTextures().forEach((t) => t.dispose()); doc.getRoot().listMaterials().forEach((m) => m.dispose());
    return parse(Buffer.from(await io.writeBinary(doc)));
  };
  const sandbox = { window: {} }; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/world-anim.js'), 'utf8'), sandbox);
  const lib = await parse(fs.readFileSync(path.join(ROOT, 'public/assets/anim/agent-clips.glb')));
  const bones = (root) => { const o = {}; root.traverse((n) => { if (n.isBone && META.skeleton.bones.includes(n.name)) o[n.name] = n; }); return o; };
  const maxDeg = (root, rest) => { let m = 0; const b = bones(root); for (const k in b) { const d = b[k].quaternion.angleTo(rest[k]) * 180 / Math.PI; if (d > m) m = d; } return m; };
  const armDeg = (root, rest) => { const b = bones(root); return Math.max(b.LeftArm.quaternion.angleTo(rest.LeftArm), b.RightArm.quaternion.angleTo(rest.RightArm)) * 180 / Math.PI; };
  const snap = (root) => { const o = {}, b = bones(root); for (const k in b) o[k] = b[k].quaternion.clone(); return o; };
  for (const code of AGENTS) {
    await test(`${code}: 24-bone rig, baked idle/walk/run, idle leaves the T-pose (arms move > 20 deg)`, async () => {
      const g = await load(path.join(ROOT, 'public/assets/agents', code + '.glb'));
      assert.strictEqual(Object.keys(bones(g.scene)).length, 24, 'canonical bones');
      let skinned = 0; g.scene.traverse((n) => { if (n.isSkinnedMesh) skinned++; }); assert.ok(skinned >= 1, 'skinned mesh');
      const names = g.animations.map((a) => a.name); for (const n of ['idle', 'walk', 'run']) assert.ok(names.includes(n), 'clip ' + n);
      const rest = snap(g.scene), mx = new T.AnimationMixer(g.scene);
      mx.clipAction(g.animations.find((a) => a.name === 'idle')).play(); mx.update(0.6);
      assert.ok(armDeg(g.scene, rest) > 20, 'arms still at T-pose: ' + armDeg(g.scene, rest).toFixed(1));
      assert.ok(maxDeg(g.scene, rest) > 20);
    });
    await test(`${code}: shared animator (world-anim.js) moves the rig off the bind pose and locomotion changes it`, async () => {
      const g = await load(path.join(ROOT, 'public/assets/agents', code + '.glb'));
      const rest = snap(g.scene);
      const a = sandbox.window.buildAgentAnimator({ THREE: T, model: g.scene, clips: lib.animations, meta: META });
      a.setLocomotion(0, true); for (let i = 0; i < 20; i++) a.update(1 / 60);
      assert.ok(armDeg(g.scene, rest) > 20, 'idle arms still T-pose');
      const idlePose = snap(g.scene);
      a.setLocomotion(1.7, true); for (let i = 0; i < 60; i++) a.update(1 / 60);
      assert.ok(maxDeg(g.scene, idlePose) > 3, 'walk pose == idle pose');
    });
  }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
