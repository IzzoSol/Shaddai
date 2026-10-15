'use strict';
const { KINDS } = require('./graders');
const { isSafeId } = require('./ids');

const ID = /^[a-z0-9][a-z0-9-]{2,48}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function createBenchmarks(store) {
  const load = () => store.read('benchmarks', { items: {}, rubrics: {} });

  function register(b) {
    if (!b || typeof b !== 'object') return { ok: false, errors: ['benchmark must be an object'] };
    const errors = [];
    if (!ID.test(String(b.id || ''))) errors.push('id invalid');
    if (!SEMVER.test(String(b.version || ''))) errors.push('version invalid');
    if (!KINDS.includes(b.grader)) errors.push('grader must be one of ' + KINDS.join(','));
    if (!(b.passMark >= 0 && b.passMark <= 1)) errors.push('passMark must be 0..1');
    if (!(b.minLift >= 0 && b.minLift <= 1)) errors.push('minLift must be 0..1');
    if (!Number.isInteger(b.perAttempt) || b.perAttempt < 1) errors.push('perAttempt must be a positive integer');
    if (!Array.isArray(b.tasks) || b.tasks.length < (b.perAttempt || 1)) errors.push('tasks must have at least perAttempt entries');
    else {
      const seen = new Set();
      for (const t of b.tasks) {
        if (!t || !isSafeId(t.id) || typeof t.prompt !== 'string' || seen.has(t.id)) { errors.push('each task needs a unique safe id and a prompt'); break; }
        seen.add(t.id);
      }
    }
    if (b.grader === 'rubric' && !(b.rubric && Array.isArray(b.rubric.criteria) && b.rubric.criteria.length)) errors.push('rubric.criteria required for the rubric grader');
    if (errors.length) return { ok: false, errors };
    const d = load();
    const key = b.id + '@' + b.version;
    if (d.items[key]) return { ok: false, errors: ['benchmark version already registered (immutable)'] };
    d.items[key] = JSON.parse(JSON.stringify(b));
    store.write('benchmarks', d);
    return { ok: true };
  }

  function get(id, version) { return load().items[id + '@' + version] || null; }
  function publicTask(t) { return { id: t.id, prompt: t.prompt, input: t.input === undefined ? null : t.input }; }

  function registerRubric(r) {
    if (!r || !ID.test(String(r.id || '')) || !Array.isArray(r.criteria) || !r.criteria.length ||
      !r.criteria.every((c) => c && typeof c.id === 'string' && Number.isFinite(c.max) && c.max > 0)) {
      return { ok: false, errors: ['rubric needs id and criteria[{id,name,max}]'] };
    }
    const d = load(); d.rubrics[r.id] = JSON.parse(JSON.stringify(r)); store.write('benchmarks', d);
    return { ok: true };
  }
  function rubric(id) { return load().rubrics[id] || null; }

  return { register, get, publicTask, registerRubric, rubric };
}

module.exports = { createBenchmarks };
