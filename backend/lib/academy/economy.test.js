'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const path = require('path');
const { runAll, tmpDir, tmpStore, sampleSkill } = require('./testkit');
const { validateSkill } = require('./skill-schema');
const { EconomyService } = require('../../economy-service');
const { ACADEMY_ECON, splitPrice, createAcademyEconomy } = require('./economy');

const mk = (o) => validateSkill(sampleSkill(o)).skill;
const SKILLS = {
  'tool-hygiene': mk(),                                                                                       // house teacher, price 20
  'player-skill': mk({ id: 'player-skill', teacher: { type: 'operative', id: 'teach1' } }),                   // owned by teacherUser
  'self-skill': mk({ id: 'self-skill', teacher: { type: 'operative', id: 'selfteach' } }),                    // owned by the learner
  'pricey-skill': mk({ id: 'pricey-skill', price_sparks: 5000 }),
  'free-skill': mk({ id: 'free-skill', price_sparks: 0 })
};
const OWNERS = { op1: 'learner', teach1: 'teacherUser', selfteach: 'learner' };
async function setup() {
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  await economy.grant('learner', 100, 'test.seed', 'seed-learner');
  const ae = createAcademyEconomy({
    economy, store: tmpStore(),
    getSkill: (id) => (Object.prototype.hasOwnProperty.call(SKILLS, id) ? SKILLS[id] : null),
    ownerOfAgent: (id) => OWNERS[id] || null,
    teacherOwnerOf: (skill) => (skill.teacher.type === 'house' ? null : OWNERS[skill.teacher.id] || null)
  });
  return { economy, ae };
}

runAll('academy-economy', {
  'splitPrice follows the constants and never loses a spark'() {
    assert.deepStrictEqual(splitPrice(100, true), { teacher: 80, burn: 5, house: 15 });
    assert.deepStrictEqual(splitPrice(10, true), { teacher: 8, burn: 0, house: 2 });
    assert.deepStrictEqual(splitPrice(100, false), { teacher: 50, burn: 0, house: 50 });
    for (let p = 1; p <= 500; p++) for (const ok of [true, false]) {
      const s = splitPrice(p, ok); assert.strictEqual(s.teacher + s.burn + s.house, p);
    }
    assert.ok(Object.isFrozen(ACADEMY_ECON));
  },
  async 'enroll charges tuition once, even under concurrency'() {
    const { economy, ae } = await setup();
    const args = { ownerId: 'learner', agentId: 'op1', skillId: 'tool-hygiene', windowId: 'w1' };
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => ae.enroll(args)));
    assert.ok(rs.every((r) => r.ok));
    assert.strictEqual(await economy.getBalance('learner'), 80);
  },
  async 'enroll fails cleanly without funds and stores nothing'() {
    const { economy, ae } = await setup();
    const r = await ae.enroll({ ownerId: 'learner', agentId: 'op1', skillId: 'pricey-skill', windowId: 'w1' });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.insufficient, true);
    assert.strictEqual(await economy.getBalance('learner'), 100);
  },
  async 'free skills enroll without a ledger call'() {
    const { economy, ae } = await setup();
    const r = await ae.enroll({ ownerId: 'learner', agentId: 'op1', skillId: 'free-skill', windowId: 'w1' });
    assert.ok(r.ok); assert.strictEqual(await economy.getBalance('learner'), 100);
  },
  async 'pass: player teacher 80%, house 15%, 5% burned; double settle pays once'() {
    const { economy, ae } = await setup();
    const e = await ae.enroll({ ownerId: 'learner', agentId: 'op1', skillId: 'player-skill', windowId: 'w1' });
    const [s1, s2] = await Promise.all([ae.settle({ enrollmentId: e.enrollment.id, passed: true }), ae.settle({ enrollmentId: e.enrollment.id, passed: true })]);
    assert.ok(s1.ok && s2.ok);
    assert.strictEqual(await economy.getBalance('teacherUser'), 16);
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.houseAccount), 3);
    assert.strictEqual(await economy.getBalance('learner'), 80);   // 20 spent: 16 + 3 credited, 1 burned
    assert.strictEqual(s1.split.burn, 1);
  },
  async 'fail: teacher 50%, house 50%'() {
    const { economy, ae } = await setup();
    const e = await ae.enroll({ ownerId: 'learner', agentId: 'op1', skillId: 'player-skill', windowId: 'w1' });
    await ae.settle({ enrollmentId: e.enrollment.id, passed: false });
    assert.strictEqual(await economy.getBalance('teacherUser'), 10);
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.houseAccount), 10);
  },
  async 'house faculty teacher share funds the scholarship pool'() {
    const { economy, ae } = await setup();
    const e = await ae.enroll({ ownerId: 'learner', agentId: 'op1', skillId: 'tool-hygiene', windowId: 'w1' });
    await ae.settle({ enrollmentId: e.enrollment.id, passed: true });
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.scholarshipAccount), 16);
  },
  async 'self-dealing: teacher owner equals learner owner earns nothing'() {
    const { economy, ae } = await setup();
    const e = await ae.enroll({ ownerId: 'learner', agentId: 'op1', skillId: 'self-skill', windowId: 'w1' });
    const s = await ae.settle({ enrollmentId: e.enrollment.id, passed: true });
    assert.strictEqual(s.split.selfDeal, true);
    assert.strictEqual(await economy.getBalance('learner'), 80);                                  // no payout back to the learner
    assert.strictEqual(await economy.getBalance(ACADEMY_ECON.houseAccount), 19);                  // teacher share + house share
  },
  async 'settle rejects unknown enrollments'() {
    const { ae } = await setup();
    assert.ok(!(await ae.settle({ enrollmentId: 'enr_nope', passed: true })).ok);
  }
});
