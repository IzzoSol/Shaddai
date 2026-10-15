'use strict';
const assert = require('assert');
const { runAll, tmpStore, sampleSkill, sampleBenchmark, sampleRubric } = require('./testkit');
const { createRegistry } = require('./registry');
const { createBenchmarks } = require('./benchmarks');
const { createExamService } = require('./exam');

const GOOD = [{ tool: 'search', args: { query: 'x' } }];

function setup(opts, bench) {
  const store = tmpStore();
  const registry = createRegistry(store); const benchmarks = createBenchmarks(store);
  assert.ok(benchmarks.register(bench || sampleBenchmark()).ok);
  assert.ok(registry.publish(sampleSkill({ benchmark: { id: (bench || sampleBenchmark()).id, version: '1.0.0' } })).ok);
  const clock = { t: 1700000000000 };
  const svc = createExamService(Object.assign({ store, registry, benchmarks, judge: async () => ({ scores: {} }), now: () => clock.t }, opts || {}));
  return { svc, clock, store, registry, benchmarks };
}
const answerAll = (tasks, out) => Object.fromEntries(tasks.map((t) => [t.id, out]));

runAll('exam', {
  'baseline must be taken without the skill, exam with it'() {
    const { svc } = setup();
    assert.ok(!svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: true }).ok);
    assert.ok(!svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'exam', withSkill: false }).ok);
    assert.ok(!svc.begin({ agentId: 'a1', skillId: 'nope', kind: 'baseline', withSkill: false }).ok);
  },
  'exam requires a graded baseline first'() {
    const { svc } = setup();
    const r = svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'exam', withSkill: true });
    assert.strictEqual(r.ok, false);
    assert.ok(/baseline/.test(r.error));
  },
  'tasks never expose the answer spec'() {
    const { svc } = setup();
    const r = svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    assert.strictEqual(r.tasks.length, 2);
    for (const t of r.tasks) assert.deepStrictEqual(Object.keys(t).sort(), ['id', 'input', 'prompt']);
  },
  async 'full flow: baseline 0, exam 1, lift 1, passed'() {
    const { svc } = setup();
    const b = svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    const sb = await svc.submit({ attemptId: b.attemptId, outputs: answerAll(b.tasks, []) });
    assert.strictEqual(sb.score, 0);
    const e = svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'exam', withSkill: true });
    assert.ok(e.ok, e.error);
    const se = await svc.submit({ attemptId: e.attemptId, outputs: answerAll(e.tasks, GOOD) });
    assert.strictEqual(se.score, 1);
    const ev = svc.evaluate({ agentId: 'a1', skillId: 'tool-hygiene' });
    assert.ok(ev.ok && ev.passed);
    assert.strictEqual(ev.lift, 1);
    assert.strictEqual(ev.skillHash.length, 64);
    assert.strictEqual(ev.graderVersion, 'tool-hygiene-bench@1.0.0');
  },
  async 'high score without lift does not pass'() {
    const { svc } = setup();
    const b = svc.begin({ agentId: 'a2', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    await svc.submit({ attemptId: b.attemptId, outputs: answerAll(b.tasks, GOOD) });   // already good without the skill
    const e = svc.begin({ agentId: 'a2', skillId: 'tool-hygiene', kind: 'exam', withSkill: true });
    await svc.submit({ attemptId: e.attemptId, outputs: answerAll(e.tasks, GOOD) });
    const ev = svc.evaluate({ agentId: 'a2', skillId: 'tool-hygiene' });
    assert.strictEqual(ev.lift, 0);
    assert.strictEqual(ev.passed, false);
  },
  async 'garbage outputs score 0 and never throw'() {
    const { svc } = setup();
    const b = svc.begin({ agentId: 'a3', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    const r = await svc.submit({ attemptId: b.attemptId, outputs: { [b.tasks[0].id]: { a: 1 }, [b.tasks[1].id]: 'x'.repeat(100000) } });
    assert.strictEqual(r.score, 0);
    const b2 = svc.begin({ agentId: 'a4', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    assert.strictEqual((await svc.submit({ attemptId: b2.attemptId, outputs: null })).score, 0);
  },
  async 'submit is single-use and unknown attempts are rejected'() {
    const { svc } = setup();
    const b = svc.begin({ agentId: 'a5', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    assert.ok((await svc.submit({ attemptId: b.attemptId, outputs: {} })).ok);
    assert.ok(!(await svc.submit({ attemptId: b.attemptId, outputs: {} })).ok);
    assert.ok(!(await svc.submit({ attemptId: 'att_nope', outputs: {} })).ok);
  },
  async 'attempts expire'() {
    const { svc, clock } = setup({ windowMs: 1000 });
    const b = svc.begin({ agentId: 'a6', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    clock.t += 5000;
    const r = await svc.submit({ attemptId: b.attemptId, outputs: {} });
    assert.ok(!r.ok && /expired/.test(r.error));
  },
  async 'cooldown and daily cap'() {
    const { svc, clock } = setup({ cooldownMs: 60000, dailyCap: 2 });
    const b = svc.begin({ agentId: 'a7', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    await svc.submit({ attemptId: b.attemptId, outputs: {} });
    const again = svc.begin({ agentId: 'a7', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    assert.ok(!again.ok && /cooldown/.test(again.error));
    clock.t += 61000;
    const b2 = svc.begin({ agentId: 'a7', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    assert.ok(b2.ok);
    clock.t += 61000;
    const capped = svc.begin({ agentId: 'a7', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    assert.ok(!capped.ok && /daily/.test(capped.error));
  },
  async 'rubric benchmark: persistent judge disagreement is needs_review and blocks evaluate'() {
    const bench = sampleBenchmark({ id: 'tool-hygiene-bench', grader: 'rubric', rubric: sampleRubric(), perAttempt: 1 });
    let i = 0;
    const { svc } = setup({ judge: async () => ({ scores: i++ % 2 ? { clarity: 0, tools: 0 } : { clarity: 4, tools: 4 } }) }, bench);
    const b = svc.begin({ agentId: 'a8', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    const r = await svc.submit({ attemptId: b.attemptId, outputs: answerAll(b.tasks, 'my plan') });
    assert.strictEqual(r.status, 'needs_review');
    assert.ok(!svc.evaluate({ agentId: 'a8', skillId: 'tool-hygiene' }).ok);
  }
});
