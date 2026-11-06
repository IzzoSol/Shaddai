/* SHADDAI Opus handoff builder — run: node tools/build-opus-handoff.mjs
   1) Flips stale DELETE marks on protected (in-game/dynamic) files to KEEP
   2) Writes public/__opus-placement-queue.json — the world-finish worklist:
      scan + audit notes + realm/where placement, sorted into queues for Opus.
   Rerun anytime after more auditing — output is regenerable, never destructive. */
import { readFileSync, writeFileSync } from 'fs';

const ROOT = 'C:/Users/Brittany/Shaddai-3d/';
const scan = JSON.parse(readFileSync(ROOT + 'public/__glb-scan.json', 'utf8'));
const nd = JSON.parse(readFileSync(ROOT + 'public/__asset-notes.json', 'utf8'));
const notes = nd.notes;
const DYN = ['artisan', 'japanese-arch', 'hero-sky-dome', 'hero-city-megatower',
  'bld-apartment-pod', 'bld-holo-market', 'bld-inverted-cube'];
const today = new Date().toISOString().slice(0, 10);

/* 1) flip stale delete marks on protected files */
const byPath = new Map(scan.map(f => [f.path, f]));
let flipped = 0;
for (const [p, n] of Object.entries(notes)) {
  if (!n || (n.decision || '').toLowerCase() !== 'delete' || n.deleted) continue;
  const s = byPath.get(p);
  if (!s) continue;
  const dyn = s.inGame || /\/lod\//i.test(s.path) || /-lod\d\.glb$/i.test(s.name)
    || DYN.some(st => s.name.toLowerCase().includes(st));
  if (dyn) {
    n.decision = 'keep';
    n.note = (n.note ? n.note + ' | ' : '') + 'auto: stale delete mark flipped to keep (file is live in the game)';
    n.updated = today;
    flipped++;
  }
}
writeFileSync(ROOT + 'public/__asset-notes.json', JSON.stringify(nd, null, 1));
console.log('stale delete marks flipped to keep:', flipped);

/* 2) placement map (mirrors the viewer's PLACEMENT table — docs/ASSET-AUDIT-20261017.md §4) */
const PLACEMENT = [
  ['race_hq','race','THE GRID — beside Dragon Gate [1737,-303]'],
  ['hoverboard','plaza','Mount stores — 10 board designs'],
  ['colosseum_lobby','grid','Colosseum entrance'],
  ['hover_league','grid','Colosseum arena — Hover League mode'],
  ['athenaeum','grid','Athenaeum district NW [-512, 709]'],
  ['furniture_kit','grid','All building interiors'],
  ['bot_grok','grid','Shop counters + offices'], ['bot_muse','grid','Shop counters + offices'],
  ['maglev_kit','grid','Maglev ring stations r=2829m'],
  ['sign_kit','grid','District signs throughout'],
  ['race_kit','race','Race track dressing — gates, barriers'],
  ['station_grid','grid','Grid realm — maglev ring'], ['town_grid','grid','Grid realm town'],
  ['station_void','void','Void realm — rift gate'], ['town_void','void','Void realm town'],
  ['station_desert','desert','Desert realm — sand arches'], ['town_desert','desert','Desert realm town'],
  ['station_volcano','volcano','Volcano realm — lava rocks, dragon'], ['town_volcano','volcano','Volcano realm town'],
  ['station_forest','forest','Forest realm — moss, mushrooms'], ['town_forest','forest','Forest realm town'],
  ['station_suburb','suburb','Suburb realm'], ['town_suburb','suburb','Suburb realm town'],
  ['station_meadow','meadow','Meadow realm — rune arches'], ['town_meadow','meadow','Meadow realm town'],
  ['station_ocean','ocean','Ocean realm — harbor, coral'], ['town_ocean','ocean','Ocean realm town'],
  ['station_darkforest','darkforest','Darkforest realm — castle siege'], ['town_darkforest','darkforest','Darkforest realm town'],
  ['station_arctic','arctic','Arctic realm — ice formations'], ['town_arctic','arctic','Arctic realm town'],
  ['realm_props','grid','Universal props — all realms'],
  ['transit_kit','grid','Transit gates — all stations'],
  ['reef','reef','Reef City A/B — glass tube train'],
  ['naval','ocean','Ocean realm harbor'], ['water_link','ocean','Ocean realm — harbor link'],
  ['hawk','ocean','Sky Hawk mount — Harbor realm (free)'],
  ['mammoth','arctic','Glacier Mammoth mount — Arctic realm'],
  ['bull','volcano','Forge Bull mount — Volcano forge'],
  ['gorilla','darkforest','Canopy Gorilla mount — Darkforest/Suburb'],
  ['catamaran','reef','Circling the reef'],
  ['superyacht','reef','Docked near the reef'],
  ['submarine','reef','Half-sunk near the reef'],
  ['skiff','ocean','Ocean realm'],
  ['powerarmor','volcano','Volcano realm — mining mech'],
  ['monowheel','grid','THE GRID — city mech'],
  ['shaddai_ship','race','Race HQ showroom + circuits'],
  ['volcano-dragon','volcano','VOLCANO REALM — the dragon'],
  ['castle-siege','darkforest','DARKFOREST REALM — castle'],
  ['hoverskate','skate','Hoverskate park [-880, 0]'],
  ['park_dress','plaza','The plaza — park dressing'],
  ['weapons_v01','grid','Weapon displays in shops'],
  ['iodine','void','Void realm creature'],
  ['gabi','suburb','NPC — Suburb/Meadow towns'],
  ['engineer','grid','NPC — Race HQ mechanic, Forge'],
  ['mage','grid','NPC — Athenaeum, Void realm'],
  ['scout','darkforest','NPC — Darkforest, Desert camps'],
  ['warrior','grid','NPC — Colosseum, arenas'],
  ['leadr','grid','NPC — District leader'],
  ['shaddai-v2','plaza','Alt player character'],
  ['spire','grid','Landmark towers — grid-city-v4.json'],
  ['_slab','grid','Landmark towers — grid-city-v4.json'],
  ['setback','grid','Landmark towers — grid-city-v4.json'],
];
function placementOf(f) {
  if (f.type === 'agent' || /^(ZEROX|NEXUS|ORACLE|TURTLE|QUILL|PIKADON|SHADDAI|VILLAIN)\.glb$/i.test(f.name))
    return { realm: 'plaza', text: 'Plaza hexagon — council agent r=260' + (/^SHADDAI\.glb$/i.test(f.name) ? ' · THE SOURCE [0,0]' : '') };
  const n = f.name.toLowerCase();
  for (const e of PLACEMENT) if (n.includes(e[0])) return { realm: e[1], text: e[2] };
  return null;
}
function tierOf(f) {
  const n = f.name.toLowerCase(), p = f.path.toLowerCase();
  if (f.inGame) return 'S';
  if (/(_attempt|_old-|\/spike\/|\/_test|base_basic|-raw\.glb)/.test(p)) return 'F';
  if (f.kb < 10) return 'F';
  if (f.type === 'production' && f.mb > 20) return 'F';
  if (/-mesh\.glb$|(walking|running|action)\.glb$|_armature\.glb$/.test(n)) return 'D';
  if (f.rig) return 'A';
  if (['world','creature','mount','vehicle','skate','reef'].includes(f.type)) return 'B';
  return 'C';
}

