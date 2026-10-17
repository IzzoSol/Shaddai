'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const path = require('path');
const { runAll, tmpDir, sampleSkill, sampleBenchmark, sampleRubric } = require('./testkit');
const { EconomyService } = require('../../economy-service');
const { createAcademy } = require('./academy-core');
const { ACADEMY_ECON } = require('./economy');

const GOOD = [{ tool: 'search', args: { query: 'x' } }];
const answerAll = (tasks, out) => Object.fromEntries(tasks.map((t) => [t.id, out]));

async function world() {
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  await economy.grant('owner1', 100, 'test.seed', 'seed-o1');
  const opsDb = { op1: { id: 'op1', owner: 'owner1', tools: ['chat'], skills: [] } };
  const operatives = { get: (id) => opsDb[id] || null, update: (id, p) => Object.assign(opsDb[id], p) };
  const events = [];
  const hooks = {
    passed: (x) => events.push(['passed', x.agentId]), failed: (x) => events.push(['failed', x.agentId]),
    homeworkImproved: (x) => events.push(['hw', x.agentId]), taught: (x) => events.push(['taught', x.teacherId]), classCompleted: (x) => events.push(['class', x.agentId])
  };
  let t = 1700000000000;
  const academy = createAcademy({ dir: tmpDir(), economy, operatives, hooks, now: () => t, adminIds: ['owner1'], judge: async () => ({ scores: { clarity: 2, tools: 2 } }) });
  assert.ok(academy.benchmarks.register(sampleBenchmark()).ok);
  assert.ok(academy.benchmarks.registerRubric(sampleRubric()).ok);
  assert.ok(academy.registry.publish(sampleSkill()).ok);
  return { economy, opsDb, events, academy, tick: (ms) => { t += ms; } };
}

async function takeBaseline(a, out) {
  const b = a.exams.begin({ agentId: 'op1', skillId: 'tool-hygiene', kind: 'baseline', withSkill: false });
  await a.exams.submit({ attemptId: b.attemptId, outputs: answerAll(b.tasks, out) });
}
async function takeExam(a, out) {
  const e = a.exams.begin({ agentId: 'op1', skillId: 'tool-hygiene', kind: 'exam', withSkill: true });
  assert.ok(e.ok, e.error);
  await a.exams.submit({ attemptId: e.attemptId, outputs: answerAll(e.tasks, out) });
}

runAll('academy-core e2e', {
  async 'learn, pass, pay, receipt, install'() {
    const { economy, opsDb, events, academy: a } = await world();
    const enr = await a.tuition.enroll({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-hygiene', windowId: 'w1' });
    assert.ok(enr.ok);
    await takeBaseline(a, []);
    await takeExam(a, GOOD);
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: enr.enrollment.id });
    assert.ok(r.ok, r.error); assert.strictEqual(r.passed, true);
    assert.strictEqual(r.receipt.lift, 1);
    assert.deepStrictEqual(a.receipts.verifyChain('op1'), { ok: true, count: 1 });
    assert.ok(opsDb.op1.tools.includes('search'));
    assert.strictEqual(opsDb.op1.skills[0].skillId, 'tool-hygiene');
    assert.strictEqual(await economy.getBalance('owner1'), 80);
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.scholarshipAccount), 16);   // house faculty teacher share
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.houseAccount), 3);
    assert.deepStrictEqual(events.map((e) => e[0]), ['passed', 'taught']);
    const again = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: enr.enrollment.id });
    assert.strictEqual(again.receipt.receiptId, r.receipt.receiptId);                      // idempotent
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.houseAccount), 3);
  },
  async 'fail: no lift means no install, 50/50 split, failed hook'() {
    const { economy, opsDb, events, academy: a } = await world();
    const enr = await a.tuition.enroll({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-hygiene', windowId: 'w1' });
    await takeBaseline(a, GOOD); await takeExam(a, GOOD);                                  // already good: lift 0
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: enr.enrollment.id });
    assert.ok(r.ok); assert.strictEqual(r.passed, false);
    assert.deepStrictEqual(opsDb.op1.skills, []);
    assert.strictEqual(opsDb.op1.tools.includes('search'), false);
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.scholarshipAccount), 10);
    assert.deepStrictEqual(events.map((e) => e[0]), ['failed']);
  },
  async 'finishExam errors cleanly with nothing to evaluate'() {
    const { academy: a } = await world();
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: 'enr_x' });
    assert.strictEqual(r.ok, false);
  },
  async 'a skill republished after the exam is not installed'() {
    const { opsDb, academy: a } = await world();
    const enr = await a.tuition.enroll({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-hygiene', windowId: 'w1' });
    await takeBaseline(a, []); await takeExam(a, GOOD);
    assert.ok(a.registry.publish(sampleSkill({ version: '1.1.0' })).ok);
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: enr.enrollment.id });
    assert.strictEqual(r.ok, false); assert.ok(/changed/.test(r.error));
    assert.deepStrictEqual(opsDb.op1.skills, []);
  },
  async 'class progress flows through finishExam'() {
    const { events, academy: a } = await world();
    const cls = a.classes.create('owner1', { name: 'Tools 101', track: 'tools', tier: 'spark', syllabus: ['tool-hygiene'], teacher: { type: 'house', id: 'NEXUS' }, room: 'tool-foundry', capacity: 5, kind: 'open' }).class;
    a.classes.join({ classId: cls.id, agentId: 'op1' });
    const enr = await a.tuition.enroll({ ownerId: 'owner1', agentId: 'op1', skillId: 'tool-hygiene', windowId: 'w1' });
    await takeBaseline(a, []); await takeExam(a, GOOD);
    const r = await a.finishExam({ agentId: 'op1', skillId: 'tool-hygiene', enrollmentId: enr.enrollment.id, classId: cls.id });
    assert.ok(r.ok); assert.strictEqual(r.classCompleted, true);
    assert.ok(events.some((e) => e[0] === 'class'));
  }
});
