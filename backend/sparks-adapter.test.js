'use strict';
/* /sparks adapter over the single economy-service ledger
   (backend/sparks-adapter-routes.js). Same /sparks/* API shape as the
   standalone MMO routes (server/sparksRoutes.js), same vendor catalog and
   earn allow-list — but balances live in economy-service units, so the
   game client, the dashboard header and the City panel all read ONE number.
   Run: node --test backend/sparks-adapter.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.DATABASE_URL;
const express = require('express');
const { EconomyService, DevFileStore } = require('./economy-service');
const createSparksAdapter = require('./sparks-adapter-routes');

let server, base, svc, tmp;
test.before(async () => {
  tmp = path.join(os.tmpdir(), `sparks-adapter-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  svc = new EconomyService({ store: new DevFileStore(tmp) });
  const app = express(); app.use(express.json());
  app.use('/sparks', createSparksAdapter(svc));
  await new Promise((r) => { server = app.listen(0, r); });
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => { server.close(); try { fs.unlinkSync(tmp); } catch (_) {} try { fs.unlinkSync(tmp + '.tmp'); } catch (_) {} });

async function call(method, url, body, uid) {
  const h = { 'Content-Type': 'application/json' }; if (uid) h['x-user-id'] = uid;
  const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

test('guests get no server wallet (401), same as the MMO routes', async () => {
  assert.equal((await call('GET', '/sparks/balance', null, 'guest-1')).status, 401);
  assert.equal((await call('GET', '/sparks/balance', null, 'local')).status, 401);
  assert.equal((await call('GET', '/sparks/balance')).status, 401);
});

test('first balance grants the 100-Spark signup once; the ledger agrees', async () => {
  const b = await call('GET', '/sparks/balance', null, 'adapter-u1');
  assert.equal(b.status, 200);
  assert.equal(b.body.balance, 100);
  assert.equal(b.body.balance_units, 10000);
  assert.equal(b.body.mode, 'server');
  assert.equal(await svc.getBalance('adapter-u1'), 10000, 'economy-service holds the same balance');
  const b2 = await call('GET', '/sparks/balance', null, 'adapter-u1');
  assert.equal(b2.body.balance, 100, 'second read does not re-grant');
  assert.equal(await svc.getBalance('adapter-u1'), 10000);
});

test('spend is server-authoritative and never goes negative', async () => {
  await call('GET', '/sparks/balance', null, 'adapter-u2');
  assert.equal((await call('POST', '/sparks/spend', { amount: 30, kind: 'ticket' }, 'adapter-u2')).body.balance, 70);
  assert.equal((await call('POST', '/sparks/spend', { amount: 5000, kind: 'ticket' }, 'adapter-u2')).status, 400);
  assert.equal((await call('GET', '/sparks/balance', null, 'adapter-u2')).body.balance, 70);
  assert.equal(await svc.getBalance('adapter-u2'), 7000);
  assert.equal((await call('POST', '/sparks/spend', { amount: -5 }, 'adapter-u2')).status, 400);
  assert.equal((await call('POST', '/sparks/spend', { amount: 'lots' }, 'adapter-u2')).status, 400);
});

test('earn: allow-listed kinds only, capped per call and per day', async () => {
  await call('GET', '/sparks/balance', null, 'adapter-u3');
  assert.equal((await call('POST', '/sparks/earn', { amount: 999999999, kind: 'tactics' }, 'adapter-u3')).status, 400);
  assert.equal((await call('POST', '/sparks/earn', { amount: 10, kind: 'jackpot' }, 'adapter-u3')).status, 403);
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/sparks/earn', { amount: 100, kind: 'tactics' }, 'adapter-u3')).status, 200);
  assert.equal((await call('POST', '/sparks/earn', { amount: 100, kind: 'tactics' }, 'adapter-u3')).status, 429);
  assert.equal((await call('GET', '/sparks/balance', null, 'adapter-u3')).body.balance, 500);
});

test('vendor purchase: server prices, real debit, forged price ignored', async () => {
  await call('GET', '/sparks/balance', null, 'adapter-u4');
  const ok = await call('POST', '/sparks/vendor/buy', { vendorId: 'kiosk-3', itemId: 'nachos', price: 0 }, 'adapter-u4');
  assert.equal(ok.status, 200); assert.equal(ok.body.price, 8); assert.equal(ok.body.balance, 92);
  assert.equal((await call('POST', '/sparks/vendor/buy', { vendorId: 'kiosk-3', itemId: 'free-money' }, 'adapter-u4')).status, 400);
  const inv = await svc.getInventory('adapter-u4');
  assert.equal(inv.filter((it) => it.catalog_id === 'snack_nachos').length, 1);
  const cat = await call('GET', '/sparks/vendor/catalog');
  assert.equal(cat.body.catalog.nachos.price, 8);
});

test('fractional balances display in Sparks: 50 extra units = 100.50', async () => {
  await call('GET', '/sparks/balance', null, 'adapter-u5');
  await svc.grant('adapter-u5', 50, 'test:fractional', 'frac-1');
  const b = await call('GET', '/sparks/balance', null, 'adapter-u5');
  assert.equal(b.body.balance, 100.5);
  assert.equal(b.body.balance_units, 10050);
});

test('ledger and summary read the same store', async () => {
  await call('GET', '/sparks/balance', null, 'adapter-u6');
  await call('POST', '/sparks/spend', { amount: 10, kind: 'ticket' }, 'adapter-u6');
  const l = await call('GET', '/sparks/ledger?limit=10', null, 'adapter-u6');
  assert.equal(l.status, 200);
  assert.ok(l.body.entries.some((e) => e.kind === 'spend:ticket' && e.delta === -10));
  assert.ok(l.body.entries.some((e) => e.kind === 'signup-grant' && e.delta === 100));
  const s = await call('GET', '/sparks/summary');
  assert.equal(s.status, 200);
  assert.ok(s.body.summary.minted > 0);
  assert.ok(s.body.summary.byKind['signup-grant']);
});
