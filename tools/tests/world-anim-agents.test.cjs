'use strict';
/**
 * tools/tests/world-anim.test.cjs — the shared agent animation library (public/assets/anim/agent-clips.glb + .json)
 * and its runtime (public/world-anim.js), against the REAL three.js in tools/ual/node_modules.
 *   - the built GLB is loaded with three's GLTFLoader in node; the animator runs on three.cjs
 *   - real v6 rigs (fal-assets/characters/_m6/*, fal-assets/characters/shaddai) are loaded with their skins
 *     (textures stripped in memory with gltf-transform so node can parse them)
 * Run: node tools/tests/world-anim.test.cjs < /dev/null   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const v8 = require('v8');
const assert = require('assert');
const { pathToFileURL } = require('url');
const { PerformanceObserver } = require('perf_hooks');

const ROOT = path.join(__dirname, '..', '..');
const NM = path.join(ROOT, 'tools', 'ual', 'node_modules');
const THREE = require(path.join(NM, 'three', 'build', 'three.cjs'));
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/anim/agent-clips.json'), 'utf8'));
const GLB = path.join(ROOT, 'public/assets/anim/agent-clips.glb');
const BONES = META.skeleton.bones;
const RIGS = ['_m6/zerox/zerox-rigged.glb', '_m6/nexus/nexus-rigged.glb', '_m6/shaddai/shaddai-rigged.glb', '_m6/turtle/turtle-rigged.glb', 'shaddai/shaddai-rigged.glb']
  .map((r) => path.join(ROOT, 'fal-assets/characters', r)).filter((f) => fs.existsSync(f));

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + ((e && e.stack) || e)); }
}

// world-anim.js is a classic script: run it in a vm context that has a `window`
const sandbox = { window: {} }; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/world-anim.js'), 'utf8'), sandbox, { filename: 'world-anim.js' });
const buildAgentAnimator = sandbox.window.buildAgentAnimator;

let ESM, GLTFLoader, NodeIO, ALL_EXT, MESHOPT_ENC;
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const parse = (buf) => new Promise((res, rej) => new GLTFLoader().parse(ab(buf), '', res, rej));
// GLTFLoader builds ESM-three objects; re-create the clips on three.cjs so the mixer and clips share one THREE
const toCjsClip = (c) => THREE.AnimationClip.parse(ESM.AnimationClip.toJSON(c));
let MESHOPT = null;
async function loadRig(file) {
  const io = new NodeIO().registerExtensions(ALL_EXT).registerDependencies({ 'meshopt.decoder': MESHOPT, 'meshopt.encoder': MESHOPT_ENC }); const doc = await io.read(file);
  for (const n of ['EXT_meshopt_compression']) { const e = doc.getRoot().listExtensionsUsed().find((x) => x.extensionName === n); if (e) e.dispose(); }
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  const gltf = await parse(Buffer.from(await io.writeBinary(doc)));
  return gltf.scene;
}
const Y = new THREE.Vector3();
const wpos = (o, v = new THREE.Vector3()) => { o.updateWorldMatrix(true, false); return v.setFromMatrixPosition(o.matrixWorld); };

(async () => {
  ESM = await import(pathToFileURL(path.join(NM, 'three/build/three.module.js')).href);
  ({ GLTFLoader } = await import(pathToFileURL(path.join(NM, 'three/examples/jsm/loaders/GLTFLoader.js')).href));
  ({ NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core', { paths: [NM] })).href));
  ({ ALL_EXTENSIONS: ALL_EXT } = await import(pathToFileURL(require.resolve('@gltf-transform/extensions', { paths: [NM] })).href));
  const mo = await import(pathToFileURL(require.resolve('meshoptimizer', { paths: [NM] })).href);
  MESHOPT = mo.MeshoptDecoder; MESHOPT_ENC = mo.MeshoptEncoder; await MESHOPT.ready; await MESHOPT_ENC.ready;
  const lib = await parse(fs.readFileSync(GLB));
  const clips = lib.animations.map(toCjsClip);
  const clipBy = Object.fromEntries(clips.map((c) => [c.name, c]));
  const metaBy = Object.fromEntries(META.clips.map((c) => [c.name, c]));
  // the library's own skeleton (canonical ZEROX v6 bind) as a THREE.cjs scene — the synthetic 24-bone model
  lib.scene.updateMatrixWorld(true);   // GLTFLoader leaves .matrix stale until then; toJSON serialises .matrix
  const libJSON = lib.scene.toJSON();
  const makeLibModel = () => new THREE.ObjectLoader().parse(libJSON);

  console.log(`agent-clips.glb ${(fs.statSync(GLB).size / 1024).toFixed(0)} KB · ${clips.length} clips · rigs: ${RIGS.map((r) => path.relative(ROOT, r)).join(', ')}`);


  const WANT = Object.assign({ idle: META.locomotion.idle, walk: META.locomotion.walk, run: META.locomotion.run }, META.actions,
    { attack1: 'Left_Jab_from_Guard', attack2: 'Lunge_Spin_Kick', heavy: 'Sword_Heavy_Combo', kick: 'Large_step_then_high_kick', combo: 'Double_Combo_Attack' });
  const AG = path.join(ROOT, 'public/assets/agents');
  const files = fs.readdirSync(AG).filter((f) => /\.glb$/.test(f)).sort();
  const libModel = makeLibModel(), libMixer = new THREE.AnimationMixer(libModel);
  const LIMBS = { LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand' };
  const dirOf = (root, b, out) => out.copy(wpos(root.getObjectByName(LIMBS[b]))).sub(wpos(root.getObjectByName(b))).normalize();
  for (const f of files) {
    await test(f + ': every in-game action retargets cleanly (feet down, no NaN, limbs attached)', async () => {
      const scene = await loadRig(path.join(AG, f));
      let skinned = false; scene.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
      if (!skinned) { console.log('       (no skeleton - static model, skipped: ' + f + ')'); return; }
      const model = scene; model.updateMatrixWorld(true);
      const anim = buildAgentAnimator({ THREE, model, clips, meta: META });
      const bone = (n) => { let b = null; model.traverse((o) => { if (!b && o.isBone && o.name === n) b = o; }); return b; };
      const hips = bone('Hips'), lf = bone('LeftFoot'), rf = bone('RightFoot'), head = bone('Head'), lh = bone('LeftHand');
      model.updateMatrixWorld(true);
      const SEG = [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['neck', 'Head']].filter((p) => bone(p[0]) && bone(p[1]));
      const segLen = () => SEG.map((p) => wpos(bone(p[0])).distanceTo(wpos(bone(p[1]))));
      const rest = { foot: Math.min(wpos(lf).y, wpos(rf).y), head: wpos(head).y, seg: segLen() };
      const H = rest.head - rest.foot;
      const mixer = new THREE.AnimationMixer(model);
      for (const [k, name] of Object.entries(WANT)) {
        if (!name || !anim.has(name)) continue;
        const clip = anim.clip(name); assert.ok(clip, f + ' ' + k + ' -> ' + name + ' no clip');
        const act = mixer.clipAction(clip); mixer.stopAllAction(); act.reset().play(); let low = Infinity;
        for (let i = 0; i <= 6; i++) {
          mixer.setTime(clip.duration * i / 6); model.updateMatrixWorld(true);
          const pts = [hips, lf, rf, head, lh].map((b) => wpos(b));
          pts.forEach((p) => assert.ok(isFinite(p.x + p.y + p.z), f + ' ' + name + ' NaN bone'));
          segLen().forEach((L, i) => assert.ok(Math.abs(L - rest.seg[i]) < rest.seg[i] * 0.03 + 1e-4, f + ' ' + name + ' ' + SEG[i].join('-') + ' stretched ' + (L / rest.seg[i]).toFixed(3) + 'x'));
          const floorTags = ['idle', 'attack1', 'block'];   // hit leaves the ground by design; walk/run checked as a cycle below
          low = Math.min(low, pts[1].y, pts[2].y);
          if (floorTags.includes(k)) { const foot = Math.min(pts[1].y, pts[2].y);
            assert.ok(Math.abs(foot - rest.foot) < H * 0.08, f + ' ' + name + ' feet off the floor by ' + ((foot - rest.foot) / H * 100).toFixed(0) + '% of height'); }
        }
        if (['walk', 'run', 'attack1', 'attack2', 'kick', 'block', 'jumpStart'].includes(k)) {
          const la = libMixer.clipAction(clipBy[name]); libMixer.stopAllAction(); la.reset().play();
          for (const tt of [0.25, 0.5, 0.75]) { mixer.setTime(clip.duration * tt); libMixer.setTime(clip.duration * tt); model.updateMatrixWorld(true); libModel.updateMatrixWorld(true);
            for (const b of Object.keys(LIMBS)) { const ang = dirOf(model, b, new THREE.Vector3()).angleTo(dirOf(libModel, b, new THREE.Vector3())) * 57.3; assert.ok(ang < 4, f + ' ' + name + '@' + tt + ' ' + b + ' points ' + ang.toFixed(1) + ' deg off the library pose'); } }
        }
        if (k === 'walk' || k === 'run') assert.ok(Math.abs(low - rest.foot) < H * 0.05, f + ' ' + name + ' lowest foot over the cycle is ' + ((low - rest.foot) / H * 100).toFixed(0) + '% off the floor');
      }
    });
  }
  console.log(`
${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
