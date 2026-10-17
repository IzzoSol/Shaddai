'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runAll, tmpStore, sampleSkill } = require('./testkit');
const { validateSkill } = require('./skill-schema');
const { createReceipts } = require('./receipts');
const { installSkill } = require('./install');

const body = (o) => Object.assign({ agentId: 'a1', skillId: 'tool-hygiene', skillHash: 'h'.repeat(64), version: '1.0.0', track: 'tools',
  teacherId: 'NEXUS', baseline: 0, exam: 1, lift: 1, passed: true, attempts: 2, homeworkRounds: 0,
  graderVersion: 'b@1.0.0', tuitionTx: 'enr_1', examAttemptId: 'att_1', ts: 1700000000000 }, o || {});

function fakeOps(initial) {
  const db = { op1: Object.assign({ id: 'op1', tools: ['chat'], skills: [] }, initial || {}) };
  return { get: (id) => db[id] || null, update: (id, p) => { Object.assign(db[id], p); return db[id]; }, db };
}

runAll('receipts+install', {
  'issue builds a hash chain per agent and verifies'() {
    const r = createReceipts({ store: tmpStore() });
    const a = r.issue(body());
    const b = r.issue(body({ examAttemptId: 'att_2', ts: 1700000001000 }));
    assert.strictEqual(a.prev, null);
    assert.strictEqual(b.prev, a.hash);
    assert.strictEqual(b.receiptId, 'rc_' + b.hash.slice(0, 16));
    assert.deepStrictEqual(r.verifyChain('a1'), { ok: true, count: 2 });
    assert.strictEqual(r.forAgent('a1').length, 2);
    assert.strictEqual(r.get(a.receiptId).hash, a.hash);
  },
  'issue is idempotent on examAttemptId'() {
    const r = createReceipts({ store: tmpStore() });
    const a = r.issue(body()); const b = r.issue(body());
    assert.strictEqual(a.receiptId, b.receiptId);
    assert.strictEqual(r.forAgent('a1').length, 1);
  },
  'chains are per agent'() {
    const r = createReceipts({ store: tmpStore() });
    r.issue(body()); const x = r.issue(body({ agentId: 'a2', examAttemptId: 'att_9' }));
    assert.strictEqual(x.prev, null);
  },
  'tampering breaks verification'() {
    const store = tmpStore(); const r = createReceipts({ store });
    r.issue(body()); r.issue(body({ examAttemptId: 'att_2' }));
    const f = path.join(store.dir, 'receipts.jsonl');
    const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
    const first = JSON.parse(lines[0]); first.exam = 0.99; lines[0] = JSON.stringify(first);
    fs.writeFileSync(f, lines.join('\n') + '\n');
    const v = r.verifyChain('a1');
    assert.strictEqual(v.ok, false); assert.strictEqual(v.brokenAt, 0);
  },
  'sig is an HMAC when a key is set, null otherwise'() {
    assert.strictEqual(createReceipts({ store: tmpStore(), key: '' }).issue(body()).sig, null);
    assert.strictEqual(createReceipts({ store: tmpStore(), key: 'k' }).issue(body()).sig.length, 64);
  },
  'install adds the skill and its allowed tools, replacing older versions'() {
    const skill = validateSkill(sampleSkill()).skill;
    const ops = fakeOps();
    const rec = createReceipts({ store: tmpStore() }).issue(body({ agentId: 'op1', skillHash: skill.hash }));
    const r = installSkill({ operatives: ops, operativeId: 'op1', receipt: rec, skill });
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual(ops.db.op1.tools.sort(), ['chat', 'search']);
    assert.strictEqual(ops.db.op1.skills.length, 1);
    assert.strictEqual(ops.db.op1.skills[0].receiptId, rec.receiptId);
    installSkill({ operatives: ops, operativeId: 'op1', receipt: rec, skill });
    assert.strictEqual(ops.db.op1.skills.length, 1);
  },
  'install rejects mismatched, failed or unknown'() {
    const skill = validateSkill(sampleSkill()).skill;
    const ops = fakeOps();
    const mk = (o) => createReceipts({ store: tmpStore() }).issue(body(Object.assign({ agentId: 'op1', skillHash: skill.hash }, o)));
    assert.ok(!installSkill({ operatives: ops, operativeId: 'op1', receipt: mk({ skillHash: 'x'.repeat(64) }), skill }).ok);
    assert.ok(!installSkill({ operatives: ops, operativeId: 'op1', receipt: mk({ passed: false }), skill }).ok);
    assert.ok(!installSkill({ operatives: ops, operativeId: 'op1', receipt: mk({ agentId: 'other' }), skill }).ok);
    assert.ok(!installSkill({ operatives: ops, operativeId: 'ghost', receipt: mk(), skill }).ok);
  }
});
