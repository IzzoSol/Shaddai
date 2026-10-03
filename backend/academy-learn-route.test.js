'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const { runAll } = require('./lib/academy/testkit');
const { boot } = require('./lib/academy/http-testkit');

const as = (uid, body) => ({ uid, body });
const RESULT = { ok: true, passed: true, installed: true, baseline: 0.1, exam: 0.9, lift: 0.8, receipt: { receiptId: 'rc_1', hash: 'h', agentId: 'op1', secretish: 'x' }, enrollmentId: 'enr_1' };

runAll('learn-route', {
  async 'the owner can run learn for their own agent and gets a summary (not the raw receipt)'() {
    const seen = [];
    const w = await boot({ runner: { learn: async (a) => { seen.push(a); return RESULT; } } });
    const r = await w.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'tool-hygiene', ownerId: 'owner2', agentId: 'op2' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(seen, [{ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-hygiene' }]);        // identity from the session and URL only
    assert.strictEqual(r.json.passed, true); assert.strictEqual(r.json.installed, true); assert.strictEqual(r.json.lift, 0.8);
    assert.strictEqual(r.json.receiptId, 'rc_1');
    assert.ok(!('receipt' in r.json));
    w.close();
  },
  async 'auth, ownership and input are enforced before the runner is touched'() {
    let calls = 0;
    const w = await boot({ runner: { learn: async () => { calls++; return RESULT; } } });
    assert.strictEqual((await w.call('POST', '/agents/op1/learn', { body: { skillId: 'tool-hygiene' } })).status, 401);
    assert.strictEqual((await w.call('POST', '/agents/op2/learn', as('owner1', { skillId: 'tool-hygiene' }))).status, 403);
    assert.strictEqual((await w.call('POST', '/agents/__proto__/learn', as('owner1', { skillId: 'tool-hygiene' }))).status, 403);
    assert.strictEqual((await w.call('POST', '/agents/op1/learn', as('owner1', {}))).status, 400);
    assert.strictEqual((await w.call('POST', '/agents/op1/learn', as('owner1', { skillId: ['x'] }))).status, 400);
    assert.strictEqual((await w.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'x', api_key: 'y' }))).status, 400);
    assert.strictEqual(calls, 0);
    w.close();
  },
  async 'runner errors map to sensible statuses and a missing runner is a 503'() {
    const w = await boot({ runner: { learn: async () => ({ ok: false, stage: 'enroll', error: 'not enough Sparks', insufficient: true }) } });
    const r = await w.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'tool-hygiene' }));
    assert.strictEqual(r.status, 402); assert.strictEqual(r.json.stage, 'enroll');
    w.close();
    const bad = await boot({ runner: { learn: async () => ({ ok: false, stage: 'start', error: 'requires skills this agent does not have yet: x' }) } });
    assert.strictEqual((await bad.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'tool-hygiene' }))).status, 400);
    bad.close();
    const none = await boot();
    assert.strictEqual((await none.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'tool-hygiene' }))).status, 503);
    none.close();
  },
  async 'a double click cannot run the same agent and skill twice at once'() {
    let release; const gate = new Promise((r) => { release = r; }); let runs = 0;
    const w = await boot({ runner: { learn: async () => { runs++; await gate; return RESULT; } } });
    const first = w.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'tool-hygiene' }));
    await new Promise((r) => setTimeout(r, 60));
    const second = await w.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'tool-hygiene' }));
    assert.strictEqual(second.status, 409);
    release();
    assert.strictEqual((await first).status, 200);
    assert.strictEqual(runs, 1);
    const third = await w.call('POST', '/agents/op1/learn', as('owner1', { skillId: 'tool-hygiene' }));
    assert.strictEqual(third.status, 200);                                                     // free again after it finished
    w.close();
  }
});
