'use strict';
/* Free-keys stack integration tests (deep loop, 2026-11-11).
 * The modules came from the shaddai-free-keys build (their own suite: 17/17
 * in ~/workspace/shaddai-free-keys/tests/). These tests pin the INTEGRATION:
 * the real catalog in backend/data/providers.json, the singleton wiring,
 * and the behaviours the dashboard depends on. No network, no real keys.
 * Run: node --test backend/tests/free-stack.test.js
 */
const test = require('node:test');
const assert = require('node:assert');

const { FreeRouter, loadCatalog } = require('../lib/free-router');
const { ChargingEngine } = require('../lib/charging');
const { TopupService, PACKS } = require('../lib/topup');
const { connectGrok } = require('../lib/grok-connect');

test('catalog: real providers.json loads and carries no dead Groq default', () => {
  const cat = loadCatalog();
  const groq = cat.providers.find(p => p.id === 'groq');
  assert.ok(groq, 'groq provider present');
  const ids = groq.models.map(m => m.id);
  assert.ok(ids.includes('openai/gpt-oss-20b'), 'gpt-oss-20b is the free workhorse');
  assert.ok(!ids.includes('llama-3.1-8b-instant'), 'decommissioned model must not be callable');
  assert.ok((groq.deadModels || []).some(d => d.id === 'llama-3.1-8b-instant'),
    'the dead model is recorded as dead, with its decommission date');
});

test('router: with no keys configured, chat fails gracefully (never throws)', async () => {
  const r = new FreeRouter({ catalog: loadCatalog(), env: {}, log: { log() {}, warn() {}, error() {} } });
  const out = await r.chat({ messages: [{ role: 'user', content: 'ping' }], lanes: ['free'] });
  assert.strictEqual(out.ok, false);
});

test('charging: free lane settles at 0 credits but is metered', () => {
  const c = new ChargingEngine({ catalog: loadCatalog(), env: {} });
  const s = c.settle('user1', 'groq/openai/gpt-oss-20b', { inputTokens: 1000, outputTokens: 500 });
  assert.strictEqual(s.credits, 0);
  assert.strictEqual(s.metered, true);
  assert.strictEqual(c.meterToday('user1').calls, 1);
  assert.strictEqual(c.meterToday('user1').inTokens, 1000);
});

test('topup: owner request → SIM pay → credited exactly once', async () => {
  let balance = 0;
  const svc = new TopupService({
    getBalance: async () => balance,
    applyCredit: async (uid, grant) => { balance += grant.credits; },
    env: {},
  });
  const r = await svc.request('owner1', 'credits_25', 'owner');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.topup.status, 'awaiting_payment');
  const pay = await svc.confirmPayment(r.topup.id);
  assert.strictEqual(pay.ok, true);
  assert.strictEqual(pay.sim, true); // SIM — no real charge anywhere in this stack
  assert.strictEqual(balance, PACKS.credits_25.credits);
  const again = await svc.confirmPayment(r.topup.id);
  assert.strictEqual(again.alreadyCredited, true);
  assert.strictEqual(balance, PACKS.credits_25.credits);
});

test('grok-connect: paste → import manifest; keys and wrong-source bots are refused', () => {
  const out = connectGrok({ paste: 'I watch markets and say what changed, with numbers.', name: 'Zerox Watch' });
  assert.strictEqual(out.ok, true);
  assert.ok(out.manifest, 'manifest is the /api/agent-forge/import body');
  // Empty paste is by design: the default Grok persona fills in.
  assert.strictEqual(connectGrok({ paste: '' }).ok, true);
  // A key-looking paste is refused — keys never go in the bot box.
  assert.strictEqual(connectGrok({ paste: 'xai-abcdefghijklmnopqrstuvwxyz0123456789' }).ok, false);
  // A non-Grok manifest is refused by source.
  const claudeJson = JSON.stringify({ format: 'shaddai-agent-import', version: '1', agent: { name: 'C', persona: 'p', source: 'claude' } });
  assert.strictEqual(connectGrok({ paste: claudeJson }).ok, false);
});

test('free-stack singleton loads against the real billing ledger', () => {
  const stack = require('../lib/free-stack');
  assert.strictEqual(stack.ok, true);
  const st = stack.router.status();
  assert.ok(st.providers && typeof st.providers === 'object');
  assert.ok('groq' in st.providers);
});
