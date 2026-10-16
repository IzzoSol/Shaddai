// node tools/grid-city/k1-tower-pick.cjs — picks which grid-city plan buildings become Blender K1 towers (slab / setback / spire).
// Output public/assets/world/city-kit-towers.json is read by BOTH world-grid-city-v4.js (game) and the Blender world assembly, so the
// two always show the same city. Rule: the N tallest 'tower' buildings; h >= 165 -> spire, footprint aspect >= 1.12 -> slab,
// else setback; uniform scale = plan height / kit height. Deterministic (no randomness).
const fs = require('fs'), path = require('path');
const N = +(process.argv[2] || 24);
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/assets/world/grid-city-v4.json'), 'utf8'));
const KIT_H = { slab: 150.27, setback: 145.24, spire: 187.2 };
// the game keeps ~35% of plan buildings by a stable position hash (world-grid-city-v4.js, owner 2026-10-11 'remove like half'); pick only survivors
const kept = (b) => Math.abs(Math.sin(b.x_m * 12.9898 + b.y_m * 78.233) * 43758.5453) % 1 < 0.35;
const towers = plan.buildings.filter((b) => b.kind === 'tower' && kept(b)).sort((a, b) => b.h_m - a.h_m || (a.id < b.id ? -1 : 1)).slice(0, N);
const out = towers.map((b) => {
  const asp = Math.max(b.w_m, b.d_m) / Math.max(1, Math.min(b.w_m, b.d_m));
  const kit = b.h_m >= 165 ? "spire" : asp >= 1.12 ? "slab" : "setback";
  const rot = b.rot_deg + (kit === 'slab' && b.d_m > b.w_m ? 90 : 0);   // slab's long side (kit x) follows the plan's long side
  return { id: b.id, kit, x_m: b.x_m, y_m: b.y_m, rot_deg: rot, scale: +(b.h_m / KIT_H[kit]).toFixed(3), h_m: b.h_m };
});
const doc = { version: 1, note: 'K1 towers replacing grid-city plan buildings (tools/grid-city/k1-tower-pick.cjs). Frame = grid-city-v4 (metres, X east, Y north).', kits: { slab: 'shaddai_tower_slab_v01.glb', setback: 'shaddai_tower_setback_v01.glb', spire: 'shaddai_tower_spire_v01.glb' }, towers: out };
fs.writeFileSync(path.join(__dirname, '../../public/assets/world/city-kit-towers.json'), JSON.stringify(doc, null, 1));
const c = {}; out.forEach((t) => (c[t.kit] = (c[t.kit] || 0) + 1)); console.log('picked', out.length, JSON.stringify(c), 'h', out[out.length - 1].h_m, '..', out[0].h_m);
