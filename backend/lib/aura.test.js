#!/usr/bin/env node
'use strict';
/*
 * aura.test.js — tests for the A5 architecture upgrades (schema validation, policy
 * gates, JSONL audit log, multi-step chains). Zero-dependency; uses only node
 * built-ins + assert. Runs AURA against an isolated temp AURA_DATA_DIR so it never
 * touches real cache/stats/audit files.
 *
 * Run:  node backend/lib/aura.test.js
 * Exits non-zero on any failure. All diagnostics → stderr.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Isolate persistence to a throwaway dir + configure policy BEFORE require ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-test-'));
process.env.AURA_DATA_DIR = TMP;

// Write a skills registry: valid + invalid + duplicate entries to prove validation.
const skills = [
  { name: 'greeting', match: '^hi there$', action: { type: 'answer', value: 'hello!' } },
  { name: 'echo-cap', match: '^shout (.+)$', action: { type: 'answer', value: '{1}' } },
  { name: 'twice', match: '^double (\\d+)$', action: {
      type: 'chain',
      steps: [
        { type: 'compute', expr: '2 * {1}' }   // uses capture group substitution before compute
      ]
    } },
  { name: 'via-adapter', match: '^upper (.+)$', action: { type: 'adapter', adapter: 'toUpper' } },
  // ── these must be REJECTED and skipped (not crash) ──
  { name: 'greeting', match: 'dup', action: { type: 'answer', value: 'x' } }, // duplicate name
  { name: 'bad-regex', match: '(', action: { type: 'answer', value: 'x' } },  // invalid regex
  { name: 'bad-action', match: 'ok', action: { type: 'summon' } },            // bad action.type
  { name: '', match: 'ok', action: { type: 'answer', value: 'x' } },          // empty name
  { name: 'empty-chain', match: 'ok2', action: { type: 'chain', steps: [] } },// empty chain
];
fs.writeFileSync(path.join(TMP, 'aura-skills.json'), JSON.stringify({ skills }, null, 2));

let failures = 0;
function test(name, fn) {
  try { fn(); process.stderr.write('  ok  ' + name + '\n'); }
  catch (e) { failures++; process.stderr.write('  FAIL ' + name + ' — ' + (e && e.message) + '\n'); }
}

const aura = require(path.join(__dirname, 'aura.js'));

// The chain step uses {1} substitution inside expr — but _runAction substitutes only
// action.value for 'answer'. For 'compute' we substitute via the adapter path below.
// Register an adapter so the adapter skill resolves.
aura.registerAdapter('toUpper', (prompt, m) => (m && m[1] ? String(m[1]).toUpperCase() : null));

// ── A5.1 schema validation ──────────────────────────────────────────────────
test('loadSkills accepts only valid, unique skills (rejects dup/badregex/badaction/empty)', () => {
  const loaded = aura.loadSkills();
  const names = loaded.map(s => s.name).sort();
  assert.deepStrictEqual(names, ['echo-cap', 'greeting', 'twice', 'via-adapter'],
    'expected 4 valid skills, got: ' + names.join(','));
});

// ── A5.4 skill dispatch: answer / capture-group / adapter ─────────────────────
test('answer skill returns static value', () => {
  const r = aura.route('hi there');
  assert.strictEqual(r.hit, true);
  assert.strictEqual(r.answer, 'hello!');
  assert.strictEqual(r.method, 'skill');
});
test('answer skill substitutes capture group {1}', () => {
  const r = aura.route('shout victory');
  assert.strictEqual(r.hit, true);
  assert.strictEqual(r.answer, 'victory');
});
test('adapter skill runs registered host fn', () => {
  const r = aura.route('upper hello');
  assert.strictEqual(r.hit, true);
  assert.strictEqual(r.answer, 'HELLO');
});

// ── A5.4 chain: substitute capture then compute deterministically ─────────────
test('chain skill runs ordered sub-actions (compute) with method=chain', () => {
  // "double 21" → compute "2 * 21" → "42"
  const r = aura.route('double 21');
  assert.strictEqual(r.hit, true, 'chain should hit');
  assert.strictEqual(r.answer, '42');
  assert.strictEqual(r.method, 'chain');
});

// ── A5.3 JSONL audit log ──────────────────────────────────────────────────────
test('audit log appends one JSON line per route() call with required fields', () => {
  const before = readAudit().length;
  aura.route('12 * 12');
  const lines = readAudit();
  assert.ok(lines.length > before, 'audit log should have grown');
  const last = lines[lines.length - 1];
  for (const f of ['ts', 'qHash', 'method', 'hit', 'latencyMs']) {
    assert.ok(Object.prototype.hasOwnProperty.call(last, f), 'audit line missing field: ' + f);
  }
  assert.strictEqual(typeof last.latencyMs, 'number');
  assert.strictEqual(typeof last.hit, 'boolean');
});
test('audit query is truncated / never raw-multiline', () => {
  const longQ = 'x'.repeat(500) + '\n\nmore';
  aura.route(longQ);
  const last = readAudit().slice(-1)[0];
  assert.ok(last.query.length <= 120, 'query should be truncated to <=120 chars');
  assert.ok(!/\n/.test(last.query), 'query should be single-line');
});

function readAudit() {
  try {
    return fs.readFileSync(path.join(TMP, 'aura-audit.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (_) { return []; }
}

// ── existing behavior preserved (compute + safety) ────────────────────────────
test('built-in compute still works (2^10)', () => {
  const r = aura.route('2^10');
  assert.strictEqual(r.hit, true);
  assert.strictEqual(String(r.answer), '1024');
});
test('open-ended prompt still declines (miss)', () => {
  const r = aura.route('write a haiku about the sea, please make it unique 12345');
  assert.strictEqual(r.hit, false);
});

process.stderr.write('\n' + (failures ? failures + ' TEST(S) FAILED\n' : 'ALL AURA A5 TESTS PASSED\n'));
process.exit(failures ? 1 : 0);
