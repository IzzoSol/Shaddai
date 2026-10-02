'use strict';
const { createStore } = require('./store');
const { createRegistry } = require('./registry');
const { createBenchmarks } = require('./benchmarks');
const { createExamService } = require('./exam');
const { createReceipts } = require('./receipts');
const { createHomework } = require('./homework');
const { createAcademyEconomy } = require('./economy');
const { createRoles } = require('./roles');
const { createClasses } = require('./classes');
const { createHooks } = require('./hooks');
const { installSkill } = require('./install');

function createAcademy({ dir, economy, operatives, judge, hooks, now = Date.now, adminIds, receiptKey }) {
  const store = createStore(dir);
  const registry = createRegistry(store);
  const benchmarks = createBenchmarks(store);
  const exams = createExamService({ store, registry, benchmarks, judge, now });
  const receipts = createReceipts({ store, key: receiptKey });
  const homework = createHomework({ store, benchmarks, judge, now });
  const tuition = createAcademyEconomy({ economy, store });
  const roles = createRoles({ store, adminIds, now });
  const classes = createClasses({ store, registry, roles });
  hooks = hooks || createHooks({ achievements: require('../../achievements'), reputation: require('../reputation-engine') });

  async function finishExam({ agentId, skillId, enrollmentId, classId }) {
    const ev = exams.evaluate({ agentId, skillId });
    if (!ev.ok) return ev;
    const skill = registry.get(skillId);
    if (!skill) return { ok: false, error: 'unknown or retired skill' };
    if (skill.hash !== ev.skillHash) return { ok: false, error: 'skill changed since the exam; retake with the new version' };
    const hw = homework.summary(agentId, skillId);
    const receipt = receipts.issue({
      agentId, skillId, skillHash: skill.hash, version: skill.version, track: skill.track, teacherId: skill.teacher.id,
      baseline: ev.baseline, exam: ev.exam, lift: ev.lift, passed: ev.passed, attempts: ev.attempts,
      homeworkRounds: hw.rounds, graderVersion: ev.graderVersion, tuitionTx: enrollmentId || null, examAttemptId: ev.examAttemptId, ts: now()
    });
    const settled = enrollmentId ? await tuition.settle({ enrollmentId, passed: ev.passed }) : { ok: true, split: null, skipped: true };
    if (!settled.ok) return settled;
    if (settled.replay) return { ok: true, passed: receipt.passed, receipt, split: settled.split, installed: false, replay: true };

    let installed = false; let classCompleted = false;
    if (ev.passed) {
      installed = installSkill({ operatives, operativeId: agentId, receipt, skill }).ok;
      hooks.passed({ agentId, skillId, lift: ev.lift, track: skill.track });
      hooks.taught({ teacherId: skill.teacher.id });
      if (hw.improved) hooks.homeworkImproved({ agentId, improvement: hw.improvement });
      if (classId) {
        const p = classes.recordPass({ classId, agentId, skillId });
        classCompleted = !!(p.ok && p.classComplete);
        if (p.ok && p.justCompleted) hooks.classCompleted({ agentId });
      }
    } else {
      hooks.failed({ agentId, skillId });
    }
    return { ok: true, passed: ev.passed, receipt, split: settled.split, installed, classCompleted };
  }

  return { store, registry, benchmarks, exams, receipts, homework, tuition, roles, classes, finishExam };
}

module.exports = { createAcademy };
