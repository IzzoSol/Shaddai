/**
 * SHADDAI OPERATIVE — Generic x402 Monetized Endpoint
 * ---------------------------------------------------------------
 * Turns ANY forged SHADDAI operative into a paid, callable endpoint.
 * The caller passes ?agent=<CODENAME>&task=<what to do>; the operative runs the
 * task via a live agent, and every call settles USDC on Base through Bankr's x402 layer.
 *
 * Non-blocking job pattern (per Bankr standards — fast + deterministic):
 *   1. First call → creates a job, kicks bankr.askAgent() in the background, returns { jobId }.
 *   2. Poll call ?agent=..&job=<id> → returns { status:'running' } or { status:'done', result }.
 * No request blocks on the agent run. No hardcoded secrets.
 *
 * Only agents PUBLISHED via the SHADDAI Monetize app (appKV key `shaddai:monetized:<CODENAME>`)
 * are callable — otherwise 402.
 *
 * Injected globals (Bankr runtime): appKV, http, bankr, secrets
 */

const JOB_TTL_HINT = '15m';   // jobs are short-lived; results read once and can expire

async function getJSON(key) {
  try { const raw = await appKV.get(key); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}

export default async function handler(req) {
  const q = (req && req.query) || {};
  const agent = String(q.agent || '').trim().toUpperCase();

  // ── Poll branch: fetch a running/finished job ──
  const job = String(q.job || '').trim();
  if (job) {
    const r = await getJSON('shaddai:job:' + job);
    if (!r) return { status: 404, body: { ok: false, error: 'unknown or expired job' } };
    return { status: 200, body: { ok: true, ...r } };
  }

  // ── Kick branch: start a paid agent run ──
  const task = String(q.task || q.q || '').trim();
  if (!agent) return { status: 400, body: { ok: false, error: 'agent (CODENAME) required' } };
  if (!task)  return { status: 400, body: { ok: false, error: 'task/q required' } };

  let cfg = await getJSON('shaddai:monetized:' + agent);
  // Fallback: SHADDAI-native publish (operative.monetized set via the SHADDAI Monetize page).
  if (!cfg || !cfg.published) {
    try {
      const base = (secrets.SHADDAI_API_URL || '').replace(/\/$/, '');
      if (base) {
        const res = await http.fetch(base + '/api/operatives');
        const j = await res.json();
        const op = ((j && j.operatives) || []).find((o) => String(o.codename || '').toUpperCase() === agent && o.monetized);
        if (op) cfg = { published: true, price: op.monetizePrice || 0.02 };
      }
    } catch (_) {}
  }
  if (!cfg || !cfg.published) {
    return { status: 402, body: { ok: false, error: 'this operative is not published for x402 — publish it in the SHADDAI Monetize page' } };
  }

  const jobId = 'j_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await appKV.set('shaddai:job:' + jobId, JSON.stringify({
    status: 'running', agent, task, startedAt: new Date().toISOString(),
  }));

  // Fire-and-forget: the live operative does the work; store the result when done.
  try {
    bankr.askAgent({
      agent,
      task,
      onResult: async (out) => {
        const result = typeof out === 'string' ? out : (out && (out.text || out.result)) || '';
        try {
          await appKV.set('shaddai:job:' + jobId, JSON.stringify({
            status: 'done', agent, task, result, finishedAt: new Date().toISOString(),
          }));
        } catch (_) {}
      },
    });
  } catch (e) {
    await appKV.set('shaddai:job:' + jobId, JSON.stringify({ status: 'error', error: String(e && e.message || e) }));
  }

  return {
    status: 200,
    body: {
      ok: true,
      jobId,
      status: 'running',
      poll: `?agent=${agent}&job=${jobId}`,
      note: `Poll the URL above to get the result. Jobs are short-lived (~${JOB_TTL_HINT}).`,
    },
  };
}
