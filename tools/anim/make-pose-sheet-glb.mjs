// SHADDAI · make-pose-sheet-glb.mjs — the poses for the animation contact sheet (docs/img/anim-sheet-v1.png).
//
//   node tools/anim/make-pose-sheet-glb.mjs [rig.glb] [out.glb]
//
// Samples a few library clips THROUGH public/world-anim.js (the same retarget the game uses) on a real rig, and
// writes the rig (mesh + skin) with one 2-key "pose" animation per clip, named "NN_Clip@time". Blender then only
// has to assign an action — no retargeting there. Render with tools/anim/render-anim-sheet.py.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UAL = path.join(ROOT, 'tools/ual');
const req = createRequire(path.join(UAL, 'package.json'));
const { NodeIO } = await import(pathToFileURL(req.resolve('@gltf-transform/core')).href);
const THREE = await import(pathToFileURL(path.join(UAL, 'node_modules/three/build/three.module.js')).href);
const { GLTFLoader } = await import(pathToFileURL(path.join(UAL, 'node_modules/three/examples/jsm/loaders/GLTFLoader.js')).href);

const RIG = process.argv[2] || path.join(ROOT, 'fal-assets/characters/_m6/zerox/zerox-rigged.glb');
const OUT = process.argv[3] || path.join(os.tmpdir(), 'shaddai-anim-sheet-poses.glb');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/anim/agent-clips.json'), 'utf8'));
const mb = Object.fromEntries(META.clips.map((c) => [c.name, c]));
// [clip, time]: mid-frame, except the kick and the slash, which show their (guessed) hit frame
const POSES = [
  ['Walking', mb.Walking.duration / 2], ['Running', mb.Running.duration / 2],
  ['NinjaJump_Start', mb.NinjaJump_Start.duration / 2], ['Roll', mb.Roll.duration / 2],
  ['Step_in_High_Kick', mb.Step_in_High_Kick.hitTimes[0]], ['Charged_Upward_Slash', mb.Charged_Upward_Slash.hitTimes[0]],
  ['Idle_No_Loop', mb.Idle_No_Loop.duration / 2], ['Sit_Chair_Loop', 0.5],
];

const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const parse = (b) => new Promise((res, rej) => new GLTFLoader().parse(ab(b), '', res, rej));
const io = new NodeIO();
const lib = await parse(fs.readFileSync(path.join(ROOT, 'public/assets/anim/agent-clips.glb')));
const doc = await io.read(RIG);
// a texture-free copy for three in node (skins + nodes are all the sampler needs)
const light = await io.read(RIG);
for (const t of light.getRoot().listTextures()) t.dispose();
for (const m of light.getRoot().listMaterials()) m.dispose();
const rig = (await parse(Buffer.from(await io.writeBinary(light)))).scene;

const sb = { window: {} }; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/world-anim.js'), 'utf8'), sb);
const anim = sb.window.buildAgentAnimator({ THREE, model: rig, clips: lib.animations, meta: META });
const mixer = new THREE.AnimationMixer(rig);

const nodeBy = Object.fromEntries(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
for (const a of doc.getRoot().listAnimations()) a.dispose();
const buffer = doc.getRoot().listBuffers()[0];
const times = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1 / 30])).setBuffer(buffer);
POSES.forEach(([name, t], k) => {
  const c = anim.clip(name); const act = mixer.clipAction(c).play();
  mixer.setTime(t);
  const an = doc.createAnimation(String(k).padStart(2, '0') + '_' + name + '@' + t.toFixed(2));
  for (const b of META.skeleton.bones) {
    const o = rig.getObjectByName(b), n = nodeBy[b];
    const add = (pathName, v, type) => {
      const out = doc.createAccessor().setType(type).setArray(new Float32Array([...v, ...v])).setBuffer(buffer);
      const s = doc.createAnimationSampler().setInput(times).setOutput(out).setInterpolation('LINEAR');
      an.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath(pathName).setSampler(s));
    };
    add('rotation', o.quaternion.toArray(), 'VEC4');
    if (b === 'Hips') add('translation', o.position.toArray(), 'VEC3');
  }
  act.stop(); mixer.uncacheClip(c);
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, await io.writeBinary(doc));
fs.writeFileSync(OUT.replace(/\.glb$/, '.json'), JSON.stringify(POSES.map(([n, t]) => ({ clip: n, t: +t.toFixed(2) }))));
console.log(`${POSES.length} poses -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB) · retargeted=${anim.retargeted}`);
