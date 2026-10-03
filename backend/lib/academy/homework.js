'use strict';
const { stripMarkup } = require('./canon');
const { gradeRubric } = require('./rubric');
const { hasSecret } = require('./secrets');
const { isSafeId } = require('./ids');
const { createLock } = require('./lock');

const err = (error) => ({ ok: false, error });

function capArgs(a) {                 // tool args go into every judge prompt: keep them small
  if (!a || typeof a !== 'object') return {};
  let s; try { s = JSON.stringify(a); } catch (_) { return {}; }
  return s.length > 1000 ? { truncated: true } : a;
}

function createHomework({ store, benchmarks, judge, now = Date.now, maxRounds = 3, minImprovement = 0.1 }) {
  const lock = createLock();
  const load = () => store.read('homework', { rounds: {} });
  const keyOf = (agentId, skillId) => agentId + '|' + skillId;
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : []);

  function summarize(rounds) {
    if (!rounds.length) return { rounds: 0, firstScore: null, bestScore: null, improvement: 0, improved: false };
    const first = rounds[0].score; const best = Math.max(...rounds.map((r) => r.score));
    return { rounds: rounds.length, firstScore: first, bestScore: best, improvement: best - first, improved: best - first >= minImprovement };
  }
  const summary = (agentId, skillId) => summarize(own(load().rounds, keyOf(agentId, skillId)));

  function submit({ agentId, skillId, rubricId, artifact, provenance }) {
    if (!isSafeId(agentId) || !isSafeId(skillId)) return Promise.resolve(err('agentId and skillId required'));
    if (!artifact || typeof artifact !== 'object') return Promise.resolve(err('artifact required'));
    if (!provenance || typeof provenance.prompt !== 'string' || !provenance.prompt.trim()) return Promise.resolve(err('provenance.prompt required'));
    if (hasSecret(artifact) || hasSecret(provenance)) return Promise.resolve(err('submission contains a secret-like value'));
    const rubric = benchmarks.rubric(rubricId);
    if (!rubric) return Promise.resolve(err('unknown rubric'));
    const clean = { kind: artifact.kind === 'image' ? 'image' : 'text' };
    if (artifact.text !== undefined) clean.text = stripMarkup(artifact.text).slice(0, 8000);
    if (artifact.url !== undefined) {
      if (!/^https:\/\/[^\s]+$/i.test(String(artifact.url))) return Promise.resolve(err('artifact url must be https'));
      clean.url = String(artifact.url).slice(0, 500);
    }
    if (clean.text === undefined && clean.url === undefined) return Promise.resolve(err('artifact needs text or url'));
    const prov = {
      prompt: stripMarkup(provenance.prompt).slice(0, 4000),
      tools: Array.isArray(provenance.tools) ? provenance.tools.slice(0, 20).map((t) => ({ tool: stripMarkup(t && t.tool).slice(0, 60), args: capArgs(t && t.args) })) : []
    };
    const k = keyOf(agentId, skillId);

    // Serialized per agent+skill: the round limit is checked and the round written under the same lock.
    return lock(k, async () => {
      const d0 = load();
      if (own(d0.rounds, k).length >= maxRounds) return err('round limit reached (' + maxRounds + ')');
      d0.tries = d0.tries || {};                // every judged attempt counts, even ones that end in review, so judge spend is bounded
      const n = Object.prototype.hasOwnProperty.call(d0.tries, k) ? d0.tries[k] : 0;
      if (n >= maxRounds * 2) return err('attempt limit reached (' + maxRounds * 2 + ')');
      d0.tries[k] = n + 1; store.write('homework', d0);
      const g = await gradeRubric({ rubric, submission: { artifact: clean, provenance: prov }, judge });
      if (g.status === 'needs_review') return { ok: false, status: 'needs_review', error: 'needs review' };
      const d = load();                         // re-read after the await: other agents' writes must survive
      const rounds = own(d.rounds, k).slice();
      const round = { n: rounds.length + 1, score: g.score, perCriterion: g.perCriterion, critique: g.critique, artifact: clean, provenance: prov, ts: now() };
      rounds.push(round); d.rounds[k] = rounds; store.write('homework', d);
      return { ok: true, round: round.n, score: g.score, critique: g.critique, summary: summarize(rounds) };
    });
  }

  return { submit, summary, _dump: () => load() };
}

module.exports = { createHomework };
