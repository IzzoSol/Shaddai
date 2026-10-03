'use strict';
delete process.env.DATABASE_URL;
const assert = require('assert');
const path = require('path');
const { runAll, tmpDir, tmpStore } = require('./testkit');
const { EconomyService } = require('../../economy-service');
const { createAcademy } = require('./academy-core');
const { createBenchmarks } = require('./benchmarks');
const { validateSkill } = require('./skill-schema');
const { GRADERS } = require('./graders');
const { hasSecret } = require('./secrets');
const { FACULTY } = require('./faculty');
const { ENTRIES, RUBRICS, seedCurriculum } = require('./curriculum');

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const scoreAll = (bench, fn) => mean(bench.tasks.map((t) => GRADERS[bench.grader](t.input, t.spec, fn(t)).score));

function makeAcademy() {
  const economy = new EconomyService({ filePath: path.join(tmpDir(), 'economy.json') });
  const opsDb = { op1: { id: 'op1', owner: 'owner1', tools: [], skills: [] } };
  const operatives = { get: (id) => (Object.prototype.hasOwnProperty.call(opsDb, id) ? opsDb[id] : null), update: (id, p) => Object.assign(opsDb[id], p) };
  const clock = { t: 1700000000000 };
  const academy = createAcademy({ dir: tmpDir(), economy, operatives, adminIds: ['owner1'], now: () => clock.t, judge: async () => ({ scores: { clarity: 2 } }), hooks: { passed() {}, failed() {}, homeworkImproved() {}, taught() {}, classCompleted() {} } });
  return { academy, economy, opsDb, clock };
}

