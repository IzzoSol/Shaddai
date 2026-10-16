'use strict';
// ONE streaming adapter for every OpenAI-compatible provider (xAI/Grok, Meta Muse, OpenRouter, Ollama /v1, vLLM...).
// Config is data (baseUrl, auth, format, aliases). Normalizes to: text_delta | tool_call | usage | done | error.
// Fragmented streamed tool-call arguments are accumulated per index/item and parsed once (manual 20.3).

function mapStatus(status) {
  if (status === 401 || status === 403) return { code: 'auth', retryable: false };
  if (status === 429) return { code: 'rate_limit', retryable: true };
  if (status === 408) return { code: 'timeout', retryable: true };
  if (status >= 500) return { code: 'provider', retryable: true };
  return { code: 'invalid', retryable: false };
}

async function* sseEvents(body, signal) {
  const dec = new TextDecoder();
  let buf = '';
  const reader = body.getReader ? body.getReader() : null;
  const chunks = reader ? (async function* () { for (;;) { const { done, value } = await reader.read(); if (done) return; yield value; } })() : body;
  for await (const chunk of chunks) {
    if (signal && signal.aborted) { try { reader && reader.cancel(); } catch (_) {} return; }
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue;                    // comments / keep-alives
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try { yield JSON.parse(data); } catch (_) { /* tolerate malformed line */ }
      }
    }
  }
}

function safeParse(s) { try { return { ok: true, value: s ? JSON.parse(s) : {} }; } catch (_) { return { ok: false, value: null }; } }

function toChatTools(tools) { return tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.jsonSchema } })); }
function toResponsesTools(tools) { return tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.jsonSchema })); }
function toResponsesInput(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') out.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content });
    else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      if (m.content) out.push({ role: 'assistant', content: m.content });
      for (const c of m.tool_calls) out.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments });
    } else out.push({ role: m.role, content: m.content });
  }
  return out;
}

function createOpenAICompat(cfg) {
  const f = cfg.fetchImpl || globalThis.fetch;
  const format = cfg.format === 'responses' ? 'responses' : 'chat';
  const model = alias => (cfg.aliases && cfg.aliases[alias]) || null;

  async function* complete(req, opts = {}) {
    const m = model(req.alias);
    if (!m) { yield { type: 'error', code: 'invalid', retryable: false, message: 'unknown model alias' }; return; }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), req.timeoutMs || 30000);
    if (opts.signal) opts.signal.addEventListener('abort', () => ac.abort(), { once: true });
    const headers = Object.assign({ 'content-type': 'application/json' }, cfg.extraHeaders || {});
    if (cfg.apiKey) headers.authorization = 'Bearer ' + cfg.apiKey;
    let url, body;
    if (format === 'responses') {
      url = cfg.baseUrl + '/responses';
      body = { model: m, input: toResponsesInput(req.messages), stream: true, max_output_tokens: req.maxOutputTokens };
      if (req.tools && req.tools.length) body.tools = toResponsesTools(req.tools);
    } else {
      url = cfg.baseUrl + '/chat/completions';
      body = { model: m, messages: req.messages, stream: true, stream_options: { include_usage: true }, max_tokens: req.maxOutputTokens };
      if (req.tools && req.tools.length) body.tools = toChatTools(req.tools);
    }
    if (req.temperature != null) body.temperature = req.temperature;
    let res;
    try {
      res = await f(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal, redirect: 'error' });
    } catch (e) {
      clearTimeout(timer);
      yield { type: 'error', code: ac.signal.aborted ? 'timeout' : 'provider', retryable: true, message: 'network error' };   // never echo the key or URL
      return;
    }
    if (!res.ok) { clearTimeout(timer); yield Object.assign({ type: 'error', message: 'http ' + res.status }, mapStatus(res.status)); return; }

    const partial = new Map();      // index|item_id -> { id, name, args }
    let finish = null, usage = null, sawTool = false;
    try {
      for await (const ev of sseEvents(res.body, ac.signal)) {
        if (ev.error) { yield { type: 'error', code: 'provider', retryable: false, message: 'provider error event' }; return; }
        if (format === 'chat') {
          const ch = ev.choices && ev.choices[0];
          if (ch && ch.delta) {
            if (ch.delta.content) yield { type: 'text_delta', text: ch.delta.content };
            for (const d of ch.delta.tool_calls || []) {
              const cur = partial.get(d.index) || { args: '' };
              if (d.id) cur.id = cur.id || d.id;
              if (d.function && d.function.name) cur.name = cur.name || d.function.name;
              if (d.function && d.function.arguments) cur.args += d.function.arguments;
              partial.set(d.index, cur); sawTool = true;
            }
          }
          if (ch && ch.finish_reason) finish = ch.finish_reason;
          if (ev.usage) usage = { inputTokens: ev.usage.prompt_tokens || 0, outputTokens: ev.usage.completion_tokens || 0 };
        } else {
          const t = ev.type;
          if (t === 'response.output_text.delta' && ev.delta) yield { type: 'text_delta', text: ev.delta };
          else if (t === 'response.output_item.added' && ev.item && ev.item.type === 'function_call') {
            partial.set(ev.item.id || ev.item.call_id, { id: ev.item.call_id || ev.item.id, name: ev.item.name, args: ev.item.arguments || '' }); sawTool = true;
          } else if (t === 'response.function_call_arguments.delta') {
            const cur = partial.get(ev.item_id); if (cur) cur.args += ev.delta || '';
          } else if (t === 'response.function_call_arguments.done') {
            const cur = partial.get(ev.item_id); if (cur && ev.arguments != null) cur.args = ev.arguments;
          } else if (t === 'response.completed' && ev.response) {
            finish = sawTool ? 'tool_calls' : 'stop';
            const u = ev.response.usage; if (u) usage = { inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 };
          } else if (t === 'response.failed' || t === 'error') {
            yield { type: 'error', code: 'provider', retryable: false, message: 'provider error event' }; return;
          }
        }
      }
    } catch (e) {
      clearTimeout(timer);
      yield { type: 'error', code: ac.signal.aborted ? 'timeout' : 'provider', retryable: true, message: 'stream error' };
      return;
    }
    clearTimeout(timer);
    if (usage) yield Object.assign({ type: 'usage' }, usage);
    if (partial.size && (finish === 'tool_calls' || finish === 'stop' || sawTool)) {
      for (const c of partial.values()) {
        const p = safeParse(c.args);
        yield { type: 'tool_call', id: c.id, name: c.name, args: p.value, rawArgs: c.args, argsValid: p.ok };
      }
      yield { type: 'done', reason: 'tool_calls' };
    } else {
      yield { type: 'done', reason: finish === 'length' ? 'length' : 'stop' };
    }
  }

  async function validateConfig() {          // harmless test call; never logs the key
    if (!cfg.apiKey) return { ok: false, code: 'no_key' };
    try {
      const r = await f(cfg.baseUrl + '/models', { headers: { authorization: 'Bearer ' + cfg.apiKey }, redirect: 'error' });
      return r.ok ? { ok: true } : Object.assign({ ok: false }, mapStatus(r.status));
    } catch (_) { return { ok: false, code: 'network' }; }
  }

  return { providerId: cfg.providerId, format, complete, validateConfig, aliases: cfg.aliases || {}, dataUse: cfg.dataUse || {} };
}
module.exports = { createOpenAICompat, sseEvents, mapStatus };
