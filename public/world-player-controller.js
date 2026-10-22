/**
 * world-player-controller.js  —  SHADDAI World 3D
 * NEXUS | Kinematic capsule player controller (ground snap, slopes, steps, collision,
 *         run / sprint / jump / roll / landing compression / ledge climb / swim handoff)
 *
 * Owner brief: "run on the terrain and get actual ground, not sitting models we walk through
 * and our body halfway goes into the ground" + "real gameplay: rolling, jumping, ground compression".
 *
 * SCALE LAW: 1 m = 7/1.8 = 3.889 world units. The player is 1.8 m (7 u) tall.
 *   - Every tunable in TUNE is in METRES / SECONDS (human numbers).
 *   - Every position / velocity going IN or OUT of the api is in WORLD UNITS (what the host uses).
 *
 * Pure math, no THREE dependency (THREE is accepted but unused), zero per-frame allocation on the
 * hot path except the `events` array contents (reused array, cleared each step — copy it if you keep it).
 *
 *   const ctl = window.buildPlayerController({
 *     THREE,                                   // optional
 *     heightAt: (x,z) => terrainY,             // units
 *     colliders: {
 *       circles: () => [{x,z,r, top?, bottom?}],               // units; no top = infinitely tall
 *       obbs:    () => [{x,z,hx,hz,rot, top?, bottom?}],        // units; rot = rotation.y (radians)
 *     },
 *     waterHeightAt: (x,z) => surfaceY | null, // optional → 'swim' state
 *     tune: { run: 7 }                         // optional overrides (metres/seconds)
 *   });
 *   const o = ctl.step(dt, {fwd,back,left,right,sprint,jump,roll,crouch,walk?,x?,y?}, camYaw);
 *   // o.pos {x,y,z} FEET position (units), o.vel {x,y,z} (u/s), o.grounded, o.state, o.events[],
 *   // o.compression 0..1, o.speed01 0..1, o.lean -1..1, o.facing (yaw), o.stamina 0..1, o.iframes
 *
 * See docs/PLAYER-CONTROLLER.md for the TUNE table, events, animation mapping and host wiring.
 */
