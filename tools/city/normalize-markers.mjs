#!/usr/bin/env node
// normalize-markers.mjs: rewrite public/assets/world/markers-v4.json + art-slots-v4.json to the City v3 data schema.
// This is the same schema tools/blender/canon/city_v3.py now emits, so a re-bake and this script give the same fields.
//
//   node tools/city/normalize-markers.mjs            rewrite both files (idempotent), then verify
//   node tools/city/normalize-markers.mjs --check    verify only (exit 1 on any problem, writes nothing)
//   (both modes also cross-check this binding table against the marker(...) calls in city_v3.py)
//
// Marker schema (props):
//   dashboard_id  string        on EVERY interactive marker (interactive = has dashboard_id / endpoints / merchant / skill)
//   endpoints     [{service, method?, path?, status?}]   machine-readable; service in SERVICES below.
//                 method 'MCP' = an MCP tool name in path. status 'new' = service is being written (home/race/radio).
//   sparks_price  number | null  null = not a single fixed number (see price_rule) or fixed but not yet approved
//   price_rule    'fixed' | 'seller' | 'per-skill' | 'per-class' | 'dynamic'   (present whenever sparks_price is)
//   price_unit    'each' | 'day' | 'entry'  (optional)
//   price_key     row id in docs/city-v3/PRICES.md
//   legacy        {endpoint?, sparks_price?, price_sparks?}  the old prose fields, kept for ONE release
// Art slot schema: host_type ('housing' | 'plot' | 'fabric' | 'culture-lane' | 'gallery') + host_id
//   (housing: block index · plot: plot_id · fabric: item index + host_key + host_cluster · culture-lane / gallery: marker name)
//   legacy.host keeps the old string for one release.
// SPARKS is closed-loop: no route here pays out to cash; PayBox / x402 are pay-IN rails only (DOC_SPARKS, DOC_PAYMENTS).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WD = path.join(ROOT, 'public', 'assets', 'world');
const MARKERS = path.join(WD, 'markers-v4.json');
const SLOTS = path.join(WD, 'art-slots-v4.json');
const PY = path.join(ROOT, 'tools', 'blender', 'canon', 'city_v3.py');
const CHECK_ONLY = process.argv.includes('--check');

export const SERVICES = ['economy', 'academy', 'hire', 'x402-agent', 'skills-market', 'bazaar', 'work-sessions', 'home', 'race', 'plots', 'radio', 'arcade', 'agentmail'];
export const PRICE_RULES = ['fixed', 'seller', 'per-skill', 'per-class', 'dynamic'];
export const HOST_TYPES = ['housing', 'plot', 'fabric', 'culture-lane', 'gallery'];

const ep = (service, method, p, status) => {
  const o = { service };
  if (method) o.method = method;
  if (p) o.path = p;
  if (status) o.status = status;
  return o;
};
// Real mounts (backend/server-production.js); home/race = backend/HOME-RACE-SERVICES.md (main repo, being wired); radio = proposed.
const E = {
  balance: ep('economy', 'GET', '/api/economy/balance'), catalog: ep('economy', 'GET', '/api/economy/catalog'),
  purchase: ep('economy', 'POST', '/api/economy/catalog/purchase'), spend: ep('economy', 'POST', '/api/economy/spend'),
  acCatalog: ep('academy', 'GET', '/api/academy/catalog'), acQuote: ep('academy', 'POST', '/api/academy/quote'),
  acOpen: ep('academy', 'POST', '/api/academy/open_tab'), acSpend: ep('academy', 'POST', '/api/academy/spend'), acClose: ep('academy', 'POST', '/api/academy/close_tab'),
  hireRates: ep('hire', 'GET', '/api/hire/rates'), hireAgent: ep('hire', 'POST', '/api/hire/:agent'),
  x402Hire: ep('x402-agent', 'POST', '/api/x402/agent/:name/hire'),
  workAssign: ep('work-sessions', 'POST', '/api/work/assign'), workActive: ep('work-sessions', 'GET', '/api/work/active'),
  skRun: ep('skills-market', 'POST', '/api/skills/market/:id/run'), skReceipts: ep('skills-market', 'GET', '/api/skills/receipts'),
  bzList: ep('bazaar', 'GET', '/api/bazaar/list'), bzBuy: ep('bazaar', 'POST', '/api/bazaar/buy'), bzListItem: ep('bazaar', 'POST', '/api/bazaar/list-item'),
  homeStatus: ep('home', 'GET', '/api/home/status', 'new'), homeInhabit: ep('home', 'POST', '/api/home/inhabit', 'new'),
  homeRent: ep('home', 'POST', '/api/home/rent', 'new'), homeCheckin: ep('home', 'POST', '/api/home/checkin', 'new'),
  raceTrack: ep('race', 'GET', '/api/race/track', 'new'), raceHeats: ep('race', 'GET', '/api/race/heats', 'new'),
  raceHeat: ep('race', 'GET', '/api/race/heats/:heatId', 'new'), raceEnter: ep('race', 'POST', '/api/race/heats/:heatId/enter', 'new'),
  plotBuy: ep('plots', 'MCP', 'plot_buy'), plotStatus: ep('plots', 'MCP', 'plot_status'),
  radioQueue: ep('radio', 'GET', '/api/radio/queue', 'new'), radioUnlock: ep('radio', 'POST', '/api/radio/queue/unlock', 'new'),
  arcGames: ep('arcade', 'GET', '/api/arcade/games'), arcResult: ep('arcade', 'POST', '/api/arcade/result'), arcBoard: ep('arcade', 'GET', '/api/arcade/leaderboard'),
  mail: ep('agentmail', 'GET', '/api/agentmail/messages'),
};
const price = (sparks_price, price_rule, price_key, price_unit) => ({ sparks_price, price_rule, price_key, ...(price_unit ? { price_unit } : {}) });
const nn = name => name.match(/(\d+)$/)[1];

