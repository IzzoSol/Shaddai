'use strict';
const assert = require('assert');
const { runAll } = require('./testkit');
const { createHooks } = require('./hooks');

runAll('academy-hooks', {
  'hooks forward the right events and reputation outcomes'() {
    const ev = []; const rep = [];
    const h = createHooks({
      achievements: { recordEvent: (s, t, m) => { ev.push([s, t, m]); return { ok: true }; } },
      reputation: { record: (r) => { rep.push(r); } }
    });
    h.passed({ agentId: 'a1', skillId: 's1', lift: 0.4, track: 'tools' });
    h.failed({ agentId: 'a1', skillId: 's1' });
    h.homeworkImproved({ agentId: 'a1', improvement: 0.3 });
    h.taught({ teacherId: 'NEXUS' });
    h.classCompleted({ agentId: 'a1' });
    assert.deepStrictEqual(ev.map((e) => e[1]), ['academy_skill_passed', 'academy_homework_improved', 'academy_taught', 'academy_class_completed']);
    assert.strictEqual(ev[0][2].lift, 0.4);
    assert.deepStrictEqual(rep.map((r) => r.outcome), [true, false]);
    assert.strictEqual(rep[0].tool, 'academy:s1');
  },
  'a throwing integration never breaks teaching'() {
    const h = createHooks({ achievements: { recordEvent() { throw new Error('x'); } }, reputation: { record() { throw new Error('y'); } } });
    h.passed({ agentId: 'a1', skillId: 's1', lift: 1 }); h.failed({ agentId: 'a1', skillId: 's1' });
  },
  'real achievements module unlocks academy achievements and keeps old events working'() {
    process.env.ACHIEVEMENTS_FILE = require('path').join(require('./testkit').tmpDir(), 'achievements.json');
    const ach = require('../../achievements');
    const id = 'test_academy_subject_' + process.pid;
    try {
      const r1 = ach.recordEvent(id, 'academy_skill_passed', { lift: 0.5, track: 'tools' });
      assert.strictEqual(r1.ok, true);
      const ids = r1.newlyUnlocked.map((a) => a.id);
      assert.ok(ids.includes('first_lesson'), ids.join());
      assert.ok(ids.includes('quick_study'), ids.join());
      for (let i = 0; i < 9; i++) ach.recordEvent(id, 'academy_skill_passed', { lift: 0.1 });
      assert.ok(ach.getProgress(id).unlocked.some((u) => u.id === 'honor_roll'));
      for (let i = 0; i < 3; i++) ach.recordEvent(id, 'academy_homework_improved', { improvement: 0.2 });
      assert.ok(ach.getProgress(id).unlocked.some((u) => u.id === 'red_pen'));
      for (let i = 0; i < 5; i++) ach.recordEvent(id, 'academy_taught', {});
      assert.ok(ach.getProgress(id).unlocked.some((u) => u.id === 'mentor_1'));
      ach.recordEvent(id, 'academy_class_completed', {});
      assert.ok(ach.getProgress(id).unlocked.some((u) => u.id === 'grand_curriculum'));
      assert.strictEqual(ach.recordEvent(id, 'task_run', {}).ok, true);       // existing events still work
      assert.strictEqual(ach.recordEvent(id, 'nope_event', {}).ok, false);   // unknown still rejected
    } finally { ach._deleteSubject(id); }
  }
});
