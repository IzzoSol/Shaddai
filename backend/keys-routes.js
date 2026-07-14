/* ══════════════════════════════════════════════════════════════════
   keys-routes.js — lightweight BYOK panel backend for the dashboard's
   "🔑 Connect Your APIs" card (public/index.html → renderApiKeysPanel).

   The panel calls GET /api/keys/catalog and POST /api/keys/set {env,value}.
   Those routes never existed → the panel was stuck / errored. This wires
   them to a simple persistent store: a pasted key is applied to
   process.env[ENV] at runtime (so every tool/resolver that reads that env
   picks it up) and persisted to backend/data/user-keys.json (gitignored
   data dir) so it survives a restart.

   Provider list is REUSED from lib/api-vault's CATALOG so there's a single
   source of truth (adding a provider there — e.g. Ollama — shows up here).

   NOTE (PIKADON): keys are stored plaintext in the local data dir for
   dev/self-host convenience, matching the app's other data/*.json stores.
   For multi-tenant prod, back this with the password-encrypted /api/vault
   instead. Never commit user-keys.json.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// At-rest encryption for the key store. Uses KEY_STORE_SECRET (or JWT_SECRET) → AES-256-GCM.
// If no secret is set (local dev), falls back to plaintext so nothing breaks.
function _secret() { return process.env.KEY_STORE_SECRET || process.env.JWT_SECRET || ''; }
function _encrypt(plain) {
  const s = _secret(); if (!s) return null;
  const key = crypto.createHash('sha256').update(s).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(plain), 'utf8'), c.final()]);
  return { __enc: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: enc.toString('base64') };
}
function _decrypt(obj) {
  const s = _secret(); if (!s) return {};
  try {
    const key = crypto.createHash('sha256').update(s).digest();
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'base64'));
    d.setAuthTag(Buffer.from(obj.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(obj.data, 'base64')), d.final()]).toString('utf8'));
  } catch (e) { return {}; }
}

const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'user-keys.json');

let vaultCatalog = [];
try { vaultCatalog = require('./lib/api-vault').catalog() || []; } catch (_e) { vaultCatalog = []; }

// ---- store helpers ----------------------------------------------------
function readStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (raw && raw.__enc) return _decrypt(raw) || {};   // encrypted → decrypt
    return raw || {};                                    // legacy plaintext
  } catch (_e) { return {}; }
}
function writeStore(obj) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const enc = _encrypt(obj);            // encrypt if a secret is configured
    const out = enc ? enc : obj;          // else plaintext (dev only)
    const tmp = STORE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2), { mode: 0o600 });  // owner-only perms
    fs.renameSync(tmp, STORE_PATH);
  } catch (e) { /* best-effort */ }
}

// Apply any persisted keys to process.env on boot so tools see them.
function applyStoredKeysToEnv() {
  const store = readStore();
  const valid = new Set(vaultCatalog.map((p) => p.envVar));
  Object.keys(store).forEach((env) => {
    if (valid.has(env) && store[env] && !process.env[env]) process.env[env] = store[env];
  });
}

// Friendly one-liner for the panel.
function helpFor(p) {
  if (/_BASE_URL$/.test(p.envVar) || p.provider === 'ollama') {
    return 'Paste your server URL, e.g. http://localhost:11434 (no key needed — runs local models)';
  }
  return (p.free ? 'Free tier available. ' : '') + 'Get a key: ' + (p.signupUrl || '');
}

function catalogForPanel() {
  const store = readStore();
  return vaultCatalog.map((p) => ({
    env: p.envVar,
    label: p.label,
    category: p.category,
    help: helpFor(p),
    free: !!p.free,
    connected: !!(process.env[p.envVar] || store[p.envVar]),
  }));
}

// ---- router -----------------------------------------------------------
function buildRouter() {
  let express;
  try { express = require('express'); } catch (_e) { return null; }
  const router = express.Router();
  router.use(express.json());

  router.get('/catalog', (req, res) => {
    res.json({ ok: true, providers: catalogForPanel() });
  });

  router.post('/set', (req, res) => {
    const { env, value } = req.body || {};
    if (!env) return res.status(400).json({ ok: false, error: 'env required' });
    const known = vaultCatalog.some((p) => p.envVar === env);
    if (!known) return res.status(400).json({ ok: false, error: 'unknown provider env' });
    const store = readStore();
    const val = String(value == null ? '' : value).trim();
    if (!val) { delete store[env]; delete process.env[env]; }
    else { store[env] = val; process.env[env] = val; }
    writeStore(store);
    res.json({ ok: true, env, connected: !!val });
  });

  return router;
}

module.exports = { router: buildRouter(), applyStoredKeysToEnv, catalogForPanel };
