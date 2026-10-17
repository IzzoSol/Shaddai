/* world-footprints.js — FOOTPRINTS in snow and sand (owner 2026-10-02: "snow steps ... the small stuff that makes a game look amazing", real not overdone).
 *   One InstancedMesh (1 draw call, 64 prints). A print is stamped every STRIDE metres of ground travel, alternating left/right, oriented along the walk direction,
 *   and fades back into the surface over ~14 s (colour lerps to the ground tint, then it shrinks away). Only on soft ground and only while grounded and moving.
 *   Pure stepping logic is separate and tested: createStepper({stride}) .update(x, z, grounded, dt) -> stamp | null
 *   Host: var fp = buildWorldFootprints({ THREE, scene, heightAt, getPlayer, surfaceAt }); fp.update(dt)   surfaceAt(x,z) -> 'snow' | 'sand' | null
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8, STRIDE_M = 0.62, SIDE_M = 0.16, LIFE_S = 14, MAX = 64;
  var KINDS = { snow: { tint: 0x8fa7c4, ground: 0xf2f6fb, w: 0.16, l: 0.34, lift: 0.025 }, sand: { tint: 0x9c8052, ground: 0xe3c98f, w: 0.15, l: 0.32, lift: 0.02 } };
  function createStepper(o) {
    o = o || {}; var stride = o.stride || STRIDE_M, lx = null, lz = null, acc = 0, foot = 1, yaw = 0;
    return { update: function (x, z, grounded, dt) {
      if (lx === null) { lx = x; lz = z; return null; }
      var dx = x - lx, dz = z - lz, d = Math.sqrt(dx * dx + dz * dz); lx = x; lz = z;
      if (!grounded || d > 6 || d < 1e-6) { if (!grounded) acc = 0; return null; }   // airborne, teleport, or standing still
      yaw = Math.atan2(dx, dz); acc += d;
      if (acc < stride) return null; acc -= stride; foot = -foot;
      return { x: x + Math.cos(yaw) * SIDE_M * foot, z: z - Math.sin(yaw) * SIDE_M * foot, yaw: yaw, foot: foot };
    }, reset: function () { lx = null; acc = 0; } };
  }
  function build(o) {
    var THREE = o.THREE, scene = o.scene, U = o.U || U0, heightAt = o.heightAt, getPlayer = o.getPlayer, surfaceAt = o.surfaceAt || function () { return null; };
    var geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    var im = new THREE.InstancedMesh(geo, mat, MAX); im.frustumCulled = false; im.count = 0; im.renderOrder = 1; scene.add(im);
    var prints = [], head = 0, st = createStepper(), mtx = new THREE.Object3D(), c = new THREE.Color(), cTint = new THREE.Color(), cGround = new THREE.Color(), lastKind = null;
    function stamp(s, kind) {
      var K = KINDS[kind], p = { x: s.x, z: s.z, yaw: s.yaw, t: 0, kind: kind }; prints[head % MAX] = p; head++;
      im.count = Math.min(MAX, head);
    }
    function refresh() {
      for (var i = 0; i < Math.min(MAX, head); i++) {
        var p = prints[i]; if (!p) continue; var K = KINDS[p.kind], a = p.t / LIFE_S, k = Math.max(0, Math.min(1, a)), sc = a > 0.75 ? Math.max(0, 1 - (a - 0.75) * 4) : 1;
        mtx.position.set(p.x, heightAt(p.x, p.z) + K.lift * U, p.z); mtx.rotation.set(0, p.yaw, 0); mtx.scale.set(K.w * U * sc, 1, K.l * U * sc); mtx.updateMatrix(); im.setMatrixAt(i, mtx.matrix);
        cTint.setHex(K.tint); cGround.setHex(K.ground); c.copy(cTint).lerp(cGround, k * 0.85); im.setColorAt(i, c);
      }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    var acc = 0;
    return {
      update: function (dt) {
        var P = getPlayer(); if (!P) return; var pos = P.pos || P, kind = surfaceAt(pos.x, pos.z);
        var s = st.update(pos.x / U, pos.z / U, P.grounded !== false && !P.flying, dt);   // stepper works in metres
        if (s && kind && KINDS[kind]) stamp({ x: s.x * U, z: s.z * U, yaw: s.yaw }, kind);
        var changed = !!(s && kind); for (var i = 0; i < prints.length; i++) if (prints[i]) { prints[i].t += dt; changed = true; }
        acc += dt; if (changed && acc > 0.1) { acc = 0; refresh(); }
      },
      stats: function () { return { prints: im.count }; }, dispose: function () { scene.remove(im); geo.dispose(); mat.dispose(); }, _prints: prints
    };
  }
  root.WorldFootprints = { createStepper: createStepper, KINDS: KINDS, STRIDE_M: STRIDE_M, LIFE_S: LIFE_S, MAX: MAX };
  root.buildWorldFootprints = build;
})(typeof window !== 'undefined' ? window : globalThis);
