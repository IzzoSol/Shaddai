/* world-dragons.js — SHADDAI Map v4 crossing dragons (one per transit-ring station).
 *
 * Classic script (no build step). Two layers:
 *   1. CORE (pure JS, no THREE): 3D flight model + steering + AI state machine + attacks + events.
 *      Exported for node tests via module.exports (tools/tests/dragons.test.cjs).
 *   2. VISUALS (THREE r160+): procedural split-wing rig (default), single-mesh GLB with a vertex-shader
 *      wing flap, or a skinned GLB driven by bones; breath GPU particles, scorch decals, ground telegraphs,
 *      far silhouettes.  window.buildWorldDragons(opts) → api.
 *
 * Coordinates: world units on XZ, Y up (1 m = 7/1.8 u). All tunables below are in METRES / SECONDS and are
 * converted with U. Heading convention: yaw = atan2(dx, dz) → forward = (sin yaw, 0, cos yaw).
 * See docs/DRAGONS.md for the API, tunables, AI states and host integration.
 */
(function (root) {
  'use strict';

  var U = 7 / 1.8;                 // units per metre (scale law)
  var G = 9.81;                    // m/s²
  var D2R = Math.PI / 180;

  // ───────────────────────────────────────── TUNABLES (metres, seconds, degrees) ─────────────────────────
  var TUNE = {
    // flight
    speedMin: 18, speedCruise: 26, speedMax: 35, speedDive: 42, stallSpeed: 15.5,
    accel: 6, bankMaxDeg: 55, bankHardDeg: 60, bankRateDeg: 110, yawAccel: 1.6,
    pitchUpDeg: 30, pitchDownDeg: 32, pitchDiveDeg: 55, pitchRateDeg: 55,
    climbMax: 15, sinkMax: 10, sinkDive: 30, altGain: 0.9, hardRise: 6,
    lookAheadSec: [0.4, 0.9, 1.6, 2.5, 3.5, 4.8], lookAheadSideDeg: 28,
    clearPatrol: 25, clearPatrolTarget: 38, clearStrafe: 9, clearDive: 2.2, clearLandApproach: 6,
    // AI
    alertRadius: 250, leashRadius: 600, leashTime: 6,
    orbitR: [60, 120], orbitAlt: [40, 70], orbitLeadRad: 0.65,
    attackCooldown: [2.2, 4.0], retreatHpFrac: 0.3, restTime: 8, restRegenFrac: 0.12,
    perchOut: 70, landOffset: 38,
    // attacks
    minTelegraph: 0.8,
    breath: { inhale: 1.0, dur: 2.4, len: 35, endRadius: 8, startAhead: 36, alt: 13, dps: 24, tick: 0.25, headTurnDeg: 75, latDeg: 12, lineupDist: 130 },
    swoop: { telegraph: 1.2, alt: 58, dist: [110, 190], passAlt: 3, hitRadius: 6.5, dmg: 26, knock: 16 },
    stomp: { telegraph: 0.9, radius: 18, dmg: 20, knock: 14 },
    tail:  { telegraph: 0.8, radius: 22, dmg: 16, knock: 18 },
    roar:  { telegraph: 0.8, radius: 20 },
    groundTime: [6, 9],
    // health / combat (patterns from shaddai-threejs-gamedev health-combat-system.md: i-frames + resistances)
    dragonIFrames: 0.12,          // s of invulnerability after each hit taken (stops one bolt multi-hitting across frames)
    playerIFrames: 0.6,           // s of player invulnerability after a knockback hit (swoop/stomp/tail) — no stun-lock
    // perf
    farDist: 1500, farHz: 5, maxDt: 0.1,
    // look
    wingspan: [18, 26], hp: 600,
    // world rules (2026-09-27): wild dragons never stand inside The Grid (r < cityR from the island centre). They may
    // only cross it HIGH: inside the city (plus a cityBuffer ramp) the terrain clearance target rises to cityOverfly.
    // A player inside the city is never attacked (attacks abort, hurtPlayer refuses).
    cityR: 1630, cityBuffer: 300, cityOverfly: 150, cityMargin: 40,
    // night (opts.nightFactor() 0..1, world-sky-v4): more aggressive after dark. Telegraphs NEVER shorten.
    // Each multiplier is the full-night value; day = 1. cooldown ×0.55, alert radius ×1.6, leash ×1.3, breath dps ×1.25,
    // retreat threshold ×0.5 (fights on longer before resting).
    night: { cooldownMul: 0.55, alertMul: 1.6, leashMul: 1.3, dpsMul: 1.25, retreatMul: 0.5 },
    minWindup: 0.6,   // design floor for every wind-up (a dodge-roll window). minTelegraph (0.8) is the enforced value ≥ this.
  };

  // element palette (from fal-assets/refs/dragons/dragons-7-elements-sheet.jpg). style → breath particle style.
  var ELEMENTS = {
    fire:   { body: 0x5a1a08, belly: 0xff7a18, membrane: 0x7a2208, glow: 0xff5a10, breathA: 0xfff0a0, breathB: 0xff4a08, style: 'fire',   scorch: 0x140804, blend: 'add',  label: 'Fire' },
    ice:    { body: 0x1e5c9c, belly: 0x9fe8ff, membrane: 0x2a78c0, glow: 0x7fe0ff, breathA: 0xffffff, breathB: 0x40b8ff, style: 'ice',    scorch: 0xcfefff, blend: 'add',  label: 'Ice' },
    sand:   { body: 0x9c8058, belly: 0xe0c89a, membrane: 0xb89a6a, glow: 0xffcf60, breathA: 0xffe7a0, breathB: 0xc08a30, style: 'sand',   scorch: 0x6a5230, blend: 'add',  label: 'Sand' },
    poison: { body: 0x3e5218, belly: 0x9acd32, membrane: 0x4e6a1e, glow: 0xb8ff40, breathA: 0xe0ff80, breathB: 0x4a8a10, style: 'thorns', scorch: 0x1a2a06, blend: 'add',  label: 'Poison' },
    void:   { body: 0x3a1266, belly: 0xb070ff, membrane: 0x5a1e9a, glow: 0xc06aff, breathA: 0xf0c8ff, breathB: 0x8a2aff, style: 'swirl',  scorch: 0x12041e, blend: 'add',  label: 'Void' },
    shadow: { body: 0x120c1a, belly: 0x3a2450, membrane: 0x1a1024, glow: 0x9a40ff, breathA: 0x6a30b0, breathB: 0x0a0610, style: 'smoke',  scorch: 0x050308, blend: 'norm', label: 'Shadow' },
    steel:  { body: 0x6a6e76, belly: 0xc8ccd4, membrane: 0x50545c, glow: 0xdfe8ff, breathA: 0xffffff, breathB: 0x9aa4b4, style: 'blades', scorch: 0x2a2c30, blend: 'add',  label: 'Steel' },
    tide:   { body: 0x0e5a5a, belly: 0x5ff0e0, membrane: 0x127a78, glow: 0x40fff0, breathA: 0xe0fffc, breathB: 0x10b8b0, style: 'spray',  scorch: 0x0a3a3a, blend: 'add',  label: 'Tide' },
  };
  // WORLD_LAYOUT.stations[].dragon colour → element
  var COLOR_TO_ELEMENT = { red: 'fire', blue: 'ice', tan: 'sand', green: 'poison', void: 'void', dark: 'shadow', black: 'steel', teal: 'tide' };
  // damage-type resistances (fraction removed). damage(id, amount, pos, type) — type is the player's damage kind.
  var RESIST = {
    fire:   { fire: 0.6, ice: -0.25 }, ice: { ice: 0.6, fire: -0.25 }, sand: { physical: 0.2 }, poison: { poison: 0.7 },
    void:   { arcane: 0.5, light: -0.25 }, shadow: { arcane: 0.3, light: -0.3 }, steel: { physical: 0.35, arcane: -0.2 }, tide: { fire: 0.4, lightning: -0.3 },
  };

  // ───────────────────────────────────────── math helpers ─────────────────────────────────────────────────
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function approach(v, target, maxStep) { var d = target - v; return Math.abs(d) <= maxStep ? target : v + (d > 0 ? maxStep : -maxStep); }
  function hyp2(x, z) { return Math.sqrt(x * x + z * z); }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var ACTIVE_STATES = { alert: 1, takeoff: 1, patrol: 1, attack: 1 };   // states that count toward the leash timer
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ───────────────────────────────────────── FLIGHT MODEL ─────────────────────────────────────────────────
  // f = { x,y,z (units), yaw, pitch, bank (rad), speed (m/s), yawRate (rad/s), mode:'fly'|'hover'|'ground',
  //       stalled, takeoff, flap (0..1 effort), vy (m/s), floorHits }
  function createFlight(x, y, z, yaw) {
    return { x: x, y: y, z: z, yaw: yaw || 0, pitch: 0, bank: 0, speed: 0, yawRate: 0, mode: 'ground', stalled: false, takeoff: false, flap: 0, vy: 0, floorHits: 0, hvx: 0, hvz: 0, hc: -1 };
  }

  // Highest terrain (units) along the look-ahead fan: current heading, target heading, ±side.
  function lookAheadFloor(f, heightAt, yawTarget, speedMS, tune, lookMaxM, narrow) {
    var best = heightAt(f.x, f.z), secs = tune.lookAheadSec, side = tune.lookAheadSideDeg * D2R;
    var nd = narrow ? 1 : 3, sideYaw = f.yaw + side * Math.sign(wrapPi(yawTarget - f.yaw) || 1);   // no per-call array (hot path)
    for (var d = 0; d < nd; d++) {
      var dir = d === 0 ? f.yaw : d === 1 ? yawTarget : sideYaw;
      var sy = Math.sin(dir), cy = Math.cos(dir);
      for (var i = 0; i < secs.length; i++) {
        var dist = Math.min(Math.max(speedMS, 12) * secs[i] + 10, lookMaxM || Infinity) * U;
        var h = heightAt(f.x + sy * dist, f.z + cy * dist);
        if (h > best) best = h;
      }
    }
    return best;
  }

  /* One integration step. cmd = { tx,ty,tz (units; ty = desired absolute altitude), speed (m/s),
   *   minClear (m, look-ahead target clearance), hardClear (m, absolute floor), dive (bool), hover (bool) } */
  function stepFlight(f, cmd, dt, heightAt, tune) {
    tune = tune || TUNE;
    var dx = cmd.tx - f.x, dz = cmd.tz - f.z, hd = hyp2(dx, dz);
    var yawT = hd > 0.01 ? Math.atan2(dx, dz) : f.yaw;
    var ground = heightAt(f.x, f.z);

    if (f.mode === 'ground') { // standing: turn in place toward the target, stick to terrain
      var e0 = wrapPi(yawT - f.yaw);
      f.yaw = wrapPi(f.yaw + clamp(e0, -1.2 * dt, 1.2 * dt));
      f.speed = 0; f.pitch = approach(f.pitch, 0, dt); f.bank = approach(f.bank, 0, 2 * dt); f.yawRate = 0; f.vy = 0;
      f.y = ground + (cmd.standH || 0); f.flap = 0; f.hvx = 0; f.hvz = 0; f.hc = -1;
      return f;
    }

    if (f.mode === 'hover') { // flapping hover (take-off / landing flare): kinematic, rate-limited, no teleport
      var hs = Math.min(cmd.speed, hd / U * 1.2 + 0.5);                 // m/s horizontal
      f.speed = approach(f.speed, hs, tune.accel * 1.5 * dt);
      var e1 = wrapPi(yawT - f.yaw);
      f.yawRate = clamp(e1 * 1.5, -0.9, 0.9); f.yaw = wrapPi(f.yaw + f.yawRate * dt);
      f.x += Math.sin(f.yaw) * f.speed * dt * U; f.z += Math.cos(f.yaw) * f.speed * dt * U;
      var vyT = clamp((cmd.ty - f.y) / U * 1.2, -(cmd.sink || 7), cmd.climb || 9);
      f.vy = approach(f.vy, vyT, 14 * dt);
      f.y += f.vy * dt * U;
      var gH = heightAt(f.x, f.z) + (cmd.standH || 0);
      if (f.y < gH) { f.y = gH; f.vy = Math.max(0, f.vy); }
      f.pitch = approach(f.pitch, clamp(f.vy / 30, -0.25, 0.35), 1.2 * dt);
      f.bank = approach(f.bank, 0, 1.5 * dt); f.flap = 1;
      f.hvx = Math.sin(f.yaw) * f.speed; f.hvz = Math.cos(f.yaw) * f.speed; f.hc = -1;
      return f;
    }

    // ── fly ──
    var v = Math.max(f.speed, 1);
    var bankMax = (cmd.maxBankDeg || tune.bankMaxDeg) * D2R;
    // 1) heading → yaw rate limited by the coordinated-turn bank limit
    var err = wrapPi(yawT - f.yaw);
    var yrMax = G * Math.tan(bankMax) / v;
    var yrT = clamp(err * 1.4, -yrMax, yrMax);
    f.yawRate = approach(f.yawRate, yrT, tune.yawAccel * dt);
    f.yawRate = clamp(f.yawRate, -yrMax, yrMax);
    f.yaw = wrapPi(f.yaw + f.yawRate * dt);
    // 2) bank = atan(v·yawRate/g), rate-limited, hard-bounded
    var bankT = Math.atan(v * f.yawRate / G);
    if (cmd.wobble) bankT += cmd.wobble;
    f.bank = clamp(approach(f.bank, bankT, tune.bankRateDeg * D2R * dt), -tune.bankHardDeg * D2R, tune.bankHardDeg * D2R);
    // 3) altitude hold above look-ahead terrain
    var floorAhead = lookAheadFloor(f, heightAt, yawT, v, tune, cmd.lookMax, cmd.lookNarrow);
    var yFloor = floorAhead + (cmd.minClear != null ? cmd.minClear : tune.clearPatrolTarget) * U;
    var yDes = Math.max(cmd.ty, yFloor);
    var sinkMax = cmd.dive ? tune.sinkDive : tune.sinkMax;
    var urgent = f.y < yFloor ? 1.6 : 1;
    var vzT = clamp((cmd.vzFF && yDes === cmd.ty ? cmd.vzFF : 0) + (yDes - f.y) / U * tune.altGain * urgent, -sinkMax, tune.climbMax * urgent);   // vzFF = glide-path feed-forward (m/s)
    var pDown = (cmd.dive ? tune.pitchDiveDeg : tune.pitchDownDeg) * D2R, pUp = tune.pitchUpDeg * D2R * (urgent > 1 ? 1.4 : 1);
    var pitchT = Math.asin(clamp(vzT / v, -Math.sin(pDown), Math.sin(pUp)));
    // 4) stall + take-off handling
    if (!f.takeoff && f.speed < tune.stallSpeed) f.stalled = true;
    if (f.stalled && f.speed > tune.speedMin + 2) f.stalled = false;
    if (f.stalled) pitchT = Math.min(pitchT, -14 * D2R);                // nose down to regain airspeed
    f.pitch = approach(f.pitch, pitchT, tune.pitchRateDeg * D2R * dt * (urgent > 1 ? 1.6 : 1));
    // 5) speed: thrust toward the command, gravity along the path (lift/drag-lite)
    var spT = clamp(cmd.speed, 0, cmd.dive ? tune.speedDive : tune.speedMax);
    if (urgent > 1 && !cmd.dive) spT = Math.min(spT, tune.speedMin + 4);  // steep ground ahead: slow down, climb harder
    var thrust = clamp((spT - f.speed) * 0.9, -tune.accel, tune.accel);
    var climbCost = G * Math.sin(f.pitch) * 0.55;
    var a = thrust - climbCost;
    f.speed = clamp(f.speed + a * dt, 0, tune.speedDive);
    if (f.takeoff) { f.speed = Math.max(f.speed, 8); if (f.speed >= tune.speedMin && f.y - ground > 18 * U) f.takeoff = false; }
    // flap effort (animation): thrust demand + climb, glide in dives
    var effort = clamp(0.25 + Math.max(0, thrust) / tune.accel * 0.5 + Math.max(0, Math.sin(f.pitch)) * 1.6 + (f.takeoff ? 0.6 : 0) + (f.stalled ? 0.5 : 0), 0, 1);
    if (f.pitch < -8 * D2R) effort *= 0.25;
    f.flap = approach(f.flap, effort, 1.5 * dt);
    // 6) integrate
    var vh = f.speed * Math.cos(f.pitch);
    f.hvx = Math.sin(f.yaw) * vh; f.hvz = Math.cos(f.yaw) * vh; f.vy = f.speed * Math.sin(f.pitch);
    f.x += f.hvx * dt * U; f.z += f.hvz * dt * U; f.y += f.vy * dt * U;
    // 7) hard floor (safety net — look-ahead above should make this rare; counted for tests)
    //    The floor itself may only RISE at hardRise m/s (lowering is instant) so switching from a low dive/strafe floor
    //    to the 25 m patrol floor never pops the dragon upward — it climbs out instead. (No teleporting.)
    var hcT = cmd.hardClear != null ? cmd.hardClear : tune.clearPatrol;
    var clrNow = (f.y - heightAt(f.x, f.z)) / U;
    if (!(f.hc >= 0)) f.hc = Math.min(hcT, Math.max(0, clrNow));   // just entered flight (take-off): start from where we are
    f.hc = hcT <= f.hc ? hcT : Math.min(hcT, Math.max(f.hc, clrNow) + tune.hardRise * dt);
    var hard = heightAt(f.x, f.z) + f.hc * U;
    if (f.y < hard) { f.floorHits++; f.y = hard; if (f.pitch < 0) f.pitch = 0; }
    return f;
  }

  // ───────────────────────────────────────── CORE (AI + attacks) ──────────────────────────────────────────
  /* opts: { heightAt(x,z) units, layout, getPlayer() → {pos:{x,y,z}, alive}, onHitPlayer(dmg, kind, info),
   *         isDefeated(id), setDefeated(id), seed, tune } */
  function createDragonsCore(opts) {
    var tune = opts.tune || TUNE;
    if (tune !== TUNE) { var tm = {}; for (var tk in TUNE) tm[tk] = TUNE[tk]; for (var tk2 in tune) tm[tk2] = tune[tk2]; tune = tm; }   // older partial overrides still get the new keys
    var NIGHT = tune.night || TUNE.night;
    function aggr(mul) { return 1 + ((mul == null ? 1 : mul) - 1) * core.night; }   // 1 by day → mul at full night
    function inCityM(x, z) { return hyp2(x, z) / U < tune.cityR; }
    // push a ground point out of The Grid (radially from the island centre) → never stands inside r < cityR + margin
    function pushOut(p, marginM) {
      var r = hyp2(p.x, p.z), rMin = (tune.cityR + (marginM == null ? tune.cityMargin : marginM)) * U;
      if (r < rMin) { if (r < 1e-6) { p.x = rMin; p.z = 0; } else { p.x *= rMin / r; p.z *= rMin / r; } if (p.h != null) p.h = heightAt(p.x, p.z); }
      return p;
    }
    var heightAt = opts.heightAt || function () { return 0; };
    var layout = opts.layout || {};
    var listeners = {};
    var now = 0, attackSeq = 0;
    var core = { dragons: [], attacker: null, violations: 0, playerInvulnUntil: -1, rollUntil: -1, night: 0, time: function () { return now; } };
    var stats = { hits: 0, telegraphs: 0, refused: 0, floorHits: 0 };

    function on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return function () { off(ev, cb); }; }
    function off(ev, cb) { var l = listeners[ev]; if (l) { var i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); } }
    function emit(ev, data) { data.t = now; var l = listeners[ev]; if (l) for (var i = 0; i < l.length; i++) { try { l[i](data); } catch (e) { if (typeof console !== 'undefined') console.warn('[dragons] listener', ev, e); } } var a = listeners['*']; if (a) for (var j = 0; j < a.length; j++) { try { a[j](ev, data); } catch (e) {} } }

    // ── spawn one dragon per station with a dragon ──
    var stations = (layout.stations || []).filter(function (s) { return s && s.dragon; });
    var centre = [0, 0];
    stations.forEach(function (s, i) {
      var rnd = mulberry32(hashStr(s.id) ^ (opts.seed || 1337));
      var el = COLOR_TO_ELEMENT[s.dragon] || (ELEMENTS[s.dragon] ? s.dragon : 'fire');
      var cx = s.pos[0], cz = s.pos[1], r = hyp2(cx - centre[0], cz - centre[1]) || 1;
      var ox = (cx - centre[0]) / r, oz = (cz - centre[1]) / r;          // outward (into the realm wilderness)
      // perch: highest ground among a few samples 50–120 m outward of the crossing (a rock / arch)
      var best = null;
      for (var k = 0; k < 9; k++) {
        var ang = (k - 4) * 0.22, dist = (tune.perchOut + (k % 3) * 25) * U;
        var px = cx + (ox * Math.cos(ang) - oz * Math.sin(ang)) * dist, pz = cz + (oz * Math.cos(ang) + ox * Math.sin(ang)) * dist;
        var h = heightAt(px, pz); if (!best || h > best.h) best = { x: px, z: pz, h: h };
      }
      pushOut(best);                                                      // never perch inside The Grid
      var span = lerp(tune.wingspan[0], tune.wingspan[1], rnd());
      var yaw0 = Math.atan2(cx - best.x, cz - best.z);                   // perched facing the crossing
      var def = !!(opts.isDefeated && opts.isDefeated(s.id));
      var d = {
        id: s.id, name: (ELEMENTS[el].label) + ' Dragon of ' + (s.name || s.id), station: s.id, realm: s.realm, element: el, colorKey: s.dragon,
        wingspan: span, bodyRadius: span * 0.2, standH: span * 0.16,
        home: { x: cx, z: cz }, out: { x: ox, z: oz }, perch: { x: best.x, z: best.z },
        landSpot: pushOut({ x: cx + ox * tune.landOffset * U, z: cz + oz * tune.landOffset * U }),
        hpMax: tune.hp, hp: tune.hp, defeated: def, rested: false,
        state: def ? 'peaceful' : 'perch', stateT: 0, atk: null, cooldown: 1.5, staggerT: 0, leashT: 0,
        orbitDir: rnd() < 0.5 ? 1 : -1, orbitPhase: rnd() * 6.28, attackCount: 0, rnd: rnd,
        f: createFlight(best.x, best.h + span * 0.16 * U, best.z, yaw0),
        breathing: false, inhaling: false, jaw: 0, coneAxis: null, mouth: null, headYaw: 0, headPitch: 0, bow: 0,
        lod: 'near', lodAcc: 0, distToPlayer: Infinity, lastTickAt: -1, ambientT: 0, cmd: null,
        telegraph: null,   // {kind, pos:{x,z}, radius, start, dur}
        invulnUntil: -1, ridden: false, attackEndAt: -1e9, cooldownSet: 1.5,
      };
      d.f.mode = 'ground';
      core.dragons.push(d);
    });

    var _P = { x: 0, y: 0, z: 0, alive: true, inCity: false }, _noP = { x: 0, y: 0, z: 0, alive: false, inCity: false };   // reused every frame (no allocation)
    function player() {
      var p = opts.getPlayer ? opts.getPlayer() : null;
      if (!p || !p.pos) return null;
      _P.x = p.pos.x; _P.y = p.pos.y != null ? p.pos.y : heightAt(p.pos.x, p.pos.z); _P.z = p.pos.z; _P.alive = p.alive !== false;
      _P.inCity = inCityM(_P.x, _P.z);
      return _P;
    }
    function setState(d, s) { if (d.state === s) return; var prev = d.state; d.state = s; d.stateT = 0; emit('state', { id: d.id, from: prev, to: s }); }
    function clearOK(d) { return (d.f.y - heightAt(d.f.x, d.f.z)) / U >= tune.clearPatrol + 1; }   // safe to hand over to the 25 m patrol floor
    function releaseToken(d) { if (core.attacker === d.id) core.attacker = null; }
    function endAttack(d, cool) {
      var had = !!d.atk;
      d.atk = null; d.breathing = false; d.inhaling = false; d.telegraph = null; releaseToken(d);
      d.cooldown = cool != null ? cool : lerp(tune.attackCooldown[0], tune.attackCooldown[1], d.rnd()) * aggr(NIGHT.cooldownMul);   // shorter at night
      if (had) { d.attackEndAt = now; d.cooldownSet = d.cooldown; }
    }
    function startTelegraph(d, kind, dur, pos, radius) {
      d.atk.telegraphAt = now; d.atk.telegraphDur = dur;
      d.telegraph = { kind: kind, pos: pos ? { x: pos.x, z: pos.z } : null, radius: radius || 0, start: now, dur: dur };
      stats.telegraphs++;
      emit('telegraph', { id: d.id, kind: kind, dur: dur, pos: d.telegraph.pos, radius: radius || 0, attackId: d.atk.id });
    }
    // THE ONLY path that damages the player: enforces telegraph ≥ minTelegraph and "defeated never attacks".
    function hurtPlayer(d, dmg, kind, knock, P) {
      var a = d.atk;
      var illegal = d.defeated || !a || a.telegraphAt == null || now - a.telegraphAt < tune.minTelegraph - 1e-9 || (core.attacker != null && core.attacker !== d.id);
      if (illegal) { stats.refused++; core.violations++; return false; }       // should never happen — counted for tests
      if (!P || !P.alive) { stats.refused++; return false; }
      if (P.inCity) { stats.refused++; return false; }                          // The Grid is a safe zone
      if (now < core.rollUntil) { stats.refused++; emit('dodged', { id: d.id, kind: kind, attackId: a.id }); return false; }   // dodge-roll i-frames (host)
      if (knock && now < core.playerInvulnUntil) { stats.refused++; return false; }   // player i-frames (dodge roll / post-knockback)
      if (knock) core.playerInvulnUntil = now + tune.playerIFrames;
      stats.hits++;
      var info = { id: d.id, kind: kind, attackId: a.id, knockback: knock || null, from: { x: d.f.x, y: d.f.y, z: d.f.z }, element: d.element, sinceTelegraph: now - a.telegraphAt };
      emit('hit', { id: d.id, kind: kind, dmg: dmg, attackId: a.id, sinceTelegraph: info.sinceTelegraph, knockback: knock || null });
      if (opts.onHitPlayer) { try { opts.onHitPlayer(dmg, kind, info); } catch (e) {} }
      return true;
    }
    function knockFrom(sx, sz, P, speedMS, up) { var dx = P.x - sx, dz = P.z - sz, l = hyp2(dx, dz) || 1; return { x: dx / l * speedMS * U, y: (up || 6) * U, z: dz / l * speedMS * U }; }

    // ── flight command helpers ──
    // one reusable command object per dragon (no per-frame allocation); every field reset on each call
    function cmdFly(d, tx, ty, tz, speed, extra) {
      var c = d._cmdBuf || (d._cmdBuf = {});
      c.tx = tx; c.ty = ty; c.tz = tz; c.speed = speed; c.minClear = tune.clearPatrolTarget; c.hardClear = tune.clearPatrol; c.standH = d.standH * U;
      c.dive = false; c.maxBankDeg = 0; c.lookMax = 0; c.lookNarrow = false; c.vzFF = 0; c.wobble = 0; c.sink = 0; c.climb = 0;
      if (extra) for (var k in extra) c[k] = extra[k];
      d.cmd = c; return c;
    }
    function cmdHover(d, tx, ty, tz, speed, sink, climb) { var c = cmdFly(d, tx, ty, tz, speed); c.sink = sink; c.climb = climb; return c; }
    function orbitCmd(d, P, radiusM, altM, speed) {
      var ang = Math.atan2(d.f.x - P.x, d.f.z - P.z) + d.orbitDir * tune.orbitLeadRad;
      return cmdFly(d, P.x + Math.sin(ang) * radiusM * U, P.y + altM * U, P.z + Math.cos(ang) * radiusM * U, speed);
    }
    function beginTakeoff(d) { d.f.mode = 'hover'; d.f.vy = 0; d.f.takeoff = true; setState(d, d.defeated ? 'ambient_takeoff' : 'takeoff'); emit('takeoff', { id: d.id }); }
    function landedNow(d, kind) {
      var was = d.f.mode; d.f.mode = 'ground'; d.f.speed = 0; d.f.stalled = false; d.f.takeoff = false;
      if (was !== 'ground') emit('land', { id: d.id, kind: kind || 'land', pos: { x: d.f.x, y: d.f.y, z: d.f.z }, shake: { intensity: kind === 'perch' ? 0.25 : 0.55, duration: 0.5 } });
    }
    // generic "fly to a spot and land" driver; returns true once on the ground
    function flyLand(d, spot, dt, speed) {
      var f = d.f, gx = heightAt(spot.x, spot.z) + d.standH * U, dist = hyp2(spot.x - f.x, spot.z - f.z) / U;
      if (f.mode === 'ground') return true;
      if (f.mode === 'fly') {
        var sp = dist < 120 ? lerp(tune.speedMin, speed, clamp((dist - 30) / 90, 0, 1)) : speed;
        cmdFly(d, spot.x, gx + clamp(dist * 0.35, 12, 60) * U, spot.z, sp, { minClear: dist < 150 ? tune.clearLandApproach + 4 : tune.clearPatrolTarget, hardClear: dist < 150 ? tune.clearLandApproach : tune.clearPatrol });
        if (dist < 34 && f.speed < tune.speedMin + 3) { f.mode = 'hover'; f.vy = f.vy || 0; }   // flare into a hover
        if (dist < 20) { f.mode = 'hover'; }
        return false;
      }
      // hover: glide horizontally onto the spot, descend
      cmdHover(d, spot.x, dist < 6 ? gx - 5 * U : gx + 8 * U, spot.z, 12, 6, 6);
      if (dist < 6 && f.y <= gx + 0.3 * U) { f.y = gx; return true; }
      return false;
    }

    // ── attack selection ──
    function chooseAttack(d, P) {
      var hd = hyp2(P.x - d.f.x, P.z - d.f.z) / U;
      var nearHome = hyp2(P.x - d.home.x, P.z - d.home.z) / U < 110;
      d.attackCount++;
      if (nearHome && d.attackCount % 4 === 0) return 'land';
      if (hd < 40 && d.rnd() < 0.3) return 'roar';
      var r = d.rnd();
      if (hd > 90) return r < 0.6 ? 'breath' : 'swoop';
      return r < 0.45 ? 'swoop' : 'breath';
    }
    function startAttack(d, kind) {
      d.atk = { id: ++attackSeq, kind: kind, phase: 'setup', t: 0, telegraphAt: null };
      core.attacker = d.id;
      setState(d, 'attack');
      emit('attack', { id: d.id, kind: kind, attackId: d.atk.id, sinceLast: now - d.attackEndAt, cooldown: d.cooldownSet, night: core.night });
    }

    // ── per-attack update. returns nothing; fills d.cmd ──
    function updateBreath(d, P, dt) {
      var a = d.atk, B = tune.breath, f = d.f;
      var dx = P.x - f.x, dz = P.z - f.z, hd = hyp2(dx, dz) / U;
      var altCmd = P.y + B.alt * U;
      if (a.phase === 'setup') {                    // open distance, then line up the run
        if (hd < B.lineupDist) { var ax = -dx / (hd * U || 1), az = -dz / (hd * U || 1); cmdFly(d, P.x + ax * (B.lineupDist + 40) * U, P.y + 32 * U, P.z + az * (B.lineupDist + 40) * U, tune.speedMax); }
        else { a.phase = 'approach'; }
        if (a.t > 14) { endAttack(d); setState(d, 'patrol'); }
        return;
      }
      if (a.phase === 'approach') {                 // head straight at the player, descend to strafe height
        cmdFly(d, P.x, altCmd, P.z, tune.speedCruise, { minClear: tune.clearStrafe + 1, hardClear: tune.clearStrafe, lookMax: hd < 220 ? hd + 25 : null, dive: true });
        var altP = (f.y - P.y) / U, err = Math.abs(wrapPi(Math.atan2(dx, dz) - f.yaw)), altOK = altP < B.len - 3;   // overhead slant must fit inside the 35 m cone
        var hdB = hd - f.speed * B.inhale;                           // horizontal range when the breath actually starts
        if (altOK && hdB > 8 && Math.sqrt(hdB * hdB + altP * altP) <= B.len - 3 && err < 0.35) {
          a.phase = 'inhale'; a.lock = { x: P.x, y: P.y, z: P.z }; a.dirx = Math.sin(f.yaw); a.dirz = Math.cos(f.yaw);
          d.inhaling = true; startTelegraph(d, 'breath', B.inhale, a.lock, B.endRadius);
        } else if (hd < 25 || a.t > 22) { a.phase = 'setup'; a.t = 0; }       // overshot / never lined up → go round again
        return;
      }
      // inhale + breath: fly straight along the locked line (no tracking — rolling sideways dodges)
      var ext = { x: a.lock.x + a.dirx * 200 * U, z: a.lock.z + a.dirz * 200 * U };
      var alongL = ((a.lock.x - f.x) * a.dirx + (a.lock.z - f.z) * a.dirz) / U;
      cmdFly(d, ext.x, a.lock.y + B.alt * U, ext.z, tune.speedCruise, { minClear: tune.clearStrafe + 1, hardClear: tune.clearStrafe, maxBankDeg: 20, lookMax: Math.max(alongL, 0) + 25 });
      if (a.phase === 'inhale') {
        if (now - a.telegraphAt >= B.inhale) { a.phase = 'breath'; a.breathStart = now; a.nextTick = now; d.inhaling = false; d.breathing = true; emit('breath', { id: d.id, attackId: a.id, element: d.element, dur: B.dur }); }
        return;
      }
      if (a.phase === 'breath') {
        // cone axis: head tracks the player at a limited turn rate, clamped to the flight direction ±55°
        var mouth = mouthPos(d);
        var tx = P.x - mouth.x, ty = (P.y + 1.2 * U) - mouth.y, tz = P.z - mouth.z, tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        // lateral sweep limited to ±latDeg around the locked run line (pitch is free) → side-rolls escape the cone
        var hl = Math.sqrt(tx * tx + tz * tz);
        if (hl > 1e-4) {
          var lat = wrapPi(Math.atan2(tx, tz) - Math.atan2(a.dirx, a.dirz)), lim = B.latDeg * D2R;
          if (Math.abs(lat) > lim) { var yw = Math.atan2(a.dirx, a.dirz) + clamp(lat, -lim, lim); tx = Math.sin(yw) * hl; tz = Math.cos(yw) * hl; }
        }
        var fwd = forwardVec(f);
        var c = d.coneAxis || { x: tx, y: ty, z: tz };   // head already aimed during the inhale
        var cl = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1; c = { x: c.x / cl, y: c.y / cl, z: c.z / cl };
        var dot = clamp(c.x * tx + c.y * ty + c.z * tz, -1, 1), ang = Math.acos(dot), step = B.headTurnDeg * D2R * dt;
        var k = ang > 1e-4 ? Math.min(1, step / ang) : 1;
        c = { x: lerp(c.x, tx, k), y: lerp(c.y, ty, k), z: lerp(c.z, tz, k) }; cl = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1; c = { x: c.x / cl, y: c.y / cl, z: c.z / cl };
        var fd = c.x * fwd.x + c.y * fwd.y + c.z * fwd.z;   // keep within 80° of forward (the neck can curl under the chest)
        if (fd < Math.cos(80 * D2R)) { c = { x: lerp(fwd.x, c.x, 0.6), y: lerp(fwd.y, c.y, 0.6) - 0.3, z: lerp(fwd.z, c.z, 0.6) }; cl = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1; c = { x: c.x / cl, y: c.y / cl, z: c.z / cl }; }
        d.coneAxis = c; d.mouth = mouth;
        if (now >= a.nextTick) {
          a.nextTick = now + B.tick;
          if (inCone(mouth, c, { x: P.x, y: P.y + 1.2 * U, z: P.z }, B.len, B.endRadius)) hurtPlayer(d, B.dps * B.tick * aggr(NIGHT.dpsMul), 'breath', null, P);
        }
        var along = (P.x - f.x) * a.dirx + (P.z - f.z) * a.dirz;
        if (now - a.breathStart > B.dur || along < -15 * U) { a.phase = 'exit'; d.breathing = false; d.coneAxis = null; }
        return;
      }
      if (a.phase === 'exit') { cmdFly(d, f.x + a.dirx * 300 * U, P.y + 60 * U, f.z + a.dirz * 300 * U, tune.speedMax); if (now - a.breathStart > B.dur + 2.5 && (clearOK(d) || now - a.breathStart > B.dur + 10)) { endAttack(d); setState(d, 'patrol'); } }
    }

    function updateSwoop(d, P, dt) {
      var a = d.atk, S = tune.swoop, f = d.f;
      var dx = P.x - f.x, dz = P.z - f.z, hd = hyp2(dx, dz) / U;
      if (a.phase === 'setup') {                     // climb high, open to 110–190 m, turn in
        if (hd < S.dist[0]) cmdFly(d, P.x - dx / (hd * U || 1) * S.dist[1] * U, P.y + (S.alt + 10) * U, P.z - dz / (hd * U || 1) * S.dist[1] * U, tune.speedMax);
        else cmdFly(d, P.x, P.y + (S.alt + 10) * U, P.z, tune.speedCruise);
        var err = Math.abs(wrapPi(Math.atan2(dx, dz) - f.yaw));
        if (hd >= S.dist[0] && hd <= S.dist[1] + 40 && err < 0.4 && f.y - P.y > (S.alt - 15) * U) {
          a.phase = 'telegraph'; a.lock = { x: P.x, y: P.y, z: P.z }; a.dirx = dx / (hd * U); a.dirz = dz / (hd * U);
          startTelegraph(d, 'swoop', S.telegraph, a.lock, S.hitRadius);
          emit('screech', { id: d.id });
        } else if (a.t > 16) { endAttack(d); setState(d, 'patrol'); }
        return;
      }
      if (a.phase === 'telegraph') {                 // screech + growing shadow; hold altitude, line up on the lock
        cmdFly(d, a.lock.x, a.lock.y + S.alt * U, a.lock.z, tune.speedCruise, { maxBankDeg: 35 });
        if (now - a.telegraphAt >= S.telegraph) {
          a.phase = 'dive';
          a.d0 = Math.max(20, ((a.lock.x - f.x) * a.dirx + (a.lock.z - f.z) * a.dirz) / U);
          a.h0 = (f.y - a.lock.y) / U;
          emit('swoop', { id: d.id, attackId: a.id, pos: a.lock, shake: { intensity: 0.3, duration: 1.2 } }); }
        return;
      }
      if (a.phase === 'dive') {
        var along = (a.lock.x - f.x) * a.dirx + (a.lock.z - f.z) * a.dirz;   // >0 = lock still ahead
        var gk = along / U / a.d0 - 0.12, slope = (a.h0 - S.passAlt) / (a.d0 * 0.88);
        var glideH = S.passAlt + (a.h0 - S.passAlt) * clamp(gk / 0.88, 0, 1);   // straight dive line, levels out ~12% before the lock
        cmdFly(d, a.lock.x + a.dirx * 60 * U, a.lock.y + glideH * U, a.lock.z + a.dirz * 60 * U, tune.speedDive, { dive: true, minClear: S.passAlt, hardClear: tune.clearDive, maxBankDeg: 30, lookMax: Math.max(along / U, 0) + 8, lookNarrow: true, vzFF: gk > 0 ? -Math.hypot(f.hvx, f.hvz) * slope : 0 });
        var pd = Math.sqrt(Math.pow(P.x - f.x, 2) + Math.pow(P.z - f.z, 2)) / U, pdy = Math.abs(f.y - (P.y + 1 * U)) / U;
        if (!a.didHit && pd < S.hitRadius && pdy < 7) { a.didHit = true; hurtPlayer(d, S.dmg, 'swoop', knockFrom(f.x - a.dirx * U, f.z - a.dirz * U, P, S.knock, 7), P); }
        if (along < -10 * U || a.t > 9) { a.phase = 'pullup'; a.pullT = now; d.telegraph = null; }
        return;
      }
      if (a.phase === 'pullup') { cmdFly(d, f.x + a.dirx * 300 * U, P.y + 55 * U, f.z + a.dirz * 300 * U, tune.speedMax); if (now - a.pullT > 2.5 && (clearOK(d) || now - a.pullT > 10)) { endAttack(d); setState(d, 'patrol'); } }
    }

    function updateRoar(d, P, dt) {
      var a = d.atk, R = tune.roar;
      if (d.f.mode !== 'ground') orbitCmd(d, P, 70, 45, tune.speedCruise); else cmdFly(d, P.x, 0, P.z, 0);
      if (a.phase === 'setup') { a.phase = 'telegraph'; startTelegraph(d, 'roar', R.telegraph, { x: d.f.x, z: d.f.z }, R.radius); return; }
      if (a.phase === 'telegraph' && now - a.telegraphAt >= R.telegraph) {
        a.phase = 'done'; emit('roar', { id: d.id, attackId: a.id, pos: { x: d.f.x, y: d.f.y, z: d.f.z }, radius: R.radius, shake: { intensity: 0.5, duration: 1.0 } });
        var head = mouthPos(d), dd = Math.sqrt(Math.pow(P.x - head.x, 2) + Math.pow(P.z - head.z, 2)) / U;
        if (dd <= R.radius) hurtPlayer(d, 0, 'stagger', knockFrom(head.x, head.z, P, 4, 2), P);
        a.doneAt = now;
      }
      if (a.phase === 'done' && now - a.doneAt > 1.0) { var g = d.f.mode === 'ground'; endAttack(d, 1.2); setState(d, g ? 'grounded' : 'patrol'); }
    }

    function updateLand(d, P, dt) {            // land in front of the crossing, then stomp / tail-swipe / roar
      var a = d.atk, f = d.f;
      if (a.phase === 'setup') {
        var side = hyp2(P.x - d.home.x, P.z - d.home.z) > 1 ? { x: (P.x - d.home.x), z: (P.z - d.home.z) } : d.out, sl = hyp2(side.x, side.z) || 1;
        a.spot = pushOut({ x: d.home.x + side.x / sl * tune.landOffset * U, z: d.home.z + side.z / sl * tune.landOffset * U });
        a.phase = 'approach';
      }
      if (a.phase === 'approach') {
        if (flyLand(d, a.spot, dt, tune.speedCruise)) { landedNow(d, 'land'); a.phase = 'ground'; a.groundUntil = now + lerp(tune.groundTime[0], tune.groundTime[1], d.rnd()); a.sub = null; }
        else if (a.t > 30) { endAttack(d); setState(d, 'patrol'); }
        return;
      }
      if (a.phase === 'ground') {
        cmdFly(d, P.x, 0, P.z, 0);
        var dx = P.x - f.x, dz = P.z - f.z, hd = hyp2(dx, dz) / U, fwdDot = (Math.sin(f.yaw) * dx + Math.cos(f.yaw) * dz) / (hd * U || 1);
        if (!a.sub) {
          if (now > a.groundUntil) { a.phase = 'takeoff'; d.telegraph = null; beginTakeoff(d); setState(d, 'attack'); return; }
          var kind = null;
          if (hd < tune.tail.radius && fwdDot < -0.2) kind = 'tail';
          else if (hd < tune.stomp.radius + 4) kind = 'stomp';
          else if (hd < 60 && d.rnd() < 0.25 * dt * 4) kind = 'roar';
          if (kind) {
            a.sub = kind; a.subAt = now;
            var T = tune[kind];
            startTelegraph(d, kind, T.telegraph, { x: f.x, z: f.z }, T.radius);
          }
          return;
        }
        var T2 = tune[a.sub];
        if (now - a.telegraphAt >= T2.telegraph) {
          if (a.sub === 'stomp') {
            emit('land', { id: d.id, kind: 'stomp', pos: { x: f.x, y: f.y, z: f.z }, shake: { intensity: 1.0, duration: 0.6 }, radius: T2.radius });
            if (hd <= T2.radius) hurtPlayer(d, T2.dmg, 'stomp', knockFrom(f.x, f.z, P, T2.knock, 8), P);
          } else if (a.sub === 'tail') {
            emit('tailswipe', { id: d.id, pos: { x: f.x, y: f.y, z: f.z }, radius: T2.radius, shake: { intensity: 0.4, duration: 0.3 } });
            if (hd <= T2.radius && fwdDot < 0.3) hurtPlayer(d, T2.dmg, 'tail', knockFrom(f.x, f.z, P, T2.knock, 5), P);
          } else {
            emit('roar', { id: d.id, attackId: a.id, pos: { x: f.x, y: f.y, z: f.z }, radius: T2.radius, shake: { intensity: 0.5, duration: 1.0 } });
            if (hd <= T2.radius) hurtPlayer(d, 0, 'stagger', knockFrom(f.x, f.z, P, 4, 2), P);
          }
          a.sub = null; d.telegraph = null; a.telegraphAt = null;   // next ground move needs its own telegraph
          a.groundUntil = Math.max(a.groundUntil, now + 1.2);
        }
        return;
      }
      if (a.phase === 'takeoff') {
        cmdFly(d, f.x + Math.sin(f.yaw) * 200 * U, f.y + 50 * U, f.z + Math.cos(f.yaw) * 200 * U, tune.speedCruise);
        if (f.mode === 'fly' && !f.takeoff && clearOK(d)) { endAttack(d); setState(d, 'patrol'); }
      }
    }

    // ── per-dragon brain ──
    function brain(d, P, dt) {
      var f = d.f;
      d.stateT += dt; if (d.atk) d.atk.t += dt;
      d.staggerT = Math.max(0, d.staggerT - dt);
      if (!P) { _noP.x = d.home.x; _noP.y = heightAt(d.home.x, d.home.z); _noP.z = d.home.z; P = _noP; }   // no player (menus/loading) → disengage
      var pH = P ? hyp2(P.x - d.home.x, P.z - d.home.z) / U : Infinity;
      var engaged = P && P.alive && !d.defeated;

      // defeated at any point → glide down, land, bow
      if (d.defeated) return brainDefeated(d, P, dt);

      // leash: player gone far / dead → return home and heal
      var active = ACTIVE_STATES[d.state] === 1;
      if (active) {
        if (!engaged || pH > tune.leashRadius * aggr(NIGHT.leashMul)) d.leashT += dt; else d.leashT = 0;
        if (d.leashT > tune.leashTime) { endAttack(d, 2); d.leashT = 0; setState(d, 'return'); }
      }

      switch (d.state) {
        case 'perch':
          cmdFly(d, f.x + Math.sin(f.yaw), 0, f.z + Math.cos(f.yaw), 0);
          if (engaged && pH < tune.alertRadius * aggr(NIGHT.alertMul)) { setState(d, 'alert'); d.atk = { id: ++attackSeq, kind: 'roar', phase: 'setup', t: 0, telegraphAt: null }; }
          break;
        case 'alert':   // perched roar, then take off
          cmdFly(d, P.x, 0, P.z, 0);
          if (d.atk && d.atk.phase === 'setup') {
            if (core.attacker == null || core.attacker === d.id) { core.attacker = d.id; d.atk.phase = 'telegraph'; startTelegraph(d, 'roar', tune.roar.telegraph, { x: f.x, z: f.z }, tune.roar.radius); }
            else { d.atk = null; beginTakeoff(d); }
          }
          else if (d.atk && d.atk.phase === 'telegraph' && now - d.atk.telegraphAt >= tune.roar.telegraph) {
            emit('roar', { id: d.id, attackId: d.atk.id, pos: { x: f.x, y: f.y, z: f.z }, radius: tune.roar.radius, shake: { intensity: 0.5, duration: 1.0 } });
            var hp = mouthPos(d); if (hyp2(P.x - hp.x, P.z - hp.z) / U <= tune.roar.radius) hurtPlayer(d, 0, 'stagger', knockFrom(hp.x, hp.z, P, 4, 2), P);
            d.atk.phase = 'done'; d.atk.doneAt = now;
          } else if (d.atk && d.atk.phase === 'done' && now - d.atk.doneAt > 0.6) { d.atk = null; d.telegraph = null; releaseToken(d); beginTakeoff(d); }
          break;
        case 'takeoff':
          cmdFly(d, f.x + Math.sin(f.yaw) * 300 * U, heightAt(f.x, f.z) + 60 * U, f.z + Math.cos(f.yaw) * 300 * U, tune.speedCruise, { minClear: 12, hardClear: 0 });
          if (f.mode === 'fly' && !f.takeoff && clearOK(d)) setState(d, 'patrol');
          break;
        case 'patrol': {
          var R = lerp(tune.orbitR[0], tune.orbitR[1], 0.5 + 0.5 * Math.sin(now * 0.13 + d.orbitPhase));
          var A = lerp(tune.orbitAlt[0], tune.orbitAlt[1], 0.5 + 0.5 * Math.sin(now * 0.09 + d.orbitPhase * 2));
          if (P) orbitCmd(d, P, R, A, tune.speedCruise, d.staggerT > 0 ? { wobble: Math.sin(now * 25) * 0.3 } : null);
          if (d.staggerT > 0 && d.cmd) d.cmd.wobble = Math.sin(now * 25) * 0.3;
          d.cooldown -= dt;
          if (d.hp < d.hpMax * tune.retreatHpFrac * aggr(NIGHT.retreatMul) && !d.rested) { setState(d, 'retreat'); break; }
          if (engaged && !P.inCity && d.cooldown <= 0 && (core.attacker == null || core.attacker === d.id) && d.stateT > 1.5) startAttack(d, chooseAttack(d, P));
          break;
        }
        case 'attack':
          if (!d.atk) { setState(d, 'patrol'); break; }
          if (P.inCity && d.atk.kind !== 'land') { endAttack(d); setState(d, 'patrol'); break; }   // player fled into The Grid: abort, circle high
          if (d.atk.kind === 'breath') updateBreath(d, P, dt);
          else if (d.atk.kind === 'swoop') updateSwoop(d, P, dt);
          else if (d.atk.kind === 'roar') updateRoar(d, P, dt);
          else if (d.atk.kind === 'land') updateLand(d, P, dt);
          if (d.staggerT > 0 && d.cmd) d.cmd.wobble = Math.sin(now * 25) * 0.3;
          break;
        case 'retreat':
          if (flyLand(d, d.perch, dt, tune.speedMax)) { landedNow(d, 'perch'); setState(d, 'rest'); }
          break;
        case 'rest':
          cmdFly(d, P ? P.x : f.x, 0, P ? P.z : f.z, 0);
          d.hp = Math.min(d.hpMax, d.hp + d.hpMax * tune.restRegenFrac / tune.restTime * dt);
          if (d.stateT > tune.restTime) { d.rested = true; if (engaged && pH < tune.leashRadius) beginTakeoff(d); else setState(d, 'perch'); }
          break;
        case 'return':
          if (flyLand(d, d.perch, dt, tune.speedCruise)) { landedNow(d, 'perch'); d.hp = d.hpMax; d.rested = false; setState(d, 'perch'); }
          break;
        case 'grounded':   // after a ground roar: back into the land attack loop or take off
          beginTakeoff(d); break;
      }
      // hover → fly handover once the take-off climb has some height and speed
      if (f.mode === 'hover' && f.takeoff) takeoffClimb(d);
    }
    // hover → fly handover once the take-off climb has some height (flapping hover climb, then pitch into flight)
    function takeoffClimb(d) {
      var f = d.f;
      cmdHover(d, f.x + Math.sin(f.yaw) * 100 * U, heightAt(f.x, f.z) + 40 * U, f.z + Math.cos(f.yaw) * 100 * U, 14, 4, 10);
      if (f.y - heightAt(f.x, f.z) > 14 * U) { f.mode = 'fly'; f.speed = Math.max(f.speed, 12); f.pitch = 0.3; }
    }

    function brainDefeated(d, P, dt) {
      var f = d.f;
      switch (d.state) {
        case 'defeated_glide':
          if (flyLand(d, d.landSpot, dt, tune.speedMin + 2)) { landedNow(d, 'defeat'); setState(d, 'bow'); }
          else if (d.stateT > 40) { f.mode = 'ground'; f.x = approach(f.x, d.landSpot.x, 20 * U * dt); f.z = approach(f.z, d.landSpot.z, 20 * U * dt); }
          break;
        case 'bow':
          if (P) cmdFly(d, P.x, 0, P.z, 0);
          d.bow = Math.min(1, d.stateT / 1.2);
          if (d.stateT > 3.2) { finishDefeat(d); setState(d, 'peaceful'); }
          break;
        case 'peaceful':   // perched quietly (at the land spot or the perch); every ~45 s go for a high ambient loop
          d.bow = Math.max(0, d.bow - dt);
          cmdFly(d, f.x + Math.sin(f.yaw), 0, f.z + Math.cos(f.yaw), 0);
          d.ambientT += dt;
          if (d.ambientT > 45 + (d.rnd() * 20)) { d.ambientT = 0; beginTakeoff(d); }
          break;
        case 'ambient_takeoff':
          cmdFly(d, f.x + Math.sin(f.yaw) * 300 * U, heightAt(f.x, f.z) + 120 * U, f.z + Math.cos(f.yaw) * 300 * U, tune.speedCruise, { minClear: 12, hardClear: 0 });
          if (f.mode === 'hover' && f.takeoff) takeoffClimb(d);
          if (f.mode === 'fly' && !f.takeoff && clearOK(d)) setState(d, 'ambient');
          break;
        case 'ambient': {  // lazy high loops above the realm, then come back to perch
          var cx = d.home.x + d.out.x * 500 * U, cz = d.home.z + d.out.z * 500 * U;
          var ang = Math.atan2(f.x - cx, f.z - cz) + 0.5;
          cmdFly(d, cx + Math.sin(ang) * 380 * U, heightAt(cx, cz) + 150 * U, cz + Math.cos(ang) * 380 * U, tune.speedCruise - 4, { minClear: 60, hardClear: tune.clearPatrol });
          if (d.stateT > 60) setState(d, 'ambient_return');
          break;
        }
        case 'ambient_return':
          if (flyLand(d, d.perch, dt, tune.speedCruise)) { landedNow(d, 'perch'); setState(d, 'peaceful'); }
          break;
        default: setState(d, 'peaceful');
      }
    }

    function finishDefeat(d) {
      if (d._defeatSaved) return; d._defeatSaved = true;
      try { if (opts.setDefeated) opts.setDefeated(d.id); } catch (e) {}
      emit('defeated', { id: d.id, station: d.station, element: d.element, name: d.name });
    }

    // ── public: damage from the player ──
    function damage(id, amount, hitPos, type) {
      var d = byId(id); if (!d || d.defeated || d.ridden || !(amount > 0)) return false;
      if (now < d.invulnUntil) return false;                                   // i-frames
      var res = (RESIST[d.element] || {})[type || 'physical'] || 0;
      amount = amount * (1 - res);
      d.invulnUntil = now + tune.dragonIFrames;
      d.hp = Math.max(0, d.hp - amount);
      emit('hurt', { id: d.id, dmg: amount, hp: d.hp, hpMax: d.hpMax, pos: hitPos || null, type: type || 'physical', resisted: res });
      if (d.state === 'perch' || d.state === 'rest' || d.state === 'return') {   // woken up by the hit
        if (d.state !== 'return' && d.f.mode === 'ground') { setState(d, 'alert'); d.atk = { id: ++attackSeq, kind: 'roar', phase: 'setup', t: 0, telegraphAt: null }; }
      }
      d.staggerT = 0.6;
      // a heavy hit (≥ 8% max hp) interrupts a telegraph that hasn't landed yet
      if (d.atk && amount >= d.hpMax * 0.08 && d.atk.telegraphAt != null && now - d.atk.telegraphAt < (d.atk.telegraphDur || 0) && d.state === 'attack' && d.atk.kind !== 'land') {
        emit('interrupt', { id: d.id, kind: d.atk.kind }); endAttack(d, 1.5); setState(d, 'patrol');
      }
      if (d.hp <= 0) {
        d.defeated = true; endAttack(d, 999); d.breathing = false; d.inhaling = false;
        emit('downed', { id: d.id });
        if (d.f.mode === 'ground') { setState(d, 'bow'); } else { d.f.stalled = false; setState(d, 'defeated_glide'); }
      }
      return true;
    }

    function byId(id) { for (var i = 0; i < core.dragons.length; i++) if (core.dragons[i].id === id) return core.dragons[i]; return null; }

    // ── tick ──
    function step(d, P, dt) {
      brain(d, P, dt);
      var c = d.cmd || cmdFly(d, d.f.x, d.f.y, d.f.z, 0);
      c.standH = d.standH * U;
      cityGuard(d, c);
      stepFlight(d.f, c, dt, heightAt, tune);
      // head/jaw targets (animation hints consumed by the visual layer)
      var jawT = d.breathing ? 1 : d.inhaling ? 0.35 : (d.atk && d.telegraph && (d.telegraph.kind === 'roar' || d.telegraph.kind === 'swoop') ? 0.9 : 0);
      if (d.state === 'alert' && d.telegraph) jawT = 0.9;
      d.jaw = approach(d.jaw, jawT, 3 * dt);
    }
    // The Grid overfly: within cityR (+ cityBuffer ramp, using the target and an 8 s look-ahead) the clearance target
    // rises toward cityOverfly, so a wild dragon only ever crosses the city high. Ground/hover (landings) are always outside.
    function cityGuard(d, c) {
      var f = d.f; if (f.mode !== 'fly') return;
      var R = tune.cityR, B = tune.cityBuffer;
      var r = Math.min(hyp2(f.x, f.z), hyp2(f.x + f.hvx * 8 * U, f.z + f.hvz * 8 * U), hyp2(c.tx, c.tz)) / U;
      if (r >= R + B) return;
      var k = clamp((R + B - r) / B, 0, 1), base = c.minClear != null ? c.minClear : tune.clearPatrolTarget;
      var clr = lerp(base, tune.cityOverfly, k);
      if (base < clr) c.minClear = clr;
      if (hyp2(c.tx, c.tz) / U < R) c.ty = Math.max(c.ty, heightAt(c.tx, c.tz) + tune.cityOverfly * U);
      c.dive = false;
    }
    function update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), tune.maxDt);
      now += dt;
      if (opts.nightFactor) { var nf = +opts.nightFactor(); core.night = nf > 0 ? (nf < 1 ? nf : 1) : 0; }
      var P = player();
      for (var i = 0; i < core.dragons.length; i++) {
        var d = core.dragons[i];
        if (d.ridden) { d.lod = 'near'; d.distToPlayer = 0; continue; }   // a tamed/ridden dragon is flown by world-dragon-ride.js
        d.distToPlayer = P ? Math.sqrt(Math.pow(P.x - d.f.x, 2) + Math.pow(P.z - d.f.z, 2)) / U : Infinity;
        var far = d.distToPlayer > tune.farDist && d.state !== 'attack' && !(d.f.mode === 'fly' && hyp2(d.f.x, d.f.z) / U < tune.cityR + tune.cityBuffer);   // full-rate near/over the city (overfly climb)
        d.lod = far ? 'far' : 'near';
        if (far) { d.lodAcc += dt; var fs = 1 / tune.farHz; if (d.lodAcc < fs) continue; var sdt = d.lodAcc; d.lodAcc = 0; while (sdt > 1e-6) { var s = Math.min(sdt, 0.2); step(d, P, s); sdt -= s; } }
        else { d.lodAcc = 0; step(d, P, dt); }
      }
      stats.floorHits = 0; for (var j = 0; j < core.dragons.length; j++) stats.floorHits += core.dragons[j].f.floorHits;
    }

    core.update = update; core.damage = damage; core.on = on; core.off = off; core.emit = emit; core.byId = byId;
    core.stats = function () {
      var st = {}; core.dragons.forEach(function (d) { st[d.state] = (st[d.state] || 0) + 1; });
      return { dragons: core.dragons.length, defeated: core.dragons.filter(function (d) { return d.defeated; }).length, attacker: core.attacker, states: st,
        hits: stats.hits, telegraphs: stats.telegraphs, refused: stats.refused, violations: core.violations, floorHits: stats.floorHits, time: now };
    };
    core.setPlayerInvulnerable = function (sec) { core.rollUntil = Math.max(core.rollUntil, now + (sec || 0)); };
    // ── player → dragon hit helpers (pure; the THREE api delegates here). Same pattern as world-wildlife-v4 wolves. ──
    var _hc = { x: 0, y: 0, z: 0 };
    core.hitTest = function (pos, radiusUnits) {   // sphere vs body (+ outstretched wings when airborne) → id | null
      var best = null, bd = Infinity;
      for (var i = 0; i < core.dragons.length; i++) {
        var d = core.dragons[i]; if (d.defeated || d.ridden) continue;
        var dx = pos.x - d.f.x, dy = (pos.y || 0) - d.f.y, dz = pos.z - d.f.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var r = (d.f.mode === 'ground' ? d.wingspan * 0.28 : d.wingspan * 0.42) * U + (radiusUnits || 0);
        if (dist < r && dist < bd) { bd = dist; best = d.id; }
      }
      return best;
    };
    core.meleeHit = function (pos, fwd, reachUnits, dmg, type) {   // cone in front of the player (swing / kick) → id | null
      var hit = null;
      for (var i = 0; i < core.dragons.length; i++) {
        var d = core.dragons[i]; if (d.defeated || d.ridden) continue;
        var dx = d.f.x - pos.x, dy = d.f.y - (pos.y || 0), dz = d.f.z - pos.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz) - d.bodyRadius * U;
        if (dist > reachUnits) continue;
        var fl = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z) || 1, hl = hyp2(dx, dz) || 1;
        if ((dx * fwd.x + dz * fwd.z) / (fl * hl) < 0.35 && hl > d.bodyRadius * U) continue;
        _hc.x = d.f.x; _hc.y = d.f.y; _hc.z = d.f.z;
        if (core.damage(d.id, dmg, _hc, type)) hit = d.id;
      }
      return hit;
    };
    // tame/ride hand-off (world-dragon-ride.js): only a DEFEATED (bowed) dragon can be ridden. While ridden the core skips it.
    // Release puts it down where the rider left it and it flies home to its perch (ambient loop) — never stays in The Grid.
    core.setRidden = function (id, on, pos) {
      var d = byId(id); if (!d) return false;
      if (on) { if (!d.defeated || d.ridden) return false; d.ridden = true; d.breathing = d.inhaling = false; d.telegraph = null; emit('ridden', { id: d.id, on: true }); return true; }
      if (!d.ridden) return false;
      d.ridden = false;
      if (pos) { d.f.x = pos.x; d.f.z = pos.z; d.f.y = pos.y != null ? pos.y : heightAt(pos.x, pos.z) + d.standH * U; if (pos.yaw != null) d.f.yaw = pos.yaw; }
      d.f.mode = 'ground'; d.f.speed = 0; d.f.vy = 0; d.f.hc = -1; d.ambientT = 0; d.bow = 0;
      d.state = 'peaceful'; beginTakeoff(d);
      emit('ridden', { id: d.id, on: false });
      return true;
    };
    core._forceAttack = function (id, kind) { var d = byId(id); if (!d || d.defeated) return false; if (d.f.mode !== 'fly') return false; endAttack(d, 0); startAttack(d, kind); return true; };
    return core;
  }

  // shared geometry helpers for the core
  function forwardVec(f) { var cp = Math.cos(f.pitch); return { x: Math.sin(f.yaw) * cp, y: Math.sin(f.pitch), z: Math.cos(f.yaw) * cp }; }
  function mouthPos(d) {   // head ≈ 0.45 wingspan ahead of the body centre, slightly low
    var fw = forwardVec(d.f), r = d.wingspan * 0.45 * U;
    return { x: d.f.x + fw.x * r, y: d.f.y + fw.y * r - 0.6 * U, z: d.f.z + fw.z * r };
  }
  // cone: apex at the mouth, axis unit vector, length (m), radius at the far end (m)
  function inCone(apex, axis, p, lenM, endRM) {
    var vx = p.x - apex.x, vy = p.y - apex.y, vz = p.z - apex.z;
    var along = (vx * axis.x + vy * axis.y + vz * axis.z) / U;
    if (along < 0.5 || along > lenM) return false;
    var dl = Math.sqrt(vx * vx + vy * vy + vz * vz) / U;
    var perp = Math.sqrt(Math.max(0, dl * dl - along * along));
    return perp <= 1.2 + endRM * (along / lenM);   // 1.2 m throat radius at the mouth
  }

  /* Animation blend for rigged dragons (pure, allocation-free — fills `out`). p = { fold 0..1 (1 = wings folded, standing),
   * glide 0..1, flapEffort 0..1, hover 0|1, groundMove 0..1 }. Weights over {fly, glide, idle, walk, run} always sum to 1.
   * Air: fly (timeScale 0.8 → 1.8 with effort, slower in a glide) blended with glide (if the GLB has one, else fly slowed to
   * 0.35 = wings held). Ground: idle ↔ walk ↔ run by groundMove. Take-off/landing = fold crossfades air ↔ ground. */
  function clipWeights(p, out, hasGlide, hasWalk, hasRun, hasIdle) {
    var air = clamp(1 - (p.fold || 0), 0, 1), gl = clamp(p.glide || 0, 0, 1) * (p.hover ? 0 : 1), mv = clamp(p.groundMove || 0, 0, 1);
    var effort = clamp(p.flapEffort || 0, 0, 1);
    out.glide = hasGlide ? air * gl : 0;
    out.fly = air - out.glide;
    var g = 1 - air;
    var runK = hasRun ? clamp((mv - 0.6) / 0.4, 0, 1) : 0;
    var mvW = clamp(mv * 2.5, 0, 1);   // any real ground motion reads as walking quickly
    out.run = hasRun ? g * mvW * runK : 0;
    out.walk = hasWalk ? g * mvW * (1 - runK) : 0;
    out.idle = g - out.walk - out.run;
    if (!hasIdle) { out.fly += out.idle; out.idle = 0; }   // no idle clip: a folded, slowed fly pose is better than bind pose
    out.flyScale = lerp(0.8, 1.8, effort) * (p.hover ? 1.25 : 1) * (hasGlide ? 1 : lerp(1, 0.35, gl)) * (hasIdle ? 1 : lerp(1, 0.2, g));
    out.walkScale = lerp(0.8, 1.3, mv);
    return out;
  }

  // ───────────────────────────────────────── VISUALS (browser, THREE) ─────────────────────────────────────
  function buildWorldDragons(opts) {
    var THREE = opts.THREE, scene = opts.scene;
    var tune = opts.tune || TUNE;
    var heightAt = opts.heightAt || function () { return 0; };
    var core = createDragonsCore({
      heightAt: heightAt, layout: opts.layout || root.WORLD_LAYOUT, getPlayer: opts.getPlayer, onHitPlayer: opts.onHitPlayer,
      isDefeated: opts.isDefeated, setDefeated: opts.setDefeated, seed: opts.seed, tune: tune,
    });
    var disposables = [];
    function track(o) { disposables.push(o); return o; }
    var group = new THREE.Group(); group.name = 'world-dragons'; scene.add(group);
    var clock = 0;

    // ── procedural rig geometry (unit wingspan = 1; +Z forward, +Y up, +X = dragon's LEFT) ──
    var GEO = null;
    function buildGeo() {
      if (GEO) return GEO;
      function lathe(profile, seg) { var pts = profile.map(function (p) { return new THREE.Vector2(p[1], p[0]); }); var g = new THREE.LatheGeometry(pts, seg || 10); g.rotateX(Math.PI / 2); return track(g); }
      GEO = {};
      // torso along Z (tail end z=-0.16 → chest z=+0.14), deep chest
      GEO.torso = lathe([[-0.17, 0.018], [-0.12, 0.042], [-0.04, 0.058], [0.05, 0.062], [0.12, 0.05], [0.16, 0.03]], 12);
      GEO.torso.scale(1, 1.05, 1);
      GEO.neckSeg = lathe([[0, 0.028], [0.07, 0.022]], 8);
      GEO.head = (function () { var g = lathe([[-0.01, 0.026], [0.03, 0.03], [0.07, 0.022], [0.1, 0.012]], 8); g.scale(0.9, 0.75, 1); return g; })();
      GEO.jaw = (function () { var g = lathe([[0, 0.016], [0.05, 0.014], [0.085, 0.006]], 6); g.scale(0.85, 0.5, 1); return g; })();
      GEO.horn = (function () { var g = new THREE.ConeGeometry(0.008, 0.06, 5); g.rotateX(-Math.PI / 2 + 0.6); return track(g); })();
      GEO.tailSeg = lathe([[0, 0.02], [0.09, 0.014]], 7);
      GEO.tailTip = (function () { var s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.03, 0.02); s.lineTo(0, 0.07); s.lineTo(-0.03, 0.02); s.lineTo(0, 0); var g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2); g.rotateY(Math.PI); g.scale(1, 1, 1); return track(g); })();
      GEO.spike = (function () { var g = new THREE.ConeGeometry(0.008, 0.035, 4); g.translate(0, 0.0175, 0); return track(g); })();
      GEO.leg = (function () { var g = new THREE.CylinderGeometry(0.012, 0.008, 0.09, 6); g.translate(0, -0.045, 0); return track(g); })();
      GEO.eye = track(new THREE.SphereGeometry(0.0065, 6, 4));
      GEO.bone = (function () { var g = new THREE.CylinderGeometry(0.007, 0.005, 1, 5); g.rotateZ(Math.PI / 2); g.translate(0.5, 0, 0); return track(g); })();
      // wing membranes in the XZ plane, pivot at the origin (shoulder / wrist); +X outward, -Z trailing
      function membrane(pts) { var s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); var g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2); return track(g); }   // shape (x, y) → (x, 0, y) after rotateX(+90°): pass design z directly (trailing edge = -z)
      // inner wing: shoulder (0,0) → wrist (0.22, 0.02) ; trailing edge back to the flank
      GEO.wingIn = membrane([[0, 0.03], [0.22, 0.0], [0.2, -0.1], [0.12, -0.2], [0.05, -0.22], [0, -0.2]]);
      // outer wing (hand): wrist (0,0) → tip (0.28,-0.02); scalloped trailing edge between finger tips
      GEO.wingOut = membrane([[0, 0], [0.28, 0.03], [0.22, -0.08], [0.19, -0.05], [0.14, -0.17], [0.1, -0.12], [0.04, -0.2], [0, -0.1]]);
      GEO.fingers = [[0.28, 0.03], [0.22, -0.08], [0.14, -0.17], [0.04, -0.2]];
      // far silhouette: flat body diamond + two wing triangles (a few tris, fog-shaded)
      var sil = new THREE.BufferGeometry();
      sil.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0.35, 0.06, 0, 0, -0.06, 0, 0, 0.06, 0, 0, 0, 0, -0.5, -0.06, 0, 0,
        0.04, 0, 0.1, 0.5, 0, -0.05, 0.04, 0, -0.12, -0.04, 0, 0.1, -0.04, 0, -0.12, -0.5, 0, -0.05,
      ], 3));
      GEO.sil = track(sil);
      return GEO;
    }

    function makeMaterials(el) {
      var E = ELEMENTS[el];
      var body = track(new THREE.MeshStandardMaterial({ color: E.body, roughness: 0.55, metalness: el === 'steel' ? 0.75 : 0.2, emissive: E.glow, emissiveIntensity: el === 'fire' ? 0.18 : 0.05 }));
      var belly = track(new THREE.MeshStandardMaterial({ color: E.belly, roughness: 0.6, metalness: el === 'steel' ? 0.6 : 0.1 }));
      var mem = track(new THREE.MeshStandardMaterial({ color: E.membrane, roughness: 0.8, side: THREE.DoubleSide, transparent: el === 'void' || el === 'ice', opacity: el === 'void' || el === 'ice' ? 0.88 : 1, emissive: E.glow, emissiveIntensity: 0.07 }));
      var glow = track(new THREE.MeshBasicMaterial({ color: E.glow, toneMapped: false }));
      return { body: body, belly: belly, mem: mem, glow: glow };
    }

    // ── ProcRig: real split wings + neck chain + jaw + tail chain + legs ──
    function ProcRig(el) {
      var g = buildGeo(), M = makeMaterials(el), R = new THREE.Group();
      function mesh(geo, mat, parent) { var m = new THREE.Mesh(geo, mat); m.castShadow = false; parent.add(m); return m; }
      var torso = mesh(g.torso, M.body, R); var bellyM = mesh(g.torso, M.belly, R); bellyM.scale.set(0.8, 0.7, 0.92); bellyM.position.y = -0.012;
      for (var i = 0; i < 6; i++) { var sp = mesh(g.spike, M.body, R); sp.position.set(0, 0.055 - Math.abs(i - 2) * 0.003, 0.1 - i * 0.045); }
      // neck chain (3) → head → jaw
      var neck = [], parent = R, z0 = 0.14;
      for (var n = 0; n < 3; n++) { var ng = new THREE.Group(); ng.position.set(0, n === 0 ? 0.02 : 0, n === 0 ? z0 : 0.065); parent.add(ng); mesh(g.neckSeg, M.body, ng); var s2 = mesh(g.spike, M.body, ng); s2.position.set(0, 0.022, 0.03); neck.push(ng); parent = ng; }
      var head = new THREE.Group(); head.position.set(0, 0.005, 0.068); parent.add(head);
      mesh(g.head, M.body, head);
      var hl = mesh(g.horn, M.belly, head); hl.position.set(0.014, 0.02, 0.01); var hr = mesh(g.horn, M.belly, head); hr.position.set(-0.014, 0.02, 0.01);
      var el1 = mesh(g.eye, M.glow, head); el1.position.set(0.018, 0.01, 0.05); var er = mesh(g.eye, M.glow, head); er.position.set(-0.018, 0.01, 0.05);
      var jaw = new THREE.Group(); jaw.position.set(0, -0.012, 0.012); head.add(jaw); mesh(g.jaw, M.belly, jaw);
      var mouthGlow = mesh(g.eye, M.glow, head); mouthGlow.position.set(0, -0.008, 0.07); mouthGlow.scale.setScalar(1.6); mouthGlow.visible = false;
      // tail chain (5) + tip
      var tail = []; parent = R;
      for (var t = 0; t < 5; t++) { var tg = new THREE.Group(); tg.position.set(0, 0, t === 0 ? -0.165 : -0.088); parent.add(tg); var ts = mesh(g.tailSeg, M.body, tg); ts.scale.setScalar(1 - t * 0.14); ts.rotation.y = Math.PI; tail.push(tg); parent = tg; }
      var tip = mesh(g.tailTip, M.glow, parent); tip.position.z = -0.08;
      // wings
      function wing(side) {
        var root = new THREE.Group(); root.position.set(side * 0.04, 0.035, 0.07); root.scale.x = side; R.add(root);
        var arm = new THREE.Group(); root.add(arm);
        mesh(g.wingIn, M.mem, arm); var b1 = mesh(g.bone, M.body, arm); b1.scale.set(0.22, 1.2, 1.2); b1.rotation.y = 0.09;
        var hand = new THREE.Group(); hand.position.set(0.22, 0, -0.0); arm.add(hand);
        mesh(g.wingOut, M.mem, hand);
        g.fingers.forEach(function (fp) { var fb = mesh(g.bone, M.body, hand); var l = Math.hypot(fp[0], fp[1]); fb.scale.set(l, 0.7, 0.7); fb.rotation.y = Math.atan2(-fp[1], fp[0]); });
        return { root: root, arm: arm, hand: hand };
      }
      var wl = wing(1), wr = wing(-1);
      // legs (tucked in flight, down when standing)
      var legs = [[0.035, 0.08], [-0.035, 0.08], [0.04, -0.09], [-0.04, -0.09]].map(function (p) { var lg = new THREE.Group(); lg.position.set(p[0], -0.035, p[1]); R.add(lg); mesh(g.leg, M.body, lg); return lg; });
      this.root = R; this.mats = M;
      this.pose = function (p) {
        var fold = p.fold, glide = p.glide, amp = lerp(0.95, 0.12, glide) * (1 - fold), ph = p.flapPhase;
        [wl, wr].forEach(function (w) {
          w.arm.rotation.z = lerp(0.12, 0, glide) + amp * Math.sin(ph) + fold * 1.1;
          w.arm.rotation.y = fold * 1.0 - p.flapSweep * Math.cos(ph) * 0.15 * (1 - fold);
          w.hand.rotation.z = amp * 0.75 * Math.sin(ph - 0.9) - fold * 0.4;
          w.hand.rotation.y = fold * 2.3;
        });
        var hy = p.headYaw / 3, hp = p.headPitch / 3;
        for (var i = 0; i < neck.length; i++) { neck[i].rotation.y = hy + Math.sin(p.time * 1.3 + i) * 0.03; neck[i].rotation.x = -hp + p.bow * 0.32 + (i === 0 ? -p.neckRaise : 0); }
        head.rotation.x = -p.jaw * 0.12 + p.bow * 0.2;
        jaw.rotation.x = p.jaw * 0.65;
        mouthGlow.visible = p.jaw > 0.25 && (p.breathing || p.inhaling); mouthGlow.scale.setScalar(1.2 + p.jaw * 1.4);
        for (var k = 0; k < tail.length; k++) { tail[k].rotation.y = p.tailAmp * Math.sin(p.tailPhase - k * 0.75) + p.tailBank * 0.12; tail[k].rotation.x = p.tailLift * 0.08; }
        legs.forEach(function (lg, j) { lg.rotation.x = lerp(1.25, 0, p.legsDown) + (j > 1 ? 0.2 : -0.1) * (1 - p.legsDown); });
        torso.scale.y = 1.05 * (1 + p.breathe * 0.03);
      };
      this.setTint = function () {};
    }

    // ── ShaderRig: single static GLB mesh → vertex-shader wing flap / tail sway / head look / jaw ──
    var glbCache = {};
    function loadGLB(url, cb) {
      if (!opts.loader) return cb(null);
      if (glbCache[url]) { if (glbCache[url].ready) cb(glbCache[url].gltf); else glbCache[url].q.push(cb); return; }
      var c = glbCache[url] = { ready: false, q: [cb], gltf: null };
      opts.loader.load(url, function (g) { c.ready = true; c.gltf = g; c.q.forEach(function (f) { f(g); }); c.q = []; },
        undefined, function () { c.ready = true; c.q.forEach(function (f) { f(null); }); c.q = []; });
    }
    // bake a single-mesh GLB into Float32 geometry normalised to wingspan 1, +Z forward, centred
    var bakedCache = {};
    function bakeStatic(url, gltf) {
      if (bakedCache[url]) return bakedCache[url];
      var src = null; gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(function (o) { if (!src && o.isMesh) src = o; });
      if (!src) return null;
      // de-quantise FIRST (KHR_mesh_quantization int16/int8 normalised attributes would clamp under applyMatrix4)
      var geo = src.geometry.clone();
      var pos = geo.attributes.position, n = pos.count, arr = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) { arr[i * 3] = pos.getX(i); arr[i * 3 + 1] = pos.getY(i); arr[i * 3 + 2] = pos.getZ(i); }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      if (geo.attributes.normal) { var nn = geo.attributes.normal, na = new Float32Array(n * 3); for (var j = 0; j < n; j++) { na[j * 3] = nn.getX(j); na[j * 3 + 1] = nn.getY(j); na[j * 3 + 2] = nn.getZ(j); } geo.setAttribute('normal', new THREE.BufferAttribute(na, 3)); }
      geo.applyMatrix4(src.matrixWorld);
      var fix = tune.modelFix || { rx: 0, ry: 0, rz: 0 };
      if (fix.rx) geo.rotateX(fix.rx); if (fix.ry) geo.rotateY(fix.ry); if (fix.rz) geo.rotateZ(fix.rz);
      geo.computeBoundingBox(); var bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      geo.translate(-c.x, -c.y, -c.z); var s = 1 / Math.max(sz.x, 1e-6); geo.scale(s, s, s);
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      var b2 = geo.boundingBox;
      bakedCache[url] = { geo: track(geo), mat: src.material, zMin: b2.min.z, zMax: b2.max.z, yMin: b2.min.y, yMax: b2.max.y };
      return bakedCache[url];
    }
    function ShaderRig(baked, el) {
      var E = ELEMENTS[el], mat = baked.mat.clone(); track(mat);
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      var len = baked.zMax - baked.zMin;
      var U_ = { uFlap: { value: 0 }, uFlapLag: { value: 0 }, uBody: { value: 0.09 }, uTail: { value: 0 }, uTailStart: { value: baked.zMin + len * 0.38 }, uZMin: { value: baked.zMin }, uZMax: { value: baked.zMax },
        uNeck: { value: baked.zMax - len * 0.3 }, uHeadYaw: { value: 0 }, uHeadPitch: { value: 0 }, uJaw: { value: 0 }, uJawY: { value: lerp(baked.yMin, baked.yMax, 0.45) },
        uTint: { value: new THREE.Color(E.body).lerp(new THREE.Color(E.belly), 0.35) }, uTintAmt: { value: el === 'fire' ? 0 : 0.85 } };
      mat.onBeforeCompile = function (sh) {
        for (var k in U_) sh.uniforms[k] = U_[k];
        sh.vertexShader = 'uniform float uFlap,uFlapLag,uBody,uTail,uTailStart,uZMin,uZMax,uNeck,uHeadYaw,uHeadPitch,uJaw,uJawY;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
          'vec3 transformed = vec3(position);',
          'float ax = abs(transformed.x);',
          'if (ax > uBody) { float w = ax - uBody; float k = clamp(w / (0.5 - uBody), 0.0, 1.0);',
          '  float ang = uFlap * (0.35 + 0.65 * k) + uFlapLag * k * k; float s = sign(transformed.x);',
          '  float c = cos(ang), sn = sin(ang); float y0 = transformed.y;',
          '  transformed.x = s * (uBody + w * c - y0 * sn * 0.0); transformed.y = y0 + w * sn; }',
          'if (transformed.z < uTailStart) { float tk = (uTailStart - transformed.z) / max(uTailStart - uZMin, 1e-4);',
          '  transformed.x += sin(uTail - tk * 2.2) * tk * tk * 0.09; }',
          'if (transformed.z > uNeck) { float nk = (transformed.z - uNeck) / max(uZMax - uNeck, 1e-4);',
          '  vec2 p = vec2(transformed.x, transformed.z - uNeck); float a = uHeadYaw * nk;',
          '  transformed.x = p.x * cos(a) + p.y * sin(a); transformed.z = uNeck - p.x * sin(a) + p.y * cos(a);',
          '  transformed.y += (transformed.z - uNeck) * sin(uHeadPitch * nk);',
          '  if (nk > 0.55 && transformed.y < uJawY) transformed.y -= uJaw * (nk - 0.55) * 0.12; }',
        ].join('\n'));
        sh.fragmentShader = 'uniform vec3 uTint; uniform float uTintAmt;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n{ float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, lum * uTint * 2.2, uTintAmt); }');
      };
      mat.customProgramCacheKey = function () { return 'dragon-shader-rig'; };
      var m = new THREE.Mesh(baked.geo, mat); m.frustumCulled = false;
      var R = new THREE.Group(); R.add(m);
      this.root = R; this.mats = { body: mat };
      this.pose = function (p) {
        var amp = lerp(0.8, 0.1, p.glide) * (1 - p.fold);
        U_.uFlap.value = amp * Math.sin(p.flapPhase) + lerp(0.1, 0, p.glide) + p.fold * 0.9;
        U_.uFlapLag.value = amp * 0.6 * Math.sin(p.flapPhase - 0.9);
        U_.uTail.value = p.tailPhase; U_.uHeadYaw.value = p.headYaw; U_.uHeadPitch.value = p.headPitch - p.bow * 0.8; U_.uJaw.value = p.jaw;
      };
    }

    // ── BoneRig: skinned GLB (fal/Blender). Bone names: see docs/DRAGONS.md ──
    var BONE_RX = {
      wingL: /^(wing|upperwing|wing_upper|arm)[._ ]?(l|left)$|^(l|left)[._ ]?wing$|wing.*\.l$/i, wingR: /^(wing|upperwing|wing_upper|arm)[._ ]?(r|right)$|^(r|right)[._ ]?wing$|wing.*\.r$/i,
      tipL: /(wingtip|forewing|wing_?2|hand)[._ ]?(l|left)$|tip.*\.l$/i, tipR: /(wingtip|forewing|wing_?2|hand)[._ ]?(r|right)$|tip.*\.r$/i,
      head: /^head$|head$/i, jaw: /jaw/i, neck: /neck/i, tail: /tail/i,
    };
    function BoneRig(gltf, el) {
      // a skinned scene can have ONE parent: first dragon takes gltf.scene, others need opts.cloneSkinned (SkeletonUtils.clone)
      var sceneCopy = gltf._dragonUsed ? (opts.cloneSkinned ? opts.cloneSkinned(gltf.scene) : null) : gltf.scene;
      if (!sceneCopy) throw new Error('skinned dragon GLB shared by several dragons — pass opts.cloneSkinned (SkeletonUtils.clone)');
      gltf._dragonUsed = true;
      var R = new THREE.Group();
      R.add(sceneCopy);
      var box = new THREE.Box3().setFromObject(sceneCopy), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      var s = 1 / Math.max(sz.x, 1e-6); sceneCopy.scale.multiplyScalar(s); sceneCopy.position.sub(c.multiplyScalar(s));
      var bones = { neck: [], tail: [] }, bind = new Map();
      sceneCopy.traverse(function (o) {
        if (!o.isBone) return; bind.set(o, o.quaternion.clone());
        var n = o.name;
        ['wingL', 'wingR', 'tipL', 'tipR', 'jaw'].forEach(function (k) { if (!bones[k] && BONE_RX[k].test(n)) bones[k] = o; });
        if (!bones.head && BONE_RX.head.test(n) && !BONE_RX.jaw.test(n)) bones.head = o;
        if (BONE_RX.neck.test(n)) bones.neck.push(o); else if (BONE_RX.tail.test(n)) bones.tail.push(o);
        if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false;
      });
      var mixer = null, actions = {};
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(sceneCopy);
        gltf.animations.forEach(function (clip) { actions[clip.name.toLowerCase()] = mixer.clipAction(clip); });
      }
      // Weight-blended clips (fly / idle / walk / run all running, weights from clipWeights): no pops between take-off,
      // cruise, glide, landing and standing. Bones the clips animate get procedural look-at ADDED on top of the clip pose;
      // bones no clip touches are posed from their bind pose (so nothing accumulates frame to frame).
      var CLIP_ALIASES = { fly: ['fly', 'flying', 'flap', 'hover'], idle: ['idle', 'perch', 'stand'], walk: ['walk'], run: ['run'], glide: ['glide'] };
      var slots = {}, animated = new Set();
      if (mixer) {
        Object.keys(CLIP_ALIASES).forEach(function (k) { var al = CLIP_ALIASES[k]; for (var i = 0; i < al.length; i++) if (actions[al[i]]) { slots[k] = actions[al[i]]; break; } });
        Object.keys(slots).forEach(function (k) { var a = slots[k]; a.enabled = true; a.setEffectiveWeight(0); a.play(); });
        gltf.animations.forEach(function (clip) { clip.tracks.forEach(function (t) { animated.add(t.name.split('.')[0]); }); });
      }
      var hasFlyClip = !!(slots.fly || slots.glide), W = { fly: 0, glide: 0, idle: 0, walk: 0, run: 0, flyScale: 1, walkScale: 1 };
      var q = new THREE.Quaternion(), e = new THREE.Euler();
      function rot(b, x, y, z) { if (!b) return; e.set(x, y, z); q.setFromEuler(e); if (hasFlyClip && animated.has(b.name)) b.quaternion.multiply(q); else b.quaternion.copy(bind.get(b)).multiply(q); }
      this.root = R; this.mats = {};
      this.hasClips = !!mixer;
      this.pose = function (p, dt) {
        var usedClip = false;
        if (mixer && hasFlyClip) {
          clipWeights(p, W, !!slots.glide, !!slots.walk, !!slots.run, !!slots.idle);
          for (var k in slots) slots[k].setEffectiveWeight(W[k] || 0);
          if (slots.fly) slots.fly.timeScale = W.flyScale;
          if (slots.glide) slots.glide.timeScale = 1;
          if (slots.walk) slots.walk.timeScale = W.walkScale;
          if (slots.run) slots.run.timeScale = W.walkScale;
          mixer.update(dt); usedClip = true;
        }
        if (!usedClip) {
          var amp = lerp(0.9, 0.12, p.glide) * (1 - p.fold);
          rot(bones.wingL, 0, 0, amp * Math.sin(p.flapPhase) + p.fold * 1.1); rot(bones.wingR, 0, 0, -(amp * Math.sin(p.flapPhase) + p.fold * 1.1));
          rot(bones.tipL, 0, 0, amp * 0.7 * Math.sin(p.flapPhase - 0.9)); rot(bones.tipR, 0, 0, -amp * 0.7 * Math.sin(p.flapPhase - 0.9));
          bones.tail.forEach(function (b, i) { rot(b, 0, p.tailAmp * Math.sin(p.tailPhase - i * 0.75), 0); });
        }
        var nn = Math.max(1, bones.neck.length);
        bones.neck.forEach(function (b) { rot(b, -p.headPitch / nn + p.bow * 0.3, p.headYaw / nn, 0); });
        rot(bones.head, -p.headPitch * 0.3, p.headYaw * 0.3, 0);
        rot(bones.jaw, p.jaw * 0.6, 0, 0);
      };
    }

    // ── breath particles (GPU points, pooled) ──
    var PMAX = 400;
    var particleVS = [
      'attribute float aSize; attribute float aAlpha; attribute float aHeat; varying float vAlpha; varying float vHeat;',
      'uniform float uScale;',
      'void main(){ vAlpha = aAlpha; vHeat = aHeat; vec4 mv = modelViewMatrix * vec4(position,1.0);',
      '  gl_PointSize = aSize * uScale / max(-mv.z, 1.0); gl_Position = projectionMatrix * mv; }'].join('\n');
    var particleFS = [
      'uniform vec3 uA; uniform vec3 uB; uniform float uShape; varying float vAlpha; varying float vHeat;',
      'void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); float a;',
      '  if (uShape < 0.5) a = smoothstep(1.0, 0.0, r);',                                    // soft (fire, sand, smoke, spray)
      '  else if (uShape < 1.5) a = step(abs(p.x) + abs(p.y), 1.0) * (1.0 - 0.5 * r);',       // shard / blade diamond
      '  else a = smoothstep(0.25, 0.0, abs(r - 0.65)) + 0.3 * smoothstep(1.0, 0.0, r);',     // arcane ring
      '  if (a * vAlpha < 0.01) discard; vec3 col = mix(uB, uA, vHeat); gl_FragColor = vec4(col, a * vAlpha); }'].join('\n');
    var STYLE = {
      fire:   { speed: 30, spread: 0.16, s0: 1.0, s1: 5.0, life: 1.0, grav: 3.0, shape: 0, rate: 190 },
      ice:    { speed: 38, spread: 0.11, s0: 0.7, s1: 1.8, life: 0.9, grav: -2.0, shape: 1, rate: 170 },
      sand:   { speed: 30, spread: 0.2,  s0: 0.6, s1: 2.6, life: 1.1, grav: -9.8, shape: 0, rate: 200 },
      thorns: { speed: 34, spread: 0.13, s0: 0.9, s1: 2.0, life: 1.0, grav: -1.0, shape: 1, rate: 150 },
      swirl:  { speed: 26, spread: 0.18, s0: 1.2, s1: 4.2, life: 1.3, grav: 0.5, shape: 2, rate: 140, swirl: 6 },
      smoke:  { speed: 24, spread: 0.24, s0: 1.6, s1: 6.5, life: 1.4, grav: 1.0, shape: 0, rate: 150 },
      blades: { speed: 46, spread: 0.09, s0: 0.8, s1: 1.2, life: 0.75, grav: 0, shape: 1, rate: 150 },
      spray:  { speed: 34, spread: 0.2,  s0: 0.6, s1: 2.8, life: 1.0, grav: -6.0, shape: 0, rate: 190 },
    };
    function Breath(el) {
      var E = ELEMENTS[el], st = STYLE[E.style] || STYLE.fire;
      var geo = track(new THREE.BufferGeometry());
      var pos = new Float32Array(PMAX * 3), size = new Float32Array(PMAX), alpha = new Float32Array(PMAX), heat = new Float32Array(PMAX);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage));
      var mat = track(new THREE.ShaderMaterial({
        uniforms: { uA: { value: new THREE.Color(E.breathA) }, uB: { value: new THREE.Color(E.breathB) }, uShape: { value: st.shape }, uScale: { value: 600 } },
        vertexShader: particleVS, fragmentShader: particleFS, transparent: true, depthWrite: false,
        blending: E.blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
      var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.visible = false; group.add(pts);
      var P = []; for (var i = 0; i < PMAX; i++) P.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 1, alive: false, sw: 0 });
      var cursor = 0, acc = 0, live = 0, decalAcc = 0, self = this; this.live = 0;
      this.update = function (dt, emitting, mouth, axis, onGround) {
        if (emitting && mouth && axis) {
          acc += st.rate * dt;
          while (acc >= 1) {
            acc -= 1; var p = P[cursor]; cursor = (cursor + 1) % PMAX;
            var jx = (Math.random() - 0.5) * 2 * st.spread, jy = (Math.random() - 0.5) * 2 * st.spread, jz = (Math.random() - 0.5) * 2 * st.spread;
            var sp = st.speed * (0.8 + Math.random() * 0.4) * U;
            p.vx = (axis.x + jx) * sp; p.vy = (axis.y + jy) * sp; p.vz = (axis.z + jz) * sp;
            p.x = mouth.x; p.y = mouth.y; p.z = mouth.z; p.age = 0; p.life = st.life * (0.8 + Math.random() * 0.4); p.alive = true; p.sw = Math.random() * 6.28;
          }
        }
        live = 0; decalAcc += dt;
        for (var k = 0; k < PMAX; k++) {
          var q = P[k];
          if (!q.alive) { alpha[k] = 0; size[k] = 0; continue; }
          q.age += dt; if (q.age >= q.life) { q.alive = false; alpha[k] = 0; size[k] = 0; continue; }
          live++;
          var t = q.age / q.life;
          q.vy += st.grav * U * dt; q.vx *= (1 - 0.6 * dt); q.vz *= (1 - 0.6 * dt); q.vy *= (1 - 0.3 * dt);
          q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
          if (st.swirl) { q.x += Math.cos(q.sw + t * st.swirl) * 0.8 * U * dt * 3; q.z += Math.sin(q.sw + t * st.swirl) * 0.8 * U * dt * 3; }
          if ((k & 3) === 0) {   // ground contact → scorch decal (rate-limited) + stop
            var gy = heightAt(q.x, q.z);
            if (q.y < gy + 0.4 * U) { q.y = gy + 0.4 * U; q.vy = Math.abs(q.vy) * 0.1; q.vx *= 0.5; q.vz *= 0.5; if (decalAcc > 0.12 && onGround) { decalAcc = 0; onGround(q.x, q.z); } }
          }
          pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z;
          size[k] = lerp(st.s0, st.s1, t) * U; alpha[k] = (1 - t) * Math.min(1, t * 8); heat[k] = 1 - t;
        }
        pts.visible = live > 0; self.live = live;
        if (live > 0 || emitting) { geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aHeat.needsUpdate = true; }
      };
      this.setScale = function (s) { mat.uniforms.uScale.value = s; };
      this.dispose = function () { group.remove(pts); };
    }

    // ── scorch decals: one InstancedMesh shared by every dragon ──
    var DMAX = 96;
    var decalGeo = track(new THREE.PlaneGeometry(1, 1)); decalGeo.rotateX(-Math.PI / 2);
    var dCol = new Float32Array(DMAX * 3), dFade = new Float32Array(DMAX);
    decalGeo.setAttribute('aCol', new THREE.InstancedBufferAttribute(dCol, 3).setUsage(THREE.DynamicDrawUsage));
    decalGeo.setAttribute('aFade', new THREE.InstancedBufferAttribute(dFade, 1).setUsage(THREE.DynamicDrawUsage));
    var decalMat = track(new THREE.ShaderMaterial({
      vertexShader: 'attribute vec3 aCol; attribute float aFade; varying vec3 vCol; varying float vFade; varying vec2 vUv; void main(){ vCol=aCol; vFade=aFade; vUv=uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vCol; varying float vFade; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); } void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float n = h(floor(vUv*9.0)); float a = smoothstep(1.0, 0.35 + 0.25*n, r) * vFade * 0.85; if (a < 0.01) discard; gl_FragColor = vec4(vCol, a); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    var decals = new THREE.InstancedMesh(decalGeo, decalMat, DMAX); decals.frustumCulled = false; decals.count = DMAX; group.add(decals);
    var dLife = new Float32Array(DMAX), dMax = new Float32Array(DMAX), dCursor = 0, _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
    for (var di = 0; di < DMAX; di++) { _m4.makeScale(0, 0, 0); decals.setMatrixAt(di, _m4); }
    function addDecal(x, z, color, sizeM) {
      var i = dCursor; dCursor = (dCursor + 1) % DMAX;
      var e = 1.5 * U, hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e);
      _n.set(-hx, 2 * e, -hz).normalize(); _q.setFromUnitVectors(_up, _n);
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, Math.random() * 6.28));
      var s = sizeM * U * (0.7 + Math.random() * 0.6);
      _m4.compose(_v.set(x, heightAt(x, z) + 0.15 * U, z), _q, _s.set(s, 1, s)); decals.setMatrixAt(i, _m4);
      var c = new THREE.Color(color); dCol[i * 3] = c.r; dCol[i * 3 + 1] = c.g; dCol[i * 3 + 2] = c.b; dLife[i] = dMax[i] = 9;
      decals.instanceMatrix.needsUpdate = true; decalGeo.attributes.aCol.needsUpdate = true;
    }
    function updateDecals(dt) {
      var any = false;
      for (var i = 0; i < DMAX; i++) if (dLife[i] > 0) { dLife[i] -= dt; dFade[i] = Math.max(0, dLife[i] / dMax[i]); any = true; if (dLife[i] <= 0) { _m4.makeScale(0, 0, 0); decals.setMatrixAt(i, _m4); decals.instanceMatrix.needsUpdate = true; } }
      if (any) decalGeo.attributes.aFade.needsUpdate = true;
    }

    // ── ground telegraph marker (swoop shadow / stomp ring). Max one attacker → one marker. ──
    var tgGroup = new THREE.Group(); tgGroup.visible = false; group.add(tgGroup);
    var tgShadow = new THREE.Mesh(track(new THREE.CircleGeometry(1, 32)), track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })));
    tgShadow.rotation.x = -Math.PI / 2; tgGroup.add(tgShadow);
    var tgRing = new THREE.Mesh(track(new THREE.RingGeometry(0.92, 1, 48)), track(new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false })));
    tgRing.rotation.x = -Math.PI / 2; tgRing.position.y = 0.05; tgGroup.add(tgRing);
    var dropShadow = new THREE.Mesh(tgShadow.geometry, track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })));
    dropShadow.rotation.x = -Math.PI / 2; dropShadow.visible = false; group.add(dropShadow);

    // ── per-dragon visual state ──
    var silMat = track(new THREE.MeshBasicMaterial({ color: 0x07080c, side: THREE.DoubleSide, fog: true }));
    var V = core.dragons.map(function (d) {
      var holder = new THREE.Group(); holder.name = 'dragon-' + d.id; holder.rotation.order = 'YXZ'; group.add(holder);
      var rig = new ProcRig(d.element); holder.add(rig.root);
      var sil = new THREE.Mesh(buildGeo().sil, silMat); sil.visible = false; holder.add(sil);
      holder.scale.setScalar(d.wingspan * U);
      var v = { d: d, holder: holder, rig: rig, sil: sil, breath: new Breath(d.element), flapPhase: Math.random() * 6, tailPhase: 0, headYaw: 0, headPitch: 0, fold: 1, legs: 1, glide: 0, groundMove: 0, lastYaw: d.f.yaw, lastX: d.f.x, lastZ: d.f.z };
      var url = opts.modelFor ? opts.modelFor(d.id, d) : null;
      if (url) loadGLB(url, function (gltf) {
        if (!gltf || disposed) return;
        var rig2 = null, skinned = false;
        gltf.scene.traverse(function (o) { if (o.isSkinnedMesh) skinned = true; });
        try { rig2 = skinned ? new BoneRig(gltf, d.element) : (function () { var b = bakeStatic(url, gltf); return b ? new ShaderRig(b, d.element) : null; })(); } catch (e) { if (root.console) console.warn('[dragons] model rig failed, keeping procedural:', e && e.message); }
        if (!rig2) return;
        holder.remove(v.rig.root); holder.add(rig2.root); v.rig = rig2;
      });
      return v;
    });
    var disposed = false;

    var _pl = new THREE.Vector3();
    function update(dt) {
      if (disposed) return;
      dt = Math.min(dt || 0, 0.1); clock += dt;
      core.update(dt);
      var P = opts.getPlayer ? opts.getPlayer() : null;
      var cam = opts.camera || null;
      if (cam && cam.projectionMatrix) { var sc = (root.innerHeight || 800) * 0.5 * cam.projectionMatrix.elements[5]; V.forEach(function (v) { v.breath.setScale(sc); }); }
      var tgShown = false, dsShown = false;
      for (var i = 0; i < V.length; i++) {
        var v = V[i], d = v.d, f = d.f;
        v.holder.visible = !d.ridden;            // the ride module draws a ridden dragon
        if (d.ridden) continue;
        v.holder.position.set(f.x, f.y, f.z);
        v.holder.rotation.set(-f.pitch, f.yaw, -f.bank, 'YXZ');
        var far = d.lod === 'far';
        v.rig.root.visible = !far; v.sil.visible = far;
        if (!far) {
          // animation drivers
          var ground = f.mode === 'ground', hover = f.mode === 'hover';
          // ground locomotion (turn-in-place / ground slide) → walk/run clip weight
          var gmv = ground && dt > 0 ? Math.min(1, Math.abs(wrapPi(f.yaw - v.lastYaw)) / dt / 0.9 + hyp2(f.x - v.lastX, f.z - v.lastZ) / U / dt / 8) : 0;
          v.groundMove = approach(v.groundMove, gmv, dt * 3); v.lastYaw = f.yaw; v.lastX = f.x; v.lastZ = f.z;
          v.fold = approach(v.fold, ground ? 1 : 0, dt * (ground ? 1.2 : 2.5));
          v.legs = approach(v.legs, ground || (hover && f.vy < 0) ? 1 : 0, dt * 2);
          v.glide = approach(v.glide, ground ? 0 : hover ? 0 : f.flap < 0.3 ? 1 : 0, dt * 1.5);
          var freq = ground ? 0 : hover ? 2.6 : lerp(1.0, 2.3, f.flap);
          v.flapPhase += freq * 2 * Math.PI * dt;
          v.tailPhase += dt * (ground ? 1.2 : 2.2);
          // head look-at the player (body-relative, clamped, smoothed)
          var hyT = 0, hpT = 0;
          if (P && P.pos && d.distToPlayer < 400 && !(d.defeated && d.state !== 'bow')) {
            var dx = P.pos.x - f.x, dz = P.pos.z - f.z, dy = (P.pos.y || 0) - f.y;
            hyT = clamp(wrapPi(Math.atan2(dx, dz) - f.yaw), -1.0, 1.0);
            hpT = clamp(Math.atan2(dy, hyp2(dx, dz)) - f.pitch, -0.8, 0.5);
          }
          v.headYaw = approach(v.headYaw, hyT, dt * 1.8); v.headPitch = approach(v.headPitch, hpT, dt * 1.5);
          v.rig.pose({ time: clock, flapPhase: v.flapPhase, flapSweep: 1, flapEffort: f.flap, glide: v.glide, fold: v.fold, legsDown: v.legs,
            tailPhase: v.tailPhase, tailAmp: ground ? 0.12 : 0.22, tailBank: f.bank, tailLift: -f.pitch,
            headYaw: v.headYaw, headPitch: v.headPitch, neckRaise: d.state === 'alert' || (d.telegraph && d.telegraph.kind === 'roar') ? 0.35 : 0,
            jaw: d.jaw, bow: d.bow, breathe: ground ? Math.sin(clock * 1.6 + i) : 0, breathing: d.breathing, inhaling: d.inhaling, groundMove: v.groundMove, hover: hover ? 1 : 0 }, dt);
        }
        // breath VFX (only the active dragon ever emits; cheap no-op otherwise)
        var emitting = d.breathing && !far;
        if (emitting || v.breath.live > 0) {
          var mouth = d.mouth || null, axis = d.coneAxis || null;
          if (emitting && !mouth) mouth = mouthPos(d);
          v.breath.update(dt, emitting, mouth, axis, function (x, z) { addDecal(x, z, ELEMENTS[d.element].scorch, 4); });
        }
        // ground telegraph + drop shadow for the active attacker
        if (d.telegraph && d.telegraph.pos && core.attacker === d.id || (d.telegraph && d.state === 'alert')) {
          var T = d.telegraph, prog = clamp((core.time() - T.start) / T.dur, 0, 1), r = Math.max(T.radius, 3) * U;
          var tp = T.pos || { x: f.x, z: f.z };
          tgGroup.position.set(tp.x, heightAt(tp.x, tp.z) + 0.3 * U, tp.z);
          tgShadow.scale.setScalar(r * (T.kind === 'swoop' ? lerp(0.2, 1.3, prog) : prog));
          tgShadow.material.opacity = T.kind === 'swoop' ? lerp(0.15, 0.6, prog) : 0.25;
          tgRing.scale.setScalar(r); tgRing.material.color.setHex(T.kind === 'breath' ? ELEMENTS[d.element].glow : 0xff3a2a);
          tgRing.material.opacity = 0.5 + 0.4 * Math.sin(clock * 18);
          tgShown = true;
        }
        if (d.atk && d.atk.kind === 'swoop' && (d.atk.phase === 'dive' || d.atk.phase === 'telegraph') && !far) {
          var gh = heightAt(f.x, f.z), alt = (f.y - gh) / U;
          dropShadow.position.set(f.x, gh + 0.25 * U, f.z); dropShadow.scale.setScalar(d.wingspan * 0.5 * U * clamp(1.4 - alt / 120, 0.4, 1.3));
          dropShadow.material.opacity = clamp(0.6 - alt / 200, 0.12, 0.55); dsShown = true;
        }
      }
      tgGroup.visible = tgShown; dropShadow.visible = dsShown;
      updateDecals(dt);
    }

    // ── player → dragon hit helpers: pure versions live in the core (core.hitTest / core.meleeHit) ──
    var hitTest = core.hitTest, meleeHit = core.meleeHit;
    function isOpen(stationId) { var d = null; core.dragons.forEach(function (x) { if (x.station === stationId) d = x; }); return !d || d.defeated; }

    function dispose() {
      disposed = true;
      V.forEach(function (v) { v.breath.dispose(); });
      scene.remove(group);
      disposables.forEach(function (o) { try { o.dispose && o.dispose(); } catch (e) {} });
      try { if (root.__worldDragons === api) delete root.__worldDragons; } catch (e) {}
    }

    var api = {
      group: group, core: core, dragons: core.dragons, tune: tune, elements: ELEMENTS,
      update: update, damage: core.damage, hitTest: hitTest, meleeHit: meleeHit, isOpen: isOpen,
      on: core.on, off: core.off, stats: core.stats, dispose: dispose,
      forceAttack: core._forceAttack, setPlayerInvulnerable: core.setPlayerInvulnerable,
    };
    try { root.__worldDragons = api; } catch (e) {}
    return api;
  }

  var EXPORTS = { TUNE: TUNE, ELEMENTS: ELEMENTS, COLOR_TO_ELEMENT: COLOR_TO_ELEMENT, U: U, createFlight: createFlight, stepFlight: stepFlight,
    createDragonsCore: createDragonsCore, clipWeights: clipWeights, inCone: inCone, mouthPos: mouthPos, forwardVec: forwardVec, lookAheadFloor: lookAheadFloor, buildWorldDragons: buildWorldDragons };
  if (typeof module !== 'undefined' && module.exports) module.exports = EXPORTS;
  if (typeof window !== 'undefined') { window.buildWorldDragons = buildWorldDragons; window.WorldDragons = EXPORTS; }
})(typeof window !== 'undefined' ? window : globalThis);
