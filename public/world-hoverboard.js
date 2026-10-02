/* world-hoverboard.js — HOVERBOARD V2 (2026-09-26). docs/VEHICLES-V2.md has the host wiring.
 *
 * Owner: "fix the bike stuff and add the hoverboard stuff". Reference mood: a skater carving a
 * glowing light-trail across the sky — so the board FLOATS (spring-damper hover, gentle bob),
 * CARVES (leans into turns like a surfboard), leaves a short, subtle light ribbon, and works
 * over the sea as well as land. The rider stands in a surf stance (feet along the deck, knees
 * bent, arms out) solved on the avatar's own bones by window.WorldRiderPose (world-actions.js).
 *
 *   var hover = window.buildWorldHoverboard({
 *     THREE, scene, loader,                  // GLTFLoader (meshopt/draco already set is fine)
 *     heightAt: function (x, z) {...},       // terrain height (world units)
 *     waterHeightAt: function (x, z, t) {},  // OPTIONAL: water surface or null/NaN where dry
 *     colliders: [...] | function () {},     // circles {x,z,r} — WORLD_LAYOUT.realmColliders
 *     playerPos: THREE.Vector3,              // OPTIONAL: the host's player position (mutated while riding)
 *     time: function () {},                  // OPTIONAL: the clock the ocean shader uses (wave phase sync)
 *   });
 *   hover.mount(avatar) / hover.dismount() / hover.isRiding()
 *   hover.update(dt, {fwd,back,left,right,boost,jump}, camYaw)   // every frame, riding or not
 *   hover.board                                                  // the THREE.Group
 *
 * 2026-09-28 FLY + TRICKS + 9 STYLES (docs/RIDERS.md): when public/world-hoverboards.js is loaded and no
 * opts.modelUrl is given, the board is one of 9 CODE-BUILT styles (HoverboardKit; opts.style, opts.palette,
 * hover.setStyle(id, palette)) with thruster flames + a pooled particle trail. Airborne:
 *   hold Space (after ~0.2 s)  -> FLY: climb (drains stamina), release = glide; capped altitude + stamina
 *   A / D                       -> spin (auto-completes to the next 180)
 *   Shift+W / Shift+S           -> front / back flip          Shift alone -> grab
 *   Shift+A / Shift+D           -> varial (board spins under your feet)
 * or pass explicit input fields {spinL, spinR, flipF, flipB, grab, varialL, varialR}. Landing is checked
 * (spin/flip/varial residual + board tilt): clean -> onTrick events with score/combo; too tilted -> BAIL.
 *   hover.onTrick(fn) -> off()   fn({name, kind, deg, score, clean, combo, total, air})
 *
 * ES5 classic script (same style as the other world-*.js modules): no imports, no build step.
 * Scale law: 1 m = 7/1.8 = 3.889 world units (characters are 7 u tall).
 */
