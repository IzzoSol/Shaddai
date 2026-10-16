// node tools/grid-city/garden-plots.cjs — the city's garden lots (sc-garden, the "little plots with a chair" the owner flagged 2026-10-16) become
// FOR-SALE PLOTS in the existing deed list public/assets/world/plots-v4.json (world-city-v3.js beacons: colour = ledger state, state 'empty'
// = for sale). Only lots the world-clusters-v4 loader would have shown (hash < 0.3, not a race-deck lot, outside the hoverskate park).
// Ids PLOT-CITY-0001.. are rebuilt on every run (idempotent); the SW plots are untouched. NFT/minting is NOT wired: legal review first (CLAUDE.md).
const fs = require('fs'), path = require('path'), W = path.join(__dirname, '../../public/assets/world');
const fab = JSON.parse(fs.readFileSync(path.join(W, 'grid-fabric-v4.json'), 'utf8'));
const clear = new Set(JSON.parse(fs.readFileSync(path.join(W, 'track-clear-v4.json'), 'utf8')).keys);
const hash = (it) => Math.abs(Math.sin(it.x_m * 12.9898 + it.y_m * 78.233) * 43758.5453) % 1;
const lots = fab.items.filter((it) => it.key === 'sc-garden' && hash(it) < 0.3 && !clear.has(it.x_m + ',' + it.y_m) && Math.hypot(it.x_m + 694.46, it.y_m - 1039.34) >= 172 + it.len_m * 0.5);
const PF = path.join(W, 'plots-v4.json'), doc = JSON.parse(fs.readFileSync(PF, 'utf8'));
doc.plots = doc.plots.filter((p) => !/^PLOT-CITY-/.test(p.plot_id));
lots.sort((a, b) => a.x_m - b.x_m || a.y_m - b.y_m).forEach((it, i) => {
  const s = +(it.len_m * 0.9).toFixed(1);
  doc.plots.push({ plot_id: 'PLOT-CITY-' + String(i + 1).padStart(4, '0'), x_m: it.x_m, y_m: it.y_m, w_m: s, d_m: s, yaw: it.yaw || 0, beacon_m: [it.x_m, it.y_m],
    state: 'empty', mode: null, owner_id: null, pending_sparks: 0, boost_lock: 0, art_slot: null, district: it.cluster, source: 'garden-lot' });
});
fs.writeFileSync(PF, JSON.stringify(doc).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));   // keep the file's compact, ASCII-escaped format
console.log('city plots:', lots.length, '| total plots:', doc.plots.length);
