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
const { isSafeId, hasOwn } = require('./ids');

const err = (error) => ({ ok: false, error });

function createAcademy({ dir, economy, operatives, judge, hooks, now = Date.now, adminIds, receiptKey }) {
  const store = createStore(dir);
  const registry = createRegistry(store);
  const benchmarks = createBenchmarks(store);
  const exams = createExamService({ store, registry, benchmarks, judge, now });
  const receipts = createReceipts({ store, key: receiptKey });
  const homework = createHomework({ store, benchmarks, judge, now });
  const ownerOfAgent = (agentId) => { const op = isSafeId(agentId) ? operatives.get(agentId) : null; return (op && op.owner) || null; };
  const teacherOwnerOf = (skill) => {
    if (skill.teacher.type === 'owner') return skill.teacher.id;
    if (skill.teacher.type === 'operative') return ownerOfAgent(skill.teacher.id);
    return null;                                    // house faculty
  };
  const tuition = createAcademyEconomy({ economy, store, getSkill: registry.get, ownerOfAgent, teacherOwnerOf });
  const roles = createRoles({ store, adminIds, now });
  const classes = createClasses({ store, registry, roles });
  hooks = hooks || createHooks({ achievements: require('../../achievements'), reputation: require('../reputation-engine') });

  const loadDone = () => store.read('finished', { byExam: {}, byEnrollment: {}, conferred: {} });

  async function finishExam({ agentId, skillId, enrollmentId, classId }) {
    if (!isSafeId(agentId) || !isSafeId(skillId)) return err('agentId and skillId required');
    const enr = tuition.get(enrollmentId);
    if (!enr || enr.agentId !== agentId || enr.skillId !== skillId || ownerOfAgent(agentId) !== enr.ownerId) {
      return err('enrollment does not match this agent and skill');
    }
    const ev = exams.evaluate({ agentId, skillId });
    if (!ev.ok) return ev;
    const skill = registry.get(skillId);
    if (!skill) return err('unknown or retired skill');
    if (skill.hash !== ev.skillHash) return err('skill changed since the exam; retake with the new version');
    if (ev.enrollmentId && ev.enrollmentId !== enr.id) return err('that exam was taken under a different enrollment'); 

    let done = loadDone();
    if (hasOwn(done.byEnrollment, enr.id) && done.byEnrollment[enr.id] !== ev.examAttemptId) {
      return err('enrollment already used; enroll again for another attempt');
    }
    const receipt = receipts.issue({
      agentId, skillId, skillHash: skill.hash, version: skill.version, track: skill.track, teacherId: skill.teacher.id,
      baseline: ev.baseline, exam: ev.exam, lift: ev.lift, passed: ev.passed, attempts: ev.attempts,
      homeworkRounds: homework.summary(agentId, skillId).rounds, graderVersion: ev.graderVersion,
      tuitionTx: enr.id, examAttemptId: ev.examAttemptId, ts: now()
    });
    const settled = await tuition.settle({ enrollmentId: enr.id, passed: ev.passed });   // idempotent
    if (!settled.ok) return settled;

    // Install is idempotent, so it also runs on a retry after a crash. Events fire at most once per exam attempt.
    const installed = ev.passed ? installSkill({ operatives, operativeId: agentId, receipt, skill, receipts }).ok : false;
    done = loadDone();
    if (hasOwn(done.byExam, ev.examAttemptId)) {
      return { ok: true, passed: ev.passed, receipt, split: settled.split, installed, replay: true };
    }
    let classCompleted = false;
    const conferKey = agentId + '|' + skillId;
    if (ev.passed) {
      if (!hasOwn(done.conferred, conferKey)) {               // re-passing a skill never earns XP or teacher credit again
        hooks.passed({ agentId, skillId, lift: ev.lift, track: skill.track });
        hooks.taught({ teacherId: skill.teacher.id });
        const hw = homework.summary(agentId, skillId);
        if (hw.improved) hooks.homeworkImproved({ agentId, improvement: hw.improvement });
        done.conferred[conferKey] = true;
      }
      if (classId) {
        const p = classes.recordPass({ classId, agentId, skillId });
        classCompleted = !!(p.ok && p.classComplete);
        if (p.ok && p.justCompleted) hooks.classCompleted({ agentId });
      }
    } else {
      hooks.failed({ agentId, skillId });
    }
    done.byExam[ev.examAttemptId] = true;
    done.byEnrollment[enr.id] = ev.examAttemptId;
    store.write('finished', done);
    return { ok: true, passed: ev.passed, receipt, split: settled.split, installed, classCompleted };
  }

  return { store, registry, benchmarks, exams, receipts, homework, tuition, roles, classes, finishExam };
}

module.exports = { createAcademy };