// The ONE binding table (order matters: first match wins). city_v3.py mirrors it by hand; crossCheckPy() keeps them honest.
export const RULES = [
  [/^HUB_HOME_[A-F]$/, m => ({ endpoints: [E.homeStatus, E.homeInhabit, E.homeRent, E.homeCheckin], ...price(m.props.rent_sparks_per_day ?? 5, 'fixed', 'home.rent', 'day') })],
  [/^STALL_\d+$/, () => ({ endpoints: [E.bzList, E.bzBuy], ...price(null, 'seller', 'bazaar.item') })],
  [/^NODE_MAIL$/, () => ({ endpoints: [E.mail] })],
  [/^BLD_BROADCAST$/, () => ({ endpoints: [E.radioQueue] })],
  [/^OBJ_RADIO_QUEUE$/, m => ({ endpoints: [E.radioQueue, E.radioUnlock], ...price(m.props.unlock_slot_sparks ?? 5, 'fixed', 'radio.slot_unlock', 'each') })],
  [/^SLOT_GALLERY_\d+$/, m => ({ dashboard_id: 'culture.gallery.slot.' + nn(m.name), endpoints: [E.bzBuy], ...price(null, 'seller', 'gallery.piece') })],
  [/^BLD_GALLERY_SHOP$/, () => ({ endpoints: [E.bzList, E.bzListItem], ...price(null, 'fixed', 'gallery.listing', 'each') })],
  [/^OBJ_EXHIBIT_INTAKE$/, () => ({ endpoints: [], ...price(null, 'fixed', 'exhibit.submit', 'each') })],
  [/^ARCADE_CAB_\d+$/, m => ({ dashboard_id: 'culture.arcade.cab.' + nn(m.name), endpoints: [E.arcGames, E.arcResult] })],
  [/^BLD_ARCADE$/, () => ({ endpoints: [E.arcGames, E.arcBoard] })],
  [/^STUDIO_\d+$/, m => ({ endpoints: [E.spend], ...price(m.props.rent_sparks_per_day ?? 3, 'fixed', 'studio.rent', 'day') })],
  [/^CULTURE_LANE$/, () => ({ endpoints: [] })],
  [/^OBJ_HIRING_BOARD$/, () => ({ endpoints: [E.hireRates, E.hireAgent, E.x402Hire, E.workAssign, E.workActive], ...price(null, 'dynamic', 'hire.contract') })],
  [/^OBJ_SPARKS_KIOSK$/, () => ({ endpoints: [E.balance, E.catalog, E.purchase], ...price(null, 'dynamic', 'kiosk.catalog') })],
  [/^BAY_\d+$/, () => ({ endpoints: [E.skReceipts] })],
  [/^FRAME_\d+$/, m => ({ dashboard_id: 'forge.frame.' + nn(m.name), endpoints: [] })],
  [/^NODE_SKILL_INSTALL$/, () => ({ endpoints: [E.skRun, E.skReceipts], ...price(null, 'per-skill', 'install.tier') })],
  [/^NODE_REPAIR$/, () => ({ endpoints: [], ...price(null, 'fixed', 'forge.repair', 'each') })],
  [/^CLASS_(\d+|ART|MUSIC)$/, () => ({ endpoints: [E.acCatalog, E.acQuote, E.acOpen, E.acSpend, E.acClose], ...price(null, 'per-class', 'academy.tuition') })],
  [/^OBJ_CLASS_BOARD$/, () => ({ endpoints: [E.acCatalog] })],
  [/^(ARCHIVE|OBJ_GRADUATION_DAIS|PERCH_[A-D]|PERCH_MAIN|PLAZA_SKATE|PAD_VEHICLE_SHOP)$/, () => ({ endpoints: [] })],
  [/^GATE_START$/, m => ({ endpoints: [E.raceTrack, E.raceHeats, E.raceEnter], ...price(numOr(m, 10), 'fixed', 'race.entry', 'entry') })],
  [/^PIT_\d+$/, m => ({ endpoints: [E.raceHeat], ...price(numOr(m, 5), 'fixed', 'race.pit', 'each') })],
  [/^TOWER_RACE$/, () => ({ endpoints: [E.raceHeats] })],
  [/^VEH_[A-Z_]+$/, () => ({ endpoints: [], ...price(null, 'fixed', 'vehicle.checkout', 'day') })],
  [/^DEED_OFFICE$/, () => ({ endpoints: [E.plotBuy, E.plotStatus], ...price(null, 'dynamic', 'plot.claim') })],
  [/^BUILDER_YARD$/, () => ({ endpoints: [E.catalog, E.purchase], ...price(null, 'dynamic', 'builder.kit') })],
];
function numOr(m, dflt) {   // keep an existing numeric price (current or legacy), else the default
  const cands = [m.props.sparks_price, m.props.legacy && m.props.legacy.sparks_price];
  for (const v of cands) if (typeof v === 'number' && isFinite(v)) return v;
  return dflt;
}

