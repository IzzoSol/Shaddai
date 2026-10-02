'use strict';
const { hashOf } = require('./canon');
const { GRADERS, clamp01 } = require('./graders');
const { gradeRubric } = require('./rubric');

const err = (error) => ({ ok: false, error });

function seedFrom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample(arr, n, seedStr) {
  const rng = mulberry32(seedFrom(seedStr)); const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

function createExamService({ store, registry, benchmarks, judge, now = Date.now, cooldownMs = 10 * 60 * 1000, dailyCap = 5, windowMs = 30 * 60 * 1000 }) {
  const load = () => store.read('attempts', { attempts: {} });
  const history = (d, agentId, skillId) => Object.values(d.attempts)
    .filter((a) => a.agentId === agentId && a.skillId === skillId).sort((x, y) => x.seq - y.seq);
  const benchOf = (a) => { const [id, ver] = a.benchmark.split('@'); return benchmarks.get(id, ver); };

  function begin({ agentId, skillId, kind, withSkill }) {
    if (!agentId || typeof agentId !== 'string') return err('agentId required');
    if (kind !== 'baseline' && kind !== 'exam') return err('kind must be baseline or exam');
    if (kind === 'baseline' && withSkill) return err('baseline must be taken without the skill');
    if (kind === 'exam' && !withSkill) return err('exam must be taken with the skill installed');
    const skill = registry.get(skillId);
    if (!skill) return err('unknown or retired skill');
    const bench = benchmarks.get(skill.benchmark.id, skill.benchmark.version);
    if (!bench) return err('benchmark missing');
    const d = load(); const h = history(d, agentId, skillId); const t = now();
    if (h.filter((a) => t - a.startedAt < 86400000).length >= dailyCap) return err('daily attempt cap reached');
    const last = h.filter((a) => a.kind === kind).pop();
    if (last && t - last.startedAt < cooldownMs) return err('cooldown active');
    if (kind === 'exam' && !h.some((a) => a.kind === 'baseline' && a.status === 'graded' && a.skillHash === skill.hash)) return err('a graded baseline is required first');
    const seed = [agentId, skillId, skill.hash, kind, h.length].join('|');
    const tasks = sample(bench.tasks, bench.perAttempt, seed);
    const id = 'att_' + hashOf({ seed, t }).slice(0, 16);
    d.attempts[id] = {
      id, agentId, skillId, skillHash: skill.hash, benchmark: bench.id + '@' + bench.version, kind, seq: Object.keys(d.attempts).length,
      withSkill: !!withSkill, taskIds: tasks.map((x) => x.id), startedAt: t, expiresAt: t + windowMs, status: 'open'
    };
    store.write('attempts', d);
    return { ok: true, attemptId: id, expiresAt: t + windowMs, tasks: tasks.map(benchmarks.publicTask) };
  }

  async function submit({ attemptId, outputs }) {
    const d = load(); const a = d.attempts[attemptId];
    if (!a) return err('unknown attempt');
    if (a.status !== 'open') return err('attempt already ' + a.status);
    if (now() > a.expiresAt) { a.status = 'expired'; store.write('attempts', d); return err('attempt expired'); }
    const bench = benchOf(a);
    const outs = outputs && typeof outputs === 'object' ? outputs : {};
    const perTask = []; let needsReview = false;
    for (const tid of a.taskIds) {
      const task = bench.tasks.find((x) => x.id === tid);
      const out = outs[tid];
      if (bench.grader === 'rubric') {
        const r = await gradeRubric({ rubric: bench.rubric, submission: { task: task.prompt, output: out }, judge });
        if (r.status === 'needs_review') { needsReview = true; perTask.push({ taskId: tid, score: null, status: 'needs_review' }); }
        else perTask.push({ taskId: tid, score: r.score, status: 'graded' });
      } else {
        let score = 0;
        try { score = clamp01(GRADERS[bench.grader](task.input, task.spec, out).score); } catch (_) { score = 0; }
        perTask.push({ taskId: tid, score, status: 'graded' });
      }
    }
    a.perTask = perTask; a.submittedAt = now();
    if (needsReview) { a.status = 'needs_review'; a.score = null; }
    else { a.status = 'graded'; a.score = perTask.reduce((s, p) => s + p.score, 0) / perTask.length; }
    store.write('attempts', d);
    return { ok: true, status: a.status, score: a.score, perTask };
  }

  function evaluate({ agentId, skillId }) {
    const d = load(); const h = history(d, agentId, skillId);
    const exam = h.filter((a) => a.kind === 'exam' && a.status === 'graded').pop();
    if (!exam) return err('no graded exam');
    const base = h.filter((a) => a.kind === 'baseline' && a.status === 'graded' && a.skillHash === exam.skillHash && a.seq < exam.seq).pop();
    if (!base) return err('no matching baseline');
    const bench = benchOf(exam);
    const lift = exam.score - base.score;
    const passed = exam.score >= bench.passMark && lift >= bench.minLift;
    return {
      ok: true, passed, lift, baseline: base.score, exam: exam.score,
      examAttemptId: exam.id, baselineAttemptId: base.id, skillHash: exam.skillHash,
      graderVersion: exam.benchmark, attempts: h.length
    };
  }

  return { begin, submit, evaluate };
}

module.exports = { createExamService, sample };
