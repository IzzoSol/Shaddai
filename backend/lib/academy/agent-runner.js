'use strict';
// Runs the Academy loop for one of the owner's own agents (a forged operative): baseline WITHOUT the lesson, exam WITH it, finish.
// External bots run this loop themselves over /xagent; this is the same loop with the agent's own brain doing the work.
const crypto = require('crypto');
const { isSafeId } = require('./ids');

const fail = (stage, error, extra) => Object.assign({ ok: false, stage, error }, extra || {});

function lessonText(skill) {
  const L = skill.lesson; const out = ['SKILL LESSON (apply it to every task): ' + skill.name, L.prompt_template];
  if (L.tool_strategy.length) out.push('Tool strategy:\n' + L.tool_strategy.map((t) => '- ' + t.tool + ': use it when ' + t.when + '. ' + t.how).join('\n'));
  if (L.examples.length) out.push('Examples:\n' + L.examples.map((e, i) => (i + 1) + '. ' + e).join('\n'));
  if (L.checklist.length) out.push('Checklist:\n' + L.checklist.map((c) => '- ' + c).join('\n'));
  return out.join('\n\n');
}

const FORMAT = {
  tool_use: 'Respond with ONLY a JSON array of tool calls like [{"tool":"name","args":{"key":"value"}}]. Use only tools from the input catalog.',
  paper_trade: 'Respond with ONLY a JSON array of orders like [{"i":0,"side":"buy","qty":1}]. This is paper trading on a recorded tape.',
  checklist: 'Respond in plain text, concise, in complete sentences or the labeled lines the task asks for.',
  rubric: 'Respond in plain text.'
};

function parseOutput(grader, text) {
  const raw = String(text == null ? '' : text);
  if (grader === 'tool_use' || grader === 'paper_trade') {
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try { const v = JSON.parse(m[0]); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  return raw;
}

function createAgentRunner({ academy, operatives, chat }) {
  async function runAttempt({ op, skill, kind, enrollmentId, withLesson }) {
    const bench = academy.benchmarks.get(skill.benchmark.id, skill.benchmark.version);
    const begun = academy.exams.begin({ agentId: op.id, skillId: skill.id, kind, withSkill: kind === 'exam', enrollmentId });
    if (!begun.ok) return fail(kind, begun.error);
    const persona = op.brain && op.brain.persona ? '\n' + String(op.brain.persona).slice(0, 600) : '';
    const system = 'You are ' + String(op.codename || 'an agent').slice(0, 40) + ', an AI agent taking an exam at the SHADDAI Academy.' + persona +
      '\nAnswer exactly in the requested format. Do not add commentary.' + (withLesson ? '\n\n' + lessonText(skill) : '');
    try {
      const outputs = {};
      await Promise.all(begun.tasks.map(async (t) => {
        const user = 'Task [' + t.id + ']: ' + t.prompt + '\nInput: ' + JSON.stringify(t.input) + '\n' + (FORMAT[bench.grader] || FORMAT.checklist);
        const res = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.2, max_tokens: 700 });
        outputs[t.id] = parseOutput(bench.grader, typeof res === 'string' ? res : res && res.text);
      }));
      const sub = await academy.exams.submit({ attemptId: begun.attemptId, outputs });
      if (!sub.ok) return fail(kind, sub.error);
      return { ok: true, status: sub.status, score: sub.score };
    } catch (e) {
      academy.exams.abandon({ attemptId: begun.attemptId });       // never grade a partial or failed run: that would distort lift
      return fail(kind, 'model error: ' + ((e && e.message) || 'failed'));
    }
  }

  async function learn({ ownerId, agentId, skillId }) {
    if (!isSafeId(ownerId) || !isSafeId(agentId) || !isSafeId(skillId)) return fail('start', 'ownerId, agentId and skillId required');
    const op = operatives.get(agentId);
    if (!op || op.owner !== ownerId) return fail('start', 'that agent does not belong to you');
    const skill = academy.registry.get(skillId);
    if (!skill) return fail('start', 'unknown or retired skill');
    if ((op.skills || []).some((s) => s.skillId === skillId)) return fail('start', 'this agent already has that skill');
    const missing = academy.missingPrereqs(agentId, skillId);
    if (missing.length) return fail('start', 'requires skills this agent does not have yet: ' + missing.join(', '));

    let enr = academy.tuition.forAgent(agentId, skillId).find((e) => e.status === 'paid' && !academy.exams.enrollmentKinds(e.id).includes('exam'));
    if (!enr) {
      const e = await academy.tuition.enroll({ ownerId, agentId, skillId, windowId: 'w' + crypto.randomBytes(6).toString('hex') });
      if (!e.ok) return fail('enroll', e.error, { insufficient: !!e.insufficient });
      enr = e.enrollment;
    }

    const baseline = await runAttempt({ op, skill, kind: 'baseline', enrollmentId: enr.id, withLesson: false });
    if (!baseline.ok) return baseline;
    if (baseline.status !== 'graded') return { ok: true, pending: true, stage: 'baseline', status: baseline.status };
    const exam = await runAttempt({ op, skill, kind: 'exam', enrollmentId: enr.id, withLesson: true });
    if (!exam.ok) return exam;
    if (exam.status !== 'graded') return { ok: true, pending: true, stage: 'exam', status: exam.status };

    const done = await academy.finishExam({ agentId, skillId, enrollmentId: enr.id });
    if (!done.ok) return fail('finish', done.error);
    return {
      ok: true, passed: done.passed, installed: !!done.installed, baseline: done.receipt.baseline, exam: done.receipt.exam, lift: done.receipt.lift,
      receipt: done.receipt, enrollmentId: enr.id
    };
  }

  return { learn, lessonText };
}

module.exports = { createAgentRunner, lessonText, parseOutput };