runAll('curriculum', {
  'eleven skills validate and every benchmark registers on a fresh store'() {
    assert.strictEqual(ENTRIES.length, 11);
    const benchmarks = createBenchmarks(tmpStore());
    const ids = new Set();
    for (const e of ENTRIES) {
      const v = validateSkill(e.skill); assert.ok(v.ok, e.skill.id + ': ' + JSON.stringify(v.errors));
      assert.ok(!ids.has(e.skill.id), 'duplicate skill id ' + e.skill.id); ids.add(e.skill.id);
      const r = benchmarks.register(e.bench); assert.ok(r.ok, e.bench.id + ': ' + JSON.stringify(r.errors));
      assert.strictEqual(e.skill.benchmark.id, e.bench.id);
      assert.strictEqual(e.skill.benchmark.version, e.bench.version);
      assert.ok(e.bench.grader !== 'rubric', 'exams are deterministic; creative quality is trained through homework');
    }
  },
  'all seven faculty teach, as house teachers, and prices fit the tiers'() {
    for (const f of FACULTY) assert.ok(ENTRIES.some((e) => e.skill.teacher.type === 'house' && e.skill.teacher.id === f.agent), f.agent + ' teaches nothing');
    for (const e of ENTRIES) {
      assert.strictEqual(e.skill.teacher.type, 'house');
      assert.strictEqual(e.skill.price_sparks, e.skill.tier === 'spark' ? 20 : 60);
    }
  },
  'every homework rubric exists and requires point at real skills'() {
    const ids = new Set(ENTRIES.map((e) => e.skill.id)); const rubrics = new Set(RUBRICS.map((r) => r.id));
    for (const e of ENTRIES) {
      assert.ok(rubrics.has(e.skill.homework.rubric_id), e.skill.id + ' has no rubric');
      for (const r of e.skill.requires) assert.ok(ids.has(r), e.skill.id + ' requires unknown ' + r);
      assert.ok(e.skill.lesson.checklist.length >= 3 && e.skill.lesson.examples.length >= 1);
    }
    for (const r of RUBRICS) assert.ok(r.criteria.length >= 3 && r.criteria.every((c) => c.max === 4));
  },
  'a model answer passes with lift, an empty answer scores zero, a cheating answer fails'() {
    for (const e of ENTRIES) {
      const model = scoreAll(e.bench, (t) => e.fixtures.model(t));
      const bad = scoreAll(e.bench, (t) => e.fixtures.bad(t));
      const empty = scoreAll(e.bench, () => undefined);
      assert.ok(model >= e.bench.passMark + 0.1, e.skill.id + ' model scored ' + model.toFixed(2));
      assert.ok(model - empty >= e.bench.minLift, e.skill.id + ' lift too small');
      assert.ok(bad < e.bench.passMark, e.skill.id + ' cheating answer scored ' + bad.toFixed(2));
      assert.strictEqual(empty, 0, e.skill.id + ' empty answer scored ' + empty);
    }
  },
  'model answers pass on every sampled subset of tasks, not just on average'() {
    for (const e of ENTRIES) {
      const per = e.bench.tasks.map((t) => GRADERS[e.bench.grader](t.input, t.spec, e.fixtures.model(t)).score);
      const worst = per.slice().sort((a, b) => a - b).slice(0, e.bench.perAttempt);
      assert.ok(mean(worst) >= e.bench.passMark, e.skill.id + ' worst sample ' + mean(worst).toFixed(2));
    }
  },
  'curriculum text contains no secrets and trading lessons never promise returns'() {
    for (const e of ENTRIES) {
      assert.strictEqual(hasSecret(e.skill), false, e.skill.id);
      assert.strictEqual(hasSecret(e.bench), false, e.bench.id);
    }
    const trading = ENTRIES.filter((e) => e.skill.track === 'trading');
    assert.ok(trading.length >= 2);
    for (const e of trading) assert.ok(/paper/i.test(JSON.stringify(e.skill)), e.skill.id + ' must say paper');
    for (const e of ENTRIES) for (const a of e.skill.allows) assert.ok(!/execute|wire|withdraw|transfer/i.test(a), 'no execution capability: ' + a);
  },
  'seeding registers everything once, never overwrites, and a second seed is a no-op'() {
    const { academy } = makeAcademy();
    const first = seedCurriculum(academy);
    assert.deepStrictEqual([first.skills, first.benchmarks, first.rubrics], [11, 11, RUBRICS.length]);
    assert.strictEqual(academy.registry.list({}).length, 11);
    const edited = Object.assign({}, ENTRIES[0].skill, { version: '1.1.0', summary: 'Edited by the teacher.' });
    assert.ok(academy.registry.publish(edited).ok);
    const second = seedCurriculum(academy);
    assert.deepStrictEqual([second.skills, second.benchmarks, second.rubrics], [0, 0, 0]);
    assert.strictEqual(academy.registry.get(ENTRIES[0].skill.id).version, '1.1.0');
    assert.strictEqual(academy.registry.get(ENTRIES[0].skill.id).summary, 'Edited by the teacher.');
  },
  async 'a seeded skill can be learned end to end with the model answer and fails with the cheat'() {
    const { academy, economy, opsDb, clock } = makeAcademy();
    await economy.grant('owner1', 200, 'test.seed', 'seed-o1');
    seedCurriculum(academy);
    const e = ENTRIES.find((x) => x.skill.id === 'tool-protocol');
    const run = async (skillId, answer) => {
      const enr = (await academy.tuition.enroll({ ownerId: 'owner1', agentId: 'op1', skillId, windowId: 'w' + Math.random().toString(36).slice(2, 8) })).enrollment;
      const b = academy.exams.begin({ agentId: 'op1', skillId, kind: 'baseline', withSkill: false, enrollmentId: enr.id });
      await academy.exams.submit({ attemptId: b.attemptId, outputs: Object.fromEntries(b.tasks.map((t) => [t.id, []])) });
      const x = academy.exams.begin({ agentId: 'op1', skillId, kind: 'exam', withSkill: true, enrollmentId: enr.id });
      await academy.exams.submit({ attemptId: x.attemptId, outputs: Object.fromEntries(x.tasks.map((t) => [t.id, answer(t)])) });
      return academy.finishExam({ agentId: 'op1', skillId, enrollmentId: enr.id });
    };
    const cheat = await run('tool-protocol', (t) => e.fixtures.bad(t));
    assert.strictEqual(cheat.passed, false);
    assert.deepStrictEqual(opsDb.op1.skills, []);
    clock.t += 11 * 60000;                                   // cooldown between attempts
    const ok = await run('tool-protocol', (t) => e.fixtures.model(t));
    assert.strictEqual(ok.passed, true);
    assert.strictEqual(ok.installed, true);
    assert.ok(opsDb.op1.tools.includes('tool-protocol'));
  }
});
