// SHADDAI · ual-retarget.js — Universal Animation Library 2 (Quaternius, CC0) on ANY of our rigged bodies.
//
//   import { attachUAL } from '/ual-retarget.js';
//   const ual = attachUAL(THREE, body, mixer, clipsObj);   // call right after the body loads
//   await ual.ready;  ual.add('Sword_Regular_A')  -> clipsObj['ual_Sword_Regular_A'] = mixer.clipAction(...)
//
// Data: /assets/anims/ual2-dirs.json, baked by tools/ual/bake-ual.mjs — per frame, the unit direction each
// limb points (facing +Z, hip height 1). Here we AIM this body's own bones along those directions, each
// relative to how its parent moved, so bone lengths never change (no stretching — the reason cross-body
// retargeting deformed agents before) and feet are aimed heel->toe. Works across rigs whose rest poses
// differ (NEXUS/PIKADON hips are axis-rotated vs QUILL/ZEROX) because everything is solved in body space.

const DATA_URL = '/assets/anims/ual2-dirs.json';
let dataP = null;
const loadData = () => (dataP = dataP || fetch(DATA_URL).then((r) => { if (!r.ok) throw new Error('ual data ' + r.status); return r.json(); }));

// find bones by role: Meshy (Hips/Spine02/Spine01/Spine/neck) and Mixamo (Hips/Spine/Spine1/Spine2/Neck) naming
function findRig(body) {
  const all = []; body.traverse((o) => { if (o.isBone) all.push(o); });
  const norm = (n) => n.toLowerCase().replace(/^mixamorig[:_]?/, '');
  const by = (re) => all.find((b) => re.test(norm(b.name)));
  const hips = by(/^hips$/) || by(/hip|pelvis/); if (!hips) return null;
  const spine = []; let cur = hips;   // follow the spine chain upward from the hips
  for (let i = 0; i < 6; i++) { const nx = cur.children.find((c) => c.isBone && /spine|chest/.test(norm(c.name))); if (!nx) break; spine.push(nx); cur = nx; }
  const neck = cur.children.find((c) => c.isBone && /neck/.test(norm(c.name))) || by(/^neck/);
  const head = (neck && neck.children.find((c) => c.isBone && /head/.test(norm(c.name)))) || by(/^head$/);
  const side = (s) => ({
    clav: by(new RegExp('^' + s + '(shoulder|clavicle)$')), arm: by(new RegExp('^' + s + '(arm|upperarm)$')),
    fore: by(new RegExp('^' + s + '(forearm|lowerarm)$')), hand: by(new RegExp('^' + s + 'hand$')),
    leg: by(new RegExp('^' + s + '(upleg|thigh)$')), shin: by(new RegExp('^' + s + '(leg|calf|shin)$')),
    foot: by(new RegExp('^' + s + 'foot$')), toe: by(new RegExp('^' + s + '(toebase|toe|ball)')),
  });
  return { hips, spine, neck, head, L: side('left'), R: side('right') };
}

