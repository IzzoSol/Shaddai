'use strict';
// Colosseum schedule + tickets. Run: node backend/tests/arena-routes.test.js
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createArena } = require('../arena-routes');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-'));
  let clock = 1000 * 60 * 60 * 24 * 3 + 5000; const bal = { alice: 200, bob: 0 }, spent = []; let failEcon = false;
  const economy = { spend: async (u, n, reason, key) => { if (failEcon) throw new Error('db'); if ((bal[u] || 0) < n) { const e = new Error('Insufficient'); e.code = 'INSUFFICIENT_FUNDS'; throw e; } bal[u] -= n; spent.push({ u, n, reason, key }); return {}; }, grant: async (u, n) => { bal[u] = (bal[u] || 0) + n; return {}; } };
  function boot(extra) {
    const r = createArena(Object.assign({ file: path.join(tmp, 't' + Math.random() + '.json'), secretFile: path.join(tmp, 's.txt'), secret: 'test-secret', now: () => clock, economy, unitsPerSpark: 100, uidOf: (q) => q.headers['x-uid'] || '' }, extra || {}));
    const app = express(); app.use('/a', r); return new Promise((res) => { const s = app.listen(0, () => res({ r, s, base: 'http://127.0.0.1:' + s.address().port + '/a' })); });
  }
  const http = (base) => async (method, p, o) => { o = o || {}; const h = { 'content-type': 'application/json' }; if (o.uid) h['x-uid'] = o.uid; const r = await fetch(base + p, { method, headers: h, body: o.body ? JSON.stringify(o.body) : undefined }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };

  // ── free tickets (default): sign-in required, no Sparks touched ──
  let A = await boot(); let H = http(A.base);
  const ev = (await H('GET', '/events')).json; assert.strictEqual(ev.ok, true); assert.strictEqual(ev.tickets_on, false); assert.strictEqual(ev.signed_in, false);
  assert.deepStrictEqual(ev.current.map((e) => e.kind), ['main', 'tournament']); assert.ok(ev.next.every((e) => e.starts > clock - 1) && ev.practice.free === true);
  assert.strictEqual(ev.current[0].price_sparks, '0.50'); assert.strictEqual(ev.current[1].price_sparks, '1.00');
  const mainId = ev.current[0].id, tourId = ev.current[1].id;
  assert.strictEqual((await H('POST', '/ticket', { body: { event_id: mainId } })).status, 401, 'tickets need sign-in');
  assert.strictEqual((await H('POST', '/ticket', { uid: 'alice', body: { event_id: 'nonsense' } })).status, 404); assert.strictEqual((await H('POST', '/ticket', { uid: 'alice', body: { event_id: 'bout-1' } })).status, 404, 'past events cannot be ticketed');
  assert.strictEqual((await H('POST', '/ticket', { uid: 'alice', body: { event_id: 'bout-99999999999' } })).status, 404, 'far-future events are refused');
  assert.strictEqual((await H('GET', '/ticket/' + mainId)).json.seed, undefined, 'no seed without a ticket'); assert.strictEqual((await H('GET', '/ticket/' + mainId, { uid: 'alice' })).json.has_ticket, false);
  const t1 = await H('POST', '/ticket', { uid: 'alice', body: { event_id: mainId } }); assert.strictEqual(t1.status, 201); assert.strictEqual(t1.json.charged_sparks, '0.00'); assert.strictEqual(typeof t1.json.seed, 'number'); assert.strictEqual(spent.length, 0, 'free mode never touches Sparks');
  const t2 = await H('POST', '/ticket', { uid: 'alice', body: { event_id: mainId } }); assert.strictEqual(t2.json.already, true); assert.strictEqual(t2.json.seed, t1.json.seed, 'same ticket, same seed');
  assert.strictEqual((await H('GET', '/ticket/' + mainId, { uid: 'alice' })).json.seed, t1.json.seed); assert.strictEqual((await H('GET', '/ticket/' + mainId, { uid: 'bob' })).json.seed, undefined, 'another player does not get alice\'s seed');
  assert.notStrictEqual((await H('POST', '/ticket', { uid: 'alice', body: { event_id: tourId } })).json.seed, t1.json.seed, 'each event has its own seed');
  assert.strictEqual((await H('GET', '/events', { uid: 'alice' })).json.current[0].has_ticket, true); assert.strictEqual((await H('GET', '/events', { uid: 'bob' })).json.current[0].has_ticket, false);
  clock += 4 * 60 * 1000; assert.strictEqual((await H('GET', '/ticket/' + mainId, { uid: 'alice' })).status, 404, 'a finished bout is no longer ticketed'); A.s.close();

  // ── paid mode: Sparks, idempotent, refunded on failure, 402 when broke ──
  clock = 1000 * 60 * 60 * 24 * 3 + 5000; A = await boot({ ticketsOn: true }); H = http(A.base);
  assert.strictEqual((await H('GET', '/events')).json.tickets_on, true);
  const p1 = await H('POST', '/ticket', { uid: 'alice', body: { event_id: mainId } }); assert.strictEqual(p1.status, 201); assert.strictEqual(p1.json.charged_sparks, '0.50'); assert.strictEqual(bal.alice, 150, '0.50 Spark = 50 units'); assert.strictEqual(spent[0].reason, 'arena:ticket');
  assert.strictEqual((await H('POST', '/ticket', { uid: 'alice', body: { event_id: mainId } })).json.already, true); assert.strictEqual(bal.alice, 150, 'a second request never charges twice');
  assert.strictEqual((await H('POST', '/ticket', { uid: 'bob', body: { event_id: mainId } })).status, 402, 'no Sparks, no ticket'); assert.strictEqual((await H('GET', '/ticket/' + mainId, { uid: 'bob' })).json.has_ticket, false);
  failEcon = true; assert.strictEqual((await H('POST', '/ticket', { uid: 'alice', body: { event_id: tourId } })).status, 503, 'if the ledger is down, no free pass'); failEcon = false; assert.strictEqual(bal.alice, 150);
  A.s.close();
  // seeds are stable per secret and differ per event
  const s1 = require('../arena-routes').createArena({ secret: 'k1', file: path.join(tmp, 'x.json'), secretFile: path.join(tmp, 's2.txt'), uidOf: () => '' })._test.seedOf('bout-5'); const s2 = require('../arena-routes').createArena({ secret: 'k2', file: path.join(tmp, 'y.json'), secretFile: path.join(tmp, 's3.txt'), uidOf: () => '' })._test.seedOf('bout-5');
  assert.notStrictEqual(s1, s2, 'a different server secret gives different seeds (viewers cannot precompute outcomes)');
  console.log('arena-routes: all assertions passed'); process.exit(0);
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
