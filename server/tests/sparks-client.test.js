/* Client read-through cache (public/sparks-ledger.js) against the real server.  node --test server/tests/sparks-client.test.js < /dev/null */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shd-spk-')); process.env.SHADDAI_MMO_DATA = TMP;
const express = require('express');
const sparksRoutes = require('../sparksRoutes');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sparks-ledger.js'), 'utf8');

let server, base; const app = express(); app.use(express.json()); app.use('/sparks', sparksRoutes);
test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => server.close());

// a fresh "browser" per test: own localStorage, own window, ShdSparks loaded by running the real file
function browser(uid, api) {
  const mem = {}; if (uid) mem.shd_userid = uid;
  const ls = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const toasts = []; const events = [];
  const win = { SHD_MMO_API: api == null ? base : api, __toast: m => toasts.push(m), dispatchEvent: e => { events.push(e); }, addEventListener() {} };
  const ctx = vm.createContext({ window: win, localStorage: ls, location: { hostname: 'beta.example' }, fetch, setTimeout: () => 0, setInterval: () => 0, clearTimeout, console, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, AbortController, document: { visibilityState: 'visible' }, JSON, Math, Date, Promise, parseInt, isFinite, Headers });
  vm.runInContext(SRC, ctx); return { S: win.ShdSparks, mem, toasts, events };
}
const settle = () => new Promise(r => setTimeout(r, 60));

test('guest / no server: local mode, old behaviour preserved', async () => {
  const b = browser(null); assert.equal(await b.S.sync(), 'local'); assert.equal(b.S.get(), 0);
  b.S.add(50, 'arcade'); assert.equal(b.S.get(), 50); assert.equal(b.S.spend(20, 'x'), true); assert.equal(b.S.get(), 30); assert.equal(b.S.spend(999), false);
  const g = browser('guest-77'); assert.equal(await g.S.sync(), 'local');
});

test('signed-in: cache reads through to the server wallet; localStorage forgery is overwritten', async () => {
  const b = browser('real-uid-1'); assert.equal(await b.S.sync(), 'server'); assert.equal(b.S.get(), 100);
  b.mem['shaddai.sparks'] = '999999999';                       // the classic cheat
  assert.equal(b.S.get(), 999999999, 'cache is only a cache until the next sync');
  await b.S.sync(); assert.equal(b.S.get(), 100, 'server truth wins on sync');
});

test('signed-in spend: optimistic then confirmed; an over-spend the cache allowed is rolled back by the server', async () => {
  const b = browser('real-uid-2'); await b.S.sync();
  assert.equal(b.S.spend(30, 'ticket'), true); assert.equal(b.S.get(), 70); await settle(); assert.equal(b.S.get(), 70);
  b.mem['shaddai.sparks'] = '5000'; assert.equal(b.S.spend(4000, 'ticket'), true);   // forged cache lets the click through...
  await settle(); assert.equal(b.S.get(), 70, '...but the server refuses and the cache snaps back to 70'); assert.ok(b.toasts.length >= 1);
  const c = browser('real-uid-2'); await c.S.sync(); assert.equal(c.S.get(), 70, 'a second device sees the same truth');
});

test('signed-in earn: allow-listed kinds accepted, forged kinds/amounts rolled back', async () => {
  const b = browser('real-uid-3'); await b.S.sync();
  b.S.add(40, 'tactics'); await settle(); assert.equal(b.S.get(), 140);
  b.S.add(5000, 'tactics'); await settle(); assert.equal(b.S.get(), 140, 'over the per-call cap: refused, rolled back');
  b.S.add(50, 'made-up-faucet'); await settle(); assert.equal(b.S.get(), 140);
});

test('concession purchase: server catalog + server price; local mode falls back to a local debit', async () => {
  const b = browser('real-uid-4'); await b.S.sync();
  const r = await b.S.buy('kiosk-1', 'nachos'); assert.equal(r.ok, true); assert.equal(r.price, 8); assert.equal(b.S.get(), 92);
  const bad = await b.S.buy('kiosk-1', 'free-money'); assert.equal(bad.ok, false); assert.equal(b.S.get(), 92);
  const l = browser(null); l.S.add(20, 'arcade'); const lr = await l.S.buy('kiosk-1', 'soda', { price: 3, item: 'drink_soda', name: 'Neon Soda' }); assert.equal(lr.ok, true); assert.equal(l.S.get(), 17);
  const poor = browser(null); assert.equal((await poor.S.buy('k', 'soda', { price: 3, item: 'x', name: 'x' })).ok, false);
});

test('server unreachable: drops to local mode instead of breaking the game', async () => {
  const b = browser('real-uid-5', 'http://127.0.0.1:1'); assert.equal(await b.S.sync(), 'local'); b.S.add(10, 'arcade'); assert.equal(b.S.get(), 10);
});