/* 3) build the queues */
const realmOrder = { plaza: 0, grid: 1, void: 2, desert: 3, volcano: 4, forest: 5,
  suburb: 6, meadow: 7, ocean: 8, darkforest: 9, arctic: 10, reef: 11, race: 12, skate: 13 };
const mk = f => {
  const n = notes[f.path] || {};
  const p = placementOf(f) || {};
  return { path: f.path, name: f.name, mb: f.mb, tier: tierOf(f), inGame: !!f.inGame,
    realm: p.realm || '', where: p.text || '', decision: n.decision || '',
    rank: n.rank || 0, note: n.note || '' };
};
const byRealm = (a, b) =>
  ((realmOrder[a.realm] !== undefined ? realmOrder[a.realm] : 90) - (realmOrder[b.realm] !== undefined ? realmOrder[b.realm] : 90))
  || a.name.localeCompare(b.name);
const place = [], keep = [], fix = [], unrated = [], deployed = [];
for (const f of scan) {
  const e = mk(f);
  if (f.inGame) { deployed.push(e); continue; }
  const d = (notes[f.path] || {}).decision;
  if (d === 'place') place.push(e);
  else if (d === 'keep') keep.push(e);
  else if (d === 'fix') fix.push(e);
  else unrated.push(e);
}
[place, keep, fix, unrated, deployed].forEach(q => q.sort(byRealm));

const out = {
  _readme: 'SHADDAI world-finish worklist for the Opus session. Generated by tools/build-opus-handoff.mjs from public/__glb-scan.json + public/__asset-notes.json. ' +
    'Queues: place (owner marked PLACE — place these first), keep (keepers not yet in world), fix (repair first — see each note), ' +
    'unrated (no decision — lowest priority, place by tier), deployed (already in the game — do not move or delete). ' +
    'Each entry: path, name, mb, tier (S in-game / A rigged / B unique source / C other / D-F already purged), realm + where (the world placement from docs/ASSET-AUDIT-20261017.md §4), ' +
    'decision + rank + note (the owner audit). Join against the notes file for full history. Regenerate after more auditing with: node tools/build-opus-handoff.mjs',
  generated: new Date().toISOString(),
  stats: {
    liveFiles: scan.length,
    deployed: deployed.length, place: place.length, keep: keep.length,
    fix: fix.length, unrated: unrated.length,
    withRealms: [place, keep, fix, unrated].flat().filter(e => e.realm).length,
  },
  queues: { place, keep, fix, unrated, deployed },
};
writeFileSync(ROOT + 'public/__opus-placement-queue.json', JSON.stringify(out, null, 1));
console.log('queue written: public/__opus-placement-queue.json');
console.log('  deployed:', deployed.length, '| place:', place.length, '| keep:', keep.length,
  '| fix:', fix.length, '| unrated:', unrated.length);
console.log('  non-deployed files with a realm home:', out.stats.withRealms);
