// SHADDAI · bake-agent-clips.mjs — bake the shared agent library (public/assets/anim/agent-clips.glb) INTO each council GLB.
//
//   cd tools/ual && node bake-agent-clips.mjs [CODE ...]        (default: the 7 council agents)
//
// Why: the council GLBs were replaced on 2026-10-17 with clean source rigs whose only clip is a T-pose bind layer (or a
// deforming Meshy walk). In-game the body then sat in that clip until the async library retarget landed, and the UAL
// direction-retarget (ual-retarget.js — aims bones but not their roll) raced it, twisting forearms/hands. Here the SAME
// retarget the game and tools/tests/world-anim-agents use (world-anim.js: rotation tracks + Hips position only, so bone
// lengths never change) is run once, offline, and written into the file as plain named clips: idle/walk/run/attack1/...
// Mesh, skin, textures, meshopt + quantization are kept as-is (gltf-transform round trip). The original clips are dropped;
// the untouched original is copied to fal-assets/backups/agents-pre-bake-<date>/ first.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AG = path.join(ROOT, 'public/assets/agents');
const BACKUP = path.join(ROOT, 'fal-assets/backups/agents-pre-bake-20261022');
// args: CODE (in-place council agent, backed up) or SRC=OUT (any rigged GLB -> a new finalized file; SRC is never written)
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--')).length ? process.argv.slice(2).filter((a) => !a.startsWith('--')) : ['SHADDAI', 'ZEROX', 'NEXUS', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
const JOBS = ARGS.map((a) => a.includes('=') ? { code: path.basename(a.split('=')[1], '.glb'), file: path.resolve(ROOT, a.split('=')[0]), out: path.resolve(ROOT, a.split('=')[1]) } : { code: a, file: path.join(AG, a + '.glb'), out: null });
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/anim/agent-clips.json'), 'utf8'));
// --idle=<library clip> swaps the standing idle for this run (long-armed bots read wrong with folded arms)
// the exact clip map the game uses (SHADDAI-WORLD-3D.html _fillAgentClipsFromLibrary + _AGENT_LIB_ATTACKS)
const WANT = Object.assign({ idle: META.locomotion.idle, walk: META.locomotion.walk, run: META.locomotion.run }, META.actions,
  { idle: (process.argv.find((a) => a.startsWith('--idle=')) || '--idle=Idle_FoldArms_Loop').slice(7), attack1: 'Left_Jab_from_Guard', attack2: 'Lunge_Spin_Kick', heavy: 'Sword_Heavy_Combo', kick: 'Large_step_then_high_kick', combo: 'Double_Combo_Attack' });

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const parse = (buf) => new Promise((res, rej) => { const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); l.parse(ab(buf), '', res, rej); });
async function loadForThree(file) {   // node has no image decoder: strip textures in memory; geometry + skin + nodes intact
  const doc = await io.read(file);
  doc.getRoot().listTextures().forEach((t) => t.dispose());
  doc.getRoot().listExtensionsUsed().forEach((e) => { if (/texture|materials/i.test(e.extensionName)) e.dispose(); });
  return parse(Buffer.from(await io.writeBinary(doc)));
}
const sandbox = { window: {} }; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/world-anim.js'), 'utf8'), sandbox);
const lib = await parse(fs.readFileSync(path.join(ROOT, 'public/assets/anim/agent-clips.glb')));

