// backend/lib/free-router.js  (PATCH FILE — copy into shaddai-repo, do not edit in place here)
// ─────────────────────────────────────────────────────────────────────────────
// FREE-FIRST LLM ROUTER
//
// One router for every lane Shaddai can talk through:
//   free   — providers with a REAL free tier (Groq, Gemini, OpenRouter :free,
//            Cerebras, Mistral, GitHub Models, Cloudflare, HF, NVIDIA, …)
//   local  — Ollama / LM Studio on the owner's machine ($0, no key)
//   grok   — a connected Grok bot (shaddai-agent-import v1) treated as just
//            another model lane
//   paid   — paid models on platform keys (DeepSeek, xAI, Claude, …)
//   byok   — the user's own key: always 0 credits (see charging.js)
//
// Design rules (learned the hard way):
//   1. KEYS COME FROM ENV ONLY. Never from a JSON file in the repo, never
//      logged, never returned. One .env, one var per provider.
//   2. A DEAD MODEL MUST NEVER BRICK CHAT. The old default
//      (llama-3.1-8b-instant, decommissioned by Groq) 404'd every request
//      and chat silently returned nothing. So: at startup we ask every
//      configured provider for its live /models list and DROP any model
//      that isn't really there (logged, once). At call time, a 404/429/5xx
//      moves to the next lane instead of failing the user.
//   3. NEVER THROWS to the caller for a provider problem. It returns
//      { ok:false, error } only when EVERY lane is exhausted.
//
// Config: ../data/providers.json (the catalog built by shaddai-free-keys).
// Pricing/charging lives in ./charging.js — this file only moves bytes and
// reports measured usage; charging.js turns usage into credits.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 30000;

// ── catalog ──────────────────────────────────────────────────────────────────
function loadCatalog(catalogPath) {
  const p = catalogPath || path.join(__dirname, '..', 'data', 'providers.json');
  const raw = fs.readFileSync(p, 'utf8');
  const cat = JSON.parse(raw);
  if (!cat || !Array.isArray(cat.providers)) throw new Error('providers.json: missing providers[]');
  return cat;
}

// ── router ───────────────────────────────────────────────────────────────────
class FreeRouter {
  /**
   * @param {object} opts
   * @param {object} opts.catalog   parsed providers.json (default: loaded from disk)
   * @param {object} opts.env       env source (default process.env) — keys ONLY from here
   * @param {function} opts.fetchImpl  injectable fetch (tests)
   * @param {function} opts.log     logger (default console)
   */
  constructor(opts = {}) {
    this.catalog = opts.catalog || loadCatalog(opts.catalogPath);
    this.env = opts.env || process.env;
    this.fetch = opts.fetchImpl || globalThis.fetch;
    this.log = opts.log || console;
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    // providerId -> { key|null, liveModels:Set|null, validated:bool }
    this.state = new Map();
    // modelId ('provider/model') -> rejection reason, so we don't retry a
    // model the provider already told us doesn't exist (404 model_not_found).
    this.deadModels = new Map();
    this._buildState();
  }

  /** Expand {ENV_VAR} placeholders in a URL from env (e.g. Cloudflare's {CLOUDFLARE_ACCOUNT_ID}). */
  _expandUrl(url) {
    return String(url || '').replace(/\{([A-Z0-9_]+)\}/g, (m, name) => this.env[name] || m);
  }

  _buildState() {
    for (const prov of this.catalog.providers) {
      const key = prov.envVar ? (this.env[prov.envVar] || (prov.envVarAlt ? this.env[prov.envVarAlt] : null) || null) : null;
      // Local lanes need no key; "configured" = always try, fails fast.
      const configured = prov.local ? true : !!key;
      this.state.set(prov.id, { provider: prov, key, configured, liveModels: null, validated: false });
    }
  }

  /** Providers that have a key (or are local) — the only ones we will call. */
  configuredProviders() {
    return [...this.state.values()].filter(s => s.configured).map(s => s.provider);
  }

  /** All catalog models for a lane, flattened, in catalog (preference) order. */
  laneModels(lane) {
    const out = [];
    for (const prov of this.catalog.providers) {
      const st = this.state.get(prov.id);
      if (!st || !st.configured) continue;
      for (const m of prov.models || []) {
        if (m.lane !== lane) continue;
        out.push({ provider: prov, model: m });
      }
    }
    return out;
  }

