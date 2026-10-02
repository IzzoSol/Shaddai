'use strict';
const assert = require('assert');
const { runAll, tmpStore, sampleRubric } = require('./testkit');
const { createBenchmarks } = require('./benchmarks');
const { createHomework } = require('./homework');

// Judge scores by the artifact text so both passes agree: "v1"->1, "v2"->2, "v3"->4.
const SCORE = { v1: 1, v2: 2, v3: 4 };
const judge = async (rubric, sub) => {
  const s = SCORE[sub.artifact.text] || 0;
  return { scores: { clarity: s, tools: s }, critique: { what_went_wrong: ['vague prompt'], focus_next: 'composition', prompt_fixes: [{ before: 'a dog', after: 'a corgi, golden hour, 35mm' }], tool_use_fixes: ['pick the image tool first'], next_exercise: 'redo with a style reference' } };
};

function setup(opts) {
  const store = tmpStore(); const benchmarks = createBenchmarks(store);
  assert.ok(benchmarks.registerRubric(sampleRubric()).ok);
  return createHomework(Object.assign({ store, benchmarks, judge }, opts || {}));
}
const sub = (text, o) => Object.assign({ agentId: 'a1', skillId: 'tool-hygiene', rubricId: 'tool-plan-rubric', artifact: { kind: 'text', text }, provenance: { prompt: 'make a plan', tools: [{ tool: 'search', args: { query: 'x' } }] } }, o || {});

runAll('homework', {
  async 'rounds return a structured critique and measured improvement'() {
    const hw = setup();
    const r1 = await hw.submit(sub('v1'));
    assert.ok(r1.ok, r1.error);
    assert.strictEqual(r1.round, 1);
    assert.strictEqual(r1.critique.focus_next, 'composition');
    assert.deepStrictEqual(r1.critique.prompt_fixes[0], { before: 'a dog', after: 'a corgi, golden hour, 35mm' });
    assert.strictEqual(r1.summary.improved, false);
    await hw.submit(sub('v2'));
    const r3 = await hw.submit(sub('v3'));
    assert.strictEqual(r3.round, 3);
    assert.ok(Math.abs(r3.summary.firstScore - 0.25) < 1e-9);
    assert.ok(Math.abs(r3.summary.bestScore - 1) < 1e-9);
    assert.ok(Math.abs(r3.summary.improvement - 0.75) < 1e-9);
    assert.strictEqual(r3.summary.improved, true);
  },
  async 'max rounds enforced'() {
    const hw = setup({ maxRounds: 2 });
    await hw.submit(sub('v1')); await hw.submit(sub('v2'));
    const r = await hw.submit(sub('v3'));
    assert.ok(!r.ok && /round/.test(r.error));
  },
  async 'rejects secrets, non-https urls, missing provenance'() {
    const hw = setup();
    assert.ok(!(await hw.submit(sub('my key is sk-abcdefghijklmnop'))).ok);
    assert.ok(!(await hw.submit(sub('v1', { artifact: { kind: 'image', url: 'http://evil.example/x.png' } }))).ok);
    assert.ok(!(await hw.submit(sub('v1', { provenance: null }))).ok);
    assert.ok(!(await hw.submit(sub('v1', { rubricId: 'nope-rubric' }))).ok);
  },
  async 'stores stripped text, not raw markup'() {
    const hw = setup();
    await hw.submit(sub('<script>alert(1)</script>v1'));
    const stored = JSON.stringify(hw._dump());
    assert.ok(!stored.includes('<script>'));
  },
  async 'needs_review results are not stored or counted'() {
    let n = 0;
    const hw = setup({ judge: async () => ({ scores: n++ % 2 ? { clarity: 0, tools: 0 } : { clarity: 4, tools: 4 } }) });
    const r = await hw.submit(sub('v1'));
    assert.strictEqual(r.ok, false); assert.strictEqual(r.status, 'needs_review');
    assert.strictEqual(hw.summary('a1', 'tool-hygiene').rounds, 0);
  },
  'summary of nothing is zeroed'() {
    const s = setup().summary('x', 'tool-hygiene');
    assert.deepStrictEqual(s, { rounds: 0, firstScore: null, bestScore: null, improvement: 0, improved: false });
  }
});
