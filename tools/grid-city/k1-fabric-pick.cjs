// node tools/grid-city/k1-fabric-pick.cjs [N=24] — puts the Blender K1 towers (sc-tower-slab/setback/spire, built by k1-to-library.mjs) into the
// LIVE city: public/assets/world/grid-fabric-v4.json (world-clusters-v4.js, the same file the Blender scene reads).
// Rule: mid-rise offices (sc-office-mid) in the Commons + NE Campus (never the NW race quarter), >= 150 m apart, >= 70 m from the Meridian-8
// race track; nearest the cluster centres first. Kind by rank (spire / slab / setback), height 110-170 m (by_height). Each changed item keeps
// its original key in `was` so `--undo` restores the file exactly. Deterministic.
const fs = require('fs'), path = require('path');
const FAB = path.join(__dirname, '../../public/assets/world/grid-fabric-v4.json');
const fab = JSON.parse(fs.readFileSync(FAB, 'utf8'));
const dump = (o) => JSON.stringify(o).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));   // the file escapes non-ASCII
fab.items.forEach((it) => { if (it.was) { it.key = it.was.key; it.len_m = it.was.len_m; it.by_height = it.was.by_height; delete it.was; } });   // start clean
if (process.argv.includes('--undo')) { fs.writeFileSync(FAB, dump(fab)); console.log('restored'); process.exit(0); }
const N = +(process.argv[2] || 24);
const track = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/track-meridian-8.json'), 'utf8')).frames.map((f) => [f.p[0], -f.p[2]]);
const nearTrack = (x, y) => track.some((p) => Math.hypot(p[0] - x, p[1] - y) < 70);
// world-clusters-v4.js keeps only items whose position hash < 0.3 AND drops every *office* key (owner 2026-10-11 'janky offices'), and drops
// race-deck keys (track-clear-v4.json). So: pick office spots that pass the hash = lots that are EMPTY in the game today -> the tower fills them.
const kept = (it) => Math.abs(Math.sin(it.x_m * 12.9898 + it.y_m * 78.233) * 43758.5453) % 1 < 0.3;
const clear = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/assets/world/track-clear-v4.json'), 'utf8')).keys);
const per = { commons: Math.ceil(N / 2), 'ne-campus': Math.floor(N / 2) }, picked = [];
for (const cl of Object.keys(per)) {
  const items = fab.items.filter((it) => it.cluster === cl && it.key === 'sc-office-mid' && kept(it) && !clear.has(it.x_m + ',' + it.y_m));
  const cx = items.reduce((s, i) => s + i.x_m, 0) / items.length, cy = items.reduce((s, i) => s + i.y_m, 0) / items.length;
  items.sort((a, b) => Math.hypot(a.x_m - cx, a.y_m - cy) - Math.hypot(b.x_m - cx, b.y_m - cy) || a.x_m - b.x_m);
  let n = 0;
  for (const it of items) {
    if (n >= per[cl]) break;
    if (nearTrack(it.x_m, it.y_m) || picked.some((p) => Math.hypot(p.x_m - it.x_m, p.y_m - it.y_m) < 150)) continue;
    picked.push(it); n++;
  }
}
const KINDS = ['spire', 'slab', 'setback'], H = { spire: 170, slab: 140, setback: 120 };
picked.forEach((it, i) => {
  const kind = KINDS[i % 3], h = H[kind] - (Math.floor(i / 3) % 3) * 10;
  it.was = { key: it.key, len_m: it.len_m, by_height: it.by_height }; it.key = 'sc-tower-' + kind; it.len_m = h; it.by_height = true;
});
fs.writeFileSync(FAB, dump(fab));
const doc = { version: 2, note: 'K1 towers in the LIVE city = grid-fabric-v4.json items with key sc-tower-* (tools/grid-city/k1-fabric-pick.cjs). Metres, X east, Y north.', towers: picked.map((it) => ({ key: it.key, x_m: it.x_m, y_m: it.y_m, yaw: it.yaw, h_m: it.len_m, cluster: it.cluster })) };
fs.writeFileSync(path.join(__dirname, '../../public/assets/world/city-kit-towers.json'), JSON.stringify(doc, null, 1));
const c = {}; picked.forEach((p) => (c[p.key] = (c[p.key] || 0) + 1)); console.log('picked', picked.length, JSON.stringify(c));
