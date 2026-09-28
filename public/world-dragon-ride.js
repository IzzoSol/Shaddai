/* world-dragon-ride.js — ride a tamed dragon in SHADDAI's Map v4 world (2026-09-27).
 *
 * Classic script (no build step). A pure CORE (flight + mount/dismount rules + perch landing + stamina + camera rig)
 * with an optional THREE visual. The node tests drive the core headless: tools/tests/world-dragon-ride.test.cjs.
 *
 *   const ride = window.buildDragonRide({
 *     heightAt(x, z) → units,                // terrain height (the same one the player controller uses)
 *     playerPos: {x, y, z},                  // host's playerPos (feet). Written every frame while riding.
 *     markers: [{name, pos_m:[X,Y,Z]}, …],   // markers-v4.json rows (PERCH_MAIN / PERCH_A–D / VEH_DRAGON_HARNESS used)
 *     hasSkill(id) → bool,                   // skill gate for 'pilot.dragon'. Omitted = allowed (dev default).
 *     getInput() → {fwd, back, left, right, climb, dive},   // optional; update(dt, input) overrides it
 *     dragons: window.__dragons,             // optional: lets you ride a DEFEATED wild dragon (core.setRidden hand-off)
 *     THREE, scene, loader, cloneSkinned, modelUrl,         // optional visual (rigged GLB, fly/idle/walk clip blend)
 *     tune: {...}                            // optional overrides of RIDE_TUNE (metres / seconds)
 *   })
 *   → { update(dt, input?), isRiding(), mount(dragonId | 'tamed'), dismount(), dispose(),
 *       canMount(), canDismount(), nearestMount(), state(), stamina(), hud(), saddle(), camera(), on(ev, cb), off(ev, cb),
 *       lastRefusal(), mountPoints }
 *
 * Controls (host maps keys → input): W throttle up / S throttle down (slow to a hover) · A/D yaw (banked turn) ·
 * Space climb (pitch up) · Shift dive + BOOST (drains stamina) · E/F dismount (grounded, or hovering ≤ 10 m over a perch pad).
 * On the ground or in a hover, W flies forward, S backs up, Space rises, Shift sinks.
 *
 * Units: world units on XZ, Y up, U = 7/1.8 units per metre. Marker metres: X east, Y north, Z up → game (X·U, Z·U, −Y·U).
 * No per-frame allocation: every per-frame object is created once and reused (see the test's fresh-process probe).
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, G = 9.81, D2R = Math.PI / 180;

  var RIDE_TUNE = {
    wingspan: 22,
    // mount rules
    skill: 'pilot.dragon', mountRadius: 30, mountVert: 25, harnessRadius: 25, parkedRadius: 18, wildRadius: 40,
    arriveTime: 3.2, arriveAlt: 70, arriveOut: 90,
    // perch pads (walkable tops = marker Z). MAIN crown fits 2–3 dragons.
    padR: 6, padMainR: 8,   // radii keep the spiral pads (≈15.6 m from the crown) from overlapping
    snapV: 2.5, dismountPadH: 10,
    // flight (m/s, rad)
    speedStall: 13, speedMin: 16, cruise: 24, speedMax: 34, boost: 46, accel: 8, brake: 9,
    yawRateMax: 1.0, yawAccel: 2.6, bankMaxDeg: 55, bankRateDeg: 120,
    pitchUpDeg: 28, pitchDownDeg: 38, pitchRateDeg: 60, gravK: 0.5,
    hoverMax: 10, hoverBack: 3, hoverAccel: 6, hoverClimb: 8, hoverSink: 7, hoverToFly: 9.5, flyToHover: 17,
    takeoffVy: 6, minClear: 3,
    // stamina
    boostDrain: 0.22, regen: 0.14, regenDelay: 1.0, boostResume: 0.15,
    // camera (metres): behind/above the saddle, pulls back with speed, lags smoothly
    camBack: 17, camUp: 6.5, camBackPerMS: 0.22, camLook: 12, camLag: 5, fovBase: 62, fovBoost: 12,
    saddleUp: 0.34, saddleFwd: 0.08,   // × wingspan
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(v, t, s) { var d = t - v; return d > s ? v + s : d < -s ? v - s : t; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function createRideCore(opts) {
    opts = opts || {};
    var T = {}, k;
    for (k in RIDE_TUNE) T[k] = RIDE_TUNE[k];
    if (opts.tune) for (k in opts.tune) T[k] = opts.tune[k];
    var heightAt = opts.heightAt || function () { return 0; };
    var playerPos = opts.playerPos || { x: 0, y: 0, z: 0 };
    var hasSkill = typeof opts.hasSkill === 'function' ? opts.hasSkill : function () { return true; };   // dev default: allow
    var dragons = opts.dragons || null;
    var dcore = dragons ? (dragons.core || dragons) : null;

    // ── mount points from markers (metres → units) ──
    var pads = [], points = [];
    (opts.markers || []).forEach(function (m) {
      if (!m || !m.name || !m.pos_m) return;
      var p = m.pos_m, x = p[0] * U, z = -p[1] * U, y = (p[2] || 0) * U;
      if (/^PERCH_(MAIN|[A-Z])$/.test(m.name)) {
        var pad = { name: m.name, x: x, y: y, z: z, r: (m.name === 'PERCH_MAIN' ? T.padMainR : T.padR) * U, kind: 'perch' };
        pads.push(pad); points.push(pad);
      } else if (m.name === 'VEH_DRAGON_HARNESS') points.push({ name: m.name, x: x, y: y, z: z, r: T.harnessRadius * U, kind: 'harness' });
    });

    // ── dragon state (units / m·s⁻¹ / rad) ──
    var D = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, speed: 0, yawRate: 0, vy: 0, hv: 0, mode: 'none', perch: null, parked: false,
      wildId: null, flap: 0, fold: 1, glide: 0, groundMove: 0 };
    var st = { riding: false, arriving: false, arriveT: 0, stamina: 1, boosting: false, regenWait: 0, exhausted: false, refusal: null, lastPad: null };
    var ARR = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, yaw: 0 };
    var CAM = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, fov: T.fovBase, init: false };
    var SAD = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
    var HUD = { riding: false, mode: 'none', stamina: 1, boosting: false, speed: 0, alt: 0, canDismount: false, perch: null };
    var NEAR = { name: null, kind: null, dist: 0, ok: false };
    var ZERO_IN = { fwd: false, back: false, left: false, right: false, climb: false, dive: false };
    var listeners = {};
    function on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return function () { off(ev, cb); }; }
    function off(ev, cb) { var l = listeners[ev]; if (l) { var i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); } }
    function emit(ev, data) { var l = listeners[ev]; if (l) for (var i = 0; i < l.length; i++) { try { l[i](data); } catch (e) {} } }

    // walkable ground under (x, z): terrain, or a perch pad's top when inside its radius
    var _padHit = null;
    // yRef (optional): ignore pad tops above yRef + 1 m (you are under that crown, not on it)
    function groundAt(x, z, yRef) {
      var h = heightAt(x, z); _padHit = null;
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i], dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz <= p.r * p.r && p.y >= h - 0.5 * U && (yRef === undefined || p.y <= yRef + U)) { h = p.y; _padHit = p; }
      }
      return h;
    }
    function padUnder(x, z, yRef) { groundAt(x, z, yRef); return _padHit; }

    function nearestMount() {
      var P = playerPos, best = null, bd = Infinity;
      if (D.parked && !st.riding) {   // your parked steed wins over a pad call
        var pd = Math.sqrt((P.x - D.x) * (P.x - D.x) + (P.z - D.z) * (P.z - D.z));
        if (pd <= (T.parkedRadius + T.wingspan * 0.5) * U) { bd = pd; best = D; }
      }
      for (var i = 0; i < points.length; i++) {
        var p = points[i], dh = Math.sqrt((P.x - p.x) * (P.x - p.x) + (P.z - p.z) * (P.z - p.z)), dv = Math.abs((P.y || 0) - p.y);
        var reach = p.kind === 'perch' ? p.r + T.mountRadius * U : p.r;
        if (best !== D && dh <= reach && dv <= T.mountVert * U && dh < bd) { bd = dh; best = p; }
      }
      NEAR.ok = !!best; NEAR.name = best ? (best === D ? 'PARKED' : best.name) : null; NEAR.kind = best ? (best === D ? 'parked' : best.kind) : null; NEAR.dist = best ? bd / U : 0;
      return best;
    }
    function refuse(reason) { st.refusal = reason; emit('refused', { reason: reason }); return false; }

    function placeAt(x, y, z, yaw, mode) { D.x = x; D.y = y; D.z = z; D.yaw = yaw; D.pitch = 0; D.bank = 0; D.speed = 0; D.yawRate = 0; D.vy = 0; D.hv = 0; D.mode = mode; }
    function beginRide() { st.riding = true; st.arriving = false; D.parked = false; CAM.init = false; emit('mount', { wild: D.wildId, perch: D.perch ? D.perch.name : null }); }

    /* mount('tamed' | wildDragonId). Gate: skill → proximity. 'tamed' calls YOUR dragon to the pad/harness you stand at
     * (it glides in over arriveTime, then you are seated), or re-mounts the dragon you parked. */
    function mount(which) {
      if (st.riding || st.arriving) return refuse('riding');
      if (!hasSkill(T.skill)) return refuse('skill');
      if (which != null && which !== 'tamed') {                       // a wild dragon: only once beaten (it bowed to you)
        if (!dcore || !dcore.byId) return refuse('no-dragons');
        var w = dcore.byId(which); if (!w) return refuse('unknown');
        if (!w.defeated) return refuse('wild');
        var wd = Math.sqrt((playerPos.x - w.f.x) * (playerPos.x - w.f.x) + (playerPos.z - w.f.z) * (playerPos.z - w.f.z)) / U;
        if (wd > T.wildRadius + w.wingspan * 0.5) return refuse('far');
        if (!dcore.setRidden(which, true)) return refuse('busy');
        D.wildId = which; T.wingspan = w.wingspan;
        var gy = groundAt(w.f.x, w.f.z), air = w.f.y - gy > 3 * U;
        placeAt(w.f.x, air ? w.f.y : gy, w.f.z, w.f.yaw, air ? 'hover' : 'ground'); D.perch = _padHit;
        beginRide(); return true;
      }
      var p = nearestMount(); if (!p) return refuse('far');
      D.wildId = null;
      if (p === D) { beginRide(); return true; }                        // parked steed right here
      // call: glide in from high & outside, land on the pad top (harness: on the ground next to it)
      var tx = p.x, tz = p.z, ty = p.kind === 'perch' ? p.y : groundAt(p.x, p.z);
      var ang = Math.atan2(playerPos.x - tx, playerPos.z - tz) + Math.PI * 0.75;
      ARR.x1 = tx; ARR.y1 = ty; ARR.z1 = tz;
      ARR.x0 = tx + Math.sin(ang) * T.arriveOut * U; ARR.z0 = tz + Math.cos(ang) * T.arriveOut * U; ARR.y0 = Math.max(ty, heightAt(ARR.x0, ARR.z0)) + T.arriveAlt * U;
      ARR.yaw = Math.atan2(tx - ARR.x0, tz - ARR.z0);
      placeAt(ARR.x0, ARR.y0, ARR.z0, ARR.yaw, 'arrive'); D.perch = p.kind === 'perch' ? p : null;
      st.arriving = true; st.arriveT = 0; D.parked = false;
      emit('call', { at: p.name });
      if (T.arriveTime <= 0) finishArrive();
      return true;
    }
    function finishArrive() { placeAt(ARR.x1, ARR.y1, ARR.z1, ARR.yaw, 'ground'); emit('land', { perch: D.perch ? D.perch.name : null, arrive: true }); beginRide(); }

    // dismount: grounded anywhere, or hovering low over a perch pad (you step off onto the pad top)
    function canDismount() {
      if (!st.riding) return false;
      if (D.mode === 'ground') return true;
      if (D.mode !== 'hover') return false;
      var p = padUnder(D.x, D.z, D.y);
      return !!p && D.y - p.y <= T.dismountPadH * U && D.y >= p.y - 0.5 * U;
    }
    function dismount() {
      if (!st.riding) return refuse('not-riding');
      if (!canDismount()) return refuse('airborne');
      var p = padUnder(D.x, D.z, D.y), side = T.wingspan * 0.35 * U;
      if (p) {   // step onto the pad, toward its centre
        var dx = p.x - D.x, dz = p.z - D.z, l = Math.sqrt(dx * dx + dz * dz);
        var s = l > 1e-3 ? Math.min(side, Math.max(0, p.r - 1.5 * U)) / l : 0;
        playerPos.x = l > side ? D.x + dx * s : p.x; playerPos.z = l > side ? D.z + dz * s : p.z; playerPos.y = p.y;
        if (D.mode === 'hover') { D.y = p.y; D.mode = 'ground'; D.vy = 0; D.speed = 0; }
      } else {   // beside the saddle, on the right
        playerPos.x = D.x + Math.cos(D.yaw) * side; playerPos.z = D.z - Math.sin(D.yaw) * side; playerPos.y = heightAt(playerPos.x, playerPos.z);
      }
      st.riding = false; st.boosting = false;
      var wild = D.wildId;
      if (wild != null && dcore && dcore.setRidden) { SAD.x = D.x; SAD.y = D.y; SAD.z = D.z; SAD.yaw = D.yaw; dcore.setRidden(wild, false, SAD); D.wildId = null; D.mode = 'none'; D.parked = false; }
      else { D.parked = true; }
      emit('dismount', { perch: p ? p.name : null, pos: playerPos });
      return true;
    }

    // ── flight step ──
    // per-frame helpers read the frame's dt from DTA[0] instead of taking it as an argument: passing a double into a
    // non-inlined function boxes it (a heap allocation every call)
    var DTA = new Float64Array(1);   // (a closure `var` holding a double would box on every write; a typed-array slot does not)
    function stepRide(I) {
      var dt = DTA[0];
      var fwd = !!I.fwd, back = !!I.back, left = !!I.left, right = !!I.right, climb = !!I.climb, dive = !!I.dive;
      var turn = (left ? 1 : 0) - (right ? 1 : 0);   // yaw + = left (heading convention: fwd = (sin yaw, cos yaw))
      // stamina: boost = Shift while flying
      var wantBoost = dive && !back && D.mode === 'fly' && !st.exhausted && st.stamina > 0;
      if (wantBoost) { st.stamina = Math.max(0, st.stamina - T.boostDrain * dt); st.regenWait = T.regenDelay; if (st.stamina <= 0) { st.exhausted = true; emit('stamina-empty', { t: 0 }); } }
      else { st.regenWait -= dt; if (st.regenWait <= 0) st.stamina = Math.min(1, st.stamina + T.regen * dt); if (st.exhausted && st.stamina >= T.boostResume) st.exhausted = false; }
      st.boosting = wantBoost;
      var gy = groundAt(D.x, D.z, D.y);

      if (D.mode === 'ground') {
        D.pitch = approach(D.pitch, 0, dt); D.bank = approach(D.bank, 0, 2 * dt); D.speed = 0; D.vy = 0; D.hv = 0;
        D.yaw = wrapPi(D.yaw + turn * 1.1 * dt); D.yawRate = turn * 1.1;
        D.groundMove = approach(D.groundMove, turn ? 0.5 : 0, 3 * dt);
        D.y = gy; D.perch = _padHit;
        if (fwd || climb) { D.mode = 'hover'; D.vy = T.takeoffVy; D.perch = null; emit('takeoff', { from: _padHit ? _padHit.name : null }); }
        return;
      }
      D.groundMove = 0;
      if (D.mode === 'hover') {
        var hvT = fwd ? T.hoverMax : back ? -T.hoverBack : 0;
        D.hv = approach(D.hv, hvT, T.hoverAccel * dt);
        D.yawRate = approach(D.yawRate, turn * 1.2, 4 * dt); D.yaw = wrapPi(D.yaw + D.yawRate * dt);
        var vyT = climb ? T.hoverClimb : dive ? -T.hoverSink : 0;
        D.vy = approach(D.vy, vyT, 10 * dt);
        D.x += Math.sin(D.yaw) * D.hv * dt * U; D.z += Math.cos(D.yaw) * D.hv * dt * U; D.y += D.vy * dt * U;
        gy = groundAt(D.x, D.z, D.y);
        D.pitch = approach(D.pitch, clamp(D.hv / 40 - D.vy / 40, -0.25, 0.3), 1.5 * dt); D.bank = approach(D.bank, -D.yawRate * 0.15, 1.5 * dt);
        D.speed = Math.abs(D.hv); D.flap = 1;
        if (D.y <= gy + T.snapV * U && D.vy <= 0 && !climb) {       // touchdown: snap exactly onto the terrain / pad top
          D.y = gy; D.mode = 'ground'; D.vy = 0; D.hv = 0; D.speed = 0; D.perch = _padHit;
          emit('land', { perch: _padHit ? _padHit.name : null });
          return;
        }
        if (D.y < gy) D.y = gy;
        if (fwd && D.hv >= T.hoverToFly && D.y - gy > 6 * U) { D.mode = 'fly'; D.speed = T.speedMin; D.pitch = 0.05; emit('fly', { t: 0 }); }
        return;
      }
      // ── fly ──
      var spT = st.boosting ? T.boost : fwd ? T.speedMax : back ? T.speedMin : T.cruise;
      var a = clamp((spT - D.speed) * 0.9, back ? -T.brake : -T.accel, T.accel) - G * Math.sin(D.pitch) * T.gravK;
      D.speed = clamp(D.speed + a * dt, 0, T.boost + 4);
      var v = Math.max(D.speed, 1), bankMax = T.bankMaxDeg * D2R;
      var yrMax = Math.min(T.yawRateMax, G * Math.tan(bankMax) / v);
      D.yawRate = clamp(approach(D.yawRate, turn * yrMax, T.yawAccel * dt), -yrMax, yrMax);
      D.yaw = wrapPi(D.yaw + D.yawRate * dt);
      D.bank = clamp(approach(D.bank, Math.atan(v * D.yawRate / G), T.bankRateDeg * D2R * dt), -bankMax, bankMax);
      var pT = climb ? T.pitchUpDeg * D2R : dive ? -T.pitchDownDeg * D2R : 0;
      if (D.speed < T.speedStall && !dive) pT = Math.min(pT, -10 * D2R);   // too slow: nose drops to regain airspeed
      D.pitch = approach(D.pitch, pT, T.pitchRateDeg * D2R * dt);
      var vh = D.speed * Math.cos(D.pitch);
      D.vy = D.speed * Math.sin(D.pitch);
      D.x += Math.sin(D.yaw) * vh * dt * U; D.z += Math.cos(D.yaw) * vh * dt * U; D.y += D.vy * dt * U;
      gy = groundAt(D.x, D.z, D.y);
      var floor = gy + T.minClear * U;
      if (D.y < floor) { D.y = floor; if (D.pitch < 0) D.pitch = 0; D.vy = 0; }
      var effort = clamp(0.25 + Math.max(0, a) / T.accel * 0.5 + Math.max(0, Math.sin(D.pitch)) * 1.6, 0, 1);
      if (D.pitch < -8 * D2R) effort *= 0.25;
      D.flap = approach(D.flap, effort, 1.5 * dt);
      // slow + S → flare into a hover (the only way down onto a pad)
      if (back && D.speed <= T.flyToHover) { D.mode = 'hover'; D.hv = Math.min(T.hoverMax, D.speed * 0.6); D.vy = 0; emit('hover', { t: 0 }); }
    }

    function stepArrive() {
      var dt = DTA[0];
      st.arriveT += dt;
      var k = clamp(st.arriveT / T.arriveTime, 0, 1), e = 1 - (1 - k) * (1 - k);   // ease-out glide
      var px = D.x, pz = D.z;
      D.x = lerp(ARR.x0, ARR.x1, e); D.z = lerp(ARR.z0, ARR.z1, e);
      D.y = ARR.y1 + (ARR.y0 - ARR.y1) * (1 - k) * (1 - k);
      D.pitch = -0.25 * (1 - k); D.flap = k > 0.7 ? 1 : 0.3; D.speed = Math.sqrt((D.x - px) * (D.x - px) + (D.z - pz) * (D.z - pz)) / U / Math.max(dt, 1e-6);
      if (k >= 1) finishArrive();
    }

    function writeSaddle() {
      var up = T.wingspan * T.saddleUp * U, fw = T.wingspan * T.saddleFwd * U;
      SAD.x = D.x + Math.sin(D.yaw) * fw; SAD.z = D.z + Math.cos(D.yaw) * fw; SAD.y = D.y + up;
      SAD.yaw = D.yaw; SAD.pitch = D.pitch; SAD.bank = D.bank;
    }
    function updateCamera() {
      var dt = DTA[0];
      var back = (T.camBack + T.camBackPerMS * D.speed) * U, up = T.camUp * U;
      var tx = SAD.x - Math.sin(D.yaw) * back, tz = SAD.z - Math.cos(D.yaw) * back, ty = SAD.y + up - Math.sin(D.pitch) * back * 0.5;
      var gy = heightAt(tx, tz) + 2 * U; if (ty < gy) ty = gy;
      var lx = SAD.x + Math.sin(D.yaw) * T.camLook * U, lz = SAD.z + Math.cos(D.yaw) * T.camLook * U, ly = SAD.y + Math.sin(D.pitch) * T.camLook * U;
      var kk = CAM.init ? 1 - Math.exp(-T.camLag * dt) : 1; CAM.init = true;
      CAM.x += (tx - CAM.x) * kk; CAM.y += (ty - CAM.y) * kk; CAM.z += (tz - CAM.z) * kk;
      CAM.lx += (lx - CAM.lx) * kk; CAM.ly += (ly - CAM.ly) * kk; CAM.lz += (lz - CAM.lz) * kk;
      CAM.fov = approach(CAM.fov, T.fovBase + (st.boosting ? T.fovBoost : 0), 20 * dt);
    }
    function animDrivers() {
      var dt = DTA[0];
      D.fold = approach(D.fold, D.mode === 'ground' || D.mode === 'none' ? 1 : 0, dt * (D.mode === 'ground' ? 1.2 : 2.5));
      D.glide = approach(D.glide, D.mode === 'fly' && D.flap < 0.3 ? 1 : 0, dt * 1.5);
    }

    function update(dt, input) {
      DTA[0] = Math.min(Math.max(dt || 0, 0), 0.1);
      if (st.arriving) { stepArrive(); animDrivers(); writeSaddle(); return; }
      if (!st.riding) { if (D.mode !== 'none') animDrivers(); return; }
      stepRide(input || (opts.getInput ? opts.getInput() : null) || ZERO_IN);
      animDrivers();
      writeSaddle();
      playerPos.x = SAD.x; playerPos.y = SAD.y; playerPos.z = SAD.z;   // host keeps its avatar on the saddle
      updateCamera();
    }
    function hud() {
      HUD.riding = st.riding; HUD.mode = st.arriving ? 'arriving' : st.riding ? D.mode : (D.parked ? 'parked' : 'none');
      HUD.stamina = st.stamina; HUD.boosting = st.boosting; HUD.speed = D.speed; HUD.alt = st.riding ? (D.y - heightAt(D.x, D.z)) / U : 0;
      HUD.canDismount = canDismount(); HUD.perch = D.perch ? D.perch.name : null;
      return HUD;
    }

    return {
      tune: T, dragon: D, mountPoints: points, pads: pads,
      update: update, mount: mount, dismount: dismount, canDismount: canDismount,
      canMount: function () { return !st.riding && !st.arriving && hasSkill(T.skill) && !!nearestMount(); },
      nearestMount: function () { nearestMount(); return NEAR; },
      isRiding: function () { return st.riding; }, isArriving: function () { return st.arriving; },
      state: function () { return st.arriving ? 'arriving' : st.riding ? D.mode : (D.parked ? 'parked' : 'none'); },
      stamina: function () { return st.stamina; }, boosting: function () { return st.boosting; },
      hud: hud, saddle: function () { return SAD; }, camera: function () { return CAM; }, groundAt: groundAt,
      lastRefusal: function () { return st.refusal; }, on: on, off: off,
    };
  }

  // ── optional THREE visual: rigged GLB (fly/idle/walk/run clips weight-blended like the wild dragons) ──
  function attachVisual(core, opts) {
    var THREE = opts.THREE, scene = opts.scene;
    if (!THREE || !scene) return null;
    var holder = new THREE.Group(); holder.name = 'dragon-ride'; holder.rotation.order = 'YXZ'; holder.visible = false; scene.add(holder);
    var mixer = null, slots = {}, W = {}, ready = false, dead = false;
    var cw = root.WorldDragons && root.WorldDragons.clipWeights;
    if (opts.loader) opts.loader.load(opts.modelUrl || '/assets/creatures/dragon-rigged.glb', function (g) {
      if (dead) return;
      var sc = opts.cloneSkinned ? opts.cloneSkinned(g.scene) : g.scene;
      var box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      var s = 1 / Math.max(sz.x, 1e-6); sc.scale.multiplyScalar(s); sc.position.sub(c.multiplyScalar(s));
      sc.traverse(function (o) { if (o.isMesh) o.frustumCulled = false; });
      holder.add(sc);
      if (g.animations && g.animations.length) {
        mixer = new THREE.AnimationMixer(sc);
        g.animations.forEach(function (clip) { var n = clip.name.toLowerCase(); ['fly', 'idle', 'walk', 'run', 'glide'].forEach(function (k) { if (!slots[k] && n.indexOf(k) === 0) slots[k] = mixer.clipAction(clip); }); });
        for (var k in slots) { slots[k].enabled = true; slots[k].setEffectiveWeight(0); slots[k].play(); }
      }
      ready = true;
    }, undefined, function (e) { if (root.console) console.warn('[dragon-ride] model failed:', e && e.message); });
    var P = { fold: 1, glide: 0, flapEffort: 0, hover: 0, groundMove: 0 };
    return {
      update: function (dt) {
        var D = core.dragon, st = core.state();
        holder.visible = ready && st !== 'none';
        if (!holder.visible) return;
        holder.position.set(D.x, D.y, D.z); holder.rotation.set(-D.pitch, D.yaw, -D.bank, 'YXZ');
        holder.scale.setScalar(core.tune.wingspan * U);
        if (mixer && cw) {
          P.fold = D.fold; P.glide = D.glide; P.flapEffort = D.flap; P.hover = D.mode === 'hover' || D.mode === 'arrive' ? 1 : 0; P.groundMove = D.groundMove;
          cw(P, W, !!slots.glide, !!slots.walk, !!slots.run, !!slots.idle);
          for (var k in slots) slots[k].setEffectiveWeight(W[k] || 0);
          if (slots.fly) slots.fly.timeScale = W.flyScale;
          if (slots.walk) slots.walk.timeScale = W.walkScale;
          mixer.update(dt);
        }
      },
      dispose: function () { dead = true; scene.remove(holder); if (mixer) mixer.stopAllAction(); },
    };
  }

  function buildDragonRide(opts) {
    var core = createRideCore(opts);
    var vis = attachVisual(core, opts || {});
    var api = {};
    for (var k in core) api[k] = core[k];
    api.update = function (dt, input) { core.update(dt, input); if (vis) vis.update(Math.min(Math.max(dt || 0, 0), 0.1)); };
    api.dispose = function () { if (core.isRiding()) { try { core.dismount(); } catch (e) {} } if (vis) vis.dispose(); try { if (root.__dragonRide === api) delete root.__dragonRide; } catch (e) {} };
    try { if (typeof window !== 'undefined') root.__dragonRide = api; } catch (e) {}
    return api;
  }

  var EXPORTS = { RIDE_TUNE: RIDE_TUNE, createRideCore: createRideCore, buildDragonRide: buildDragonRide, U: U };
  if (typeof module !== 'undefined' && module.exports) module.exports = EXPORTS;
  if (typeof window !== 'undefined') { window.buildDragonRide = buildDragonRide; window.WorldDragonRide = EXPORTS; }
})(typeof window !== 'undefined' ? window : globalThis);
