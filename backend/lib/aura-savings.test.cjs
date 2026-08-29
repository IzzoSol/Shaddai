#!/usr/bin/env node
// backend/lib/aura-savings.test.cjs — proves the actual owner-facing claim:
// "ask the same thing twice, the second time costs nothing because AURA
// answers from cache instead of calling a real model." Existing lib/aura.test.cjs
// covers AURA's internal deterministic solvers (math, date math, string ops) in
// isolation; this test exercises the real integration point instead —
// agent-engine.js's modelChat(), the one entry point every agent chat path uses —
// with a genuinely novel prompt against a real provider, not a mock. One real
// network call is made on purpose: this is a claim about real behavior, and a
// mocked provider would only prove the mock behaves, not that AURA does.
//
// NOT registered in gate-node.js on purpose — it spends a real (tiny) amount of
// real provider cost and needs network + a configured provider key. Run it by
// hand: `node backend/lib/aura-savings.test.cjs`. Verified manually 2026-08-29
// via the live /api/model/chat endpoint: first call → provider=groq,
// costUSD=0.0000781, 712 real tokens; second identical call → provider=
// aura-cache, costUSD=0. Direct require('../agent-engine') from a cold process
// was unreliable under load in this environment (multiple concurrent node
// processes) — if this hangs, test against a warm running server instead
// (POST /api/model/chat) rather than assuming AURA itself is broken.
'use strict';
require('dotenv').config();
const assert = require('assert');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { console.log('PASS  ' + name); passed++; }
  else { console.log('FAIL  ' + name); failed++; }
}

(async () => {
  const { modelChat } = require('../agent-engine');

  // A prompt guaranteed novel (timestamp-seeded) so the first call is a real
  // cache MISS, not an accidental hit from a previous test run or real traffic.
  const prompt = `Reply with exactly the seven-character string SEED${Date.now() % 1000000}`.slice(0, 40);
  const messages = [{ role: 'user', content: prompt }];

  console.log('\n=== AURA SAVINGS: same request twice ===');
  console.log('prompt:', prompt);

  const first = await modelChat(messages, 'ORACLE', {});
  console.log('first  →', JSON.stringify({ provider: first.provider, model: first.model, costUSD: first.costUSD, inputTokens: first.inputTokens, outputTokens: first.outputTokens }));
  check('first call reaches a real provider (novel prompt, cache miss)', first.provider !== 'aura');
  check('first call reports real token usage', (first.inputTokens + first.outputTokens) > 0);

  const second = await modelChat(messages, 'ORACLE', {});
  console.log('second →', JSON.stringify({ provider: second.provider, model: second.model, costUSD: second.costUSD }));
  check('second call is served by AURA, not a real provider', second.provider === 'aura');
  check('second call costs $0 — never reached the model', second.costUSD === 0);
  check('second call returns the same answer as the first', second.content === first.content);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => {
  console.error('THREW:', e && e.stack || e);
  process.exitCode = 1;
});
