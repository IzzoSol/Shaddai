'use strict';
/* Pricing single-source-of-truth guard (deep loop, 2026-11-11).
 * Canonical: backend/lib/tiers.js (retail tiers) + backend/data/credit-costs.json
 * (action costs + topup bonuses + a read-only mirror of the tiers).
 * This test does NOT set or judge any price — Israel owns prices. It only
 * fails when a fallback or mirror drifts from the canonical files, which is
 * how "what does Pro cost" previously had three different answers.
 * Run: node --test backend/tests/pricing-consistency.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const costs = JSON.parse(fs.readFileSync(path.join(BACKEND, 'data', 'credit-costs.json'), 'utf8'));
const tiers = require('../lib/tiers');

test('credit-costs.json tier mirror matches lib/tiers.js', () => {
  const cfg = tiers.tierConfig();
  for (const [tier, mirror] of Object.entries(costs.tiers)) {
    assert.ok(cfg[tier], `mirror has unknown tier ${tier}`);
    assert.strictEqual(mirror.monthlyCredits, cfg[tier].monthlyCredits,
      `${tier}: mirror ${mirror.monthlyCredits} != tiers.js ${cfg[tier].monthlyCredits}`);
  }
});

test('tiers.grants() pack credits match credit-costs.json topups', () => {
  const g = tiers.grants();
  for (const [id, top] of Object.entries(costs.topups)) {
    if (id.startsWith('_')) continue;
    assert.ok(g[id], `grants() missing pack ${id}`);
    assert.strictEqual(g[id].credits, top.credits, `${id}: grants ${g[id].credits} != topups ${top.credits}`);
  }
});

test('fallback tables carry no numbers that contradict the canonical files', () => {
  // Fallbacks only run when lib/tiers or credit-costs.json fail to load, so
  // they cannot be exercised directly — the guard is textual: the known-bad
  // drifted literals must not return.
  const billing = fs.readFileSync(path.join(BACKEND, 'billing-service.js'), 'utf8');
  assert.ok(!billing.includes('monthlyCredits:25000'),
    'billing-service fallback elite credits drifted from tiers.js (50,000)');

  const webhook = fs.readFileSync(path.join(BACKEND, 'stripe-webhook.js'), 'utf8');
  for (const bad of ['credits_25:{credits:2500}', 'credits_50:{credits:5000}', 'credits_100:{credits:10000}']) {
    assert.ok(!webhook.includes(bad), `stripe-webhook fallback grant drifted: ${bad}`);
  }

  const meter = fs.readFileSync(path.join(BACKEND, 'credit-meter.js'), 'utf8');
  assert.ok(!meter.includes('website_build: { credits: 100 }'),
    'credit-meter fallback website_build drifted from credit-costs.json (200)');
  assert.ok(meter.includes('image_generate_fal: { credits: 25 }'),
    'credit-meter fallback must mirror image_generate_fal');
});
