/* Ledger adapter in PRODUCTION mode (SHADDAI_LEDGER=economy): jobs/agent yields move Sparks through backend/economy-service (isolated temp store here). */
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shd-led-')); process.env.SHADDAI_MMO_DATA = TMP; process.env.SHADDAI_LEDGER = 'economy';
const E = require('../../backend/economy-service'); const Svc = E.EconomyService || E.Service || null;
const ledger = require('../lib/ledger');
test('economy mode: credit, debit, insufficient funds, idempotency, burn', async () => {
  assert.equal(ledger.mode(), 'economy');
  const svc = Svc ? new Svc({ filePath: path.join(TMP, 'econ.json') }) : null; assert.ok(svc, 'EconomyService export'); ledger._setService(svc);
  assert.equal((await ledger.credit('u1', 100, 'test', 'r1', 'k1')).ok, true); assert.equal(await ledger.balance('u1'), 100);
  assert.equal((await ledger.credit('u1', 100, 'test', 'r1', 'k1')).ok, true); assert.equal(await ledger.balance('u1'), 100, 'same key never double-credits');
  const d = await ledger.debit('u1', 30, 'job-escrow', 'j1', 'd1'); assert.equal(d.ok, true); assert.equal(d.balance, 70);
  const bad = await ledger.debit('u1', 999, 'job-escrow', 'j2', 'd2'); assert.equal(bad.ok, false); assert.match(bad.why, /not enough Sparks/); assert.equal(await ledger.balance('u1'), 70);
  ledger.burn(5, 'job-fee', 'j1');
});
