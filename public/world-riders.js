/* world-riders.js — ONE generic rider system: agents RIDE boards, bikes, cars, ships, beasts and dragons (2026-09-28).
 *
 * Owner rule (FAL-MODEL-MAP "Riders on mounts"): never generate agent+mount combos. Every vehicle exposes a SEAT
 * SOCKET, every agent is on the shared 24-bone Meshy skeleton (Hips, Spine02, Spine01, Spine, neck, Head,
 * Left/Right Shoulder/Arm/ForeArm/Hand/UpLeg/Leg/Foot/ToeBase; Armature scaled 0.01), and ONE stance per seat type
 * works on all 7 agents. $0 per combination.
 *
 *   var riders = window.buildRiders({ THREE, scene,
 *     loadCharacter: function (NAME) → Promise<gltf>,   // optional (host: _pcPreload) — else loader + characterUrl
 *     loader, characterUrl: function (NAME) → url,      // default '/assets/agents/NAME.glb?v=12'
 *     cloneSkinned,                                     // SkeletonUtils.clone (needed to reuse a cached gltf)
 *     bodyHeight: 7,                                    // world units (1.8 m)
 *     animLib: { clips, meta },                         // optional: /assets/anim/agent-clips.glb animations + .json → world-anim.js
 *     animatorFor: function (model, gltf) → {play(name), update(dt)} | null   // optional custom clip source
 *   });
 *   riders.mount(rider, vehicle, { seat: 'seat'|'stand'|'saddle', socket: 'seat'|'seat2'|…, visible: fn|bool })
 *   riders.dismount(rider [, instant])
 *   riders.sync(rider, on, vehicle, seat)      // edge-triggered mount/dismount (one line of host glue per vehicle)
 *   riders.update(dt)                          // after vehicles have placed themselves for the frame
 *   riders.setInput(rider, lean, crouch)       // lean −1..1 (right +), crouch 0..1 — blended into the stance
 *   riders.spawnCompanion('ORACLE', vehicle, 'seat2', {seat:'seat'}) → handle (placeholder capsule until the GLB lands)
 *   riders.isMounted(rider), riders.handle(rider), riders.count()
 *
 * VEHICLES — anything with a socket:
 *   • an Object3D with descendants named 'seat' / 'seat2' / 'stand' / 'saddle' (riders.addSocket helps). Optional
 *     limb targets as Object3Ds on socket.userData: pegL, pegR, gripL, gripR; overrides: lean (rad), hipUpM.
 *   • riders.poseVehicle(src, {yaw:'yaw', pitch:'pitch', bank:'bank', pitchSign, bankSign, seats:{name:[x,y,z] m}})
 *     for pure-data vehicles (the dragon ride's saddle(), sky-traffic ship states).
 *   • riders.bikeVehicle(gridBike, veh.bike.points), riders.dragonVehicle(dragonRide), riders.skyShipVehicle(ship)
 *   • or your own {socket(name, outPos, outQuat) → bool, lean?() , crouch?()}.
 *
 * POSES: a stance clip plays when an animator exists (world-anim.js buildAgentAnimator / animatorFor: 'ride_sit',
 * 'ride_stand', 'ride_saddle'); either way the limbs are then solved PROCEDURALLY on the rider's own bones with
 * window.WorldRiderPose (world-actions.js: world-space aim + analytic two-bone IK, rig-agnostic) — feet on pegs /
 * straddling the saddle / along the deck, hands on grips or reins, spine lean + crouch from vehicle input. With no
 * skeleton (placeholder capsule) the root alone is seated.
 *
 * update() allocates nothing (all scratch is preallocated per handle / module).
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8;

  // stance table — metres in the SOCKET frame (+Z vehicle forward, +Y up, +X vehicle LEFT)
  var STANCES = {
    seat: {                           // bike / car / ship: hips on the seat, knees forward, hands on grips or knees
      clip: ['ride_sit', 'Sit_Chair_Loop'], yaw: 0, hipUpM: 0.08, leanRad: 0.14, maxLeanRad: 0.3, crouchRad: 0.45,
      feet: [[0.2, -0.42, 0.38], [-0.2, -0.42, 0.38]],
      hands: [[0.17, -0.08, 0.36], [-0.17, -0.08, 0.36]],        // resting on the knees when there are no grips
      kneePole: 'fwd',
    },
    saddle: {                         // dragon / beast: straddle, knees out, hands forward on the reins
      clip: ['ride_saddle', 'ride_sit', 'Sit_Chair_Loop'], yaw: 0, hipUpM: 0.05, leanRad: 0.26, maxLeanRad: 0.35, crouchRad: 0.5,
      feet: [[0.42, -0.5, 0.1], [-0.42, -0.5, 0.1]],
      hands: [[0.14, 0.12, 0.42], [-0.14, 0.12, 0.42]],
      kneePole: 'out',
    },
    stand: {                          // hoverboard: side-on surf stance, feet along the deck, arms out
      clip: ['ride_stand'], yaw: -Math.PI / 2, dropM: 0.2, leanRad: 0.22, maxLeanRad: 0.35, crouchRad: 0.35, crouchDropM: 0.25,
      feet: [[0, 0, 0.31], [0, 0, -0.31]],                       // [0] = rider's LEFT foot at the nose
      hands: null,
      kneePole: 'chest',
    },
  };

  root.buildRiders = function (opts) {
    var THREE = opts && opts.THREE;
    if (!THREE) return null;
    var scene = opts.scene || null;
    var V3 = THREE.Vector3, Q = THREE.Quaternion;
    var BODY_H = opts.bodyHeight || 7;
    var MOUNT_T = opts.mountTime || 0.35;
    var handles = [];                         // live handles (mounted or blending off)
    var byRider = (typeof Map !== 'undefined') ? new Map() : null;

    // module scratch
    var _P = new V3(), _Q = new Q(), _S = new V3(), _F = new V3(), _Up = new V3(), _L = new V3(), _ch = new V3();
    var _rq = new Q(), _yq = new Q(), _lq = new Q(), _root = new V3(), _tmp = new V3(), _upR = new V3();
    var _eu = new THREE.Euler(0, 0, 0, 'YXZ'), _AY = new V3(0, 1, 0);

    function lookup(rider) {
      if (byRider) return byRider.get(rider) || null;
      for (var i = 0; i < handles.length; i++) if (handles[i].rider === rider) return handles[i];
      return null;
    }

    // ── vehicle adapters ──
    function findSocket(obj, name) {
      var cache = obj.userData.__sockets || (obj.userData.__sockets = {});
      if (cache[name] !== undefined) return cache[name];
      var hit = null;
      obj.traverse(function (o) { if (!hit && o !== obj && o.name === name) hit = o; });
      cache[name] = hit;
      return hit;
    }
    function objectVehicle(obj) {
      if (obj.userData.__riderVehicle) return obj.userData.__riderVehicle;
      var v = {
        root: obj,
        socketObj: function (name) { return findSocket(obj, name); },
        socket: function (name, outP, outQ) {
          var s = findSocket(obj, name); if (!s) return false;
          s.updateWorldMatrix(true, false);
          s.matrixWorld.decompose(outP, outQ, _S);
          return true;
        },
      };
      obj.userData.__riderVehicle = v;
      return v;
    }
    function asVehicle(v) {
      if (!v) return null;
      if (typeof v.socket === 'function') return v;
      if (v.isObject3D) return objectVehicle(v);
      return null;
    }
    function addSocket(obj, name, x, y, z, o) {
      var s = new THREE.Object3D(); s.name = name; s.position.set(x, y, z);
      if (o && o.yaw) s.rotation.y = o.yaw;
      if (o) for (var k in o) if (k !== 'yaw') s.userData[k] = o[k];
      obj.add(s);
      if (obj.userData.__sockets) delete obj.userData.__sockets[name];
      return s;
    }
    // data-driven vehicle: src (object or getter) with x/y/z + yaw/pitch/bank fields; seats in metres
    function poseVehicle(src, o) {
      o = o || {};
      var ky = o.yaw || 'yaw', kp = o.pitch === undefined ? 'pitch' : o.pitch, kb = o.bank === undefined ? 'bank' : o.bank;
      var ps = o.pitchSign === undefined ? 1 : o.pitchSign, bs = o.bankSign === undefined ? 1 : o.bankSign;
      var seats = o.seats || { seat: [0, 0, 0] }, unit = o.unit || U;
      var off = new V3(), eu = new THREE.Euler(0, 0, 0, 'YXZ');
      return {
        src: src,
        socket: function (name, outP, outQ) {
          var p = typeof src === 'function' ? src() : src;
          var sd = seats[name] || (name === o.defaultSeat ? seats[o.defaultSeat] : null);
          if (!p || !sd) return false;
          eu.set(kp ? ps * (p[kp] || 0) : 0, p[ky] || 0, kb ? bs * (p[kb] || 0) : 0, 'YXZ');
          outQ.setFromEuler(eu);
          var sc = typeof o.scale === 'function' ? o.scale(p) : (o.scale || 1);
          off.set(sd[0] * unit * sc, sd[1] * unit * sc, sd[2] * unit * sc).applyQuaternion(outQ);
          outP.set(p.x + off.x, p.y + off.y, p.z + off.z);
          return true;
        },
        lean: o.lean || null, crouch: o.crouch || null,
      };
    }
    // Grid Bike (world-actions.js veh.bike): sockets on the gridBike mesh at its BIKE_PTS (bike-local, pre-scale)
    function bikeVehicle(mesh, pts, bike) {
      if (!mesh) return null;
      if (!findSocket(mesh, 'seat')) {
        var P = pts || { seat: [0, 1.1, -0.62], gripL: [0.3, 1.15, 0.4], gripR: [-0.3, 1.15, 0.4], pegL: [0.3, 0.35, -1.2], pegR: [-0.3, 0.35, -1.2] };
        var mk = function (n, a) { var q = new THREE.Object3D(); q.name = n; q.position.set(a[0], a[1], a[2]); mesh.add(q); return q; };
        addSocket(mesh, 'seat', P.seat[0], P.seat[1], P.seat[2], {
          pegL: mk('pegL', P.pegL), pegR: mk('pegR', P.pegR), gripL: mk('gripL', P.gripL), gripR: mk('gripR', P.gripR),
          lean: 0.73, hipUpM: 0.08,                     // sport tuck (bike leanDeg 42)
        });
        addSocket(mesh, 'seat2', P.seat[0], P.seat[1] + 0.05, P.seat[2] - 0.55, { lean: 0.3 });   // pillion
      }
      var v = objectVehicle(mesh);
      if (bike && bike.speedMS && bike.tune) v.crouch = function () { return Math.min(1, Math.abs(bike.speedMS()) / bike.tune.topMS); };
      return v;
    }
    // Dragon ride (world-dragon-ride.js): saddle() = {x,y,z,yaw,pitch,bank}; visual uses rotation(−pitch, yaw, −bank)
    function dragonVehicle(ride) {
      var v = poseVehicle(function () { return ride.saddle(); }, { pitchSign: -1, bankSign: -1,
        seats: { saddle: [0, 0, 0], seat: [0, 0, 0], seat2: [0, 0.05, -1.2] } });
      v.crouch = function () { return ride.boosting && ride.boosting() ? 1 : 0; };
      return v;
    }
    // Sky-traffic ship state (world-sky-traffic.js): {x,y,z,heading,bank,type:{def:{scale},mesh}}; seat on the hull top
    function skyShipVehicle(ship) {
      var topM = 1;
      function top() {
        var m = ship.type && ship.type.mesh;
        if (m && m.geometry && topM === 1 && !ship.__riderTop) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          topM = Math.max(0.3, m.geometry.boundingBox.max.y * 0.85); ship.__riderTop = true;
        }
        return topM;
      }
      return poseVehicle(ship, { yaw: 'heading', pitch: null, bank: 'bank',
        scale: function (p) { return (p.type && p.type.def ? p.type.def.scale : 1) * top(); },
        seats: { seat: [0, 1, 0], seat2: [0, 1, -0.6], stand: [0, 1, 0.3] } });
    }

    // ── handles ──
    function makeHandle(rider) {
      return {
        rider: rider, vehicle: null, socket: 'seat', stance: STANCES.seat, stanceId: 'seat',
        on: false, w: 0, lean: 0, crouch: 0, visible: true, companion: false, restored: true,
        rp: root.WorldRiderPose ? root.WorldRiderPose.create(THREE) : null, animator: null,
        sp: new V3(), sq: new Q(), standP: new V3(), standQ: new Q(),
        T: { spineDir: new V3(), neckDir: new V3(), footL: new V3(), footR: new V3(), kneePoleL: new V3(), kneePoleR: new V3(),
             handL: null, handR: null, elbowPoleL: new V3(), elbowPoleR: new V3(), armDirL: new V3(), armDirR: new V3(),
             foreDirL: new V3(), foreDirR: new V3() },
        _hL: new V3(), _hR: new V3(),
      };
    }
    function mount(rider, vehicle, o) {
      o = o || {};
      var v = asVehicle(vehicle); if (!rider || !v) return null;
      var h = lookup(rider);
      if (!h) { h = makeHandle(rider); handles.push(h); if (byRider) byRider.set(rider, h); }
      var st = o.seat || 'seat';
      h.stanceId = STANCES[st] ? st : 'seat';
      h.stance = STANCES[h.stanceId];
      h.socket = o.socket || (h.stanceId === 'stand' ? 'stand' : h.stanceId === 'saddle' ? 'saddle' : 'seat');
      // a vehicle without that socket name falls back to 'seat'
      if (!v.socket(h.socket, h.sp, h.sq) && h.socket !== 'seat') h.socket = 'seat';
      h.vehicle = v; h.on = true;
      h.visible = o.visible === undefined ? true : o.visible;
      if (o.instant) h.w = 1;
      playStance(h);
      return h;
    }
    // first stance clip the animator has (world-anim.js library has no ride_* yet → Sit_Chair_Loop base, IK on top)
    function playStance(h) {
      var a = h.animator; if (!a || !a.play) return;
      var c = h.stance.clip;
      for (var i = 0; i < c.length; i++) {
        if (a.has && !a.has(c[i])) continue;
        try { a.play(c[i], { fade: 0.25 }); } catch (e) { continue; }
        return;
      }
    }
    function dismount(rider, instant) {
      var h = lookup(rider); if (!h) return;
      h.on = false;
      if (instant || h.companion) { h.w = 0; release(h); }
    }
    function release(h) {
      if (h.rp && h.rp.rig()) h.rp.restore();
      h.restored = true;
      var i = handles.indexOf(h); if (i >= 0) handles.splice(i, 1);
      if (byRider) byRider.delete(h.rider);
      if (h.companion && h.rider.parent) h.rider.parent.remove(h.rider);
    }
    // edge-triggered and vehicle-aware: several vehicles can sync the same rider every frame
    function sync(rider, on, vehicle, seat, o) {
      var h = lookup(rider), v = asVehicle(vehicle);
      if (on && v && (!h || !h.on || h.vehicle !== v)) { o = o || {}; o.seat = seat || o.seat; return mount(rider, v, o); }
      if (!on && h && h.on && h.vehicle === v) dismount(rider);
      return h;
    }

    // ── per-frame solve ──
    function vec(out, a, P, F, Up, L) {                  // socket-frame metres → world
      return out.copy(P).addScaledVector(L, a[0] * U).addScaledVector(Up, a[1] * U).addScaledVector(F, a[2] * U);
    }
    function poseHandle(h, dt) {
      var rider = h.rider, st = h.stance, v = h.vehicle;
      h.w = Math.max(0, Math.min(1, h.w + (h.on ? dt : -dt) / MOUNT_T));
      if (h.w <= 0 && !h.on) { release(h); return false; }
      if (!v.socket(h.socket, _P, _Q)) return true;
      var so = v.socketObj ? v.socketObj(h.socket) : null, ud = so ? so.userData : null;
      _F.set(0, 0, 1).applyQuaternion(_Q); _Up.set(0, 1, 0).applyQuaternion(_Q); _L.set(1, 0, 0).applyQuaternion(_Q);
      var lean = Math.max(-1, Math.min(1, h.lean + (v.lean ? v.lean() : 0)));
      var crouch = Math.max(0, Math.min(1, Math.max(h.crouch, v.crouch ? v.crouch() : 0)));
      var e = h.w * h.w * (3 - 2 * h.w);
      var rp = h.rp, rig = rp ? rp.bind(rider) : null;
      var hipH = rig && rig.hipH > 0 ? rig.hipH : BODY_H * 0.52;
      // rider orientation: socket × stance yaw × side lean about the vehicle's forward axis
      _yq.setFromAxisAngle(_AY, st.yaw);
      _lq.setFromAxisAngle(_F, -lean * st.maxLeanRad);
      _rq.copy(_Q).multiply(_yq).premultiply(_lq);
      _upR.set(0, 1, 0).applyQuaternion(_rq);
      if (h.stanceId === 'stand') {
        var drop = (rig && rig.hasBones ? st.dropM + st.crouchDropM * crouch : 0) * U;
        _root.copy(_P).addScaledVector(_upR, -drop);
      } else {
        var hu = (ud && ud.hipUpM !== undefined ? ud.hipUpM : st.hipUpM) * U;
        _root.copy(_P).addScaledVector(_Up, hu).addScaledVector(_upR, -hipH);
      }
      h.standP.copy(rider.position); h.standQ.copy(rider.quaternion);
      rider.position.lerpVectors(h.standP, _root, e);
      rider.quaternion.slerpQuaternions(h.standQ, _rq, e);
      var vis = typeof h.visible === 'function' ? h.visible() : h.visible;
      if (vis !== undefined && vis !== null) rider.visible = !!vis;
      rider.updateMatrixWorld(true);
      if (h.animator && h.animator.update) { try { h.animator.update(dt); } catch (err) {} }
      if (!rp || !rig || !rig.hasBones) return true;
      h.restored = false;
      var T = h.T, fh = rig.footH * 0.6;
      // chest direction: seated = vehicle forward; standing side-on = the board's right (toe side)
      if (h.stanceId === 'stand') _ch.copy(_L).negate(); else _ch.copy(_F);
      var lr = (ud && ud.lean !== undefined ? ud.lean : st.leanRad) + crouch * st.crouchRad;
      T.spineDir.copy(_Up).multiplyScalar(Math.cos(lr)).addScaledVector(_ch, Math.sin(lr)).addScaledVector(_L, -lean * 0.35).normalize();
      T.neckDir.copy(_Up).multiplyScalar(0.88).addScaledVector(_F, 0.5).normalize();   // eyes down the line of travel
      // feet: pegs when the vehicle has them, else the stance table
      if (ud && ud.pegL) { ud.pegL.updateWorldMatrix(true, false); T.footL.setFromMatrixPosition(ud.pegL.matrixWorld); }
      else vec(T.footL, st.feet[0], _P, _F, _Up, _L);
      if (ud && ud.pegR) { ud.pegR.updateWorldMatrix(true, false); T.footR.setFromMatrixPosition(ud.pegR.matrixWorld); }
      else vec(T.footR, st.feet[1], _P, _F, _Up, _L);
      T.footL.addScaledVector(_Up, fh); T.footR.addScaledVector(_Up, fh);
      if (h.stanceId === 'stand') {
        T.footL.addScaledVector(_upR, 0); T.footR.addScaledVector(_upR, 0);
        T.kneePoleL.copy(_ch).addScaledVector(_F, 0.4).addScaledVector(_Up, 0.1);
        T.kneePoleR.copy(_ch).addScaledVector(_F, -0.4).addScaledVector(_Up, 0.1);
      } else if (st.kneePole === 'out') {
        T.kneePoleL.copy(_F).multiplyScalar(0.6).addScaledVector(_L, 0.8);
        T.kneePoleR.copy(_F).multiplyScalar(0.6).addScaledVector(_L, -0.8);
      } else {
        T.kneePoleL.copy(_F).addScaledVector(_L, 0.35).addScaledVector(_Up, -0.2);
        T.kneePoleR.copy(_F).addScaledVector(_L, -0.35).addScaledVector(_Up, -0.2);
      }
      // hands: grips > stance hands > arms out for balance (board)
      var gl = ud && ud.gripL, gr = ud && ud.gripR;
      if (gl || st.hands) {
        if (gl) { gl.updateWorldMatrix(true, false); h._hL.setFromMatrixPosition(gl.matrixWorld); } else vec(h._hL, st.hands[0], _P, _F, _Up, _L);
        if (gr) { gr.updateWorldMatrix(true, false); h._hR.setFromMatrixPosition(gr.matrixWorld); } else vec(h._hR, st.hands[1], _P, _F, _Up, _L);
        T.handL = h._hL; T.handR = h._hR;
        T.elbowPoleL.copy(_L).multiplyScalar(0.8).addScaledVector(_Up, -0.5).addScaledVector(_F, -0.4);
        T.elbowPoleR.copy(_L).multiplyScalar(-0.8).addScaledVector(_Up, -0.5).addScaledVector(_F, -0.4);
      } else {
        T.handL = null; T.handR = null;
        T.armDirL.copy(_F).multiplyScalar(0.85).addScaledVector(_Up, -0.42).addScaledVector(_ch, 0.18);
        T.armDirR.copy(_F).multiplyScalar(-0.85).addScaledVector(_Up, -0.42).addScaledVector(_ch, 0.18);
        T.foreDirL.copy(_F).multiplyScalar(0.75).addScaledVector(_Up, -0.2).addScaledVector(_ch, 0.4);
        T.foreDirR.copy(_F).multiplyScalar(-0.75).addScaledVector(_Up, -0.2).addScaledVector(_ch, 0.4);
      }
      rp.apply(e, T);
      return true;
    }
    function update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      for (var i = handles.length - 1; i >= 0; i--) poseHandle(handles[i], dt);
    }

    // ── companions: an AI agent riding along (placeholder capsule → real rigged GLB when it lands) ──
    function characterUrl(name) { return opts.characterUrl ? opts.characterUrl(name) : '/assets/agents/' + encodeURIComponent(String(name).toUpperCase()) + '.glb?v=12'; }
    var capGeo = null, capMat = null;
    function placeholder(color) {
      if (!capGeo) {
        capGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.22 * U, BODY_H - 0.44 * U, 4, 8) : new THREE.CylinderGeometry(0.22 * U, 0.22 * U, BODY_H, 8);
        capGeo.translate(0, BODY_H / 2, 0);
      }
      var m = new THREE.Mesh(capGeo, capMat || (capMat = new THREE.MeshStandardMaterial({ color: color || 0x5fe0ff, roughness: 0.5, metalness: 0.2, emissive: 0x0b2a33 })));
      m.name = 'rider-placeholder';
      return m;
    }
    function adoptModel(group, gltf) {
      var m = opts.cloneSkinned ? opts.cloneSkinned(gltf.scene) : gltf.scene;
      m.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(m), sz = box.getSize(new V3());
      m.scale.multiplyScalar(BODY_H / (sz.y || 1));
      m.updateMatrixWorld(true);
      box.setFromObject(m); m.position.y -= box.min.y;
      m.traverse(function (c) { if (c.isMesh) { c.castShadow = true; c.frustumCulled = false; } });
      while (group.children.length) group.remove(group.children[0]);
      group.add(m);
      var h = lookup(group);
      var anim = null;
      try {
        if (opts.animatorFor) anim = opts.animatorFor(m, gltf);
        else if (root.buildAgentAnimator && opts.animLib && opts.animLib.clips && opts.animLib.meta)
          anim = root.buildAgentAnimator({ THREE: THREE, model: m, clips: opts.animLib.clips, meta: opts.animLib.meta });
      } catch (e) { anim = null; }
      if (h) { h.animator = anim && anim.play ? anim : null; playStance(h); }
      return m;
    }
    function spawnCompanion(name, vehicle, socket, o) {
      o = o || {};
      var g = new THREE.Group(); g.name = 'companion-' + name;
      g.add(placeholder(o.color));
      if (o.parent) o.parent.add(g); else if (scene) scene.add(g);
      var seat = o.seat || (socket === 'stand' ? 'stand' : socket === 'saddle' ? 'saddle' : 'seat');
      var h = mount(g, vehicle, { seat: seat, socket: socket || 'seat', instant: true, visible: o.visible });
      if (!h) { if (g.parent) g.parent.remove(g); return null; }
      h.companion = true; h.name = String(name).toUpperCase();
      var done = function (gltf) { if (lookup(g) && gltf && gltf.scene) adoptModel(g, gltf); };
      var fail = function (e) { if (root.console) console.warn('[riders] companion ' + name + ' model failed — capsule kept', e && e.message); };
      try {
        if (opts.loadCharacter) { var p = opts.loadCharacter(h.name); if (p && p.then) p.then(done, fail); }
        else if (opts.loader) opts.loader.load(characterUrl(h.name), done, undefined, fail);
      } catch (e) { fail(e); }
      return h;
    }

    return {
      STANCES: STANCES,
      mount: mount, dismount: dismount, sync: sync, update: update,
      setInput: function (rider, lean, crouch) { var h = lookup(rider); if (h) { h.lean = lean || 0; h.crouch = crouch || 0; } },
      isMounted: function (rider) { var h = lookup(rider); return !!(h && h.on); },
      handle: lookup,
      count: function () { return handles.length; },
      handles: handles,
      addSocket: addSocket, vehicle: asVehicle, poseVehicle: poseVehicle,
      bikeVehicle: bikeVehicle, dragonVehicle: dragonVehicle, skyShipVehicle: skyShipVehicle,
      spawnCompanion: spawnCompanion, adoptModel: adoptModel,
      dispose: function () { for (var i = handles.length - 1; i >= 0; i--) { handles[i].on = false; release(handles[i]); } if (capGeo) capGeo.dispose(); if (capMat) capMat.dispose(); },
    };
  };
  root.WorldRiders = { STANCES: STANCES, U: U };
})(typeof window !== 'undefined' ? window : globalThis);