window.buildWorldHoverboard = function (opts) {
  'use strict';
  var THREE = opts && opts.THREE, scene = opts && opts.scene;
  if (!THREE || !scene) return null;
  var U = 7 / 1.8;

  // ── TUNABLES (real metres / seconds; converted with U) ────────────────────────────
  // WHY between run and bike: sprint is 26 u/s ≈ 6.7 m/s, the Grid Bike tops out at 25 m/s.
  // The board should feel like a clear upgrade on foot but not replace the bike for travel.
  var TUNE = {
    lengthM: 1.6,        // real board length; the GLB is normalised to this
    hoverM: 0.45,        // ride height above terrain / water
    bobM: 0.035,         // idle bob amplitude (gentle — it's a mag-lev, not a boat)
    springK: 55,         // hover spring stiffness (1/s²)…
    damping: 0.55,       // …and damping ratio (<1 = soft, slightly bouncy landing)
    topMS: 14,           // cruise top speed
    boostMS: 20,         // Shift-boost top speed
    accelMS2: 6,         // throttle
    boostAccelMS2: 9,    // throttle while boosting
    brakeMS2: 10,        // S while moving forward
    reverseMS: 3,        // S from a stop drifts backwards
    coastMS2: 1.2,       // friction-free-ish glide when no input
    dragK: 0.012,        // aero drag (per m of v^2)
    slopeGravity: 0.35,  // hovering feels hills less than wheels do
    steerGain: 5,        // heading chases camera yaw (mouse steers)
    carveOffset: 0.5,    // A/D add ±rad to the heading target
    turnRateLow: 3.0,    // rad/s at a crawl…
    turnRateHigh: 1.6,   // …and at top speed
    rollMaxDeg: 25,      // carve lean clamp; lean = atan(v·yawRate/g)
    poseSmooth: 9,       // pitch/roll smoothing (1/s)
    hopMS: 5.2,          // jump impulse (m/s up) → ~0.7 m hop
    gravityK: 1.6,       // airborne gravity multiplier (snappy, arcade)
    radiusM: 0.45,       // collision radius vs colliders
    impactLoss: 0.7,
    mountTime: 0.3,      // seconds to hop on / off
    crouchM: 0.2,        // how much the hips drop below standing height (knees bent)
    stanceM: 0.62,       // distance between the feet along the deck
    trailLen: 36,        // ribbon samples (≈0.6 s at 60 fps)
    trailWidthM: 0.16,
    trailColor: 0x00ff9c,
    trailIntensity: 0.55,// additive brightness — subtle, per the reference
    light: false,        // under-glow PointLight (off by default: a dynamic light costs every lit material)
    // -- FLY (2026-09-28) --
    flyDelay: 0.22,      // s of air before a held Space turns into FLY (so a tap is still a hop)
    flyClimbMS: 7,       // climb rate while held
    flyAccel: 4,         // 1/s - how fast vy chases the climb / glide rate
    glideSinkMS: 1.6,    // gentle sink after releasing (or when out of stamina)
    flyMaxAltM: 45,      // ceiling above the surface under you
    staminaDrain: 0.2,   // per second of climbing (~5 s of climb from full)
    staminaRegen: 0.3,   // per second while hovering on the ground
    flyResume: 0.15,     // after running dry, need this much back before climbing again
    // -- TRICKS --
    pivotM: 0.9,         // flips/spins pivot about the rider's waist, not the deck
    bailSpeedK: 0.35,    // speed kept after a bail
    bailTime: 0.7,       // wobble seconds
  };
  var MODEL = opts.modelUrl || '/assets/models/fal/veh-hoverboard-v2.glb';

  var heightAt = function (x, z) { var f = opts.heightAt || window.WORLD_HEIGHT_AT; var h = f ? f(x, z) : 0; return isFinite(h) ? h : 0; };
  // Water: prefer the host's function; else derive from the ocean module the same way the
  // host's SWIM LAW does (terrain below -0.45 = sea, surface = 0.05 + waveH·0.55).
  var waterAt = function (x, z, t) {
    if (opts.waterHeightAt) { var w = opts.waterHeightAt(x, z, t); return (w === null || w === undefined || !isFinite(w)) ? NaN : w; }
    if (heightAt(x, z) >= -0.45) return NaN;
    var O = window.__worldOcean;
    return 0.05 + (O && O.waveH ? O.waveH(x, z, t) * 0.55 : 0);
  };
  var colliders = function () {
    var c = opts.colliders;
    if (typeof c === 'function') c = c();
    return c || (window.WORLD_LAYOUT && window.WORLD_LAYOUT.realmColliders) || [];
  };
  var disposables = [];
  function track(o) { disposables.push(o); return o; }

  // ── BOARD: outer group = physics transform (YXZ euler), inner = normalised model ──
  var board = new THREE.Group();
  board.name = 'hoverboard-v2';
  board.rotation.order = 'YXZ';
  board.visible = false;                     // appears on first mount (summoned under your feet)
  scene.add(board);
  // trick node: spins / flips about the rider's waist (pivotM above the board origin); inner = the mesh
  // (varial spins only the inner, so the rider's feet stay put while the board turns under them)
  var PIV = TUNE.pivotM * U;
  var trick = new THREE.Group(); trick.rotation.order = 'YXZ'; trick.position.y = PIV;
  board.add(trick);
  var inner = new THREE.Group(); inner.position.y = -PIV;
  trick.add(inner);
  var deckTop = 0.12 * U;                    // updated from the real model's bounds
  var KIT = window.HoverboardKit, kit = null, styleId = null;
  var useKit = !!(KIT && !opts.modelUrl && opts.style !== 'glb');
  var fx = (useKit && window.buildHoverboardFX) ? window.buildHoverboardFX({ THREE: THREE, scene: scene, max: 160, size: 0.35 * U }) : null;
  var MOD = { mul: 1, t: 0, stun: 0, noise: 0, nt: 0, turn: 1, tt: 0 };   // external race modifiers (see setModifier)
  var TR = window.HoverboardTricks ? window.HoverboardTricks.create(opts.trickTune) : null;
  var MV = window.HoverboardMoves ? window.HoverboardMoves.create() : null;   // rail grinds + manuals (world-hoverboard-moves.js)

  // Normalise any board model: longest horizontal axis → +Z, length → TUNE.lengthM, bottom
  // on y=0, centred. WHY: fal exports arrive with arbitrary axes/scales; one routine means a
  // re-generated board drops in with no code change.
  function fit(obj) {
    obj.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3());
    if (sz.x > sz.z) obj.rotation.y = Math.PI / 2;
    obj.updateMatrixWorld(true);
    box.setFromObject(obj); sz = box.getSize(new THREE.Vector3());
    var k = TUNE.lengthM * U / Math.max(sz.z, 1e-3);
    obj.scale.multiplyScalar(k);
    obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    var c = box.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
    obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    deckTop = box.max.y;
    // a board should never read taller than ~0.25 m (a fat bounding box = fins/antennae)
    deckTop = Math.min(deckTop, 0.25 * U);
    inner.add(obj);
  }
  function fallback() {
    var g = new THREE.Group();
    var deck = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.06, 1.6)),
      track(new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.35, metalness: 0.8 })));
    deck.position.y = 0.05; g.add(deck);
    var strip = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.015, 1.45)),
      track(new THREE.MeshBasicMaterial({ color: TUNE.trailColor, toneMapped: false })));
    strip.position.y = 0.012; g.add(strip);
    return g;
  }
  function setStyle(id, palette) {
    if (!KIT) return null;
    if (kit) { inner.remove(kit); kit.userData.dispose(); }
    kit = KIT.build(THREE, id || 'sunburst', palette || opts.palette);
    styleId = kit.userData.style;
    kit.scale.setScalar(U);
    inner.add(kit);
    deckTop = kit.userData.deckTopM * U;
    return kit;
  }
  if (useKit) setStyle(opts.style);
  else if (opts.loader) {
    opts.loader.load(MODEL, function (g) {
      g.scene.traverse(function (o) {
        if (o.isMesh) { o.castShadow = true; if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; }
      });
      fit(g.scene);
    }, undefined, function () { console.warn('[hoverboard] ' + MODEL + ' failed — procedural board'); fit(fallback()); });
  } else fit(fallback());

  // ── UNDER-THRUST: additive emissive disc (+ optional light) ──
  // WHY a disc not a light: an additive unlit disc "reads" as glow at zero lighting cost.
  var thrustMat = track(new THREE.MeshBasicMaterial({ color: TUNE.trailColor, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  var thrust = new THREE.Mesh(track(new THREE.CircleGeometry(0.34 * U, 28)), thrustMat);
  thrust.rotation.x = -Math.PI / 2;
  thrust.scale.set(0.55, 1, 1);             // oval under a long deck (x narrow before the -90° tilt → local x stays x)
  thrust.position.y = -0.02 * U;
  thrust.renderOrder = 2;
  thrust.visible = !useKit;                  // kit boards carry their own underglow + flames
  inner.add(thrust);
  var glowLight = null;
  if (TUNE.light) { glowLight = new THREE.PointLight(TUNE.trailColor, 1.6, 3 * U); glowLight.position.y = -0.1 * U; board.add(glowLight); }

  // ── LIGHT TRAIL: a camera-agnostic horizontal ribbon from the board's tail ──
  // Vertex colours fade to black toward the old end; with ADDITIVE blending black = invisible,
  // so we get a soft fade without sorting or an alpha attribute.
  var NT = TUNE.trailLen;
  var tPos = new Float32Array(NT * 2 * 3), tCol = new Float32Array(NT * 2 * 3);
  var tIdx = [];
  for (var i = 0; i < NT - 1; i++) { var a = i * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  var tGeo = track(new THREE.BufferGeometry());
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setIndex(tIdx);
  var trail = new THREE.Mesh(tGeo, track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
  trail.frustumCulled = false;               // positions are world-space and change every frame
  trail.visible = false;
  scene.add(trail);
  var trailCount = 0, trailC = new THREE.Color(TUNE.trailColor);

  // ── STATE ──
  var s = {
    riding: false, w: 0, restored: true, avatar: null,
    x: 0, z: 0, y: 0, vy: 0, air: false, v: 0, psi: 0, yawRate: 0, thr: 0,
    pitch: 0, roll: 0, jumpHeld: false, t: 0, surface: 0,
    airT: 0, flying: false, climbing: false, stamina: 1, exhausted: false, bail: 0, thrustK: 0, restPrev: 0, restPrevOk: false,
  };
  var TIN = { grabKind: 'indy', spinL: false, spinR: false, flipF: false, flipB: false, grab: false, varialL: false, varialR: false, rollL: false, rollR: false };
  var own = new THREE.Vector3();
  var pos = opts.playerPos || own;
  var RP = window.WorldRiderPose ? window.WorldRiderPose.create(THREE) : null;
  var V3 = THREE.Vector3;
  var _up = new V3(), _fw = new V3(), _lf = new V3(), _rf = new V3(), _rl = new V3(), _tp = new V3();
  var _standP = new V3(), _standQ = new THREE.Quaternion(), _riderQ = new THREE.Quaternion(), _yq = new THREE.Quaternion();
  var _trQ = new THREE.Quaternion(), _handR = new V3(), _elbR = new V3();
  var _Y = new V3(0, 1, 0);
  var T = { spineDir: new V3(), neckDir: new V3(), footL: new V3(), footR: new V3(),
            kneePoleL: new V3(), kneePoleR: new V3(), armDirL: new V3(), armDirR: new V3(), foreDirL: new V3(), foreDirR: new V3() };

  function wrap(a) { while (a > Math.PI) a -= 6.283185307; while (a < -Math.PI) a += 6.283185307; return a; }
  function ease(t) { return t * t * (3 - 2 * t); }
  // wave phase must match the ocean shader's clock (host passes opts.time = () => clock.elapsedTime)
  function surfaceAt(x, z) { var h = heightAt(x, z), w = waterAt(x, z, opts.time ? opts.time() : s.t); return isFinite(w) ? Math.max(h, w) : h; }

  function mount(avatar, o) {
    o = o || {};
    s.avatar = avatar || s.avatar;
    if (s.riding) return;
    s.riding = true; board.visible = true;
    s.x = pos.x; s.z = pos.z;
    s.psi = isFinite(o.yaw) ? o.yaw : (s.avatar ? s.avatar.rotation.y : 0);
    s.v = isFinite(o.speedMS) ? Math.max(0, o.speedMS) : 0;
    s.surface = surfaceAt(s.x, s.z);
    s.y = s.surface + 0.05 * U; s.vy = 1.5 * U; s.air = false;   // a small lift-off as it powers up
    s.pitch = 0; s.roll = 0; s.yawRate = 0; s.thr = 0; trailCount = 0;
    s.airT = 0; s.flying = false; s.climbing = false; s.bail = 0; s.restPrevOk = false;
    if (TR) TR.reset();
  }
  function dismount() {
    if (!s.riding) return;
    s.riding = false; s.v = 0; s.yawRate = 0; s.air = false;
    // step off to the toe side (rider faces the board's right, see stance below)
    pos.x = s.x - Math.cos(s.psi) * 0.7 * U; pos.z = s.z + Math.sin(s.psi) * 0.7 * U;
  }

  /* step(dt, input, camYaw) — PHYSICS (moves playerPos while riding). */
  function step(dt, inp, camYaw) {
    dt = Math.min(dt, 0.05);
    s.t += dt;
    if (!s.riding) return;
    inp = inp || {};
    var B = TUNE;
    if (MOD.t > 0) MOD.t -= dt; if (MOD.stun > 0) MOD.stun -= dt;   // race modifiers: boost (mul), stun, steer noise (Sway Dust) — set by world-race-run.js
    if (MOD.noise > 0) { MOD.nt -= dt; if (MOD.nt <= 0) MOD.noise = 0; else s.psi += Math.sin(s.t * 35) * MOD.noise * dt; }
    s.x = pos.x; s.z = pos.z;                            // accept host collision corrections
    // steering: mouse (camera yaw) + A/D carve
    var steer = s.air ? 0 : (inp.right ? 1 : 0) - (inp.left ? 1 : 0);   // airborne: A/D are trick keys
    var target = (isFinite(camYaw) ? camYaw : s.psi) - steer * B.carveOffset;
    var boost = !!inp.boost && !s.air;                   // airborne: Shift is the trick modifier
    var top = (boost ? B.boostMS : B.topMS) * (MOD.t > 0 ? MOD.mul : 1) * (MOD.stun > 0 ? 0.2 : 1);
    var sf = Math.min(1, Math.abs(s.v) / B.topMS);
    if (MOD.tt > 0) MOD.tt -= dt; var maxRate = (B.turnRateLow + (B.turnRateHigh - B.turnRateLow) * sf) * (s.air ? 0.5 : 1) * (MOD.tt > 0 ? MOD.turn : 1);   // drift = wider/tighter arc
    var rate = Math.max(-maxRate, Math.min(maxRate, wrap(target - s.psi) * B.steerGain));
    s.psi = wrap(s.psi + rate * dt);
    s.yawRate += (rate - s.yawRate) * (1 - Math.exp(-8 * dt));
    // throttle / brake / reverse / coast
    var want = MOD.stun > 0 ? 0 : ((s.air && inp.boost) ? 0 : (inp.fwd ? 1 : 0) - (inp.back ? 1 : 0));   // Shift+W/S in the air = flips, not throttle
    s.thr += (want - s.thr) * (1 - Math.exp(-8 * dt));
    var th = s.thr, a = 0;
    if (th > 0.02) a = s.v < -0.2 ? B.brakeMS2 : ((boost || (MOD.t > 0 && MOD.mul > 1)) ? B.boostAccelMS2 : B.accelMS2) * th * Math.max(0, 1 - (s.v / top) * (s.v / top));
    else if (th < -0.02) a = s.v > 0.2 ? -B.brakeMS2 * -th : -B.accelMS2 * 0.4 * -th * Math.max(0, 1 + s.v / B.reverseMS);
    if (s.v > top) a -= 3;                               // boost released: bleed back to cruise, don't snap
    var sx = Math.sin(s.psi), cz = Math.cos(s.psi), hl = 0.5 * B.lengthM * U;
    var grade = (heightAt(s.x + sx * hl, s.z + cz * hl) - heightAt(s.x - sx * hl, s.z - cz * hl)) / (2 * hl);
    if (!s.air) a -= 9.81 * B.slopeGravity * grade / Math.sqrt(1 + grade * grade);
    var vPrev = s.v;
    s.v += a * dt;
    if (Math.abs(th) <= 0.02 || (th > 0 && s.v > 0) || (th < 0 && s.v < 0)) {
      var dv = (B.coastMS2 * (th > 0.02 ? 0.25 : 1) + B.dragK * s.v * s.v) * dt;
      s.v = Math.abs(s.v) <= dv ? 0 : s.v - (s.v > 0 ? dv : -dv);
    }
    if (vPrev > 0 && s.v < 0 && th >= -0.02) s.v = 0;
    s.v = Math.max(-B.reverseMS, Math.min(B.boostMS * 1.05 * (MOD.t > 0 ? Math.max(1, MOD.mul) : 1), s.v));
    // move + collide (circle slide), then world edge
    var d_ = s.v * U * dt;
    s.x += sx * d_; s.z += cz * d_;
    var cs = colliders(), rb = B.radiusM * U;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i]; if (!c) continue;
      var rr = c.r + rb, dx = s.x - c.x, dz = s.z - c.z;
      if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
      var d2 = dx * dx + dz * dz; if (d2 >= rr * rr || d2 < 1e-8) continue;
      var d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      s.x = c.x + nx * rr; s.z = c.z + nz * rr;
      var into = -(sx * nx + cz * nz) * (s.v >= 0 ? 1 : -1);
      if (into > 0) s.v *= 1 - B.impactLoss * into;
    }
    var edge = (opts.worldHalf || (window.WORLD_LAYOUT && window.WORLD_LAYOUT.half) || 380) - 6;
    if (s.x > edge || s.x < -edge || s.z > edge || s.z < -edge) {
      s.x = Math.max(-edge, Math.min(edge, s.x)); s.z = Math.max(-edge, Math.min(edge, s.z)); s.v *= 0.5;
    }
    pos.x = s.x; pos.z = s.z;
    if (window.WORLD_RESOLVE_POS) { window.WORLD_RESOLVE_POS(pos); s.x = pos.x; s.z = pos.z; }   // building walls too
    // hover: spring-damper to (surface + hover + bob); ballistic while airborne
    s.surface = surfaceAt(s.x, s.z);
    var bob = Math.sin(s.t * 2.1) * B.bobM * U * (1 - 0.6 * Math.min(1, Math.abs(s.v) / B.topMS));
    var rest = s.surface + B.hoverM * U + bob;
    var jump = !!inp.jump;
    if (jump && !s.jumpHeld && !s.air && s.y < rest + 0.15 * U) { s.vy = B.hopMS * U; s.air = true; s.airT = 0; s.flying = false; }
    s.jumpHeld = jump;
    if (s.bail > 0) s.bail = Math.max(0, s.bail - dt);
    s.climbing = false;
    if (s.air) {
      s.airT += dt;
      // FLY: hold Space -> climb on stamina; release (or run dry) -> glide; otherwise ballistic
      if (s.exhausted && s.stamina >= B.flyResume) s.exhausted = false;
      var kf = 1 - Math.exp(-B.flyAccel * dt);
      if (jump && s.airT > B.flyDelay && s.stamina > 0 && !s.exhausted) {
        s.flying = true; s.climbing = true;
        s.vy += (B.flyClimbMS * U - s.vy) * kf;
        s.stamina = Math.max(0, s.stamina - B.staminaDrain * dt);
        if (s.stamina <= 0) s.exhausted = true;
      } else if (s.flying && s.vy < -B.glideSinkMS * U) {
        s.vy += (-B.glideSinkMS * U - s.vy) * kf;          // glide: bleed a dive back to a gentle sink
      } else {
        s.vy -= 9.81 * B.gravityK * U * dt * (s.flying ? 0.35 : 1);   // glide sinks gently, a hop is snappy
        if (s.flying && s.vy < -B.glideSinkMS * U) s.vy = -B.glideSinkMS * U;
      }
      s.y += s.vy * dt;
      var ceil = s.surface + B.flyMaxAltM * U;
      if (isFinite(opts.flyCeilingY) && opts.flyCeilingY < ceil) ceil = opts.flyCeilingY;
      if (s.y > ceil) { s.y = ceil; if (s.vy > 0) s.vy = 0; }
      if (s.y < s.surface + 0.08 * U) s.y = s.surface + 0.08 * U;   // terrain rose under a glide
      // tricks: explicit fields win, else map WASD+Shift (see header)
      if (TR) {
        var sh = !!inp.boost;
        TIN.spinL = inp.spinL !== undefined ? !!inp.spinL : (!sh && !!inp.left);
        TIN.spinR = inp.spinR !== undefined ? !!inp.spinR : (!sh && !!inp.right);
        TIN.varialL = inp.varialL !== undefined ? !!inp.varialL : (sh && !!inp.left);
        TIN.varialR = inp.varialR !== undefined ? !!inp.varialR : (sh && !!inp.right);
        TIN.flipF = inp.flipF !== undefined ? !!inp.flipF : (sh && !!inp.fwd);
        TIN.flipB = inp.flipB !== undefined ? !!inp.flipB : (sh && !!inp.back);
        TIN.rollL = !!inp.rollL; TIN.rollR = !!inp.rollR;
        TIN.grab = inp.grab !== undefined ? !!inp.grab : (sh && !inp.left && !inp.right && !inp.fwd && !inp.back);
        TIN.grabKind = inp.grabKind || 'indy';
        TR.step(dt, TIN, true);
      }
      if (s.y <= rest && s.vy < 0) land();                 // spring catches the landing (soft compression)
    } else {
      if (TR) TR.step(dt, null, false);
      s.stamina = Math.min(1, s.stamina + B.staminaRegen * dt);
      // damp RELATIVE to the ground's own vertical speed under the board (feed-forward), so the hover
      // follows rolling terrain at speed instead of lagging into the slope / floating off crests
      var K = B.springK, C = 2 * Math.sqrt(K) * B.damping;
      var gv = s.restPrevOk ? Math.max(-40 * U, Math.min(40 * U, (rest - s.restPrev) / Math.max(dt, 1e-4))) : 0;
      s.vy += (K * (rest - s.y) - C * (s.vy - gv)) * dt;
      s.y += s.vy * dt;
      if (s.y < s.surface + 0.08 * U) { s.y = s.surface + 0.08 * U; if (s.vy < 0) s.vy = 0; }   // never scrape through
    }
    s.restPrev = rest; s.restPrevOk = !s.air;
    /* RAIL GRINDS + MANUALS (guarded: any error just disables the moves) */
    if (MV) { try {
      var mo = MV.step(dt, { x: s.x, y: s.y, z: s.z, psi: s.psi, v: s.v, air: s.air, vy: s.vy, inp: { manual: !!inp.manual, manualNose: !!inp.manualNose, jump: !!inp.jump }, U: U });
      s.manualK = mo.pose.manual; s.grindK = mo.pose.grind; s.slideYaw = mo.pose.slideYaw;
      if (mo.lock && mo.lock.entered && s.air) { land(); if (s.bail > 0) { MV.reset(); mo = { lock: null, events: [], pose: mo.pose }; s.grindK = 0; } }   /* a messy landing on the rail is a bail, not a grind */
      if (mo.lock) {
        s.x = mo.lock.x; s.z = mo.lock.z; pos.x = s.x; pos.z = s.z; s.y = mo.lock.y; s.vy = 0; s.air = false; s.airT = 0; s.psi = mo.lock.psi; s.v = mo.lock.v; s.grinding = true;
        if (mo.pop) { s.vy = TUNE.hopMS * U; s.air = true; s.grinding = false; s.jumpHeld = true; }
        else if (mo.lock.ended) { s.air = true; s.vy = 0; s.grinding = false; }
      } else s.grinding = false;
      if (mo.events.length && TR && TR.inject) mo.events.forEach(function (ev) { TR.inject(ev); });
    } catch (e) { MV = null; if (window.console) console.warn('[hoverboard] moves disabled:', e && e.message); } }
  }

  // touchdown: the trick core checks spin/flip/varial residuals + board tilt -> clean or BAIL
  function land() {
    s.air = false; s.flying = false; s.airT = 0;
    if (!TR) return;
    var tilt = Math.max(Math.abs(s.pitch), Math.abs(s.roll));
    if (!TR.land(tilt)) { s.v *= TUNE.bailSpeedK; s.bail = TUNE.bailTime; if (s.vy > 0) s.vy = 0; }
  }

  /* pose(dt) — VISUALS: board transform, glow, trail, rider stance. Call after the host has
   * placed playerAvatar for the frame (it overrides it while riding / fading). */
  function pose(dt, ctx) {
    ctx = ctx || {};
    var B = TUNE, k = 1 - Math.exp(-B.poseSmooth * dt);
    if (board.visible) {
      if (!s.riding) {                                   // parked: idle hover where you left it
        s.surface = surfaceAt(s.x, s.z);
        s.y += (s.surface + B.hoverM * U * 0.6 + Math.sin(s.t * 1.6) * B.bobM * U - s.y) * k;
      }
      var sx = Math.sin(s.psi), cz = Math.cos(s.psi), hl = 0.4 * B.lengthM * U, hw = 0.2 * U;
      var pT = 0, rT = 0;
      if (!s.air) {
        var hf = surfaceAt(s.x + sx * hl, s.z + cz * hl), hb = surfaceAt(s.x - sx * hl, s.z - cz * hl);
        var hL = surfaceAt(s.x + cz * hw, s.z - sx * hw), hR = surfaceAt(s.x - cz * hw, s.z + sx * hw);
        pT = -Math.atan2(hf - hb, 2 * hl) * 0.8;
        rT = Math.atan2(hL - hR, 2 * hw) * 0.25;
      } else pT = -Math.atan2(s.vy, Math.max(Math.abs(s.v) * U, 1)) * 0.3;   // nose follows the arc a little
      pT += (s.manualK || 0) * 0.22;   /* manual: nose up (nose manual: tail up) */
      var rmax = B.rollMaxDeg * Math.PI / 180;
      var carve = s.riding ? Math.max(-rmax, Math.min(rmax, -Math.atan(s.v * s.yawRate / 9.81))) : 0;
      s.pitch += (pT - s.pitch) * k;
      s.roll += (rT + carve - s.roll) * k;
      var wob = s.bail > 0 ? Math.sin(s.t * 26) * 0.18 * (s.bail / TUNE.bailTime) : 0;   // bail wobble
      board.position.set(s.x, s.y, s.z);
      board.rotation.set(s.pitch, s.psi, s.roll + wob, 'YXZ');
      if (TR) { var A = TR.angles; trick.rotation.set(A.flip, A.spin, A.roll || 0, 'YXZ'); inner.rotation.y = A.varial + (s.slideYaw || 0); }
      board.updateMatrixWorld(true);
      if (kit) {
        var tk = s.riding ? 0.25 + 0.6 * Math.min(1, Math.abs(s.v) / B.topMS) + (s.v > B.topMS ? 0.3 : 0) + (s.climbing ? 0.7 : 0) + (s.air ? 0.1 : 0) : 0.12;
        s.thrustK += (tk - s.thrustK) * Math.min(1, dt * 8);
        kit.userData.setThrust(s.thrustK, Math.sin(s.t * 37));
        if (fx && s.riding) fx.emitFromBoard(kit, dt, s.thrustK, U);
      }
      // thrust glow breathes with throttle/boost and flares on a hop
      var sp = Math.min(1, Math.abs(s.v) / B.boostMS);
      thrustMat.opacity = (s.riding ? 0.35 + 0.45 * sp : 0.22) + (s.air ? 0.15 : 0) + Math.sin(s.t * 9) * 0.04;
      if (glowLight) glowLight.intensity = 0.8 + 1.4 * sp;
      updateTrail(sx, cz);
    }
    if (fx) fx.update(dt);
    // rider
    s.w = Math.max(0, Math.min(1, s.w + (s.riding ? dt : -dt) / B.mountTime));
    var av = s.avatar;
    if (!av) return;
    if (s.w <= 0) { if (!s.restored && RP && RP.rig()) RP.restore(); s.restored = true; return; }
    s.restored = false;
    var e = ease(s.w), rig = RP ? RP.bind(av) : null;
    // SURF STANCE (regular foot): body faces the board's RIGHT side, so the rider's left
    // (+X local) points at the nose. Rider yaw = board yaw − 90°, then the board's pitch/roll.
    trick.getWorldQuaternion(_trQ);                         // board + spin/flip (varial excluded: feet stay)
    _yq.setFromAxisAngle(_Y, -Math.PI / 2);
    _riderQ.copy(_trQ).multiply(_yq);
    _up.set(0, 1, 0).applyQuaternion(_trQ);
    var grabW = TR ? TR.angles.grab : 0;
    var tuck = TR && TR.state.air ? Math.min(1, (Math.abs(TR.angles.flip) + Math.abs(TR.angles.roll || 0)) / 1.2) : 0;   // knees pulled in mid-flip/roll
    var hipH = rig ? rig.hipH : 3.6, standH = rig && rig.hasBones ? (B.crouchM + 0.25 * grabW + 0.16 * tuck + 0.12 * (s.grindK || 0)) * U : 0;
    _tp.set(0, deckTop - PIV, 0); trick.localToWorld(_tp);  // deck centre (world)
    _tp.addScaledVector(_up, -standH);                      // root drops → IK bends the knees
    _standP.copy(av.position); _standQ.copy(av.quaternion);
    av.position.lerpVectors(_standP, _tp, e);
    av.quaternion.slerpQuaternions(_standQ, _riderQ, e);
    if (ctx.showRider !== undefined) av.visible = !!ctx.showRider;
    av.updateMatrixWorld(true);
    if (!RP || !rig || !rig.hasBones) return;
    _fw.set(0, 0, 1).applyQuaternion(_trQ);                // board nose
    _rf.set(0, 0, 1).applyQuaternion(_riderQ);             // rider's chest direction (board's right)
    _rl.set(1, 0, 0).applyQuaternion(_riderQ);             // rider's left (= board nose)
    // feet on the deck, spread along the board: rider-left foot at the nose
    var half = B.stanceM * 0.5 * U;
    _tp.set(0, deckTop - PIV, 0); trick.localToWorld(_tp);
    T.footL.copy(_tp).addScaledVector(_fw, half).addScaledVector(_up, rig.footH * 0.8);
    T.footR.copy(_tp).addScaledVector(_fw, -half).addScaledVector(_up, rig.footH * 0.8);
    T.kneePoleL.copy(_rf).addScaledVector(_rl, 0.4).addScaledVector(_up, 0.1);
    T.kneePoleR.copy(_rf).addScaledVector(_rl, -0.4).addScaledVector(_up, 0.1);
    // torso: slight athletic hunch toward the toes + lean with the carve
    T.spineDir.copy(_up).multiplyScalar(0.94 - 0.2 * tuck).addScaledVector(_rf, 0.26 + 0.4 * tuck).addScaledVector(_fw, -0.32 * (s.manualK || 0)).normalize();   // manual: lean back, nose manual: lean forward
    // head: look where the board goes, not where the chest points
    T.neckDir.copy(_up).multiplyScalar(0.85).addScaledVector(_fw, 0.5).normalize();
    // arms out for balance, along the board axis, slightly down; forearms relax forward
    T.armDirL.copy(_rl).multiplyScalar(0.85).addScaledVector(_up, -0.42).addScaledVector(_rf, 0.18);
    T.armDirR.copy(_rl).multiplyScalar(-0.85).addScaledVector(_up, -0.42).addScaledVector(_rf, 0.18);
    T.foreDirL.copy(_rl).multiplyScalar(0.75).addScaledVector(_up, -0.2).addScaledVector(_rf, 0.4);
    T.foreDirR.copy(_rl).multiplyScalar(-0.75).addScaledVector(_up, -0.2).addScaledVector(_rf, 0.4);
    // GRAB: trailing hand reaches down to the toe-side rail (two-bone IK), knees deeper
    if (grabW > 0.5) {
      _handR.copy(_tp).addScaledVector(_rf, 0.18 * U).addScaledVector(_fw, -0.12 * U).addScaledVector(_up, 0.05 * U);
      _elbR.copy(_rl).multiplyScalar(-0.6).addScaledVector(_up, 0.3).addScaledVector(_rf, 0.5);
      T.handR = _handR; T.elbowPoleR = _elbR;
    } else { T.handR = null; T.elbowPoleR = null; }
    RP.apply(e, T);
  }

  // push a new tail sample, age the rest; hidden when slow/parked so it never smears idle
  var _tail = new V3(), _side = new V3();
  function updateTrail(sx, cz) {
    var moving = s.riding && Math.abs(s.v) > 3;
    if (!moving) {
      if (trailCount > 0) trailCount = Math.max(0, trailCount - 2);   // fade out over a few frames
      if (!trailCount) { trail.visible = false; return; }
    } else {
      _tail.set(0, 0.04 * U, -0.5 * TUNE.lengthM * U); inner.localToWorld(_tail);
      _side.set(cz, 0, -sx).multiplyScalar(TUNE.trailWidthM * 0.5 * U);   // board-left, horizontal
      tPos.copyWithin(6, 0, (NT - 1) * 6);                 // shift history back one sample
      tPos[0] = _tail.x + _side.x; tPos[1] = _tail.y; tPos[2] = _tail.z + _side.z;
      tPos[3] = _tail.x - _side.x; tPos[4] = _tail.y; tPos[5] = _tail.z - _side.z;
      if (trailCount < NT) {                               // first frames: collapse unused samples onto the head
        for (var j = trailCount + 1; j < NT; j++) for (var q = 0; q < 6; q++) tPos[j * 6 + q] = tPos[q];
      }
      trailCount = Math.min(NT, trailCount + 1);
    }
    var sp = Math.min(1, Math.abs(s.v) / TUNE.boostMS);
    for (var i = 0; i < NT; i++) {
      var f = i < trailCount ? Math.pow(1 - i / NT, 1.6) * TUNE.trailIntensity * (0.5 + 0.5 * sp) : 0;
      for (var side = 0; side < 2; side++) {
        var o = (i * 2 + side) * 3;
        tCol[o] = trailC.r * f; tCol[o + 1] = trailC.g * f; tCol[o + 2] = trailC.b * f;
      }
    }
    tGeo.attributes.position.needsUpdate = true;
    tGeo.attributes.color.needsUpdate = true;
    trail.visible = true;
  }

  return {
    board: board,
    tune: TUNE,
    mount: mount,
    dismount: dismount,
    toggle: function (avatar, o) { if (s.riding) dismount(); else mount(avatar, o); return s.riding; },
    isRiding: function () { return s.riding; },
    isActive: function () { return s.riding || s.w > 0; },          // still fading the rider off
    speedMS: function () { return s.v; },
    setModifier: function (o) { o = o || {}; if (o.mul != null) { MOD.mul = o.mul; MOD.t = o.dur || 1; } if (o.stun != null) MOD.stun = o.stun; if (o.noise != null) { MOD.noise = o.noise; MOD.nt = o.noiseDur || 2; } if (o.turn != null) { MOD.turn = o.turn; MOD.tt = o.turnDur || 0.15; } },   // race power-ups / attacks / drift steering
    modifier: function () { return MOD; },
    heading: function () { return s.psi; },
    velocity: function () { return { x: Math.sin(s.psi) * s.v * U, z: Math.cos(s.psi) * s.v * U }; },
    rideBaseY: function () { return s.y + deckTop - (TUNE.crouchM * U); },   // camera/eye base while riding
    // -- 2026-09-28: styles, fly, tricks --
    setStyle: function (id, palette) { if (!KIT) return null; useKit = true; thrust.visible = false; return setStyle(id, palette); },
    setPalette: function (p) { if (kit) kit.userData.setPalette(p); },
    style: function () { return styleId; },
    kit: function () { return kit; },
    moves: MV, trickNode: trick,
    fx: fx,
    tricks: TR,
    onTrick: function (fn) { return TR ? TR.onTrick(fn) : function () {}; },
    stamina: function () { return s.stamina; },
    isFlying: function () { return s.flying; },
    isAirborne: function () { return s.air; },
    isBailing: function () { return s.bail > 0; },
    altitudeM: function () { return (s.y - s.surface) / U; },
    state: function () { return s; },
    step: step,
    pose: pose,
    update: function (dt, input, camYaw, ctx) { step(dt, input, camYaw); pose(dt, ctx); },
    dispose: function () {
      scene.remove(board); scene.remove(trail);
      if (kit) kit.userData.dispose();
      if (fx) fx.dispose();
      disposables.forEach(function (d) { if (d.dispose) d.dispose(); });
      if (RP) RP.restore();
    },
  };
};