export function attachUAL(THREE, body, mixer, clipsObj, opts = {}) {
  const prefix = opts.prefix || 'ual_';
  const rig = findRig(body);
  const api = { ok: false, ready: Promise.resolve(false), add: () => null, names: [] };
  if (!rig || !mixer) return api;

  // canonical key -> [bone, child it points at]; the order is parent-first so parents are solved before children
  const S = rig.spine;
  const chain = [
    ['spineA', S[0], S[1] || rig.neck], ['spineB', S[1], S[2] || rig.neck], ['spineC', S[2], rig.neck], ['neck', rig.neck, rig.head],
    ['clavL', rig.L.clav, rig.L.arm], ['armL', rig.L.arm, rig.L.fore], ['foreL', rig.L.fore, rig.L.hand],
    ['clavR', rig.R.clav, rig.R.arm], ['armR', rig.R.arm, rig.R.fore], ['foreR', rig.R.fore, rig.R.hand],
    ['legL', rig.L.leg, rig.L.shin], ['shinL', rig.L.shin, rig.L.foot], ['footL', rig.L.foot, rig.L.toe],
    ['legR', rig.R.leg, rig.R.shin], ['shinR', rig.R.shin, rig.R.foot], ['footR', rig.R.foot, rig.R.toe],
  ].filter(([, b, c]) => b && c);
  const driven = [rig.hips, ...chain.map((c) => c[1])];

  // ── capture THIS body's bind pose in body space ───────────────────────────────────────────────
  // NOTE: never skeleton.pose() here — it rebuilds bones from boneInverses in UNSCALED world space, which
  // drops the hips through the floor once the host has scaled/placed the body. The loaded node TRS IS the
  // rest pose, so attach before the mixer first updates (hosts call this right after load).
  body.updateMatrixWorld(true);
  const bodyInvQ = new THREE.Quaternion(), bodyInvM = new THREE.Matrix4();
  const refreshBody = () => { body.updateWorldMatrix(true, false); bodyInvM.copy(body.matrixWorld).invert(); body.getWorldQuaternion(bodyInvQ).invert(); };
  refreshBody();
  const qB = (o, out = new THREE.Quaternion()) => o.getWorldQuaternion(out).premultiply(bodyInvQ);          // world quat in body space
  const pB = (o, out = new THREE.Vector3()) => out.setFromMatrixPosition(o.matrixWorld).applyMatrix4(bodyInvM); // world pos in body space
  const rest = new Map();
  for (const b of driven) rest.set(b, { lq: b.quaternion.clone(), lp: b.position.clone(), q: qB(b), p: pB(b) });
  for (const [, b, c] of chain) rest.get(b).dir = pB(c).sub(rest.get(b).p).normalize();
  // facing (+Z in the baked data) -> this body's forward, from the feet; hip height above the lowest foot
  const fw = new THREE.Vector3();
  for (const s of [rig.L, rig.R]) if (s.foot && s.toe) fw.add(pB(s.toe).sub(pB(s.foot)));
  fw.y = 0; if (fw.lengthSq() < 1e-8) fw.set(0, 0, 1); fw.normalize();
  const face = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fw);
  const faceInv = face.clone().invert();
  const footY = Math.min(...[rig.L.foot, rig.R.foot].filter(Boolean).map((f) => pB(f).y));
  const hipH = Math.max(1e-4, rest.get(rig.hips).p.y - footY);
  const restPose = () => { for (const b of driven) { const r = rest.get(b); b.quaternion.copy(r.lq); b.position.copy(r.lp); } body.updateMatrixWorld(true); };

  // ── per-frame solve ───────────────────────────────────────────────────────────────────────────
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
  function solveFrame(data, clip, f) {
    const K = data.keys, dirs = clip.dirs, base = f * K.length * 3;
    // hips: rotation delta since rest (baked in +Z space) mapped into body space, then height/sway
    const h = clip.hipQ;
    _q.set(h[f * 4], h[f * 4 + 1], h[f * 4 + 2], h[f * 4 + 3]).normalize();
    _q2.copy(face).multiply(_q).multiply(faceInv).multiply(rest.get(rig.hips).q);        // desired hips quat, body space
    const hp = rig.hips.parent; hp.updateWorldMatrix(true, false); qB(hp, _pq);
    rig.hips.quaternion.copy(_pq.invert().multiply(_q2));
    const P = clip.hipP;
    _v.set(P[f * 3], P[f * 3 + 1], P[f * 3 + 2]).applyQuaternion(face).multiplyScalar(hipH).add(rest.get(rig.hips).p);
    _v.applyMatrix4(body.matrixWorld); hp.worldToLocal(_v); rig.hips.position.copy(_v);
    rig.hips.updateMatrixWorld(true);
    // limbs: carry the rest orientation along with the parent, then swing it onto the baked direction
    for (const [key, b] of chain) {
      const k = K.indexOf(key); if (k < 0) continue;
      const r = rest.get(b), par = b.parent;
      _d.set(dirs[base + k * 3], dirs[base + k * 3 + 1], dirs[base + k * 3 + 2]).applyQuaternion(face).normalize();
      par.updateWorldMatrix(true, false); qB(par, _pq);
      const parRest = rest.get(par);
      const parRestQ = parRest ? parRest.q : _q.copy(qB(par)).clone();           // undriven parent (e.g. hands) -> no delta
      const delta = _q.copy(_pq).multiply(parRestQ.clone().invert());            // how the parent moved since rest
      const carried = delta.clone().multiply(r.q);                                // rest orientation carried by the parent
      const carriedDir = r.dir.clone().applyQuaternion(delta);
      const swing = _q2.setFromUnitVectors(carriedDir.normalize(), _d);
      const want = swing.multiply(carried);                                       // desired body-space orientation
      b.quaternion.copy(_pq.clone().invert().multiply(want));
      b.updateMatrixWorld(true);
    }
  }

  const cache = new Map();
  function build(data, name) {
    const clip = data.clips[name]; if (!clip) return null;
    refreshBody();
    const n = clip.n, times = new Float32Array(n);
    const qv = driven.map(() => new Float32Array(n * 4)), pv = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      times[f] = Math.min(clip.dur, f / data.fps);
      solveFrame(data, clip, f);
      driven.forEach((b, i) => { qv[i].set([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], f * 4); });
      pv.set([rig.hips.position.x, rig.hips.position.y, rig.hips.position.z], f * 3);
    }
    restPose();
    const tracks = driven.map((b, i) => new THREE.QuaternionKeyframeTrack(b.uuid + '.quaternion', times, qv[i]));
    tracks.push(new THREE.VectorKeyframeTrack(rig.hips.uuid + '.position', times, pv));
    return new THREE.AnimationClip(prefix + name, clip.dur, tracks);
  }

  api.ok = true;
  api.ready = loadData().then((data) => { api.names = Object.keys(data.clips); api._data = data; return true; }).catch((e) => { console.warn('[ual] ' + e.message); return false; });
  api.add = (name) => {
    if (!api._data) return null;
    const key = prefix + name;
    if (clipsObj[key]) return clipsObj[key];
    let clip = cache.get(name);
    if (!clip) { clip = build(api._data, name); if (!clip) return null; cache.set(name, clip); }
    return (clipsObj[key] = mixer.clipAction(clip));
  };
  api.addAll = (names) => (names || api.names).map(api.add).filter(Boolean).length;
  api.rig = rig;
  return api;
}
