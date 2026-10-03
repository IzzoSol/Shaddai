'use strict';
const assert = require('assert');
const { runAll, tmpStore, sampleBenchmark, sampleRubric } = require('./testkit');
const { GRADERS } = require('./graders');
const { createBenchmarks } = require('./benchmarks');

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
const TAPE = { tape: [100, 110, 120], rules: { startCash: 1000, maxPositionPct: 100, maxDrawdownPct: 20 } };

runAll('graders+benchmarks', {
  'checklist scores weighted substring hits'() {
    const spec = { items: [{ id: 'a', any: ['stop loss'], weight: 2 }, { id: 'b', any: ['size', 'position'] }] };
    close(GRADERS.checklist({}, spec, 'I set a STOP LOSS').score, 2 / 3);
    close(GRADERS.checklist({}, spec, 'nothing').score, 0);
    close(GRADERS.checklist({}, spec, null).score, 0);
  },
  'checklist maxChars halves over-long answers and penalize subtracts bad claims'() {
    const spec = { maxChars: 40, penalize: [{ any: ['guaranteed'], weight: 0.25 }], items: [{ id: 'a', any: ['audit'] }, { id: 'b', any: ['title'] }] };
    close(GRADERS.checklist({}, spec, 'audit the title').score, 1);
    close(GRADERS.checklist({}, spec, 'audit the title: guaranteed').score, 0.75);
    close(GRADERS.checklist({}, spec, 'audit the title ' + 'padding '.repeat(20)).score, 0.5);       // keyword stuffing with filler
    close(GRADERS.checklist({}, { items: spec.items }, 'audit the title ' + 'padding '.repeat(20)).score, 1);   // options are optional
    close(GRADERS.checklist({}, { penalize: [{ any: ['x'], weight: 5 }], items: spec.items }, 'audit title x').score, 0);   // never below zero
  },
  'checklist minSentences halves keyword salad that has no sentences'() {
    const spec = { minSentences: 2, items: [{ id: 'a', any: ['audit'] }, { id: 'b', any: ['title'] }] };
    close(GRADERS.checklist({}, spec, 'audit title').score, 0.5);                                    // salad: one fragment
    close(GRADERS.checklist({}, spec, 'We audit the page. We fix the title.').score, 1);
    close(GRADERS.checklist({}, spec, 'Audit it\nFix the title').score, 1);                         // newlines separate sentences
  },
  'tool_use rewards correct calls and zeroes forbidden ones'() {
    const spec = { expect: [{ tool: 'search', args: { query: 'string' } }], forbid: ['wire_funds'] };
    close(GRADERS.tool_use({}, spec, [{ tool: 'search', args: { query: 'x' } }]).score, 1);
    close(GRADERS.tool_use({}, spec, [{ tool: 'search', args: { query: 5 } }]).score, 0);
    close(GRADERS.tool_use({}, spec, [{ tool: 'search', args: { query: 'x' } }, { tool: 'wire_funds', args: {} }]).score, 0);
    close(GRADERS.tool_use({}, spec, 'garbage').score, 0);
    close(GRADERS.tool_use({}, spec, [null, 5, {}]).score, 0);
  },
  'paper_trade scores return, penalizes violations'() {
    close(GRADERS.paper_trade(TAPE, {}, [{ i: 0, side: 'buy', qty: 2 }]).score, 0.4);        // 800 + 2*120 = 1040
    close(GRADERS.paper_trade(TAPE, {}, [{ i: 0, side: 'buy', qty: 5 }]).score, 1);           // 1100 -> 10%
    const over = GRADERS.paper_trade(TAPE, {}, [{ i: 0, side: 'buy', qty: 20 }]);              // can't afford
    close(over.score, 0); assert.strictEqual(over.detail.violations, 1);
    const half = GRADERS.paper_trade(TAPE, {}, [{ i: 0, side: 'buy', qty: 5 }, { i: 1, side: 'sell', qty: 99 }]);
    close(half.score, 0.5);                                                                    // oversell violation halves it
    close(GRADERS.paper_trade(TAPE, {}, 'garbage').score, 0);
    close(GRADERS.paper_trade(TAPE, {}, [{ i: 99, side: 'buy', qty: 1 }]).score, 0);
  },
  'paper_trade drawdown breach halves the score'() {
    const input = { tape: [100, 60, 200], rules: { startCash: 1000, maxPositionPct: 100, maxDrawdownPct: 20 } };
    const r = GRADERS.paper_trade(input, {}, [{ i: 0, side: 'buy', qty: 10 }]);                // equity 1000 -> 600 -> 2000
    assert.strictEqual(r.detail.ddBreach, true);
    close(r.score, 0.5);
  },
  'benchmark register validates and is immutable'() {
    const b = createBenchmarks(tmpStore());
    assert.ok(b.register(sampleBenchmark()).ok);
    assert.ok(!b.register(sampleBenchmark()).ok);                                     // same id@version
    assert.ok(!b.register(sampleBenchmark({ version: '1.0.1', grader: 'nope' })).ok);
    assert.ok(!b.register(sampleBenchmark({ version: '1.0.2', perAttempt: 9 })).ok);  // fewer tasks than perAttempt
    assert.ok(!b.register(sampleBenchmark({ version: '1.0.3', passMark: 2 })).ok);
    assert.ok(!b.register(sampleBenchmark({ version: '1.0.4', grader: 'rubric' })).ok); // rubric needs criteria
    assert.strictEqual(b.get('tool-hygiene-bench', '1.0.0').grader, 'tool_use');
    assert.strictEqual(b.get('tool-hygiene-bench', '9.9.9'), null);
  },
  'publicTask hides the answer spec'() {
    const b = createBenchmarks(tmpStore());
    const pt = b.publicTask(sampleBenchmark().tasks[0]);
    assert.deepStrictEqual(Object.keys(pt).sort(), ['id', 'input', 'prompt']);
  },
  'rubrics register and fetch'() {
    const b = createBenchmarks(tmpStore());
    assert.ok(b.registerRubric(sampleRubric()).ok);
    assert.strictEqual(b.rubric('tool-plan-rubric').criteria.length, 2);
    assert.ok(!b.registerRubric({ id: 'x', criteria: [] }).ok);
  }
});
