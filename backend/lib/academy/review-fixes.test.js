'use strict';
// Regression tests for the final-review findings (Critical 1-5, Important 6-12).
delete process.env.DATABASE_URL;
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runAll, tmpDir, tmpStore, sampleSkill, sampleBenchmark, sampleRubric } = require('./testkit');
const { EconomyService } = require('../../economy-service');
const { createAcademy } = require('./academy-core');
const { createReceipts } = require('./receipts');
const { installSkill } = require('./install');
const { validateSkill } = require('./skill-schema');
const { stripMarkup } = require('./canon');

const GOOD = [{ tool: 'search', args: { query: 'x' } }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const answerAll = (tasks, out) => Object.fromEntries(tasks.map((t) => [t.id, out]));

async function world(opts) {
  opts = opts || {};
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  for (const u of ['owner1', 'owner2', 'teacherUser']) await economy.grant(u, 200, 'test.seed', 'seed-' + u);
  const opsDb = {
    op1: { id: 'op1', owner: 'owner1', tools: ['chat'], skills: [] },
    op2: { id: 'op2', owner: 'owner2', tools: [], skills: [] },
    tchr: { id: 'tchr', owner: 'teacherUser', tools: [], skills: [] },
    own1teach: { id: 'own1teach', owner: 'owner1', tools: [], skills: [] }
  };
  const operatives = { get: (id) => (Object.prototype.hasOwnProperty.call(opsDb, id) ? opsDb[id] : null), update: (id, p) => Object.assign(opsDb[id], p) };
  const events = []; const judge = { n: 0 };
  const hooks = {
    passed: (x) => events.push(['passed', x.agentId]), failed: (x) => events.push(['failed', x.agentId]),
    homeworkImproved: (x) => events.push(['hw', x.agentId]), taught: (x) => events.push(['taught', x.teacherId]), classCompleted: (x) => events.push(['class', x.agentId])
  };
  let t = 1700000000000;
  const academy = createAcademy({
    dir: tmpDir(), economy, operatives, hooks, now: () => t, adminIds: ['owner1'], receiptKey: opts.receiptKey,
    judge: async () => { judge.n++; if (opts.judgeMs) await sleep(opts.judgeMs); return { scores: { clarity: 2, tools: 2 } }; }
  });
  assert.ok(academy.benchmarks.register(opts.bench || sampleBenchmark()).ok);
  assert.ok(academy.benchmarks.registerRubric(sampleRubric()).ok);
  assert.ok(academy.registry.publish(sampleSkill()).ok);
  assert.ok(academy.registry.publish(sampleSkill({ id: 'player-skill', teacher: { type: 'operative', id: 'tchr' } })).ok);
  assert.ok(academy.registry.publish(sampleSkill({ id: 'self-skill', teacher: { type: 'operative', id: 'own1teach' } })).ok);
  return { economy, opsDb, events, judge, academy, tick: (ms) => { t += ms; } };
}

async function baseline(a, agentId, skillId, out) {
  const b = a.exams.begin({ agentId, skillId, kind: 'baseline', withSkill: false }); assert.ok(b.ok, b.error);
  await a.exams.submit({ attemptId: b.attemptId, outputs: answerAll(b.tasks, out) });
}
async function exam(a, agentId, skillId, out) {
  const e = a.exams.begin({ agentId, skillId, kind: 'exam', withSkill: true }); assert.ok(e.ok, e.error);
  await a.exams.submit({ attemptId: e.attemptId, outputs: answerAll(e.tasks, out) });
}
const enroll = (a, ownerId, agentId, skillId, windowId) => a.tuition.enroll({ ownerId, agentId, skillId, windowId: windowId || 'w1' });

runAll('review-fixes', {
  async '1 finishExam rejects an enrollment that belongs to another agent'() {
    const { academy: a } = await world();
    const e2 = await enroll(a, 'owner2', 'op2', 'tool-hygiene'); assert.ok(e2.ok, JSON.stringify(e2));
    await baseline(a, 'op1', 'tool-hygiene', []); await exam(a, 'op1', 'tool-hygiene', GOOD);
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: e2.enrollment.id });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(a.tuition.get(e2.enrollment.id).status, 'paid');
  },
  async '2 finishExam requires an enrollment; nothing installs for free'() {
    const { academy: a, opsDb } = await world();
    await baseline(a, 'op1', 'tool-hygiene', []); await exam(a, 'op1', 'tool-hygiene', GOOD);
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene' });
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(opsDb.op1.skills, []);
  },
  async '3 hooks fire once; an enrollment cannot be reused; re-passing does not farm XP'() {
    const { academy: a, events, tick } = await world();
    const e1 = await enroll(a, 'owner1', 'op1', 'tool-hygiene', 'w1');
    await baseline(a, 'op1', 'tool-hygiene', []); await exam(a, 'op1', 'tool-hygiene', GOOD);
    const f1 = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: e1.enrollment.id });
    assert.ok(f1.ok, f1.error);
    await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: e1.enrollment.id });
    assert.strictEqual(events.filter((e) => e[0] === 'passed').length, 1);
    assert.strictEqual(events.filter((e) => e[0] === 'taught').length, 1);
    tick(11 * 60000);
    await baseline(a, 'op1', 'tool-hygiene', []); await exam(a, 'op1', 'tool-hygiene', GOOD);
    const reuse = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: e1.enrollment.id });
    assert.strictEqual(reuse.ok, false);
    assert.ok(/used/.test(reuse.error));
    const e2 = await enroll(a, 'owner1', 'op1', 'tool-hygiene', 'w2');
    const f2 = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: e2.enrollment.id });
    assert.ok(f2.ok, f2.error);
    assert.strictEqual(events.filter((e) => e[0] === 'passed').length, 1);
    assert.strictEqual(events.filter((e) => e[0] === 'taught').length, 1);
  },
  async '4 retry after a crash between settle and install completes the install once'() {
    const { academy: a, opsDb, events } = await world();
    const e = await enroll(a, 'owner1', 'op1', 'tool-hygiene');
    await baseline(a, 'op1', 'tool-hygiene', []); await exam(a, 'op1', 'tool-hygiene', GOOD);
    await a.tuition.settle({ enrollmentId: e.enrollment.id, passed: true });          // simulated crash point
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: e.enrollment.id });
    assert.ok(r.ok, r.error); assert.strictEqual(r.installed, true);
    assert.strictEqual(opsDb.op1.skills.length, 1);
    assert.strictEqual(events.filter((x) => x[0] === 'passed').length, 1);
  },
  async '5a rubric submit does not clobber concurrent writes or double-judge'() {
    const bench = sampleBenchmark({ grader: 'rubric', rubric: sampleRubric(), perAttempt: 1 });
    const { academy: a, judge } = await world({ judgeMs: 40, bench });
    const A = a.exams.begin({ agentId: 'op1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    const p = a.exams.submit({ attemptId: A.attemptId, outputs: answerAll(A.tasks, 'plan') });
    const B = a.exams.begin({ agentId: 'op2', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });   // lands while A is being judged
    await p;
    const rb = await a.exams.submit({ attemptId: B.attemptId, outputs: answerAll(B.tasks, 'plan') });
    assert.ok(rb.ok, rb.error);
    judge.n = 0;
    const A2 = a.exams.begin({ agentId: 'op1', skillId: 'player-skill', kind: 'baseline', withSkill: false });
    const real = answerAll(A2.tasks, 'a real answer');
    const [x, y] = await Promise.all([a.exams.submit({ attemptId: A2.attemptId, outputs: real }), a.exams.submit({ attemptId: A2.attemptId, outputs: real })]);
    assert.strictEqual([x.ok, y.ok].filter(Boolean).length, 1);
    assert.strictEqual(judge.n, 2);                                                   // one submit = two judge passes, not four
  },
  async '5b concurrent homework submits never exceed maxRounds or lose rounds'() {
    const { academy: a, judge } = await world({ judgeMs: 20 });
    const sub = (i) => a.homework.submit({ agentId: 'op1', skillId: 'tool-hygiene', rubricId: 'tool-plan-rubric', artifact: { kind: 'text', text: 'v' + i }, provenance: { prompt: 'p' } });
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(sub));
    assert.strictEqual(rs.filter((r) => r.ok).length, 3);
    assert.strictEqual(a.homework.summary('op1', 'tool-hygiene').rounds, 3);
    assert.strictEqual(judge.n, 6);
  },
  async '6 enroll requires owning the agent; teacher owner resolved server-side; self-dealing detected'() {
    const { academy: a, economy } = await world();
    assert.ok(!(await enroll(a, 'owner1', 'op2', 'tool-hygiene')).ok);                 // not your agent
    assert.ok(!(await enroll(a, 'owner2', 'op1', 'tool-hygiene')).ok);                 // sybil payer for someone else's agent
    assert.ok(!(await enroll(a, 'owner1', 'op1', 'no-such-skill')).ok);
    const ps = await enroll(a, 'owner1', 'op1', 'player-skill');
    assert.ok(ps.ok, JSON.stringify(ps));
    await baseline(a, 'op1', 'player-skill', []); await exam(a, 'op1', 'player-skill', GOOD);
    const r = await a.finishExam({ agentId: 'op1', skillId: 'player-skill', enrollmentId: ps.enrollment.id });
    assert.strictEqual(r.split.selfDeal, false);
    assert.strictEqual(await economy.getBalance('teacherUser'), 216);                  // 200 + 80% of 20, resolved from the teacher operative
    const ss = await enroll(a, 'owner1', 'op1', 'self-skill');
    await baseline(a, 'op1', 'self-skill', []); await exam(a, 'op1', 'self-skill', GOOD);
    const r2 = await a.finishExam({ agentId: 'op1', skillId: 'self-skill', enrollmentId: ss.enrollment.id });
    assert.strictEqual(r2.split.selfDeal, true);
  },
  async '7 real-world secret formats are rejected in skills and homework'() {
    const { academy: a } = await world();
    const secrets = [
      'sk-proj-abcdefghijklmnopqrstuv', 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAA', 'ghp_' + 'a'.repeat(36), 'AKIA' + 'A'.repeat(16),
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', '5'.repeat(88),
      '-----BEGIN PRIVATE KEY-----'
    ];
    for (const s of secrets) {
      assert.ok(!validateSkill(sampleSkill({ summary: 'note ' + s })).ok, 'skill accepted: ' + s.slice(0, 12));
      const h = await a.homework.submit({ agentId: 'op1', skillId: 'tool-hygiene', rubricId: 'tool-plan-rubric', artifact: { kind: 'text', text: 'x ' + s }, provenance: { prompt: 'p' } });
      assert.ok(!h.ok, 'homework accepted: ' + s.slice(0, 12));
    }
  },
  '8 stripMarkup removes unclosed tags but keeps comparison text'() {
    const a = stripMarkup('hi <img src=x onerror=alert(1)');
    assert.ok(!a.includes('<') && !a.includes('onerror'), a);
    assert.strictEqual(stripMarkup('if a < b and c > d'), 'if a < b and c > d');
    assert.strictEqual(stripMarkup('  hi <script>x</script><b>there</b> '), 'hi xthere');
  },
  async '9 oversized or secret-bearing exam outputs never reach the judge'() {
    const bench = sampleBenchmark({ grader: 'rubric', rubric: sampleRubric(), perAttempt: 1 });
    const { academy: a, judge } = await world({ bench });
    const b1 = a.exams.begin({ agentId: 'op1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    const r1 = await a.exams.submit({ attemptId: b1.attemptId, outputs: answerAll(b1.tasks, 'x'.repeat(50000)) });
    assert.strictEqual(r1.score, 0);
    const b2 = a.exams.begin({ agentId: 'op2', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
    const r2 = await a.exams.submit({ attemptId: b2.attemptId, outputs: answerAll(b2.tasks, 'my key is sk-abcdefghijklmnopqrstuvwx') });
    assert.strictEqual(r2.score, 0);
    assert.strictEqual(judge.n, 0);
  },
  async '10 lift is measured against the best prior baseline (no re-sandbagging)'() {
    const { academy: a, tick } = await world();
    await baseline(a, 'op1', 'tool-hygiene', GOOD);                                    // honestly good without the skill
    tick(11 * 60000);
    await baseline(a, 'op1', 'tool-hygiene', []);                                      // then sandbag a second baseline
    await exam(a, 'op1', 'tool-hygiene', GOOD);
    const ev = a.exams.evaluate({ agentId: 'op1', skillId: 'tool-hygiene' });
    assert.ok(ev.ok);
    assert.strictEqual(ev.lift, 0);
    assert.strictEqual(ev.passed, false);
  },
  async '11 install trusts only receipts in the store; chain verification checks the signature'() {
    const { academy: a, opsDb } = await world();
    const skill = a.registry.get('tool-hygiene');
    const forged = { receiptId: 'rc_fake', agentId: 'op1', skillId: 'tool-hygiene', skillHash: skill.hash, passed: true, hash: 'x'.repeat(64) };
    assert.ok(!installSkill({ operatives: { get: (id) => opsDb[id], update: (id, p) => Object.assign(opsDb[id], p) }, operativeId: 'op1', receipt: forged, skill, receipts: a.receipts }).ok);
    const store = tmpStore(); const r = createReceipts({ store, key: 'k' });
    r.issue({ agentId: 'z', skillId: 's', passed: true, examAttemptId: 'att_1', ts: 1 });
    assert.deepStrictEqual(r.verifyChain('z'), { ok: true, count: 1 });
    const f = path.join(store.dir, 'receipts.jsonl');
    const rec = JSON.parse(fs.readFileSync(f, 'utf8').trim()); rec.sig = null;
    fs.writeFileSync(f, JSON.stringify(rec) + '\n');
    assert.strictEqual(r.verifyChain('z').ok, false);
  },
  async '12 prototype-key ids are rejected everywhere and never throw'() {
    const { academy: a } = await world();
    const cls = a.classes.create('owner1', { name: 'C', track: 'tools', tier: 'spark', syllabus: ['tool-hygiene'], teacher: { type: 'house', id: 'NEXUS' }, room: 'r', capacity: 5, kind: 'open' }).class;
    assert.strictEqual(a.classes.join({ classId: cls.id, agentId: 'constructor' }).ok, false);
    assert.strictEqual(a.classes.recordPass({ classId: cls.id, agentId: 'constructor', skillId: 'tool-hygiene' }).ok, false);
    assert.strictEqual(a.roles.can('constructor', 'class.create'), false);
    assert.strictEqual(a.roles.grant({ by: 'owner1', target: '__proto__', role: 'teacher' }).ok, false);
    const bad = sampleBenchmark({ id: 'proto-bench', perAttempt: 1, tasks: [{ id: '__proto__', prompt: 'p', input: {}, spec: {} }, { id: 't2', prompt: 'p', input: {}, spec: {} }] });
    assert.strictEqual(a.benchmarks.register(bad).ok, false);
    assert.strictEqual(a.exams.begin({ agentId: '__proto__', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false }).ok, false);
  }
});