// POSE GATE (2026-10-22): a bake can pass the retarget tests and still look wrong on an odd rig (bot-lanky: idle forearms
// straight out through the torso). Every baked clip is sampled at 5 points on THIS rig and must hold:
//   arms  — idle: upper arm >= 15 deg below horizontal, hands within 1.35x the shoulder half-width of the midline
//           (run/walk swings are legitimately high; a torso-core test was tried and could not tell a folded idle from a bad one)
//   feet  — idle: lowest foot within 0.12 x leg length of the rest ankle height (no floating / sinking)
//   finite — no NaN bone positions
// --qa-only reports and writes nothing. A failing file is never written (it stays unplaced; fix the rig first).
const QA_ONLY = process.argv.includes('--qa-only');
function poseGate(scene, clips) {
  const bone = {}; scene.traverse((n) => { if (n.isBone) bone[n.name] = n; });
  const P = (n) => new THREE.Vector3().setFromMatrixPosition(bone[n].matrixWorld);
  scene.updateMatrixWorld(true);
  const shoulderW = P('LeftArm').distanceTo(P('RightArm')), core = 0.22 * shoulderW;
  const legL = P('LeftUpLeg').distanceTo(P('LeftLeg')) + P('LeftLeg').distanceTo(P('LeftFoot'));
  const ankle0 = Math.min(P('LeftFoot').y, P('RightFoot').y);
  const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().add(ab.multiplyScalar(t))); };
  const fails = [], mixer = new THREE.AnimationMixer(scene);
  for (const [name, clip] of Object.entries(clips)) {
    const act = mixer.clipAction(clip); act.play();
    for (let k = 0; k < 5; k++) {
      mixer.setTime(clip.duration * k / 5); scene.updateMatrixWorld(true);
      const hips = P('Hips'), head = P('Head');
      for (const sd of ['Left', 'Right']) {
        const arm = P(sd + 'Arm'), fore = P(sd + 'ForeArm'), hand = P(sd + 'Hand');
        if (![arm, fore, hand].every((v) => isFinite(v.x + v.y + v.z))) { fails.push(name + ': NaN'); continue; }
        if (name === 'idle') {
          // idle: arms hang or fold — the hand must not sit far outside the shoulder line (bot-lanky: forearms straight out sideways),
          // and the upper arm must hang >= 15 deg below horizontal (T-pose-ish hold). Run/walk arm swings are legitimately high.
          const side = P('LeftArm').sub(P('RightArm')).normalize(), mid0 = P('LeftArm').add(P('RightArm')).multiplyScalar(0.5);
          const out = Math.abs(hand.clone().sub(mid0).dot(side)), sh = Math.abs(arm.clone().sub(mid0).dot(side));
          if (out > 1.35 * sh) fails.push('idle@' + k + ': ' + sd + ' hand ' + (out / sh).toFixed(2) + 'x shoulder width out');
          const d = fore.clone().sub(arm).normalize(), drop = Math.asin(Math.max(-1, Math.min(1, -d.y))) * 180 / Math.PI;
          if (drop < 15) fails.push('idle@' + k + ': ' + sd + ' arm only ' + drop.toFixed(0) + ' deg down');
        }
      }
      if (name === 'idle') { const lo = Math.min(P('LeftFoot').y, P('RightFoot').y); if (Math.abs(lo - ankle0) > 0.12 * legL) fails.push('idle@' + k + ': feet off by ' + (lo - ankle0).toFixed(2)); }
    }
    act.stop(); mixer.uncacheAction(clip);
  }
  scene.updateMatrixWorld(true);
  return [...new Set(fails)];
}

