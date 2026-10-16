/* world-race.js — HOVERSKATE RACE RULES (circuits, gates, laps, timing/penalties, capped trick bonus, ram damage, item crates, ranked rules).
 * Pure logic (no THREE) + a small track-ribbon builder. The park/track GEOMETRY plugs in by giving gates positions; nothing here fixes a location.
 *   var race = WorldRace.create(circuit, { ranked, riders:[{id,name,deck}], rng })
 *   race.start() · race.update(dt) · race.passGate(riderId, gateIdx, {mode:'pad'|'foil', altM, kissed, trick?:{verb,clean}}) · race.wash(id) · race.lavaTouch(id)
 *   race.ram(a, b, closing) · race.grabCrate(id) · race.useItem(id, target?) · race.standings() · race.finished()
 *   WorldRace.CIRCUITS  Plaza Cup / Spine Cup / Forum Grand / Rift Cut (Prime) — gate lists are data; positions filled by the park builder.
 * Rules (owner's Hoverskate bank): score = time + capped trick bonus (max 8% of a clean run) - wash 1.2 s - missed pad gate 0.8 s - lava touch = DNF.
 *   Gate types: pad (must be under 1 m) · foil (must be in foil) · either · trick (pass + land a listed verb for bonus tenths) · kiss (skim a rail then foil).
 *   HP 100; ram = closing*0.55 impulse, damage lerp(8,18,closing/20), x1.25 if boosting; wall ram = 6 self damage; shell 22; hp<=0 -> respawn at last checkpoint, 1.4 s freeze, item cleared, foil energy 40%.
 *   Ranked heats: NO Pad Rush / Foil Sip / pocket vials (only on-track pads + crates). Deck classes change noseWeight/stability/pop/energy only (never speed/thrust/magnet).
 */
