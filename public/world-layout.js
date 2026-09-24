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
    half: 720,                   // FULL MAP (2026-09-21): 380→720 — outer realm ring at R~540
    spawn: [0, 2, 70],          // player start: on the central axis, just south of the Source
    sacred: { radius: R, center: [0, 0], rings: [60, 130, 200, 260] }, // concentric plaza rings

    // ── BIOME REGIONS (nearest-center wins for ground/fog blending) ──
    biomes: [
      { id: 'grid',   name: 'The Grid',     center: [0, 0],       radius: 200, color: 0x27e0ff, ground: 'grid',   fog: 0x000814, water: false },
      { id: 'forest', name: 'Quill Forest', center: [210, 150],   radius: 150, color: 0x3ddc84, ground: 'meadow', fog: 0x0a1a0a, water: false },
      { id: 'arctic', name: 'Arctic Vault', center: [-150, -240], radius: 150, color: 0xaaddff, ground: 'snow',   fog: 0xaaccee, water: true  },
      { id: 'desert', name: 'Sand Sea',     center: [150, -240],  radius: 150, color: 0xff7a18, ground: 'sand',   fog: 0x1a0800, water: false },
      { id: 'void',   name: 'Deep Void',    center: [0, -360],    radius: 130, color: 0x9b59f5, ground: 'void',   fog: 0x050010, water: false },
      // CRYSTAL SEA (handoff step 2) — open animated ocean in the SW corner,
      // mirroring the 2D world's beach realm (deep water at far SW). Sand biome color =
      // the cove beach ring; the teal water itself is the shader plane from world-ocean.js.
      // `dock` = the gold harbor disc position (rawElevation carves a walkable sand pad there).
      // FULL MAP: r 95→150, water plane scales with it (world-ocean.js is fully parametrized).
      { id: 'ocean',  name: 'Crystal Sea',  center: [-295, 290],  radius: 150, color: 0xc2a176, ground: 'sand',   fog: 0x06283a, water: true, dock: [-193, 190] },
      // ── OUTER REALM RING (2026-09-21 "full map" — every 2D realm now exists in 3D) ──
      // 2D world-regions parity: meadow(farm) SE, suburb E, volcano NE, darkforest NW.
      { id: 'meadow',     name: 'Meadowfields',   center: [400, 400],   radius: 170, color: 0x8fd06a, ground: 'meadow', fog: 0x0a140a, water: false },
      { id: 'suburb',     name: 'The Suburbs',    center: [540, 40],    radius: 150, color: 0x9aa8b8, ground: 'grid',   fog: 0x0a0e14, water: false },
      { id: 'volcano',    name: 'Emberfall',     center: [420, -380],  radius: 170, color: 0x8a2a10, ground: 'lava',   fog: 0x1a0600, water: false, dock: null },
      { id: 'darkforest', name: 'Darkforest',    center: [-420, -380], radius: 170, color: 0x2a3a4a, ground: 'void',   fog: 0x04060a, water: false },
    ],

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
    realmColliders: [
      // EMBERFALL (volcano crater shelf, center [420,-380])
      { x: 420,   z: -380,   r: 30, label: 'volcano-fortress' },
      { x: 331.6, z: -329,   r: 18, label: 'volcano-forge-tower' },
      { x: 515.2, z: -437.8, r: 8,  label: 'volcano-ritual-circle' },
      // DARKREALM (center [-420,-380])
      { x: -420,   z: -380,   r: 34, label: 'castle-siege' },
      { x: -331.6, z: -448,   r: 4,  label: 'obsidian-rocks-1' },
      { x: -513.5, z: -303.5, r: 5,  label: 'obsidian-rocks-2' },
      { x: -321.4, z: -295,   r: 3,  label: 'crystal-cluster-1' },
      { x: -518.6, z: -291.6, r: 3,  label: 'crystal-cluster-2' },
      { x: -403,   z: -274.6, r: 3,  label: 'crystal-cluster-3' },
      // SUBURB (center [540,40])
      { x: 465,   z: 92.5, r: 20, label: 'bld-apartment-pod-block' },
      { x: 517.5, z: -35,  r: 18, label: 'bld-inverted-cube-hab' },
      { x: 607.5, z: 100,  r: 20, label: 'bld-neon-observatory-office' },
      { x: 622.5, z: 10,   r: 19, label: 'bld-sea-terrace-spire-office' },
      { x: 540,   z: 122.5,r: 16, label: 'bld-holo-market' },
      // MEADOWFIELDS (center [400,400])
      { x: 400,   z: 400,   r: 24, label: 'homes-mushroom-pods-1' },
      { x: 315,   z: 468,   r: 14, label: 'homes-mushroom-pods-2' },
      { x: 476.5, z: 328.6, r: 13, label: 'homes-mushroom-pods-3' },
    ],

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
})();
