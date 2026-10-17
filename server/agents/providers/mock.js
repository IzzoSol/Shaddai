'use strict';
// Scripted adapter used by tests and the demo agent. Each call to complete() consumes the next script step.
// step: { text?, toolCalls?: [{id,name,args}], usage?: {inputTokens,outputTokens} }
function createMock(script, opts = {}) {
  let i = 0;
  return {
    providerId: 'mock', format: 'chat', aliases: { fast: 'mock-fast' }, dataUse: { 'mock-fast': 'private-ok' },
    calls: [],
    async *complete(req, o = {}) {
      this.calls.push({ alias: req.alias, tools: (req.tools || []).map(t => t.name), n: req.messages.length });
      const step = script[Math.min(i++, script.length - 1)] || { text: '' };
      if (o.signal && o.signal.aborted) { yield { type: 'error', code: 'timeout', retryable: true }; return; }
      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
      if (step.text) yield { type: 'text_delta', text: step.text };
      if (step.usage) yield Object.assign({ type: 'usage' }, step.usage);
      for (const c of step.toolCalls || []) yield { type: 'tool_call', id: c.id, name: c.name, args: c.args, argsValid: c.args !== undefined };
      yield { type: 'done', reason: (step.toolCalls || []).length ? 'tool_calls' : 'stop' };
    },
    async validateConfig() { return { ok: true }; },
  };
}
module.exports = { createMock };
