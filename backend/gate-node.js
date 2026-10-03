#!/usr/bin/env node
/**
 * gate-node.js — runs the repo's "self-running" node test scripts (the ones that
 * use require('assert') + console.log + process.exit, which are NOT jest suites).
 *
 * Each script is executed with `node <file>`; a non-zero exit = failure.
 * Prints a summary and exits non-zero if any script failed, so it can gate CI.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Explicit list of self-running node test scripts (assert + process.exit style).
const SCRIPTS = [
  'platform/prng.test.js',
  'platform/roster.test.js',
  'platform/affinity.test.js',
  'platform/telemetry.test.js',
  'platform/sim-driver.test.js',
  'platform/stat-ontology.test.js',
  'platform/state-hash.test.js',
  'sports/football/ruleset.test.js',
  'sports/football/football-stats.test.js',
  'sports/football/lab.test.js',
  'sports/football/abilities.test.js',
  'sports/football/playbook.test.js',
  'sports/football/roles.test.js',
  'forge/forge-core.test.js',
  'lib/aura.test.js',
  'lib/aura.test.cjs',
  'lib/context-compress.test.cjs',
  'lib/grounding.test.cjs',
  'lib/tool-cache.test.cjs',
  'lib/tool-selector.test.cjs',
  'economy-service.test.js',
  'portal-admin-routes.test.js',
  'lib/economy-x402-bridge.test.js',
  'lib/lens-rewriter.test.js',
  'lib/academy/canon.test.js',
  'lib/academy/skill-schema.test.js',
  'lib/academy/registry.test.js',
  'lib/academy/graders.test.js',
  'lib/academy/rubric.test.js',
  'lib/academy/exam.test.js',
  'lib/academy/receipts.test.js',
  'lib/academy/homework.test.js',
  'lib/academy/economy.test.js',
  'lib/academy/classes.test.js',
  'lib/academy/hooks.test.js',
  'lib/academy/academy-core.test.js',
  'lib/academy/review-fixes.test.js',
  'lib/academy/exam-admin.test.js',
  'lib/academy/judge.test.js',
  'academy-school-routes.test.js',
  'academy-xagent.test.js',
  'lib/academy/academy-instance.test.js',
  'lib/academy/press.test.js',
  'academy-school-fixes.test.js',
  'lib/academy/curriculum.test.js'
];

let passed = 0, failed = 0;
const failures = [];

for (const rel of SCRIPTS) {
  const abs = path.join(__dirname, rel);
  if (!fs.existsSync(abs)) {
    console.log(`SKIP (missing): ${rel}`);
    continue;
  }
  try {
    execFileSync(process.execPath, [abs], { stdio: 'pipe', cwd: __dirname, timeout: 120000 });
    console.log(`PASS  ${rel}`);
    passed++;
  } catch (e) {
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
    console.log(`FAIL  ${rel}`);
    failures.push({ rel, tail: out.split('\n').slice(-8).join('\n') });
    failed++;
  }
}

console.log(`\n[gate-node] ${passed} passed, ${failed} failed (of ${passed + failed} node scripts)`);
if (failed) {
  console.log('\n--- Failure details ---');
  for (const f of failures) {
    console.log(`\n### ${f.rel}\n${f.tail}`);
  }
  process.exit(1);
}
process.exit(0);
