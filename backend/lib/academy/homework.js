'use strict';
const { stripMarkup } = require('./canon');
const { gradeRubric } = require('./rubric');

const SECRET_KEY = /private|secret|seed|mnemonic|password|api_?key/i;
const SECRET_VAL = /\bsk-[a-z0-9]{8,}|\bxai-[a-z0-9]{8,}|\b[0-9a-f]{64}\b/i;
const err = (error) => ({ ok: false, error });

function hasSecret(v) {
  if (typeof v === 'string') return SECRET_VAL.test(v);
  if (v && typeof v === 'object') return Object.keys(v).some((k) => SECRET_KEY.test(k) || hasSecret(v[k]));
  return false;
}

function createHomework({ store, benchmarks, judge, now = Date.now, maxRounds = 3, minImprovement = 0.1 }) {
  const load = () => store.read('homework', { rounds: {} });
  const keyOf = (agentId, skillId) => agentId + '|' + skillId;

  function summarize(rounds) {
    if (!rounds.length) return { rounds: 0, firstScore: null, bestScore: null, improvement: 0, improved: false };
    const first = rounds[0].score; const best = Math.max(...rounds.map((r) => r.score));
    return { rounds: rounds.length, firstScore: first, bestScore: best, improvement: best - first, improved: best - first >= minImprovement };
  }
  const summary = (agentId, skillId) => summarize(load().rounds[keyOf(agentId, skillId)] || []);

  async function submit({ agentId, skillId, rubricId, artifact, provenance }) {
    if (!agentId || !skillId) return err('agentId and skillId required');
    if (!artifact || typeof artifact !== 'object') return err('artifact required');
    if (!provenance || typeof provenance.prompt !== 'string' || !provenance.prompt.trim()) return err('provenance.prompt required');
    if (hasSecret(artifact) || hasSecret(provenance)) return err('submission contains a secret-like value');
    const rubric = benchmarks.rubric(rubricId);
    if (!rubric) return err('unknown rubric');
    const clean = { kind: artifact.kind === 'image' ? 'image' : 'text' };
    if (artifact.text !== undefined) clean.text = stripMarkup(artifact.text).slice(0, 8000);
    if (artifact.url !== undefined) {
      if (!/^https:\/\/[^\s]+$/i.test(String(artifact.url))) return err('artifact url must be https');
      clean.url = String(artifact.url).slice(0, 500);
    }
    if (clean.text === undefined && clean.url === undefined) return err('artifact needs text or url');
    const prov = {
      prompt: stripMarkup(provenance.prompt).slice(0, 4000),
      tools: Array.isArray(provenance.tools) ? provenance.tools.slice(0, 20).map((t) => ({ tool: stripMarkup(t && t.tool).slice(0, 60), args: t && t.args && typeof t.args === 'object' ? t.args : {} })) : []
    };

    const d = load(); const k = keyOf(agentId, skillId);
    const rounds = d.rounds[k] || [];
    if (rounds.length >= maxRounds) return err('round limit reached (' + maxRounds + ')');

    const g = await gradeRubric({ rubric, submission: { artifact: clean, provenance: prov }, judge });
    if (g.status === 'needs_review') return { ok: false, status: 'needs_review', error: 'needs review' };

    const round = { n: rounds.length + 1, score: g.score, perCriterion: g.perCriterion, critique: g.critique, artifact: clean, provenance: prov, ts: now() };
    rounds.push(round); d.rounds[k] = rounds; store.write('homework', d);
    return { ok: true, round: round.n, score: g.score, critique: g.critique, summary: summarize(rounds) };
  }

  return { submit, summary, _dump: () => load() };
}

module.exports = { createHomework };
