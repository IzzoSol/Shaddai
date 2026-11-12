'use strict';
/* Sparks units convention (backend/economy-service.js): 100 ledger units =
   1 Spark — the arena-routes pattern, so the Manual's 0.1 Sparks/action is
   representable (10 units) without floats in storage.
   Run: node --test backend/economy-sparks-units.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.DATABASE_URL;
const {
  EconomyService,
  DevFileStore,
  UNITS_PER_SPARK,
  sparksToUnits,
  unitsToSparks
} = require('./economy-service');

function freshSvc() {
  const tmp = path.join(os.tmpdir(), `sparks-units-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const svc = new EconomyService({ store: new DevFileStore(tmp) });
  test.after(() => { try { fs.unlinkSync(tmp); } catch (_) {} try { fs.unlinkSync(tmp + '.tmp'); } catch (_) {} });
  return svc;
}

test('UNITS_PER_SPARK is 100; conversions are exact', () => {
  assert.equal(UNITS_PER_SPARK, 100);
  assert.equal(sparksToUnits(1), 100);
  assert.equal(sparksToUnits(0.1), 10); // the Manual's 0.1 Sparks/action
  assert.equal(sparksToUnits(0.5), 50); // arena main-bout ticket
  assert.equal(sparksToUnits(2.5), 250);
  assert.equal(unitsToSparks(100), 1);
  assert.equal(unitsToSparks(163), 1.63);
  assert.equal(unitsToSparks(50), 0.5);
  assert.equal(sparksToUnits(0), 0);
  assert.equal(sparksToUnits(-1), 0);
  assert.equal(sparksToUnits('lots'), 0);
});

test('grantSparks(0.1) stores 10 integer units; replay does not double-credit', async () => {
  const svc = freshSvc();
  const r = await svc.grantSparks('u1', 0.1, 'test:action', 'k1');
  assert.equal(r.balance, 10);
  assert.equal(r.replayed, false);
  const r2 = await svc.grantSparks('u1', 0.1, 'test:action', 'k1');
  assert.equal(r2.replayed, true);
  assert.equal(await svc.getBalance('u1'), 10);
});

test('spendSparks(0.1) twice costs 20 units; sub-cent amounts are rejected', async () => {
  const svc = freshSvc();
  await svc.grantSparks('u2', 1, 'test:grant', 'g1');
  assert.equal(await svc.getBalance('u2'), 100);
  await svc.spendSparks('u2', 0.1, 'test:action', 's1');
  await svc.spendSparks('u2', 0.1, 'test:action', 's2');
  assert.equal(await svc.getBalance('u2'), 80);
  await assert.rejects(svc.spendSparks('u2', 0.001, 'test:dust', 's3'), /at least 1 unit/);
  await assert.rejects(svc.spendSparks('u2', 5, 'test:toomuch', 's4'), /Insufficient/);
  assert.equal(await svc.getBalance('u2'), 80, 'failed spends change nothing');
});

test('integer-unit grant/spend behaviour is unchanged', async () => {
  const svc = freshSvc();
  await svc.grant('u3', 5, 'test:grant', 'g1');
  assert.equal(await svc.getBalance('u3'), 5);
  await svc.spend('u3', 5, 'test:spend', 's1');
  assert.equal(await svc.getBalance('u3'), 0);
});

test('getTransactions newest-first; getSummary aggregates minted/burned', async () => {
  const svc = freshSvc();
  await svc.grantSparks('u4', 2, 'earn:tactics', 'a1');
  await svc.spendSparks('u4', 0.5, 'spend:ticket', 'a2');
  const txs = await svc.getTransactions('u4', 10);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].reason, 'spend:ticket'); // newest first
  assert.equal(txs[0].amount, -50);
  assert.equal(txs[1].amount, 200);
  const s = await svc.getSummary();
  assert.equal(s.entries, 2);
  assert.equal(s.minted, 200);
  assert.equal(s.burned, 50);
  assert.equal(s.net, 150);
  assert.equal(s.byKind['earn:tactics'].minted, 200);
  assert.equal(s.byKind['spend:ticket'].burned, 50);
});
