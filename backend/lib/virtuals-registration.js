'use strict';
/*
 * virtuals-registration.js — ZEROX's Virtuals ACP activation + job pump.
 *
 * Honest scope. There is NO "register via API" endpoint in Virtuals ACP — an
 * agent is activated through the web dashboard (app.virtuals.io/acp/agents →
 * Settings → Generate API), which mints the VIRTUALS_API_KEY. So this module
 * does NOT invent a /agents/register call (a guessed endpoint just fails and
 * could misleadingly appear "done"). What it DOES do, against the real,
 * documented ACP endpoints the MCP already uses:
 *
 *   1. status()      → read-only diagnosis: is the key registered? founder/404?
 *   2. listJobs()    → GET  /acp/jobs           (pending work — escrow already sold)
 *   3. completeJob() → POST /acp/jobs           (report a finished deliverable)
 *
 * All calls fail closed and return { ok, ... } objects — never throw, never move
 * money. Activation itself remains a one-time dashboard step you perform once.
 */

const ACS = () => (process.env.VIRTUALS_ACP_BASE || 'https://claw-api.virtuals.io').replace(/\/+$/, '');
const KEY = () => String(process.env.VIRTUALS_API_KEY || process.env.VIRTUALS_ACP_KEY || '').trim();

async function acp(method, path, body) {
  const k = KEY();
  if (!k) return { ok: false, error: 'VIRTUALS_API_KEY not set in backend/.env — activate at https://app.virtuals.io/acp/agents first.' };
  try {
    const r = await fetch(ACS() + path, {
      method,
      headers: { 'x-api-key': k, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const txt = await r.text().catch(() => '');
    let j = {};
    try { j = txt ? JSON.parse(txt) : {}; } catch (_) { j = { raw: txt.slice(0, 200) }; }
    return { ok: r.ok, status: r.status, ...j };
  } catch (e) {
    return { ok: false, error: 'request failed: ' + ((e && e.message) || e) };
  }
}

// Read-only registration/identity diagnosis. Returns a clear, actionable status.
async function status() {
  const k = KEY();
  if (!k) {
    return {
      keySet: false,
      registered: false,
      detail: 'VIRTUALS_API_KEY not set. Activate the agent at https://app.virtuals.io/acp/agents (Settings → Generate API), then set VIRTUALS_API_KEY in backend/.env.',
    };
  }
  const me = await acp('GET', '/acp/me');
  if (!me.ok || me.status === 404) {
    return {
      keySet: true,
      registered: false,
      status: me.status || null,
      detail: me.status === 404
        ? 'Key present but no ACP agent matches it → register/activate the agent at https://app.virtuals.io/acp/agents. 404 "Agent not found" is the expected state until you do that dashboard step (it is NOT a code bug).'
        : ('ACP /acp/me returned ' + me.status + ': ' + ((me.error && me.error.message) || me.detail || JSON.stringify(me).slice(0, 200))),
    };
  }
  const info = me.data && !Array.isArray(me.data) && typeof me.data === 'object' ? me.data : me;
  return {
    keySet: true,
    registered: !!(info.agent || info.agentId || info.id),
    status: me.status,
    identity: {
      agent: info.agent || info.agentId || info.name || info.id || null,
      walletAddress: info.walletAddress || info.wallet || null,
      tokenSymbol: info.tokenSymbol || null,
    },
    detail: 'registered',
  };
}

// List pending ACP jobs (escrow already sold) the agent still owes deliverables for.
async function listJobs() {
  return acp('GET', '/acp/jobs');
}

// Report a job's deliverable back to ACP (completes escrow release).
async function completeJob(jobId, resultData) {
  if (!jobId) return { ok: false, error: 'job id required' };
  return acp('POST', '/acp/jobs', { jobId, result: resultData, status: 'completed' });
}

module.exports = { status, listJobs, completeJob, acp };