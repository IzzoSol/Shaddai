'use strict';

/**
 * api-vault.js — BYOK (Bring-Your-Own-Key) API Vault for SHADDAI
 *
 * Users add their OWN third-party API keys, encrypted with their OWN password,
 * so that when SHADDAI tools run, they burn the USER's quota — not the platform's.
 *
 * Security model:
 *  - Each key is encrypted with AES-256-GCM.
 *  - The encryption key is derived from the user's password via scryptSync(password, salt, 32).
 *  - The password is NEVER stored — only { ciphertext, iv, authTag, salt } are persisted.
 *  - A wrong password causes GCM auth verification to throw on decrypt → we return null.
 *
 * Node built-ins ONLY (crypto, fs, path). No external dependencies.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'api-vault.json');

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32; // 256-bit key for AES-256
const IV_LEN = 12;  // 96-bit IV recommended for GCM
const SALT_LEN = 16;

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, '{}', 'utf8');
  }
}

function loadStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (_e) {
    return {};
  }
}

function saveStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function entryId(userId, provider) {
  return `${userId}:${provider}`;
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function deriveKey(password, salt) {
  // salt is a Buffer
  return crypto.scryptSync(String(password), salt, KEY_LEN);
}

function encrypt(password, plaintext) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  };
}

function decrypt(password, record) {
  // Throws if the password is wrong (GCM auth tag mismatch) or data is corrupt.
  const salt = Buffer.from(record.salt, 'base64');
  const iv = Buffer.from(record.iv, 'base64');
  const authTag = Buffer.from(record.authTag, 'base64');
  const ciphertext = Buffer.from(record.ciphertext, 'base64');
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // throws here on wrong password
  ]);
  return plaintext.toString('utf8');
}

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

/* CONNECTORS — something a member plugs their own account into.
   `unlocks` is the important field: it says in the member's words what lights
   up when they connect it, because "add your ElevenLabs key" means nothing
   while "your agents can speak" means something.
   `cost: you` means their key, their bill, their rates, and we take nothing.
   That one field is the whole pricing model, stated per row. */
