'use strict';
// Regression tests for the Plan 2 review (C1, I1-I6, M2, M4, M6, M8).
delete process.env.DATABASE_URL;
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runAll, sampleSkill, sampleBenchmark, sampleRubric } = require('./lib/academy/testkit');
const { boot } = require('./lib/academy/http-testkit');
const { hasSecret } = require('./lib/academy/secrets');
const { createHomework } = require('./lib/academy/homework');
const { tmpStore } = require('./lib/academy/testkit');
const { createBenchmarks } = require('./lib/academy/benchmarks');

const GOOD = [{ tool: 'search', args: { query: 'x' } }];
const answerAll = (tasks, out) => Object.fromEntries(tasks.map((t) => [t.id, out]));
const as = (uid, body) => ({ uid, body });

runAll('school-fixes', {
  async 'C1 the secret scan cannot be used to stall the server, and runs after auth'() {
    const t0 = Date.now();
    assert.strictEqual(hasSecret({ x: '-eyJ'.repeat(100000) }), false);
    assert.ok(Date.now() - t0 < 500, 'secret scan took ' + (Date.now() - t0) + 'ms');
    const w = await boot();
    const t1 = Date.now();
    const r = await w.call('POST', '/enroll', { body: { a: '-eyJ'.repeat(50000) } });            // anonymous, large
    assert.strictEqual(r.status, 401);
    assert.ok(Date.now() - t1 < 1000, 'anonymous request took ' + (Date.now() - t1) + 'ms');
    assert.strictEqual((await w.call('POST', '/enroll', { body: { api_key: 'x' } })).status, 401);   // auth before scanning
    assert.strictEqual((await w.call('POST', '/enroll', as('owner1', { api_key: 'x' }))).status, 400);
    w.close();
  },
  async 'I1 one payment buys one baseline and one exam; a retake needs a new enrollment'() {
    const w = await boot();
    const enr = (await w.call('POST', '/enroll', as('owner1', { agentId: 'op1', skillId: 'tool-hygiene' }))).json.enrollment;
    const begin = (kind) => w.call('POST', '/exams/begin', as('owner1', { agentId: 'op1', skillId: 'tool-hygiene', kind }));
    const b = (await begin('baseline')).json;
    await w.call('POST', '/exams/submit', as('owner1', { attemptId: b.attemptId, outputs: answerAll(b.tasks, []) }));
    const e = (await begin('exam')).json;
    assert.ok(e.attemptId);
    await w.call('POST', '/exams/submit', as('owner1', { attemptId: e.attemptId, outputs: answerAll(e.tasks, []) }));   // fail
    w.tick(11 * 60000);
    const again = await begin('exam');
    assert.strictEqual(again.status, 402, JSON.stringify(again.json));                                  // paid window is used up
    const second = (await w.call('POST', '/enroll', as('owner1', { agentId: 'op1', skillId: 'tool-hygiene' }))).json.enrollment;
    assert.notStrictEqual(second.id, enr.id);
    assert.strictEqual((await begin('exam')).status, 200);
    w.close();
  },
  async 'I2 repeat enroll calls reuse the open enrollment; bots have a daily spend cap'() {
    const w = await boot();
    for (let i = 0; i < 5; i++) await w.call('POST', '/xagent/enroll', { agent: 'bot-1', body: { skillId: 'tool-hygiene' } });
    for (let i = 0; i < 3; i++) await w.call('POST', '/enroll', as('owner1', { agentId: 'op1', skillId: 'tool-hygiene' }));
    assert.strictEqual(await w.economy.getBalance('owner1'), 180);                                        // charged once
    await w.economy.grant('owner1', 1000, 'test.topup', 'topup');
    for (const id of ['cap-a', 'cap-b', 'cap-c']) assert.ok(w.academy.registry.publish(sampleSkill({ id, price_sparks: 100 })).ok);
    const e = (id) => w.call('POST', '/xagent/enroll', { agent: 'bot-1', body: { skillId: id } });
    const a = await e('cap-a'); const b = await e('cap-b'); const c = await e('cap-c');
    assert.strictEqual(a.status, 200); assert.strictEqual(b.status, 200);
    assert.strictEqual(c.status, 429, JSON.stringify(c.json));                                            // 20 + 100 + 100 + 100 > 300
    w.close();
  },
  async 'I3 homework attempts that never grade are still limited'() {
    let calls = 0;
    const store = tmpStore(); const benchmarks = createBenchmarks(store);
    assert.ok(benchmarks.registerRubric(sampleRubric()).ok);
    const hw = createHomework({ store, benchmarks, judge: async () => { calls++; return { scores: calls % 2 ? { clarity: 4, tools: 4 } : { clarity: 0, tools: 0 } }; } });
    const sub = () => hw.submit({ agentId: 'a1', skillId: 'tool-hygiene', rubricId: 'tool-plan-rubric', artifact: { kind: 'text', text: 'x' }, provenance: { prompt: 'p' } });
    const results = [];
    for (let i = 0; i < 9; i++) results.push(await sub());
    assert.ok(results.slice(0, 6).every((r) => r.status === 'needs_review'));
    assert.ok(!results[6].ok && /limit/.test(results[6].error));
    assert.ok(calls <= 24, 'judge was called ' + calls + ' times');
  },
  async 'I4 provenance tool args are size-capped before reaching the judge'() {
    let prompt = 0;
    const store = tmpStore(); const benchmarks = createBenchmarks(store);
    benchmarks.registerRubric(sampleRubric());
    const hw = createHomework({ store, benchmarks, judge: async (rubric, sub) => { prompt = JSON.stringify(sub).length; return { scores: { clarity: 2, tools: 2 } }; } });
    const r = await hw.submit({ agentId: 'a1', skillId: 'tool-hygiene', rubricId: 'tool-plan-rubric', artifact: { kind: 'text', text: 'x' },
      provenance: { prompt: 'p', tools: [{ tool: 'image', args: { blob: 'y'.repeat(200000) } }] } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(prompt < 20000, 'judge saw ' + prompt + ' chars');
    assert.ok(JSON.stringify(hw._dump()).length < 40000);
  },
  async 'I5 class creation cannot claim another identity or store markup'() {
    const w = await boot();
    await w.call('POST', '/admin/roles', as('owner1', { target: 'owner2', role: 'teacher', action: 'grant' }));
    const spec = (o) => Object.assign({ name: 'C', track: 'tools', tier: 'spark', syllabus: ['tool-hygiene'], teacher: { type: 'owner', id: 'owner2' }, room: 'tool-foundry', capacity: 3, kind: 'open' }, o || {});
    assert.strictEqual((await w.call('POST', '/classes', as('owner2', spec({ teacher: { type: 'House', id: 'SHADDAI' } })))).status, 403);
    assert.strictEqual((await w.call('POST', '/classes', as('owner2', spec({ teacher: { type: 'faculty', id: 'SHADDAI' } })))).status, 403);
    assert.strictEqual((await w.call('POST', '/classes', as('owner2', spec({ teacher: { type: 'owner', id: 'owner1' } })))).status, 403);   // someone else
    assert.strictEqual((await w.call('POST', '/classes', as('owner2', spec({ room: '<script>x</script>' })))).status, 400);
    assert.strictEqual((await w.call('POST', '/classes', as('owner2', spec({ track: 'nonsense' })))).status, 400);
    assert.strictEqual((await w.call('POST', '/classes', as('owner2', spec()))).status, 200);                                               // as themselves
    assert.strictEqual((await w.call('POST', '/classes', as('owner1', spec({ teacher: { type: 'house', id: 'NEXUS' } })))).status, 200);   // admin may
    w.close();
  },
  async 'I6 legitimate seeds and labeled hashes are accepted; real key shapes are not'() {
    assert.strictEqual(hasSecret({ tools: [{ tool: 'image', args: { seed: 42 } }] }), false);
    assert.strictEqual(hasSecret({ seedPhrase: 'x' }), true);
    assert.strictEqual(hasSecret({ seed_phrase: 'x' }), true);
    assert.strictEqual(hasSecret({ mnemonic: 'x' }), true);
    const hex = 'a'.repeat(64); const b58 = '5'.repeat(88);
    assert.strictEqual(hasSecret('sha256: ' + hex), false);
    assert.strictEqual(hasSecret('the tx hash is ' + hex), false);
    assert.strictEqual(hasSecret('signature ' + b58), false);
    assert.strictEqual(hasSecret('my key ' + hex), true);
    assert.strictEqual(hasSecret(b58), true);
    assert.strictEqual(hasSecret('sk-proj-abcdefghijklmnopqrstuv'), true);
  },
  async 'M2/M6 empty review items cannot be resolved to NaN; a missing benchmark never breaks the queue'() {
    const w = await boot();
    w.academy.store.write('attempts', { nextSeq: 2, attempts: { att_x: { id: 'att_x', agentId: 'op1', skillId: 'tool-hygiene', benchmark: 'gone@9.9.9', kind: 'baseline', seq: 1, status: 'needs_review', perTask: [], taskIds: [], startedAt: 1, expiresAt: 2 } } });
    assert.doesNotThrow(() => w.academy.exams.needsReview());
    const r = w.academy.exams.resolve({ attemptId: 'att_x', by: 'owner1', taskScores: {} });
    assert.strictEqual(r.ok, false);
    assert.strictEqual((await w.call('GET', '/admin/review', { uid: 'owner1' })).status, 200);
    w.close();
  },
  'M4 the server mount lets shdx_ bearers skip the user-session middleware'() {
    const src = fs.readFileSync(path.join(__dirname, 'server-production.js'), 'utf8');
    const i = src.indexOf("app.use('/api/school'");
    assert.ok(i > 0);
    const block = src.slice(i, i + 700);
    const around = src.slice(i - 1200, i + 700);
    assert.ok(/_schoolAuth\s*=[^;]*(shdx_[^;]*headers\.authorization|headers\.authorization[^;]*shdx_)[^;]*next\(\)/.test(around), 'bot bearers must bypass softAuth in code, not just in a comment');
    assert.ok(/app\.use\('\/api\/school',\s*_schoolAuth/.test(block));
  },
  async 'M8 the manifest base URL comes from configuration when set'() {
    process.env.PUBLIC_BASE_URL = 'https://shaddai.example';
    const w = await boot();
    const r = await w.call('GET', '/xagent/tools');
    delete process.env.PUBLIC_BASE_URL;
    assert.ok(/^https:\/\/shaddai\.example/.test(r.json.baseUrl), r.json.baseUrl);
    w.close();
  }
});
