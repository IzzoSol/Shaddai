/* world-anim.js — the ONE shared animation library on any Meshy v6 agent (24-bone skeleton).
 *
 *   const anim = window.buildAgentAnimator({ THREE, model, clips, meta, unitsPerMetre?, hipM? });
 *     model   the rigged GLB scene (gltf.scene) — call right after load, at rest pose (like attachUAL)
 *     clips   gltf.animations of /assets/anim/agent-clips.glb   (the library: skeleton + clips, no mesh)
 *     meta    /assets/anim/agent-clips.json                     (durations, loop, speedMps, tags, hitFrames …)
 *
 *   anim.setLocomotion(speedMps, grounded)  every frame: idle/walk/run(/sprint) blend by speed; the cycle is phase-
 *                                            locked and its rate = speed / stride, so walk alone plays at
 *                                            timeScale = speed / clip speedMps — the planted foot never slides.
 *                                            grounded false -> air loop; back to true -> land (automatic).
 *   anim.play(name, { fade, once, layer:'full'|'upper', onHit(i, name), onEnd(name), timeScale })
 *                                            one-shot or loop over locomotion. 'upper' = spine/arms/head only, legs
 *                                            keep walking (default for attacks that allow it: meta.clips[].upperOk).
 *   anim.stop(fade?)                         fade out every overlay.
 *   anim.jump() / anim.land() / anim.roll()  traversal hooks (jumpStart -> jumpLoop while airborne -> jumpLand).
 *   anim.update(dt)                          advance — allocation-free.
 *   anim.clip(name)                          the clip retargeted to THIS rig (built lazily, cached); anim.has(name)
 *   anim.rootMotion(name)                    [x, z] metres the source moved over the clip (clips are in place: move
 *                                            the capsule yourself if you want the lunge/roll distance)
 *   anim.debug                               live weights / timeScales (read-only, updated in place)
 *
 * Retarget: the library is stored on the canonical v6 bind (ZEROX). Per rig: L_t = A⁻¹·L_c·K for Hips, K_p⁻¹·L_c·K_b
 * for the rest, where K = canonical->target bind delta (full on Hips, twist about the bone for limbs). Identical rigs
 * skip it; the Hips path is scaled by the leg-length ratio and re-based on the rig's ankle height (feet on the floor).
 * Bones the model lacks are dropped from its clips. Pass gltf.scene itself as `model` (inverse binds are in its frame).
 */
