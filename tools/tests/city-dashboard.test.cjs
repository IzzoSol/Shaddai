'use strict';
/**
 * tools/tests/city-dashboard.test.cjs — tests for the pure core of public/city-dashboard.html.
 * Loads the text of <script id="dash-core"> into a vm context (no DOM, no browser, no deps).
 * Run: node tools/tests/city-dashboard.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'public', 'city-dashboard.html'), 'utf8');
const MARKERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'world', 'markers-v4.json'), 'utf8'));
const DASH_IDS = new Set(MARKERS.markers.map(m => m.props && m.props.dashboard_id).filter(Boolean));

function scriptText(id) {
  const m = HTML.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
  if (!m) throw new Error('missing <script id="' + id + '">');
  return m[1];
}
const ctx = vm.createContext({ console, setTimeout, clearTimeout });
vm.runInContext(scriptText('dash-core'), ctx, { filename: 'dash-core' });
const C = ctx.DashCore;
const BANNED = /withdraw|cash ?-?out|redeem|payout|apy|yield/i;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// A fake live source: routes -> { status, body } or 'throw' or 'hang'.
function fakeLive(routes, extra) {
  return Object.assign({ name: 'live', userId: null, get(p) {
    const r = routes[p.split('?')[0]];
    if (r === 'throw') return Promise.reject(new Error('network'));
    if (r === 'hang') return new Promise(() => {});
    return Promise.resolve(r || { status: 404, body: { ok: false } });
  } }, extra || {});
}
async function loadAll(primary, demo) {
  demo = demo || C.createDemoSource({ seed: 't', now: NOW });
  const tiles = await Promise.all(C.TILES.map(d => C.loadTile(d, primary, demo)));
  const html = tiles.map((t, i) => C.renderTile(C.TILES[i], t, { now: NOW }));
  return { tiles, html, by: Object.fromEntries(tiles.map((t, i) => [t.id, { tile: t, html: html[i] }])) };
}
// Real-shaped bodies for the routes that are mounted today.
const EXISTING_OK = {
  '/api/agents': { status: 200, body: { agents: [{ id: 'NEXUS', name: 'NEXUS', role: 'Technical Architect' }], total: 1 } },
  '/api/work/active': { status: 200, body: { ok: true, userId: 'u1', working: ['nexus'] } },
  '/api/economy/balance': { status: 200, body: { ok: true, userId: 'u1', sparks_balance: 1234 } },
  '/api/hire/rates': { status: 200, body: { ok: true, currency: 'SHAD-Credits', rates: { NEXUS: { base: 6, perToken: 0.001 } } } },
};

// ---------- formatting ----------
test('signed amounts use + and a real minus sign', () => {
  assert.strictEqual(C.fmtSigned(3), '+3');
  assert.strictEqual(C.fmtSigned(-5), '−5');
  assert.strictEqual(C.fmtSigned(0), '0');
  assert.strictEqual(C.fmtSigned(1234), '+1,234');
  assert.strictEqual(C.fmtSigned(-1234567), '−1,234,567');
  assert.strictEqual(C.fmtSigned('nope'), '0');
  assert.strictEqual(C.fmtSparks(1500), '1,500 SPARKS');
  assert.strictEqual(C.fmtPct(0.456), '46%');
  assert.strictEqual(C.fmtPct(7), '100%');
});
test('relative time', () => {
  assert.strictEqual(C.relTime(new Date(NOW - 10000).toISOString(), NOW), 'just now');
  assert.strictEqual(C.relTime(new Date(NOW - 5 * 60000).toISOString(), NOW), '5m ago');
  assert.strictEqual(C.relTime(new Date(NOW - 3 * 3600000).toISOString(), NOW), '3h ago');
  assert.strictEqual(C.relTime(new Date(NOW + 2 * 86400000).toISOString(), NOW), 'in 2d');
  assert.strictEqual(C.relTime('garbage', NOW), '');
});
test('tx lines are signed and labelled by reason', () => {
  const a = C.txLine({ id: 1, amount: 3, reason: 'home:checkin', created_at: new Date(NOW - 120000).toISOString() }, NOW);
  assert.deepStrictEqual({ ...a }, { id: '1', kind: 'mint', amount: '+3', label: 'Home check-in', when: '2m ago' });
  const b = C.txLine({ id: 2, amount: -10, reason: 'race_entry:H-1' }, NOW);
  assert.strictEqual(b.kind, 'sink'); assert.strictEqual(b.amount, '−10'); assert.strictEqual(b.label, 'Race entry');
  assert.strictEqual(C.reasonLabel('race_prize:H-1:1', 15), 'Race place');
  assert.strictEqual(C.reasonLabel('forge:install', -15), 'Forge install');
  assert.strictEqual(C.reasonLabel('stall_sale', 6), 'Stall sale');
  assert.strictEqual(C.reasonLabel('some_new_thing', 1), 'Some new thing');
  assert.strictEqual(C.pingText({ amount: 4, reason: 'work_session' }), '+4 SPARKS · Work session');
  assert.strictEqual(C.pingText({ amount: -5, reason: 'rent' }), '−5 SPARKS · Rent');
});
test('tile formatting: home, plot lights, training done -> Forge, race entry in gold', async () => {
  const demo = C.createDemoSource({ seed: 'fmt', now: NOW });
  const { by } = await loadAll(demo, demo);
  const home = by.home.html;
  assert.match(home, /Home C/); assert.match(home, /light lit/); assert.match(home, /Stall sold/);
  assert.match(home, /PLOT-SW-00\d\d/);
  const tr = by.training.html;
  assert.match(tr, /Take it to the Forge/);
  assert.ok(tr.includes('goto=forge.install'));
  assert.match(by.race.html, /Entry <span class="gold">10 SPARKS<\/span>/);
  assert.match(by.agent.html, /class="chip"/); assert.match(by.agent.html, /Energy/);
  // home status variants
  const variants = [
    [{ housed: true, home_id: 'home.a', state: 'rent_due', rent_due: 5, lapses_after: '2026-09-29', stall_sold: 2 }, [/light due/, /Rent due/, /5 SPARKS/, /2026-09-29/]],
    [{ housed: false, home_id: 'home.a', state: 'lapsed', stall_sold: 0 }, [/light dim/, /dimmed/]],
    [{ housed: false, state: 'empty', lit: false }, [/No home yet/]],
  ];
  for (const [status, pats] of variants) {
    const t = { id: 'home', mode: 'live', parts: { status, plots: { plots: [{ plot_id: 'P1', state: 'listed', pending_sparks: 7 }] } } };
    const h = C.renderTile(C.TILES[1], t, { now: NOW });
    pats.forEach(p => assert.match(h, p));
    assert.match(h, /light cyan/);
  }
});
test('every plot state maps to its light (lights = ledger)', () => {
  const want = { empty: 'dim', claimed: 'beacon', built: 'windows', listed: 'cyan', lapsed: 'dim' };
  for (const [state, cls] of Object.entries(want)) {
    const t = { id: 'home', mode: 'live', parts: { status: null, plots: { plots: [{ plot_id: 'P', state }] } } };
    assert.ok(C.renderTile(C.TILES[1], t, {}).includes('light ' + cls), state);
  }
});

// ---------- demo determinism ----------
test('demo data is deterministic for a seed + clock', async () => {
  const a = await loadAll(C.createDemoSource({ seed: 's1', now: NOW }), C.createDemoSource({ seed: 's1', now: NOW }));
  const b = await loadAll(C.createDemoSource({ seed: 's1', now: NOW }), C.createDemoSource({ seed: 's1', now: NOW }));
  assert.deepStrictEqual(a.html, b.html);
  const c = await loadAll(C.createDemoSource({ seed: 's2', now: NOW }));
  assert.notDeepStrictEqual(a.html, c.html);
  const d1 = C.createDemoSource({ seed: 's1', now: NOW }), d2 = C.createDemoSource({ seed: 's1', now: NOW });
  for (let n = 1; n < 20; n++) assert.deepStrictEqual({ ...d1.tick(n) }, { ...d2.tick(n) });
  a.tiles.forEach(t => assert.strictEqual(t.mode, 'demo', t.id));
  a.html.forEach(h => assert.ok(h.includes('demo data')));
  const s = a.by.sparks.tile;
  assert.strictEqual(s.parts.txs.transactions.length, 5);
});

// ---------- live / 404 -> coming soon / fallback ----------
test('new routes that 404 or 501 render "coming soon", never an error dump', async () => {
  const routes = Object.assign({}, EXISTING_OK, { '/api/race/heats': { status: 501, body: { error: 'not implemented' } } });
  const { by } = await loadAll(fakeLive(routes));
  for (const id of ['home', 'training', 'race']) {
    assert.strictEqual(by[id].tile.mode, 'soon', id);
    assert.match(by[id].html, /Coming soon\./);
    assert.match(by[id].html, /badge soon/);
    assert.ok(!/error|not implemented|404|501/i.test(by[id].html.replace(/href="[^"]*"/g, '')), id);
  }
  // mixed tiles: live part renders, new part says coming soon
  assert.strictEqual(by.sparks.tile.mode, 'live');
  assert.match(by.sparks.html, /1,234/); assert.match(by.sparks.html, /Recent activity: coming soon/);
  assert.strictEqual(by.agent.tile.mode, 'live');
  assert.match(by.agent.html, /NEXUS/); assert.match(by.agent.html, /on shift/); assert.match(by.agent.html, /coming soon/);
  assert.strictEqual(by.hiring.tile.mode, 'live'); assert.match(by.hiring.html, /NEXUS 6 SHAD-Credits/);
  assert.strictEqual(by.jobs.tile.mode, 'live'); assert.match(by.jobs.html, /board: coming soon/);
});
test('existing route failures (404 / 500 / network / timeout) fall back to demo per tile', async () => {
  const routes = Object.assign({}, EXISTING_OK, {
    '/api/economy/balance': { status: 500, body: { ok: false } },
    '/api/hire/rates': 'throw',
    '/api/agents': { status: 404, body: null },
  });
  const { by } = await loadAll(fakeLive(routes));
  assert.strictEqual(by.sparks.tile.mode, 'demo'); assert.strictEqual(by.sparks.tile.from.balance, 'demo'); assert.match(by.sparks.html, /demo data/);
  assert.strictEqual(by.hiring.tile.mode, 'demo');
  assert.strictEqual(by.agent.tile.mode, 'demo');
  assert.strictEqual(by.jobs.tile.mode, 'live');
  // a hanging fetch times out through createLiveSource and falls back too
  const hang = C.createLiveSource({ fetch: () => new Promise(() => {}), timeoutMs: 30 });
  const t = await C.loadTile(C.TILES.find(x => x.id === 'sparks'), hang, C.createDemoSource({ seed: 't', now: NOW }));
  assert.strictEqual(t.from.balance, 'demo');
  assert.strictEqual(t.from.txs, 'demo');
});
test('live source: 5 s default timeout, token only same-origin, userId appended', async () => {
  const calls = [];
  const f = (url, init) => { calls.push({ url, init }); return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, sparks_balance: 9 }) }); };
  const same = C.createLiveSource({ fetch: f, token: 'tok', userId: 'u 1' });
  const t = await C.loadTile(C.TILES.find(x => x.id === 'sparks'), same, C.createDemoSource({ now: NOW }));
  assert.strictEqual(calls[0].url, '/api/economy/balance?userId=u%201');
  assert.strictEqual(calls[1].url, '/api/economy/transactions?limit=5&userId=u%201');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.strictEqual(t.from.balance, 'live');
  calls.length = 0;
  const foreign = C.createLiveSource({ fetch: f, token: 'tok', base: 'https://elsewhere.example' });
  await foreign.get('/api/agents');
  assert.strictEqual(calls[0].url, 'https://elsewhere.example/api/agents');
  assert.strictEqual(calls[0].init.headers.Authorization, undefined);
  assert.ok(/timeoutMs == null \? 5000/.test(scriptText('dash-core')));
});

// ---------- closed-loop wording ----------
const HOSTILE = {
  '/api/agents': { status: 200, body: { agents: [{ id: 'X', name: 'Withdraw-bot', role: 'Cash out & redeem desk' }] } },
  '/api/city/agent': { status: 200, body: { ok: true, agent: { name: 'Withdraw-bot', frame: 'APY frame', skills: ['yield.farm', 'payout.run'], energy: 5, energy_max: 10 } } },
  '/api/work/active': { status: 200, body: { ok: true, working: ['Withdraw-bot'] } },
  '/api/home/status': { status: 200, body: { ok: true, housed: true, home_id: 'home.b', state: 'lit', stall_sold: 1, last_pings: [{ type: 'payout', amount: 9, at: '2026-09-27T11:00:00Z' }] } },
  '/api/plots/mine': { status: 200, body: { ok: true, plots: [{ plot_id: 'REDEEM-1', mode: 'yield', state: 'built' }] } },
  '/api/academy/queue': { status: 200, body: { ok: true, queue: [{ class_id: 'c', title: 'Cashout 101', skill: 'withdraw.fast', progress: 0.5 }] } },
  '/api/race/heats': { status: 200, body: { ok: true, heats: [{ heat_id: 'PAYOUT-1', state: 'open', entry_fee: 10, pool: 20, payouts: [{ amount: 5 }] }] } },
  '/api/economy/balance': { status: 200, body: { ok: true, sparks_balance: 50 } },
  '/api/economy/transactions': { status: 200, body: { ok: true, transactions: [
    { id: 1, amount: 9, reason: 'payout_withdraw' }, { id: 2, amount: -3, reason: 'cash out fee' }, { id: 3, amount: 1, reason: 'APY yield' },
    { id: 4, amount: 2, reason: 'redeem' }, { id: 5, amount: 2, reason: 'cash-out' }] } },
  '/api/hire/rates': { status: 200, body: { ok: true, currency: 'Redeemable yield', rates: { PAYOUT: { base: 1 } } } },
  '/api/hire/offers': { status: 200, body: { ok: true, offers: [{ offer_id: 'o', from: 'Withdrawal desk', agent: 'X', task: 'Redeem for cash out', sparks: 3 }] } },
  '/api/work/jobs': { status: 200, body: { ok: true, jobs: [{ job_id: 'j', kind: 'courier', title: 'Payout run for APY', sparks: 2 }] } },
};
test('NO rendered string contains withdraw | cash out | redeem | payout | APY | yield', async () => {
  const demo = C.createDemoSource({ seed: 'law', now: NOW });
  const runs = [
    await loadAll(demo, demo),
    await loadAll(fakeLive(EXISTING_OK)),
    await loadAll(fakeLive({})),
    await loadAll(fakeLive(HOSTILE)),
  ];
  for (let seed = 0; seed < 25; seed++) runs.push(await loadAll(C.createDemoSource({ seed: 'seed' + seed, now: NOW }), C.createDemoSource({ seed: 'seed' + seed, now: NOW })));
  let n = 0;
  for (const r of runs) {
    for (const h of r.html) { n++; assert.ok(!BANNED.test(h), 'banned word in: ' + (h.match(new RegExp('.{0,40}(' + BANNED.source + ').{0,40}', 'i')) || [])[0]); }
    const evs = C.collectEvents(r.tiles);
    evs.forEach(e => assert.ok(!BANNED.test(C.pingText(e)), C.pingText(e)));
    assert.ok(!BANNED.test(C.renderFirst(C.firstSession(r.tiles, evs))));
  }
  const d = C.createDemoSource({ seed: 'law', now: NOW });
  for (let i = 1; i < 60; i++) assert.ok(!BANNED.test(C.pingText(d.tick(i))));
  // hostile run really exercised the scrubber
  assert.ok(runs[3].by.sparks.html.includes('−3'));
  // static markup outside the scripts
  const staticHtml = HTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!BANNED.test(staticHtml), 'static markup');
  assert.ok(n > 100);
});
test('SPARKS tile has no button or action beyond the world link', async () => {
  const { by } = await loadAll(C.createDemoSource({ now: NOW }));
  assert.ok(!/<button|<form|<input/i.test(by.sparks.html));
  assert.strictEqual((by.sparks.html.match(/<a /g) || []).length, 1);
  assert.ok(!/<button|<form/i.test(HTML));
});

// ---------- links + pings ----------
test('every tile links to a real marker dashboard_id in the world', async () => {
  assert.strictEqual(C.TILES.length, 7);
  const { tiles, html } = await loadAll(C.createDemoSource({ now: NOW }));
  html.forEach((h, i) => {
    const m = h.match(/href="SHADDAI-WORLD-3D\.html\?map=v4&amp;goto=([^"]+)"/g);
    assert.ok(m && m.length, tiles[i].id);
    m.forEach(x => { const id = decodeURIComponent(x.split('goto=')[1].slice(0, -1)); assert.ok(DASH_IDS.has(id), tiles[i].id + ' -> ' + id); });
  });
  C.TILES.forEach(d => assert.ok(DASH_IDS.has(d.place), d.place));
  assert.strictEqual(C.worldLink('home.a'), 'SHADDAI-WORLD-3D.html?map=v4&goto=home.a');
});
test('ping events: collected, newest first, de-duplicated; first-session checks', async () => {
  const { tiles } = await loadAll(C.createDemoSource({ seed: 'p', now: NOW }));
  const evs = C.collectEvents(tiles);
  assert.ok(evs.length >= 5);
  for (let i = 1; i < evs.length; i++) assert.ok(String(evs[i - 1].at) >= String(evs[i].at));
  const seen = {};
  assert.strictEqual(C.newEvents(seen, evs).length, evs.length);
  assert.strictEqual(C.newEvents(seen, evs).length, 0);
  assert.deepStrictEqual({ ...C.firstSession(tiles, evs) }, { lit: true, pinged: true });
  const empty = await loadAll(fakeLive({}));
  const fs0 = C.firstSession(empty.tiles, C.collectEvents(empty.tiles));
  assert.deepStrictEqual({ ...fs0 }, { lit: false, pinged: false });
  assert.ok(!/class="done"/.test(C.renderFirst(fs0)));
});
test('reduced motion is respected and the UI script compiles', () => {
  assert.match(HTML, /@media \(prefers-reduced-motion: reduce\)\{[^}]*\.ping\.enter/);
  assert.match(scriptText('dash-ui'), /prefers-reduced-motion: reduce/);
  new vm.Script(scriptText('dash-ui'), { filename: 'dash-ui' });
});

(async () => {
  let fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('ok   ' + t.name); }
    catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
  }
  console.log('\n' + (tests.length - fail) + '/' + tests.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
