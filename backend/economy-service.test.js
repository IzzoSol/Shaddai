'use strict';
/**
 * economy-service.test.js — plain node test runner (no framework).
 * Run:  node economy-service.test.js
 *
 * Uses the DEV file store (no DATABASE_URL) with a throwaway temp file so it
 * runs anywhere. Verifies the correctness-critical properties of the ledger:
 *   1. grant increases balance
 *   2. spend decreases balance
 *   3. spend beyond balance is rejected (InsufficientFundsError), no mutation
 *   4. idempotent replay of the same key does NOT double-apply (grant & spend)
 *   5. concurrent grants don't lose updates (N grants -> balance == sum)
 *   6. grantItem is idempotent
 *   7. purchase-style flow (spend + grantItem) is atomic + idempotent
 *   8. input validation rejects floats / non-positive / bad ids
 *   9. no cash-out / withdraw method exists on the service
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// Ensure dev store even if the environment has DATABASE_URL set.
delete process.env.DATABASE_URL;

const {
  EconomyService,
  DevFileStore,
  InsufficientFundsError,
  ValidationError
} = require('./economy-service');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  // Fresh isolated store per test.
  const tmp = path.join(os.tmpdir(), `economy-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const svc = new EconomyService({ store: new DevFileStore(tmp) });
  try {
    await fn(svc);
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n        ') : err}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(tmp + '.tmp'); } catch (_) {}
  }
}

(async () => {
  console.log('economy-service tests (dev file store)\n');

  await test('grant increases balance', async (svc) => {
    const r = await svc.grant('u1', 100, 'signup_bonus', 'k-grant-1');
    assert.strictEqual(r.replayed, false);
    assert.strictEqual(r.balance, 100);
    assert.strictEqual(await svc.getBalance('u1'), 100);
    const r2 = await svc.grant('u1', 50, 'daily', 'k-grant-2');
    assert.strictEqual(r2.balance, 150);
    assert.strictEqual(await svc.getBalance('u1'), 150);
  });

  await test('spend decreases balance', async (svc) => {
    await svc.grant('u1', 100, 'seed', 'k1');
    const r = await svc.spend('u1', 30, 'buy_thing', 'k2');
    assert.strictEqual(r.replayed, false);
    assert.strictEqual(r.balance, 70);
    assert.strictEqual(await svc.getBalance('u1'), 70);
    // Ledger transaction is stored as a negative amount.
    assert.strictEqual(r.transaction.amount, -30);
  });

  await test('spend beyond balance is rejected and does not mutate', async (svc) => {
    await svc.grant('u1', 40, 'seed', 'k1');
    let threw = null;
    try {
      await svc.spend('u1', 41, 'overspend', 'k2');
    } catch (e) {
      threw = e;
    }
    assert.ok(threw instanceof InsufficientFundsError, 'expected InsufficientFundsError');
    // Balance unchanged.
    assert.strictEqual(await svc.getBalance('u1'), 40);
    // Exact-balance spend is allowed (boundary).
    const ok = await svc.spend('u1', 40, 'spend_all', 'k3');
    assert.strictEqual(ok.balance, 0);
  });

  await test('idempotent grant replay does NOT double-credit', async (svc) => {
    const a = await svc.grant('u1', 100, 'promo', 'same-key');
    assert.strictEqual(a.replayed, false);
    assert.strictEqual(a.balance, 100);
    const b = await svc.grant('u1', 100, 'promo', 'same-key'); // replay
    assert.strictEqual(b.replayed, true);
    assert.strictEqual(await svc.getBalance('u1'), 100, 'must NOT be 200');
    // Same tx returned.
    assert.strictEqual(b.transaction.id, a.transaction.id);
  });

  await test('idempotent spend replay does NOT double-debit', async (svc) => {
    await svc.grant('u1', 100, 'seed', 'g');
    const a = await svc.spend('u1', 30, 'buy', 'spend-key');
    assert.strictEqual(a.balance, 70);
    const b = await svc.spend('u1', 30, 'buy', 'spend-key'); // replay
    assert.strictEqual(b.replayed, true);
    assert.strictEqual(await svc.getBalance('u1'), 70, 'must NOT be 40');
  });

  await test('concurrent grants do not lose updates', async (svc) => {
    const N = 200;
    const each = 7;
    const ops = [];
    for (let i = 0; i < N; i++) {
      ops.push(svc.grant('u1', each, 'burst', `burst-${i}`));
    }
    await Promise.all(ops);
    assert.strictEqual(await svc.getBalance('u1'), N * each, `expected ${N * each}`);
  });

  await test('concurrent replay of SAME key credits exactly once', async (svc) => {
    const N = 50;
    const ops = [];
    for (let i = 0; i < N; i++) {
      ops.push(svc.grant('u1', 10, 'dup', 'one-key'));
    }
    await Promise.all(ops);
    assert.strictEqual(await svc.getBalance('u1'), 10, 'concurrent dup keys must apply once');
  });

  await test('grantItem is idempotent', async (svc) => {
    const a = await svc.grantItem('u1', 'cat-hat', 1, 'item-key');
    assert.strictEqual(a.replayed, false);
    const b = await svc.grantItem('u1', 'cat-hat', 1, 'item-key'); // replay
    assert.strictEqual(b.replayed, true);
    const inv = await svc.getInventory('u1');
    assert.strictEqual(inv.length, 1, 'must not duplicate inventory item');
    assert.strictEqual(inv[0].catalog_id, 'cat-hat');
  });

  await test('purchase flow: spend + grantItem atomic & idempotent', async (svc) => {
    await svc.upsertCatalogItem({ id: 'sword', name: 'Sword', kind: 'wearable', sparks_price: 60, active: true });
    await svc.grant('u1', 100, 'seed', 'seed');
    // Simulate the route's derived keys.
    const key = 'buy-1';
    const s = await svc.spend('u1', 60, 'purchase:sword', `purchase:${key}:spend`);
    const g = await svc.grantItem('u1', 'sword', 1, `purchase:${key}:grant`);
    assert.strictEqual(s.balance, 40);
    assert.strictEqual(g.replayed, false);
    // Retry same purchase -> no extra charge, no extra item.
    const s2 = await svc.spend('u1', 60, 'purchase:sword', `purchase:${key}:spend`);
    const g2 = await svc.grantItem('u1', 'sword', 1, `purchase:${key}:grant`);
    assert.strictEqual(s2.replayed, true);
    assert.strictEqual(g2.replayed, true);
    assert.strictEqual(await svc.getBalance('u1'), 40, 'retry must not double-charge');
    assert.strictEqual((await svc.getInventory('u1')).length, 1, 'retry must not double-grant');
  });

  await test('input validation rejects floats, non-positive, bad ids', async (svc) => {
    const bad = [
      () => svc.grant('u1', 1.5, 'r', 'k'),
      () => svc.grant('u1', 0, 'r', 'k'),
      () => svc.grant('u1', -5, 'r', 'k'),
      () => svc.grant('', 5, 'r', 'k'),
      () => svc.grant('u1', 5, 'r', ''),
      () => svc.spend('u1', 1.5, 'r', 'k'),
      () => svc.grantItem('u1', 'c', 0, 'k'),
      () => svc.grantItem('u1', '', 1, 'k')
    ];
    for (const f of bad) {
      let threw = null;
      try { await f(); } catch (e) { threw = e; }
      assert.ok(threw instanceof ValidationError, 'expected ValidationError for bad input');
    }
  });

  await test('NO cash-out / withdraw path exists on the service', async (svc) => {
    for (const name of ['withdraw', 'cashOut', 'cashout', 'redeem', 'transfer', 'transferOut', 'payout']) {
      assert.strictEqual(typeof svc[name], 'undefined', `forbidden method present: ${name}`);
    }
  });

  await test('atomic write survives: file is valid JSON after ops', async (svc) => {
    await svc.grant('u1', 10, 'r', 'k1');
    await svc.spend('u1', 4, 'r', 'k2');
    // The store file must always parse (never a partial write).
    const store = svc.store;
    const raw = fs.readFileSync(store.filePath, 'utf8');
    const db = JSON.parse(raw); // throws if corrupt
    assert.strictEqual(db.economy_accounts['u1'].sparks_balance, 6);
    assert.strictEqual(db.spark_transactions.length, 2);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.err && f.err.message}`);
    process.exit(1);
  }
  process.exit(0);
})();
