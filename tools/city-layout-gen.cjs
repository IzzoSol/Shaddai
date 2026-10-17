// node tools/city-layout-gen.cjs — DESIGNED district layout for the Grid (owner ref image 66: per district ~5 hero buildings in one plaza, a small grid of
// city blocks around it filled with our existing city building models, roads between blocks, some blocks left as claimable plots).
// Writes public/assets/world/grid-fabric-districts-v1.json in the grid-fabric item format (world-clusters-v4 renders it as-is) + roads + plots.
// Shaddai city in the middle (r < 300 m) is untouched; districts sit at r ~800 m on the quadrant bisectors; landmark K1 towers stay where they are.
// Deterministic (no randomness beyond a fixed hash).
const fs = require('fs'), path = require('path');
{ const cur = path.join(__dirname, '..', 'public/assets/world/grid-fabric-districts-v1.json'); try { if (JSON.parse(fs.readFileSync(cur, 'utf8')).version >= 3 && !process.argv.includes('--force')) { console.log('grid-fabric-districts-v1.json is OWNER-PLACED (Blender 37_LAYOUT_PREVIEW, v3) - not overwriting. Use --force to regenerate.'); process.exit(0); } } catch (e) {} }
const PUB = path.join(__dirname, '..', 'public');
const fabric = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/world/grid-fabric-v4.json'), 'utf8'));
const D = [   // id, bearing (deg clockwise from N), heroes [key, len_m], block building keys
  { id: 'academy', b: 315, heroes: [['sc-techlab', 44], ['sc-techlab', 34], ['sc-techlab', 34], ['sc-techlab', 34], ['sc-teleport', 20]], blocks: ['sc-techlab', 'sc-storefront-s'] },
  { id: 'trade', b: 45, heroes: [['sc-market', 46], ['sc-market', 36], ['sc-market', 36], ['sc-storefront-l', 34], ['sc-ad-pylon', 18]], blocks: ['sc-storefront-s', 'sc-storefront-l'] },
  { id: 'forge', b: 225, heroes: [['sc-storefront-l', 44], ['sc-techlab', 36], ['sc-techlab', 36], ['sc-storefront-l', 34], ['sc-teleport', 20]], blocks: ['sc-storefront-l', 'sc-techlab'] },
  { id: 'residential', b: 135, heroes: [['sc-storefront-l', 40], ['sc-storefront-s', 30], ['sc-storefront-s', 30], ['sc-storefront-s', 30], ['sc-teleport', 20]], blocks: ['sc-storefront-s', 'sc-storefront-s'] }
];
const R = 860, BLOCK = 140, ROAD = 34, COLS = 5, ROWS = 4, PLOTS = [[0, 0], [4, 0], [0, 3], [4, 3], [1, 3]], HERO = [[2, 1], [2, 2]];   // owner 2026-10-16: space out more, more buildings + plots
const items = [], roads = [], plots = [], districts = [];
const hash = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
D.forEach((d) => {
  const br = d.b * Math.PI / 180, ox = R * Math.sin(br), oy = R * Math.cos(br);   // district centre (east, north)
  const vx = Math.sin(br), vy = Math.cos(br), ux = Math.cos(br), uy = -Math.sin(br);   // v = outward (radial), u = tangential
  const W = COLS * BLOCK + (COLS - 1) * ROAD, H = ROWS * BLOCK + (ROWS - 1) * ROAD;
  const at = (u, v) => [ox + ux * u + vx * v, oy + uy * u + vy * v];
  const blockC = (c, r) => [-W / 2 + BLOCK / 2 + c * (BLOCK + ROAD), -H / 2 + BLOCK / 2 + r * (BLOCK + ROAD)];
  const yawFace = (du, dv) => (Math.atan2(ux * du + vx * dv, uy * du + vy * dv) * 180 / Math.PI + 360) % 360;   // bearing the front faces
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const [bu, bv] = blockC(c, r), isHero = HERO.some((h) => h[0] === c && h[1] === r), isPlot = PLOTS.some((p) => p[0] === c && p[1] === r);
    if (isHero) continue;
    if (isPlot) { const p = at(bu, bv); plots.push({ id: 'PLOT-' + d.id.toUpperCase() + '-' + (plots.filter((q) => q.district === d.id).length + 1), district: d.id, x_m: +p[0].toFixed(1), y_m: +p[1].toFixed(1), size_m: BLOCK - 12, yaw: d.b }); continue; }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([su, sv], k) => {   // 4 buildings per block, fronts toward the nearest road
      const u = bu + su * 36, v = bv + sv * 36, p = at(u, v), key = d.blocks[Math.floor(hash(c * 7 + k, r * 13 + d.b) * d.blocks.length)];
      items.push({ key, x_m: +p[0].toFixed(1), y_m: +p[1].toFixed(1), len_m: 36, yaw: +yawFace(su, sv).toFixed(1), lift_m: 0, by_height: false, cluster: d.id, role: 'block' });
    });
  }
  // HERO PLAZA: the two middle blocks + the road between them = one plaza; 1 big hero in the middle, 4 around it, all facing the centre
  const [h0u, h0v] = blockC(2, 1), [, h1v] = blockC(2, 2), pu = h0u, pv = (h0v + h1v) / 2;   // plaza = the two centre blocks of the middle column (radial)
  const spots = [[0, 0], [-42, -105], [42, -105], [-42, 105], [42, 105]];
  d.heroes.forEach(([key, len], i) => { const p = at(pu + spots[i][0], pv + spots[i][1]); items.push({ key, x_m: +p[0].toFixed(1), y_m: +p[1].toFixed(1), len_m: Math.round(len * 1.4), yaw: +(i === 0 ? (d.b + 180) % 360 : yawFace(-spots[i][0], -spots[i][1])).toFixed(1), lift_m: 0, by_height: false, cluster: d.id, role: 'hero' }); });
  // ROADS: perimeter ring, internal grid, and an avenue back to the Shaddai city plaza (r 300 m)
  const seg = (u0, v0, u1, v1, w) => { const a = at(u0, v0), b = at(u1, v1); roads.push({ district: d.id, x0: +a[0].toFixed(1), y0: +a[1].toFixed(1), x1: +b[0].toFixed(1), y1: +b[1].toFixed(1), w }); };
  const E = ROAD / 2;
  seg(-W / 2 - E, -H / 2 - E, W / 2 + E, -H / 2 - E, ROAD); seg(-W / 2 - E, H / 2 + E, W / 2 + E, H / 2 + E, ROAD); seg(-W / 2 - E, -H / 2 - E, -W / 2 - E, H / 2 + E, ROAD); seg(W / 2 + E, -H / 2 - E, W / 2 + E, H / 2 + E, ROAD);
  for (let c = 1; c < COLS; c++) { const u = -W / 2 + c * (BLOCK + ROAD) - E; seg(u, -H / 2, u, H / 2, ROAD); }
  for (let r = 1; r < ROWS; r++) { const v = -H / 2 + r * (BLOCK + ROAD) - E; seg(-W / 2, v, W / 2, v, ROAD); }
  seg(0, -H / 2 - E, 0, -(R - 300), 30);   // district avenue to the city plaza
  districts.push({ id: d.id, bearing: d.b, centre_m: [+ox.toFixed(1), +oy.toFixed(1)], size_m: [W, H] });
});
// keep the 24 K1 landmark towers where they stand (hard work, skyline); block buildings within 30 m of a tower give way
const towers = fabric.items.filter((it) => /^sc-tower-/.test(it.key));
for (let i = items.length - 1; i >= 0; i--) if (items[i].role === 'block' && towers.some((t) => Math.hypot(t.x_m - items[i].x_m, t.y_m - items[i].y_m) < 30)) items.splice(i, 1);
towers.forEach((it) => items.push(Object.assign({}, it, { role: 'landmark' })));
const out = { version: 1, note: 'designed district layout (tools/city-layout-gen.cjs, owner ref image 66); grid-fabric item format + roads + plots', units_per_m: fabric.units_per_m, counts: { items: items.length, roads: roads.length, plots: plots.length }, districts, items, roads, plots };
fs.writeFileSync(path.join(PUB, 'assets/world/grid-fabric-districts-v1.json'), JSON.stringify(out, null, 1));
console.log('items', items.length, '(heroes', items.filter((i) => i.role === 'hero').length, 'blocks', items.filter((i) => i.role === 'block').length, 'towers', items.filter((i) => i.role === 'landmark').length + ') roads', roads.length, 'plots', plots.length);
