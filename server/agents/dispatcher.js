'use strict';
// One dispatcher for every provider: kill switches -> grants -> schema -> rate limit -> approval -> audited handler.
// Models only *suggest*; this code decides. Results go back to the model as an UNTRUSTED, size-capped envelope.
const { validate } = require('./schema');

const MAX_RESULT_CHARS = 4000;
function wrapUntrusted(outcome) {
  let body = JSON.stringify(outcome.data === undefined ? { status: outcome.status, code: outcome.code } : outcome.data);
  if (body.length > MAX_RESULT_CHARS) body = body.slice(0, MAX_RESULT_CHARS) + '...[truncated]';
  return JSON.stringify({ trust: 'untrusted', tool: outcome.tool, status: outcome.status, code: outcome.code || null, data: body });
}

function makeDispatcher({ registry, killSwitch, approvals, audit, usage, now = () => Date.now() }) {
  const windows = new Map();
  function rateOk(ctx, tool) {
    const limit = (tool.rateLimit && tool.rateLimit.perAgentPerMin) || 30;
    const k = ctx.agentId + '|' + tool.name, t = now();
    const arr = (windows.get(k) || []).filter(x => t - x < 60000);
    if (arr.length >= limit) { windows.set(k, arr); return false; }
    arr.push(t); windows.set(k, arr); return true;
  }
  const deny = (ctx, name, code, extra) => {
    audit.write(Object.assign({ type: 'tool_denied', tool: name, agentId: ctx.agentId, userId: ctx.userId, requestId: ctx.requestId, code }, extra || {}));
    return { tool: name, status: 'denied', code };
  };

  return async function dispatch(call, ctx) {
    const name = call && call.name;
    const kill = killSwitch.blocked({ tool: name, agentId: ctx.agentId, provider: ctx.provider });
    if (kill) return deny(ctx, name, kill);
    const tool = registry.get(name);
    if (!tool || !ctx.grants || !ctx.grants.has(name)) return deny(ctx, name, 'unknown_or_ungranted');   // same answer for both
    const parsed = validate(tool.input, call.args);
    if (!parsed.ok) return deny(ctx, name, 'bad_args', { detail: parsed.error });
    if (!rateOk(ctx, tool)) return deny(ctx, name, 'rate_limited');

    if (tool.approval !== 'never') {
      const covered = typeof ctx.allowanceCovers === 'function' && tool.approval === 'required_unless_allowance'
        && ctx.allowanceCovers(tool, parsed.value);
      if (!covered) {
        if (!call.approvalId) {
          const rec = approvals.create({ agentId: ctx.agentId, userId: ctx.userId, toolName: name, args: parsed.value,
            preview: typeof tool.preview === 'function' ? tool.preview(parsed.value) : name + ' ' + JSON.stringify(parsed.value) });
          audit.write({ type: 'approval_created', approvalId: rec.id, tool: name, agentId: ctx.agentId, userId: ctx.userId, requestId: ctx.requestId });
          return { tool: name, status: 'pending_approval', approvalId: rec.id, preview: rec.preview, expiresAt: rec.expiresAt };
        }
        const used = approvals.consume(call.approvalId, { agentId: ctx.agentId, userId: ctx.userId, toolName: name, args: parsed.value });
        if (!used.ok) return deny(ctx, name, used.code, { approvalId: call.approvalId });
      }
    }

    // AURA saver: cache read-only results only (never anything past a write).
    const cacheable = tool.cacheable && (tool.permissionClass === 'READ_PUBLIC' || tool.permissionClass === 'READ_PRIVATE');
    const ck = cacheable && usage ? usage.cacheKey({ userId: tool.permissionClass === 'READ_PRIVATE' ? ctx.userId : 'public', tool: name, version: tool.version, args: parsed.value }) : null;
    if (ck) { const hit = usage.cacheGet(ck); if (hit) return { tool: name, status: 'ok', data: hit, cached: true }; }
    try {
      const data = await tool.handler(parsed.value, ctx);
      if (ck) usage.cacheSet(ck, data);
      if (tool.audit) audit.write({ type: 'tool_ok', tool: name, agentId: ctx.agentId, userId: ctx.userId, requestId: ctx.requestId });
      return { tool: name, status: 'ok', data };
    } catch (e) {
      audit.write({ type: 'tool_error', tool: name, agentId: ctx.agentId, userId: ctx.userId, requestId: ctx.requestId, message: String(e && e.message).slice(0, 200) });
      return { tool: name, status: 'error', code: 'handler_error' };
    }
  };
}
module.exports = { makeDispatcher, wrapUntrusted };