const LEGACY_KEYS = ['endpoint', 'price_sparks'];
export function normalizeMarker(m) {
  const props = { ...(m.props || {}) };
  const legacy = { ...(props.legacy || {}) };
  for (const k of LEGACY_KEYS) if (k in props) { if (!(k in legacy)) legacy[k] = props[k]; delete props[k]; }
  const rule = RULES.find(([re]) => re.test(m.name));
  const next = { ...props, ...(rule ? rule[1]({ name: m.name, props: { ...props, legacy } }) : {}) };
  // a pre-schema price (prose, or a number the rule changed, e.g. STALL 0 -> seller) is kept in legacy
  if ('sparks_price' in props && !('price_rule' in props) && next.sparks_price !== props.sparks_price && !('sparks_price' in legacy)) legacy.sparks_price = props.sparks_price;
  if (!rule && 'sparks_price' in next && !('price_rule' in next)) delete next.sparks_price;   // unmapped prose never survives
  if (Object.keys(legacy).length) next.legacy = legacy; else delete next.legacy;
  return { ...m, props: next };
}

const FABRIC = /^([a-z-]+) item (\d+) \(([a-z0-9-]+);/;
export function normalizeSlot(s, housingIdx) {
  const legacyHost = s.legacy && s.legacy.host !== undefined ? s.legacy.host : s.host;
  const out = { ...s };
  delete out.host;
  let h;
  if (legacyHost === 'housing') h = { host_type: 'housing', host_id: housingIdx };
  else if (/^PLOT-/.test(legacyHost)) h = { host_type: 'plot', host_id: legacyHost };
  else if (legacyHost === 'culture lane wall') h = { host_type: 'culture-lane', host_id: 'CULTURE_LANE' };
  else if (legacyHost === 'BLD_GALLERY_SHOP') h = { host_type: 'gallery', host_id: 'BLD_GALLERY_SHOP' };
  else {
    const f = FABRIC.exec(String(legacyHost));
    if (!f) throw new Error('unknown art-slot host: ' + legacyHost + ' (' + s.slot_id + ')');
    h = { host_type: 'fabric', host_id: +f[2], host_key: f[3], host_cluster: f[1] };
  }
  delete out.host_type; delete out.host_id; delete out.host_key; delete out.host_cluster; delete out.legacy;
  return { slot_id: out.slot_id, kind: out.kind, ...h, ...out, legacy: { host: legacyHost } };
}
export function normalizeSlots(slots) {
  let n = 0;
  return slots.map(s => {
    const lh = s.legacy && s.legacy.host !== undefined ? s.legacy.host : s.host;
    return normalizeSlot(s, lh === 'housing' ? Math.floor(n++ / 2) : null);   // housing emits FACADE + HOME per block
  });
}

// ── verification ──
const INTERACTIVE_KEYS = ['endpoint', 'endpoints', 'dashboard_id', 'paybox_merchant_id', 'skill_required', 'skill_gate'];
const has = v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
export function verify(markers, slots) {
  const errs = []; let interactive = 0, priced = 0;
  for (const m of markers) {
    const p = m.props || {};
    const isInt = INTERACTIVE_KEYS.some(k => has(p[k]));
    if (isInt) {
      interactive++;
      if (typeof p.dashboard_id !== 'string' || !p.dashboard_id) errs.push(m.name + ': interactive without dashboard_id');
      if (!Array.isArray(p.endpoints)) errs.push(m.name + ': interactive without endpoints[]');
    }
    if ('endpoint' in p) errs.push(m.name + ': old top-level endpoint left');
    if ('price_sparks' in p) errs.push(m.name + ': old price_sparks left');
    for (const e of p.endpoints || []) {
      if (!SERVICES.includes(e.service)) errs.push(m.name + ': unknown service ' + e.service);
      if (e.path !== undefined && typeof e.path !== 'string') errs.push(m.name + ': bad path');
    }
    if ('sparks_price' in p || 'price_rule' in p) {
      priced++;
      if (!(p.sparks_price === null || (typeof p.sparks_price === 'number' && isFinite(p.sparks_price)))) errs.push(m.name + ': sparks_price not number|null: ' + JSON.stringify(p.sparks_price));
      if (!PRICE_RULES.includes(p.price_rule)) errs.push(m.name + ': bad price_rule ' + p.price_rule);
      if (p.price_rule === 'fixed' && p.sparks_price !== null && p.sparks_price < 0) errs.push(m.name + ': negative price');
    }
  }
  for (const s of slots) {
    if (!HOST_TYPES.includes(s.host_type)) errs.push(s.slot_id + ': bad host_type ' + s.host_type);
    if (s.host_id === undefined || s.host_id === null) errs.push(s.slot_id + ': missing host_id');
    if (s.host_type === 'fabric' && !s.host_key) errs.push(s.slot_id + ': fabric without host_key');
  }
  return { errs, interactive, priced };
}

// cross-check: every RULES family's marker(...) line(s) in city_v3.py carry the same price_rule, services and dashboard_id
function pyAnchor(name) {
  if (/^CLASS_(ART|MUSIC)$/.test(name)) return 'teaches=sk_';
  if (/^VEH_/.test(name)) return 'vehicle_class=cls';
  return "marker('" + name.replace(/_(\d+|[A-F])$/, '_');
}
export function crossCheckPy(markers) {
  const lines = fs.readFileSync(PY, 'utf-8').split(String.fromCharCode(10)).map(l => l.trimEnd()).filter(l => l.includes('marker('));
  const errs = [], seen = new Set();
  for (const m of markers) {
    const rule = RULES.find(([re]) => re.test(m.name)); if (!rule) continue;
    const anchor = pyAnchor(m.name); if (seen.has(anchor)) continue; seen.add(anchor);
    const cands = lines.filter(l => l.includes(anchor));
    const want = rule[1]({ name: m.name, props: m.props || {} });
    const bad = cands.filter(l => !((!want.price_rule || l.includes("price_rule='" + want.price_rule + "'"))
      && (!want.price_key || l.includes("price_key='" + want.price_key + "'"))
      && (!want.endpoints || l.includes('endpoints=')) && (want.endpoints || []).every(e => l.includes("ep('" + e.service + "'"))
      && (!want.dashboard_id || l.includes('dashboard_id='))));
    if (!cands.length || bad.length) errs.push('city_v3.py out of sync for ' + m.name + ' (anchor ' + anchor + '; want rule ' + want.price_rule + ', key ' + want.price_key + ', services ' + [...new Set((want.endpoints || []).map(e => e.service))].join('/') + ')');
  }
  return errs;
}

function main() {
  const mj = JSON.parse(fs.readFileSync(MARKERS, 'utf-8'));
  const sj = JSON.parse(fs.readFileSync(SLOTS, 'utf-8'));
  if (!CHECK_ONLY) {
    mj.markers = mj.markers.map(normalizeMarker);
    mj.schema = 'city-v3/markers@2 (endpoints[], sparks_price number|null + price_rule, dashboard_id; see tools/city/normalize-markers.mjs, docs/city-v3/PRICES.md)';
    sj.slots = normalizeSlots(sj.slots);
    sj.schema = 'city-v3/art-slots@2 (host_type + host_id; legacy.host kept one release)';
    fs.writeFileSync(MARKERS, JSON.stringify(mj, null, 1) + '\n');
    fs.writeFileSync(SLOTS, JSON.stringify(sj));
  }
  const v = verify(mj.markers, sj.slots);
  const py = crossCheckPy(mj.markers);
  const byType = {}; for (const s of sj.slots) byType[s.host_type] = (byType[s.host_type] || 0) + 1;
  const rules = {}; for (const m of mj.markers) if (m.props.price_rule) rules[m.props.price_rule] = (rules[m.props.price_rule] || 0) + 1;
  console.log('markers', mj.markers.length, '| interactive', v.interactive, '| priced', v.priced, JSON.stringify(rules));
  console.log('art slots', sj.slots.length, JSON.stringify(byType));
  for (const e of [...v.errs, ...py]) console.log('  FAIL', e);
  if (v.errs.length || py.length) { console.log('verify: FAILED (' + (v.errs.length + py.length) + ')'); process.exit(1); }
  console.log('verify: OK (all interactive markers have dashboard_id + endpoints[]; prices number|null with price_rule; slots typed; city_v3.py in sync)');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
