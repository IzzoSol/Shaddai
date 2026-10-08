'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const express = require('express');
const ob = require('./lib/onboarding');
const { createRouter } = require('./onboarding-routes');
const { createOnboardingStore } = require('./lib/onboarding-store');

test('readiness: bounds, bands, kind wording, adoption note always present', () => {
  assert.equal(ob.evaluateReadiness([2, 2, 2, 2, 2]).band, 'ready');
  assert.equal(ob.evaluateReadiness([1, 1, 1, 1, 1]).band, 'pilot');
  const low = ob.evaluateReadiness([0, 0, 0, 0, 0]);
  assert.equal(low.band, 'foundations');
  assert.equal(low.score, 0);
  assert.match(low.note, /Most AI pilots stall on habits/);
  assert.doesNotMatch(low.note, /\bLow readiness\b/);
  assert.throws(() => ob.evaluateReadiness([1, 1, 1, 1]), /5/);
  assert.throws(() => ob.evaluateReadiness([1, 1, 1, 1, 3]), /0, 1 or 2/);
  assert.throws(() => ob.evaluateReadiness([1, 1, 1, 1, 1.5]));
});

test('recommend: every vertical x goal returns agents and two prompts; foundations puts guides first', () => {
  for (const v of Object.keys(ob.VERTICALS)) for (const g of Object.keys(ob.GOALS)) {
    const r = ob.recommend(v, g);
    assert.ok(r.agents.length >= 1, v + '/' + g);
    assert.equal(r.starterPrompts.length, 2);
  }
  const r = ob.recommend('agency', 'build', { band: 'foundations' });
  assert.ok(['ORACLE', 'QUILL'].includes(r.agents[0].agent));
  assert.throws(() => ob.recommend('nope', 'build'));
});

test('agent fields: required ones enforced, lengths and trigger enum checked', () => {
  assert.equal(ob.validateAgentFields({}).ok, false);
  const ok = ob.validateAgentFields({ vision: 'Win back lapsed clients', instructions: 'Draft a friendly email', audit: 'I approve every send', trigger: 'manual' });
  assert.equal(ok.ok, true);
  assert.equal(ob.validateAgentFields({ vision: 'x', instructions: 'y', audit: 'z', trigger: 'cron' }).errors.trigger.startsWith('one of'), true);
  assert.equal(ob.validateAgentFields({ vision: 'x'.repeat(601), instructions: 'y', audit: 'z' }).errors.vision, 'max 600 characters');
});

function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onb-'));
  const app = express();
  app.use((req, _r, next) => { const u = req.headers['x-user-id']; req.userId = u || 'local'; req.isAuthenticated = !!u; next(); });
  app.use('/api/onboarding', createRouter({ store: createOnboardingStore(dir) }));
  return new Promise((r) => { const s = app.listen(0, () => r({ s, dir, base: 'http://127.0.0.1:' + s.address().port })); });
}
const call = (base, p, user, method, body) => fetch(base + p, {
  method: method || 'GET',
  headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test('wizard flow over HTTP: ordering, validation, computed steps, isolation, no credentials stored', async () => {
  const { s, base, dir } = await boot();
  try {
    assert.equal((await call(base, '/api/onboarding/options')).body.verticals.coach.label, 'Coach');
    assert.equal((await call(base, '/api/onboarding/me')).status, 401);
    assert.equal((await call(base, '/api/onboarding/me', 'ann')).body.step, 0);

    // ordering: cannot skip ahead
    const early = await call(base, '/api/onboarding/step/3', 'ann', 'PUT', { answers: [1, 1, 1, 1, 1] });
    assert.equal(early.status, 409); assert.equal(early.body.needStep, 1);
    // bad input
    assert.equal((await call(base, '/api/onboarding/step/1', 'ann', 'PUT', { vertical: 'plumber', role: 'x' })).status, 400);
    assert.equal((await call(base, '/api/onboarding/step/4', 'ann', 'PUT', {})).status, 400);

    assert.equal((await call(base, '/api/onboarding/step/1', 'ann', 'PUT', { role: 'Owner', vertical: 'insurance' })).status, 200);
    assert.equal((await call(base, '/api/onboarding/step/2', 'ann', 'PUT', { goal: 'automate' })).status, 200);
    const r3 = await call(base, '/api/onboarding/step/3', 'ann', 'PUT', { answers: [2, 1, 0, 1, 2] });
    assert.equal(r3.body.state.readiness.score, 6);
    assert.equal(r3.body.state.readiness.band, 'pilot');
    assert.ok(r3.body.recommendations.agents.length >= 1);                    // step 4 is computed
    assert.equal((await call(base, '/api/onboarding/step/5', 'ann', 'PUT', { vision: 'Faster renewals', instructions: 'Draft renewal reminders', audit: 'I approve each' })).status, 200);
    // bridge: a token in the payload is dropped, never stored
    await call(base, '/api/onboarding/step/6', 'ann', 'PUT', { linkedAgents: ['my-claude'], mcpToken: 'sk-SECRET-123', apiKey: 'sk-SECRET-456' });
    assert.equal((await call(base, '/api/onboarding/complete', 'ann', 'POST')).status, 409);  // first run missing
    await call(base, '/api/onboarding/step/7', 'ann', 'PUT', { taskId: 't1', summary: 'Drafted 12 renewal reminders' });
    const done = await call(base, '/api/onboarding/complete', 'ann', 'POST');
    assert.equal(done.body.completed, true);
    assert.equal(done.body.next.id, 'upgrade');                                // step 8 is computed

    // nothing secret on disk; filenames do not contain the user id
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.ok(!files[0].includes('ann'));
    assert.doesNotMatch(fs.readFileSync(path.join(dir, files[0]), 'utf8'), /SECRET/);

    // another user sees none of it; a spoofed id in query/body changes nothing
    const bob = await call(base, '/api/onboarding/me?userId=ann', 'bob');
    assert.equal(bob.body.step, 0); assert.equal(bob.body.completed, false);
    assert.equal(bob.body.recommendations, undefined);

    // reset
    assert.equal((await call(base, '/api/onboarding/reset', 'ann', 'POST')).body.step, 0);
    // editing an early step un-completes
    await call(base, '/api/onboarding/step/1', 'ann', 'PUT', { role: 'Coach', vertical: 'coach' });
    assert.equal((await call(base, '/api/onboarding/me', 'ann')).body.completed, false);
  } finally { s.close(); }
});
