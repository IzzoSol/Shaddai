/* world-hovercars.js — HOVER CAR KIT + AIR TRAFFIC (owner refs 2026-10-01: retro hover cars/vans/trucks sheet + Rimba Racer pod car).
 *
 *   WorldHoverCars.TYPES        [{id, name, len, w, h}]  11 designs: sedan, coupe, pickup (crates), limo, van, mini bubble, wedge, roadster, bus, wagon (luggage), pod (Rimba racer)
 *   WorldHoverCars.buildGroup(THREE, id, hex?)  -> THREE.Group in METRES (+z nose, y up), vertex-coloured body + glass + thruster pods + glow bits; userData.saddle (seat) — used by the rideable cars (world-mount-ride.js)
 *   WorldHoverCars.buildTraffic({THREE, scene, heightAt, getPlayer})  -> { update(dt), stats(), dispose() }   ambient AIR TRAFFIC: ~100 cars on altitude lanes + 18 flying riders (person on a hoverboard)
 *
 * Everything is code (no GLB, no fal): ~250-450 tris per car, one merged vertex-coloured mesh per type + 3 shared glow InstancedMeshes (headlights, tail lights, underglow) = ~15 draw calls for the whole fleet.
 * Lanes: concentric rings over the city (alt 14-50 m), two crossing avenues, and a LOCAL ring that follows the player so traffic is always in view. Zero lights, zero per-frame allocation.
 * Units: world units on XZ, U = 7/1.8 per metre.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8;
  var TYPES = [
    { id: 'sedan', name: 'Streak Sedan', len: 4.4, w: 1.9, h: 1.25 }, { id: 'coupe', name: 'Blue Coupe', len: 4.6, w: 1.9, h: 1.15 }, { id: 'pickup', name: 'Cargo Pickup', len: 5.4, w: 2.2, h: 2.2 },
    { id: 'limo', name: 'Night Limo', len: 5.6, w: 2.0, h: 1.3 }, { id: 'van', name: 'Courier Van', len: 4.8, w: 2.0, h: 2.0 }, { id: 'mini', name: 'Bubble Mini', len: 3.2, w: 1.7, h: 1.6 },
    { id: 'wedge', name: 'Gold Wedge', len: 4.4, w: 2.0, h: 1.1 }, { id: 'roadster', name: 'Red Roadster', len: 4.3, w: 1.9, h: 1.2 }, { id: 'bus', name: 'City Shuttle', len: 7.4, w: 2.4, h: 2.7 },
    { id: 'wagon', name: 'Voyager Wagon', len: 5.0, w: 2.0, h: 1.9 }, { id: 'pod', name: 'Rimba Pod Racer', len: 3.6, w: 2.3, h: 1.3, water: true },
    // RACE SHIPS (2026-10-11, owner refs: stealth wedges, swept wings, silver arrowhead blueprint with four teal thruster rings): purpose-built racers, not road cars.
    { id: 'arrow', name: 'Meridian Arrowhead', len: 5.6, w: 2.6, h: 1.1, ship: true }, { id: 'viper', name: 'Void Viper', len: 5.4, w: 2.4, h: 0.9, ship: true },
    { id: 'raptor', name: 'Night Raptor', len: 5.0, w: 3.4, h: 0.9, ship: true }, { id: 'lancer', name: 'Gilded Lancer', len: 6.2, w: 2.0, h: 0.9, ship: true },
    { id: 'bruiser', name: 'Iron Bruiser', len: 5.6, w: 3.0, h: 1.3, ship: true },
    // LIGHT-CYCLES (owner ref 2026-10-11: ring-wheel neon bike): one design, four colourways
    // WATER CRAFT (owner refs 2026-10-11): the six-seat sub-hover (seats 6 riders / agents) and the Rimba pod (dives and hovers)
    { id: 'sub6', name: 'Aqua Cabin-Glider', len: 8.6, w: 2.8, h: 2.0, water: true, seats: 6 },
    { id: 'bike-emerald', name: 'Emerald Lightcycle', len: 3.6, w: 0.95, h: 1.3, bike: true }, { id: 'bike-gold', name: 'Gilded Lightcycle', len: 3.6, w: 0.95, h: 1.3, bike: true },
    { id: 'bike-ice', name: 'Frost Lightcycle', len: 3.6, w: 0.95, h: 1.3, bike: true }, { id: 'bike-crimson', name: 'Crimson Lightcycle', len: 3.6, w: 0.95, h: 1.3, bike: true }
  ];
  var BODY = { sedan: 0xf2f4f8, coupe: 0x3a9ad0, pickup: 0x4f7a3a, limo: 0x15171c, van: 0xefe7cf, mini: 0xe8a04a, wedge: 0xe8c43a, roadster: 0xc2332c, bus: 0xd8cf8a, wagon: 0xc47a3a, pod: 0x6b8f3a, arrow: 0x16233a, viper: 0x101418, raptor: 0x0e3b2a, lancer: 0xf1efe6, bruiser: 0x2b3138, 'bike-emerald': 0x0b1411, 'bike-gold': 0x15120a, 'bike-ice': 0x0a1018, 'bike-crimson': 0x16090c, sub6: 0x0a0a2a };
  var ACCENT = { sedan: 0xff3ea5, coupe: 0x27e0ff, pickup: 0xcaa24a, limo: 0x7a2bd6, van: 0x3a8f9a, mini: 0xfff0b0, wedge: 0x2a2a2a, roadster: 0xe9e9e9, bus: 0x2f7a6e, wagon: 0xe8d8a0, pod: 0xe9f23a, arrow: 0x2bff88, viper: 0x2bff88, raptor: 0xe8c45c, lancer: 0xe8c45c, bruiser: 0xe8c45c, 'bike-emerald': 0x2bff88, 'bike-gold': 0xffd25a, 'bike-ice': 0x4ac8ff, 'bike-crimson': 0xff3b4e, sub6: 0x2bff88 };
  var GLASS = 0x1b3a52, DARK = 0x20242c, CHROME = 0xaab4c2;

  // RACE KART stats: top speed m/s, handling rad/s, accel 1-5, weight 1-5 (heavy karts shrug off stuns), tall = model height m
  var KARTS = { pod: { top: 44, handle: 2.6, accel: 5, weight: 2, tall: 1.4 }, sedan: { top: 38, handle: 2.2, accel: 4, weight: 3, tall: 1.4 }, coupe: { top: 40, handle: 2.3, accel: 4, weight: 3, tall: 1.3 }, wedge: { top: 42, handle: 2.1, accel: 4, weight: 2, tall: 1.2 },
    roadster: { top: 41, handle: 2.4, accel: 4, weight: 3, tall: 1.3 }, mini: { top: 32, handle: 2.8, accel: 3, weight: 1, tall: 1.8 }, wagon: { top: 34, handle: 2.0, accel: 3, weight: 3, tall: 2.1 }, van: { top: 30, handle: 1.7, accel: 3, weight: 4, tall: 2.0 },
    pickup: { top: 31, handle: 1.8, accel: 3, weight: 4, tall: 2.4 }, limo: { top: 36, handle: 1.6, accel: 3, weight: 4, tall: 1.4 }, bus: { top: 26, handle: 1.3, accel: 2, weight: 5, tall: 2.9 },
    // trait: boostDur = x boost duration (pads, items, drift mini-turbos); driftRate = x drift charge speed. accel / weight are REAL now (world-mount-ride): accel scales throttle response (3 = 1.0), weight scales stun time (3 = 1.0).
    arrow: { top: 52, handle: 2.5, accel: 4, weight: 2, tall: 1.2, trait: { boostDur: 1.15 } }, viper: { top: 55, handle: 2.2, accel: 4, weight: 2, tall: 1.0, trait: { driftRate: 1.25 } }, raptor: { top: 50, handle: 2.9, accel: 5, weight: 1, tall: 1.0, trait: { driftRate: 1.3 } },
    lancer: { top: 58, handle: 1.9, accel: 3, weight: 2, tall: 1.0, trait: { boostDur: 1.1 } }, bruiser: { top: 46, handle: 1.8, accel: 3, weight: 5, tall: 1.4 },
    // light-cycles: quick and light, drift hard (same stats in every colourway)
    'bike-emerald': { top: 54, handle: 3.3, accel: 5, weight: 1, tall: 1.3, trait: { driftRate: 1.35 } }, 'bike-gold': { top: 54, handle: 3.3, accel: 5, weight: 1, tall: 1.3, trait: { driftRate: 1.35 } },
    'bike-ice': { top: 54, handle: 3.3, accel: 5, weight: 1, tall: 1.3, trait: { driftRate: 1.35 } }, 'bike-crimson': { top: 54, handle: 3.3, accel: 5, weight: 1, tall: 1.3, trait: { driftRate: 1.35 } },
    sub6: { top: 40, handle: 1.6, accel: 2, weight: 5, tall: 2.0 } };
  // ship roles for the select screen (what the traits and stats mean in play)
  var SHIPINFO = {
    arrow: { role: 'ALL-ROUNDER', desc: 'Balanced arrowhead hull with four thrusters. Every boost runs 15% longer.' },
    viper: { role: 'DRIFT SPECIALIST', desc: 'Low black wedge. Drift charge builds 25% faster, so mini-turbos come quicker out of every corner.' },
    raptor: { role: 'AGILE', desc: 'Swept delta wing. Sharpest turn-in and the fastest throttle response, but the lightest hull. Drift charge 30% faster.' },
    lancer: { role: 'TOP SPEED', desc: 'Needle racer with canards. Highest top speed in the fleet and boosts run 10% longer, but slow to respond.' },
    sub6: { role: 'SIX-SEAT SUB-HOVER', desc: 'Teardrop cabin with six seats: carry your crew or your agents. Skims the surface, dives, and hovers on repulsor pods. Heavy and steady rather than fast.' },
    pod: { role: 'AMPHIBIOUS POD', desc: 'The Rimba pod: four wheel-pods that become repulsors. Dives under the water and hovers over it, tight and agile.' },
    'bike-emerald': { role: 'LIGHT-CYCLE', desc: 'Two glowing ring wheels and a razor frame. Lightest ride in the fleet: instant throttle, hard drift, drift charge 35% faster.' },
    'bike-gold': { role: 'LIGHT-CYCLE', desc: 'The gilded colourway. Same featherweight frame and 35% faster drift charge.' },
    'bike-ice': { role: 'LIGHT-CYCLE', desc: 'The frost colourway. Same featherweight frame and 35% faster drift charge.' },
    'bike-crimson': { role: 'LIGHT-CYCLE', desc: 'The crimson colourway. Same featherweight frame and 35% faster drift charge.' },
    bruiser: { role: 'HEAVY', desc: 'Armoured twin-pod brawler. Shrugs off stuns (weight 5). Lowest top speed, but you stay in the race.' }
  };
  function meta(id) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i]; return TYPES[0]; }

  // ── SCULPTED BODIES (2026-10-02, owner: "ships/cars are basic boxes"): lofted superellipse cross-sections (smooth normals, tapered nose/tail), separate glass canopy, belt stripe, nacelles, fins.
  //    One merged indexed vertex-coloured geometry per type, 350-700 triangles, no textures.
  function hexRGB(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
  function sgnPow(v, p) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), p); }
  /* st: [{z, w (half width), y0, y1, n (squareness, 2 = ellipse, 4+ = boxy), cx?}], RING points per station. colorFn(sy -1..1 around the ring, sx -1..1, station index) -> [r,g,b] */
  function refine(st) {   // one midpoint between every pair of stations: smoother silhouettes for the hero hulls
    var out = [], i, k, a, b, m;
    for (i = 0; i < st.length - 1; i++) { a = st[i]; b = st[i + 1]; out.push(a); m = {}; for (k in a) m[k] = typeof a[k] === 'number' ? (a[k] + b[k]) / 2 : a[k]; out.push(m); }
    out.push(st[st.length - 1]); return out;
  }
  function loft(THREE, st, ring, colorFn) {
    if (ring >= 14) { st = refine(st); ring = Math.max(ring, 24); }
    var pos = [], col = [], idx = [], i, j;
    for (i = 0; i < st.length; i++) {
      var s = st[i], yc = (s.y0 + s.y1) / 2, hh = Math.max(0.02, (s.y1 - s.y0) / 2), ex = 2 / (s.n || 2.6);
      for (j = 0; j < ring; j++) { var a = j / ring * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pos.push((s.cx || 0) + Math.max(0.02, s.w) * sgnPow(c, ex), yc + hh * sgnPow(sn, ex), s.z); var k = colorFn(sn, c, i);   /* raw ring angle (not the stretched height) so colour bands sit where you expect */ col.push(k[0], k[1], k[2]); }
    }
    for (i = 0; i < st.length - 1; i++) for (j = 0; j < ring; j++) { var a0 = i * ring + j, b0 = i * ring + (j + 1) % ring, a1 = (i + 1) * ring + j, b1 = (i + 1) * ring + (j + 1) % ring; idx.push(a0, b0, a1, b0, b1, a1); }   /* outward-facing winding (the first version was inside-out) */
    // end caps (fan to a centre vertex)
    [0, st.length - 1].forEach(function (e) { var s2 = st[e], cI = pos.length / 3; pos.push(s2.cx || 0, (s2.y0 + s2.y1) / 2, s2.z); var k2 = colorFn(0, 0, e); col.push(k2[0], k2[1], k2[2]); for (var q = 0; q < ring; q++) { var p0 = e * ring + q, p1 = e * ring + (q + 1) % ring; if (e === 0) idx.push(cI, p1, p0); else idx.push(cI, p0, p1); } });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /* SHIP PRESETS: hull = loft stations [f (of length), k (half-width frac), y0, y1, n]; cab = glass canopy {f0,f1,h,k}; wing = swept wing {root (x frac of hw), span (frac of hw), c0 (root chord m), c1 (tip chord m), sweep (m back), z (m), y, t};
   * fins = tail fins {x (frac of hw), h, z (frac of L), cant}; nac = side pods {x (frac of hw), r, len, z (m)}; thr = rear thrusters [[x frac, r]] (emissive discs added in buildGroup). */
  var SHIP = {
    arrow: { hull: [[-0.5, 0.55, 0.08, 0.5, 2.6], [-0.38, 0.8, 0.02, 0.62, 2.8], [-0.1, 0.92, 0, 0.66, 3], [0.2, 0.66, 0.04, 0.52, 2.8], [0.42, 0.3, 0.08, 0.34, 2.6], [0.5, 0.06, 0.12, 0.22, 2.4]],
      cab: { f0: -0.14, f1: 0.2, h: 0.95, k: 0.3 }, wing: { root: 0.5, span: 0.55, c0: 1.6, c1: 0.5, sweep: 0.9, z: -0.3, y: 0.35, t: 0.07 }, fins: { x: 0.45, h: 0.8, z: -0.42, cant: 0.28 }, nac: { x: 0.78, r: 0.3, len: 2.4, z: -0.5 }, thr: [[-0.78, 0.26], [-0.34, 0.2], [0.34, 0.2], [0.78, 0.26]] },
    viper: { hull: [[-0.5, 0.7, 0.04, 0.34, 3.4], [-0.35, 0.95, 0, 0.42, 3.6], [-0.05, 0.8, 0, 0.4, 3.4], [0.25, 0.5, 0.02, 0.3, 3], [0.5, 0.05, 0.08, 0.18, 2.6]],
      cab: { f0: -0.12, f1: 0.14, h: 0.7, k: 0.26 }, wing: { root: 0.7, span: 0.3, c0: 1.4, c1: 0.6, sweep: 0.5, z: -0.6, y: 0.22, t: 0.05 }, fins: { x: 0.55, h: 1.15, z: -0.44, cant: 0.5 }, nac: null, thr: [[-0.4, 0.34], [0.4, 0.34]] },
    raptor: { hull: [[-0.5, 0.3, 0.05, 0.32, 3], [-0.3, 0.42, 0.02, 0.4, 3], [0.05, 0.36, 0.02, 0.38, 3], [0.35, 0.2, 0.05, 0.28, 2.8], [0.5, 0.04, 0.1, 0.18, 2.4]],
      cab: { f0: -0.08, f1: 0.2, h: 0.72, k: 0.2 }, wing: { root: 0.3, span: 0.7, c0: 3.1, c1: 0.5, sweep: 2.0, z: 0.1, y: 0.2, t: 0.08 }, fins: { x: 0.2, h: 0.5, z: -0.45, cant: 0.12 }, nac: null, thr: [[-0.62, 0.3], [0.62, 0.3]] },
    lancer: { hull: [[-0.5, 0.4, 0.06, 0.4, 2.8], [-0.36, 0.55, 0.02, 0.46, 3], [0, 0.5, 0, 0.44, 3], [0.3, 0.3, 0.04, 0.32, 2.8], [0.5, 0.03, 0.1, 0.2, 2.4]],
      cab: { f0: -0.2, f1: 0.12, h: 0.7, k: 0.22 }, wing: { root: 0.5, span: 0.5, c0: 1.1, c1: 0.4, sweep: 0.4, z: 0.9, y: 0.22, t: 0.05 }, fins: { x: 0.35, h: 0.7, z: -0.45, cant: 0.15 }, nac: { x: 0.7, r: 0.2, len: 3.2, z: -0.3 }, thr: [[-0.7, 0.2], [-0.25, 0.18], [0.25, 0.18], [0.7, 0.2]] },
    bruiser: { hull: [[-0.5, 0.6, 0.08, 0.66, 3.4], [-0.4, 0.8, 0, 0.8, 3.6], [-0.05, 0.75, 0, 0.82, 3.6], [0.25, 0.6, 0.04, 0.64, 3.2], [0.5, 0.25, 0.1, 0.4, 3]],
      cab: { f0: -0.1, f1: 0.2, h: 1.15, k: 0.34 }, wing: { root: 0.8, span: 0.2, c0: 1.8, c1: 1.0, sweep: 0.3, z: -0.1, y: 0.4, t: 0.12 }, fins: { x: 0.6, h: 0.9, z: -0.44, cant: 0.2 }, nac: { x: 0.96, r: 0.5, len: 3.4, z: -0.2 }, thr: [[-0.55, 0.42], [0.55, 0.42]] }
  };
  // swept wedge wing (one side; side = +1 / -1): 8 verts, 12 tris, indexed
  function wingGeo(THREE, side, x0, span, c0, c1, sweep, z0, y, t) {
    var P = [[x0, z0], [x0, z0 - c0], [x0 + span, z0 - sweep - c1], [x0 + span, z0 - sweep]], pos = [], i;
    for (i = 0; i < 4; i++) pos.push(side * P[i][0], y + t / 2, P[i][1]);
    for (i = 0; i < 4; i++) pos.push(side * P[i][0], y - t / 2, P[i][1]);
    var idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
    if (side > 0) { for (i = 0; i < idx.length; i += 3) { var tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; } }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function make(THREE, id) {
    var T = meta(id), L = T.len, W = T.w, parts = [], gparts = [], base = 0.5, nose = L / 2, tail = -L / 2, hw = W / 2;
    var Bc = hexRGB(BODY[id]), Ac = hexRGB(ACCENT[id]), Gc = hexRGB(GLASS), Dc = hexRGB(DARK), Cc = hexRGB(CHROME);
    function bodyCol(sy, sx) { if (sy < -0.4) return Dc; if (Math.abs(sy) < 0.2 && Math.abs(sx) > 0.9) return Ac; return Bc; }                 // dark underside, accent belt stripe, painted top
    function glassCol(sy) { return sy > 0.8 ? Bc : Gc; }                                                                                     // roof painted, sides glass
    function box(x, y, z, sx, sy, sz, color, rx, ry, rz) { var g = new THREE.BoxGeometry(sx, sy, sz); if (rx || ry || rz) { g.rotateX(rx || 0); g.rotateY(ry || 0); g.rotateZ(rz || 0); } g.translate(x, y, z); var n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3); for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); }
    function part(g, dx, dy, dz) { if (dx || dy || dz) g.translate(dx || 0, dy || 0, dz || 0); parts.push(g); }
    function solid(g, rgb) { var n = g.attributes.position.count, a = new Float32Array(n * 3); for (var i = 0; i < n; i++) { a[i * 3] = rgb[0]; a[i * 3 + 1] = rgb[1]; a[i * 3 + 2] = rgb[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
    function S(f, k, y0, y1, n, cx) { return { z: f * L, w: hw * k, y0: base + y0, y1: base + y1, n: n || 3.2, cx: cx || 0 }; }
    var ring = 12, b = base;
    var thr = null, rings = null, seats = null;
    if (SHIP[id]) {   // RACE SHIP: lofted hull + canopy + swept wings + fins + side pods + rear thrusters
      var SP = SHIP[id], st = SP.hull.map(function (r) { return { z: r[0] * L, w: hw * r[1], y0: base + r[2], y1: base + r[3], n: r[4], cx: 0 }; });
      parts.push(loft(THREE, st, 14, function (sy, sx) { if (sy < -0.45) return Dc; if (Math.abs(sy) < 0.18 && Math.abs(sx) > 0.88) return Ac; return Bc; }));
      var cb = SP.cab, cz0 = cb.f0 * L, cz1 = cb.f1 * L, cm = (cz0 + cz1) / 2, cwk = hw * cb.k, cy0 = base + 0.3;
      gparts.push(loft(THREE, [{ z: cz0, w: cwk * 0.7, y0: cy0, y1: cy0 + 0.05, n: 2.6, cx: 0 }, { z: cz0 + (cz1 - cz0) * 0.2, w: cwk, y0: cy0, y1: cy0 + cb.h * 0.7, n: 2.4, cx: 0 }, { z: cm, w: cwk * 1.05, y0: cy0, y1: cy0 + cb.h, n: 2.2, cx: 0 }, { z: cz1 - (cz1 - cz0) * 0.2, w: cwk * 0.85, y0: cy0, y1: cy0 + cb.h * 0.62, n: 2.4, cx: 0 }, { z: cz1, w: cwk * 0.4, y0: cy0, y1: cy0 + 0.1, n: 2.6, cx: 0 }], 10, function (sy) { return sy > 0.55 ? Bc : Gc; }));
      var wg = SP.wing; if (wg) [-1, 1].forEach(function (sd) { parts.push(solid(wingGeo(THREE, sd, hw * wg.root, hw * wg.span, wg.c0, wg.c1, wg.sweep, wg.z, base + wg.y, wg.t), Bc)); box(sd * (hw * (wg.root + wg.span)), base + wg.y, wg.z - wg.sweep - wg.c1 * 0.5, 0.06, 0.1, wg.c1 * 0.9, ACCENT[id]); });   // wing + accent tip strip
      var fn = SP.fins; [-1, 1].forEach(function (sd) { box(sd * hw * fn.x, base + 0.3 + fn.h / 2, fn.z * L, 0.07, fn.h, 0.9, BODY[id], 0, 0, -sd * fn.cant); });
      var nc = SP.nac; if (nc) [-1, 1].forEach(function (sd) { var g1 = new THREE.CylinderGeometry(nc.r, nc.r * 0.82, nc.len, 10); g1.rotateX(Math.PI / 2); part(solid(g1, Cc), sd * hw * nc.x, base + 0.26, nc.z); var g2 = new THREE.CylinderGeometry(nc.r * 1.05, nc.r * 1.05, 0.08, 10); g2.rotateX(Math.PI / 2); part(solid(g2, Ac), sd * hw * nc.x, base + 0.26, nc.z + nc.len / 2); });
      thr = SP.thr.map(function (t) { return [t[0] * hw, base + 0.3, tail - 0.04, t[1]]; });
      thr.forEach(function (t) { var g3 = new THREE.CylinderGeometry(t[3] * 1.12, t[3] * 1.12, 0.3, 10); g3.rotateX(Math.PI / 2); part(solid(g3, Dc), t[0], t[1], t[2] + 0.12); });
    } else if (id === 'sub6') {   // SIX-SEAT SUB-HOVER: teardrop hull, glass canopy over 2-2-2 seats, forward-swept hydrofoils, four repulsor pods, roof search lights
      var Hh = 2.0;
      parts.push(loft(THREE, [S(-0.5, 0.1, 0.35, 0.7, 2.6), S(-0.42, 0.55, 0.12, 1.0, 2.6), S(-0.18, 0.95, 0, 1.15, 2.8), S(0.1, 1, 0, 1.1, 2.8), S(0.32, 0.78, 0.04, 0.85, 2.6), S(0.5, 0.1, 0.2, 0.5, 2.4)], 14, bodyCol));
      gparts.push(loft(THREE, [S(-0.34, 0.5, 0.95, 1.0, 2.4), S(-0.26, 0.74, 0.95, 1.6, 2.2), S(-0.02, 0.8, 0.95, 1.95, 2.1), S(0.2, 0.7, 0.95, 1.55, 2.2), S(0.34, 0.34, 0.95, 1.05, 2.4)], 12, function (sy) { return sy > 0.62 ? hexRGB(0x1b2a44) : Gc; }));
      var seatC = hexRGB(0xf2f0e8);
      var seatsAt = [];
      [[0.22, -1], [0.22, 1], [0.0, -1], [0.0, 1], [-0.2, -1], [-0.2, 1]].forEach(function (sp) {
        var sx = sp[1] * hw * 0.42, sz = sp[0] * L; box(sx, base + 1.08, sz, 0.62, 0.22, 0.66, 0xf2f0e8); box(sx, base + 1.46, sz - 0.28, 0.62, 0.7, 0.14, 0xf2f0e8); box(sx, base + 1.1, sz, 0.66, 0.05, 0.7, 0xe8c45c);   // cushion, back, gold piping
        seatsAt.push([sx, base + 1.28, sz]);
      });
      [-1, 1].forEach(function (sd) { part(wingGeo(THREE, sd, hw * 0.78, 1.5, 1.4, 0.5, -0.7, 0.35 * L, base + 0.28, 0.08), 0, 0, 0); parts[parts.length - 1] = solid(parts[parts.length - 1], Bc);
        box(sd * (hw * 0.78 + 1.5), base + 0.2, 0.35 * L + 0.7 - 0.6, 0.08, 0.06, 0.9, ACCENT[id]); });   // emerald wing-tip lights
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) { var x = p[0] * (hw * 0.7), z = p[1] * L * 0.26; part(solid(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 10), hexRGB(0x1a2236)), x, base - 0.02, z); part(solid(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 12), hexRGB(0xe8c45c)), x, base - 0.28, z); });
      box(-0.4, base + 2.0, 0.12 * L, 0.2, 0.14, 0.34, 0xe8c45c); box(0.4, base + 2.0, 0.12 * L, 0.2, 0.14, 0.34, 0xe8c45c);   // roof search lights
      box(0, base + 1.55, tail + 0.4, 0.07, 0.9, 1.1, BODY[id], -0.45);   // tail fin
      seats = seatsAt;
      thr = [[-0.5, base + 0.5, tail - 0.04, 0.26], [0.5, base + 0.5, tail - 0.04, 0.26]];
      thr.forEach(function (t) { var g3 = new THREE.CylinderGeometry(t[3] * 1.12, t[3] * 1.12, 0.3, 10); g3.rotateX(Math.PI / 2); part(solid(g3, Dc), t[0], t[1], t[2] + 0.12); });
    } else if (T.bike) {   // LIGHT-CYCLE: sleek spine, windscreen, two big ring wheels (neon rims added in buildGroup)
      var wr = 0.62, wz = L * 0.31, wy = base + 0.4;
      parts.push(loft(THREE, [{ z: -0.5 * L, w: hw * 0.35, y0: base + 0.32, y1: base + 0.62, n: 2.8, cx: 0 }, { z: -0.32 * L, w: hw * 0.62, y0: base + 0.28, y1: base + 0.98, n: 3, cx: 0 }, { z: 0, w: hw * 0.6, y0: base + 0.3, y1: base + 0.92, n: 3, cx: 0 }, { z: 0.3 * L, w: hw * 0.42, y0: base + 0.32, y1: base + 0.7, n: 2.8, cx: 0 }, { z: 0.5 * L, w: hw * 0.12, y0: base + 0.36, y1: base + 0.5, n: 2.4, cx: 0 }], 12, bodyCol));
      gparts.push(loft(THREE, [{ z: 0.02 * L, w: hw * 0.25, y0: base + 0.7, y1: base + 0.74, n: 2.4, cx: 0 }, { z: 0.14 * L, w: hw * 0.3, y0: base + 0.7, y1: base + 1.18, n: 2.2, cx: 0 }, { z: 0.26 * L, w: hw * 0.2, y0: base + 0.7, y1: base + 0.82, n: 2.4, cx: 0 }], 10, function (sy) { return sy > 0.5 ? Bc : Gc; }));
      [-1, 1].forEach(function (sg) {
        var tire = new THREE.TorusGeometry(wr, 0.17, 8, 22); tire.rotateY(Math.PI / 2); part(solid(tire, Dc), 0, wy, sg * wz);
        var hub = new THREE.CylinderGeometry(wr * 0.82, wr * 0.82, 0.2, 18); hub.rotateZ(Math.PI / 2); part(solid(hub, hexRGB(0x0a0c10)), 0, wy, sg * wz);
        box(0, wy + 0.1, sg * (wz - sg * 0.1), 0.12, 0.7, 0.12, BODY[id]);   // fork
      });
      box(0, base + 1.0, 0.18 * L, 0.7, 0.07, 0.07, 0xcfd6de);   // bars
      rings = [[0, wy, wz, wr], [0, wy, -wz, wr]];
      thr = [[0, base + 0.5, tail - 0.04, 0.2]];
      thr.forEach(function (t) { var g3 = new THREE.CylinderGeometry(t[3] * 1.15, t[3] * 1.15, 0.26, 10); g3.rotateX(Math.PI / 2); part(solid(g3, Dc), t[0], t[1], t[2] + 0.1); });
    } else if (id === 'pod') {   // Rimba racer: smooth tub, bubble canopy, four big nacelles with glowing rings, nose bumper
      parts.push(loft(THREE, [S(-0.5, 0.18, 0.18, 0.36, 2.4), S(-0.4, 0.5, 0.05, 0.62, 2.6), S(-0.1, 0.62, 0, 0.7, 2.6), S(0.2, 0.55, 0.02, 0.62, 2.6), S(0.5, 0.16, 0.16, 0.34, 2.4)], ring, bodyCol));
      gparts.push(solid(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Gc).scale(hw * 0.52, 0.9, L * 0.28).translate(0, b + 0.55, -0.1));
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) { var x = p[0] * (hw - 0.2), z = p[1] * (L / 2 - 0.5); part(solid(new THREE.CylinderGeometry(0.36, 0.42, 0.8, 9), hexRGB(0xdfe3e8)), x, b + 0.38, z); part(solid(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 10), Ac), x, b - 0.04, z); part(solid(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 8), Dc), x, b + 0.8, z); });
      box(0, b + 0.5, nose - 0.1, 0.9, 0.18, 0.3, 0xcfd6de);
    } else if (id === 'pickup') {
      parts.push(loft(THREE, [S(-0.5, 0.5, 0.15, 0.55, 3), S(-0.44, 0.96, 0.05, 0.78, 3.4), S(-0.1, 1, 0, 0.8, 3.4), S(0.2, 1, 0, 0.82, 3.6), S(0.44, 0.9, 0.05, 0.62, 3.2), S(0.5, 0.4, 0.15, 0.44, 3)], ring, bodyCol));
      gparts.push(loft(THREE, [S(0.04, 0.8, 0.78, 0.86, 2.8), S(0.1, 0.78, 0.78, 1.75, 2.8), S(0.24, 0.76, 0.78, 1.85, 2.8), S(0.34, 0.7, 0.78, 1.35, 2.8), S(0.38, 0.62, 0.78, 0.9, 2.8)], 12, glassCol));
      box(0, b + 1.87, 0.17 * L, W * 0.52, 0.07, 0.34 * L * 0.7, 0x4a5a2a);   // roof slab
      [-1, 1].forEach(function (s) { box(s * (hw * 0.94), b + 1.0, -L * 0.26, 0.1, 0.5, L * 0.38, 0x5a4326); }); box(0, b + 0.88, -L * 0.44, W * 0.9, 0.5, 0.12, 0x5a4326); box(0, b + 0.9, -L * 0.1, W * 0.9, 0.5, 0.12, 0x5a4326);   // open cargo bed rails
      box(0.35, b + 1.2, -L * 0.28, 0.8, 0.6, 0.8, 0xb89a62); box(-0.4, b + 1.1, -L * 0.34, 0.7, 0.5, 0.7, 0xa5834a);
    } else if (id === 'bus' || id === 'van') {
      var hv = T.h; parts.push(loft(THREE, [S(-0.5, 0.82, 0.08, hv * 0.55, 4.5), S(-0.46, 1, 0, hv * 0.9, 4.8), S(0.2, 1, 0, hv * 0.9, 4.8), S(0.46, 0.96, 0.02, hv * 0.78, 4.4), S(0.5, 0.62, 0.1, hv * 0.5, 4)], ring, function (sy, sx) { if (sy < -0.4) return Dc; if (sy > 0.3 && sy < 0.7) return Gc;   /* window band on the upper sides */ if (Math.abs(sy) < 0.2 && Math.abs(sx) > 0.9) return Ac; return Bc; }));
    } else {   // sedan / coupe / roadster / limo / wagon / mini / wedge: sleek lofted body + canopy
      var cabF0 = -0.27, cabF1 = 0.12, cabH = 1.62, noseK = 0.3, roof = true;
      if (id === 'coupe') { cabF0 = -0.22; cabF1 = 0.08; cabH = 1.5; } else if (id === 'roadster') { cabF0 = -0.12; cabF1 = 0.1; cabH = 1.5; roof = false; } else if (id === 'limo') { cabF0 = -0.36; cabF1 = 0.1; cabH = 1.66; }
      else if (id === 'wagon') { cabF0 = -0.4; cabF1 = 0.12; cabH = 1.74; } else if (id === 'mini') { cabF0 = -0.3; cabF1 = 0.2; cabH = 1.74; noseK = 0.45; } else if (id === 'wedge') { cabF0 = -0.18; cabF1 = 0.06; cabH = 1.45; noseK = 0.1; }
      var topN = id === 'wedge' ? 0.5 : 0.66;
      parts.push(loft(THREE, [S(-0.5, 0.25, 0.12, 0.36, 3), S(-0.42, 0.84, 0.04, 0.68, 3.2), S(-0.22, 1, 0, 0.74, 3.4), S(0.02, 1, 0, 0.74, 3.4), S(0.24, 0.96, 0, id === 'wedge' ? 0.4 : 0.62, 3.2), S(0.42, 0.8, 0.05, id === 'wedge' ? 0.3 : 0.48, 3), S(0.5, noseK, 0.12, id === 'wedge' ? 0.22 : 0.3, 2.8)], ring, bodyCol));
      var cx0 = cabF0, cx1 = cabF1, m = (cx0 + cx1) / 2;
      gparts.push(loft(THREE, [S(cx0, 0.78, 0.66, 0.7, 2.8), S(cx0 + 0.06, 0.76, 0.66, cabH * 0.9, 2.6), S(m, 0.72, 0.66, cabH, 2.4), S(cx1 - 0.04, 0.7, 0.66, cabH * 0.86, 2.6), S(cx1 + 0.02, 0.62, 0.64, 0.8, 2.8)], 10, roof ? glassCol : function (sy) { return sy > 0.1 ? Gc : Bc; }));
      if (roof) box(0, b + cabH * 0.99, m * L, W * 0.5, 0.07, (cx1 - cx0) * L * 0.55, BODY[id]);   // opaque roof over the glass greenhouse
      if (id === 'roadster') { box(0, b + 0.95, -L * 0.2, W * 0.5, 0.1, 0.5, 0xe9e9e9); box(0, b + 0.82, -L * 0.34, W * 0.7, 0.34, 0.5, 0x7a2a2a); }                                  // roll hoop + seat back
      if (id === 'wagon') { box(0, b + 0.64 + cabH * 0.76, -L * 0.2, W * 0.64, 0.1, L * 0.5, 0x2a2e36); box(0.2, b + 0.64 + cabH * 0.9, -L * 0.2, 0.9, 0.5, 0.7, 0x4a6a62); box(-0.4, b + 0.64 + cabH * 0.86, -L * 0.28, 0.8, 0.4, 0.6, 0x8a6a3a); }   // roof rack + cargo
      if (id === 'sedan' || id === 'wedge' || id === 'coupe') { box(0, b + (id === 'wedge' ? 0.72 : 0.9), tail + 0.12, W * 0.8, 0.07, 0.4, id === 'wedge' ? 0x2a2a2a : ACCENT[id]); [-1, 1].forEach(function (s) { box(s * W * 0.34, b + 0.78, tail + 0.14, 0.07, 0.3, 0.34, 0x2a2e36); }); }   // rear wing on two posts
      if (id === 'limo' || id === 'sedan') box(0, b + 0.74, nose - 0.9, W * 0.5, 0.05, 0.9, 0xd9dde2, -0.08);   // hood highlight
    }
    // thruster nacelles + bumpers (all types except the pod, which has its own)
    if (id !== 'pod' && !SHIP[id] && !T.bike && id !== 'sub6') {
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) { var x = p[0] * (hw - 0.28), z = p[1] * (L / 2 - 0.75); part(solid(new THREE.CylinderGeometry(0.22, 0.26, 0.34, 8), Dc), x, b - 0.04, z); part(solid(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 9), Ac), x, b - 0.24, z); });
      box(0, b + 0.18, nose + 0.02, W * 0.9, 0.14, 0.1, CHROME); box(0, b + 0.2, tail - 0.02, W * 0.86, 0.12, 0.1, CHROME);
    }
    // merge: body (opaque), glass (transparent in rideable cars), and body+glass together (instanced traffic)
    function merge(list) { var total = 0; list.forEach(function (g) { total += g.attributes.position.count; });
      var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), idx = [], off = 0;
      list.forEach(function (g) { var p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array; pos.set(p, off * 3); nor.set(n, off * 3); col.set(c, off * 3); var ix = g.index.array; for (var i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += g.attributes.position.count; });
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeBoundingSphere(); return geo; }
    gparts.forEach(function (g) { if (!g.attributes.normal) g.computeVertexNormals(); });
    var geo = merge(parts.concat(gparts)), geoBody = merge(parts), geoGlass = gparts.length ? merge(gparts) : null, idx = geo.index.array;
    return { geo: geo, body: geoBody, glassGeo: geoGlass, glow: { nose: nose, tail: tail, hw: W / 2 - 0.35, y: base + 0.5 }, thr: thr, rings: rings, seats: seats, tris: idx.length / 3 };
  }
  var cache = {};
  function kit(THREE, id) { var k = cache[id]; if (!k || k.THREE !== THREE) { k = make(THREE, id); k.THREE = THREE; cache[id] = k; } return k; }

  /* BLENDER SHIPS (K5, 2026-10-15): WorldHoverCars.loadShips(THREE, GLTFLoader) preloads the five race-ship hulls; groups built after
     that use them (built before = code hull). ?shipglb=0 = code hulls only. */
  var SHIPGLB = {}, SHIP_IDS = ['arrow', 'viper', 'raptor', 'lancer', 'bruiser'], shipsP = null;
  function loadShips(THREE, GLTFLoader, base) {
    if (shipsP) return shipsP; var L = new GLTFLoader(); base = base || '/assets/kits/';
    shipsP = Promise.all(SHIP_IDS.map(function (id) { return new Promise(function (res) { L.load(base + 'shaddai_ship_' + id + '_v01.glb', function (g) {
      var w = new THREE.Group(); w.name = 'shaddai_ship_' + id;
      g.scene.children.slice().forEach(function (c) { w.add(c); }); SHIPGLB[id] = w; res(1); }, undefined, function () { console.warn('[hovercars] missing ship', id); res(0); }); }); }))
      .then(function (r) { return r.reduce(function (a, b) { return a + b; }, 0); });
    return shipsP;
  }
  function buildGroup(THREE, id, hex) {
    var k = kit(THREE, id), g = new THREE.Group(), hero = !!(meta(id).ship || meta(id).bike || meta(id).water), mat = hero ? new THREE.MeshPhongMaterial({ vertexColors: true, color: hex != null ? hex : 0xffffff, shininess: 110, specular: 0x7fa890 }) : new THREE.MeshLambertMaterial({ vertexColors: true, color: hex != null ? hex : 0xffffff }), body = new THREE.Mesh(k.glassGeo ? k.body : k.geo, mat); g.add(body);
    if (k.glassGeo) { var gm = new THREE.Mesh(k.glassGeo, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })); gm.renderOrder = 1; g.add(gm); }
    var emis = function (c) { return new THREE.MeshBasicMaterial({ color: c }); };
    [-1, 1].forEach(function (s) { var hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), emis(0xfff2c0)); hl.position.set(s * k.glow.hw, k.glow.y, k.glow.nose + 0.03); g.add(hl); var tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), emis(0xff3a3a)); tl.position.set(s * k.glow.hw, k.glow.y, k.glow.tail - 0.03); g.add(tl); });
    var ug = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: ACCENT[id], transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ug.rotation.x = -Math.PI / 2; ug.scale.set(meta(id).w * 0.8, meta(id).len * 0.7, 1); ug.position.y = 0.1; g.add(ug);
    if (k.thr) k.thr.forEach(function (t) { var d = new THREE.Mesh(new THREE.CircleGeometry(t[3] * 0.85, 14), emis(0xb8ffd8)); d.position.set(t[0], t[1], t[2] - 0.05); d.rotation.y = Math.PI; g.add(d);   // cyan thruster discs (always lit)
      var h = new THREE.Mesh(new THREE.CircleGeometry(t[3] * 1.9, 14), new THREE.MeshBasicMaterial({ color: ACCENT[id], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); h.position.set(t[0], t[1], t[2] - 0.12); h.rotation.y = Math.PI; g.add(h); });
    if (k.rings) k.rings.forEach(function (rg) { var rm = new THREE.Mesh(new THREE.TorusGeometry(rg[3] * 0.97, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: ACCENT[id], toneMapped: false })); rm.rotation.y = Math.PI / 2; rm.position.set(rg[0], rg[1], rg[2]); g.add(rm); });
    var codeBits = g.children.filter(function (c) { return c !== ug; }), hull = SHIPGLB[id] && !/[?&]shipglb=0/.test(root.location ? root.location.search : '') ? SHIPGLB[id] : null;
    if (hull) { codeBits.forEach(function (c) { c.visible = false; }); var hc = hull.clone(true); hc.name = 'blenderHull'; g.add(hc); }   // Blender K5 hull replaces the code hull (effects below stay)
    if (k.seats) k.seats.forEach(function (sp, si) { var so = new THREE.Object3D(); so.name = 'seat' + si; so.position.set(sp[0], sp[1], sp[2]); g.add(so); });   // passenger anchors (riders / agents)
    if ((meta(id).ship || meta(id).bike || meta(id).water) && k.thr) {
      // exhaust sockets + plume cones: world-mount-ride scales every node named 'flame' on Y with speed (0.6 m idle, ~2.2 m at 30 m/s+); the cone's base sits on the nacelle, apex points rearward
      var xs = k.thr.map(function (t) { return t[0]; }), xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
      k.thr.forEach(function (t, ti) {
        var em = new THREE.Object3D(); em.name = t[0] === xMin ? 'exhaustL' : (t[0] === xMax ? 'exhaustR' : 'exhaust' + ti); em.position.set(t[0], t[1], t[2] - 0.02); em.rotation.x = -Math.PI / 2; g.add(em);
        var cg = new THREE.ConeGeometry(t[3] * 0.8, 1, 10, 1, true); cg.translate(0, 0.5, 0);
        var cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0x9dffc8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        cone.name = 'flame'; cone.scale.y = 0.6; em.add(cone);
      });
      var skirt = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x1fd37a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      skirt.name = 'hoverSkirt'; skirt.rotation.x = -Math.PI / 2; skirt.scale.set(meta(id).w * 0.62, meta(id).len * 0.55, 1); skirt.position.y = 0.32; g.add(skirt);   // the hover glow under the hull
      var ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(meta(id).w, meta(id).len * 0.5) * 0.55, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: 0x39ff8a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ring.name = 'boostRing'; ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; ring.visible = false; g.add(ring);   // shown only while the rider's boost timer runs (world-mount-ride)
    }
    if (hull) {   // sockets from the Blender hooks: each exhaust to the nearest hook_exhaust_*, saddle to saddle_<id>
      var hooks = []; hull.traverse(function (n) { if (/^hook_exhaust_/.test(n.name)) hooks.push(n.position); });
      g.children.forEach(function (c) { if (!/^exhaust/.test(c.name) || !hooks.length) return; var best = hooks[0]; hooks.forEach(function (h) { if (h.distanceTo(c.position) < best.distanceTo(c.position)) best = h; }); c.position.copy(best); });
    }
    var seat = new THREE.Object3D(); seat.name = 'saddle'; seat.position.set(0, id === 'pod' ? 1.05 : ((meta(id).ship || meta(id).bike) ? 0.98 : 1.22), id === 'pod' ? 0.1 : ((meta(id).ship || meta(id).bike) ? 0.1 : -0.2)); if (hull) hull.traverse(function (n) { if (n.name === 'saddle_' + id) seat.position.copy(n.position); }); g.add(seat); g.userData.saddle = seat; g.userData.tris = k.tris; return g;
  }

  // ───────────────── AIR TRAFFIC ─────────────────
  function buildTraffic(o) {
    var THREE = o.THREE, scene = o.scene, hAt = o.heightAt || function () { return 0; };
    var group = new THREE.Group(); group.name = 'air-traffic'; scene.add(group);
    var PAL = [0xffffff, 0x6fd0ff, 0xff7aa8, 0xffd36a, 0x9affc2, 0xc7a6ff, 0xff9a5a, 0xa6b8d0, 0xe8e0c8, 0x5aa0ff, 0xff5a6e, 0x34e5b0];
    // fleet composition per type (counts) + riders
    var FLEET = { sedan: 12, coupe: 10, pickup: 8, limo: 6, van: 10, mini: 10, wedge: 8, roadster: 8, bus: 6, wagon: 8, pod: 6 }, RIDERS = 18;
    var cars = [], total = 0; Object.keys(FLEET).forEach(function (k) { total += FLEET[k]; });
    // lanes: rings (radius m, altitude m, direction) over the city + two avenues + a LOCAL ring that follows the player
    var RINGS = [[260, 16, 1], [420, 24, -1], [640, 32, 1], [900, 40, -1], [1250, 48, 1], [1600, 56, -1]];
    var meshes = {}; Object.keys(FLEET).forEach(function (id) { var k = kit(THREE, id), m = new THREE.InstancedMesh(k.geo, new THREE.MeshLambertMaterial({ vertexColors: true }), FLEET[id]); m.frustumCulled = false; m.name = 'air-' + id; group.add(m); meshes[id] = m; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLEET[id] * 3), 3); });
    var hl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), total * 2), tl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3a3a }), total * 2), ug = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), total + RIDERS);
    [hl, tl, ug].forEach(function (m) { m.frustumCulled = false; group.add(m); });
    // flying riders: a person standing on a hoverboard (2 instanced meshes)
    var boardM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.08, 1.5), new THREE.MeshBasicMaterial({ color: 0x27e0ff }), RIDERS), personM = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.9, 3, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), RIDERS); [boardM, personM].forEach(function (m) { m.frustumCulled = false; group.add(m); }); personM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RIDERS * 3), 3);
    var dummy = new THREE.Object3D(), col = new THREE.Color(), ci = {}, n = 0;
    Object.keys(FLEET).forEach(function (id) { ci[id] = 0; for (var i = 0; i < FLEET[id]; i++) { var ring = n % (RINGS.length + 3), lane; if (ring < RINGS.length) lane = { kind: 'ring', R: RINGS[ring][0] * U, alt: RINGS[ring][1], dir: RINGS[ring][2] }; else if (ring === RINGS.length) lane = { kind: 'ave', axis: 'x', alt: 20 + (n % 5) * 5 }; else if (ring === RINGS.length + 1) lane = { kind: 'ave', axis: 'z', alt: 26 + (n % 5) * 5 }; else lane = { kind: 'local', R: (110 + (n % 4) * 40) * U, alt: 10 + (n % 3) * 6, dir: n % 2 ? 1 : -1 };
      var T = meta(id); cars.push({ id: id, k: ci[id]++, lane: lane, a: Math.random() * 6.28, s: 8 + Math.random() * 12, ph: Math.random() * 6.28, color: PAL[n % PAL.length], len: T.len, w: T.w, glow: kit(THREE, id).glow, gi: n }); col.setHex(PAL[n % PAL.length]); meshes[id].setColorAt(cars[cars.length - 1].k, col); n++; } });
    Object.keys(meshes).forEach(function (id) { meshes[id].instanceColor.needsUpdate = true; });
    var riders = []; for (var r = 0; r < RIDERS; r++) { riders.push({ R: (150 + (r % 6) * 230) * U, alt: 8 + (r % 5) * 7, dir: r % 2 ? 1 : -1, a: Math.random() * 6.28, s: 6 + Math.random() * 7, ph: Math.random() * 6.28 }); col.setHex(PAL[(r * 5) % PAL.length]); personM.setColorAt(r, col); } personM.instanceColor.needsUpdate = true;
    var lcx = 0, lcz = 0, t = 0, st = { cars: n, riders: RIDERS, near: 0 };
    function update(dt) {
      var pl = o.getPlayer ? o.getPlayer() : null, P = pl && pl.pos; t += dt; if (P) { lcx += (P.x - lcx) * Math.min(1, dt * 0.4); lcz += (P.z - lcz) * Math.min(1, dt * 0.4); }
      var near = 0, gi = 0;
      for (var i = 0; i < cars.length; i++) { var c = cars[i], L = c.lane, x, z, yaw, alt = L.alt;
        if (L.kind === 'ave') { c.a += c.s * U * dt; var span = 1700 * U, p = ((c.a % (2 * span)) + 2 * span) % (2 * span), f = p < span ? p : 2 * span - p, dirS = p < span ? 1 : -1; if (L.axis === 'x') { x = -span / 2 + f * 1; x = f - span / 2; z = (c.gi % 2 ? 40 : -40) * U; yaw = dirS > 0 ? Math.PI / 2 : -Math.PI / 2; } else { z = f - span / 2; x = (c.gi % 2 ? 40 : -40) * U; yaw = dirS > 0 ? 0 : Math.PI; } }
        else { var cx = L.kind === 'local' ? lcx : 0, cz = L.kind === 'local' ? lcz : 0; c.a += (c.s * U / L.R) * L.dir * dt; x = cx + Math.cos(c.a) * L.R; z = cz + Math.sin(c.a) * L.R; yaw = Math.atan2(-Math.sin(c.a) * L.dir, Math.cos(c.a) * L.dir) + 0 ; yaw = Math.atan2(-Math.sin(c.a) * L.dir, Math.cos(c.a) * L.dir); }
        var gy = hAt(x, z), y = Math.max(gy + 6 * U, gy + alt * U * 0.35) + Math.sin(t * 1.3 + c.ph) * 0.35 * U, bank = Math.sin(t * 0.9 + c.ph) * 0.05;
        if (P) { var dd = Math.hypot(x - P.x, z - P.z) / U; if (dd < 120) near++; }
        dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, bank); dummy.scale.setScalar(U); dummy.updateMatrix(); meshes[c.id].setMatrixAt(c.k, dummy.matrix);
        var cs = Math.cos(yaw), sn = Math.sin(yaw), g = c.glow, put = function (m, idx, lx, ly, lz) { dummy.position.set(x + lx * cs * U + lz * sn * U, y + ly * U, z - lx * sn * U + lz * cs * U); dummy.rotation.set(0, yaw, bank); dummy.scale.setScalar(U); dummy.updateMatrix(); m.setMatrixAt(idx, dummy.matrix); };
        put(hl, gi * 2, -g.hw, g.y, g.nose); put(hl, gi * 2 + 1, g.hw, g.y, g.nose); put(tl, gi * 2, -g.hw, g.y, g.tail); put(tl, gi * 2 + 1, g.hw, g.y, g.tail);
        dummy.position.set(x, y + 0.05 * U, z); dummy.rotation.set(-Math.PI / 2, 0, yaw); dummy.scale.set(c.w * 0.8 * U, c.len * 0.7 * U, 1); dummy.updateMatrix(); ug.setMatrixAt(gi, dummy.matrix); gi++; }
      for (var r = 0; r < riders.length; r++) { var q = riders[r]; q.a += (q.s * U / q.R) * q.dir * dt; var rx = Math.cos(q.a) * q.R + Math.sin(t * 0.7 + q.ph) * 30 * U, rz = Math.sin(q.a) * q.R + Math.cos(t * 0.6 + q.ph) * 30 * U, ry = hAt(rx, rz) + (q.alt + Math.sin(t * 1.1 + q.ph) * 3) * U * 0.5 + 4 * U, yw = Math.atan2(-Math.sin(q.a) * q.dir, Math.cos(q.a) * q.dir);
        dummy.position.set(rx, ry, rz); dummy.rotation.set(0, yw, Math.sin(t * 1.4 + q.ph) * 0.18); dummy.scale.setScalar(U); dummy.updateMatrix(); boardM.setMatrixAt(r, dummy.matrix);
        dummy.position.set(rx, ry + 1.0 * U, rz); dummy.updateMatrix(); personM.setMatrixAt(r, dummy.matrix);
        dummy.position.set(rx, ry - 0.05 * U, rz); dummy.rotation.set(-Math.PI / 2, 0, yw); dummy.scale.set(0.8 * U, 1.1 * U, 1); dummy.updateMatrix(); ug.setMatrixAt(cars.length + r, dummy.matrix); }
      Object.keys(meshes).forEach(function (id) { meshes[id].instanceMatrix.needsUpdate = true; }); hl.instanceMatrix.needsUpdate = tl.instanceMatrix.needsUpdate = ug.instanceMatrix.needsUpdate = boardM.instanceMatrix.needsUpdate = personM.instanceMatrix.needsUpdate = true; st.near = near;
    }
    return { update: update, stats: function () { return { cars: st.cars, riders: st.riders, nearPlayer: st.near, drawCalls: Object.keys(meshes).length + 7 }; }, dispose: function () { scene.remove(group); }, group: group };
  }
  root.WorldHoverCars = { KARTS: KARTS, SHIPINFO: SHIPINFO, ACCENT: ACCENT, BODY: BODY, TYPES: TYPES, buildGroup: buildGroup, buildTraffic: buildTraffic, kit: kit, loadShips: loadShips, _shipGlb: SHIPGLB };
})(typeof window !== 'undefined' ? window : globalThis);
