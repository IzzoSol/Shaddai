'use strict';

function createHooks({ achievements, reputation }) {
  const safe = (fn) => { try { return fn(); } catch (_) { return null; } };
  return {
    passed({ agentId, skillId, lift, track }) {
      safe(() => achievements.recordEvent(agentId, 'academy_skill_passed', { lift, track }));
      safe(() => reputation.record({ agent: agentId, outcome: true, tool: 'academy:' + skillId, task: 'exam passed' }));
    },
    failed({ agentId, skillId }) {
      safe(() => reputation.record({ agent: agentId, outcome: false, tool: 'academy:' + skillId, task: 'exam failed' }));
    },
    homeworkImproved({ agentId, improvement }) { safe(() => achievements.recordEvent(agentId, 'academy_homework_improved', { improvement })); },
    taught({ teacherId }) { safe(() => achievements.recordEvent(teacherId, 'academy_taught', {})); },
    classCompleted({ agentId }) { safe(() => achievements.recordEvent(agentId, 'academy_class_completed', {})); }
  };
}

module.exports = { createHooks };