(function (global) {
  'use strict';

  var U = 7 / 1.8;                 // world units per metre
  var PI = Math.PI;
  var EMPTY = [];

  var DEFAULT_TUNE = {
    // capsule
    radius: 0.35,            // m
    height: 1.8,             // m
    footSampleK: 0.9,        // foot samples sit at radius*K around the centre (5-point footprint)
    // gravity
    gravity: 22,             // m/s² (arcade)
    terminalFall: 40,        // m/s
    // ground
    maxSlopeDeg: 42,         // walkable slope; steeper = slide
    stepUp: 0.45,            // m — curbs / ledges you walk straight onto
    snapDown: 0.45,          // m per substep — stick to downhill slopes / step off curbs without going airborne
    groundSkin: 0.02,        // m
    airStepReach: 0.05,      // m — while rising, only lips this small are stepped onto
    // locomotion
    walk: 3.2, run: 6.5, sprint: 9.5, crouch: 1.8,   // m/s
    defaultGait: 'run',      // gait with no modifier held: 'run' | 'walk'
    accelGround: 30,         // m/s²
    decelGround: 40,         // m/s²
    airControl: 0.25,        // fraction of accelGround available in the air
    turnRate: 12,            // rad/s facing turn speed
    leanGain: 0.35,          // lean = clamp(yawRate * speed01 * gain)
    // stamina (sprint)
    staminaSeconds: 8,       // full bar lasts 8 s of sprint
    staminaRegenDelay: 1.5,  // s after sprint stops before regen
    staminaRegenSeconds: 4,  // s to refill empty → full
    staminaResume: 0.2,      // after emptying, need this much before sprint re-engages
    // jump
    jumpHeight: 1.35,        // m apex (held)
    coyoteTime: 0.12,        // s
    jumpBuffer: 0.12,        // s
    jumpCutMul: 0.45,        // vy multiplier on early release (variable height)
    doubleJump: false,
    airJumps: 1,
    jumpStartTime: 0.15,     // s 'jumpStart' state window
    // roll / dodge
    rollTime: 0.55,          // s
    rollSpeed: 7,            // m/s burst
    rollCooldown: 0.6,       // s (counted after the roll ends)
    rollIFrames: 0.4,        // s of invulnerability from roll start
    rollSlopeGain: 1,        // 1 = full gravity-along-slope added to roll speed
    // landing
    landSoft: 3,             // m/s impact → 0 compression
    compressFull: 14,        // m/s impact → 1 compression
    compressFreq: 14,        // rad/s spring back
    compressDamp: 0.9,       // damping ratio
    crouchCompression: 0.35, // compression held while crouching
    hardLandSpeed: 12,       // m/s → 'hardLand' + recovery
    hardLandRecovery: 0.25,  // s
    hardLandSpeedMul: 0.35,  // speed cap multiplier during recovery
    landAnimTime: 0.18,      // s 'land' state window (impact > landSoft)
    // slide (steep slopes)
    slideFriction: 2,        // m/s²
    // ledge climb
    climbMax: 1.2,           // m — ledges up to this above the take-off ground are climbable
    climbTime: 0.6,          // s
    // swim
    chestHeight: 1.3,        // m — water deeper than this = swim
    swimFeetDepth: 1.25,     // m — feet this far below the surface while swimming
    swim: 2.5,               // m/s
    swimAccel: 8,            // m/s²
    // integration
    maxSubstep: 0.25,        // m — never move more than this per substep (anti-tunnel)
    maxSubsteps: 40,
    maxDt: 0.1,              // s — clamp long frames
    fixedDt: 1 / 60,         // s — fixed physics tick (0 = variable step); render uses out.renderPos (interpolated)
    maxTicks: 6              // max fixed ticks per frame
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function wrapAngle(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }

  function buildPlayerController(opts) {
    opts = opts || {};
    var H = typeof opts.heightAt === 'function' ? opts.heightAt : function () { return 0; };
    var col = opts.colliders || {};
    var circlesFn = typeof col.circles === 'function' ? col.circles : function () { return col.circles || EMPTY; };
    var obbsFn = typeof col.obbs === 'function' ? col.obbs : function () { return col.obbs || EMPTY; };
    var waterAt = typeof opts.waterHeightAt === 'function' ? opts.waterHeightAt : null;

    var T = {}, k;
    for (k in DEFAULT_TUNE) T[k] = DEFAULT_TUNE[k];
    if (opts.tune) for (k in opts.tune) T[k] = opts.tune[k];

    var D = {};
    function derive() {
      D.R = T.radius * U; D.h = T.height * U; D.sR = D.R * T.footSampleK;
      D.g = T.gravity * U; D.term = T.terminalFall * U;
      D.tanMax = Math.tan(T.maxSlopeDeg * PI / 180);
      D.stepUp = T.stepUp * U; D.snap = T.snapDown * U; D.skin = T.groundSkin * U; D.airReach = T.airStepReach * U;
      D.sub = T.maxSubstep * U; D.v0 = Math.sqrt(2 * D.g * T.jumpHeight * U);
      D.climbMax = T.climbMax * U; D.chest = T.chestHeight * U; D.swimDepth = T.swimFeetDepth * U;
      D.eps = 0.25 * U;   // gradient probe
    }
    derive();

    // ── state ──
    var pos = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 };
    var grounded = true, groundKind = 'terrain', lastGroundY = 0;
    var coyote = 0, jumpBuf = 0, jumpHeld = false, airJumps = T.airJumps, prevJump = false, prevRoll = false;
    var jumpT = 99, landT = 99, landImpact = 0;
    var rollT = 0, rollCd = 0, rollDX = 0, rollDZ = 1, rollSpd = 0;
    var stamina = 1, stamDelay = 99, exhausted = false, sprinting = false;
    var recover = 0, comp = 0, compV = 0;
    var sliding = false, swimming = false;
    var climb = null;
    var facing = 0, lean = 0, wishX = 0, wishZ = 0, wishMag = 0;
    var state = 'idle';
    var events = [];

    // near-collider scratch lists (broadphase per frame)
    var nC = [], nO = [], nOc = [], nOs = [], qC = [], qO = [];
    var queryFn = typeof col.query === 'function' ? col.query : null;   // optional: query(x,z,radius,outCircles,outObbs)
    function gatherNear(reach) {
      nC.length = 0; nO.length = 0; nOc.length = 0; nOs.length = 0;
      var cs, os, i, c, dx, dz, lim;
      if (queryFn) { qC.length = 0; qO.length = 0; queryFn(pos.x, pos.z, reach + D.R, qC, qO); cs = qC; os = qO; }   // spatial-grid broadphase
      else { cs = circlesFn() || EMPTY; os = obbsFn() || EMPTY; }
      for (i = 0; i < cs.length; i++) {
        c = cs[i]; if (!c || c.trigger || c.solid === false || !(c.r > 0) || !isFinite(c.x) || !isFinite(c.z)) continue;
        dx = pos.x - c.x; dz = pos.z - c.z; lim = c.r + D.R + reach;
        if (dx * dx + dz * dz < lim * lim) nC.push(c);
      }
      for (i = 0; i < os.length; i++) {
        c = os[i]; if (!c || c.trigger || c.solid === false || !(c.hx > 0) || !(c.hz > 0) || !isFinite(c.x) || !isFinite(c.z)) continue;
        dx = pos.x - c.x; dz = pos.z - c.z; lim = Math.sqrt(c.hx * c.hx + c.hz * c.hz) + D.R + reach;
        if (dx * dx + dz * dz < lim * lim) { nO.push(c); nOc.push(Math.cos(c.rot || 0)); nOs.push(Math.sin(c.rot || 0)); }
      }
    }

    // ── ground query ──
    // GQ.g = feet height at (x,z): centre terrain height, lifted only by footprint bumps that rise
    // steeper than a walkable slope (so planar slopes ≤ maxSlope keep feet EXACTLY on heightAt), plus
    // reachable collider tops. GQ.blocked = something higher than `reach` in the move direction.
    var GQ = { g: 0, h0: 0, kind: 'terrain', blocked: false, nx: 0, nz: 0 };
    var SX = [1, -1, 0, 0], SZ = [0, 0, 1, -1];
    function groundQuery(x, z, refY, reach, sampleReach, mdx, mdz) {
      var h0 = H(x, z); if (!isFinite(h0)) h0 = refY;
      var g = h0, i, hi, ox, oz, rise, lift, ml = Math.sqrt(mdx * mdx + mdz * mdz);
      GQ.blocked = false; GQ.kind = 'terrain'; GQ.h0 = h0;
      if (ml > 1e-9 && h0 - refY > reach) { GQ.blocked = true; GQ.nx = mdx / ml; GQ.nz = mdz / ml; }
      for (i = 0; i < 4; i++) {
        ox = SX[i] * D.sR; oz = SZ[i] * D.sR;
        hi = H(x + ox, z + oz); if (!isFinite(hi)) continue;
        rise = hi - refY;
        if (rise > sampleReach) {
          if (!GQ.blocked && ml > 1e-9 && (ox * mdx + oz * mdz) > 1e-9) { GQ.blocked = true; GQ.nx = SX[i]; GQ.nz = SZ[i]; }
          continue;
        }
        lift = hi - D.sR * D.tanMax;
        if (lift > g) g = lift;
      }
      // walkable tops (platforms / roofs)
      var c, dx, dz, rr, top, lim = refY + reach;
      for (i = 0; i < nC.length; i++) {
        c = nC[i]; top = c.top; if (top == null || !(top > g) || top > lim) continue;
        dx = x - c.x; dz = z - c.z; rr = c.r + D.R * 0.6;
        if (dx * dx + dz * dz <= rr * rr) { g = top; GQ.kind = 'top'; }
      }
      for (i = 0; i < nO.length; i++) {
        c = nO[i]; top = c.top; if (top == null || !(top > g) || top > lim) continue;
        dx = x - c.x; dz = z - c.z;
        var lx = dx * nOc[i] - dz * nOs[i], lz = dx * nOs[i] + dz * nOc[i];
        if (Math.abs(lx) <= c.hx + D.R * 0.6 && Math.abs(lz) <= c.hz + D.R * 0.6) { g = top; GQ.kind = 'top'; }
      }
      GQ.g = g;
      return GQ;
    }
    // terrain gradient (dh/dx, dh/dz) at x,z → GR
    var GR = { x: 0, z: 0, t: 0 };
    function gradient(x, z) {
      var a = H(x + D.eps, z), b = H(x - D.eps, z), c = H(x, z + D.eps), d = H(x, z - D.eps);
      GR.x = (isFinite(a) && isFinite(b)) ? (a - b) / (2 * D.eps) : 0;
      GR.z = (isFinite(c) && isFinite(d)) ? (c - d) / (2 * D.eps) : 0;
      GR.t = Math.sqrt(GR.x * GR.x + GR.z * GR.z);
      return GR;
    }

    // ── walls: push the capsule circle out of circles / OBB footprints ──
    var W = { nx: 0, nz: 0, top: Infinity };
    var P = { x: 0, z: 0 };
    function wallActive(c, feetY, reach) {
      if (opts.skipWalls && opts.skipWalls()) return false;               // host says: no surface walls here (underground bazaar)
      if (c.top != null && c.top <= feetY + reach) return false;       // low enough to step onto / stand on
      if (c.bottom != null && c.bottom >= feetY + D.h) return false;   // overhead (bridge deck etc.)
      return true;
    }
    function resolveWalls(p, feetY, reach) {
      var hit = false, it, i, c, dx, dz, d2, d, rr;
      for (it = 0; it < 3; it++) {
        var any = false;
        for (i = 0; i < nC.length; i++) {
          c = nC[i]; if (!wallActive(c, feetY, reach)) continue;
          dx = p.x - c.x; dz = p.z - c.z; rr = c.r + D.R; d2 = dx * dx + dz * dz;
          if (d2 < rr * rr - 1e-9) {
            d = Math.sqrt(d2); if (d < 1e-9) { dx = 1; dz = 0; d = 1; }
            W.nx = dx / d; W.nz = dz / d; W.top = c.top != null ? c.top : Infinity;
            p.x = c.x + W.nx * rr; p.z = c.z + W.nz * rr; hit = any = true;
          }
        }
        for (i = 0; i < nO.length; i++) {
          c = nO[i]; if (!wallActive(c, feetY, reach)) continue;
          var co = nOc[i], si = nOs[i];
          dx = p.x - c.x; dz = p.z - c.z;
          var lx = dx * co - dz * si, lz = dx * si + dz * co;             // world → local
          var qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz);
          var ex = lx - qx, ez = lz - qz, e2 = ex * ex + ez * ez, nlx, nlz;
          if (e2 >= D.R * D.R - 1e-9) continue;
          if (e2 > 1e-12) {
            d = Math.sqrt(e2); nlx = ex / d; nlz = ez / d;
            lx = qx + nlx * D.R; lz = qz + nlz * D.R;
          } else {                                                       // centre inside: least-penetration axis
            var px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) { nlx = lx < 0 ? -1 : 1; nlz = 0; lx = nlx * (c.hx + D.R); }
            else { nlx = 0; nlz = lz < 0 ? -1 : 1; lz = nlz * (c.hz + D.R); }
          }
          p.x = c.x + lx * co + lz * si; p.z = c.z - lx * si + lz * co;  // local → world
          W.nx = nlx * co + nlz * si; W.nz = -nlx * si + nlz * co; W.top = c.top != null ? c.top : Infinity;
          hit = any = true;
        }
        if (!any) break;
      }
      return hit;
    }
    // still overlapping anything after resolution? (corner ping-pong between two colliders)
    function overlapsWall(p, feetY, reach) {
      var i, c, dx, dz, rr, tol = 1e-7;
      for (i = 0; i < nC.length; i++) {
        c = nC[i]; if (!wallActive(c, feetY, reach)) continue;
        dx = p.x - c.x; dz = p.z - c.z; rr = c.r + D.R - tol;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      for (i = 0; i < nO.length; i++) {
        c = nO[i]; if (!wallActive(c, feetY, reach)) continue;
        dx = p.x - c.x; dz = p.z - c.z;
        var lx = dx * nOc[i] - dz * nOs[i], lz = dx * nOs[i] + dz * nOc[i];
        var ex = Math.max(Math.abs(lx) - c.hx, 0), ez = Math.max(Math.abs(lz) - c.hz, 0), rr2 = D.R - tol;
        if (ex * ex + ez * ez < rr2 * rr2) return true;
      }
      return false;
    }

    function emit(type, data) { var e = data || {}; e.type = type; events.push(e); }

    function land(impactU) {
      var impact = impactU / U;
      grounded = true; vel.y = 0; coyote = 0; airJumps = T.airJumps; jumpHeld = false;
      lastGroundY = pos.y; landT = 0; landImpact = impact;
      var c = clamp((impact - T.landSoft) / (T.compressFull - T.landSoft), 0, 1);
      if (c > comp) { comp = c; compV = 0; }
      emit('land', { impact: impact, compression: c });
      if (impact > T.hardLandSpeed) { recover = T.hardLandRecovery; emit('hardLand', { impact: impact }); }
    }
    function leaveGround() {
      grounded = false; coyote = T.coyoteTime; if (vel.y > 0) vel.y = 0;
      emit('leaveGround');
    }

    // ── ledge climb ──
    var CT = { x: 0, z: 0 };
    function tryClimb(px, pz, nOutX, nOutZ) {
      if (climb || grounded || !(T.climbMax > 0)) return false;
      if (wishMag < 0.1 || (wishX * -nOutX + wishZ * -nOutZ) < 0.3) return false;   // must be pushing into it
      var dist = 2 * D.R + 0.1 * U;
      var tx = px - nOutX * dist, tz = pz - nOutZ * dist;
      var q = groundQuery(tx, tz, pos.y + D.climbMax, 0, D.climbMax + D.sR * D.tanMax, 0, 0);
      var top = q.g, rise = top - pos.y;
      if (!(rise > D.airReach) || rise > D.climbMax || top - lastGroundY > D.climbMax + 0.15 * U) return false;
      CT.x = tx; CT.z = tz;
      if (resolveWalls(CT, top, D.stepUp)) return false;                   // no room on top
      climb = { t: 0, dur: T.climbTime, x0: pos.x, y0: pos.y, z0: pos.z, x1: tx, y1: top, z1: tz };
      vel.x = vel.z = vel.y = 0; rollT = 0; sliding = false;
      emit('climb', { height: rise / U, top: top });
      return true;
    }

    // ── one horizontal substep ──
    function moveHoriz(dx, dz, depth) {
      if (dx * dx + dz * dz < 1e-14) return;
      var reach = grounded ? D.stepUp : (vel.y <= 0 ? D.stepUp * 0.5 : D.airReach);
      var sReach = grounded ? D.stepUp : (reach + D.sR * D.tanMax);
      P.x = pos.x + dx; P.z = pos.z + dz;
      var wallHit = resolveWalls(P, pos.y, reach);
      var wnx = W.nx, wnz = W.nz;
      if (wallHit && overlapsWall(P, pos.y, reach)) {                     // wedged in a corner: refuse the substep
        var vc = vel.x * wnx + vel.z * wnz; if (vc < 0) { vel.x -= vc * wnx; vel.z -= vc * wnz; }
        if (depth === 0) { var dd = dx * wnx + dz * wnz; if (dd < 0) moveHoriz(dx - dd * wnx, dz - dd * wnz, 1); }
        return;
      }
      var q = groundQuery(P.x, P.z, pos.y, reach, sReach, dx, dz);
      var blocked = q.blocked, bnx = q.nx, bnz = q.nz, g = q.g, kind = q.kind;
      if (!blocked && grounded && kind === 'terrain' && g > pos.y + D.skin) {
        var gr = gradient(P.x, P.z);
        if (gr.t > D.tanMax && (gr.x * dx + gr.z * dz) > 0) { blocked = true; bnx = gr.x / gr.t; bnz = gr.z / gr.t; }
      }
      if (blocked) {
        if (!grounded && tryClimb(pos.x, pos.z, -bnx, -bnz)) return;
        var into = vel.x * bnx + vel.z * bnz; if (into > 0) { vel.x -= into * bnx; vel.z -= into * bnz; }
        var dot = dx * bnx + dz * bnz;
        if (depth === 0 && dot > 0) moveHoriz(dx - dot * bnx, dz - dot * bnz, 1);
        return;
      }
      if (wallHit) {
        var vn = vel.x * wnx + vel.z * wnz; if (vn < 0) { vel.x -= vn * wnx; vel.z -= vn * wnz; }
        if (!grounded && isFinite(W.top) && tryClimb(P.x, P.z, wnx, wnz)) return;
      }
      pos.x = P.x; pos.z = P.z;
      if (grounded) {
        if (g >= pos.y - D.snap) { pos.y = g; groundKind = kind; lastGroundY = g; }
        else leaveGround();
      } else if (g > pos.y) {
        var vy = vel.y; pos.y = g;                                         // stepped onto a lip / rising ground
        if (vy <= 0) land(-vy);                                             // (rising: keep the jump going)
      }
    }

    // ── one vertical substep (airborne) — exact constant-gravity integration ──
    function moveVert(h) {
      var prevY = pos.y, vy0 = vel.y;
      var newY = pos.y + vy0 * h - 0.5 * D.g * h * h;
      var vy1 = vy0 - D.g * h;
      if (vy1 < -D.term) { vy1 = -D.term; newY = pos.y + 0.5 * (vy0 + vy1) * h; }
      vel.y = vy1;
      var q = groundQuery(pos.x, pos.z, Math.max(prevY, newY), D.airReach, D.airReach + D.sR * D.tanMax, 0, 0);
      if (newY <= q.g) {
        pos.y = q.g;
        if (vel.y <= 0) { groundKind = q.kind; land(-vel.y); }             // rising: terrain lifted us, jump continues
      } else pos.y = newY;
    }

    function approach(tx, tz, acc, dec, dt) {
      // move horizontal velocity toward (tx,tz): accel when speeding up along target, decel otherwise
      var dvx = tx - vel.x, dvz = tz - vel.z, dl = Math.sqrt(dvx * dvx + dvz * dvz);
      if (dl < 1e-9) return;
      var ts = tx * tx + tz * tz, vs = vel.x * vel.x + vel.z * vel.z;
      var a = (ts >= vs && (tx * vel.x + tz * vel.z) >= 0) ? acc : dec;
      var m = Math.min(dl, a * dt);
      vel.x += dvx / dl * m; vel.z += dvz / dl * m;
    }

    var out = { pos: pos, vel: vel, grounded: true, state: 'idle', events: events, compression: 0,
      speed01: 0, lean: 0, facing: 0, stamina: 1, iframes: false, speed: 0, speedMs: 0, swimming: false };

    function finish(dt) {
      var hs = Math.sqrt(vel.x * vel.x + vel.z * vel.z), ms = hs / U;
      // facing + lean
      var prevF = facing, desired = null;
      if (climb) desired = Math.atan2(climb.x1 - climb.x0, climb.z1 - climb.z0);
      else if (rollT > 0) desired = Math.atan2(rollDX, rollDZ);
      else if (ms > 0.4) desired = Math.atan2(vel.x, vel.z);
      if (desired !== null && dt > 0) {
        var d = wrapAngle(desired - facing), mx = T.turnRate * dt;
        facing = wrapAngle(facing + clamp(d, -mx, mx));
      }
      var yawRate = dt > 0 ? wrapAngle(facing - prevF) / dt : 0;
      var lt = clamp(yawRate * (ms / T.sprint) * T.leanGain, -1, 1);
      lean += (lt - lean) * (1 - Math.exp(-10 * dt));
      // state
      if (climb) state = 'climb';
      else if (swimming) state = 'swim';
      else if (rollT > 0) state = 'roll';
      else if (sliding) state = 'slide';
      else if (!grounded) state = (jumpT < T.jumpStartTime && vel.y > 0) ? 'jumpStart' : 'airborne';
      else if (landT < T.landAnimTime && landImpact > T.landSoft) state = 'land';
      else if (ms < 0.3) state = 'idle';
      else if (sprinting && ms > T.run + 0.3) state = 'sprint';
      else if (ms < (T.walk + T.run) * 0.5) state = 'walk';
      else state = 'run';
      out.grounded = grounded; out.state = state; out.compression = comp;
      out.speed01 = clamp(ms / T.sprint, 0, 1); out.lean = lean; out.facing = facing;
      out.stamina = stamina; out.iframes = rollT > 0 && (T.rollTime - rollT) < T.rollIFrames;
      out.speed = hs; out.speedMs = ms; out.swimming = swimming;
      return out;
    }

    // ── one FIXED physics tick (the owner's gamedev-repo pattern: fixed timestep, render interpolates) ──
    function tick(dt, input, camYaw) {
      var hs0 = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      gatherNear(hs0 * dt + Math.abs(vel.y) * dt + D.climbMax + 3 * U);
      if (!climb) {                                                        // depenetrate (spawned / teleported / a collider appeared on us)
        P.x = pos.x; P.z = pos.z;
        if (resolveWalls(P, pos.y, grounded ? D.stepUp : D.airReach)) { pos.x = P.x; pos.z = P.z; }
      }

      // timers + input edges
      rollCd -= dt; recover -= dt; coyote -= dt; jumpT += dt; landT += dt;
      var jumpPressed = latchJump, rollPressed = latchRoll;              // edges latched per frame, consumed by the first tick
      latchJump = latchRoll = false;
      if (jumpPressed) jumpBuf = T.jumpBuffer; else jumpBuf -= dt;

      // compression spring (landing sets it after this, so a fresh landing reads at full value)
      var w = T.compressFreq, tgt = input.crouch ? T.crouchCompression : 0;
      compV += (w * w * (tgt - comp) - 2 * T.compressDamp * w * compV) * dt;
      comp += compV * dt;
      if (comp < 0) { comp = 0; if (compV < 0) compV = 0; } else if (comp > 1) { comp = 1; if (compV > 0) compV = 0; }

      // wish direction (camera-relative). fwd = (sin yaw, cos yaw); right = fwd × up = (-cos yaw, sin yaw)
      var yaw = +camYaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx, ix, iz;
      if (input.x != null || input.y != null) { ix = +input.x || 0; iz = +input.y || 0; }
      else { ix = (input.right ? 1 : 0) - (input.left ? 1 : 0); iz = (input.fwd ? 1 : 0) - (input.back ? 1 : 0); }
      wishX = fx * iz + rx * ix; wishZ = fz * iz + rz * ix;
      wishMag = Math.sqrt(wishX * wishX + wishZ * wishZ);
      var analog = Math.min(1, wishMag);
      if (wishMag > 1e-6) { wishX /= wishMag; wishZ /= wishMag; } else { wishX = wishZ = 0; }
      wishMag = analog;

      // ── climbing owns the body ──
      if (climb) {
        climb.t += dt;
        var kk = clamp(climb.t / climb.dur, 0, 1);
        var ky = clamp(kk / 0.7, 0, 1), kx = clamp((kk - 0.3) / 0.7, 0, 1);
        ky = ky * ky * (3 - 2 * ky); kx = kx * kx * (3 - 2 * kx);
        pos.y = climb.y0 + (climb.y1 - climb.y0) * ky;
        pos.x = climb.x0 + (climb.x1 - climb.x0) * kx;
        pos.z = climb.z0 + (climb.z1 - climb.z0) * kx;
        vel.x = vel.y = vel.z = 0;
        if (kk >= 1) {
          climb = null; grounded = true; lastGroundY = pos.y; coyote = 0; airJumps = T.airJumps;
          emit('climbEnd');
        }
        return finish(dt);
      }

      // ── swim handoff ──
      if (waterAt) {
        var wy = waterAt(pos.x, pos.z), th = H(pos.x, pos.z);
        var deep = wy != null && isFinite(wy) && isFinite(th) && (wy - th) > D.chest;
        if (deep && !swimming) { swimming = true; rollT = 0; sliding = false; emit('swimStart'); }
        else if (!deep && swimming) {
          swimming = false; emit('swimEnd');
          var qe = groundQuery(pos.x, pos.z, pos.y, D.stepUp * 2, D.stepUp * 2, 0, 0);
          pos.y = qe.g; grounded = true; vel.y = 0; lastGroundY = pos.y;
        }
      }
      if (swimming) {
        sprinting = false;
        var ss = T.swim * U * wishMag;
        approach(wishX * ss, wishZ * ss, T.swimAccel * U, T.swimAccel * U, dt);
        var hsS = Math.sqrt(vel.x * vel.x + vel.z * vel.z) * dt;
        var nS = clamp(Math.ceil(hsS / D.sub), 1, T.maxSubsteps), hS = dt / nS, s;
        for (s = 0; s < nS; s++) {
          P.x = pos.x + vel.x * hS; P.z = pos.z + vel.z * hS;
          if (resolveWalls(P, pos.y, D.stepUp)) { var vs = vel.x * W.nx + vel.z * W.nz; if (vs < 0) { vel.x -= vs * W.nx; vel.z -= vs * W.nz; } }
          pos.x = P.x; pos.z = P.z;
        }
        var wy2 = waterAt(pos.x, pos.z);
        if (wy2 != null && isFinite(wy2)) pos.y = wy2 - D.swimDepth;
        vel.y = 0; grounded = false; coyote = 0;
        return finish(dt);
      }

      // ── stamina / gait ──
      var wantSprint = !!input.sprint && wishMag > 0.1 && !input.crouch;
      if (exhausted && stamina >= T.staminaResume) exhausted = false;
      sprinting = wantSprint && !exhausted && stamina > 0 && (grounded || sprinting);
      if (sprinting) {
        stamina -= dt / T.staminaSeconds; stamDelay = 0;
        if (stamina <= 0) { stamina = 0; exhausted = true; sprinting = false; emit('staminaEmpty'); }
      } else {
        stamDelay += dt;
        if (stamDelay >= T.staminaRegenDelay) stamina = Math.min(1, stamina + dt / T.staminaRegenSeconds);
      }
      var gaitSpeed = input.crouch ? T.crouch
        : sprinting ? T.sprint
        : (input.walk || T.defaultGait === 'walk' || (wishMag > 0 && wishMag < 0.5)) ? T.walk : T.run;
      if (recover > 0) gaitSpeed *= T.hardLandSpeedMul;
      var tSpeed = gaitSpeed * U * (wishMag > 0 ? (wishMag < 0.5 ? 1 : wishMag) : 0);

      // ── slope / slide status ──
      var gr = null;
      if (grounded && groundKind === 'terrain') {
        gr = gradient(pos.x, pos.z);
        var steep = gr.t > D.tanMax;
        if (steep && !sliding) { sliding = true; rollT = 0; emit('slideStart'); }
        else if (!steep && sliding) { sliding = false; emit('slideEnd'); }
      } else if (sliding) { sliding = false; emit('slideEnd'); }

      // ── roll start ──
      if (rollPressed && grounded && !sliding && rollT <= 0 && rollCd <= 0) {
        if (wishMag > 0.1) { rollDX = wishX; rollDZ = wishZ; }
        else { rollDX = Math.sin(facing); rollDZ = Math.cos(facing); }
        var along = (vel.x * rollDX + vel.z * rollDZ) / U;
        rollSpd = Math.max(T.rollSpeed, along) * U;
        rollT = T.rollTime; jumpBuf = 0;
        emit('roll', { dirX: rollDX, dirZ: rollDZ });
        emit('iframes', { duration: T.rollIFrames });
      }

      // ── jump ──
      if (jumpBuf > 0 && rollT <= 0 && !sliding && (grounded || coyote > 0)) {
        vel.y = D.v0; grounded = false; coyote = 0; jumpBuf = 0; jumpHeld = true; jumpT = 0;
        lastGroundY = pos.y; emit('jump');
      } else if (jumpPressed && T.doubleJump && !grounded && coyote <= 0 && airJumps > 0 && rollT <= 0) {
        airJumps--; vel.y = D.v0 * 0.9; jumpHeld = true; jumpT = 0; jumpBuf = 0; emit('doubleJump');
      }
      if (jumpHeld && (!input.jump || vel.y <= 0)) { if (vel.y > 0) vel.y *= T.jumpCutMul; jumpHeld = false; }

      // ── horizontal velocity ──
      if (rollT > 0) {
        if (gr && gr.t > 1e-6) {
          var slopeA = D.g * (-(gr.x * rollDX + gr.z * rollDZ)) / (1 + gr.t * gr.t);
          rollSpd = Math.max(0, rollSpd + slopeA * T.rollSlopeGain * dt);
        }
        vel.x = rollDX * rollSpd; vel.z = rollDZ * rollSpd;
      } else if (sliding) {
        var inv = D.g / (1 + gr.t * gr.t);
        vel.x += -gr.x * inv * dt; vel.z += -gr.z * inv * dt;
        var steer = T.accelGround * T.airControl * U * dt * (wishMag > 0 ? 1 : 0);   // limited steering while sliding
        vel.x += wishX * steer; vel.z += wishZ * steer;
        var up = (vel.x * gr.x + vel.z * gr.z) / gr.t;                    // no climbing a too-steep face
        if (up > 0) { vel.x -= up * gr.x / gr.t; vel.z -= up * gr.z / gr.t; }
        var sp = Math.sqrt(vel.x * vel.x + vel.z * vel.z), fr = T.slideFriction * U * dt;
        if (sp > 1e-9) { var f = Math.max(0, sp - fr) / sp; vel.x *= f; vel.z *= f; }
      } else if (grounded) {
        approach(wishX * tSpeed, wishZ * tSpeed, T.accelGround * U, T.decelGround * U, dt);
      } else if (wishMag > 0) {
        var aa = T.accelGround * T.airControl * U;
        var cur = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        approach(wishX * Math.max(tSpeed, cur), wishZ * Math.max(tSpeed, cur), aa, aa, dt);   // steer, never brake momentum
      }

      // ── integrate, sub-stepped (≤ maxSubstep per substep, horizontal and vertical) ──
      var hs = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      var vdisp = grounded ? 0 : Math.abs(vel.y) * dt + 0.5 * D.g * dt * dt;
      var n = clamp(Math.ceil(Math.max(hs * dt, vdisp) / D.sub), 1, T.maxSubsteps), h = dt / n, i;
      for (i = 0; i < n; i++) {
        moveHoriz(vel.x * h, vel.z * h, 0);
        if (climb) break;
        if (!grounded) moveVert(h);
      }
      // grounded & idle: keep feet glued (moving platforms / terrain streaming refinements)
      if (grounded && !climb) {
        var q = groundQuery(pos.x, pos.z, pos.y, D.stepUp, D.stepUp, 0, 0);
        if (q.g >= pos.y - D.snap) { pos.y = q.g; groundKind = q.kind; }
        else leaveGround();
      }

      if (rollT > 0) {
        rollT -= dt;
        if (rollT <= 1e-6) { rollT = 0; rollCd = T.rollCooldown; emit('rollEnd'); }
      }
      return finish(dt);
    }

    // ── public per-frame step: accumulates render dt into fixed ticks ──
    var acc = 0, latchJump = false, latchRoll = false, prev = { x: 0, y: 0, z: 0 }, rpos = { x: 0, y: 0, z: 0 };
    out.renderPos = rpos; out.ticks = 0;
    function step(dt, input, camYaw) {
      events.length = 0;
      input = input || {};
      if (input.jump && !prevJump) latchJump = true;
      if (input.roll && !prevRoll) latchRoll = true;
      prevJump = !!input.jump; prevRoll = !!input.roll;
      dt = clamp(+dt || 0, 0, T.maxDt);
      var n = 0;
      if (T.fixedDt > 0) {
        acc += dt;
        while (acc >= T.fixedDt - 1e-9 && n < T.maxTicks) {
          prev.x = pos.x; prev.y = pos.y; prev.z = pos.z;
          tick(T.fixedDt, input, camYaw); acc -= T.fixedDt; n++;
        }
        if (n >= T.maxTicks) acc = 0;                                     // spiral-of-death guard
        if (acc < 0) acc = 0;
        var a = n > 0 || acc > 0 ? clamp(acc / T.fixedDt, 0, 1) : 1;
        rpos.x = prev.x + (pos.x - prev.x) * a; rpos.y = prev.y + (pos.y - prev.y) * a; rpos.z = prev.z + (pos.z - prev.z) * a;
      } else {
        if (dt > 0) { tick(dt, input, camYaw); n = 1; }
        rpos.x = pos.x; rpos.y = pos.y; rpos.z = pos.z;
      }
      if (n === 0) finish(0);
      out.ticks = n;
      return out;
    }

    function setPos(x, y, z) {
      pos.x = +x || 0; pos.z = +z || 0;
      gatherNear(3 * U);
      var hasY = (y != null && isFinite(y));
      var h0 = H(pos.x, pos.z); if (!isFinite(h0)) h0 = 0;
      var q = groundQuery(pos.x, pos.z, hasY ? +y : h0, D.stepUp, D.stepUp, 0, 0);
      if (!hasY) y = q.g;
      pos.y = +y;
      vel.y = 0; climb = null; rollT = 0; sliding = false;
      grounded = Math.abs(pos.y - q.g) <= D.snap && pos.y >= q.g - D.stepUp;
      if (grounded) { pos.y = q.g; groundKind = q.kind; lastGroundY = pos.y; } else coyote = 0;
      prev.x = rpos.x = pos.x; prev.y = rpos.y = pos.y; prev.z = rpos.z = pos.z; acc = 0;
      return pos;
    }
    function setVel(x, y, z) { vel.x = +x || 0; vel.y = +y || 0; vel.z = +z || 0; if (vel.y > 0) grounded = false; }
    function retune(patch) { if (patch) for (var p in patch) T[p] = patch[p]; derive(); return T; }
    function reset() {
      vel.x = vel.y = vel.z = 0; climb = null; rollT = 0; rollCd = 0; sliding = false; swimming = false;
      comp = 0; compV = 0; recover = 0; stamina = 1; exhausted = false; jumpBuf = 0; jumpHeld = false;
    }

    return {
      step: step, setPos: setPos, setVel: setVel, retune: retune, reset: reset,
      getPos: function () { return pos; },
      isGrounded: function () { return grounded; },
      getState: function () { return state; },
      setFacing: function (y) { facing = +y || 0; },
      TUNE: T, U: U
    };
  }

  /* ── WORLD COLLIDER ADAPTER ────────────────────────────────────────────────
   * Turns the live world data into { circles(), obbs() } for the controller:
   *   WORLD_LAYOUT.realmColliders : {x,z,r} circles  AND  {x,z,hx,hz,rot} rotated boxes
   *                                 (rot = rotation about +Y; local x axis = (cos rot, -sin rot) in x/z)
   *   window.__hubColliders       : {cx,cz,r} bazaar stalls / fountain
   *   window.WORLD_WALKABLE_TOPS  : [{type:'obb'|'circle', x,z, hx,hz,rot | r, top, kind}] (absolute Y, units)
   *       - a top that matches a realm collider (same shape+position) gives that solid its `top` → you can
   *         stand on the roof and step onto low ones; the walls below stay solid.
   *       - a top with NO matching solid is a deck/platform: walk on it, walk UNDER it (bottom = top - deckThickness).
   * Rebuilt only when a source list changes length (or every `refreshEvery` calls), so it is cheap per frame.
   */
  function worldColliders(win, o) {
    win = win || (typeof window !== 'undefined' ? window : {});
    o = o || {};
    var deckT = (o.deckThickness != null ? o.deckThickness : 0.6) * U;
    var refreshEvery = o.refreshEvery || 0;                     // 0 = rebuild only when a source list changes length (or invalidate())
    var CELL = (o.cellSize || 32) * U;                           // spatial grid cell (owner repo: 2-3x typical object size)
    var C = [], B = [], sig = '', calls = 0, grid = {}, stamp = 0;
    function gkey(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
    function insert(item, isBox, rad) {
      var x0 = Math.floor((item.x - rad) / CELL), x1 = Math.floor((item.x + rad) / CELL);
      var z0 = Math.floor((item.z - rad) / CELL), z1 = Math.floor((item.z + rad) / CELL), ix, iz, k, cell;
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) { x1 = x0; z1 = z0; item._huge = true; }   // giant collider: keep in a side list
      if (item._huge) { (grid.huge || (grid.huge = [])).push(item); return; }
      for (ix = x0; ix <= x1; ix++) for (iz = z0; iz <= z1; iz++) {
        k = gkey(ix, iz); cell = grid[k] || (grid[k] = { c: [], b: [] });
        (isBox ? cell.b : cell.c).push(item);
      }
    }
    function key(x, z, a, b) { return Math.round(x * 10) + ',' + Math.round(z * 10) + ',' + Math.round(a * 10) + ',' + Math.round((b || 0) * 10); }
    function rebuild() {
      var L = win.WORLD_LAYOUT, rc = (L && L.realmColliders) || EMPTY, hc = win.__hubColliders || EMPTY, tops = win.WORLD_WALKABLE_TOPS || EMPTY;
      var s = rc.length + '/' + hc.length + '/' + tops.length;
      calls++;
      if (s === sig && !(refreshEvery > 0 && calls % refreshEvery === 0)) return;
      sig = s; C = []; B = []; grid = {};
      var topMap = {}, used = {}, i, t, c, k;
      for (i = 0; i < tops.length; i++) {
        t = tops[i]; if (!t || !isFinite(t.top)) continue;
        k = t.type === 'obb' ? 'b' + key(t.x, t.z, t.hx, t.hz) : 'c' + key(t.x, t.z, t.r);
        topMap[k] = i;
      }
      for (i = 0; i < rc.length; i++) {
        c = rc[i]; if (!c || !isFinite(c.x) || !isFinite(c.z)) continue;
        if (c.hx > 0 && c.hz > 0) {
          k = 'b' + key(c.x, c.z, c.hx, c.hz);
          B.push({ x: c.x, z: c.z, hx: c.hx, hz: c.hz, rot: c.rot || 0, top: topMap[k] != null ? tops[topMap[k]].top : (c.top != null ? c.top : undefined), bottom: c.bottom, label: c.label });
        } else if (c.r > 0) {
          k = 'c' + key(c.x, c.z, c.r);
          C.push({ x: c.x, z: c.z, r: c.r, top: topMap[k] != null ? tops[topMap[k]].top : (c.top != null ? c.top : undefined), bottom: c.bottom, label: c.label });
        } else continue;
        if (topMap[k] != null) used[topMap[k]] = true;
      }
      for (i = 0; i < hc.length; i++) { c = hc[i]; if (c && c.r > 0) C.push({ x: c.cx != null ? c.cx : c.x, z: c.cz != null ? c.cz : c.z, r: c.r }); }
      for (i = 0; i < tops.length; i++) {                                   // stand-alone decks
        if (used[i]) continue; t = tops[i]; if (!t || !isFinite(t.top)) continue;
        if (t.type === 'obb' && t.hx > 0 && t.hz > 0) B.push({ x: t.x, z: t.z, hx: t.hx, hz: t.hz, rot: t.rot || 0, top: t.top, bottom: t.top - deckT, label: 'deck:' + (t.kind || '') });
        else if (t.r > 0) C.push({ x: t.x, z: t.z, r: t.r, top: t.top, bottom: t.top - deckT, label: 'deck:' + (t.kind || '') });
      }
    }
    function index() {
      var i, it;
      for (i = 0; i < C.length; i++) { it = C[i]; it._q = 0; insert(it, false, it.r); }
      for (i = 0; i < B.length; i++) { it = B[i]; it._q = 0; insert(it, true, Math.sqrt(it.hx * it.hx + it.hz * it.hz)); }
    }
    var lastSig = null;
    function ensure() { rebuild(); if (lastSig !== sig || !grid.__built) { index(); grid.__built = true; lastSig = sig; } }
    return {
      circles: function () { ensure(); return C; },
      obbs: function () { ensure(); return B; },
      // grid broadphase: everything whose cells overlap the query circle (controller does the exact test)
      query: function (x, z, rad, outC, outB) {
        ensure(); stamp++;
        var x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL);
        var z0 = Math.floor((z - rad) / CELL), z1 = Math.floor((z + rad) / CELL), ix, iz, cell, j, it;
        for (ix = x0; ix <= x1; ix++) for (iz = z0; iz <= z1; iz++) {
          cell = grid[gkey(ix, iz)]; if (!cell) continue;
          for (j = 0; j < cell.c.length; j++) { it = cell.c[j]; if (it._q !== stamp) { it._q = stamp; outC.push(it); } }
          for (j = 0; j < cell.b.length; j++) { it = cell.b[j]; if (it._q !== stamp) { it._q = stamp; outB.push(it); } }
        }
        var hg = grid.huge; if (hg) for (j = 0; j < hg.length; j++) { it = hg[j]; if (it._q === stamp) continue; it._q = stamp; if (it.hx > 0) outB.push(it); else outC.push(it); }
      },
      invalidate: function () { sig = ''; }
    };
  }

  buildPlayerController.worldColliders = worldColliders;
  buildPlayerController.DEFAULT_TUNE = DEFAULT_TUNE;
  buildPlayerController.U = U;
  global.buildPlayerController = buildPlayerController;
  if (typeof module !== 'undefined' && module.exports) module.exports = buildPlayerController;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