  // ── startup validation ─────────────────────────────────────────────────────
  /**
   * Ask every configured provider for its live model list and prune the
   * catalog to reality. Dead models are removed + logged ONCE. A provider
   * whose /models endpoint can't be reached keeps its catalog models but is
   * flagged unvalidated (call-time fallback still protects us).
   * @returns {Promise<{pruned: Array<{ref, reason}>, providers: object}>}
   */
  async validateModels() {
    const pruned = [];
    const summary = {};
    for (const st of this.state.values()) {
      if (!st.configured) { summary[st.provider.id] = 'no-key'; continue; }
      const prov = st.provider;
      try {
        const live = await this._fetchModelList(prov, st.key);
        st.liveModels = new Set(live);
        st.validated = true;
        for (const m of prov.models || []) {
          if (!live.includes(m.id)) {
            const ref = `${prov.id}/${m.id}`;
            this.deadModels.set(ref, 'not in provider /models list at startup');
            pruned.push({ ref, reason: 'not listed by provider' });
            this.log.warn(`[free-router] pruning dead model ${ref} (not in ${prov.id} /models)`);
          }
        }
        summary[prov.id] = `ok (${live.length} models live)`;
      } catch (e) {
        st.validated = false;
        summary[prov.id] = `unvalidated (${e.message})`;
        this.log.warn(`[free-router] could not validate ${prov.id}: ${e.message} — keeping catalog, call-time fallback applies`);
      }
    }
    return { pruned, providers: summary };
  }

  async _fetchModelList(prov, key) {
    const url = this._expandUrl(prov.modelsUrl || `${prov.baseUrl}/models`);
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (prov.extraHeaders) Object.assign(headers, this._resolveHeaders(prov.extraHeaders));
    const res = await this.fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // OpenAI shape: {data:[{id}]} · Ollama /api/tags shape: {models:[{name}]} · bare array
    const list = Array.isArray(data && data.data) ? data.data
      : Array.isArray(data && data.models) ? data.models
      : (Array.isArray(data) ? data : []);
    return list.map(m => (typeof m === 'string' ? m : (m.id || m.name))).filter(Boolean);
  }

  _resolveHeaders(h) {
    // Allow "$ENV_VAR" placeholders in catalog extraHeaders (e.g. GitHub token reuse).
    const out = {};
    for (const [k, v] of Object.entries(h || {})) {
      out[k] = (typeof v === 'string' && v.startsWith('$')) ? (this.env[v.slice(1)] || '') : v;
    }
    return out;
  }

  // ── the call ───────────────────────────────────────────────────────────────
  /**
   * Chat through the lanes in order. Never throws for provider failures.
   * @param {object} args
   * @param {Array}  args.messages
   * @param {string[]} [args.lanes]  lane order (default ['free','local','grok','paid'])
   * @param {string} [args.modelRef] pin an exact 'provider/model' (picker choice)
   * @param {number} [args.maxTokens]
   * @param {object} [args.byok] { provider, key, model } — user's own key lane, tried FIRST
   * @returns {Promise<{ok, content, provider, model, lane, byok, usage:{inputTokens,outputTokens}, attempts}>}
   */
  async chat(args = {}) {
    const messages = args.messages || [];
    const attempts = [];
    const candidates = [];

    if (args.byok && args.byok.provider && args.byok.key && args.byok.model) {
      const prov = this._providerById(args.byok.provider);
      if (prov) candidates.push({ provider: prov, model: { id: args.byok.model, lane: 'byok' }, keyOverride: args.byok.key, byok: true });
    }
    if (args.modelRef) {
      const c = this._resolveRef(args.modelRef);
      if (c) candidates.push(c);
    }
    const lanes = args.lanes || ['free', 'local', 'grok', 'paid'];
    for (const lane of lanes) candidates.push(...this.laneModels(lane));

    const seen = new Set();
    for (const cand of candidates) {
      const ref = `${cand.provider.id}/${cand.model.id}`;
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (this.deadModels.has(ref) && !cand.byok) { attempts.push({ ref, skipped: this.deadModels.get(ref) }); continue; }
      const st = this.state.get(cand.provider.id);
      const key = cand.keyOverride || (st && st.key) || null;
      if (!cand.provider.local && !key) { attempts.push({ ref, skipped: 'no key' }); continue; }
      try {
        const r = await this._callProvider(cand.provider, cand.model, key, messages, args);
        return { ok: true, content: r.content, provider: cand.provider.id, model: cand.model.id, lane: cand.model.lane, byok: !!cand.byok, usage: r.usage, attempts };
      } catch (e) {
        attempts.push({ ref, error: e.message, status: e.status || null });
        // A model the provider says doesn't exist is dead permanently (this run).
        if (e.status === 404) {
          this.deadModels.set(ref, '404 from provider at call time');
          this.log.warn(`[free-router] model ${ref} returned 404 — marked dead, falling back`);
        }
        // 429 / 5xx / network: fall through to the next lane. That's the point.
      }
    }
    return { ok: false, content: '', error: 'all lanes exhausted', attempts };
  }

