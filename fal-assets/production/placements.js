// SHADDAI · placements.js — WHERE every new model goes in the 3D world (map.html draws + edits this).
// Coordinates = world units on XZ (1u ≈ 1m; player 1.8u). +Z = south. Source/city center = [0,0].
// status: shipped (compressed GLB in fal-assets/production/ship) · concept (approved image, no 3D yet) · planned
// kind:   one = single placement · replace = swaps an existing model IN PLACE (same coords) · scatter = zone
// Owner drags markers in map.html, presses "Copy layout", and pastes it back to Claude to wire into code.
window.FAL_PLACEMENTS = [
  // ── SHIPPED (3D done) ──────────────────────────────────────────────────────────────
  { id: 'bld-shop',        status: 'shipped', kind: 'one',  pos: [-40, -85], rot: 0,    r: 26, note: 'IN WORLD — north plaza; sized to ASSET-SPEC 12-13 m base (50 u wide, ~29 u tall)' },
  { id: 'bld-arcade',      status: 'shipped', kind: 'one',  pos: [62, -55],  rot: -0.8, r: 31, note: 'IN WORLD — NE plaza (free-ground map); 16 m = 62 u tall' },
  { id: 'hub-dock',        status: 'shipped', kind: 'one',  pos: [-330, 330], rot: 0.8, r: 24, note: 'HELD — harbor already has a dock; goes to the ocean farm field' },
  { id: 'veh-skiff',       status: 'shipped', kind: 'replace', pos: [-242, 255], r: 6,  note: 'replaces ocean-skiff in world-ocean.js (same id + width)' },
  { id: 'prop-signpost',   status: 'shipped', kind: 'one', multi: [[53, 50], [72, 5], [50, -48], [-53, -49], [-49, 51], [-2, 72]], r: 2, note: 'one at every trail head (meadow, suburb, volcano, darkforest, ocean, colosseum)' },
  { id: 'prop-neon-tree',  status: 'shipped', kind: 'one', multi: [[130, 0], [-130, 0], [-65, -113], [0, -60], [40, -40], [-20, -50]], r: 14, note: 'IN WORLD — 6 m = 23 u; moved 3 off existing props' },
  { id: 'hub-bridge-span', status: 'shipped', kind: 'one', multi: [[318, 318], [449, 33], [334, -302], [-334, -302], [-320, 310]], r: 10, note: 'light bridges across each mountain pass (R≈450)' },
  { id: 'prop-crate',      status: 'shipped', kind: 'one', multi: [[36, 110], [44, 118], [30, 122], [-86, 124]], r: 3, note: 'IN WORLD — garage + bazaar' },
  { id: 'hub-door',        status: 'shipped', kind: 'attach', note: 'door module: attached to every enterable building (2.2×1.2m opening), not placed alone' },
  { id: 'item-rune-hammer', status: 'shipped', kind: 'attach', note: 'PIKADON weapon → hand bone' },
  { id: 'item-quill-pen',  status: 'shipped', kind: 'attach', note: 'QUILL weapon → hand bone' },

  // ── REALM LANDMARKS (approved concepts → 3D next, ~$0.375 each) ───────────────────────
  { id: 'hero-colosseum',          status: 'concept', kind: 'replace', pos: [-14, 460], r: 46, note: 'replaces bld-mecha-arena on the walk-in plateau' },
  { id: 'hero-fortress',           status: 'concept', kind: 'replace', pos: [420, -380], r: 30, note: 'Emberfall crater shelf; gate on the SW face' },
  { id: 'hero-castle',             status: 'concept', kind: 'replace', pos: [-420, -380], r: 34, note: 'Darkforest; drawbridge on the SE face, moat r34' },
  { id: 'bld-shaddai-hall',        status: 'concept', kind: 'one', pos: [0, 150], r: 10, note: 'owner-picked SHADDAI hall (sign fixed) — the city front door' },
  { id: 'hero-forest-amphitheater', status: 'concept', kind: 'one', pos: [215, 150], r: 25, note: 'Quill Forest center (ref C2 Sylvan Arena)' },
  { id: 'hero-sky-dome',           status: 'concept', kind: 'one', pos: [-150, -250], r: 30, note: 'Arctic Vault — green dome in the snow (ref W1)' },
  { id: 'hero-desert-terminal',    status: 'concept', kind: 'one', pos: [150, -250], r: 22, note: 'Sand Sea hyperloop terminal (ref W5)' },
  { id: 'hero-void-rift-gate',     status: 'concept', kind: 'one', pos: [0, -370], r: 18, note: 'Deep Void center' },
  { id: 'hero-arctic-outpost',     status: 'concept', kind: 'one', pos: [-95, -300], r: 14, note: 'Arctic research outpost' },
  { id: 'hero-beach-market-dome',  status: 'concept', kind: 'one', pos: [-250, 235], r: 14, note: 'Crystal Sea market in the shallows (ref C1)' },
  { id: 'hero-farm-sky-structure', status: 'concept', kind: 'one', pos: [440, 450], r: 20, note: 'Meadowfields floating farm (ref W4)' },
  { id: 'hero-mushroom-pods',      status: 'concept', kind: 'replace', pos: [400, 400], r: 24, note: 'replaces homes-mushroom-pods (ref W7)' },
  { id: 'hero-city-megatower',     status: 'concept', kind: 'one', pos: [575, -45], r: 18, note: 'Suburbs skyline anchor (ref W6)' },

  // ── STREET + ROOM KITS (approved concepts) ────────────────────────────────────────────
  { id: 'prop-street-lamp',   status: 'concept', kind: 'along', note: 'every 40u along all 6 light-trail roads' },
  { id: 'prop-kiosk',         status: 'concept', kind: 'one', multi: [[-112, 88], [-88, 118], [-205, 178]], r: 2, note: 'bazaar + dock' },
  { id: 'prop-transit-stop',  status: 'concept', kind: 'one', multi: [[20, 80], [380, 0], [-270, 250]], r: 3, note: 'plaza, suburb gate, harbor' },
  { id: 'prop-holo-fountain', status: 'concept', kind: 'one', pos: [0, 60], r: 4, note: 'plaza ring 60, in front of the Source' },
  { id: 'prop-statue-shaddai', status: 'concept', kind: 'one', pos: [0, 200], r: 3, note: 'south processional, facing the colosseum road' },
  { id: 'prop-ore-node',      status: 'concept', kind: 'one', multi: [[380, -300], [470, -430], [-470, -330]], r: 2, note: 'mining nodes in Emberfall + Darkforest' },
  { id: 'kit-tourney-*',      status: 'concept', kind: 'interior', note: 'COLOSSEUM Tourney Hall props (world-interiors.js THEMES)' },
  { id: 'kit-garage-*',       status: 'concept', kind: 'interior', note: 'GARAGE Hover Works props' },
  { id: 'kit-war-*',          status: 'concept', kind: 'interior', note: 'FORTRESS War Room props' },
  { id: 'kit-siege-*',        status: 'concept', kind: 'interior', note: 'CASTLE Siege Keep props' },

  // ── FREE NATURE (Quaternius CC0, public/assets/models/nature — 36 models, 2.6MB) ─────────
  { id: 'nature: maple + birch + bush + flowers', status: 'shipped', kind: 'scatter', pos: [215, 150], r: 120, note: 'Quill Forest' },
  { id: 'nature: grass + flowers + bush',         status: 'shipped', kind: 'scatter', pos: [400, 400], r: 150, note: 'Meadowfields' },
  { id: 'nature: dead trees',                     status: 'shipped', kind: 'scatter', pos: [-420, -380], r: 140, note: 'Darkforest (outside the moat)' },
  { id: 'nature: grass + bush (road verges)',     status: 'shipped', kind: 'scatter', pos: [0, 0], r: 370, ring: 250, note: 'outer city belt between R250 and R370' },
];
