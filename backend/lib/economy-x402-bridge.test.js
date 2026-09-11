'use strict';
/**
 * Self-running test for economy-x402-bridge.js (assert + process.exit style,
 * matches this repo's other lib/*.test.js scripts run via gate-node.js).
 */
process.env.NODE_ENV = 'test';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ISO = path.join(__dirname, '..', 'data', '_bridge-selftest.json');
function freshStore() {
  fs.writeFileSync(ISO, JSON.stringify({
    economy_accounts: {}, spark_transactions: [], inventory_items: {},
    catalog_items: {}, subscriptions: {}, _seq: 0
  }));
}
function cleanup() { try { fs.unlinkSync(ISO); } catch (_) {} }

async function run() {
  freshStore();
  const eco = require('../economy-service');
  const svc = new eco.EconomyService({ store: new eco.DevFileStore(ISO) });
  const origGetDefault = eco.getDefault;
  eco.getDefault = () => svc;

  // Bridge must be required AFTER the getDefault override since it captures
  // the module reference, not a live binding.
  delete require.cache[require.resolve('./economy-x402-bridge')];
  const bridge = require('./economy-x402-bridge');

  try {
    // 1. Disabled by default (no env flag set).
    delete process.env.X402_SPARKS_BRIDGE;
    let r = await bridge.settleCharge({ user: 'u1', amount: 5, nonce: 'n0' });
    assert.strictEqual(r.settledInSparks, false);
    assert.strictEqual(r.reason, 'disabled');
    console.log('PASS: disabled by default');

    process.env.X402_SPARKS_BRIDGE = 'true';

    // 2. Settle + debit + credit.
    await svc.grant('u1', 50, 'seed', 'seed-key');
    r = await bridge.settleCharge({ user: 'u1', payee: 'agent1', amount: 18, reason: 'premium', nonce: 'n1' });
    assert.strictEqual(r.settledInSparks, true);
    assert.strictEqual(r.payerBalance, 32);
    assert.strictEqual(r.payeeBalance, 18);
    console.log('PASS: settle + debit + credit');

    // 3. Idempotent nonce replay — same nonce must not double-debit.
    r = await bridge.settleCharge({ user: 'u1', payee: 'agent1', amount: 18, reason: 'premium', nonce: 'n1' });
    assert.strictEqual(r.settledInSparks, true);
    assert.strictEqual(r.payerBalance, 32); // unchanged — replayed, not re-spent
    console.log('PASS: idempotent nonce replay');

    // 4. Fractional USD rejected.
    r = await bridge.settleCharge({ user: 'u1', amount: 2.5, nonce: 'n2' });
    assert.strictEqual(r.settledInSparks, false);
    assert.ok(r.error && /integer/i.test(r.error));
    console.log('PASS: fractional USD rejected');

    // 5. Insufficient funds — clean fallback, no throw.
    r = await bridge.settleCharge({ user: 'u1', amount: 999, nonce: 'n3' });
    assert.strictEqual(r.settledInSparks, false);
    assert.strictEqual(r.reason, 'insufficient_sparks');
    console.log('PASS: insufficient funds clean fallback');

    // 6. creditSparks grants 1:1.
    r = await bridge.creditSparks({ user: 'u2', amount: 10, reason: 'onchain', refId: 'tx1' });
    assert.strictEqual(r.granted, true);
    assert.strictEqual(r.sparks, 10);
    assert.strictEqual(r.balance, 10);
    // Replay of the same refId must not double-grant.
    r = await bridge.creditSparks({ user: 'u2', amount: 10, reason: 'onchain', refId: 'tx1' });
    assert.strictEqual(r.replayed, true);
    assert.strictEqual(r.balance, 10);
    console.log('PASS: creditSparks 1:1 grant + idempotent');

    console.log('\n6/6 economy-x402-bridge tests passed');
  } finally {
    eco.getDefault = origGetDefault;
    cleanup();
  }
}

run().catch((e) => { console.error(e); cleanup(); process.exit(1); });
