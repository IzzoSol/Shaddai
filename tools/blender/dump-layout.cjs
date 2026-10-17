// node tools/blender/dump-layout.cjs out.json → WORLD_LAYOUT (+ colosseum world + transit derived) as JSON for Blender
global.window = global; global.document = { createElement: () => ({}) };
require('../../public/world-layout.js'); require('../../public/world-transit.js'); require('../../public/world-colosseum.js');
const L = window.WORLD_LAYOUT, cw = window.COLOSSEUM_WORLD;
const out = { half: L.half, cityR: L.city.radius, transitR: L.transit.radius,
  biomes: L.biomes.map((b) => ({ id: b.id, name: b.name, c: b.center, r: b.radius, color: b.color })),
  stations: L.stations.map((s) => ({ id: s.id, name: s.name, pos: s.pos, dragon: s.dragon })),
  landmarks: (L.landmarks || []).map((l) => ({ id: l.id, name: l.name, pos: l.pos, fp: l.footprint })),
  models: L.realmModels.map((m) => ({ id: m.id, realm: m.realm, x: m.x, z: m.z, y: m.y || 0, ry: m.ry || 0, w: m.w, len: m.len, url: m.url })),
  colliders: L.realmColliders.filter((c) => c.label === 'maglev-pylon').length,
  colosseum: cw && { x: cw.x, z: cw.z, face: cw.face, door: cw.door } };
require('fs').writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log('models', out.models.length, 'biomes', out.biomes.length, 'stations', out.stations.length);