// WORLD RETARGET (--world): world-space rest-pose retarget + rest-pose ALIGNMENT (2026-10-23 fix for A-pose rigs). Verify in Blender before shipping. world-anim.js corrects each bone for TWIST only, which ignores how far a rig's bone axes
// sit from the library's — on the Forge/realistic bodies every arms-down clip came out splayed (hands ~2x shoulder width) and
// wrists bent back. Standard rest-pose retarget instead: per frame, each bone's library WORLD rotation relative to the library rest
// is applied on top of THIS rig's rest world rotation, then converted to local through the (already retargeted) parent.
// Both rests are T-poses in model space (glTF Y-up, facing +Z). Rotation only (+ the Hips path from world-anim) -> no stretch.
const WORLD = process.argv.includes('--world');
const libRoot = lib.scene, libBone = {}; libRoot.traverse((n) => { if (n.name) libBone[n.name] = n; }); libRoot.updateMatrixWorld(true);
const wq = (n) => { const q = new THREE.Quaternion(); n.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
const libRest = {}, libTRS = {}; Object.keys(libBone).forEach((k) => { libRest[k] = wq(libBone[k]); libTRS[k] = [libBone[k].position.clone(), libBone[k].quaternion.clone(), libBone[k].scale.clone()]; });
const libReset = () => { Object.keys(libTRS).forEach((k) => { const r = libTRS[k]; libBone[k].position.copy(r[0]); libBone[k].quaternion.copy(r[1]); libBone[k].scale.copy(r[2]); }); libRoot.updateMatrixWorld(true); };
function worldRetarget(scene, src, hipsClip) {
  const tb = {}; scene.traverse((n) => { if (n.isBone) tb[n.name] = n; }); scene.updateMatrixWorld(true);
  const order = []; (function walk(n) { if (n.isBone && libBone[n.name]) order.push(n.name); n.children.forEach(walk); })(scene);
  // the rig's TRUE bind pose comes from the skin (inverse bind matrices): node TRS in these files can still hold a frame of an old
  // clip. Fallback to the node rest only for a bone the skin does not list.
  let sk = null; scene.traverse((n) => { if (n.isSkinnedMesh && !sk) sk = n; });
  const tRest = {}; order.forEach((k) => { tRest[k] = wq(tb[k]); });
  if (sk) sk.skeleton.bones.forEach((bn, i) => { if (!tRest[bn.name]) return; const q = new THREE.Quaternion(); new THREE.Matrix4().copy(sk.skeleton.boneInverses[i]).invert().premultiply(sk.bindMatrix).decompose(new THREE.Vector3(), q, new THREE.Vector3()); tRest[bn.name] = q; });
  // REST-POSE ALIGNMENT (2026-10-23, measured: library rests in a T-pose (arm -2 deg), Forge rigs in A-poses (36-64 deg) - the cause of
  // splayed arms / bent wrists): swing each target bone's rest DIRECTION (bone -> child) onto the library's rest direction, i.e. the
  // retarget treats the target as if it were standing in the library's T-pose. Leaf bones (hands, feet, head) reuse their parent's swing.
  const CHILD = { LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
    LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', Spine: 'Spine01', Spine01: 'Spine02', Spine02: 'neck', neck: 'Head' };
  const tPos = {}; if (sk) sk.skeleton.bones.forEach((bn, i) => { tPos[bn.name] = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.skeleton.boneInverses[i]).invert().premultiply(sk.bindMatrix)); });
  const lPos = (n) => new THREE.Vector3().setFromMatrixPosition(libBone[n].matrixWorld);
  const align = {};
  order.forEach((k) => {
    const c = CHILD[k];
    if (c && tPos[k] && tPos[c] && libBone[k] && libBone[c]) {
      const td = tPos[c].clone().sub(tPos[k]).normalize(), ld = lPos(c).sub(lPos(k)).normalize();
      align[k] = new THREE.Quaternion().setFromUnitVectors(td, ld);
    } else { const par = tb[k].parent && tb[k].parent.name; align[k] = (par && align[par]) ? align[par].clone() : new THREE.Quaternion(); }
    tRest[k] = align[k].clone().multiply(tRest[k]);
  });
  const clip = lib.animations.find((a) => a.name === src); if (!clip) return null;
  libReset();
  const mx = new THREE.AnimationMixer(libRoot), act = mx.clipAction(clip); act.play();
  const N = Math.max(2, Math.round(clip.duration * 30) + 1), times = new Float32Array(N), vals = {}; order.forEach((k) => { vals[k] = new Float32Array(N * 4); });
  const tw = {}, d = new THREE.Quaternion(), loc = new THREE.Quaternion();
  for (let f = 0; f < N; f++) {
    const t = Math.min(clip.duration, f / 30); times[f] = t; mx.setTime(t); libRoot.updateMatrixWorld(true);
    for (const k of order) {
      d.copy(wq(libBone[k])).multiply(libRest[k].clone().invert());            // library world delta from its rest
      tw[k] = d.clone().multiply(tRest[k]);                                      // same delta on this rig's rest
      const par = tb[k].parent, pw = (par && tw[par.name]) ? tw[par.name] : wq(par);   // Hips: the rig's own (static) armature
      loc.copy(pw).invert().multiply(tw[k]); if (f && loc.dot(new THREE.Quaternion().fromArray(vals[k], (f - 1) * 4)) < 0) { loc.x = -loc.x; loc.y = -loc.y; loc.z = -loc.z; loc.w = -loc.w; }
      loc.toArray(vals[k], f * 4);
    }
  }
  act.stop(); mx.uncacheRoot(libRoot); libReset();
  const tracks = order.map((k) => new THREE.QuaternionKeyframeTrack(k + '.quaternion', times, vals[k]));
  const hp = hipsClip && hipsClip.tracks.find((t) => t.name === 'Hips.position'); if (hp) tracks.push(hp);
  return new THREE.AnimationClip(src, clip.duration, tracks);
}