  _providerById(id) { return this.catalog.providers.find(p => p.id === id) || null; }

  _resolveRef(ref) {
    const i = String(ref).indexOf('/');
    if (i < 1) return null;
    const prov = this._providerById(String(ref).slice(0, i));
    if (!prov) return null;
    const modelId = String(ref).slice(i + 1);
    const model = (prov.models || []).find(m => m.id === modelId);
    if (!model) return null;
    return { provider: prov, model };
  }

  async _callProvider(prov, model, key, messages, args) {
    if (prov.api === 'anthropic') return this._callAnthropic(prov, model, key, messages, args);
    if (prov.api === 'ollama-native') return this._callOllamaNative(prov, model, messages, args);
    return this._callOpenAICompatible(prov, model, key, messages, args);
  }

  async _callOpenAICompatible(prov, model, key, messages, args) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (prov.extraHeaders) Object.assign(headers, this._resolveHeaders(prov.extraHeaders));
    const res = await this.fetch(`${this._expandUrl(prov.baseUrl)}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model: model.id, messages, max_tokens: args.maxTokens || 1024, ...(args.temperature != null ? { temperature: args.temperature } : {}) }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) { const e = new Error(`HTTP ${res.status} from ${prov.id}`); e.status = res.status; throw e; }
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message ? (data.choices[0].message.content || '') : '';
    const u = (data && data.usage) || {};
    return { content, usage: { inputTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0 } };
  }

  async _callAnthropic(prov, model, key, messages, args) {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const rest = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const res = await this.fetch(`${this._expandUrl(prov.baseUrl)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model.id, max_tokens: args.maxTokens || 1024, ...(system ? { system } : {}), messages: rest }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) { const e = new Error(`HTTP ${res.status} from ${prov.id}`); e.status = res.status; throw e; }
    const data = await res.json();
    const content = Array.isArray(data && data.content) ? data.content.map(b => b.text || '').join('') : '';
    const u = (data && data.usage) || {};
    return { content, usage: { inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 } };
  }

  async _callOllamaNative(prov, model, messages, args) {
    const res = await this.fetch(`${this._expandUrl(prov.baseUrl)}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.id, messages, stream: false, options: { num_predict: args.maxTokens || 1024 } }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) { const e = new Error(`HTTP ${res.status} from ${prov.id}`); e.status = res.status; throw e; }
    const data = await res.json();
    return {
      content: (data && data.message && data.message.content) || '',
      usage: { inputTokens: (data && data.prompt_eval_count) || 0, outputTokens: (data && data.eval_count) || 0 },
    };
  }

  /** Status for the dashboard: which providers are live, which models pruned. */
  status() {
    const providers = {};
    for (const st of this.state.values()) {
      providers[st.provider.id] = {
        configured: st.configured,
        validated: st.validated,
        liveModelCount: st.liveModels ? st.liveModels.size : null,
      };
    }
    return { providers, deadModels: [...this.deadModels.entries()].map(([ref, reason]) => ({ ref, reason })) };
  }
}

module.exports = { FreeRouter, loadCatalog };
