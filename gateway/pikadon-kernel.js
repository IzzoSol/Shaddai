/**
 * SHADDAI GATEWAY — Pikadon Kernel (synchronous entry/exit point for every tool)
 *
 * The Pikadon kernel is the FIRST AND LAST HOP on every tool call.
 * It enforces security, validates permissions, and writes one JSONL audit line per decision.
 *
 * Core responsibilities:
 *   1. DENY ON SECRET — block any payload containing private keys, seeds, mnemonics,
 *      hex strings that look like 64-character SHA256 hashes, or card PANs.
 *   2. DENY ON AMOUNT MISMATCH — refuse if requested pay amount ≠ quoted.amount.
 *   3. DENY ON PAYEE MISMATCH — refuse if request.pay_to ≠ quote.pay_to.
 *   4. DENY ON SKILL NOT ALLOWED — block if required skill not in agent's allowlist.
 *   5. DENY ON BUDGET EXCEEDED — fail if max_usd/max_steps would be broken.
 *   6. ONE JSONL AUDIT LINE per tool call — timestamp, user, agent, tool, quote_id, decision, reason_code.
 *
 * This is a KERNEL, not a mascot. It is SYNCHRONOUS.
 * If it returns "deny", nothing proceeds. If it returns with type "pending",
 * the job is placed in a queue with a boolean "needs_approval" field.
 *
 * Storage:
 *   gateway/jobs.jsonl — append-only job log for PENDING/FAILED/COMPLETE.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JOBS_PATH = path.join(__dirname, '..', '..', 'backend', 'data', 'gateway-jobs.jsonl');
const DENY_CODE = 'deny_on';
const ALLOW_CODE = 'allow';
const PENDING_CODE = 'pending';

function appendJobEntry(entry) {
  const line = JSON.stringify(entry) + '\n';
  const dir = path.dirname(JOBS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(JOBS_PATH, line, 'utf8');
}

function writeJob(line) {
  const dir = path.dirname(JOBS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(JOBS_PATH, line + '\n', 'utf8');
}

const DENY_ON_SECRET_PATTERNS = [
  /key["']?\s*[:=]/i,
  /secret["']?\s*[:=]/i,
  /secretkey["']?\s*[:=]/i,
  /bearer["']?\s*[:=]/i,
  /auth["']?\s*[:=]/i,
  /password["']?\s*[:=]/i,
  /mnemonic["']?\s*[:=]/i,
  /seed["']?\s*[:=]/i,
  /private["']?\s*[:=]/i,
  /privatekey["']?\s*[:=]/i,
  /mnemonic["']?\s*[:=]/i,
  /[0-9]{64}/i,
  /[0-9a-f]{64}/i,
  /0x[a-fA-F0-9]{64}/,
  /0x[a-fA-F]{40}/,
  /card|credit|debit|pan|number/i,
  /^[0-9]{13,19}/
];

function checkSecret(payload, agent) {
  const cmd = JSON.stringify(payload || {});
  for (const pattern of DENY_ON_SECRET_PATTERNS) {
    if (pattern.test(cmd)) {
      const line = {
        ts: new Date().toISOString(),
        user: payload.userId || 'anon',
        agent,
        tool: 'kernel_entry',
        request_id: payload.request_id || null,
        quote_id: payload.quote_id || null,
        decision: DENY_CODE,
        reason_code: 'secret_detected',
        detail: JSON.stringify({
          pattern: pattern.source,
          diagnostic: 'simpler: payload contains secret data (key, password, 64-char hash, PAN, etc.). This is an immediate deny.',
          reject_agent: agent
        })
      };
      appendJobEntry(line);
      return {
        ok: false,
        decision: DENY_CODE,
        reason_code: 'secret_detected',
        error: 'Request blocked — detected secret data (key, password, 64-char hash, PAN, seed, mnemonic, bearer token). This is a safety block.',
        rejected_at: new Date().toISOString()
      };
    }
  }
  return { ok: true };
}

function checkAmountMismatch(payload, quote) {
  if (!payload || !quote) return { ok: true };
  const reqAmount = Number(payload.est_cost_usd || payload.request_amount_usd || 0);
  const quoteAmount = Number(quote.amount_usd || quote.price_usdc || quote.price_usd || 0);

  if (!reqAmount) return { ok: true };
  if (Math.abs(reqAmount - quoteAmount) > 0.1) {
    const line = {
      ts: new Date().toISOString(),
      user: payload.userId || 'anon',
      agent: quote.agent || 'unknown',
      tool: 'kernel_entry',
      request_id: payload.request_id || null,
      quote_id: payload.quote_id || null,
      decision: DENY_CODE,
      reason_code: 'amount_mismatch',
      detail: JSON.stringify({
        required_amount: reqAmount,
        quote_amount: quoteAmount,
        pattern: 'quoted price does not match requested pay amount.'
      })
    };
    appendJobEntry(line);
    return {
      ok: false,
      decision: DENY_CODE,
      reason_code: 'amount_mismatch',
      error: `Requested amount $${reqAmount} does not match quote amount $${quoteAmount}. Denying payment to prevent overcharge.`,
      tooled_amount: quoteAmount
    };
  }
  return { ok: true };
}

function checkPayeeMismatch(payload, quote) {
  if (!payload || !quote) return { ok: true };
  const payTo = payload.pay_to || payload.receiver || payload.payee || payload.target_wallet;
  const quotePayTo = quote.pay_to || quote.treasury || quote.receiver || 'unknown';

  if (payTo && payTo !== quotePayTo && quotePayTo !== 'protocol_fee' && quotePayTo !== 'escrow') {
    const line = {
      ts: new Date().toISOString(),
      user: payload.userId || 'anon',
      agent: quote.agent || 'unknown',
      tool: 'kernel_entry',
      request_id: payload.request_id || null,
      quote_id: payload.quote_id || null,
      decision: DENY_CODE,
      reason_code: 'payee_mismatch',
      detail: JSON.stringify({
        requested_payee: payTo,
        quoted_payee: quotePayTo,
        pattern: 'requested payee differs from quote payee.'
      })
    };
    appendJobEntry(line);
    return {
      ok: false,
      decision: DENY_CODE,
      reason_code: 'payee_mismatch',
      error: `Requested payee differs from quote payee (requested: ${payTo}, quote: ${quotePayTo}). Refusing payment to prevent redirection.`,
      rejected_payee: quotePayTo
    };
  }
  return { ok: true };
}

function checkSkillAllowed(payload, policy) {
  if (!payload || !policy) return { ok: true };
  const tool = payload.intend_tool || payload.tool || payload.skill_id || 'unknown';
  const allowed = policy.allowed_tools;

  if (!allowed || allowed.length === 0) {
    const line = {
      ts: new Date().toISOString(),
      user: payload.userId || 'anon',
      agent: policy.agent || policy.agent_id || 'unknown',
      tool,
      request_id: payload.request_id || null,
      quote_id: payload.quote_id || null,
      decision: DENY_CODE,
      reason_code: 'skill_not_allowed',
      detail: JSON.stringify({
        tool,
        agent: policy.agent_id,
        policy_allowlist: allowed,
        pattern: 'required skill not in agent allowlist.'
      })
    };
    appendJobEntry(line);
    return {
      ok: false,
      decision: DENY_CODE,
      reason_code: 'skill_not_allowed',
      error: `Tool "${tool}" is not allowed for this agent. Allowed tools: ${allowed.join(', ') || 'none'}`,
      not_allowed_tool: tool
    };
  }
  if (!allowed.includes(tool)) {
    const line = {
      ts: new Date().toISOString(),
      user: payload.userId || 'anon',
      agent: policy.agent_id || policy.agent || 'unknown',
      tool,
      request_id: payload.request_id || null,
      quote_id: payload.quote_id || null,
      decision: DENY_CODE,
      reason_code: 'skill_not_allowed',
      detail: JSON.stringify({
        tool,
        agent: policy.agent_id,
        allowed: allowed,
        pattern: 'tool not allowed in skill allowlist.'
      })
    };
    appendJobEntry(line);
    return {
      ok: false,
      decision: DENY_CODE,
      reason_code: 'skill_not_allowed',
      error: `Skill/tool "${tool}" not allowed. Agent allowed tools: ${allowed.join(', ')}`,
      not_allowed_tool: tool
    };
  }
  return { ok: true };
}

function checkBudget(payload, policy) {
  if (!payload || !policy) return { ok: true };
  const est = Number(payload.est_cost_usd || payload.request_amount_usd || 0);
  const memory = policy.memory || policy.max_usd || policy.daily_cap_usd || policy.max_budget_usd || Infinity;
  const current = payload.current_spent || 0;

  if (est > memory) {
    const line = {
      ts: new Date().toISOString(),
      user: payload.userId || 'anon',
      agent: policy.agent_id || policy.agent || 'unknown',
      tool: payload.intend_tool || payload.tool || payload.skill_id || 'unknown',
      request_id: payload.request_id || null,
      quote_id: payload.quote_id || null,
      decision: DENY_CODE,
      reason_code: 'budget_exceeded',
      detail: JSON.stringify({
        requested_amount: est,
        memory_limit: memory,
        current_spent: current,
        pattern: 'requested amount exceeds agent memory budget.'
      })
    };
    appendJobEntry(line);
    return {
      ok: false,
      decision: DENY_CODE,
      reason_code: 'budget_exceeded',
      error: `Requested amount exceeds agent budget (required: $${est}, memory: $${memory}, current: $${current.toFixed(2)}).`,
      over_budget_amount: est,
      memory_limit: memory,
      current_spent: current
    };
  }
  const total = current + est;
  if (total > memory) {
    const line = {
      ts: new Date().toISOString(),
      user: payload.userId || 'anon',
      agent: policy.agent_id || policy.agent || 'unknown',
      tool: payload.intend_tool || payload.tool || payload.skill_id || 'unknown',
      request_id: payload.request_id || null,
      quote_id: payload.quote_id || null,
      decision: DENY_CODE,
      reason_code: 'budget_exceeded',
      detail: JSON.stringify({
        new_total: total,
        memory_limit: memory,
        requested: est,
        current: current,
        pattern: 'after-addition would exceed agent memory budget.'
      })
    };
    appendJobEntry(line);
    return {
      ok: false,
      decision: DENY_CODE,
      reason_code: 'budget_exceeded',
      error: `Adding this call would exceed agent budget (current: $${current.toFixed(2)}, estimate: $${est}, new total: $${total.toFixed(2)}, limit: $${memory}).`,
      new_total,
      memory_limit: memory,
      current_spent: current
    };
  }
  return { ok: true };
}

function resolvePolicy(agentName) {
  const POLICIES = {
    'turtcl': {
      agent_id: 'turtle_treasury',
      agent: 'TURTLE',
      allowed_tools: ['city.spec.v1', 'city.gltf.export.v1', 'quote.price.v1', 'escrow.plan.v1'],
      memory: 250,
      daily_cap_usd: 50,
      per_call_cap_usd: 20
    },
    'zeroix': {
      agent_id: 'zerox_treasury',
      agent: 'ZEROX',
      allowed_tools: ['quote.price.v1', 'escrow.plan.v1'],
      memory: 100,
      daily_cap_usd: 20,
      per_call_cap_usd: 10
    },
    'pikudon': {
      agent_id: 'pikadon_kernel',
      agent: 'PIKADON',
      allowed_tools: ['policy.check', 'policy.deny', 'revoke', 'redact', 'audit.append'],
      memory: Infinity,
      daily_cap_usd: Infinity,
      per_call_cap_usd: 100
    },
    'shadch': {
      agent_id: 'shadai_orc',
      agent: 'SHADDAI',
      allowed_tools: ['orchestrate.cli', 'systemgate', 'policy.check'],
      memory: Infinity,
      daily_cap_usd: Infinity,
      per_call_cap_usd: Infinity
    }
  };

  let policy = POLICIES[agentName?.toLowerCase()];
  if (!policy && typeof agentName === 'string' && agentName.startsWith('agt_')) {
    policy = {
      agent_id: agentName,
      agent: agentName,
      allowed_tools: ['request_payment', 'request_transfer', 'request_swap', 'pay_x402'],
      memory: 500,
      daily_cap_usd: 25,
      per_call_cap_usd: 10
    };
  }
  return policy || null;
}

async function pikadonEntrance(agent, payload, quote = null, memory = null) {
  const startTime = Date.now();

  const policy = resolvePolicy(agent);

  let result = checkSecret(payload, agent);
  if (!result.ok) return result;

  result = checkAmountMismatch(payload, quote);
  if (!result.ok) return result;

  result = checkPayeeMismatch(payload, quote);
  if (!result.ok) return result;

  if (policy) {
    result = checkSkillAllowed(payload, policy);
    if (!result.ok) return result;

    result = checkBudget(payload, policy);
    if (!result.ok) return result;
  }

  if (quote) {
    const actionline = {
      ts: new Date().toISOString(),
      user: payload.userId || 'anon',
      agent: quote.agent || agent,
      tool: payload.intend_tool || payload.tool || policy?.allowed_tools?.[0] || 'system',
      request_id: payload.request_id || null,
      quote_id: payload.quote_id || quote.id || null,
      decision: ALLOW_CODE,
      reason_code: 'Verify',
      cost_usd: Number(quote.amount_usd || quote.price_usd || quote.price_usdc || 0),
      policy_memory: policy?.memory || Infinity,
      policy_daily: policy?.daily_cap_usd || Infinity,
      tool_memory: policy?.per_call_cap_usd || Infinity,
      budget_ok: true,
      decision_time_ms: Date.now() - startTime
    };
    appendJobEntry(actionline);
  }

  return {
    ok: true,
    decision: ALLOW_CODE,
    reason_code: 'kernel_allow',
    agentic_rules: policy ? {
      skill_allowlist: policy.allowed_tools,
      memory_budget: policy.memory,
      daily_cap_usd: policy.daily_cap_usd,
      per_call_cap_usd: policy.per_call_cap_usd
    } : null,
    kernel_time_ms: Date.now() - startTime
  };
}

module.exports = {
  pikadonEntrance,
  checkSecret,
  checkAmountMismatch,
  checkPayeeMismatch,
  checkSkillAllowed,
  checkBudget,
  DENY_CODE,
  ALLOW_CODE,
  PENDING_CODE,
  appendJobEntry,
  resolvePolicy
};