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

let ESM, GLTFLoader, NodeIO;
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const parse = (buf) => new Promise((res, rej) => new GLTFLoader().parse(ab(buf), '', res, rej));
// GLTFLoader builds ESM-three objects; re-create the clips on three.cjs so the mixer and clips share one THREE
const toCjsClip = (c) => THREE.AnimationClip.parse(ESM.AnimationClip.toJSON(c));
async function loadRig(file) {
  const io = new NodeIO(); const doc = await io.read(file);
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
  const lib = await parse(fs.readFileSync(GLB));
  const clips = lib.animations.map(toCjsClip);
  const clipBy = Object.fromEntries(clips.map((c) => [c.name, c]));
  const metaBy = Object.fromEntries(META.clips.map((c) => [c.name, c]));
  // the library's own skeleton (canonical ZEROX v6 bind) as a THREE.cjs scene — the synthetic 24-bone model
  lib.scene.updateMatrixWorld(true);   // GLTFLoader leaves .matrix stale until then; toJSON serialises .matrix
  const libJSON = lib.scene.toJSON();
  const makeLibModel = () => new THREE.ObjectLoader().parse(libJSON);

  console.log(`agent-clips.glb ${(fs.statSync(GLB).size / 1024).toFixed(0)} KB · ${clips.length} clips · rigs: ${RIGS.map((r) => path.relative(ROOT, r)).join(', ')}`);

  await test('GLB and JSON list the same clips, names unique, durations agree', () => {
    assert.strictEqual(clips.length, META.clips.length);
    assert.strictEqual(new Set(clips.map((c) => c.name)).size, clips.length, 'duplicate clip names');
    for (const m of META.clips) {
      assert.ok(clipBy[m.name], 'missing in GLB: ' + m.name);
      assert.ok(Math.abs(clipBy[m.name].duration - m.duration) < 0.02, m.name + ' duration');
      assert.ok(Array.isArray(m.tags) && typeof m.loop === 'boolean' && typeof m.inPlace === 'boolean' && m.excursionM >= 0, m.name + ' meta fields');
      if (m.tags.includes('locomotion')) assert.ok(m.inPlace && m.speedMps > 0 && m.loop, m.name + ' locomotion must be an in-place loop with a speed');
    }
    for (const k of ['idle', 'walk', 'run']) assert.ok(clipBy[META.locomotion[k]], 'locomotion.' + k);
    for (const [k, v] of Object.entries(META.actions)) if (v) assert.ok(clipBy[v], 'actions.' + k + ' -> ' + v);
  });

  await test('every clip binds all 24 Meshy bones (rotation) + Hips translation, and nothing else', () => {
    for (const c of clips) {
      const q = new Set(), other = [];
      for (const t of c.tracks) {
        const p = THREE.PropertyBinding.parseTrackName(t.name);
        assert.ok(BONES.includes(p.nodeName), `${c.name}: track on unknown bone ${p.nodeName}`);
        if (p.propertyName === 'quaternion') q.add(p.nodeName); else if (!(p.nodeName === 'Hips' && p.propertyName === 'position')) other.push(t.name);
      }
      assert.strictEqual(q.size, 24, `${c.name}: ${24 - q.size} bones without rotation`);
      assert.deepStrictEqual(other, [], `${c.name}: unexpected tracks`);
    }
  });

  await test('every clip is in place: Hips XZ returns to its start, locomotion sway stays under 30 cm', () => {
    const model = makeLibModel(), mixer = new THREE.AnimationMixer(model), hips = model.getObjectByName('Hips'), p = new THREE.Vector3();
    for (const c of clips) {
      const a = mixer.clipAction(c).play(); let x0, z0, maxd = 0, end;
      const n = Math.round(c.duration * 30);
      for (let f = 0; f <= n; f++) {
        mixer.setTime(Math.min(c.duration - 1e-4, f / 30)); wpos(hips, p);
        if (f === 0) { x0 = p.x; z0 = p.z; }
        maxd = Math.max(maxd, Math.hypot(p.x - x0, p.z - z0)); end = Math.hypot(p.x - x0, p.z - z0);
      }
      a.stop(); mixer.uncacheClip(c);
      assert.ok(end < 0.03, `${c.name}: hips end ${end.toFixed(3)} m from start`);
      if (metaBy[c.name].tags.includes('locomotion')) assert.ok(maxd < 0.3, `${c.name}: sways ${maxd.toFixed(3)} m`);
    }
  });

  await test('locomotion speeds are sane (walk 1-2 m/s, run 3-7 m/s) and hit frames sit inside their clips', () => {
    const w = metaBy[META.locomotion.walk], r = metaBy[META.locomotion.run];
    assert.ok(w.speedMps > 1 && w.speedMps < 2, 'walk ' + w.speedMps); assert.ok(r.speedMps > 3 && r.speedMps < 7, 'run ' + r.speedMps);
    for (const m of META.clips) if (m.hitTimes) for (const t of m.hitTimes) assert.ok(t > 0 && t < m.duration, m.name + ' hit ' + t);
    assert.ok(META.clips.filter((m) => m.tags.includes('attack')).every((m) => m.hitTimes && m.hitTimes.length || /_Rec$/.test(m.name)), 'attacks without a hit frame');
  });

  const settle = (anim, v, g = true, t = 1.2) => { for (let i = 0; i < t * 60; i++) { anim.setLocomotion(v, g); anim.update(1 / 60); } };

  await test('speed-matched timeScale: walk alone = speed / walk.speedMps, run alone = speed / run.speedMps', () => {
    const anim = buildAgentAnimator({ THREE, model: makeLibModel(), clips, meta: META, hipM: META.skeleton.hipM });
    const w = metaBy[META.locomotion.walk].speedMps, r = metaBy[META.locomotion.run].speedMps;
    for (const v of [w * 0.8, w]) { settle(anim, v); assert.ok(Math.abs(anim.debug.timeScale.walk - v / w) < 0.01, `walk ts ${anim.debug.timeScale.walk} at ${v}`); }
    settle(anim, w); assert.ok(Math.abs(anim.debug.w.walk - 1) < 1e-3, 'walk weight at walk speed');
    settle(anim, r); assert.ok(Math.abs(anim.debug.w.run - 1) < 1e-3 && Math.abs(anim.debug.timeScale.run - 1) < 0.01, 'run at run speed');
    settle(anim, r * 1.2); assert.ok(Math.abs(anim.debug.timeScale.run - 1.2) < 0.01, 'run faster');
    // between gaits both clips complete a cycle in the same time (phase lock)
    settle(anim, (w + r) / 2);
    const cw = metaBy[META.locomotion.walk].duration / anim.debug.timeScale.walk, cr = metaBy[META.locomotion.run].duration / anim.debug.timeScale.run;
    assert.ok(Math.abs(cw - cr) < 1e-6 && anim.debug.w.walk > 0 && anim.debug.w.run > 0, `cycles ${cw} vs ${cr}`);
    // hip-height scaling: a twice-as-tall agent strides twice as far
    const big = buildAgentAnimator({ THREE, model: makeLibModel(), clips, meta: META, hipM: META.skeleton.hipM * 2 });
    settle(big, w); assert.ok(Math.abs(big.debug.timeScale.walk - 0.5) < 0.01, 'tall agent ts ' + big.debug.timeScale.walk);
  });

  await test('blend weights sum to 1 on every bone — speed sweep, upper-body attack, full-body one-shot, jump', () => {
    const model = makeLibModel(), anim = buildAgentAnimator({ THREE, model, clips, meta: META });
    const up = new Set(META.skeleton.upper);
    const sums = () => {
      const s = { lower: 0, upper: 0 };
      for (const a of anim.mixer._actions) {
        const w = a.getEffectiveWeight(); if (!a.isRunning() && !a.paused && !a.enabled) continue;
        if (!anim.mixer._isActiveAction(a)) continue;
        const names = new Set(a.getClip().tracks.map((t) => t.name.split('.')[0]));
        if (names.has('LeftLeg')) s.lower += w; if (names.has('LeftForeArm')) s.upper += w;
      }
      return s;
    };
    const check = (label) => { const s = sums(); assert.ok(Math.abs(s.lower - 1) < 1e-4 && Math.abs(s.upper - 1) < 1e-4, `${label}: lower ${s.lower.toFixed(4)} upper ${s.upper.toFixed(4)}`); };
    for (let v = 0; v <= 8; v += 0.25) {
      anim.setLocomotion(v, true); anim.update(1 / 60);
      const d = anim.debug.w; assert.ok(Math.abs(d.idle + d.walk + d.run + d.sprint - 1) < 1e-6, 'slot weights at ' + v); check('speed ' + v);
    }
    settle(anim, 1.6, true, 0.5);
    assert.ok(anim.play('Sword_Regular_Combo', { layer: 'upper', fade: 0.2 }));
    for (let i = 0; i < 40; i++) { anim.setLocomotion(1.6, true); anim.update(1 / 60); check('upper attack frame ' + i); }
    assert.ok(anim.debug.upper > 0.99, 'upper layer engaged');
    assert.ok(anim.play('Lunge_Spin_Kick', { fade: 0.15 }));
    for (let i = 0; i < 30; i++) { anim.update(1 / 60); check('full one-shot frame ' + i); }
    anim.jump(); for (let i = 0; i < 90; i++) { anim.setLocomotion(0, i < 60 ? false : true); anim.update(1 / 60); check('jump frame ' + i); }
  });

  await test('jump -> air loop -> land, roll, onHit and onEnd hooks', () => {
    const anim = buildAgentAnimator({ THREE, model: makeLibModel(), clips, meta: META });
    settle(anim, 0, true, 0.3);
    const active = () => anim.mixer._actions.filter((a) => a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name);
    assert.ok(anim.jump());
    for (let i = 0; i < 90; i++) { anim.setLocomotion(0, false); anim.update(1 / 60); }
    assert.ok(active().includes(META.actions.jumpLoop), 'air loop after the jump start: ' + active());
    anim.setLocomotion(0, true); for (let i = 0; i < 12; i++) anim.update(1 / 60);
    assert.ok(active().includes(META.actions.jumpLand), 'landing: ' + active());
    settle(anim, 0, true, 2); assert.ok(Math.abs(anim.debug.w.idle - 1) < 1e-6 && anim.debug.full === 0, 'back to idle');
    assert.ok(anim.roll()); for (let i = 0; i < 10; i++) anim.update(1 / 60);
    assert.ok(active().includes(META.actions.roll), 'rolling');
    const hits = [], ends = [];
    const combo = metaBy.Sword_Regular_Combo;
    anim.play('Sword_Regular_Combo', { onHit: (i) => hits.push(i), onEnd: (n) => ends.push(n) });
    for (let i = 0; i < (combo.duration + 1) * 60; i++) anim.update(1 / 60);
    assert.deepStrictEqual(hits, combo.hitTimes.map((_, i) => i), 'hits ' + hits);
    assert.deepStrictEqual(ends, ['Sword_Regular_Combo']);
    assert.ok(Array.isArray(anim.rootMotion('Roll')) && anim.rootMotion('Roll')[1] > 0.5, 'roll root motion forward');
  });

  await test('update() allocates nothing: no THREE objects over a 20k-frame speed sweep; 0 heap per steady frame outside the three mixer', async () => {
    const counts = {}; const T = Object.assign({}, THREE);
    for (const k of ['Vector3', 'Quaternion', 'Matrix4', 'Euler', 'AnimationClip', 'AnimationAction']) { counts[k] = 0; T[k] = new Proxy(THREE[k], { construct(t, a, nt) { counts[k]++; return Reflect.construct(t, a, nt); } }); }
    const anim = buildAgentAnimator({ THREE: T, model: makeLibModel(), clips, meta: META });
    let i = 0;
    const ours = () => { anim.setLocomotion((i++ % 600) / 100, true); anim.update(1 / 60); };
    const bare = () => { anim.mixer.update(1 / 60); };
    anim.play('Sword_Regular_Combo', { layer: 'upper', once: false });   // an overlay running through the loop
    for (let k = 0; k < 3000; k++) ours();                                // warm every code path + binding caches
    for (const k in counts) counts[k] = 0;
    for (let k = 0; k < 20000; k++) ours();
    assert.deepStrictEqual(counts, { Vector3: 0, Quaternion: 0, Matrix4: 0, Euler: 0, AnimationClip: 0, AnimationAction: 0 });
    // heap: three's own mixer.update() boxes a few doubles per call (V8 HeapNumbers); ours must add nothing on top.
    v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
    const gcs = []; const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) gcs.push(e.startTime); }); obs.observe({ entryTypes: ['gc'] });
    const perCall = async (fn, N) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        gc(); await new Promise((r) => setTimeout(r, 5));
        const t0 = performance.now(), h0 = process.memoryUsage().heapUsed;
        for (let k = 0; k < N; k++) fn();
        const h1 = process.memoryUsage().heapUsed, t1 = performance.now();
        await new Promise((r) => setTimeout(r, 5));
        if (!gcs.some((t) => t >= t0 && t <= t1)) return (h1 - h0) / N;
      }
      return NaN;
    };
    // our logic alone: stub three's mixer.update (it boxes interpolated doubles internally — not ours to fix)
    // steady state (speed held, overlay running): three's AnimationAction boxes a double on every CHANGED
    // timeScale/weight write, so the animator writes only on change — a held speed must cost nothing.
    const real = anim.mixer.update; anim.mixer.update = function () { return this; };
    const steady = () => { anim.setLocomotion(3, true); anim.update(1 / 60); };
    for (let k = 0; k < 3000; k++) steady();
    let a = Infinity; for (let t = 0; t < 6; t++) a = Math.min(a, await perCall(steady, 1000));
    anim.mixer.update = real;
    const b = await perCall(bare, 1000);
    obs.disconnect();
    assert.ok(Number.isFinite(a), 'no GC-free measurement window');
    assert.ok(a < 4, `animator logic: ${a.toFixed(1)} B/call`);
    console.log(`       heap per call: animator logic ${a.toFixed(1)} B, three mixer.update() ${Number.isFinite(b) ? b.toFixed(0) : '?'} B`);
  });

  // ── the real v6 rigs ─────────────────────────────────────────────────────────────────────────────
  const libModel = makeLibModel(), libMixer = new THREE.AnimationMixer(libModel);
  const LIMBS = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'Spine01'];   // (Spine->neck is off-axis per rig)
  const CHILD = { LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand', Spine01: 'Spine', Spine: 'neck' };
  const legOf = (r) => { const d = (a, b) => wpos(r.getObjectByName(a)).distanceTo(wpos(r.getObjectByName(b))); return (d('LeftUpLeg', 'LeftLeg') + d('LeftLeg', 'LeftFoot') + d('RightUpLeg', 'RightLeg') + d('RightLeg', 'RightFoot')) / 2; };
  const dirOf = (root, b, out) => { const a = wpos(root.getObjectByName(b)); return out.copy(wpos(root.getObjectByName(CHILD[b]))).sub(a).normalize(); };
  for (const file of RIGS) {
    const label = path.relative(path.join(ROOT, 'fal-assets/characters'), file).replace(/\\/g, '/');
    let rig;
    try { rig = await loadRig(file); } catch (e) { await test(label + ' loads', () => { throw e; }); continue; }
    await test(`${label}: binds, limbs follow the library pose (<3°), feet on the floor, walk does not slide`, () => {
      const anim = buildAgentAnimator({ THREE, model: rig, clips, meta: META });
      for (const b of BONES) assert.ok(rig.getObjectByName(b), 'rig lacks ' + b);
      const bindFoot = Math.min(wpos(rig.getObjectByName('LeftFoot')).y, wpos(rig.getObjectByName('RightFoot')).y);
      const m = new THREE.AnimationMixer(rig), da = new THREE.Vector3(), db = new THREE.Vector3();
      for (const name of ['Walking', 'Running', 'Sword_Regular_Combo', 'Roll', 'Sit_Chair_Loop', 'Lunge_Roundhouse_Kick', 'Idle_No_Loop']) {
        const c = anim.clip(name); assert.ok(c, name);
        const a = m.clipAction(c).play(), la = libMixer.clipAction(clipBy[name]).play();
        for (const t of [0.25, 0.5, 0.75]) {
          m.setTime(c.duration * t); libMixer.setTime(c.duration * t);
          for (const b of LIMBS) { const ang = dirOf(rig, b, da).angleTo(dirOf(libModel, b, db)) * 57.3; assert.ok(ang < 3, `${name}@${t} ${b} off by ${ang.toFixed(1)}°`); }
        }
        a.stop(); la.stop(); m.uncacheClip(c); libMixer.uncacheClip(clipBy[name]);
      }
      // walk cycle: the lowest foot touches the bind foot height (hip scaling right) …
      const walk = anim.clip('Walking'), a = m.clipAction(walk).play(); let low = Infinity;
      for (let f = 0; f <= 30; f++) { m.setTime(walk.duration * f / 30); low = Math.min(low, wpos(rig.getObjectByName('LeftFoot')).y, wpos(rig.getObjectByName('RightFoot')).y); }
      a.stop(); m.uncacheClip(walk);
      assert.ok(Math.abs(low - bindFoot) < 0.04, `walk lowest ankle ${low.toFixed(3)} vs bind ${bindFoot.toFixed(3)}`);
      // … and with the body moved at the requested speed, the planted foot stays put in the world
      for (const gait of ['walk', 'run']) {
        const anim2 = buildAgentAnimator({ THREE, model: rig, clips, meta: META, mixer: new THREE.AnimationMixer(rig) });
        const v = metaBy[META.locomotion[gait]].speedMps * legOf(rig) / META.skeleton.legM * 0.9;
        rig.position.set(0, 0, 0); settle(anim2, v, true, 1);
        const vs = [], L = rig.getObjectByName('LeftFoot'), R = rig.getObjectByName('RightFoot'), pl = new THREE.Vector3(), pr = new THREE.Vector3(), ql = new THREE.Vector3(), qr = new THREE.Vector3();
        let minY = Infinity; const dt = 1 / 120;
        for (let i = 0; i < 240; i++) { anim2.setLocomotion(v, true); anim2.update(dt); rig.position.z += v * dt; minY = Math.min(minY, wpos(L).y, wpos(R).y); }
        for (let i = 0; i < 240; i++) {
          wpos(L, pl); wpos(R, pr);
          anim2.setLocomotion(v, true); anim2.update(dt); rig.position.z += v * dt;
          wpos(L, ql); wpos(R, qr);
          const planted = pl.y < pr.y ? [pl, ql] : [pr, qr];
          if (planted[0].y < minY + 0.03) vs.push(Math.hypot(planted[1].x - planted[0].x, planted[1].z - planted[0].z) / dt);
        }
        rig.position.set(0, 0, 0);
        vs.sort((x, y) => x - y); const med = vs[vs.length >> 1];
        assert.ok(med < 0.1 * v + 0.05, `${gait} @${v.toFixed(2)} m/s: planted foot slides ${med.toFixed(3)} m/s`);
        anim2.mixer.stopAllAction();
      }
      console.log(`       ${label}: retargeted=${anim.retargeted}`);
    });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
