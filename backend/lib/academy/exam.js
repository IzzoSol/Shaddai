'use strict';
const { hashOf, stripMarkup } = require('./canon');
const { GRADERS, clamp01 } = require('./graders');
const { gradeRubric } = require('./rubric');
const { hasSecret } = require('./secrets');
const { isSafeId, hasOwn } = require('./ids');

const err = (error) => ({ ok: false, error });
const MAX_OUT = 20000;   // serialized size cap for one task output

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

// One task output -> { value } safe to grade, or { rejected } when it must not reach a grader or a judge.
function cleanOutput(out) {
  if (out === undefined || out === null) return { value: null };
  if (hasSecret(out)) return { rejected: 'secret' };
  let s;
  try { s = JSON.stringify(out); } catch (_) { return { value: null }; }
  if (s === undefined || s.length > MAX_OUT) return { value: null, oversized: true };
  return { value: typeof out === 'string' ? stripMarkup(out).slice(0, 8000) : out };
}

function createExamService({ store, registry, benchmarks, judge, now = Date.now, cooldownMs = 10 * 60 * 1000, dailyCap = 5, windowMs = 30 * 60 * 1000 }) {
  const load = () => store.read('attempts', { attempts: {}, nextSeq: 1 });
  const history = (d, agentId, skillId) => Object.values(d.attempts)
    .filter((a) => a.agentId === agentId && a.skillId === skillId).sort((x, y) => x.seq - y.seq);
  const benchOf = (a) => { const [id, ver] = a.benchmark.split('@'); return benchmarks.get(id, ver); };

  function begin({ agentId, skillId, kind, withSkill, enrollmentId }) {
    if (!isSafeId(agentId)) return err('agentId required');
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
    if (enrollmentId !== undefined) {             // one tuition payment covers one baseline and one exam
      if (!isSafeId(enrollmentId)) return err('invalid enrollment');
      if (Object.values(d.attempts).some((x) => x.enrollmentId === enrollmentId && x.kind === kind)) return err('this enrollment already has a ' + kind + ' attempt; enroll again');
    }
    if (kind === 'exam' && !h.some((a) => a.kind === 'baseline' && a.status === 'graded' && a.skillHash === skill.hash)) return err('a graded baseline is required first');
    const seq = d.nextSeq || 1;
    const seed = [agentId, skillId, skill.hash, kind, h.length].join('|');
    const tasks = sample(bench.tasks, bench.perAttempt, seed);
    const id = 'att_' + hashOf({ seed, t, seq }).slice(0, 16);
    d.attempts[id] = {
      id, agentId, skillId, skillHash: skill.hash, benchmark: bench.id + '@' + bench.version, kind, seq, enrollmentId: enrollmentId || null,
      withSkill: !!withSkill, taskIds: tasks.map((x) => x.id), startedAt: t, expiresAt: t + windowMs, status: 'open'
    };
    d.nextSeq = seq + 1;
    store.write('attempts', d);
    return { ok: true, attemptId: id, expiresAt: t + windowMs, tasks: tasks.map(benchmarks.publicTask) };
  }

  async function gradeAll(a, outputs) {
    const bench = benchOf(a);
    const outs = outputs && typeof outputs === 'object' ? outputs : {};
    const perTask = []; let needsReview = false; const kept = {};
    for (const tid of a.taskIds) {
      const task = bench.tasks.find((x) => x.id === tid);
      const c = cleanOutput(hasOwn(outs, tid) ? outs[tid] : undefined);
      kept[tid] = c.value === undefined ? null : c.value;
      if (c.rejected) { perTask.push({ taskId: tid, score: 0, status: 'rejected' }); continue; }
      if (bench.grader === 'rubric') {
        if (c.value === null) { perTask.push({ taskId: tid, score: 0, status: 'graded' }); continue; }   // nothing usable: no judge spend
        const r = await gradeRubric({ rubric: bench.rubric, submission: { task: task.prompt, output: c.value }, judge });
        if (r.status === 'needs_review') { needsReview = true; perTask.push({ taskId: tid, score: null, status: 'needs_review' }); }
        else perTask.push({ taskId: tid, score: r.score, status: 'graded' });
      } else {
        let score = 0;
        try { score = clamp01(GRADERS[bench.grader](task.input, task.spec, c.value).score); } catch (_) { score = 0; }
        perTask.push({ taskId: tid, score, status: 'graded' });
      }
    }
    if (needsReview) return { status: 'needs_review', score: null, perTask, outputs: kept };
    return { status: 'graded', score: perTask.reduce((s, p) => s + p.score, 0) / perTask.length, perTask };
  }

  async function submit({ attemptId, outputs }) {
    if (!isSafeId(attemptId)) return err('unknown attempt');
    const d = load();
    const a = hasOwn(d.attempts, attemptId) ? d.attempts[attemptId] : null;
    if (!a) return err('unknown attempt');
    if (a.status !== 'open') return err('attempt already ' + a.status);
    if (now() > a.expiresAt) { a.status = 'expired'; store.write('attempts', d); return err('attempt expired'); }
    a.status = 'grading';                       // claim synchronously, before any await: a second submit sees 'grading'
    store.write('attempts', d);
    let result;
    try { result = await gradeAll(a, outputs); } catch (_) { result = { status: 'needs_review', score: null, perTask: [] }; }
    const d2 = load();                          // re-read after the await so concurrent writes are never overwritten
    const a2 = d2.attempts[attemptId];
    a2.perTask = result.perTask; a2.submittedAt = now(); a2.status = result.status; a2.score = result.score;
    if (result.status === 'needs_review') a2.outputs = result.outputs || {};      // sanitized, kept only so an admin can review
    store.write('attempts', d2);
    return { ok: true, status: a2.status, score: a2.score, perTask: a2.perTask };
  }

  function evaluate({ agentId, skillId }) {
    if (!isSafeId(agentId)) return err('agentId required');
    const d = load(); const h = history(d, agentId, skillId);
    const exam = h.filter((a) => a.kind === 'exam' && a.status === 'graded').pop();
    if (!exam) return err('no graded exam');
    const bases = h.filter((a) => a.kind === 'baseline' && a.status === 'graded' && a.skillHash === exam.skillHash && a.seq < exam.seq);
    if (!bases.length) return err('no matching baseline');
    const base = bases.reduce((best, b) => (b.score > best.score ? b : best), bases[0]);   // best prior baseline: re-sandbagging cannot inflate lift
    const bench = benchOf(exam);
    const lift = exam.score - base.score;
    const passed = exam.score >= bench.passMark && lift >= bench.minLift;
    return {
      ok: true, passed, lift, baseline: base.score, exam: exam.score,
      examAttemptId: exam.id, baselineAttemptId: base.id, skillHash: exam.skillHash, enrollmentId: exam.enrollmentId || null,
      graderVersion: exam.benchmark, attempts: h.length
    };
  }

  // Safe public view of one attempt: no outputs, no answer data.
  function get(attemptId) {
    if (!isSafeId(attemptId)) return null;
    const d = load();
    if (!hasOwn(d.attempts, attemptId)) return null;
    const a = d.attempts[attemptId];
    return { id: a.id, agentId: a.agentId, skillId: a.skillId, kind: a.kind, status: a.status, expiresAt: a.expiresAt, taskIds: a.taskIds.slice() };
  }

  // Admin review queue for attempts the judges could not agree on.
  function needsReview() {
    const d = load();
    return Object.values(d.attempts).filter((a) => a.status === 'needs_review').sort((x, y) => x.seq - y.seq).map((a) => {
      const bench = benchOf(a);
      return {
        attemptId: a.id, agentId: a.agentId, skillId: a.skillId, benchmark: a.benchmark, kind: a.kind,
        tasks: a.perTask.filter((p) => p.status === 'needs_review').map((p) => {
          const task = bench ? bench.tasks.find((x) => x.id === p.taskId) : null;
          return { taskId: p.taskId, prompt: task ? task.prompt : '', output: hasOwn(a.outputs || {}, p.taskId) ? a.outputs[p.taskId] : null };
        })
      };
    });
  }

  // An admin supplies the 0..1 score for every task that was stuck in review.
  function resolve({ attemptId, by, taskScores }) {
    if (!isSafeId(attemptId) || !isSafeId(by)) return err('attemptId and by required');
    const d = load();
    if (!hasOwn(d.attempts, attemptId)) return err('unknown attempt');
    const a = d.attempts[attemptId];
    if (a.status !== 'needs_review') return err('attempt is not awaiting review');
    const pending = a.perTask.filter((p) => p.status === 'needs_review').map((p) => p.taskId);
    if (!pending.length) return err('nothing to resolve: the attempt has no review tasks');
    const given = taskScores && typeof taskScores === 'object' ? Object.keys(taskScores) : [];
    if (given.some((k) => !pending.includes(k))) return err('score given for a task that is not in review');
    for (const tid of pending) {
      const v = hasOwn(taskScores || {}, tid) ? taskScores[tid] : undefined;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return err('every review task needs a score between 0 and 1');
    }
    for (const p of a.perTask) if (p.status === 'needs_review') { p.score = taskScores[p.taskId]; p.status = 'graded'; }
    a.score = a.perTask.reduce((s, p) => s + p.score, 0) / a.perTask.length;
    a.status = 'graded'; a.resolvedBy = by; a.resolvedAt = now(); delete a.outputs;
    store.write('attempts', d);
    return { ok: true, score: a.score };
  }

  // Which kinds ('baseline' / 'exam') an enrollment has already used.
  function enrollmentKinds(enrollmentId) {
    return Object.values(load().attempts).filter((a) => a.enrollmentId === enrollmentId).map((a) => a.kind);
  }

  return { begin, submit, evaluate, get, needsReview, resolve, enrollmentKinds };
}

module.exports = { createExamService, sample, cleanOutput };
