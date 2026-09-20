import io, re
p = 'public/world3d.html'
s = io.open(p, encoding='utf8').read()
def rep(a, b):
    global s
    assert a in s, 'MISSING: ' + a[:90]
    s = s.replace(a, b, 1)

# ───────── 1. characters: own clips, no cross-body retarget, real seated poses ─────────
a = s.index("const charSrc = {}, clipSrc = {};")
b = s.index("function boatPose(m, dt, driven) {")
ACTORS = r'''const charSrc = {};   // id -> { scene, walk, run, action } ; every clip belongs to THAT body (retargeting across bodies is what deformed them before)
// own-body clip: only cancel horizontal root drift so loops don't snap. Nothing is retargeted or rescaled.
function fixClip(clip, name) {
  const tracks = clip.tracks.map((t) => {
    if (t.name === 'Hips.position') { const v = Float32Array.from(t.values); for (let i = 0; i < v.length; i += 3) { v[i] = t.values[0]; v[i + 2] = t.values[2]; } return new THREE.VectorKeyframeTrack(t.name, t.times, v); }
    return t;
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
}
const BONES = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const CHILD = { Spine: 'Spine01', Spine01: 'Spine02', Spine02: 'neck', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot' };
function makeActor(id) {
  const src = charSrc[id]; if (!src) return null;
  const model = SkeletonUtils.clone(src.scene), root = new THREE.Group(); root.add(model);
  model.updateMatrixWorld(true);
  const wp = (n) => { const o = model.getObjectByName(n); return o ? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).y : null; };
  const hy = wp('Head'), fy = Math.min(wp('LeftToeBase') ?? 0, wp('RightToeBase') ?? 0);
  const k = 1.8 / ((hy - fy) * 1.12 || 1); model.scale.setScalar(k); model.position.y = -fy * k;   // every hero = 1.8 m, feet on the ground
  model.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; if (n.material) n.material.envMapIntensity = 0.7; } });
  model.updateMatrixWorld(true);
  // capture the rest (T-pose) skeleton in actor space: used by the seated-pose solver
  const bones = {}, rest = {}, restDir = {}; BONES.forEach((n) => { bones[n] = model.getObjectByName(n); });
  const qi = new THREE.Quaternion(); const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion()), wpos = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  for (const n of BONES) if (bones[n]) { rest[n] = wq(bones[n]); const c = bones[CHILD[n]]; if (c) restDir[n] = wpos(c).sub(wpos(bones[n])).normalize(); }
  const hipsH = bones.Hips ? wpos(bones.Hips).y - 0 : 0.95;
  const sideL = bones.LeftUpLeg && bones.RightUpLeg ? Math.sign(wpos(bones.LeftUpLeg).x - wpos(bones.RightUpLeg).x) || 1 : 1;
  const mixer = new THREE.AnimationMixer(model), A = {};
  A.walk = mixer.clipAction(fixClip(src.walk, 'walk'));
  A.run = mixer.clipAction(fixClip(src.run || src.walk, 'run'));
  A.idle = mixer.clipAction(fixClip(src.walk, 'idle'));        // frozen first frame of the hero's own walk = neutral standing pose
  const a = { id, root, model, mixer, A, cur: null, speed: 0, yaw: 0, busy: 0, bones, rest, restDir, hipsH, sideL, seat: null, hero: HEROES.find((h) => h.id === id) };
  play(a, 'idle', 0, 0); root.userData.actor = a; addAttack(a); return a;
}
function addAttack(a) {
  const src = charSrc[a.id]; if (!src || !src.action || a.A.attack) return;
  const c = a.A.attack = a.mixer.clipAction(fixClip(src.action, 'attack')); c.setLoop(THREE.LoopOnce, 1); c.clampWhenFinished = true;
  a.attackKind = /slash/i.test(src.action.name) ? 'slash' : 'cast';
}
async function ensureAction(id) {
  const src = charSrc[id]; if (!src || src.action || src.actionLoading) return; src.actionLoading = true;
  const g = await loadG(`assets/models/chars/${id}-action.glb`); if (g && g.animations[0]) src.action = g.animations[0];
}
function play(a, name, fade = 0.2, ts = 1) {
  const n = a.A[name]; if (!n) return; n.timeScale = ts;
  if (a.cur === n) return; n.reset(); n.enabled = true; n.setEffectiveWeight(1); n.timeScale = ts;
  if (a.cur) { a.cur.crossFadeTo(n, fade, false); } n.play(); a.cur = n; a.curName = name;
}
function locomote(a, speed, dt) {
  if (a.busy > 0 || a.seat) return;
  if (speed < 0.15) play(a, 'idle', 0.25, 0);
  else if (speed < 3.6) play(a, 'walk', 0.2, clamp(speed / 1.45, 0.6, 1.9));
  else play(a, 'run', 0.2, clamp(speed / 3.6, 0.8, 1.6));
}
function strike(a) {
  const n = a.A.attack; if (!n) { ensureAction(a.id).then(() => addAttack(a)); return; } if (a.busy > 0) return;
  play(a, 'attack', 0.12, 1); a.busy = n.getClip().duration * 0.95; vfxBurst(a, a.attackKind || 'slash');
}
/* seated-pose solver: aims each bone toward a target direction (actor space: +z forward, +y up, left = +x*sideL).
   Works on any hero because every rig shares one skeleton; nothing is scaled or retargeted, so meshes never stretch. */
const SEAT_POSES = {
  ride: { thigh: [0.55, -0.32, 0.77], shin: [0.18, -1, -0.28], upper: [0.32, -0.42, 0.85], fore: [0.12, -0.15, 1], lean: 0.06 },
  sit:  { thigh: [0.12, -0.06, 1], shin: [0.02, -1, 0.12], upper: [0.28, -0.5, 0.8], fore: [0.1, -0.06, 1], lean: -0.05 },
};
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3();
function aim(a, name, dir, rootQ, rootQinv) {
  const b = a.bones[name], rq = a.rest[name], rd = a.restDir[name]; if (!b || !rq || !rd) return;
  const par = b.parent; par.updateWorldMatrix(true, false);
  _qa.setFromUnitVectors(rd, _va.copy(dir).normalize());              // rotation taking the rest direction to the wanted one
  _qb.copy(_qa).multiply(rq);                                          // wanted orientation, actor space
  par.getWorldQuaternion(_qc); _qc.premultiply(rootQinv);              // parent orientation now, actor space
  b.quaternion.copy(_qc.invert().multiply(_qb)); b.updateMatrixWorld(true);
}
function applySeat(a) {
  const pose = SEAT_POSES[a.seat]; if (!pose) return;
  const rootQ = a.root.getWorldQuaternion(new THREE.Quaternion()), inv = rootQ.clone().invert(), sL = a.sideL, sR = -a.sideL;
  const V = (v, sd) => new THREE.Vector3(v[0] * sd, v[1], v[2]);
  a.model.updateMatrixWorld(true);
  const lean = new THREE.Vector3(0, 1, pose.lean);
  aim(a, 'Spine', lean, rootQ, inv); aim(a, 'Spine01', lean, rootQ, inv); aim(a, 'Spine02', lean, rootQ, inv);
  aim(a, 'LeftUpLeg', V(pose.thigh, sL), rootQ, inv); aim(a, 'LeftLeg', V(pose.shin, sL), rootQ, inv);
  aim(a, 'RightUpLeg', V(pose.thigh, sR), rootQ, inv); aim(a, 'RightLeg', V(pose.shin, sR), rootQ, inv);
  aim(a, 'LeftArm', V(pose.upper, sL), rootQ, inv); aim(a, 'LeftForeArm', V(pose.fore, sL), rootQ, inv);
  aim(a, 'RightArm', V(pose.upper, sR), rootQ, inv); aim(a, 'RightForeArm', V(pose.fore, sR), rootQ, inv);
}
'''
s = s[:a] + ACTORS + s[b:]

