'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const stages = require('./stages');
const { createEngagementStore } = require('./engagement-store');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eng-')), 'engagements.json');

test('anonymous caller resolves to guest with no features', () => {
  const s = stages.resolveStage({ signedIn: false });
  assert.equal(s.stage, 'guest');
  assert.deepEqual(s.features, []);
});

test('signed-in, no paid tier, no engagement -> free', () => {
  const s = stages.resolveStage({ signedIn: true, entitlement: { tier: 'free', active: true }, engagements: [] });
  assert.equal(s.stage, 'free');
  assert.ok(s.features.includes('onboarding'));
  assert.ok(!s.features.includes('agent_builder'));
  assert.equal(s.limits.agents, 1);
});

test('active paid tier -> user with builder features', () => {
  for (const tier of ['pro', 'elite']) {
    const s = stages.resolveStage({ signedIn: true, entitlement: { tier, active: true }, engagements: [] });
    assert.equal(s.stage, 'user');
    assert.ok(s.features.includes('agent_builder'));
    assert.ok(s.features.includes('agent_office'));
  }
});

test('lapsed paid tier falls back to free', () => {
  const s = stages.resolveStage({ signedIn: true, entitlement: { tier: 'pro', active: false }, engagements: [] });
  assert.equal(s.stage, 'free');
});

test('active engagement -> client, even on free tier, without builder features', () => {
  const s = stages.resolveStage({
    signedIn: true, entitlement: { tier: 'free', active: true },
    engagements: [{ id: 'e1', status: 'active', phase: 'build' }],
  });
  assert.equal(s.stage, 'client');
  assert.ok(s.features.includes('client_portal'));
  assert.ok(!s.features.includes('agent_builder'));
  assert.equal(s.engagementId, 'e1');
});

test('client who is also Pro keeps builder features', () => {
  const s = stages.resolveStage({
    signedIn: true, entitlement: { tier: 'pro', active: true },
    engagements: [{ id: 'e1', status: 'active' }],
  });
  assert.equal(s.stage, 'client');
  assert.ok(s.features.includes('client_portal') && s.features.includes('agent_builder'));
});

test('ended or paused engagement does not make a client', () => {
  for (const status of ['ended', 'paused']) {
    const s = stages.resolveStage({ signedIn: true, entitlement: { tier: 'free', active: true }, engagements: [{ id: 'e', status }] });
    assert.equal(s.stage, 'free');
  }
});

test('can() and unlockHint() describe how to get access', () => {
  const s = stages.resolveStage({ signedIn: true, entitlement: { tier: 'free', active: true }, engagements: [] });
  assert.equal(stages.can(s, 'agent_builder'), false);
  assert.equal(stages.can(s, 'onboarding'), true);
  assert.match(stages.unlockHint('agent_builder').how, /Pro|Max/);
  assert.match(stages.unlockHint('client_portal').how, /consultant/i);
});

test('engagement store: create, scope by client, status change, persistence', () => {
  const file = tmp();
  const st = createEngagementStore(file);
  const a = st.create({ clientUserId: 'alice', consultantUserId: 'c1', title: 'AI audit' });
  const b = st.create({ clientUserId: 'bob', consultantUserId: 'c1', title: 'Other' });
  assert.equal(a.status, 'active');
  assert.equal(a.phase, 'assessment');
  assert.deepEqual(st.forClient('alice').map(e => e.id), [a.id]);
  assert.deepEqual(st.forClient('bob').map(e => e.id), [b.id]);
  assert.deepEqual(st.forClient('mallory'), []);
  st.update(a.id, { status: 'ended' });
  assert.equal(createEngagementStore(file).get(a.id).status, 'ended');
  assert.throws(() => st.create({ clientUserId: '', title: 'x' }), /clientUserId/);
  assert.throws(() => st.update(a.id, { status: 'bogus' }), /status/);
  assert.throws(() => st.update(a.id, { phase: 'bogus' }), /phase/);
});
