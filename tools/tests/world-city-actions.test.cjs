'use strict';
/**
 * tools/tests/world-city-actions.test.cjs — tests for public/world-city-actions.js.
 * Loads the classic script (and world-city-v3.js for its pure normMarker) in a vm with a minimal fake DOM and a mock
 * fetch. Markers + copy are the REAL JSON files from disk. No browser, no three.js.
 * Run: node tools/tests/world-city-actions.test.cjs   (exits non-zero on failure)
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const readJSON = rel => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8'));
const MARKERS_RAW = readJSON('assets/world/markers-v4.json').markers;
const COPY = readJSON('assets/world/city-copy-v4.json');
const FORBIDDEN = /withdraw|cash ?out|redeem|payout/i;

// ── minimal fake DOM ──
function fakeEl(tag) {
  const e = {
    tagName: String(tag).toUpperCase(), style: {}, children: [], parentNode: null, attrs: {}, listeners: {},
    className: '', id: '', value: '', disabled: false, _text: '',
    get firstChild() { return this.children[0] || null; },
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
    set textContent(v) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; this._text = String(v); },
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); },
    focus() { doc.activeElement = this; },
    click() { (this.listeners.click || []).forEach(f => f({ stopPropagation() {} })); }
  };
  return e;
}
const doc = { head: fakeEl('head'), body: fakeEl('body'), activeElement: null, pointerLockElement: null, exitCalls: 0,
  createElement: fakeEl, exitPointerLock() { this.exitCalls++; this.pointerLockElement = null; } };
const winListeners = {};
const window = {
  addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
  removeEventListener(t, f) { winListeners[t] = (winListeners[t] || []).filter(x => x !== f); }
};
function key(k, extra) {
  const e = Object.assign({ key: k, code: k === 'Escape' ? 'Escape' : 'Key' + k.toUpperCase(), repeat: false, target: window, stopped: false,
    preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } }, extra || {});
  for (const f of (winListeners.keydown || []).slice()) { f(e); if (e.stopped) break; }
  return e;
}

const ctx = { window, document: doc, Math, Date, JSON, Object, Array, String, Number, RegExp, Error, isFinite, parseInt, Infinity, console, Promise,
  setTimeout, clearTimeout, setInterval, clearInterval, encodeURIComponent, AbortController };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'world-city-v3.js'), 'utf8'), ctx, { filename: 'world-city-v3.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'world-city-actions.js'), 'utf8'), ctx, { filename: 'world-city-actions.js' });
const normMarker = window.buildWorldCityV3.pure.normMarker;
const build = window.buildCityActions, P = build.pure;
const MK = {}; MARKERS_RAW.forEach(m => { MK[m.name] = normMarker(m); });

// ── mock fetch: routes { 'GET /api/x': (url, init, body) => ({status, body}|{status, raw}) } ──
function mockFetch(routes) {
  const calls = [];
  const f = (url, init) => {
    init = init || {};
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, body, headers: init.headers || {} });
    if (url.indexOf('city-copy-v4.json') >= 0) return Promise.resolve(resp(200, COPY));
    if (url.indexOf('plots-v4.json') >= 0) return Promise.resolve(resp(200, readJSON('assets/world/plots-v4.json')));
    const p = url.split('?')[0];
    const keyExact = method + ' ' + p;
    let h = routes[keyExact];
    if (!h) for (const k in routes) { const [m, pat] = k.split(' '); if (m === method && new RegExp('^' + pat.replace(/:[^/]+/g, '[^/]+') + '$').test(p)) { h = routes[k]; break; } }
    if (h === 'reject') return Promise.reject(new Error('network down'));
    if (!h) return Promise.resolve({ status: 404, ok: false, text: () => Promise.resolve('<!DOCTYPE html><pre>Cannot ' + method + ' ' + p + '</pre>') });
    const r = h(url, init, body);
    return Promise.resolve(r.raw != null ? { status: r.status, ok: r.status < 300, text: () => Promise.resolve(r.raw) } : resp(r.status || 200, r.body));
  };
  f.calls = calls;
  f.api = () => calls.filter(c => c.url.indexOf('/api/') >= 0);
  return f;
}
function resp(status, body) { return { status, ok: status >= 200 && status < 300, text: () => Promise.resolve(JSON.stringify(body)) }; }
const flush = async (n) => { for (let i = 0; i < (n || 8); i++) await new Promise(r => setImmediate(r)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function walk(e, fn) { fn(e); (e.children || []).forEach(c => walk(c, fn)); }
function panelEl() { return doc.body.children.find(c => c.id === 'city-actions'); }
function allText() { const out = []; const p = panelEl(); if (p) walk(p, e => { out.push(e._text, e.attrs.placeholder || '', e.placeholder || '', e.attrs['aria-label'] || ''); }); return out.join(' | '); }
function byAct(act) { let f = null; const p = panelEl(); if (p) walk(p, e => { if (!f && e.attrs['data-act'] && (e.attrs['data-act'] === act || (act.endsWith('*') && e.attrs['data-act'].startsWith(act.slice(0, -1))))) f = e; }); return f; }
function hasConfirm() { let f = false; walk(panelEl(), e => { if (e.attrs['data-confirm']) f = true; }); return f; }
function inputField(name) { let f = null; walk(panelEl(), e => { if (e.attrs['data-field'] === name) f = e; }); return f; }

function makeHud() { const pings = []; return { pings, ping(e) { pings.push(e); return true; } }; }
let current = null;
function mk(routes, extra) {
  if (current) current.dispose();
  const fetchImpl = mockFetch(routes || {}), hud = makeHud();
  current = build(Object.assign({ fetchImpl, hud, getUser: () => ({ userId: 'u1', token: 'tok' }), seatMs: 30 }, extra || {}));
  return { a: current, fetchImpl, hud };
}

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

const ECON = {
  'GET /api/economy/balance': () => ({ body: { ok: true, userId: 'u1', sparks_balance: 42 } }),
  'GET /api/economy/catalog': () => ({ body: { ok: true, items: [
    { id: 'hat-1', name: 'Neon Hat', kind: 'cosmetic', sparks_price: 12 },
    { id: 'prem-1', name: 'Premium', kind: 'premium', sparks_price: null, usd_price_cents: 499 }] } }),
  'POST /api/economy/catalog/purchase': (u, i, b) => ({ body: { ok: true, spent: 12, balance: 30, catalogId: b.catalogId } })
};

(async () => {
  console.log('world-city-actions');

  await test('family dispatch covers every marker family', () => {
    const want = {
      OBJ_SPARKS_KIOSK: 'kiosk', OBJ_HIRING_BOARD: 'hire', CLASS_01: 'academy', CLASS_ART: 'academy', CLASS_MUSIC: 'academy',
      OBJ_CLASS_BOARD: 'academy', NODE_SKILL_INSTALL: 'seat', HUB_HOME_A: 'home', HUB_HOME_F: 'home', GATE_START: 'race',
      PIT_04: 'race', STALL_007: 'bazaar', BLD_GALLERY_SHOP: 'bazaar', SLOT_GALLERY_03: 'bazaar', DEED_OFFICE: 'plots',
      BUILDER_YARD: 'plots', ARCHIVE: 'generic', NODE_MAIL: 'generic', TOWER_RACE: 'generic', VEH_HAULER: 'generic', CP_03: 'generic'
    };
    for (const n in want) assert.strictEqual(P.family(MK[n]), want[n], n);
    assert.strictEqual(Object.keys(MK).length, 108);
    // dispatch also works from dashboard_id alone
    assert.strictEqual(P.family({ name: 'X', dashboard_id: 'home.z' }), 'home');
    assert.strictEqual(P.family({ name: 'X', dashboard_id: 'race.pit.09' }), 'race');
    assert.strictEqual(P.family({ name: 'X', dashboard_id: 'stall.099' }), 'bazaar');
  });

  await test('copy lookup: exact first, then _* family fallback, placeholders filled', () => {
    assert.strictEqual(P.lookupCopy(COPY, 'CLASS_ART').title, 'Art Class');          // exact beats CLASS_*
    assert.strictEqual(P.lookupCopy(COPY, 'CLASS_02').title, 'Classroom {n}');
    assert.strictEqual(P.lookupCopy(COPY, 'STALL_007').title, 'Stall {n}');
    assert.strictEqual(P.lookupCopy(COPY, 'NOPE_THING'), null);
    assert.strictEqual(P.familyKey('SPAWN_HIRE'), 'SPAWN_*');
    assert.strictEqual(P.fill('Stall {n}', P.markerVars(MK.STALL_007)), 'Stall 7');
    assert.strictEqual(P.fill('Home {letter}', P.markerVars(MK.HUB_HOME_C)), 'Home C');
    assert.strictEqual(P.fill('Click. {skill} is seated.', { skill: 'x.y' }), 'Click. x.y is seated.');
  });

  await test('open renders copy title/prompt (prefix fallback) and sets window.__onCityInteract', async () => {
    const { a } = mk({ 'GET /api/bazaar/list': () => ({ body: { ok: true, listings: [] } }) });
    assert.strictEqual(typeof window.__onCityInteract, 'function');
    await window.__onCityInteract(MK.STALL_007); await flush();
    assert.ok(a.isOpen());
    assert.strictEqual(panelEl().className, 'open');
    assert.ok(allText().indexOf('Stall 7') >= 0, allText());
    assert.ok(allText().indexOf('Browse the stall') >= 0);
    assert.strictEqual(panelEl().getAttribute('data-family'), 'bazaar');
  });

  await test('generic marker: no API requests, dashboard link from dashboard_id', async () => {
    const { a, fetchImpl } = mk({});
    await a.open(MK.ARCHIVE); await flush();
    assert.strictEqual(fetchImpl.api().length, 0);
    assert.ok(allText().indexOf('The Archive') >= 0);
    let link = null; walk(panelEl(), e => { if (e.tagName === 'A') link = e; });
    assert.ok(link && link.href.indexOf('academy.archive') >= 0, link && link.href);
    assert.strictEqual(link.rel, 'noopener');
  });

  await test('kiosk: balance + catalog on open, spend needs Confirm, uuid idempotency per click, sparks:sink ping', async () => {
    const { a, fetchImpl, hud } = mk(ECON);
    await a.open(MK.OBJ_SPARKS_KIOSK); await flush();
    assert.deepStrictEqual(fetchImpl.api().map(c => c.method + ' ' + c.url.split('?')[0]).sort(), ['GET /api/economy/balance', 'GET /api/economy/catalog']);
    assert.ok(allText().indexOf('42 SPARKS') >= 0, allText());
    assert.ok(allText().indexOf('Premium') < 0, 'usd-only items are not offered for SPARKS');
    byAct('buy:hat-1').click(); await flush();
    assert.ok(hasConfirm(), 'a confirm box is shown');
    assert.ok(allText().indexOf('12 SPARKS') >= 0);
    assert.strictEqual(fetchImpl.api().filter(c => c.method === 'POST').length, 0, 'no spend before Confirm');
    byAct('confirm').click(); await flush();
    const posts = fetchImpl.api().filter(c => c.method === 'POST');
    assert.strictEqual(posts.length, 1);
    assert.strictEqual(posts[0].body.catalogId, 'hat-1');
    assert.ok(/^[0-9a-f-]{36}$/.test(posts[0].body.idempotencyKey), posts[0].body.idempotencyKey);
    assert.strictEqual(posts[0].headers['Idempotency-Key'], posts[0].body.idempotencyKey);
    assert.strictEqual(posts[0].headers.Authorization, 'Bearer tok');
    assert.deepStrictEqual(hud.pings.filter(p => p.type === 'sparks:sink').map(p => p.sparks), [-12]);
    assert.ok(allText().indexOf('30 SPARKS') >= 0, 'balance refreshed from the purchase response');
    byAct('buy:hat-1').click(); await flush(); byAct('confirm').click(); await flush();
    const posts2 = fetchImpl.api().filter(c => c.method === 'POST');
    assert.strictEqual(posts2.length, 2);
    assert.notStrictEqual(posts2[0].body.idempotencyKey, posts2[1].body.idempotencyKey, 'fresh key per click');
  });

  await test('Cancel on the confirm box spends nothing', async () => {
    const { a, fetchImpl, hud } = mk(ECON);
    await a.open(MK.OBJ_SPARKS_KIOSK); await flush();
    byAct('buy:hat-1').click(); await flush();
    byAct('cancel').click(); await flush();
    assert.ok(!hasConfirm());
    assert.strictEqual(fetchImpl.api().filter(c => c.method === 'POST').length, 0);
    assert.strictEqual(hud.pings.length, 0);
  });

  await test('402 → pay-in message + error ping, no sink ping', async () => {
    const routes = Object.assign({}, ECON, { 'POST /api/economy/catalog/purchase': () => ({ status: 402, body: { ok: false, error: 'Insufficient funds: cash out blocked', code: 'INSUFFICIENT_FUNDS' } }) });
    const { a, hud } = mk(routes);
    await a.open(MK.OBJ_SPARKS_KIOSK); await flush();
    byAct('buy:hat-1').click(); byAct('confirm').click(); await flush();
    assert.ok(/pay-in only/.test(allText()), allText());
    assert.ok(/PayBox/.test(allText()));
    assert.ok(!FORBIDDEN.test(allText()), 'raw server text is never rendered');
    assert.strictEqual(hud.pings.filter(p => p.type === 'sparks:sink').length, 0);
    assert.strictEqual(hud.pings.filter(p => p.type === 'error').length, 1);
  });

  await test("home: route not mounted (404 HTML) → friendly coming-soon, no error dump", async () => {
    const { a, fetchImpl, hud } = mk({});
    await a.open(MK.HUB_HOME_C); await flush();
    const t = allText();
    assert.ok(/open soon/i.test(t), t);
    assert.ok(t.indexOf('Cannot') < 0 && t.indexOf('404') < 0 && t.indexOf('DOCTYPE') < 0);
    assert.strictEqual(hud.pings.length, 0);
    assert.strictEqual(fetchImpl.api()[0].url, '/api/home/status?userId=u1');
    assert.ok(allText().indexOf('Home C') >= 0);
  });

  await test('race: 404 → coming soon; live heats → Enter confirms fee, lane in toast, sink ping', async () => {
    let r = mk({});
    await r.a.open(MK.GATE_START); await flush();
    assert.ok(/opens soon/i.test(allText()), allText());
    r = mk({
      'GET /api/race/track': () => ({ body: { ok: true, direction: 'counter-clockwise', pits: [1, 2, 3, 4, 5, 6, 7, 8] } }),
      'GET /api/race/heats': () => ({ body: { ok: true, heats: [{ heat_id: 'H1', state: 'open', entry_fee: 10, pool: 20, pits_free: 6 }] } }),
      'POST /api/race/heats/:id/enter': () => ({ body: { ok: true, replayed: false, pit: 'race.pit.03', balance: 5 } })
    });
    await r.a.open(MK.GATE_START); await flush();
    byAct('enter:H1').click(); await flush();
    assert.strictEqual(r.fetchImpl.api().filter(c => c.method === 'POST').length, 0);
    byAct('confirm').click(); await flush();
    const post = r.fetchImpl.api().find(c => c.method === 'POST');
    assert.strictEqual(post.url, '/api/race/heats/H1/enter');
    assert.ok(allText().indexOf('Lane 3') >= 0, allText());
    assert.deepStrictEqual(r.hud.pings.filter(p => p.type === 'sparks:sink').map(p => p.sparks), [-10]);
    // a pit shows heats read-only (no Enter button, no pit fee charged)
    await r.a.open(MK.PIT_02); await flush();
    assert.strictEqual(byAct('enter:*'), null);
  });

  await test('home live: move in (confirm, homeId) then check-in grant pings sparks:mint', async () => {
    let housed = false;
    const { a, fetchImpl, hud } = mk({
      'GET /api/home/status': () => ({ body: housed
        ? { ok: true, housed: true, home_id: 'home.c', state: 'lit', rent_due: 0, checked_in_today: false, paid_through: '2026-09-27', balance: 37 }
        : { ok: true, housed: false, state: 'empty', balance: 42 } }),
      'POST /api/home/inhabit': () => { housed = true; return { body: { ok: true, replayed: false, state: 'lit', balance: 37 } }; },
      'POST /api/home/checkin': () => ({ body: { ok: true, granted: 3, balance: 40 } })
    });
    await a.open(MK.HUB_HOME_C); await flush();
    byAct('inhabit').click(); await flush();
    assert.ok(allText().indexOf('5 SPARKS') >= 0);
    byAct('confirm').click(); await flush(12);
    const inh = fetchImpl.api().find(c => c.url === '/api/home/inhabit');
    assert.strictEqual(inh.body.homeId, 'home.c');
    assert.deepStrictEqual(hud.pings.filter(p => p.type === 'sparks:sink').map(p => p.sparks), [-5]);
    byAct('checkin').click(); await flush(12);
    assert.deepStrictEqual(hud.pings.filter(p => p.type === 'sparks:mint').map(p => p.sparks), [3]);
  });

  await test('seat: 3 s progress (shortened) then "Click. {skill} is seated." ping', async () => {
    const { a, fetchImpl, hud } = mk({
      'GET /api/skills/market': () => ({ body: { ok: true, skills: [{ id: 'sk1', name: 'work.hire', price_credits: 15, seller_agent: 'NEXUS', rarity: 'common' }] } }),
      'POST /api/skills/market/:id/run': () => ({ body: { ok: true, txId: 't1', output: 'ok' } })
    });
    await a.open(MK.NODE_SKILL_INSTALL); await flush();
    byAct('seat:sk1').click(); await flush();
    assert.strictEqual(fetchImpl.api().filter(c => c.method === 'POST').length, 0);
    byAct('confirm').click(); await flush(2);
    let bar = false; walk(panelEl(), e => { if (e.attrs['data-seat']) bar = true; });
    assert.ok(bar, 'seating progress bar is shown');
    assert.strictEqual(hud.pings.filter(p => p.type === 'skill:seated').length, 0, 'no ping before the seat finishes');
    await wait(60); await flush();
    const seated = hud.pings.filter(p => p.type === 'skill:seated');
    assert.strictEqual(seated.length, 1);
    assert.strictEqual(seated[0].text, 'Click. work.hire is seated.');
    assert.strictEqual(hud.pings.filter(p => p.type === 'sparks:sink').length, 0, 'credits are not reported as SPARKS');
    assert.strictEqual(hud.pings.filter(p => p.type === 'credits:sink').length, 1);
  });

  await test('hire: needs a job text, then confirm → POST /api/hire/:agent', async () => {
    const { a, fetchImpl } = mk({
      'GET /api/hire/rates': () => ({ body: { ok: true, currency: 'SHAD-Credits', rates: { NEXUS: { base: 6, perToken: 0.001 } } } }),
      'POST /api/hire/:agent': () => ({ body: { ok: true, taskId: 'x', deposit: 6 } })
    });
    await a.open(MK.OBJ_HIRING_BOARD); await flush();
    byAct('hire:NEXUS').click(); await flush();
    assert.ok(!hasConfirm(), 'no confirm without a job');
    inputField('task').value = 'draft a post';
    byAct('hire:NEXUS').click(); byAct('confirm').click(); await flush();
    const post = fetchImpl.api().find(c => c.method === 'POST');
    assert.strictEqual(post.url, '/api/hire/NEXUS');
    assert.strictEqual(post.body.task, 'draft a post');
  });

  await test('academy: catalog on open, board is read-only, no tab/spend request', async () => {
    const { a, fetchImpl } = mk({ 'GET /api/academy/catalog': () => ({ body: { results: [{ name: 'Helius RPC', provider: 'helius', useWhen: 'loops' }] } }),
      'POST /api/academy/quote': () => ({ body: { needsChannel: true, humanApprovalRequired: false } }) });
    await a.open(MK.OBJ_CLASS_BOARD); await flush();
    assert.ok(allText().indexOf('Helius RPC') >= 0);
    assert.strictEqual(byAct('quote:*'), null);
    await a.open(MK.CLASS_ART); await flush();
    byAct('quote:helius').click(); await flush();
    assert.ok(fetchImpl.api().some(c => c.url === '/api/academy/quote'));
    assert.ok(!fetchImpl.api().some(c => /open_tab|\/spend/.test(c.url)));
  });

  await test('plots: counts from city.stats (plots-v4.json), claim is disabled, no API', async () => {
    const city = { stats: () => ({ loaded: true, plots: 1275, plotsByState: { empty: 1270, claimed: 5, built: 0, listed: 0, lapsed: 0 } }) };
    const { a, fetchImpl } = mk({}, { city });
    await a.open(MK.DEED_OFFICE); await flush();
    assert.ok(allText().indexOf('1275 plots') >= 0, allText());
    assert.ok(byAct('claim').disabled);
    assert.strictEqual(fetchImpl.api().length, 0);
    const r2 = mk({});            // no city → reads plots-v4.json
    await r2.a.open(MK.BUILDER_YARD); await flush(20);
    assert.ok(/\d+ plots/.test(allText()), allText());
    assert.ok(allText().indexOf('Civic Tower') >= 0);
  });

  await test('locked skill → copy.locked, no requests', async () => {
    const { a, fetchImpl } = mk(ECON, { hasSkill: () => false });
    await a.open(MK.OBJ_HIRING_BOARD); await flush();
    assert.ok(allText().indexOf('Needs work.hire') >= 0, allText());
    assert.strictEqual(fetchImpl.api().length, 0);
  });

  await test('offline (fetch rejects) → friendly message', async () => {
    const { a } = mk({ 'GET /api/bazaar/list': 'reject' });
    await a.open(MK.STALL_001); await flush();
    assert.ok(/shuttered|reach/i.test(allText()), allText());
  });

  await test('Esc closes, E closes, E in an input does not, same-marker open toggles, pointer lock released', async () => {
    const closes = [];
    const { a } = mk(ECON, { onClose: i => closes.push(i) });
    doc.pointerLockElement = {};
    await a.open(MK.OBJ_SPARKS_KIOSK); await flush();
    assert.strictEqual(doc.exitCalls > 0, true);
    key('Escape'); assert.ok(!a.isOpen());
    assert.strictEqual(closes[0].wasLocked, true);
    await a.open(MK.OBJ_HIRING_BOARD); await flush();
    key('e', { target: fakeEl('input') }); assert.ok(a.isOpen(), 'typing E in an input keeps it open');
    const ev = key('e'); assert.ok(!a.isOpen()); assert.ok(ev.stopped);
    await a.open(MK.ARCHIVE); await flush();
    await a.open(MK.ARCHIVE); assert.ok(!a.isOpen(), 'E again at the same marker toggles');
    key('Escape'); // no-op when closed
  });

  await test('no forbidden words in any rendered text, across all 108 markers, even with hostile server strings', async () => {
    const evil = 'Withdraw now · cash out · redeem · payout';
    const routes = {
      'GET /api/economy/balance': () => ({ body: { ok: true, sparks_balance: 1 } }),
      'GET /api/economy/catalog': () => ({ body: { ok: true, items: [{ id: 'e', name: evil, kind: evil, sparks_price: 3 }] } }),
      'GET /api/hire/rates': () => ({ body: { ok: true, rates: { NEXUS: { base: 6 } } } }),
      'GET /api/academy/catalog': () => ({ body: { results: [{ name: evil, provider: 'p', useWhen: evil }] } }),
      'GET /api/skills/market': () => ({ body: { ok: true, skills: [{ id: 's', name: evil, price_credits: 5 }] } }),
      'GET /api/home/status': () => ({ status: 409, body: { ok: false, error: evil, code: 'X' } }),
      'GET /api/race/track': () => ({ body: { ok: true } }),
      'GET /api/race/heats': () => ({ body: { ok: true, heats: [{ heat_id: 'payout', state: 'open', entry_fee: 10, pool: 0, payouts: [1] }] } }),
      'GET /api/bazaar/list': () => ({ body: { ok: true, listings: [{ id: 'b', name: evil, kind: 'item', seller: 'redeemer', price: 4 }] } })
    };
    const { a } = mk(routes, { city: { stats: () => ({ loaded: true, plots: 3, plotsByState: { empty: 3 } }) } });
    for (const n of Object.keys(MK)) {
      await a.open(MK[n]); await flush();
      const b = byAct('buy:*'); if (b) { b.click(); await flush(); }
      const t = allText();
      assert.ok(!FORBIDDEN.test(t), n + ': ' + t.match(FORBIDDEN));
      a.close();
    }
    // and the module source itself never labels a control with those words
    const src = fs.readFileSync(path.join(ROOT, 'public', 'world-city-actions.js'), 'utf8');
    const labels = (src.match(/btn\('([^']*)'/g) || []).join(' ');
    assert.ok(!FORBIDDEN.test(labels), labels);
  });

  await test('outcome(): mapping of statuses', () => {
    assert.strictEqual(P.outcome({ status: 200, ok: true, json: { ok: true } }).kind, 'ok');
    assert.strictEqual(P.outcome({ status: 200, ok: true, json: { ok: false } }).kind, 'fail');
    assert.strictEqual(P.outcome({ status: 404, ok: false, json: null }).kind, 'soon');
    assert.strictEqual(P.outcome({ status: 404, ok: false, json: { ok: false, code: 'NOT_FOUND' } }, false).kind, 'fail');
    assert.strictEqual(P.outcome({ status: 404, ok: false, json: { ok: false } }, true).kind, 'soon');
    assert.strictEqual(P.outcome({ status: 402, ok: false, json: {} }).kind, 'payin');
    assert.strictEqual(P.outcome({ status: 0 }).kind, 'offline');
    assert.ok(P.routeIsNew(MK.HUB_HOME_A, 'home') && P.routeIsNew(MK.GATE_START, 'race') && !P.routeIsNew(MK.OBJ_SPARKS_KIOSK, 'economy'));
  });

  await test('dispose removes the panel, listener and global hook', async () => {
    const { a } = mk({});
    await a.open(MK.ARCHIVE); await flush();
    a.dispose(); current = null;
    assert.strictEqual(panelEl(), undefined);
    assert.strictEqual(window.__onCityInteract, undefined);
    assert.strictEqual((winListeners.keydown || []).length, 0);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