# ───────── 2. place(): optional long-axis alignment for vehicles ─────────
rep("  const m = g.scene, box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());\n  const s = o.h",
    "  const m = g.scene; if (o.align) { const b0 = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()); if (b0.x > b0.z * 1.12) m.rotation.y = (o.flip ? -1 : 1) * Math.PI / 2; else if (o.flip) m.rotation.y = Math.PI; m.updateMatrixWorld(true); }\n  const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());\n  const s = o.h")

# ───────── 3. mounts: seat anchors, mount/dismount ─────────
a = s.index("async function addMount(file, name, o) {")
b = s.index("function makeLabel(") if False else s.index("\n}\n", a) + 3
ADDM = r'''async function addMount(file, name, o) {
  const grp = await place(file, Object.assign({ align: !!(o.boat || o.veh) }, o)); if (!grp) return;
  const box = new THREE.Box3().setFromObject(grp), len = box.max.z - box.min.z, wid = box.max.x - box.min.x;
  const lab = makeLabel(name, '#e8c45c', 0.9); lab.position.set(0, box.max.y + 1.0, 0); grp.add(lab);
  if (o.boat || o.hover || o.veh) grp.rotation.order = 'YXZ';
  const sp = o.seatPos || [0, o.seatY ?? 0.85, o.seatZ ?? -0.06];   // seat point as fractions: x of width, y of height, z of length (from centre)
  const seat = new THREE.Vector3(sp[0] * wid, sp[1] * box.max.y, sp[2] * len);
  mounts.push({ name, grp, boat: !!o.boat, sub: !!o.sub, veh: !!(o.veh || o.hover), pose: o.pose || 'ride', seatV: seat, speed: o.speed || 8, hover: !!o.hover, baseY: o.hover ? (o.hoverY || 3) : 0, vel: 0, yaw: o.ry || 0, t: Math.random() * 6, rider: null, lab, home: grp.position.clone(), len });
}
'''
s = s[:a] + ADDM + s[b:]
a = s.index("function mount(m) {")
b = s.index("function enterInterior()")
MD = r'''function mount(m) {
  if (m.rider || !player) return; mountedOn = m; m.rider = player; m.grp.add(player.root);
  const P = player; P.seat = m.pose; P.root.rotation.set(0, 0, 0); P.yaw = 0; P.speed = 0; play(P, 'idle', 0, 0);
  P.root.position.set(m.seatV.x, m.seatV.y - P.hipsH + 0.12, m.seatV.z); state.follow = 1;
  toast(`MOUNTED · ${m.name.toUpperCase()}`);
}
function dismount(silent) {
  if (!mountedOn) return; const m = mountedOn, wp = new THREE.Vector3(); m.grp.getWorldPosition(wp);
  scene.add(player.root); player.root.position.set(wp.x + Math.sin(m.yaw + 1.6) * 3.2, 0, wp.z + Math.cos(m.yaw + 1.6) * 3.2); player.root.rotation.set(0, 0, 0); player.yaw = m.yaw;
  BONES.forEach((n) => { const b = player.bones[n]; if (b) b.quaternion.identity(); });
  player.seat = null; m.rider = null; mountedOn = null; player.root.visible = true; if (!silent) toast('DISMOUNTED');
}
'''
s = s[:a] + MD + s[b:]

