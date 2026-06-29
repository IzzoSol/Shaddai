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

  window.WORLD_LAYOUT = {
    half: 380,
    spawn: [0, 2, 70],          // player start: on the central axis, just south of the Source
    sacred: { radius: R, center: [0, 0], rings: [60, 130, 200, 260] }, // concentric plaza rings

    // ── BIOME REGIONS (nearest-center wins for ground/fog blending) ──
    biomes: [
      { id: 'grid',   name: 'The Grid',     center: [0, 0],       radius: 200, color: 0x27e0ff, ground: 'grid',   fog: 0x000814, water: false },
      { id: 'forest', name: 'Quill Forest', center: [210, 150],   radius: 150, color: 0x3ddc84, ground: 'meadow', fog: 0x0a1a0a, water: false },
      { id: 'arctic', name: 'Arctic Vault', center: [-150, -240], radius: 150, color: 0xaaddff, ground: 'snow',   fog: 0xaaccee, water: true  },
      { id: 'desert', name: 'Sand Sea',     center: [150, -240],  radius: 150, color: 0xff7a18, ground: 'sand',   fog: 0x1a0800, water: false },
      { id: 'void',   name: 'Deep Void',    center: [0, -360],    radius: 130, color: 0x9b59f5, ground: 'void',   fog: 0x050010, water: false },
    ],

    // ── AGENT SECTORS — Seed of Life. SHADDAI = center; 6 agents on the hexagon. ──
    sectors: [
      { code: 'SHADDAI', name: 'The Source',       pos: [0, 0],   biome: 'grid',   building: 'spire',    color: 0xffcf4a },
      { code: 'NEXUS',   name: 'The Navigator',    pos: FRONT_L,  biome: 'grid',   building: 'dome',     color: 0x34e5b0 },
      { code: 'QUILL',   name: 'Library Entrance', pos: FRONT_R,  biome: 'forest', building: 'library',  color: 0xb98cff },
      { code: 'ORACLE',  name: 'The Esoteric Wing',pos: SIDE_R,   biome: 'forest', building: 'spires',   color: 0xc084fc },
      { code: 'TURTLE',  name: 'The Museum',       pos: BACK_R,   biome: 'desert', building: 'gallery',  color: 0x1fd6c4 },
      { code: 'PIKADON', name: 'The Aegis',        pos: BACK_L,   biome: 'arctic', building: 'fortress', color: 0xff5a6e },
      { code: 'ZEROX',   name: 'The Markets',      pos: SIDE_L,   biome: 'grid',   building: 'exchange', color: 0x27e0ff },
    ],

    // ── ROADS (the Source radiates to all 6; Quill links to its Esoteric wing) ──
    roads: [
      ['SHADDAI', 'NEXUS'], ['SHADDAI', 'QUILL'], ['SHADDAI', 'ORACLE'],
      ['SHADDAI', 'TURTLE'], ['SHADDAI', 'PIKADON'], ['SHADDAI', 'ZEROX'],
      ['QUILL', 'ORACLE'],
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