const CATALOG = [
  { provider:'openai', label:'OpenAI', category:'Language', envVar:'OPENAI_API_KEY', signupUrl:'https://platform.openai.com/api-keys', free:false, cost:'you', unlocks:'Your agents think on GPT models instead of ours.' },
  { provider:'anthropic', label:'Anthropic', category:'Language', envVar:'ANTHROPIC_API_KEY', signupUrl:'https://console.anthropic.com/settings/keys', free:false, cost:'you', unlocks:'Claude drives your agents, and long documents stop being a problem.' },
  { provider:'xai', label:'xAI / Grok', category:'Language', envVar:'XAI_API_KEY', signupUrl:'https://console.x.ai', free:false, cost:'you', unlocks:'Grok answers as your agent, with live X context behind it.' },
  { provider:'groq', label:'Groq', category:'Language', envVar:'GROQ_API_KEY', signupUrl:'https://console.groq.com/keys', free:true, cost:'you', unlocks:'The fastest replies available. The free tier is generous.' },
  { provider:'gemini', label:'Google Gemini', category:'Language', envVar:'GEMINI_API_KEY', signupUrl:'https://aistudio.google.com/app/apikey', free:true, cost:'you', unlocks:'Gemini models, and a free tier that covers most people.' },
  { provider:'openrouter', label:'OpenRouter', category:'Language', envVar:'OPENROUTER_API_KEY', signupUrl:'https://openrouter.ai/keys', free:true, cost:'you', unlocks:'One key for every major model, with automatic fallback.' },
  { provider:'ollama', label:'Ollama', category:'Language', envVar:'OLLAMA_BASE_URL', signupUrl:'https://ollama.com/download', free:true, cost:'you', unlocks:'Runs on your own machine. Nothing leaves it, nothing costs anything.' },

  { provider:'fal', label:'Fal', category:'Making', envVar:'FAL_KEY', signupUrl:'https://fal.ai/dashboard/keys', free:false, cost:'you', unlocks:'Images, video, audio and 3D — the widest single connector here.' },
  { provider:'elevenlabs', label:'ElevenLabs', category:'Making', envVar:'ELEVENLABS_API_KEY', signupUrl:'https://elevenlabs.io/app/settings/api-keys', free:true, cost:'you', unlocks:'Your agents speak, in a voice you choose or clone.' },
  { provider:'meshy', label:'Meshy', category:'Making', envVar:'MESHY_API_KEY', signupUrl:'https://www.meshy.ai/api', free:true, cost:'you', unlocks:'Text to 3D models, ready to drop into the 3D world.' },
  { provider:'higgsfield', label:'Higgsfield', category:'Making', envVar:'HIGGSFIELD_API_KEY', signupUrl:'https://higgsfield.ai', free:false, cost:'you', unlocks:'Cinematic video clips from a prompt or a still.' },
  { provider:'replicate', label:'Replicate', category:'Making', envVar:'REPLICATE_API_TOKEN', signupUrl:'https://replicate.com/account/api-tokens', free:false, cost:'you', unlocks:'Fifty thousand community models, for the thing nothing else does.' },
  { provider:'suno', label:'Suno', category:'Making', envVar:'SUNO_API_KEY', signupUrl:'https://suno.com', free:false, cost:'you', unlocks:'Original music and songs from a description.' },

  { provider:'helius', label:'Helius', category:'Markets', envVar:'HELIUS_API_KEY', signupUrl:'https://dashboard.helius.dev', free:true, cost:'you', unlocks:'ZEROX reads Solana directly — wallets, holders, fresh mints.' },
  { provider:'birdeye', label:'Birdeye', category:'Markets', envVar:'BIRDEYE_API_KEY', signupUrl:'https://docs.birdeye.so', free:true, cost:'you', unlocks:'Deeper token data and liquidity than the free feeds carry.' },
  { provider:'coingecko', label:'CoinGecko', category:'Markets', envVar:'COINGECKO_API_KEY', signupUrl:'https://www.coingecko.com/en/api/pricing', free:true, cost:'you', unlocks:'Prices and charts without the public rate limit.' },

  { provider:'telegram', label:'Telegram', category:'Reach', envVar:'TELEGRAM_BOT_TOKEN', signupUrl:'https://core.telegram.org/bots#botfather', free:true, cost:'you', unlocks:'Your agent messages you, or runs a channel of its own.' },
  { provider:'discord', label:'Discord', category:'Reach', envVar:'DISCORD_BOT_TOKEN', signupUrl:'https://discord.com/developers/applications', free:true, cost:'you', unlocks:'Your agent lives in your server and answers there.' },
  { provider:'twitter', label:'X', category:'Reach', envVar:'TWITTER_BEARER_TOKEN', signupUrl:'https://developer.x.com/en/portal/dashboard', free:true, cost:'you', unlocks:'Post, read and reply as you — QUILL writes, you approve.' },
  { provider:'newsapi', label:'NewsAPI', category:'Reach', envVar:'NEWSAPI_KEY', signupUrl:'https://newsapi.org/register', free:true, cost:'you', unlocks:'Headlines your agents can actually read and cite.' },
  { provider:'serpapi', label:'SerpApi', category:'Reach', envVar:'SERPAPI_KEY', signupUrl:'https://serpapi.com/manage-api-key', free:true, cost:'you', unlocks:'Live web search, so answers reach past the library.' },

  { provider:'stripe', label:'Stripe', category:'Money', envVar:'STRIPE_SECRET_KEY', signupUrl:'https://dashboard.stripe.com/apikeys', free:true, cost:'you', unlocks:'Take payments for your own work, into your own account.' },
];