(function () {
  'use strict';

  var LOCO = ['idle', 'walk', 'run', 'sprint'];
  var AIR_DELAY = 0.15;         // s ungrounded before a fall (no jump()) switches to the air loop
  var MAX_TS = 1.6;             // cap on locomotion timeScale beyond the fastest clip
  var SPEED_TAU = 0.1;          // s — smoothing of the requested speed (no weight pops)

  function buildAgentAnimator(o) {
    var THREE = o.THREE, model = o.model, meta = o.meta;
    if (!THREE || !model || !meta || !o.clips) throw new Error('buildAgentAnimator: THREE, model, clips, meta required');
    var skel = meta.skeleton, upm = o.unitsPerMetre || 1;
    var byName = {}; for (var i = 0; i < meta.clips.length; i++) byName[meta.clips[i].name] = meta.clips[i];
    var srcClips = {}; for (i = 0; i < o.clips.length; i++) srcClips[o.clips[i].name] = o.clips[i];

    // ── bones of this model + its bind (from the skin's inverse bind matrices when there is one) ──────
    var bone = {}, upperSet = {};
    model.traverse(function (n) { if (n.name && skel.bones.indexOf(n.name) >= 0 && !bone[n.name]) bone[n.name] = n; });
    for (i = 0; i < skel.upper.length; i++) upperSet[skel.upper[i]] = true;
    var hips = bone.Hips;
    if (!hips) throw new Error('buildAgentAnimator: model has no Hips bone');
    // bind of every bone in MODEL space (the gltf.scene frame): skin inverse bind matrices when there is a skin,
    // else the loaded rest pose. Positions are model units (metres in a Meshy GLB).
    model.updateMatrixWorld(true);
    var modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert(), bindW = {};
    model.traverse(function (n) {
      if (!n.isSkinnedMesh || !n.skeleton) return;
      var sk = n.skeleton;
      for (var j = 0; j < sk.bones.length; j++) {
        var b = sk.bones[j]; if (!bone[b.name] || bone[b.name] !== b || bindW[b.name]) continue;
        var m = new THREE.Matrix4().copy(sk.boneInverses[j]).invert(), bp = new THREE.Vector3(), bq = new THREE.Quaternion();
        m.decompose(bp, bq, new THREE.Vector3()); bindW[b.name] = { q: bq, p: bp };
      }
    });
    function restW(name) { var m = new THREE.Matrix4().multiplyMatrices(modelInv, bone[name].matrixWorld), bp = new THREE.Vector3(), bq = new THREE.Quaternion(); m.decompose(bp, bq, new THREE.Vector3()); return { q: bq, p: bp }; }
    // Re-packed GLBs (gltfpack / meshopt + KHR_mesh_quantization) can store inverse binds in a re-quantized frame that no longer
    // matches the skeleton (measured on the council agents: hips 0.17 m vs 1.05 m). The model is at its rest pose here (contract),
    // so when the skin's bind disagrees with the node rest pose by more than 5 cm at the hips, trust the rest pose for every bone.
    if (bindW.Hips && bone.Hips && bindW.Hips.p.distanceTo(restW('Hips').p) > 0.05) bindW = {};
    skel.bones.forEach(function (name) {
      if (!bone[name] || bindW[name]) return;
      bindW[name] = restW(name);
    });
    // the Armature (Hips parent) relative to the model: rotation A, and the inverse to map model space -> Hips local
    var armM = new THREE.Matrix4().multiplyMatrices(modelInv, hips.parent.matrixWorld), armInv = armM.clone().invert();
    var A = new THREE.Quaternion(); armM.decompose(new THREE.Vector3(), A, new THREE.Vector3());

    var I = new THREE.Quaternion(), K = {}, identity = A.angleTo(I) < 0.009;
    skel.bones.forEach(function (name) {
      if (!bone[name]) return;
      var c = skel.bindWorldQ[name], O = new THREE.Quaternion(c[0], c[1], c[2], c[3]).invert().multiply(bindW[name].q);
      if (name !== 'Hips') { O.set(0, O.y, 0, O.w); if (O.length() < 1e-6) O.set(0, 0, 0, 1); O.normalize(); }   // twist about the bone only
      if (O.angleTo(I) > 0.009) identity = false;   // > 0.5°
      K[name] = O;
    });
    // Hips path: library -> model space (canonical armature = uniform scale), scaled by the LEG-length ratio and
    // re-based on this rig's ankle height so the feet meet the floor; then into this rig's Hips-parent space.
    function dist(a, b) { return bindW[a] && bindW[b] ? bindW[a].p.distanceTo(bindW[b].p) : 0; }
    var legT = (dist('LeftUpLeg', 'LeftLeg') + dist('LeftLeg', 'LeftFoot') + dist('RightUpLeg', 'RightLeg') + dist('RightLeg', 'RightFoot')) / 2;
    var legRatio = legT > 0 ? legT / skel.legM : 1;
    var ankT = bindW.LeftFoot && bindW.RightFoot ? Math.min(bindW.LeftFoot.p.y, bindW.RightFoot.p.y) : skel.ankleM * legRatio;
    var hipsT = bindW.Hips.p, hipsC = skel.hipsM, sc = skel.armatureScale;
    if (Math.abs(legRatio - 1) > 0.002 || Math.abs(ankT - skel.ankleM) > 0.001 || Math.abs(hipsT.x - hipsC[0]) + Math.abs(hipsT.z - hipsC[2]) > 0.002) identity = false;
    if (identity) {   // the armature must also be the canonical one (same uniform scale, no offset)
      var ae = armM.elements; if (Math.abs(ae[0] - sc) + Math.abs(ae[5] - sc) + Math.abs(ae[10] - sc) + Math.abs(ae[12]) + Math.abs(ae[13]) + Math.abs(ae[14]) > 1e-4) identity = false;
    }

    // ── clip retarget (lazy, cached per name + part) ───────────────────────────────────────────────
    var cache = {};
    function retarget(name) {
      if (cache[name]) return cache[name];
      var src = srcClips[name]; if (!src) return null;
      var tracks = [];
      var qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), v = new THREE.Vector3();
      for (var t = 0; t < src.tracks.length; t++) {
        var tr = src.tracks[t], pn = THREE.PropertyBinding.parseTrackName(tr.name), bn = pn.nodeName, prop = pn.propertyName;
        if (!bone[bn]) continue;
        if (identity) { tracks.push(tr); continue; }
        var vals = new Float32Array(tr.values.length), k;
        if (prop === 'quaternion') {
          var parentName = bone[bn].parent && bone[bn].parent.name, Kp = bn === 'Hips' ? A : (K[parentName] || A);
          qb.copy(Kp).invert();
          for (k = 0; k < tr.values.length; k += 4) { qa.fromArray(tr.values, k); qa.premultiply(qb).multiply(K[bn]); qa.toArray(vals, k); }
          tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, tr.times, vals));
        } else if (prop === 'position' && bn === 'Hips') {
          for (k = 0; k < tr.values.length; k += 3) {
            v.fromArray(tr.values, k).multiplyScalar(sc);                                   // canonical model space
            v.set(hipsT.x + (v.x - hipsC[0]) * legRatio, ankT + (v.y - skel.ankleM) * legRatio, hipsT.z + (v.z - hipsC[2]) * legRatio);
            v.applyMatrix4(armInv); v.toArray(vals, k);
          }
          tracks.push(new THREE.VectorKeyframeTrack(tr.name, tr.times, vals));
        }
      }
      return (cache[name] = new THREE.AnimationClip(name, src.duration, tracks));
    }
    function part(name, which) {        // 'upper' | 'lower' subset of a retargeted clip
      var key = name + '#' + which; if (cache[key]) return cache[key];
      var c = retarget(name); if (!c) return null;
      var up = which === 'upper';
      var tr = c.tracks.filter(function (t) { return !!upperSet[THREE.PropertyBinding.parseTrackName(t.name).nodeName] === up; });
      return (cache[key] = new THREE.AnimationClip(key, c.duration, tr));
    }

    var mixer = o.mixer || new THREE.AnimationMixer(model);

    // ── size: clip speeds are for the canonical leg; strides scale with THIS agent's leg in world metres ──
    // (o.hipM = the agent's hip height in metres, if the host prefers to state it)
    var num = new Float64Array(3);   // [strideScale, full sum, upper sum] — doubles returned via this, never boxed
    // three's getMaxScaleOnAxis() returns a boxed double, so the world scale is re-read only every 32nd call (a model's
    // scale changes rarely); the result lives in num[0]
    var ssTick = 0;
    function strideScale() {
      if (o.hipM) { num[0] = o.hipM / skel.hipM; return; }
      if ((ssTick++ & 31) !== 0 && num[0] > 0) return;
      model.updateWorldMatrix(true, false);
      var s = legRatio * model.matrixWorld.getMaxScaleOnAxis() / upm;
      num[0] = s > 0.1 && s < 10 ? s : 1;
    }

    // ── locomotion slots: lower + upper actions each, phase-locked ─────────────────────────────────
    var slots = [], slotBy = {};
    LOCO.forEach(function (key) {
      var name = meta.locomotion[key]; if (!name || !srcClips[name] || !byName[name]) return;
      var m = byName[name], lo = mixer.clipAction(part(name, 'lower')), hi = mixer.clipAction(part(name, 'upper'));
      lo.setEffectiveWeight(0); hi.setEffectiveWeight(0); lo.timeScale = 0; hi.timeScale = 0; lo.play(); hi.play();
      var s = { key: key, idx: LOCO.indexOf(key), name: name, dur: m.duration, speed: m.speedMps || 0, phaseOff: m.footPhase || 0, lo: lo, hi: hi, w: 0, ts: 0, cts: key === 'idle' ? 1 : 0, wlo: 0, whi: 0, on: false };
      if (key === 'idle') { lo.timeScale = 1; hi.timeScale = 1; }
      slots.push(s); slotBy[key] = s;
    });
    var moving = slots.filter(function (s) { return s.key !== 'idle' && s.speed > 0; }).sort(function (a, b) { return a.speed - b.speed; });

    // ── overlays: a small fixed pool (2 full + 2 upper), crossfaded ─────────────────────────────────
    function mkOverlay() { return { action: null, name: '', meta: null, w: 0, target: 0, fade: 0.15, once: true, onHit: null, onEnd: null, hitIdx: 0, prevT: 0, age: 0, next: '', tag: '' }; }
    var full = [mkOverlay(), mkOverlay()], upper = [mkOverlay(), mkOverlay()];

    var sv = new Float64Array(3);   // [smoothed speed, cycle phase, seconds airborne] (typed array: a double field write can box)
    var st = { target: 0, grounded: true, jumping: false, fallLoop: false };
    // debug values live in typed arrays (a keyed double store would box a HeapNumber every frame); read via getters
    var dW = new Float64Array(4), dTS = new Float64Array(4), dS = new Float64Array(4);   // dS: full, upper, speed, stride
    function view(arr) { var o = {}; LOCO.forEach(function (k, i) { Object.defineProperty(o, k, { get: function () { return arr[i]; }, enumerable: true }); }); return o; }
    var debug = { w: view(dW), timeScale: view(dTS) };
    ['full', 'upper', 'speed', 'stride'].forEach(function (k, i) { Object.defineProperty(debug, k, { get: function () { return dS[i]; }, enumerable: true }); });

    function clearOverlay(ov) {
      if (ov.action) ov.action.stop();
      var cb = ov.onEnd, nm = ov.name;
      ov.action = null; ov.meta = null; ov.onHit = null; ov.onEnd = null; ov.w = 0; ov.target = 0; ov.next = ''; ov.tag = '';
      if (cb) cb(nm);
    }
    function startOverlay(pool, name, opts, layer) {
      var clip = layer === 'upper' ? part(name, 'upper') : retarget(name); if (!clip) return false;
      var m = byName[name] || {};
      var action = mixer.clipAction(clip), carry = 0;
      // slot 0 = newest (fading in), slot 1 = the one it replaces (fading out); the oldest is dropped
      var old = pool[1], cur = pool[0];
      if (old.action && old.action !== action) clearOverlay(old);
      pool[0] = old; pool[1] = cur;
      if (cur.action === action) { carry = cur.w; cur.action = null; cur.onEnd = null; clearOverlay(cur); }   // re-trigger: restart in place
      else if (cur.action) cur.target = 0;
      if (old.action === action) { carry = old.w; old.action = null; }
      var ov = pool[0], once = opts.once !== undefined ? !!opts.once : !m.loop;
      action.reset(); action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); action.clampWhenFinished = true;
      action.timeScale = opts.timeScale || 1; action.setEffectiveWeight(carry); action.play();
      ov.action = action; ov.name = name; ov.meta = m; ov.w = carry; ov.target = 1; ov.fade = opts.fade !== undefined ? opts.fade : 0.15;
      ov.once = once; ov.onHit = opts.onHit || null; ov.onEnd = opts.onEnd || null; ov.hitIdx = 0; ov.prevT = 0; ov.age = 0; ov.next = opts.next || ''; ov.tag = opts.tag || '';
      if (pool[1].action) pool[1].fade = ov.fade;
      return true;
    }
    var chainOpts = { fade: 0.15, once: false, layer: 'full', tag: 'air' };   // reused: chaining happens inside update()

    var api = {
      mixer: mixer, meta: meta, debug: debug, retargeted: !identity,
      has: function (name) { return !!srcClips[name]; },
      clip: retarget,
      rootMotion: function (name) { var m = byName[name]; return m ? m.rootMotionM : null; },
      setLocomotion: function (speedMps, grounded) {
        st.target = speedMps > 0 ? speedMps : 0;
        var g = grounded !== false;
        if (g && !st.grounded && (st.jumping || st.fallLoop)) { st.grounded = true; api.land(); }
        st.grounded = g;
      },
      play: function (name, opts) {
        opts = opts || {};
        var m = byName[name]; if (!m || !srcClips[name]) return false;
        var layer = opts.layer || (m.upperOk && sv[0] > 0.3 ? 'upper' : 'full');
        return startOverlay(layer === 'upper' ? upper : full, name, opts, layer);
      },
      stop: function (fade) {
        for (var i = 0; i < 2; i++) { full[i].target = 0; upper[i].target = 0; if (fade !== undefined) { full[i].fade = fade; upper[i].fade = fade; } }
        st.jumping = false; st.fallLoop = false;
      },
      jump: function () {
        var a = meta.actions; st.jumping = true; st.fallLoop = false;
        return a.jumpStart ? api.play(a.jumpStart, { fade: 0.06, once: true, layer: 'full', next: a.jumpLoop || '', tag: 'air' }) : false;
      },
      land: function () {
        var a = meta.actions, was = st.jumping || st.fallLoop; st.jumping = false; st.fallLoop = false;
        strideScale(); var walk = slotBy.walk ? slotBy.walk.speed * num[0] : 1.5;
        if (st.target > walk * 0.6 || !a.jumpLand) { if (was) { full[0].target = 0; full[0].fade = 0.12; } return false; }   // moving: blend straight back
        return api.play(a.jumpLand, { fade: 0.05, once: true, layer: 'full', timeScale: 1.4 });
      },
      roll: function () { var a = meta.actions; return a.roll ? api.play(a.roll, { fade: 0.06, once: true, layer: 'full' }) : false; },
      update: update,
    };

    function stepOverlays(pool, dt, out) {
      var total = 0;
      for (var i = 0; i < 2; i++) {
        var ov = pool[i]; if (!ov.action) continue;
        ov.age += dt;
        var dur = ov.action.getClip().duration;
        // once: start fading out so the fade ends with the clip
        if (ov.once && ov.target > 0) {
          var fo = Math.min(ov.fade > 0 ? ov.fade : 0.15, dur * 0.25);
          if (ov.action.time >= dur - fo * ov.action.timeScale || !ov.action.isRunning() && ov.age > 0.05) {
            ov.target = 0; ov.fade = fo;
            if (ov.next && pool === full && !st.grounded) { var nx = ov.next; ov.next = ''; if (nx === meta.actions.jumpLoop) st.fallLoop = true; chainOpts.fade = fo; api.play(nx, chainOpts); stepOverlays(pool, 0, out); return; }
          }
        }
        var rate = ov.fade > 0 ? dt / ov.fade : 1;
        if (ov.w < ov.target) ov.w = Math.min(ov.target, ov.w + rate); else if (ov.w > ov.target) ov.w = Math.max(ov.target, ov.w - rate);
        if (i === 1) ov.w = Math.min(ov.w, 1 - pool[0].w);       // the older one never pushes the sum past 1
        total += ov.w;
      }
      num[out] = total;
    }
    function fireHits(ov) {
      if (!ov.action || !ov.meta || !ov.meta.hitTimes) { if (ov.action) ov.prevT = ov.action.time; return; }
      var t = ov.action.time, h = ov.meta.hitTimes;
      while (ov.hitIdx < h.length && h[ov.hitIdx] <= t && h[ov.hitIdx] > ov.prevT - 1e-6) { if (ov.onHit) ov.onHit(ov.hitIdx, ov.name); ov.hitIdx++; }
      while (ov.hitIdx < h.length && h[ov.hitIdx] <= ov.prevT) ov.hitIdx++;
      ov.prevT = t;
    }
    function retire(pool) {
      for (var i = 0; i < 2; i++) if (pool[i].action && pool[i].w <= 0 && pool[i].target <= 0) clearOverlay(pool[i]);
    }

    function update(dt) {
      if (!(dt > 0)) dt = 0;
      if (dt > 0.1) dt = 0.1;
      // requested speed, smoothed; air state
      sv[0] += (st.target - sv[0]) * (1 - Math.exp(-dt / SPEED_TAU));
      if (!st.grounded) {
        sv[2] += dt;
        if (sv[2] > AIR_DELAY && !st.jumping && !st.fallLoop && meta.actions.jumpLoop) { st.fallLoop = true; chainOpts.fade = 0.2; api.play(meta.actions.jumpLoop, chainOpts); }
      } else sv[2] = 0;

      // locomotion weights (sum to 1) + phase-locked cycle
      strideScale(); var sc = num[0], v = sv[0], i, s;
      for (i = 0; i < slots.length; i++) { slots[i].w = 0; slots[i].ts = 0; }
      var idle = slotBy.idle, stride = 0, rate = 0;
      if (moving.length === 0 || v < 1e-3) { if (idle) idle.w = 1; else if (moving.length) moving[0].w = 1; }
      else {
        var lo = moving[0], sLo = lo.speed * sc;
        if (v <= sLo) {                                  // idle -> slowest gait
          var a = idle ? Math.min(1, v / (0.5 * sLo)) : 1;
          lo.w = a; if (idle) idle.w = 1 - a;
          stride = sLo * lo.dur;
        } else {
          var j = 0; while (j < moving.length - 1 && v > moving[j + 1].speed * sc) j++;
          var A1 = moving[j], B1 = moving[j + 1];
          if (!B1) { A1.w = 1; stride = A1.speed * sc * A1.dur; if (v / (A1.speed * sc) > MAX_TS) stride = v / MAX_TS * A1.dur; }
          else {
            var sa = A1.speed * sc, sb = B1.speed * sc, t = (v - sa) / (sb - sa);
            A1.w = 1 - t; B1.w = t;
            stride = (sa * A1.dur) * (1 - t) + (sb * B1.dur) * t;
          }
        }
        rate = stride > 0 ? v / stride : 0;             // cycles per second, shared by every gait
        sv[1] = (sv[1] + rate * dt) % 1;
      }
      stepOverlays(full, dt, 1); stepOverlays(upper, dt, 2); var F = num[1], U = num[2];
      if (F > 1) F = 1; if (U > 1) U = 1;
      for (i = 0; i < slots.length; i++) {
        s = slots[i];
        // the mixer advances each gait at timeScale = cycles/s × duration, so all gaits share one phase; a gait that
        // fades in is snapped onto that phase first. Fields are written only on change (three boxes each double write).
        if (s.key === 'idle') s.ts = 1;
        else {
          s.ts = rate * s.dur;
          if (s.w > 0 && !s.on) { var t0 = (((sv[1] - rate * dt + s.phaseOff) % 1 + 1) % 1) * s.dur; s.lo.time = t0; s.hi.time = t0; }
          if (s.ts !== s.cts) { s.lo.timeScale = s.ts; s.hi.timeScale = s.ts; s.cts = s.ts; }
        }
        s.on = s.w > 0;
        var wl = s.w * (1 - F), wh = wl * (1 - U);
        if (wl !== s.wlo) { s.lo.setEffectiveWeight(wl); s.wlo = wl; }
        if (wh !== s.whi) { s.hi.setEffectiveWeight(wh); s.whi = wh; }
        dW[s.idx] = s.w; dTS[s.idx] = s.ts;
      }
      for (i = 0; i < 2; i++) {
        if (full[i].action) full[i].action.setEffectiveWeight(full[i].w);
        if (upper[i].action) upper[i].action.setEffectiveWeight(upper[i].w * (1 - F));
      }
      dS[0] = F; dS[1] = U; dS[2] = v; dS[3] = stride;
      mixer.update(dt);
      for (i = 0; i < 2; i++) { fireHits(full[i]); fireHits(upper[i]); }
      retire(full); retire(upper);
    }

    return api;
  }

  var root = typeof window !== 'undefined' ? window : globalThis;
  root.buildAgentAnimator = buildAgentAnimator;
})();
