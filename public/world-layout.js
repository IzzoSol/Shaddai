/* world-layout.js — SHADDAI World shared map layout (single source of truth).
 * Loaded as a classic script BEFORE the world module. Modules (terrain/biomes/vehicles)
 * and the main world all read window.WORLD_LAYOUT so every piece lines up.
 * Coordinates are world units on the XZ plane; +Z is "south/front", Y is up.
 *
 * SACRED GEOMETRY — Seed of Life (6 around 1):
 *   SHADDAI (The Source) sits at the exact center [0,0].
 *   The other 6 agents stand on a perfect regular hexagon at radius R=260, all equidistant
 *   from the Source and 60deg apart. The hexagon is MIRROR-SYMMETRIC across the Z axis, so
 *   agents align in depth as three pairs: FRONT (z=+225), SIDE (z=0), BACK (z=-225).
 *   This is the classic Flower-of-Life seed pattern and keeps every landmark aligned.
 */
(function () {
  var R = 260;                  // sacred radius — distance from the Source to each agent
  // hexagon vertices, angle measured from +Z (front), mirrored across X=0 for depth alignment
  function vtx(deg) { var a = deg * Math.PI / 180; return [Math.round(Math.sin(a) * R), Math.round(Math.cos(a) * R)]; }
  var FRONT_R = vtx(30),  FRONT_L = vtx(-30);   // [130, 225]  / [-130, 225]
  var SIDE_R  = vtx(90),  SIDE_L  = vtx(-90);   // [260, 0]    / [-260, 0]
  var BACK_R  = vtx(150), BACK_L  = vtx(-150);  // [130,-225]  / [-130,-225]

  // ── PIKADON PLACEMENT NUDGE (2026-07-19) — "pikadon on bike" fix ──────────────
  // Owner reported PIKADON's body standing on an elevator pole/lift instead of at
  // his own station door. His station previously sat on the pure hexagon vertex
  // BACK_L (vtx −150 → xz-azimuth −120°), which put his whole cluster on the
  // −Z/back-left bisector shared with the grand-lift station corridor. We rotate
  // PIKADON ~6° counter-clockwise onto vtx(−156) so his door-front standing spot
  // moves into the OPEN back-left gap, off that corridor, while keeping the same
  // sacred radius R and staying clearly back-left (symmetric-adjacent to TURTLE).
  // NOTE: his lounge lift (built by world-elevators.js from this same pos) moves
  // WITH him, so their relative geometry is preserved — this only shifts the whole
  // station off the shared corridor line. See return notes.
  var PIKADON_POS = vtx(-156);                  // ≈ [-106,-238], xz-azimuth −114°

  window.WORLD_LAYOUT = {
    half: 2600,                  // MAP v3 (2026-09-25): matches the owner's atlas ("Word of Shaddai — the Ringed Realm")
    spawn: [0, 2, 70],          // player start: on the central axis, just south of the Source
    sacred: { radius: R, center: [0, 0], rings: [60, 130, 200, 260] }, // concentric plaza rings

    // ── MAP v3 geometry (owner atlas): realms are WEDGES filling the disc (nearest-center wins), joined by a golden
    // TRANSIT RING at R 1150 with one named station per realm border; each station is held by that realm's dragon.
    // No mountain wall — mountains only where the atlas draws them (Emberfall). Bearings = atan2(z,x); north = -z.
    mountains: { r0: 0, r1: 0, ridge: 0, passW: 0 },   // ring removed (kept as a zero-width record so old readers no-op)
    city: { radius: 650 },
    transit: { radius: 1150 },

    // ── BIOME REGIONS — centers measured from the owner's atlas (distance ∝ atlas radius; outer rim ≈ 2400u) ──
    biomes: (function () {
      var P = function (bearing, dist) { return [Math.round(Math.cos(bearing) * dist), Math.round(Math.sin(bearing) * dist)]; };
      return [
        { id: 'grid',       name: 'The Grid',       center: [0, 0],           radius: 650, color: 0x27e0ff, ground: 'grid',   fog: 0x000814, water: false },
        { id: 'void',       name: 'Deep Void',      center: P(-1.571, 1340),  radius: 460, color: 0x9b59f5, ground: 'void',   fog: 0x050010, water: false },
        { id: 'desert',     name: 'Sand Sea',       center: P(-0.93, 1480),   radius: 480, color: 0xff7a18, ground: 'sand',   fog: 0x1a0800, water: false },
        { id: 'volcano',    name: 'Emberfall',      center: P(-0.41, 1610),   radius: 480, color: 0x8a2a10, ground: 'lava',   fog: 0x1a0600, water: false, dock: null },
        { id: 'forest',     name: 'Quill Forest',   center: P(0.06, 1080),    radius: 330, color: 0x3ddc84, ground: 'meadow', fog: 0x0a1a0a, water: false },
        { id: 'suburb',     name: 'The Suburbs',    center: P(0.17, 1855),    radius: 480, color: 0x9aa8b8, ground: 'grid',   fog: 0x0a0e14, water: false },
        { id: 'meadow',     name: 'Meadowfields',   center: P(0.866, 1590),   radius: 520, color: 0x8fd06a, ground: 'meadow', fog: 0x0a140a, water: false },
        { id: 'ocean',      name: 'Crystal Sea',    center: P(2.70, 1900),    radius: 620, color: 0xc2a176, ground: 'sand',   fog: 0x06283a, water: true, dock: P(2.62, 1250) },
        { id: 'darkforest', name: 'Darkforest',     center: P(-2.83, 2070),   radius: 520, color: 0x2a3a4a, ground: 'void',   fog: 0x04060a, water: false },
        { id: 'arctic',     name: 'Arctic Vault',   center: P(-2.19, 1585),   radius: 480, color: 0xaaddff, ground: 'snow',   fog: 0xaaccee, water: true  },
      ];
    })(),

    // ── TRANSIT RING STATIONS (owner atlas names) — each at its realm's border on the ring; dragon = gate boss ──
    stations: (function () {
      var P = function (bearing) { return [Math.round(Math.cos(bearing) * 1150), Math.round(Math.sin(bearing) * 1150)]; };
      return [
        { id: 'central',    name: 'Central Station',        pos: [0, 700],         realm: 'grid',       dragon: null },
        { id: 'rift',       name: 'Rift Gate Station',      pos: P(-1.571), realm: 'void',       dragon: 'void' },
        { id: 'desert',     name: 'Desert Terminal',        pos: P(-0.98),  realm: 'desert',     dragon: 'tan' },
        { id: 'forge',      name: 'Emberfall Forge Station',pos: P(-0.40),  realm: 'volcano',    dragon: 'red' },
        { id: 'suburb',     name: 'Suburb Transit Hub',     pos: P(0.22),   realm: 'suburb',     dragon: 'black' },
        { id: 'meadow',     name: 'Meadowfields Halt',      pos: P(0.90),   realm: 'meadow',     dragon: 'green' },
        { id: 'harbor',     name: 'Harbor Line Station',    pos: P(2.45),   realm: 'ocean',      dragon: 'teal' },
        { id: 'darkvault',  name: 'Darkvault Station',      pos: P(-2.80),  realm: 'darkforest', dragon: 'dark' },
        { id: 'arctic',     name: 'Arctic Outpost Station', pos: P(-2.20),  realm: 'arctic',     dragon: 'blue' },
      ];
    })(),

    // ── AGENT SECTORS — Seed of Life. SHADDAI = center; 6 agents on the hexagon. ──
    sectors: [
      { code: 'SHADDAI', name: 'The Source',       pos: [0, 0],   biome: 'grid',   building: 'spire',    color: 0xffcf4a },
      { code: 'NEXUS',   name: 'The Navigator',    pos: FRONT_L,  biome: 'grid',   building: 'dome',     color: 0x34e5b0 },
      { code: 'QUILL',   name: 'Library Entrance', pos: FRONT_R,  biome: 'forest', building: 'library',  color: 0xb98cff },
      { code: 'ORACLE',  name: 'The Esoteric Wing',pos: SIDE_R,   biome: 'forest', building: 'spires',   color: 0xc084fc },
      { code: 'TURTLE',  name: 'The Museum',       pos: BACK_R,   biome: 'desert', building: 'gallery',  color: 0x1fd6c4 },
      { code: 'PIKADON', name: 'The Aegis',        pos: PIKADON_POS, biome: 'arctic', building: 'fortress', color: 0xff5a6e },
      { code: 'ZEROX',   name: 'The Markets',      pos: SIDE_L,   biome: 'grid',   building: 'exchange', color: 0x27e0ff },
    ],

    // ── ROADS (the Source radiates to all 6; Quill links to its Esoteric wing) ──
    roads: [
      ['SHADDAI', 'NEXUS'], ['SHADDAI', 'QUILL'], ['SHADDAI', 'ORACLE'],
      ['SHADDAI', 'TURTLE'], ['SHADDAI', 'PIKADON'], ['SHADDAI', 'ZEROX'],
      ['QUILL', 'ORACLE'],
    ],

    // ── SPAWN PORTALS — one per area (GTA-style sky-dive drop points). ──
    // SHADDAI = the Source at center (default spawn = inside the temple);
    // the 6 agents sit on the exact hexagon vertices (same coords as their sectors).
    // Each portal = { code, name, pos:[x,z], color, inside } where `inside` marks the
    // default drop that lands the player INSIDE that building (SHADDAI temple).
    spawnPortals: [
      { code: 'SHADDAI', name: 'The Source Temple', pos: [0, 0],  color: 0xffcf4a, inside: true, isDefault: true },
      { code: 'NEXUS',   name: 'The Navigator',     pos: FRONT_L, color: 0x34e5b0 },
      { code: 'QUILL',   name: 'The Library',       pos: FRONT_R, color: 0xb98cff },
      { code: 'ORACLE',  name: 'The Esoteric Wing', pos: SIDE_R,  color: 0xc084fc },
      { code: 'TURTLE',  name: 'The Museum',        pos: BACK_R,  color: 0x1fd6c4 },
      { code: 'PIKADON', name: 'The Aegis',         pos: PIKADON_POS, color: 0xff5a6e },
      { code: 'ZEROX',   name: 'The Markets',       pos: SIDE_L,  color: 0x27e0ff },
    ],

    // ── LANDMARKS — non-agent structures placed on exact geometry (no hand-typed magic coords). ──
    // Bazaar (the walkable green ring & arch) sits SOUTH-WEST: −X=west, +Z=south. This mirrors the
    // 3D BAZAAR zone (SHADDAI-WORLD-3D.html) so the minimap 'B' marker points at the real bazaar.
    landmarks: [
      { id: 'bazaar', name: 'The Bazaar', pos: [-100, 100], color: 0x00e5a0, footprint: 46, building: 'bazaar' },
      { id: 'colosseum', name: 'Southern Colosseum', pos: [0, 1660], color: 0xe8c45c, footprint: 420, building: 'colosseum' },   // MAP v3: due south on the atlas, just outside the transit ring. REAL size (world-colosseum.js: ~784 × 644 u + lobby facing the city) → centre 1660 puts the lobby steps ~40u beyond the ring deck
      { id: 'emblem', name: 'SH Emblem',  pos: [0, 0],   color: 0xffcf4a },
    ],

    // sky-dive drop framing (shared by world-spawn.js): camera start altitude + descent seconds
    skydive: { altitude: 380, descendSec: 2.0, lookDown: true },

    portal: function (code) { return this.spawnPortals.find(function (p) { return p.code === code; }); },
    landmark: function (id) { return this.landmarks.find(function (l) { return l.id === id; }); },

    // ── REALM COLLIDERS (collider law, 2026-09-23) — solid circles for every placed realm
    // model. Positions mirror the placement code exactly (world-volcano.js / world-
    // realmprops.js / world-landmarks.js). Radii = half the model's placed width, clamped
    // for play. The COLOSSEUM stays collider-free (walk-in venue); gates/arches are
    // pass-through; the dragon flies. Door prompts trigger at COLLIDER_R+DOOR_EXTRA (50u
    // for fortress/castle) — always outside the wall, so E fires first.
    // ── MASTER REALM-MODEL LIST (MAP v2, 2026-09-25) — the ONE place realm models are placed + sized.
    // len = REAL longest horizontal side in metres (× 7/1.8 → world units; never a fraction of the realm).
    // fx/fz = offset as a fraction of the realm radius (positions spread with the realm); toCity = distance
    // from the realm center toward the city, as a fraction of the radius (gates on the approach road).
    // col = collider radius as a fraction of the half-size (0 = walk-on / walk-through / flying).
    // world-volcano.js + world-realmprops.js mount exactly these; colliders + flat ground derive from them.
    realmModels: [
      { realm: 'volcano',    id: 'hero-fortress',           len: 80, fx: 0,     fz: 0,     y: 6.6, ry: 0.26, col: 0.78, src: 'fal' },   // fal landmark (was the volcano-fortress placeholder)
      { realm: 'volcano',    id: 'volcano-forge-tower',     len: 20, fx: -0.52, fz: 0.30,  y: 6.6, ry: -0.4, col: 0.8 },
      { realm: 'volcano',    id: 'volcano-ritual-circle',   len: 30, fx: 0.56,  fz: -0.34, y: 6.6, ry: 0.9,  col: 0 },
      { realm: 'volcano',    id: 'volcano-dragon',          len: 40, fx: 0.18,  fz: 0.10,  y: 60,  ry: -2.2, col: 0, anim: 'dragon' },
      { realm: 'volcano',    id: 'volcano-bridge',          len: 45, fx: 0.62,  fz: 0.62,  y: 0,   ry: 0.7,  col: 0 },
      { realm: 'volcano',    id: 'volcano-gate',            len: 30, toCity: 0.92,         y: 0,   ry: 2.4,  col: 0 },
      { realm: 'darkforest', id: 'hero-castle',             len: 70, fx: 0,     fz: 0,     ry: 0.4,  col: 0.8, src: 'fal' },   // fal landmark (was castle-siege)
      { realm: 'darkforest', id: 'prop-obsidian-rocks',     len: 14, fx: 0.52,  fz: -0.4,  ry: 0,    col: 0.8 },
      { realm: 'darkforest', id: 'prop-obsidian-rocks',     len: 16, fx: -0.55, fz: 0.45,  ry: 1.2,  col: 0.8 },
      { realm: 'darkforest', id: 'prop-crystal-cluster',    len: 8,  fx: 0.58,  fz: 0.5,   ry: 0.6,  col: 0.8 },
      { realm: 'darkforest', id: 'prop-crystal-cluster',    len: 7,  fx: -0.5,  fz: -0.52, ry: 2.1,  col: 0.8 },
      { realm: 'darkforest', id: 'prop-crystal-cluster',    len: 9,  fx: 0.1,   fz: 0.62,  ry: 1.5,  col: 0.8 },
      { realm: 'suburb',     id: 'bld-apartment-pod-block', len: 45, fx: -0.5,  fz: 0.35,  ry: 0.2,  col: 0.8 },
      { realm: 'suburb',     id: 'bld-inverted-cube-hab',   len: 30, fx: -0.15, fz: -0.5,  ry: -0.3, col: 0.8 },
      { realm: 'suburb',     id: 'bld-neon-observatory',    len: 35, fx: 0.45,  fz: 0.4,   ry: 0.5,  col: 0.8, office: true },
      { realm: 'suburb',     id: 'bld-sea-terrace-spire',   len: 30, fx: 0.55,  fz: -0.2,  ry: -0.6, col: 0.8, office: true },
      { realm: 'suburb',     id: 'bld-holo-market-v2',      len: 32, fx: 0.0,   fz: 0.55,  ry: 3.14, col: 0.8 },
      { realm: 'meadow',     id: 'hero-mushroom-pods',      len: 40, fx: 0,     fz: 0,     ry: 0,    col: 0.75, src: 'fal' },
      { realm: 'meadow',     id: 'hero-farm-sky-structure', len: 40, fx: 0.32,  fz: 0.30,  y: 120, ry: 0.4, col: 0, src: 'fal' },   // floats ~30 m above the fields
      { realm: 'meadow',     id: 'homes-mushroom-pods',     len: 26, fx: -0.5,  fz: 0.4,   ry: 0.8,  col: 0.75 },
      { realm: 'meadow',     id: 'homes-mushroom-pods',     len: 24, fx: 0.45,  fz: -0.42, ry: 2.4,  col: 0.75 },
      // ── realm landmarks from fal (MAP v3): one centerpiece per realm, real size ──
      { realm: 'suburb',     id: 'hero-city-megatower',     len: 40, fx: 0.18,  fz: -0.28, ry: 0.6,  col: 0.8, src: 'fal' },   // ~200 m tall skyline anchor
      { realm: 'forest',     id: 'hero-forest-amphitheater',len: 50, fx: 0,     fz: 0,     ry: 0,    col: 0.35, src: 'fal' },
      { realm: 'arctic',     id: 'hero-sky-dome',           len: 120, fx: 0,    fz: 0,     ry: 0,    col: 0,   src: 'fal' },     // walk-in dome (interior next)
      { realm: 'arctic',     id: 'hero-arctic-outpost',     len: 40, fx: 0.45,  fz: 0.35,  ry: -0.8, col: 0.8, src: 'fal' },
      { realm: 'desert',     id: 'hero-desert-terminal',    len: 60, fx: 0,     fz: 0,     ry: 2.5,  col: 0.8, src: 'fal' },
      { realm: 'void',       id: 'hero-void-rift-gate',     len: 50, fx: 0,     fz: 0,     ry: 1.57, col: 0,   src: 'fal' },     // walk through the ring
      { realm: 'ocean',      id: 'hero-beach-market-dome',  len: 40, fx: 0.62,  fz: -0.35, ry: 2.2,  col: 0.8, src: 'fal' },
    ],
    realmColliders: [],   // derived below from realmModels (+ world-falprops.js appends its own)


    biomeAt: function (x, z) {
      var best = this.biomes[0], bd = Infinity;
      for (var i = 0; i < this.biomes.length; i++) {
        var b = this.biomes[i], d = Math.hypot(x - b.center[0], z - b.center[1]);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    },
    sector: function (code) { return this.sectors.find(function (s) { return s.code === code; }); },
  };

  // ── MAP v4 (?map=v4, 2026-09-26) — the ≈10 km Blender-baked world. Rewrites the map-scale fields of
  // WORLD_LAYOUT from public/assets/terrain/terrain.json (tools/blender/terrain-v4.py) so every layout-driven
  // module (transit, colosseum, realm props/volcano, interiors doors, colliders) lands on the v4 terrain.
  // Without the flag nothing below runs and the layout is exactly Map v3. See docs/LAYOUT-V4.md.
  var MAP_V4 = false;
  try { MAP_V4 = /[?&]map=v4(?:&|$|#)/.test(location.search); } catch (e) {}
  window.WORLD_LAYOUT.mapVersion = MAP_V4 ? 'v4' : 'v3';
  window.WORLD_LAYOUT.terrainMeta = null;
  if (MAP_V4) (function (L) {
    // Fallback mirror of terrain.json (map-scale fields only). REGENERATE from public/assets/terrain/terrain.json
    // whenever tools/blender/terrain-v4.py is re-run; the synchronous XHR below normally supersedes it.
    var FALLBACK = {
      half_units: 19444.444444444445, half_m: 5000, units_per_m: 7 / 1.8, grid_r_m: 1600, ring_r_m: 2828.5714285714284, rim_m: 4800,
      realms: [
        { id: 'void', c0: 344, c1: 16, r0_m: 1900, r1_m: 4800 }, { id: 'desert', c0: 14, c1: 45, r0_m: 1900, r1_m: 4800 },
        { id: 'volcano', c0: 45, c1: 80, r0_m: 1900, r1_m: 4800 }, { id: 'suburb', c0: 80, c1: 122, r0_m: 3278.5714285714284, r1_m: 4800 },
        { id: 'forest', c0: 86, c1: 120, r0_m: 1720, r1_m: 3128.5714285714284 }, { id: 'meadow', c0: 122, c1: 172, r0_m: 1900, r1_m: 4800 },
        { id: 'colo', c0: 172, c1: 196, r0_m: 1800, r1_m: 4800 }, { id: 'ocean', c0: 196, c1: 265, r0_m: 1850, r1_m: 4800 },
        { id: 'darkforest', c0: 262, c1: 318, r0_m: 1900, r1_m: 4800 }, { id: 'arctic', c0: 314, c1: 346, r0_m: 1900, r1_m: 4800 }
      ],
      stations: [
        { id: 'rift', compass: 0 }, { id: 'desert', compass: 31 }, { id: 'forge', compass: 54 }, { id: 'suburb', compass: 90 },       // canon table bearings (2026-09-26)
        { id: 'meadow', compass: 142.1 }, { id: 'harbor', compass: 225 }, { id: 'darkvault', compass: 299.1 }, { id: 'arctic', compass: 333.4 }
      ],
      _fallback: true
    };
    var T = null;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/assets/terrain/terrain.json', false);   // synchronous: this classic script must finish before the modules parse
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) T = JSON.parse(xhr.responseText);
    } catch (e) {}
    if (!T || !T.realms || !T.half_units) { T = FALLBACK; try { console.warn('[world-layout] map v4: terrain.json unavailable — using the embedded fallback numbers'); } catch (e) {} }
    L.terrainMeta = T;

    var U = +T.units_per_m || 7 / 1.8, D2R = Math.PI / 180;
    var RIM = +T.rim_m || 4800, GRID_R = +T.grid_r_m * U, RING_R = +T.ring_r_m * U;
    // compass (deg clockwise from north) + radius (metres) → game [x, z]   (X = east, Y = north; z = -Y·U)
    function C(deg, rM) { var a = deg * D2R; return [Math.sin(a) * rM * U, -Math.cos(a) * rM * U]; }
    function norm(d) { d %= 360; return d < 0 ? d + 360 : d; }
    function span(c0, c1) { return norm(c1 - c0) || 360; }
    function inArc(deg, c0, c1) { return norm(deg - c0) <= span(c0, c1); }
    L.compassOf = function (x, z) { return norm(Math.atan2(x, -z) / D2R); };   // game → compass degrees

    L.half = +T.half_units;
    L.city = { radius: GRID_R };
    L.transit = { radius: RING_R };
    L.mountains = { r0: 0, r1: 0, ridge: 0, passW: 0 };

    // ── biomes: same ids/names/colors/ground/fog; centre = wedge centroid, radius = inscribed; + sector (game units)
    var byId = {}; L.biomes.forEach(function (b) { byId[b.id] = b; });
    var ALIAS = { void: 'void', desert: 'desert', volcano: 'volcano', suburb: 'suburb', forest: 'forest', meadow: 'meadow', ocean: 'ocean', darkforest: 'darkforest', arctic: 'arctic' };   // 'colo' is not a biome (grid-like plain)
    var nb = [Object.assign({}, byId.grid, { center: [0, 0], radius: Math.round(GRID_R), sector: null })];
    T.realms.forEach(function (r) {
      var id = ALIAS[r.id]; if (!id || !byId[id]) return;
      var sp = span(r.c0, r.c1), mid = norm(r.c0 + sp / 2), rm = (+r.r0_m + +r.r1_m) / 2;
      var halfArc = rm * Math.sin(Math.min(sp / 2, 90) * D2R), halfDepth = (+r.r1_m - +r.r0_m) / 2;
      var c = C(mid, rm), b = Object.assign({}, byId[id], {
        center: [Math.round(c[0]), Math.round(c[1])],
        radius: Math.round(Math.min(halfArc, halfDepth) * U),
        sector: { c0: r.c0, c1: r.c1, r0: +r.r0_m * U, r1: +r.r1_m * U }
      });
      if (id === 'ocean') { var h = (T.stations || []).find(function (s) { return s.id === 'harbor'; }), dk = C(h ? h.compass : mid, +r.r0_m); b.dock = [Math.round(dk[0]), Math.round(dk[1])]; }
      nb.push(b);
    });
    L.biomes = nb;
    var colo = T.realms.find(function (r) { return r.id === 'colo'; });
    L.biomeAt = function (x, z) {
      var bs = this.biomes, grid = bs[0], r = Math.hypot(x, z);
      if (r <= this.city.radius) return grid;
      var deg = norm(Math.atan2(x, -z) / D2R), best = null, bd = Infinity, i, b, s, d;
      for (i = 1; i < bs.length; i++) {             // 1) inside a sector (overlapping edges → nearest centre)
        b = bs[i]; s = b.sector;
        if (s && inArc(deg, s.c0, s.c1) && r >= s.r0 && r <= s.r1) { d = Math.hypot(x - b.center[0], z - b.center[1]); if (d < bd) { bd = d; best = b; } }
      }
      if (best) return best;
      if (colo && inArc(deg, colo.c0, colo.c1)) return grid;   // colosseum wedge = grid-like plain
      for (i = 1; i < bs.length; i++) {             // 2) same bearing, radially outside the band (ring zone / beyond rim)
        b = bs[i]; s = b.sector;
        if (s && inArc(deg, s.c0, s.c1)) { d = r < s.r0 ? s.r0 - r : r - s.r1; if (d < bd) { bd = d; best = b; } }
      }
      if (best) return best;
      for (i = 0; i < bs.length; i++) { b = bs[i]; d = Math.hypot(x - b.center[0], z - b.center[1]); if (d < bd) { bd = d; best = b; } }   // 3) nearest centre
      return best || grid;
    };

    // ── stations: v4 ring positions, same ids/names/realms/dragons; Central on the Grid edge due south
    var st3 = {}; L.stations.forEach(function (s) { st3[s.id] = s; });
    var ns = [Object.assign({}, st3.central, { pos: [0, Math.round(GRID_R + 40)] })];
    (T.stations || []).forEach(function (s) {
      var p = s.xy_m ? [s.xy_m[0] * U, -s.xy_m[1] * U] : C(s.compass, +T.ring_r_m);
      ns.push(Object.assign({}, st3[s.id] || { id: s.id, name: s.name, realm: null, dragon: null }, { pos: [Math.round(p[0]), Math.round(p[1])], compass: s.compass }));
    });
    L.stations = ns;

    // ── colosseum due south just outside the ring (same real-size building)
    var co = L.landmark('colosseum'); if (co) { co.pos = [0, Math.round((+T.ring_r_m + 300) * U)]; co.footprint = 420; }

    // ── realm models: owner-atlas placement [compass°, fraction of rim radius, yaw° (null = keep)] per id, in order
    var ATLAS = {
      'hero-void-rift-gate': [[0, 0.637, 180]], 'hero-desert-terminal': [[27, 0.644, 207]], 'hero-fortress': [[66, 0.807, 246]],
      'volcano-forge-tower': [[58, 0.637, 0]], 'volcano-ritual-circle': [[72, 0.704, 0]], 'volcano-dragon': [[63, 0.726, 240]],
      'volcano-bridge': [[64, 0.678, 64]], 'volcano-gate': [[61, 0.622, 241]], 'hero-city-megatower': [[100, 0.833, 0]],
      'bld-apartment-pod-block': [[94, 0.770, 0]], 'bld-inverted-cube-hab': [[109, 0.785, 0]], 'bld-neon-observatory': [[114, 0.881, 0]],
      'bld-sea-terrace-spire': [[90, 0.896, 0]], 'bld-holo-market-v2': [[104, 0.689, 284]], 'hero-forest-amphitheater': [[127, 0.793, 0]],
      'hero-mushroom-pods': [[140, 0.704, 0]], 'hero-farm-sky-structure': [[152, 0.833, 0]],
      'homes-mushroom-pods': [[134, 0.748, 0], [146, 0.770, 0]], 'hero-sky-dome': [[338, 0.837, 0]], 'hero-arctic-outpost': [[332, 0.637, 152]],
      'hero-castle': [[292, 0.815, 112]], 'prop-obsidian-rocks': [[284, 0.704, null], [300, 0.759, null]],
      'prop-crystal-cluster': [[288, 0.870, null], [296, 0.667, null], [278, 0.796, null]], 'hero-beach-market-dome': [[224, 0.652, 44]]
    };
    var seen = {};
    L.realmModels.forEach(function (m) {
      var list = ATLAS[m.id], k = seen[m.id] = (seen[m.id] || 0) + 1, a = list && list[k - 1];
      if (!a) { try { console.warn('[world-layout] map v4: no atlas slot for ' + m.id + ' #' + k); } catch (e) {} return; }
      var p = C(a[0], a[1] * RIM);
      m.x = Math.round(p[0]); m.z = Math.round(p[1]); m.compass = a[0]; m._v4 = true;
      if (m.id === 'hero-forest-amphitheater') m.realm = 'meadow';   // owner's atlas draws the amphitheater in MEADOWFIELDS (127°), not Quill Forest
      if (a[2] != null) m.ry = a[2] * D2R;
      delete m.toCity;
    });
  })(window.WORLD_LAYOUT);

  // Off-map interior island (world-interiors.js rooms; world-colosseum.js arena at ROOM_ISLAND_X + 6000).
  // v3 keeps 6000 (arena 12000); v4's terrain reaches ±19444u, so the island moves beyond it.
  window.ROOM_ISLAND_X = MAP_V4 ? 30000 : 6000;

  // ── MAP v2: resolve every realm model to absolute position + world size, and derive its collider ──
  (function (L) {
    var PM = 7 / 1.8;
    L.realmModels.forEach(function (m) {
      var b = L.biomes.find(function (x) { return x.id === m.realm; }); if (!b) return;
      if (m._v4) { /* MAP v4: x/z already placed from the owner's atlas above */ }
      else if (m.toCity != null) { var d = Math.hypot(b.center[0], b.center[1]) || 1; m.x = Math.round(b.center[0] - b.center[0] / d * b.radius * m.toCity); m.z = Math.round(b.center[1] - b.center[1] / d * b.radius * m.toCity); }
      else { m.x = Math.round(b.center[0] + (m.fx || 0) * b.radius); m.z = Math.round(b.center[1] + (m.fz || 0) * b.radius); }
      m.w = m.len * PM;                                  // world units along the longest side
      m.url = m.src === 'fal' ? '/assets/models/fal/' + m.id + '.glb' : '/assets/models/' + m.id + '.glb';
      var _dropped = typeof location !== 'undefined' && !/[?&]realmbuildings=1/.test(location.search || '') && /^(bld-|homes-|hero-)/.test(String(m.id)) && !/^hero-castle/.test(String(m.id)) || (typeof location !== 'undefined' && !/[?&]volcano=1/.test(location.search || '') && m.realm === 'volcano');   // 2026-10-11: those models are no longer built (world-realmprops.js) - no invisible walls either
      if (m.col > 0 && !_dropped) L.realmColliders.push({ x: m.x, z: m.z, r: Math.round(m.w / 2 * m.col), label: m.id, realm: m.realm });
    });
    L.realmModelsFor = function (realm) { return L.realmModels.filter(function (m) { return m.realm === realm && m.w; }); };
  })(window.WORLD_LAYOUT);

})();
