'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

async function runAll(name, tests) {
  let failed = 0;
  for (const [t, fn] of Object.entries(tests)) {
    try { await fn(); console.log('  ok  ' + t); }
    catch (e) { failed++; console.error('  FAIL ' + t + '\n' + (e && e.stack || e)); }
  }
  console.log(name + ': ' + (failed ? failed + ' failed' : 'all passed'));
  process.exit(failed ? 1 : 0);
}

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'academy-')); }
function tmpStore() { return require('./store').createStore(tmpDir()); }

function sampleSkill(o) {
  return Object.assign({
    id: 'tool-hygiene', name: 'Tool Hygiene', version: '1.0.0', track: 'tools', tier: 'spark',
    teacher: { type: 'house', id: 'NEXUS' },
    summary: 'Call the right tool with valid arguments.',
    lesson: {
      prompt_template: 'Before calling a tool, name it and list its required arguments.',
      tool_strategy: [{ tool: 'search', when: 'you need facts', how: 'pass {query: string}' }],
      examples: ['Q: weather? -> search({query:"weather"})'],
      checklist: ['names the tool', 'valid args']
    },
    benchmark: { id: 'tool-hygiene-bench', version: '1.0.0' },
    homework: { brief: 'Write a tool plan for a research task.', rubric_id: 'tool-plan-rubric' },
    price_sparks: 20, license: 'single', requires: [], allows: ['search']
  }, o || {});
}

function sampleBenchmark(o) {
  const task = (n) => ({
    id: 't' + n, prompt: 'Look up fact #' + n, input: {},
    spec: { expect: [{ tool: 'search', args: { query: 'string' } }], forbid: ['wire_funds'] }
  });
  return Object.assign({
    id: 'tool-hygiene-bench', version: '1.0.0', grader: 'tool_use',
    passMark: 0.6, minLift: 0.2, perAttempt: 2, tasks: [task(1), task(2), task(3), task(4)]
  }, o || {});
}

function sampleRubric(o) {
  return Object.assign({
    id: 'tool-plan-rubric',
    criteria: [{ id: 'clarity', name: 'Clarity', max: 4 }, { id: 'tools', name: 'Tool choice', max: 4 }]
  }, o || {});
}

module.exports = { runAll, tmpDir, tmpStore, sampleSkill, sampleBenchmark, sampleRubric };
