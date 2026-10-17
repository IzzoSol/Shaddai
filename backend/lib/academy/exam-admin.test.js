'use strict';
const assert = require('assert');
const { runAll, tmpStore, sampleSkill, sampleBenchmark, sampleRubric } = require('./testkit');
const { createRegistry } = require('./registry');
const { createBenchmarks } = require('./benchmarks');
const { createExamService } = require('./exam');

function setup() {
  const store = tmpStore(); const registry = createRegistry(store); const benchmarks = createBenchmarks(store);
  assert.ok(benchmarks.register(sampleBenchmark({ grader: 'rubric', rubric: sampleRubric(), perAttempt: 1 })).ok);
  assert.ok(registry.publish(sampleSkill()).ok);
  let i = 0;
  const judge = async () => ({ scores: i++ % 2 ? { clarity: 0, tools: 0 } : { clarity: 4, tools: 4 } });   // judges never agree
  let t = 1700000000000;
  const svc = createExamService({ store, registry, benchmarks, judge, now: () => t });
  return { svc, tick: (ms) => { t += ms; } };
}
const run = async (svc, agentId, kind, out) => {
  const b = svc.begin({ agentId, skillId: 'tool-hygiene', kind, withSkill: kind === 'exam' }); assert.ok(b.ok, b.error);
  const r = await svc.submit({ attemptId: b.attemptId, outputs: { [b.tasks[0].id]: out } });
  assert.strictEqual(r.status, 'needs_review');
  return { b, r };
};

runAll('exam-admin', {
  async 'an abandoned attempt frees its enrollment slot and the cooldown, but only while open'() {
    const store = tmpStore(); const registry = createRegistry(store); const benchmarks = createBenchmarks(store);
    assert.ok(benchmarks.register(sampleBenchmark()).ok);
    assert.ok(registry.publish(sampleSkill()).ok);
    let t = 1700000000000;
    const svc = createExamService({ store, registry, benchmarks, judge: async () => ({ scores: {} }), now: () => t });
    const first = svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false, enrollmentId: 'enr_1' });
    assert.ok(first.ok);
    assert.ok(!svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false, enrollmentId: 'enr_1' }).ok);   // slot used
    assert.deepStrictEqual(svc.enrollmentKinds('enr_1'), ['baseline']);
    assert.ok(svc.abandon({ attemptId: first.attemptId }).ok);
    assert.deepStrictEqual(svc.enrollmentKinds('enr_1'), []);
    const again = svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false, enrollmentId: 'enr_1' });
    assert.ok(again.ok, again.error);                                                       // no cooldown, no second payment
    assert.strictEqual((await svc.submit({ attemptId: again.attemptId, outputs: {} })).status, 'graded');
    assert.ok(!svc.abandon({ attemptId: again.attemptId }).ok);                             // graded attempts cannot be abandoned
    assert.ok(!svc.abandon({ attemptId: 'att_nope' }).ok);
    const done = svc.get(first.attemptId);
    assert.strictEqual(done.status, 'abandoned');
    assert.ok(!(await svc.submit({ attemptId: first.attemptId, outputs: {} })).ok);         // an abandoned attempt cannot be submitted
  },
  async 'get returns a safe summary without outputs or answer data'() {
    const { svc } = setup();
    const { b } = await run(svc, 'a1', 'baseline', 'my plan');
    const g = svc.get(b.attemptId);
    assert.deepStrictEqual(Object.keys(g).sort(), ['agentId', 'expiresAt', 'id', 'kind', 'skillId', 'status', 'taskIds']);
    assert.strictEqual(g.status, 'needs_review');
    assert.strictEqual(svc.get('att_nope'), null);
    assert.strictEqual(svc.get('__proto__'), null);
  },
  async 'needsReview lists the task prompt and the sanitized output'() {
    const { svc } = setup();
    await run(svc, 'a1', 'baseline', '<b>my plan</b>');
    const q = svc.needsReview();
    assert.strictEqual(q.length, 1);
    assert.strictEqual(q[0].agentId, 'a1');
    assert.ok(/Look up fact/.test(q[0].tasks[0].prompt));
    assert.strictEqual(q[0].tasks[0].output, 'my plan');
  },
  async 'resolve grades the attempt and unlocks evaluate'() {
    const { svc } = setup();
    const { b: base } = await run(svc, 'a1', 'baseline', 'weak');
    assert.ok(!svc.begin({ agentId: 'a1', skillId: 'tool-hygiene', kind: 'exam', withSkill: true }).ok);   // baseline still in review
    assert.ok(svc.resolve({ attemptId: base.attemptId, by: 'admin1', taskScores: { [base.tasks[0].id]: 0.1 } }).ok);
    const { b: ex } = await run(svc, 'a1', 'exam', 'strong');
    assert.ok(!svc.evaluate({ agentId: 'a1', skillId: 'tool-hygiene' }).ok);                               // exam still in review
    const r = svc.resolve({ attemptId: ex.attemptId, by: 'admin1', taskScores: { [ex.tasks[0].id]: 0.9 } });
    assert.ok(r.ok); assert.ok(Math.abs(r.score - 0.9) < 1e-9);
    const ev = svc.evaluate({ agentId: 'a1', skillId: 'tool-hygiene' });
    assert.ok(ev.ok && ev.passed);
    assert.ok(Math.abs(ev.lift - 0.8) < 1e-9);
    assert.strictEqual(svc.needsReview().length, 0);
  },
  async 'resolve rejects bad input and double resolution'() {
    const { svc } = setup();
    const { b } = await run(svc, 'a1', 'baseline', 'x');
    const tid = b.tasks[0].id;
    assert.ok(!svc.resolve({ attemptId: b.attemptId, by: 'admin1', taskScores: { nope: 0.5 } }).ok);   // unknown task
    assert.ok(!svc.resolve({ attemptId: b.attemptId, by: 'admin1', taskScores: { [tid]: 2 } }).ok);    // out of range
    assert.ok(!svc.resolve({ attemptId: b.attemptId, by: 'admin1', taskScores: {} }).ok);              // must score every review task
    assert.ok(!svc.resolve({ attemptId: 'att_nope', by: 'admin1', taskScores: { [tid]: 0.5 } }).ok);
    assert.ok(svc.resolve({ attemptId: b.attemptId, by: 'admin1', taskScores: { [tid]: 0.5 } }).ok);
    assert.ok(!svc.resolve({ attemptId: b.attemptId, by: 'admin1', taskScores: { [tid]: 0.6 } }).ok);   // already graded
  }
});