fs.mkdirSync(BACKUP, { recursive: true });
for (const { code, file, out: outPath } of JOBS) {
  const g = await loadForThree(file);
  g.scene.updateMatrixWorld(true);
  const anim = sandbox.window.buildAgentAnimator({ THREE, model: g.scene, clips: lib.animations, meta: META });
  const doc = await io.read(file);
  const root = doc.getRoot(), buf = root.listBuffers()[0];
  const nodeBy = {}; root.listNodes().forEach((n) => { nodeBy[n.getName()] = n; });
  const before = root.listAnimations().map((a) => a.getName());
  root.listAnimations().forEach((a) => { a.listSamplers().forEach((s) => { s.getInput() && s.getInput().dispose(); s.getOutput() && s.getOutput().dispose(); }); a.dispose(); });
  const baked = [], qaClips = {};
  for (const [name, src] of Object.entries(WANT)) {
    if (!src || !anim.has(src)) { console.warn('  skip', code, name, '(library has no ' + src + ')'); continue; }
    // HYBRID (2026-10-23, Blender check): the twist-only retarget (world-anim.js) is right for legs/spine/hips on every rig; the aligned
    // world retarget fixes only the ARMS of A-pose rigs (it lifted a leg when used for the whole body). --world = arms from the aligned
    // retarget, everything else from world-anim.js.
    const ARM = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)\.quaternion$/;
    let clip = anim.clip(src);
    if (WORLD && clip) { const w = worldRetarget(g.scene, src, null); if (w) clip = new THREE.AnimationClip(src, clip.duration, clip.tracks.filter((t) => !ARM.test(t.name)).concat(w.tracks.filter((t) => ARM.test(t.name)))); }
    // A-pose rigs (Forge bodies): the library idle's knee bend tears the left shin (seen identically on 4 bodies in Blender). Their idle keeps
    // the legs at the rig's own rest (standing straight); every moving clip keeps full leg motion.
    if (WORLD && name === 'idle' && clip) clip = new THREE.AnimationClip(name, clip.duration, clip.tracks.filter((t) => !/^(Left|Right)(UpLeg|Leg|Foot|ToeBase)\.quaternion$/.test(t.name)));
    if (!clip || !clip.tracks.length) continue;
    const A = doc.createAnimation(name);
    // REST HANDS (2026-10-22): these rigs have no finger bones, and the library wrist rotation lands bent back ~90 deg on the
    // Forge/realistic bodies (seen in Blender; a full-offset hand retarget pointed the fingers straight up instead). The hand keeps
    // its own rest rotation = straight in line with the forearm: folded arms tuck flat, walk/run read natural. --keep-hands = old.
    if (!WORLD && !process.argv.includes('--keep-hands')) clip.tracks = clip.tracks.filter((t) => !/^(Left|Right)Hand.quaternion$/.test(t.name));
    for (const tr of clip.tracks) {
      const pn = THREE.PropertyBinding.parseTrackName(tr.name), node = nodeBy[pn.nodeName];
      if (!node) continue;
      const path_ = pn.propertyName === 'quaternion' ? 'rotation' : pn.propertyName === 'position' ? 'translation' : null;
      if (!path_) continue;
      const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(tr.times)).setBuffer(buf);
      const output = doc.createAccessor().setType(path_ === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(tr.values)).setBuffer(buf);
      const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      A.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path_).setSampler(s));
    }
    baked.push(name); qaClips[name] = clip;
  }
  if (!baked.includes('idle') || !baked.includes('walk') || !baked.includes('run')) { console.error('ABORT', code, 'core clips missing; file untouched'); continue; }
  const qa = poseGate(g.scene, qaClips);
  console.log((qa.length ? 'QA FAIL ' : 'QA PASS ') + code + (qa.length ? '  ' + qa.slice(0, 4).join(' | ') + (qa.length > 4 ? ' (+' + (qa.length - 4) + ')' : '') : ''));
  if (QA_ONLY || (qa.length && !(process.argv.includes('--force') && outPath && /_handtest/.test(outPath)))) continue;   // --force only for _handtest inspection files
  const bk = path.join(BACKUP, code + '.glb');
  if (!outPath && !fs.existsSync(bk)) fs.copyFileSync(file, bk);
  const out = Buffer.from(await io.writeBinary(doc));          // explicit GLB bytes (io.write on a .tmp path would emit .gltf + .bin)
  if (out.length < fs.statSync(file).size * 0.6) { console.error('ABORT', code, 'output shrank to ' + out.length + ' bytes; file untouched'); continue; }
  const dest = outPath || file; fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  console.log(code, 'was [' + before.join(',') + '] -> baked ' + baked.length + ': ' + baked.join(','), (fs.statSync(dest).size / 1048576).toFixed(2) + ' MB');
}