# ───────── 4. riding controls: throttle + steer + chase camera ─────────
a = s.index("    if (mountedOn) {\n      const m = mountedOn, sp = m.speed")
b = s.index("P.mixer.update(dt); camTarget.copy(m.grp.position);")
RIDE = r'''    if (mountedOn) {
      const m = mountedOn, sp = m.speed * (running ? 1.35 : 1);
      const thr = (state.keys['w'] || state.keys['arrowup'] ? 1 : 0) - (state.keys['s'] || state.keys['arrowdown'] ? 1 : 0) - state.joy.y, str = (state.keys['d'] || state.keys['arrowright'] ? 1 : 0) - (state.keys['a'] || state.keys['arrowleft'] ? 1 : 0) + state.joy.x;
      m.vel = damp(m.vel, thr > 0.05 ? sp * thr : thr < -0.05 ? sp * 0.35 * thr : 0, thr ? 2.6 : 3.4, dt);
      const turn = (m.boat ? 0.7 : m.hover ? 1.5 : 1.3) * clamp(Math.abs(m.vel) / (m.speed * 0.35) + 0.25, 0, 1);
      m.yaw -= str * turn * dt * (m.vel < -0.1 ? -1 : 1);
      m.grp.rotation.y = m.yaw; m.grp.position.x += Math.sin(m.yaw) * m.vel * dt; m.grp.position.z += Math.cos(m.yaw) * m.vel * dt;
      m.t += dt * (2.2 + Math.abs(m.vel) * 0.85);
      if (m.hover) { const up = (state.keys[' '] ? 1 : 0) - (state.keys['c'] ? 1 : 0); m.baseY = clamp(m.baseY + up * 8 * dt, m.name.includes('HAWK') ? 2 : 0.8, 60); m.grp.position.y = damp(m.grp.position.y, m.baseY + Math.sin(T * 2.1) * 0.12 + (m.veh && !m.name.includes('HAWK') ? 0 : 0.25), 4, dt); m.grp.rotation.z = damp(m.grp.rotation.z, -str * 0.22 * clamp(Math.abs(m.vel) / m.speed, 0, 1), 3, dt); m.grp.rotation.x = damp(m.grp.rotation.x, thr > 0 ? 0.1 : thr < 0 ? -0.06 : 0, 3, dt); }
      else if (m.boat) { boatPose(m, dt, true); }
      else { const sf = clamp(Math.abs(m.vel) / m.speed, 0, 1.2); m.grp.position.y = Math.abs(Math.sin(m.t)) * 0.14 * sf; m.grp.rotation.z = Math.sin(m.t) * 0.05 * sf; m.grp.rotation.x = Math.sin(m.t * 2) * 0.03 * sf; }
      // chase camera settles behind the vehicle unless the player is dragging the view
      if (!drag && Math.abs(m.vel) > 0.6) state.cam.yaw += angDiff(state.cam.yaw, m.yaw + Math.PI) * clamp(1.8 * dt, 0, 1);
      '''