function catalog() {
  // Return a deep copy so callers can't mutate the source catalog.
  return CATALOG.map((p) => ({ ...p }));
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Encrypt and persist a user's API key for a provider.
 * @returns {{ok: true}}
 */
function setKey(userId, password, provider, key) {
  if (!userId || !password || !provider || !key) {
    throw new Error('userId, password, provider, and key are all required');
  }
  const store = loadStore();
  store[entryId(userId, provider)] = {
    userId: String(userId),
    provider: String(provider),
    ...encrypt(password, key),
    updatedAt: new Date().toISOString(),
  };
  saveStore(store);
  return { ok: true };
}

/**
 * Decrypt and return the plaintext key, or null if missing / wrong password.
 */
function getKey(userId, password, provider) {
  const store = loadStore();
  const record = store[entryId(userId, provider)];
  if (!record) return null;
  try {
    return decrypt(password, record);
  } catch (_e) {
    // Wrong password or corrupted data → never throw, just deny.
    return null;
  }
}

/**
 * List provider names a user has stored. NEVER returns key values.
 */
function listProviders(userId) {
  const store = loadStore();
  const prefix = `${userId}:`;
  return Object.keys(store)
    .filter((id) => id.startsWith(prefix))
    .map((id) => store[id].provider);
}

/**
 * Delete a stored key. Returns {ok:true, removed:boolean}.
 */
function removeKey(userId, provider) {
  const store = loadStore();
  const id = entryId(userId, provider);
  const existed = Object.prototype.hasOwnProperty.call(store, id);
  if (existed) {
    delete store[id];
    saveStore(store);
  }
  return { ok: true, removed: existed };
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM API BUNDLES — add your OWN API that exposes MULTIPLE connected
// services. Lives in the SAME store (namespace 'customApis') as the provider
// keys, reusing the same password-encrypted secret handling.
//
//   POST /api/vault/custom          { user,password,name,baseUrl,customApiKey?,
//                                       services:[{id,name,description,method,url,schema?,agents?,authHeader?}] }
//   GET  /api/vault/custom?user=    → list bundles (names only, no secrets)
//   DELETE /api/vault/custom?id=&user=  → remove a bundle
//   GET  /api/vault/custom/tools?user=  → the injected tool names (for agents)
//
// Each service is injected into the agent TOOLS registry as:
//   custom_<apiId>_<svcId>
// so council agents, Grok bots, and forged operatives can call it like any
// native tool via runAgentWithTools(opts.tools).
//
// PIKADON guard rails baked into registration:
//   • HTTPS-only (plaintext base URLs blocked except localhost dev).
//   • SSRF guard: private / loopback / link-local hosts blocked.
//   • Live-secret sniffing in non-secret meta is flagged.
//   • Endpoint reachability probed best-effort (offline-safe).
// ═══════════════════════════════════════════════════════════════════════════

const CUSTOM_NS = 'customApis';

function custom() { const s = loadStore(); if (!s[CUSTOM_NS]) s[CUSTOM_NS] = {}; return s[CUSTOM_NS]; }

const PRIVATE_HOST_RE = /(^localhost$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^0\.|^::1$|^fe80:|^fc|^fd)/i;
function _hostSafe(host) { return !!(host && !PRIVATE_HOST_RE.test(String(host).replace(/[\[\]]/g, ''))); }
function _scanUrl(url) {
  let u; try { u = new URL(String(url || '')); } catch (_) { return { ok: false, issues: ['invalid URL'] }; }
  const issues = [];
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') issues.push('non-HTTPS (plaintext credentials)');
  if (!_hostSafe(u.hostname)) issues.push('private/local network target blocked (SSRF guard)');
  return { ok: issues.length === 0, issues };
}
async function _probe(url, headers, method) {
  try {
    const u = new URL(String(url || '')); if (!_hostSafe(u.hostname)) return null;
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000);
    let r; try { r = await fetch(url, { method: method || 'GET', headers: headers || {}, signal: c.signal, redirect: 'manual' }); }
    finally { clearTimeout(t); }
    return { http: r.status };
  } catch (_) { return null; }
}
function _leakCheck(m, baseUrl) {
  const leak = [];
  const blob = JSON.stringify(m || {}) + ' ' + String(baseUrl || '');
  if (/sk-|key-|ey[A-Za-z0-9]{40,}|xox[bap]-|gh[pousr]_|AIza[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}/.test(blob)) {
    leak.push('possible live secret embedded in non-secret fields');
  }
  return leak;
}

/**
 * Register a user custom API bundling one or more services.
 * @returns {Promise<{ok, id, scan:{ok, issues, checkedAt}}>}
 */
async function registerCustom({ user, password, name, baseUrl, customApiKey, authHeader, services }) {
  user = String(user || '').trim(); if (!user) throw new Error('user required');
  name = String(name || '').trim(); if (!name) throw new Error('name required');
  if (!baseUrl) throw new Error('baseUrl required');
  const svcList = Array.isArray(services) ? services : [];
  if (!svcList.length) throw new Error('at least one service required');

  // Scan base + every endpoint (PIKADON).
  const issues = [];
  const baseScan = _scanUrl(baseUrl);
  const leaky = _leakCheck({ name, services: svcList, headers: authHeader }, baseUrl);
  if (!baseScan.ok) issues.push({ service: 'baseUrl', issues: baseScan.issues });
  if (leaky.length) issues.push({ meta: leaky });
  for (const s of svcList) {
    // Resolve relative service URLs against baseUrl before scanning.
    const target = (s.url && (s.url.startsWith('http') || s.url.startsWith('https:'))) ? s.url : String(baseUrl).replace(/\/+$/, '') + '/' + String(s.url || '').replace(/^\/+/, '');
    const r = _scanUrl(target);
    if (!r.ok) issues.push({ service: s.id || s.name || target, issues: r.issues });
  }

  const id = 'api_' + user.replace(/[^a-zA-Z0-9_]/g, '_') + '_' + crypto.randomBytes(3).toString('hex');
  const clean = svcList.map(s => ({
    id: String(s.id || '').trim() || ('svc' + Math.random().toString(36).slice(2, 6)),
    name: String(s.name || '').trim() || s.id,
    description: String(s.description || '').trim(),
    method: String(s.method || 'GET').toUpperCase(),
    url: String(s.url || '').trim(),
    schema: (s.schema && typeof s.schema === 'object') ? s.schema : {},
    agents: Array.isArray(s.agents) ? s.agents : [],
    authHeader: s.authHeader || authHeader || 'Authorization',
    timeoutMs: Number(s.timeoutMs) || 15000,
  }));

  // Secret handling: caller-supplied password → per-service key encrypted with it.
  const secrets = {};
  for (const svc of clean) {
    const raw = customApiKey || (typeof svc.customApiKey === 'string' ? svc.customApiKey : null);
    if (raw) secrets[svc.authHeader] = raw;
  }

  const store = loadStore();
  const ns = store[CUSTOM_NS] || (store[CUSTOM_NS] = {});
  ns[id] = {
    id, user, name, baseUrl,
    authHeader: authHeader || 'Authorization',
    services: clean,
    secrets: (password && Object.keys(secrets).length) ? encrypt(password, JSON.stringify(secrets)) : (Object.keys(secrets).length ? secrets : {}),
    scan: { ok: issues.length === 0, issues: issues.slice(0, 20), checkedAt: new Date().toISOString(), reachable: null },
    createdAt: new Date().toISOString(),
  };
  saveStore(store);
  // Best-effort reachability probe (non-blocking, offline-safe).
  try { const pr = await _probe(baseUrl, {}, 'GET'); if (pr) { ns[id].scan.reachable = pr.http; saveStore(store); } } catch (_) {}
  return { ok: true, id, scan: ns[id].scan };
}

function listCustom(user) {
  const out = [];
  for (const [id, a] of Object.entries(custom())) {
    if (user && a.user !== user) continue;
    out.push({
      id, name: a.name, baseUrl: a.baseUrl,
      services: (a.services || []).map(s => ({ id: s.id, name: s.name, method: s.method, description: s.description })),
      scan: a.scan,
      hasSecret: !!(a.secrets && Object.keys(a.secrets).length),
      createdAt: a.createdAt,
    });
  }
  return out;
}

function removeCustom(user, id) {
  const c = custom();
  const a = c[id];
  if (!a || (user && a.user !== user)) return { ok: true, removed: false };
  delete c[id];
  saveStore(loadStore());
  return { ok: true, removed: true };
}

// Decrypt the secrets of a bundle for live calls (wrong password → empty).
function customSecrets(id, password) {
  const a = custom()[id];
  if (!a || !a.secrets) return {};
  if (a.secrets.__enc || (a.secrets.ciphertext && a.secrets.salt)) {
    if (!password) return {};
    try { return JSON.parse(decrypt(password, a.secrets)); } catch (_) { return {}; }
  }
  return a.secrets; // plaintext dev mode
}

function customToolName(id, svcId) {
  return 'custom_' + String(id).replace(/[^a-zA-Z0-9_]/g, '_') + '_' + String(svcId).replace(/[^a-zA-Z0-9_]/g, '_');
}

// Resolve + call a custom service by tool name (what the agent runner invokes).
async function callCustomTool(name, args) {
  const prefix = name.startsWith('custom_') ? 'custom_' : null;
  if (!prefix) return { error: 'not a custom tool' };
  const body = name.slice(prefix.length); // api_<u>_<rnd>_svcX
  // find the bundle+service owning this tool name
  for (const [id, a] of Object.entries(custom())) {
    for (const s of (a.services || [])) {
      if (customToolName(id, s.id) !== name) continue;
      const secrets = customSecrets(id); // caller can re-pass password via args if needed
      try {
        return await executeCustomService(a, s, args || {}, secrets);
      } catch (e) { return { error: String((e && e.message) || e) }; }
    }
  }
  return { error: 'custom tool not found: ' + name };
}

async function executeCustomService(api, svc, args, secrets) {
  const base = String(api.baseUrl || '');
  const tpl = String(svc.url || '');
  let url = (tpl.startsWith('http') ? tpl : base.replace(/\/+$/, '') + '/' + String(tpl).replace(/^\/+/, ''));
  const bind = v => (typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (_, k) => (args[k] == null ? '' : String(args[k]))) : v);
  url = bind(url);

  const method = (svc.method || 'GET').toUpperCase();
  const headers = Object.assign({}, api.headers || {});
  const ah = svc.authHeader || api.authHeader || 'Authorization';
  if (secrets[ah]) headers[ah] = secrets[ah];
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';

  const query = {}, body = {};
  for (const [k, v] of Object.entries(args)) {
    if (v == null) continue;
    if (method === 'GET' || method === 'HEAD') query[k] = v; else body[k] = v;
  }
  if (Object.keys(query).length) url += (url.includes('?') ? '&' : '?') + new URLSearchParams(query).toString();

  const resp = await fetch(url, {
    method,
    headers,
    body: (method === 'GET' || method === 'HEAD') ? undefined : JSON.stringify(body),
    redirect: 'follow',
    signal: AbortSignal.timeout(Number(svc.timeoutMs || 15000)),
  });
  const text = await resp.text();
  let parsed = text; try { parsed = JSON.parse(text); } catch (_) {}
  return JSON.stringify({ status: resp.status, data: parsed }).slice(0, 3000);
}