(function (root) {
  'use strict';
  var TUNE = { washS: 1.2, missPadS: 0.8, trickCapPct: 0.08, trickTenth: 0.1, ramDmgMin: 8, ramDmgMax: 18, ramBoostMul: 1.25, wallDmg: 6, shellDmg: 22, respawnFreezeS: 1.4, hitGraceS: 1.2, respawnEnergy: 0.4, padGateMaxAlt: 1.0, hp: 100, maxRiders: 8 };
  var ITEMS = [
    { id: 'boost', name: 'Overclock', weight: 24, dur: 1.6 }, { id: 'shell', name: 'Laser Bolt', weight: 20, dmg: 22, homing: 'lite' }, { id: 'wave', name: 'EMP Pulse', weight: 12, knock: true },
    { id: 'ink', name: 'Static Veil', weight: 12, dur: 2.5 }, { id: 'ward', name: 'Aegis Field', weight: 12 }, { id: 'yank', name: 'Data Siphon', weight: 6, range: 12 },
    { id: 'sway', name: 'Jam Signal', weight: 6, dur: 2 }, { id: 'pinch', name: 'Gravity Snare', weight: 3, dur: 1.2 }, { id: 'triple', name: 'Triple Laser', weight: 3 }, { id: 'blue', name: 'Orbital Lance', weight: 1, primeOnly: true }, { id: 'seeker', name: 'Lock-On Drone', weight: 0, dmg: 30 },
    // 2026-10-11 prize-box additions: Mag Mine (dropped behind), Phase Shift (3 s untouchable), Chrono Field (slows everyone within 140 m), Warp Jump (blink 110 m up the course, never past the next gate)
    { id: 'mine', name: 'Mag Mine', weight: 8, dmg: 14 }, { id: 'phase', name: 'Phase Shift', weight: 6, dur: 3 }, { id: 'chrono', name: 'Chrono Field', weight: 4, dur: 3.5 }, { id: 'warp', name: 'Warp Jump', weight: 4, range: 110 }
  ];
  var POCKET = ['pad-rush', 'foil-sip'];
  /* RANK-WEIGHTED ODDS (owner 2026-10-02; NOT a Mario Kart clone: agentic hover-laser racing): the further back you are, the better your crate. t = 0 leader .. 1 last.
   * Leaders get defence + attacks (aegis, laser, EMP); the back of the pack gets boosts, triples and the LOCK-ON DRONE (only from the lower half), which homes on FIRST place. Orbital Lance stays Prime-only. */
  function itemWeights(place, n, prime) {
    var t = n > 1 ? Math.max(0, Math.min(1, (place - 1) / (n - 1))) : 0;
    return { boost: 18 + 26 * t, shell: 24 - 10 * t, wave: 12 - 3 * t, ink: 14 - 10 * t, ward: 14 - 8 * t, yank: 6, sway: 6, pinch: 3 + 3 * t, triple: 2 + 12 * t, seeker: t >= 0.5 ? (t - 0.4) * 28 : 0, blue: prime ? 1 + 8 * t : 0, mine: 11 - 7 * t, phase: 9 - 5 * t, chrono: 1 + 9 * t, warp: 1 + 8 * t };
  }
  /* DRIFT: hold the drift key while turning hard at speed -> charge; release for a MINI-TURBO. Levels: blue 0.9 s (x1.25 for 0.8 s), orange 1.8 s (x1.35 for 1.2 s), purple 2.8 s (x1.5 for 1.8 s).
   * S = {active, dir, charge, level}; c = {drift, speed (m/s), yawRate (rad/s)} -> { released:{level,mul,dur}|null, level, active } */
  var DRIFT = { minMS: 12, minYaw: 0.6, levels: [[0.9, 1.25, 0.8], [1.8, 1.35, 1.2], [2.8, 1.5, 1.8]], turnIn: 1.35, turnOut: 0.7 };
  function levelOf(charge) { var L = 0; for (var i = 0; i < DRIFT.levels.length; i++) if (charge >= DRIFT.levels[i][0]) L = i + 1; return L; }
  function driftStep(S, dt, c) {
    var out = { released: null, level: S.level || 0, active: !!S.active };
    if (!S.active) {
      if (c.drift && c.speed >= DRIFT.minMS && Math.abs(c.yawRate) >= DRIFT.minYaw) { S.active = true; S.dir = c.yawRate > 0 ? 1 : -1; S.charge = 0; S.level = 0; out.active = true; }
      return out;
    }
    var dirNow = c.yawRate > 0.15 ? 1 : (c.yawRate < -0.15 ? -1 : S.dir);
    if (!c.drift || c.speed < DRIFT.minMS * 0.7) {   // release (or lost speed): pay out the mini-turbo
      var L = levelOf(S.charge), lv = L ? DRIFT.levels[L - 1] : null; S.active = false; S.charge = 0; S.level = 0; out.active = false; out.level = 0; if (lv) out.released = { level: L, mul: lv[1], dur: lv[2] }; return out;
    }
    if (dirNow !== S.dir) { S.dir = dirNow; S.charge = Math.max(0, S.charge - 0.6); }   // swerving the other way bleeds the charge
    S.charge += dt * (Math.abs(c.yawRate) > 0.4 ? 1 : 0.35); S.level = levelOf(S.charge); out.level = S.level; return out;
  }
  /* SLIPSTREAM: sit behind another rider (within rangeM, inside a coneDeg cone of THEIR travel direction) and you are in their wake. me = {x,z,yaw}; others = [{id,x,z,yaw}] */
  var SLIP = { rangeM: 16, coneDeg: 16, afterS: 1.0, mul: 1.12, decayK: 2 };
  function slipstream(me, others, U) {
    var best = null, bd = SLIP.rangeM * U, fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), cosMin = Math.cos(SLIP.coneDeg * Math.PI / 180);
    for (var i = 0; i < others.length; i++) { var o = others[i], dx = o.x - me.x, dz = o.z - me.z, d = Math.hypot(dx, dz); if (d < 1e-6 || d > bd) continue; if ((dx * fx + dz * fz) / d < cosMin) continue; var ofx = Math.sin(o.yaw || 0), ofz = Math.cos(o.yaw || 0); if (ofx * fx + ofz * fz < 0.7) continue; bd = d; best = { id: o.id, dist: d }; }
    return best;
  }

  var CIRCUITS = {
    'plaza-cup': { id: 'plaza-cup', name: 'Plaza Cup', laps: 3, cleanLapS: 62, rooms: ['pad', 'banks', 'plaza', 'pool'], gates: [{ kind: 'pad' }, { kind: 'pad' }, { kind: 'trick', verb: 'flip' }, { kind: 'pad' }, { kind: 'pad', skip: 'water' }, { kind: 'either' }, { kind: 'pad' }, { kind: 'pad' }], prime: false },
    'spine-cup': { id: 'spine-cup', name: 'Spine Cup', laps: 3, cleanLapS: 70, rooms: ['banks', 'spine', 'plaza'], gates: [{ kind: 'pad' }, { kind: 'kiss' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'kiss' }, { kind: 'either' }, { kind: 'trick', verb: 'grind' }, { kind: 'pad' }, { kind: 'foil' }], prime: false },
    'forum-grand': { id: 'forum-grand', name: 'Forum Grand', laps: 3, cleanLapS: 84, rooms: ['forum', 'plaza', 'pool', 'spine'], gates: [{ kind: 'pad' }, { kind: 'foil' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'pad' }, { kind: 'either' }, { kind: 'trick', verb: 'spin' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'kiss' }, { kind: 'foil' }, { kind: 'pad' }], prime: false },
    'rift-cut': { id: 'rift-cut', name: 'Rift Cut', laps: 2, cleanLapS: 78, rooms: ['forum', 'rift'], gates: [{ kind: 'pad' }, { kind: 'foil' }, { kind: 'either', rift: true }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'trick', verb: 'flip' }, { kind: 'foil' }, { kind: 'pad' }], prime: true, sleepSprayBanned: true, lavaKill: true }
  };

  /* CITY-SCALE CIRCUITS (owner 2026-09-29): Quarter Loop = the mini race around the grey NW petal (park + shops in the infield), Grid Ring = the WHOLE circle (outer ring road r 1600 m,
   * CP_00..07 every 45 deg from the north start gate, counter-clockwise), Train Ring = the map-wide race around the maglev ring (r 2829 m). Park cups (above) run INSIDE the park. */
  CIRCUITS['quarter-loop'] = { id: 'quarter-loop', name: 'Quarter Loop', scale: 'quarter', laps: 2, cleanLapS: 300, rooms: ['quarter'], lengthM: 4430, prime: false, gates: [{ kind: 'pad' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'trick', verb: 'flip' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'kiss' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }] };
  CIRCUITS['grid-ring'] = { id: 'grid-ring', name: 'Grid Ring', scale: 'grid', laps: 1, cleanLapS: 620, rooms: ['grid'], lengthM: 10053, prime: false, gates: [{ kind: 'pad' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'either' }, { kind: 'pad' }, { kind: 'foil' }, { kind: 'either' }, { kind: 'pad' }] };
  CIRCUITS['train-ring'] = { id: 'train-ring', name: 'Train Ring (map-wide)', scale: 'train', laps: 1, cleanLapS: 1100, rooms: ['ring'], lengthM: 17775, prime: false, openWorld: true, gates: [{ kind: 'either' }, { kind: 'foil' }, { kind: 'either' }, { kind: 'pad' }, { kind: 'foil' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'either' }, { kind: 'pad' }, { kind: 'foil' }, { kind: 'either' }, { kind: 'foil' }] };
  /* DRAGON GATE CIRCUIT (owner refs 2026-10-01: torii start gate, figure-8 crossing, lantern posts, cones): a lemniscate (figure-8) a = 300 m centred 2100 m east / 300 m south of the Grid.
   * The two lobes cross in the middle (a junction: gates are sequential by index so the crossing cannot be used as a shortcut). Chosen from the real heightmap: land all round, relief < 12 m, water within reach. */
  var DG = { cx: 2100, cn: -300, a: 300 };
  CIRCUITS['dragon-gate'] = { id: 'dragon-gate', name: 'Dragon Gate Circuit', scale: 'quarter', laps: 3, cleanLapS: 105, rooms: ['dragon'], lengthM: 1570, prime: false, torii: true, gates: [{ kind: 'pad' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'trick', verb: 'flip' }, { kind: 'either' }, { kind: 'pad' }, { kind: 'foil' }, { kind: 'either' }, { kind: 'pad' }] };
  // MERIDIAN FIGURE-8 (2026-10-10): one lemniscate across the whole Grid. Searched on grid-city-v4.json tops: corridor max 207 m (clears all 270-320 m spires
  // under the 250 m deck cap), crossing in open air (flyover lift handles the overpass), 236 m off the core spire, stays inside r1500, ~7.2 km.
  var M8 = { cx: -332.5, cn: 201.9, a: 1365.2, rot: 67.8 };
  CIRCUITS['meridian-8'] = { id: 'meridian-8', name: 'Meridian Figure-8', scale: 'grid', laps: 2, cleanLapS: 300, rooms: ['grid'], lengthM: 7158, prime: false, gates: [{ kind: 'pad' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'trick', verb: 'flip' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'kiss' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }] };
  // TWIN (owner 2026-10-10: second figure-8 for perfect symmetry): the same lemniscate rotated 180 deg about the Grid centre. Corridor max 219 m, nothing over the 250 m cap,
  // crosses the first 8 four times (+-150,+-445 / +-472,+-1055); the track builder keeps it >= 16 m over the first 8's deck (overpassOf) so every crossing is an overpass. A mirror across the N-S axis was rejected (clips a 294 m spire).
  var M8B = { cx: 332.5, cn: -201.9, a: 1365.2, rot: 67.8 };
  CIRCUITS['meridian-8b'] = { id: 'meridian-8b', name: 'Meridian Figure-8 (Twin)', scale: 'grid', laps: 2, cleanLapS: 300, rooms: ['grid'], lengthM: 7158, prime: false, gates: CIRCUITS['meridian-8'].gates.slice() };
  // LAP MODES (owner 2026-10-10: "small laps or full track"): each figure-8 also runs as a single-LOBE lap (~3.6 km, 3 laps) on the same deck.
  // -lobe-n = the lobe toward the +x end of the lemniscate, -lobe-s = the -x end; both close at the crossing. The host aliases their deck to the full 8's.
  [['meridian-8', 'Meridian Figure-8'], ['meridian-8b', 'Meridian Figure-8 (Twin)']].forEach(function (pr) {
    [['n', 'North lobe'], ['s', 'South lobe']].forEach(function (lb) {
      var id = pr[0] + '-lobe-' + lb[0], full = CIRCUITS[pr[0]];
      CIRCUITS[id] = { id: id, name: pr[1] + ' - ' + lb[1] + ' (short lap)', scale: 'grid', laps: 3, cleanLapS: 150, rooms: ['grid'], lengthM: Math.round(full.lengthM / 2), prime: false, gates: full.gates.slice(0, 6), deckOf: pr[0] };
    });
  });
  // MERIDIAN TREFOIL (2026-10-11, owner: "make the track more symmetrical so you can turn easy"): a 3-fold symmetric trefoil projection (three equal petals, three flyover crossings round
  // the core). x = sin t + 2 sin 2t, y = cos t - 2 cos 2t, scaled 420 m and rotated 40 deg: ~10.7 km, min turn radius ~420 m, corridor tops <= 169 m (all 270-320 m spires dodged), inside r1260.
  var MT = { scale: 420, rot: 40 };
  CIRCUITS['meridian-tri'] = { id: 'meridian-tri', name: 'Meridian Trefoil', scale: 'grid', laps: 2, cleanLapS: 420, rooms: ['grid'], lengthM: 10721, prime: false, gates: [{ kind: 'pad' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'trick', verb: 'flip' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'kiss' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }],
    // GATE TOWERS: three purpose-built arch towers (one per petal, 3-fold symmetric) the deck threads through; placed by the track builder where the footprint is clear of city towers.
    gateTowers: 3 };
  // SKYLINE CIRCUIT = the FULL COURSE (owner 2026-10-16). v2 from the owner's Blender lines: TWO CONNECTORS join Dragon Gate to the sky ring
  // (they cross in an X west of Dragon Gate -> flyover). Lap: start by RACE HQ on Dragon Gate's south side -> NORTH connector up to the ring
  // (bearing 85) -> sky ring counter-clockwise with the two crossover loops -> SOUTH connector down (bearing 120) -> a full Dragon Gate figure-8 -> finish.
  //   RING  r 1450 m, concentric with the maglev; corridor tops <= 81 m (grid-city-v4); deck >= 70 m up. Swings out to the connector feet (r ~1725).
  //   LOOPS trochoid R 140 m, k 2.2 at -10 deg (tops <= 71 m) and 170 deg (tops <= 57 m), picked by a tops scan of every 5 deg.
  //   Points carry a 3rd value = minimum deck height above ground (m), read by the track builder.
  var GC = { ringR: 1450, upB: 85.1, downB: 120.0, taper: 15, skyH: 70, loops: [-10, 170], loopR: 140, loopK: 2.2,
    // owner's lines (Blender metres, east/north), traced from the viewport annotation 2026-10-16, ~55 m spacing
    north: [[1933, -409], [1885, -382], [1871, -325], [1853, -267], [1837, -209], [1813, -143], [1781, -92], [1759, -27], [1729, 22], [1720, 80], [1722, 148]],
    south: [[1489, -860], [1538, -805], [1597, -737], [1649, -680], [1695, -618], [1724, -559], [1761, -491], [1790, -434], [1820, -376], [1840, -310], [1872, -251], [1920, -201], [1971, -161]] };
  CIRCUITS['grand-course'] = { id: 'grand-course', name: 'Skyline Circuit (Full Course)', scale: 'grid', laps: 1, cleanLapS: 500, rooms: ['grid'], lengthM: 12000, prime: false, hq: true,
    gates: [{ kind: 'pad' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'either' }, { kind: 'trick', verb: 'flip' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'kiss' }, { kind: 'either' }, { kind: 'foil' }, { kind: 'pad' }, { kind: 'either' }, { kind: 'pad' }] };
  // Meridian circuits stay in the code (and Blender history) but leave the race menu: the Skyline Circuit is the long race now.
  ['meridian-8', 'meridian-8b', 'meridian-tri', 'meridian-8-lobe-n', 'meridian-8-lobe-s', 'meridian-8b-lobe-n', 'meridian-8b-lobe-s'].forEach(function (id) { if (CIRCUITS[id]) CIRCUITS[id].hidden = true; });
  CIRCUITS['dragon-gate'].hq = true;   // the short race also starts at Race HQ
  var DEG = Math.PI / 180;
  function pol(r, b) { return [r * Math.sin(b * DEG), r * Math.cos(b * DEG)]; }          // bearing (deg clockwise from north) -> metres [east, north]
  function arc(r, b0, b1, n) { var o = []; for (var i = 0; i <= n; i++) o.push(pol(r, b0 + (b1 - b0) * i / n)); return o; }
  function lemniscate(n) { var o = []; for (var i = 0; i < n; i++) { var t = i / n * Math.PI * 2, d = 1 + Math.sin(t) * Math.sin(t); o.push([DG.cx + DG.a * Math.cos(t) / d, DG.cn + DG.a * Math.sin(t) * Math.cos(t) / d]); } return o; }
  function meridian8(n, P) { P = P || M8; var o = [], r = P.rot * DEG, cr = Math.cos(r), sr = Math.sin(r); for (var i = 0; i < n; i++) { var t = i / n * Math.PI * 2, d = 1 + Math.sin(t) * Math.sin(t), x = P.a * Math.cos(t) / d, y = P.a * Math.sin(t) * Math.cos(t) / d; o.push([P.cx + x * cr - y * sr, P.cn + x * sr + y * cr]); } return o; }
  function meridianLobe(P, north, n) { var o = [], r = P.rot * DEG, cr = Math.cos(r), sr = Math.sin(r), t0 = north ? -Math.PI / 2 : Math.PI / 2; for (var i = 0; i < n; i++) { var t = t0 + Math.PI * i / n, d = 1 + Math.sin(t) * Math.sin(t), x = P.a * Math.cos(t) / d, y = P.a * Math.sin(t) * Math.cos(t) / d; o.push([P.cx + x * cr - y * sr, P.cn + x * sr + y * cr]); } return o; }
  function grandCourse() {
    var o = [], b, i, wrap = function (d) { return ((d % 360) + 540) % 360 - 180; }, rOf = function (p) { return Math.hypot(p[0], p[1]); };
    var ramp = function (pts, h0, h1) { var n = pts.length; for (var j = 0; j < n; j++) o.push([pts[j][0], pts[j][1], Math.round(h0 + (h1 - h0) * j / (n - 1))]); };
    var push = function (bb, r, h) { o.push([r * Math.sin(bb * DEG), r * Math.cos(bb * DEG), h]); };
    var rUp = rOf(GC.north[GC.north.length - 1]), rDn = rOf(GC.south[0]);
    ramp(GC.north, 0, GC.skyH * 0.75);                                                   // NORTH connector: Dragon Gate -> ring (climbing)
    var half = Math.PI * GC.loopR / GC.ringR / DEG, done = {}, end = GC.downB - 360;
    for (b = GC.upB - 1.5; b > end + 1; b -= 1) {                                          // ring, counter-clockwise (bearing decreasing)
      var li = -1; GC.loops.forEach(function (c, j) { if (Math.abs(wrap(b - c)) < half) li = j; });
      if (li >= 0) { if (done[li]) continue; done[li] = true; var c = GC.loops[li], R = GC.loopR, k = GC.loopK;
        for (i = 0; i <= 60; i++) { var t = -Math.PI + 2 * Math.PI * i / 60, x = R * (t - k * Math.sin(t)), y = R * k * (1 + Math.cos(t)); push(c - x / GC.ringR / DEG, GC.ringR - y, GC.skyH); }
        continue; }
      var fu = Math.max(0, 1 - (GC.upB - b) / GC.taper), fd = Math.max(0, 1 - (b - end) / GC.taper);   // swing out to the connector feet
      var f = Math.max(fu, fd), rr = GC.ringR + ((fu >= fd ? rUp : rDn) - GC.ringR) * (0.5 - 0.5 * Math.cos(Math.PI * f));
      push(b, rr, GC.skyH);
    }
    ramp(GC.south, GC.skyH * 0.75, 0);                                                   // SOUTH connector: ring -> Dragon Gate (descending)
    var dg = lemniscate(72), near = function (q) { var bi = 0, bd = 1e9; dg.forEach(function (p, j) { var d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = j; } }); return bi; };
    var iIn = near(GC.south[GC.south.length - 1]), iOut = near(GC.north[0]);
    for (i = (iIn + 1) % dg.length; i !== iOut; i = (i + 1) % dg.length) o.push([dg[i][0], dg[i][1], 0]);   // a full Dragon Gate figure-8 to the finish
    return o;
  }
  function trefoil(n) { var o = [], r = MT.rot * DEG, cr = Math.cos(r), sr = Math.sin(r); for (var i = 0; i < n; i++) { var t = i / n * Math.PI * 2, x = Math.sin(t) + 2 * Math.sin(2 * t), y = Math.cos(t) - 2 * Math.cos(2 * t); o.push([MT.scale * (x * cr - y * sr), MT.scale * (x * sr + y * cr)]); } return o; }
  var TRACKS = {
    'meridian-tri': function () { return trefoil(216); },
    'meridian-8-lobe-n': function () { return meridianLobe(M8, true, 72); },
    'meridian-8-lobe-s': function () { return meridianLobe(M8, false, 72); },
    'meridian-8b-lobe-n': function () { return meridianLobe(M8B, true, 72); },
    'meridian-8b-lobe-s': function () { return meridianLobe(M8B, false, 72); },
    'meridian-8': function () { return meridian8(144); },
    'meridian-8b': function () { return meridian8(144, M8B); },
    'grand-course': function () { return grandCourse(); },
    'dragon-gate': function () { return lemniscate(72); },
    'grid-ring': function () { return arc(1600, 0, -360, 96).slice(0, -1); },
    'train-ring': function () { return arc(2829, 0, -360, 144).slice(0, -1); },
    'quarter-loop': function () { var out = arc(1600, 0, -67.5, 36), i, r; for (i = 1; i <= 8; i++) { r = 1600 - 100 * i; out.push(pol(r, -67.5)); } out = out.concat(arc(800, -67.5, 0, 24).slice(1)); for (i = 1; i < 8; i++) { r = 800 + 100 * i; out.push(pol(r, 0)); } return out; }
  };
  function trackWorld(cid, U) { var f = TRACKS[cid]; if (!f) return null; return f().map(function (p) { return p.length > 2 ? { x: p[0] * U, y: 0, z: -p[1] * U, h: p[2] } : { x: p[0] * U, y: 0, z: -p[1] * U }; }); }   // optional p[2] = min deck height above ground (m)   // world: x east, z = -north (atlas rule)
  function trackLengthM(cid) { var f = TRACKS[cid]; if (!f) return 0; var p = f(), L = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }

  function create(circuit, opts) {
    opts = opts || {}; var ranked = !!opts.ranked, R = {}, riders = {}, order = [], t = 0, started = false, rng = opts.rng || Math.random;
    (opts.riders || []).slice(0, TUNE.maxRiders).forEach(function (r) { riders[r.id] = { id: r.id, name: r.name || r.id, deck: r.deck || 'park', gate: 0, lap: 0, checkpoint: -1, time: 0, finished: false, dnf: false, penaltyS: 0, trickS: 0, tricks: 0, hp: TUNE.hp, energy: 1, item: null, freeze: 0, boosting: false, ward: false, washes: 0, misses: 0 }; order.push(r.id); });
    var N = circuit.gates.length;
    function rd(id) { return riders[id]; }
    R.start = function () { started = true; t = 0; };
    R.update = function (dt) { if (!started) return; t += dt; order.forEach(function (id) { var r = riders[id]; if (r.finished || r.dnf) return; r.time += dt; if (r.freeze > 0) r.freeze = Math.max(0, r.freeze - dt); if (r.grace > 0) r.grace = Math.max(0, r.grace - dt); }); };
    R.passGate = function (id, gateIdx, s) {
      var r = rd(id); if (!r || r.finished || r.dnf || r.freeze > 0) return { ok: false, why: 'not racing' }; if (gateIdx !== r.gate) return { ok: false, why: 'wrong gate (next is ' + r.gate + ')' };
      var g = circuit.gates[gateIdx], mode = s && s.mode || 'pad', alt = s && s.altM || 0, note = '';
      if (g.kind === 'foil' && mode !== 'foil') return { ok: false, why: 'foil gate needs foil' };
      if (g.kind === 'kiss' && !(s && s.kissed)) return { ok: false, why: 'kiss gate: skim a rail then foil' };
      if (g.kind === 'pad' && (mode !== 'pad' || alt > TUNE.padGateMaxAlt)) { r.penaltyS += TUNE.missPadS; r.misses++; note = 'missed pad gate +' + TUNE.missPadS + 's'; }
      else if (g.kind === 'trick' && s && s.trick && s.trick.clean && s.trick.verb === g.verb) { r.trickS += TUNE.trickTenth; r.tricks++; note = 'trick bonus -' + TUNE.trickTenth + 's'; }
      r.checkpoint = gateIdx; r.gate++; if (r.gate >= N) { r.gate = 0; r.lap++; if (r.lap >= circuit.laps) { r.finished = true; r.finalS = R.score(id); } }
      return { ok: true, note: note, lap: r.lap, gate: r.gate, finished: r.finished };
    };
    R.score = function (id) { var r = rd(id); if (!r) return null; var cap = circuit.cleanLapS * TUNE.trickCapPct * circuit.laps; return +(r.time + r.penaltyS - Math.min(r.trickS, cap)).toFixed(2); };
    R.wash = function (id) { var r = rd(id); if (!r) return; r.penaltyS += TUNE.washS; r.washes++; };
    R.lavaTouch = function (id) { var r = rd(id); if (!r) return null; if (circuit.lavaKill !== false) { r.dnf = true; return { dnf: true }; } r.penaltyS += 5; return { dnf: false }; };
    function respawn(r) { r.hp = TUNE.hp; r.grace = TUNE.respawnFreezeS + TUNE.hitGraceS; r.freeze = TUNE.respawnFreezeS; r.item = null; r.energy = TUNE.respawnEnergy; r.gate = (r.checkpoint + 1) % N; }
    R.hit = function (id, dmg) { var r = rd(id); if (!r || r.dnf || r.finished) return null; if (r.ward) { r.ward = false; return { blocked: true, hp: r.hp }; } if (r.grace > 0) return { immune: true, hp: r.hp };   /* just hit: brief immunity so shells cannot chain-stun a rider */ r.hp = Math.max(0, r.hp - dmg); if (r.hp <= 0) { respawn(r); return { respawned: true, hp: r.hp }; } r.grace = TUNE.hitGraceS; return { hp: r.hp }; };
    R.ram = function (a, b, closing) { var ra = rd(a), rb = rd(b); if (!ra || !rb || ra.freeze > 0 || rb.freeze > 0) return null; var c = Math.max(0, closing), d = TUNE.ramDmgMin + (TUNE.ramDmgMax - TUNE.ramDmgMin) * Math.min(1, c / 20); if (ra.boosting) d *= TUNE.ramBoostMul; return { impulse: +(c * 0.55).toFixed(2), damage: +d.toFixed(1), result: R.hit(b, d) }; };
    R.wallRam = function (id) { return R.hit(id, TUNE.wallDmg); };
    R.grabCrate = function (id, prime) { var r = rd(id); if (!r || r.item) return null; var stand = R.standings(), pl = 1, n0 = stand.length; for (var si0 = 0; si0 < stand.length; si0++) if (stand[si0].id === id) pl = stand[si0].place || (si0 + 1); var W = itemWeights(pl, n0, prime), pool = ITEMS.filter(function (i) { return (!i.primeOnly || prime) && (W[i.id] || 0) > 0; }), tot = pool.reduce(function (s, i) { return s + W[i.id]; }, 0), x = rng() * tot, pick = pool[0]; for (var i = 0; i < pool.length; i++) { x -= W[pool[i].id]; if (x <= 0) { pick = pool[i]; break; } } r.item = pick.id; return pick; };
    R.useItem = function (id, target) {
      var r = rd(id); if (!r || !r.item || r.freeze > 0) return null; var it = ITEMS.filter(function (i) { return i.id === r.item; })[0]; r.item = null;
      if (it.id === 'ward') r.ward = true; else if (it.id === 'boost') r.boosting = true; else if (it.id === 'shell' && target) return { item: it.id, hit: R.hit(target, TUNE.shellDmg) };
      else if (it.id === 'triple' && target) return { item: it.id, hit: R.hit(target, TUNE.shellDmg * 3) };
      else if (it.id === 'blue') { var first = R.standings()[0]; if (first && first.id !== id) return { item: it.id, hit: R.hit(first.id, TUNE.shellDmg) }; }
      return { item: it.id };
    };
    R.canUsePocket = function (vial) { return !(ranked && POCKET.indexOf(vial) >= 0); };
    R.standings = function () { return order.map(function (id) { return riders[id]; }).sort(function (a, b) { if (a.finished !== b.finished) return a.finished ? -1 : 1; if (a.finished && b.finished) return a.finalS - b.finalS; if (a.dnf !== b.dnf) return a.dnf ? 1 : -1; var pa = a.lap * N + a.gate, pb = b.lap * N + b.gate; return pb - pa || a.time - b.time; }).map(function (r, i) { return { id: r.id, name: r.name, place: i + 1, lap: r.lap + 1, gate: r.gate, hp: r.hp, item: r.item, finished: r.finished, dnf: r.dnf, score: r.finished ? r.finalS : null }; }); };
    R.finished = function () { return order.every(function (id) { return riders[id].finished || riders[id].dnf; }); };
    R.rider = rd; R.ranked = ranked; R.circuit = circuit;
    return R;
  }

  /* track ribbon: glowing cyan ribbon following the circuit waypoints (needs THREE). pts = [{x,y,z}] world units; width in world units. */
  function ribbon(THREE, pts, width, closed) {
    var n = pts.length, pos = [], idx = [], col = [], i, w = width / 2, up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), side = new THREE.Vector3();
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n], o = pts[(i + n - 1) % n]; a.set(q.x - o.x, 0, q.z - o.z).normalize(); side.crossVectors(up, a).normalize(); pos.push(p.x - side.x * w, p.y + 0.15, p.z - side.z * w, p.x + side.x * w, p.y + 0.15, p.z + side.z * w); col.push(0, 0.83, 1, 0, 0.83, 1); }
    var segs = closed ? n : n - 1; for (i = 0; i < segs; i++) { var i0 = i * 2, i1 = ((i + 1) % n) * 2; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  }
  root.WorldRace = { itemWeights: itemWeights, driftStep: driftStep, slipstream: slipstream, DRIFT: DRIFT, SLIP: SLIP, TUNE: TUNE, ITEMS: ITEMS, CIRCUITS: CIRCUITS, TRACKS: TRACKS, trackWorld: trackWorld, trackLengthM: trackLengthM, create: create, ribbon: ribbon };
})(typeof window !== 'undefined' ? window : globalThis);