s = s[:a] + RIDE + s[b:]
rep("camTarget.copy(m.grp.position); camTarget.y += m.seat * 0.6 + 1.2; P.speed = m.vel;", "camTarget.copy(m.grp.position); camTarget.y += m.seatV.y * 0.7 + 1.0; P.speed = m.vel; applySeat(P);")

# mixer order: apply seat pose AFTER the mixer wrote animation bones (it's in same line: P.mixer.update first)
# ───────── 5. boot: heroes load walk + run armatures; drop shared clips ─────────
a = s.index("  const loadHero = async (h) => {")
b = s.index("  const addBtn")
s = s[:a] + r'''  const loadHero = async (h) => { if (charSrc[h.id]) return; const [g, r, w] = await Promise.all([loadG(`assets/models/chars/${h.id}.glb`, `hero ${h.name}`), loadG(`assets/models/chars/${h.id}-run.glb`), loadG(`assets/models/chars/${h.id}-walk.glb`)]); if (g) charSrc[h.id] = { scene: g.scene, walk: (w && w.animations[0]) || g.animations[0], run: r && r.animations[0] }; };
''' + s[b:]
a = s.index("  await Promise.all([loadHero(HEROES.find((h) => h.id === startId)),")
b = s.index("\n", a) + 1
s = s[:a] + "  await loadHero(HEROES.find((h) => h.id === startId));\n" + s[b:]
# spawnPlayer: lazy-load the attack clip
rep("  player = makeActor(id); if (!player) return;", "  player = makeActor(id); if (!player) return; ensureAction(id).then(() => addAttack(player));")
# attack keys
rep("if (k === 'f' && player && !mountedOn) strike(player, 'slash');", "if (k === 'f' && player && !mountedOn) strike(player);")
s = s.replace("if (k === 'g' && !e.shiftKey && player && !mountedOn) strike(player, 'cast');", "if (k === 'g' && !e.shiftKey && player && !mountedOn) strike(player);")
s = s.replace("$('#tbF').addEventListener('touchstart', () => player && strike(player, 'slash'));", "$('#tbF').addEventListener('touchstart', () => player && strike(player));")
s = s.replace("w.strike(", "w.strike(")
io.open(p, 'w', encoding='utf8').write(s)
print('patch4 ok')