// Build OpenAI-style tool schemas for all of a user's custom services (for agents).
function customToolsFor(user, password) {
  const out = [];
  for (const [id, a] of Object.entries(custom())) {
    if (user && a.user !== user) continue;
    for (const s of (a.services || [])) {
      const props = {};
      for (const [k, v] of Object.entries(s.schema || {})) {
        const raw = String(v); const m = raw.match(/^\s*(string|number|integer|int|boolean|bool|array|object)/i);
        let t = m ? m[1].toLowerCase() : 'string'; if (t === 'int') t = 'integer'; if (t === 'bool') t = 'boolean';
        const desc = raw.includes('—') ? raw.split('—').slice(1).join('—').trim() : raw;
        props[k] = { type: t, description: desc.slice(0, 140) };
      }
      out.push({
        type: 'function',
        function: {
          name: customToolName(id, s.id),
          description: String(s.description || ('Call the ' + s.name + ' service of ' + a.name)).slice(0, 240),
          parameters: { type: 'object', properties: props, required: [] },
        },
      });
    }
  }
  return out;
}

// Map custom tool names → native tool objects usable by runAgentWithTools.
function customToolRegistry() {
  const out = {};
  for (const [id, a] of Object.entries(custom())) {
    for (const s of (a.services || [])) {
      const name = customToolName(id, s.id);
      // scan guard: skip bundle entirely only if base URL itself is blocked.
      // Per-service failures are already in the bundle's issues array; don't
      // block the whole bundle for one service.
      if (a.scan && a.scan.ok === false && a.scan.issues && a.scan.issues.some(i => i.service === 'baseUrl')) continue;
      out[name] = {
        name,
        description: String(s.description || ('Call the ' + s.name + ' service of ' + a.name)).slice(0, 240),
        schema: (s.schema && typeof s.schema === 'object') ? s.schema : {},
        agents: (s.agents && s.agents.length) ? s.agents : ['SHADDAI', 'ORACLE', 'ZEROX', 'NEXUS'],
        execute: (args) => callCustomTool(name, args),
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Express router
// ---------------------------------------------------------------------------

function buildRouter() {
  let express;
  try {
    express = require('express');
  } catch (_e) {
    return null; // express not available in this context
  }

  /* auth-guard.softAuth verifies a bearer token and sets req.userId. Loaded
     defensively — if it is unavailable every caller is 'local', which is safe
     for a single-user local install and still never trusts the request body. */
  let softAuth = (req, _res, next) => { req.userId = req.userId || 'local'; next(); };
  try { softAuth = require('../auth-guard').softAuth || softAuth; } catch (_e) {}

  const router = express.Router();
  router.use(express.json());
  router.use(softAuth);

  /* ── WHO THE CALLER IS ───────────────────────────────────────────────────
     Every route below takes the vault owner from the VERIFIED SESSION, never
     from `user` in the body or query.

     Before this, `user` was attacker-supplied on every route. That made
     DELETE /key a one-line way for an unauthenticated stranger to wipe any
     user's stored third-party keys — no password, no token, just their id.
     It also let anyone enumerate another account's providers via /mine, and
     gave /key/reveal an unlimited online guessing oracle against a vault
     password.

     Asking people to hand us their ElevenLabs and OpenAI keys is only
     defensible if this file is boring and correct. */
  const owner = (req) => String((req && req.userId) || 'local');

  /* ── BRUTE-FORCE BRAKE ───────────────────────────────────────────────────
     The vault password is the ONLY thing standing between a stolen session and
     a user's real API keys, and scrypt is fast enough to guess online without
     this. Per owner+provider, in memory: a failed unlock costs an increasing
     delay, and a run of failures locks that pair briefly.

     In-memory is deliberate — this is a speed bump against remote guessing,
     not durable state, and a restart clearing it is acceptable. */
  const attempts = new Map();
  const MAX_FAILS = 5;
  const LOCK_MS = 60 * 1000;

  function throttle(key) {
    const rec = attempts.get(key);
    if (!rec) return null;
    if (rec.fails >= MAX_FAILS && Date.now() - rec.last < LOCK_MS) {
      return Math.ceil((LOCK_MS - (Date.now() - rec.last)) / 1000);
    }
    return null;
  }
  function noteFail(key) {
    const rec = attempts.get(key) || { fails: 0, last: 0 };
    rec.fails += 1; rec.last = Date.now();
    attempts.set(key, rec);
  }
  function noteOk(key) { attempts.delete(key); }

  // GET /catalog — public provider catalog (no secrets)
  router.get('/catalog', (req, res) => {
    res.json({ ok: true, providers: catalog() });
  });

  // GET /mine — providers THIS caller has stored (names only, never values)
  router.get('/mine', (req, res) => {
    res.json({ ok: true, providers: listProviders(owner(req)) });
  });

  // POST /key {password, provider, key} — store a key for the caller
  router.post('/key', (req, res) => {
    const { password, provider, key } = req.body || {};
    if (!password || !provider || !key) {
      return res.status(400).json({ ok: false, error: 'password, provider, key required' });
    }
    try {
      setKey(owner(req), password, provider, key);
      // PIKADON (A4): a stored vault key is dead weight unless it reaches the
      // running process. Mirror /api/keys — resolve the catalog envVar and push
      // the key into process.env so real integrations (news, Grok, HF, markets)
      // light up. The value is never logged; only the var name is touched.
      try {
        const row = (catalog() || []).find(c => c.provider === provider);
        if (row && row.envVar && key) {
          process.env[row.envVar] = key;
          if (typeof logAuditEvent === 'function') {
            logAuditEvent('VAULT_KEY_LINKED', { provider, envVar: row.envVar, owner: owner(req) });
          }
        }
      } catch (e2) { /* never fail a save over env wiring */ }
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // POST /key/reveal {password, provider} — decrypt and return the caller's key
  router.post('/key/reveal', (req, res) => {
    const { password, provider } = req.body || {};
    if (!password || !provider) {
      return res.status(400).json({ ok: false, error: 'password, provider required' });
    }
    const uid = owner(req);
    const gate = `${uid}:${provider}`;

    const wait = throttle(gate);
    if (wait) {
      return res.status(429).json({ ok: false, error: `too many attempts — try again in ${wait}s` });
    }

    const key = getKey(uid, password, provider);
    if (key === null) {
      noteFail(gate);
      // Same response whether the key is absent or the password is wrong:
      // distinguishing them tells an attacker which accounts hold what.
      return res.status(401).json({ ok: false, error: 'wrong password / not found' });
    }
    noteOk(gate);
    res.json({ ok: true, key });
  });

  // DELETE /key {password, provider} — remove one of the caller's keys.
  // The password is REQUIRED even though decryption is not needed: deletion is
  // destructive and irreversible, and a hijacked session alone should not be
  // enough to destroy the keys a user pasted in.
  router.delete('/key', (req, res) => {
    const body = req.body || {};
    const provider = body.provider || req.query.provider;
    const password = body.password;
    if (!provider || !password) {
      return res.status(400).json({ ok: false, error: 'provider and password required' });
    }
    const uid = owner(req);
    const gate = `${uid}:${provider}`;

    const wait = throttle(gate);
    if (wait) return res.status(429).json({ ok: false, error: `too many attempts — try again in ${wait}s` });

    // Proves the caller knows the vault password before anything is destroyed.
    if (getKey(uid, password, provider) === null) {
      noteFail(gate);
      return res.status(401).json({ ok: false, error: 'wrong password / not found' });
    }
    noteOk(gate);
    res.json(removeKey(uid, provider));
  });

  // ── CUSTOM API BUNDLES ────────────────────────────────────────────
  // POST /custom { user,password?,name,baseUrl,customApiKey?,authHeader?,services:[...] }
  router.post('/custom', async (req, res) => {
    const { user, password, name, baseUrl, customApiKey, authHeader, services } = req.body || {};
    try {
      const out = await registerCustom({ user, password, name, baseUrl, customApiKey, authHeader, services });
      res.json(out);
    } catch (e) {
      res.status(400).json({ ok: false, error: (e && e.message) || String(e) });
    }
  });

  // GET /custom?user= → list bundles (names only, no secrets)
  router.get('/custom', (req, res) => {
    const user = req.query.user;
    res.json({ ok: true, bundles: listCustom(user) });
  });

  // GET /custom/tools?user=&password= → OpenAI-style tool schemas for forwarding to agents
  router.get('/custom/tools', (req, res) => {
    const user = req.query.user; const password = req.query.password;
    res.json({ ok: true, tools: customToolsFor(user, password) });
  });

  // DELETE /custom?id=&user= → remove a bundle
  router.delete('/custom', (req, res) => {
    const id = (req.body && req.body.id) || req.query.id;
    const user = (req.body && req.body.user) || req.query.user;
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    res.json(removeCustom(user, id));
  });

  return router;
}

module.exports = {
  catalog,
  setKey,
  getKey,
  listProviders,
  removeKey,
  registerCustom,
  listCustom,
  removeCustom,
  customSecrets,
  customToolName,
  customToolsFor,
  customToolRegistry,
  callCustomTool,
  router: buildRouter(),
};
